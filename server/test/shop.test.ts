import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// Окрема тимчасова база й каталог завантажень — тести не чіпають робочі дані
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';

const { handle, cancelUnpaidOrders } = await import('../src/index.ts');
const { migrate, run, get, all } = await import('../src/db.ts');
const { createAdmin } = await import('../src/services/auth.ts');
const { config } = await import('../src/config.ts');
const { liqpaySign } = await import('../src/services/payment.ts');
const { rateConfig, resetRateLimits } = await import('../src/lib/http.ts');
rateConfig.enabled = false; // ліміти вмикаємо лише в окремому тесті

let base = '';
let server: http.Server;
let variantA = 0; // залишок 50, ціна 1000, стара ціна 1200
let variantB = 0; // залишок 1
let variantGone = 0; // залишок 0
let productId = 0;

const json = { 'Content-Type': 'application/json' };
async function api(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? json : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const stock = (id: number) => get<{ stock: number }>('SELECT stock FROM variants WHERE id = ?', id)!.stock;

const checkout = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `key-${Math.random().toString(36).slice(2)}-${Date.now()}-abcdef`,
  firstName: 'Ірина', lastName: 'Коваленко', phone: '+380501234567', email: 'ira@example.com',
  deliveryMethod: 'np-branch', city: 'Київ', address: 'Відділення №5', comment: '',
  paymentMethod: 'cod', items: [{ variantId: variantA, qty: 1 }], ...over,
});

