import { config } from '../config.ts';
import { all, get, run } from '../db.ts';
import { HttpError, Reply, setCookie, type Router } from '../lib/http.ts';
import { EMAIL_RE, parseWith, v } from '../lib/validate.ts';
import {
  adminSummary, archiveProduct, categorySchema, createProduct, deleteCategory, listAdminOrders, listAdminProducts,
  productSchema, saveCategory, updateProduct,
} from '../services/adminCatalog.ts';
import { login, logout } from '../services/auth.ts';
import { getProductById, listCategories } from '../services/catalog.ts';
import { MAX_UPLOAD_BYTES, saveImage } from '../services/images.ts';
import { ORDER_STATUSES, STATUS_FLOW, STATUS_LABELS, orderOut, setOrderStatus, type OrderRow, type OrderStatus } from '../services/orders.ts';
import { DEFAULT_SETTINGS, getSettings, setSetting, type Settings } from '../services/settings.ts';
import { SLUG_RE } from '../lib/validate.ts';

const A = { admin: true } as const;
const int = (s: string | null, d: number) => (s && Number.isFinite(Number(s)) ? Math.max(1, Math.round(Number(s))) : d);

// Схеми налаштувань (кожен ключ validується окремо)
const str = (max: number) => v.string({ max });
const settingSchemas: Record<keyof Settings, any> = {
  store: v.object({ name: v.string({ min: 1, max: 60 }), tagline: str(100), logo: v.string({ max: 80, pattern: /^(\/uploads\/[a-f0-9]{16})?$/ }), description: str(500), currency: v.string({ min: 1, max: 5 }) }),
  hero: v.object({ eyebrow: str(60), title: v.string({ min: 1, max: 120 }), subtitle: str(300), image: str(80), ctaPrimary: str(40), ctaSecondary: str(40) }),
  contacts: v.object({ phone: str(40), email: str(120), address: str(200), hours: str(100), instagram: str(200), facebook: str(200), telegram: str(200) }),
  advantages: v.array(v.object({ title: v.string({ min: 1, max: 80 }), text: str(200) }), { max: 8 }),
  deliveryMethods: v.array(
    v.object({
      id: v.string({ min: 1, max: 40, pattern: SLUG_RE }),
      name: v.string({ min: 1, max: 80 }),
      description: str(200),
      price: v.int({ min: 0, max: 100000 }),
      variable: v.bool(),
      freeFrom: v.nullable(v.int({ min: 0, max: 100_000_000 })),
      kind: v.oneOf(['branch', 'address', 'pickup'] as const),
      enabled: v.bool(),
    }),
    { min: 1, max: 12 },
  ),
  paymentMethods: v.array(
    v.object({ id: v.oneOf(['cod', 'card'] as const), name: v.string({ min: 1, max: 80 }), description: str(200), enabled: v.bool() }),
    { min: 1, max: 2 },
  ),
};