before(async () => {
  migrate(false);
  run(`INSERT INTO categories (slug, name) VALUES ('cat', 'Категорія')`);
  const p = run(`INSERT INTO products (slug, name, category_id, price, old_price) VALUES ('tovar', 'Товар', 1, 1000, 1200)`);
  productId = Number(p.lastInsertRowid);
  run(`INSERT INTO product_images (product_id, url) VALUES (?, '/uploads/0000000000000000')`, productId);
  variantA = Number(run(`INSERT INTO variants (product_id, size, color, sku, stock) VALUES (?, 'M', 'Чорний', 'T-M', 50)`, productId).lastInsertRowid);
  variantB = Number(run(`INSERT INTO variants (product_id, size, color, sku, stock) VALUES (?, 'L', 'Чорний', 'T-L', 1)`, productId).lastInsertRowid);
  variantGone = Number(run(`INSERT INTO variants (product_id, size, color, sku, stock) VALUES (?, 'S', 'Чорний', 'T-S', 0)`, productId).lastInsertRowid);
  createAdmin('owner@example.com', 'very-secret-pass-1');
  server = http.createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('каталог', () => {
  it('фільтрує за розміром, кольором, ціною та пошуком без урахування регістру', async () => {
    assert.equal((await api('GET', '/api/products?size=M')).data.total, 1);
    assert.equal((await api('GET', '/api/products?size=XL')).data.total, 0);
    assert.equal((await api('GET', '/api/products?minPrice=1001')).data.total, 0);
    assert.equal((await api('GET', `/api/products?q=${encodeURIComponent('ТОВАР')}`)).data.total, 1);
    assert.equal((await api('GET', '/api/products?category=sale')).data.total, 1);
  });
  it('повертає 404 для неіснуючого товару', async () => {
    assert.equal((await api('GET', '/api/products/ne-isnuye')).status, 404);
  });
});

describe('кошик і ціни', () => {
  it('ігнорує ціни, надіслані клієнтом, і рахує знижку з бази', async () => {
    const r = await api('POST', '/api/cart/price', { items: [{ variantId: variantA, qty: 2, price: 1, unitPrice: 1 }] });
    assert.equal(r.status, 200);
    assert.equal(r.data.subtotal, 2000);
    assert.equal(r.data.discount, 400);
    assert.equal(r.data.ok, true);
  });
  it('позначає перевищення залишку та відсутність у наявності', async () => {
    const r = await api('POST', '/api/cart/price', { items: [{ variantId: variantB, qty: 3 }, { variantId: variantGone, qty: 1 }] });
    assert.equal(r.data.ok, false);
    assert.match(r.data.lines[0].problem, /Доступно лише 1/);
    assert.match(r.data.lines[1].problem, /Немає в наявності/);
  });
  it('об’єднує однакові варіанти', async () => {
    const r = await api('POST', '/api/cart/price', { items: [{ variantId: variantA, qty: 1 }, { variantId: variantA, qty: 2 }] });
    assert.equal(r.data.lines.length, 1);
    assert.equal(r.data.lines[0].qty, 3);
  });
});

describe('замовлення', () => {
  it('створює замовлення на сервері, списує залишок і повертає номер', async () => {
    const before = stock(variantA);
    const r = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantA, qty: 2 }] }));
    assert.equal(r.status, 201);
    assert.match(r.data.number, /^\d{6}-\d{5}$/);
    assert.equal(r.data.order.total, 2000);
    assert.equal(r.data.order.status, 'new');
    assert.equal(r.data.payment, null);
    assert.equal(stock(variantA), before - 2);
    // посилання на замовлення відкривається лише з токеном
    assert.equal((await api('GET', `/api/orders/${r.data.number}`)).status, 404);
    assert.equal((await api('GET', `/api/orders/${r.data.number}?t=wrong`)).status, 404);
    assert.equal((await api('GET', `/api/orders/${r.data.number}?t=${r.data.token}`)).status, 200);
  });

  it('повторна відправка з тим самим ключем не створює дубль і не списує залишок вдруге', async () => {
    const body = checkout({ items: [{ variantId: variantA, qty: 1 }] });
    const s0 = stock(variantA);
    const a = await api('POST', '/api/orders', body);
    const b = await api('POST', '/api/orders', body);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.data.replay, true);
    assert.equal(a.data.number, b.data.number);
    assert.equal(stock(variantA), s0 - 1);
  });

  it('не дозволяє замовити більше залишку; залишок і замовлення не змінюються', async () => {
    const ordersBefore = all('SELECT id FROM orders').length;
    const r = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantB, qty: 2 }] }));
    assert.equal(r.status, 409);
    assert.ok(r.data.unavailable.length >= 1);
    assert.equal(stock(variantB), 1);
    assert.equal(all('SELECT id FROM orders').length, ordersBefore);
  });

  it('останній товар дістається лише одному покупцеві', async () => {
    const a = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantB, qty: 1 }] }));
    const b = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantB, qty: 1 }] }));
    assert.equal(a.status, 201);
    assert.equal(b.status, 409);
    assert.equal(stock(variantB), 0);
  });

  it('відхиляє некоректні дані з описом помилок по полях', async () => {
    const r = await api('POST', '/api/orders', checkout({ phone: '12', firstName: '' }));
    assert.equal(r.status, 422);
    assert.ok(r.data.issues.phone);
    assert.ok(r.data.issues.firstName);
  });

  it('вимагає адресу для доставки, але не для самовивозу', async () => {
    const noAddr = await api('POST', '/api/orders', checkout({ city: '', address: '' }));
    assert.equal(noAddr.status, 422);
    assert.ok(noAddr.data.issues.city && noAddr.data.issues.address);
    const pickup = await api('POST', '/api/orders', checkout({ deliveryMethod: 'pickup', city: '', address: '' }));
    assert.equal(pickup.status, 201);
  });

  it('відхиляє невідомий спосіб доставки та оплату карткою без налаштованого провайдера', async () => {
    assert.equal((await api('POST', '/api/orders', checkout({ deliveryMethod: 'teleport' }))).status, 422);
    const card = await api('POST', '/api/orders', checkout({ paymentMethod: 'card' }));
    assert.equal(card.status, 422);
    assert.ok(card.data.issues.paymentMethod);
  });

  it('ігнорує підроблену ціну в тілі замовлення', async () => {
    const r = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantA, qty: 1, price: 1 }], total: 1 }));
    assert.equal(r.status, 201);
    assert.equal(r.data.order.total, 1000);
  });
});

describe('онлайн-оплата (LiqPay)', () => {
  const PRIV = 'test-private-key';
  before(() => { config.liqpay.publicKey = 'pub'; config.liqpay.privateKey = PRIV; });
  after(() => { config.liqpay.publicKey = ''; config.liqpay.privateKey = ''; });

  const callback = (payload: object, sign = true) => {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = sign ? liqpaySign(data, PRIV) : 'bad';
    return fetch(`${base}/api/payments/liqpay/callback`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data, signature }) });
  };

  it('замовлення карткою створюється в статусі «очікує оплати», з підписаними даними для LiqPay', async () => {
    const r = await api('POST', '/api/orders', checkout({ paymentMethod: 'card' }));
    assert.equal(r.status, 201);
    assert.equal(r.data.order.paymentStatus, 'pending');
    assert.ok(r.data.payment.data && r.data.payment.signature);
    assert.equal(r.data.payment.signature, liqpaySign(r.data.payment.data, PRIV));
    const payload = JSON.parse(Buffer.from(r.data.payment.data, 'base64').toString());
    assert.equal(payload.amount, 1000);
    assert.equal(payload.currency, 'UAH');
    assert.equal(payload.public_key, 'pub');
    assert.ok(!r.data.payment.data.includes(PRIV));
  });

  it('оплату підтверджує лише підписаний колбек із правильною сумою', async () => {
    const r = await api('POST', '/api/orders', checkout({ paymentMethod: 'card' }));
    const orderId = `${r.data.number}-a1`;
    assert.equal((await callback({ order_id: orderId, status: 'success', amount: 1000, currency: 'UAH' }, false)).status, 400);
    assert.equal(get<any>('SELECT payment_status s FROM orders WHERE number = ?', r.data.number).s, 'pending');
    await callback({ order_id: orderId, status: 'success', amount: 1, currency: 'UAH' });
    assert.equal(get<any>('SELECT payment_status s FROM orders WHERE number = ?', r.data.number).s, 'pending', 'сума не збігається');
    await callback({ order_id: orderId, status: 'failure', amount: 1000, currency: 'UAH' });
    assert.equal(get<any>('SELECT payment_status s FROM orders WHERE number = ?', r.data.number).s, 'failed');
    assert.equal((await api('GET', `/api/orders/${r.data.number}?t=${r.data.token}`)).data.canPay, true);
    await callback({ order_id: `${r.data.number}-a2`, status: 'success', amount: 1000, currency: 'UAH' });
    assert.equal(get<any>('SELECT payment_status s FROM orders WHERE number = ?', r.data.number).s, 'paid');
    // пізня «помилка» не скасовує підтверджену оплату
    await callback({ order_id: `${r.data.number}-a3`, status: 'failure', amount: 1000, currency: 'UAH' });
    assert.equal(get<any>('SELECT payment_status s FROM orders WHERE number = ?', r.data.number).s, 'paid');
  });

  it('неоплачені онлайн-замовлення автоматично скасовуються, а товар повертається на склад', async () => {
    const s0 = stock(variantA);
    const r = await api('POST', '/api/orders', checkout({ paymentMethod: 'card' }));
    assert.equal(stock(variantA), s0 - 1);
    run(`UPDATE orders SET created_at = '2000-01-01T00:00:00.000Z' WHERE number = ?`, r.data.number);
    assert.ok(cancelUnpaidOrders(60) >= 1);
    assert.equal(get<any>('SELECT status s FROM orders WHERE number = ?', r.data.number).s, 'cancelled');
    assert.equal(stock(variantA), s0);
  });
});