export function registerAdmin(r: Router) {
  r.post('/api/admin/login', async (ctx) => {
    const b = v.object({ email: v.string({ pattern: EMAIL_RE, max: 120 }), password: v.string({ min: 1, max: 200, trim: false }) }).parse(await ctx.json());
    const s = login(b.email, b.password);
    if (!s) throw new HttpError(401, 'Невірний email або пароль');
    setCookie(ctx.res, 'sid', s.token, s.ttl);
    return { user: s.user };
  }, { rate: 8 });

  r.post('/api/admin/logout', (ctx) => {
    logout(ctx.sessionToken);
    setCookie(ctx.res, 'sid', '', 0);
    return { ok: true };
  });

  r.get('/api/admin/me', (ctx) => ({ user: ctx.user }), A);
  r.get('/api/admin/summary', () => adminSummary(), A);
  // Лише прапорці «налаштовано / ні» — самі ключі ніколи не віддаються клієнту
  r.get('/api/admin/integrations', () => ({
    onlinePayment: Boolean(config.liqpay.publicKey && config.liqpay.privateKey),
    novaPoshta: Boolean(config.novaPoshtaKey),
    telegram: Boolean(config.telegram.token && config.telegram.chatId),
    email: Boolean(config.email.resendKey && config.email.from && config.email.to),
    publicUrl: config.publicUrl,
  }), A);

  // ----- Товари -----
  r.get('/api/admin/products', ({ query }) =>
    listAdminProducts({
      q: query.get('q')?.trim() || undefined,
      status: query.get('status') || undefined,
      category: query.get('category') ? int(query.get('category'), 0) || undefined : undefined,
      page: int(query.get('page'), 1),
      perPage: 20,
    }), A);

  r.get('/api/admin/products/:id', ({ params }) => {
    const p = getProductById(Number(params.id));
    if (!p) throw new HttpError(404, 'Товар не знайдено');
    return p;
  }, A);

  r.post('/api/admin/products', async (ctx) => new Reply(201, createProduct(productSchema.parse(await ctx.json(256 * 1024)))), A);
  r.put('/api/admin/products/:id', async (ctx) => updateProduct(Number(ctx.params.id), productSchema.parse(await ctx.json(256 * 1024))), A);
  r.delete('/api/admin/products/:id', ({ params }) => {
    archiveProduct(Number(params.id));
    return { ok: true };
  }, A);

  // Завантаження фото: тіло запиту — сам файл (image/jpeg|png|webp), тип перевіряється за вмістом
  r.post('/api/admin/uploads', async (ctx) => {
    const buf = await ctx.raw(MAX_UPLOAD_BYTES);
    const base = await saveImage(buf);
    return new Reply(201, { url: base, thumb: `${base}.w400.webp` });
  }, { admin: true, rate: 40 });

  // ----- Категорії -----
  r.get('/api/admin/categories', () => listCategories(true), A);
  r.post('/api/admin/categories', async (ctx) => {
    const id = saveCategory(null, categorySchema.parse(await ctx.json()));
    return new Reply(201, listCategories(true).find((c) => c.id === id));
  }, A);
  r.put('/api/admin/categories/:id', async (ctx) => {
    const id = saveCategory(Number(ctx.params.id), categorySchema.parse(await ctx.json()));
    return listCategories(true).find((c) => c.id === id);
  }, A);
  r.delete('/api/admin/categories/:id', ({ params }) => {
    deleteCategory(Number(params.id));
    return { ok: true };
  }, A);

  // ----- Замовлення -----
  r.get('/api/admin/orders', ({ query }) => {
    const status = query.get('status') || undefined;
    if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) throw new HttpError(422, 'Невірний статус');
    return {
      ...listAdminOrders({ status, q: query.get('q')?.trim() || undefined, page: int(query.get('page'), 1), perPage: 20 }),
      statuses: ORDER_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s], next: STATUS_FLOW[s] })),
    };
  }, A);

  r.get('/api/admin/orders/:id', ({ params }) => {
    const o = get<OrderRow>('SELECT * FROM orders WHERE id = ?', Number(params.id));
    if (!o) throw new HttpError(404, 'Замовлення не знайдено');
    return { ...orderOut(o, true), allowedNext: STATUS_FLOW[o.status].map((s) => ({ id: s, label: STATUS_LABELS[s] })) };
  }, A);

  r.patch('/api/admin/orders/:id/status', async (ctx) => {
    const b = v.object({ status: v.oneOf(ORDER_STATUSES) }).parse(await ctx.json());
    const o = setOrderStatus(Number(ctx.params.id), b.status as OrderStatus, ctx.user!.email);
    return { ...orderOut(o, true), allowedNext: STATUS_FLOW[o.status].map((s) => ({ id: s, label: STATUS_LABELS[s] })) };
  }, A);

  // Ручне підтвердження оплати (наприклад, переказ за реквізитами) з записом у журнал
  r.patch('/api/admin/orders/:id/payment', async (ctx) => {
    const b = v.object({ paymentStatus: v.oneOf(['paid', 'pending', 'cod'] as const) }).parse(await ctx.json());
    const id = Number(ctx.params.id);
    const o = get<OrderRow>('SELECT * FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'Замовлення не знайдено');
    run(`UPDATE orders SET payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, b.paymentStatus, id);
    run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', id, 'payment', `Статус оплати змінено вручну: ${b.paymentStatus} (${ctx.user!.email})`);
    return orderOut(get<OrderRow>('SELECT * FROM orders WHERE id = ?', id)!, true);
  }, A);

  // ----- Налаштування й сторінки -----
  r.get('/api/admin/settings', () => getSettings(), A);
  r.put('/api/admin/settings/:key', async (ctx) => {
    const key = ctx.params.key as keyof Settings;
    if (!(key in DEFAULT_SETTINGS)) throw new HttpError(404, 'Невідомий розділ налаштувань');
    const parsed = parseWith(settingSchemas[key], await ctx.json());
    setSetting(key, parsed);
    return getSettings()[key];
  }, A);

  r.get('/api/admin/pages', () => all('SELECT slug, title, updated_at AS updatedAt FROM pages ORDER BY slug'), A);
  r.get('/api/admin/pages/:slug', ({ params }) => {
    const p = get('SELECT slug, title, body, updated_at AS updatedAt FROM pages WHERE slug = ?', params.slug);
    if (!p) throw new HttpError(404, 'Сторінку не знайдено');
    return p;
  }, A);
  r.put('/api/admin/pages/:slug', async (ctx) => {
    const b = v.object({ title: v.string({ min: 1, max: 120 }), body: v.string({ max: 50000, trim: false }) }).parse(await ctx.json(256 * 1024));
    if (!SLUG_RE.test(ctx.params.slug)) throw new HttpError(422, 'Невірна адреса сторінки');
    run(
      `INSERT INTO pages (slug, title, body) VALUES (?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      ctx.params.slug, b.title, b.body,
    );
    return get('SELECT slug, title, body, updated_at AS updatedAt FROM pages WHERE slug = ?', ctx.params.slug);
  }, A);
}