describe('адмін-панель: доступ і дії', () => {
  let cookie = '';
  const adm = { 'X-Requested-With': 'shop-admin' };
  const withCookie = () => ({ ...adm, Cookie: cookie });

  it('закриває всі адмін-маршрути без входу', async () => {
    for (const [m, u] of [['GET', '/api/admin/products'], ['GET', '/api/admin/orders'], ['PUT', '/api/admin/settings/store'], ['POST', '/api/admin/uploads'], ['GET', '/api/admin/me']]) {
      assert.equal((await api(m, u, m === 'PUT' ? {} : undefined, adm)).status, 401, `${m} ${u}`);
    }
  });
  it('відхиляє неправильний пароль', async () => {
    assert.equal((await api('POST', '/api/admin/login', { email: 'owner@example.com', password: 'wrong-password' }, adm)).status, 401);
    assert.equal((await api('POST', '/api/admin/login', { email: 'nobody@example.com', password: 'wrong-password' }, adm)).status, 401);
  });
  it('публічної реєстрації адміністратора немає', async () => {
    assert.equal((await api('POST', '/api/admin/register', { email: 'x@example.com', password: 'hacker-password-1' }, adm)).status, 404);
  });
  it('пускає після входу; cookie HttpOnly + SameSite=Strict', async () => {
    const r = await api('POST', '/api/admin/login', { email: 'owner@example.com', password: 'very-secret-pass-1' }, adm);
    assert.equal(r.status, 200);
    const set = r.headers.get('set-cookie')!;
    assert.match(set, /HttpOnly/);
    assert.match(set, /SameSite=Strict/);
    cookie = set.split(';')[0];
    assert.equal((await api('GET', '/api/admin/me', undefined, withCookie())).status, 200);
  });
  it('вимагає службовий заголовок для змінюючих запитів (захист від CSRF)', async () => {
    const r = await api('PATCH', '/api/admin/orders/1/status', { status: 'confirmed' }, { Cookie: cookie });
    assert.equal(r.status, 403);
  });
  it('змінює статуси замовлень лише за допустимим процесом і повертає товар при скасуванні', async () => {
    const s0 = stock(variantA);
    const o = await api('POST', '/api/orders', checkout({ items: [{ variantId: variantA, qty: 2 }] }));
    const id = get<any>('SELECT id FROM orders WHERE number = ?', o.data.number).id;
    const skip = await api('PATCH', `/api/admin/orders/${id}/status`, { status: 'shipped' }, withCookie());
    assert.equal(skip.status, 409);
    assert.equal((await api('PATCH', `/api/admin/orders/${id}/status`, { status: 'bogus' }, withCookie())).status, 422);
    for (const s of ['confirmed', 'processing']) assert.equal((await api('PATCH', `/api/admin/orders/${id}/status`, { status: s }, withCookie())).status, 200);
    assert.equal(stock(variantA), s0 - 2);
    const cancel = await api('PATCH', `/api/admin/orders/${id}/status`, { status: 'cancelled' }, withCookie());
    assert.equal(cancel.status, 200);
    assert.equal(stock(variantA), s0);
    // скасоване замовлення не можна «воскресити»
    assert.equal((await api('PATCH', `/api/admin/orders/${id}/status`, { status: 'confirmed' }, withCookie())).status, 409);
    const detail = await api('GET', `/api/admin/orders/${id}`, undefined, withCookie());
    assert.equal(detail.data.phone, '+380501234567');
    assert.ok(detail.data.events.length >= 3);
  });
  it('створює, редагує й архівує товар; валідує стару ціну', async () => {
    const payload = {
      name: 'Новий товар', description: 'Опис', categoryId: 1, price: 500, oldPrice: null, isNew: true, isFeatured: false, status: 'active',
      attributes: [{ name: 'Склад', value: 'Бавовна' }], images: [], variants: [{ size: 'M', color: 'Білий', colorHex: '#ffffff', sku: 'NEW-1', stock: 3 }],
    };
    const bad = await api('POST', '/api/admin/products', { ...payload, oldPrice: 400 }, withCookie());
    assert.equal(bad.status, 422);
    assert.ok(bad.data.issues.oldPrice);
    const created = await api('POST', '/api/admin/products', payload, withCookie());
    assert.equal(created.status, 201);
    assert.equal(created.data.slug, 'novyi-tovar');
    const vid = created.data.variants[0].id;
    const upd = await api('PUT', `/api/admin/products/${created.data.id}`, { ...payload, price: 450, oldPrice: 600, variants: [{ id: vid, size: 'M', color: 'Білий', colorHex: '#ffffff', sku: 'NEW-1', stock: 7 }] }, withCookie());
    assert.equal(upd.status, 200);
    assert.equal(upd.data.price, 450);
    assert.equal(stock(vid), 7);
    assert.equal((await api('GET', '/api/products/novyi-tovar')).status, 200);
    assert.equal((await api('DELETE', `/api/admin/products/${created.data.id}`, undefined, withCookie())).status, 200);
    assert.equal((await api('GET', '/api/products/novyi-tovar')).status, 404, 'архівований товар зникає з вітрини');
  });
  it('перевіряє завантажувані файли за вмістом, а не за розширенням', async () => {
    const up = (body: Buffer, type: string) => fetch(`${base}/api/admin/uploads`, { method: 'POST', headers: { ...withCookie(), 'Content-Type': type }, body: new Uint8Array(body) });
    assert.equal((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png')).status, 415);
    assert.equal((await up(Buffer.from('console.log(1)'.repeat(10)), 'image/jpeg')).status, 415);
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#c33' } }).png().toBuffer();
    const ok = await up(png, 'application/octet-stream');
    assert.equal(ok.status, 201);
    const { url } = (await ok.json()) as { url: string };
    assert.match(url, /^\/uploads\/[a-f0-9]{16}$/);
    assert.equal((await fetch(`${base}${url}.w400.webp`)).status, 200);
  });
  it('після виходу сесія недійсна', async () => {
    assert.equal((await api('POST', '/api/admin/logout', {}, withCookie())).status, 200);
    assert.equal((await api('GET', '/api/admin/me', undefined, withCookie())).status, 401);
  });
});

describe('обмеження частоти', () => {
  it('блокує перебір пароля', async () => {
    rateConfig.enabled = true;
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api('POST', '/api/admin/login', { email: 'owner@example.com', password: `bad-${i}-password` }, { 'X-Requested-With': 'shop-admin' })).status;
    assert.equal(last, 429);
    rateConfig.enabled = false;
  });
  it('обмежує створення замовлень з одного IP', async () => {
    rateConfig.enabled = true;
    resetRateLimits();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await api('POST', '/api/orders', { bad: true })).status);
    rateConfig.enabled = false;
    assert.ok(codes.includes(429));
  });
});
