import crypto from 'node:crypto';
import { all, get, run, tx } from '../db.ts';
import { HttpError } from '../lib/http.ts';
import { v, PHONE_RE, EMAIL_RE } from '../lib/validate.ts';
import { availablePaymentMethods, getSettings } from './settings.ts';

export const ORDER_STATUSES = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новий',
  confirmed: 'Підтверджений',
  processing: 'Обробляється',
  shipped: 'Відправлений',
  completed: 'Виконаний',
  cancelled: 'Скасований',
};

/** Дозволені переходи статусів — відображають реальний процес роботи магазину. */
export const STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const checkoutSchema = v.object({
  idempotencyKey: v.string({ min: 16, max: 80, pattern: /^[A-Za-z0-9_-]+$/ }),
  firstName: v.string({ min: 1, max: 60 }),
  lastName: v.string({ min: 1, max: 60 }),
  phone: v.string({ pattern: PHONE_RE, msg: 'Вкажіть телефон, наприклад +380501234567' }),
  email: v.optional(v.string({ pattern: EMAIL_RE, max: 120, msg: 'Невірна адреса email' })),
  deliveryMethod: v.string({ min: 1, max: 40 }),
  city: v.optional(v.string({ max: 120 })),
  address: v.optional(v.string({ max: 255 })),
  comment: v.optional(v.string({ max: 500 })),
  paymentMethod: v.oneOf(['cod', 'card'] as const),
  items: v.array(
    v.object({
      variantId: v.int({ min: 1 }),
      qty: v.int({ min: 1, max: 20 }),
    }),
    { min: 1, max: 50 },
  ),
});

type CheckoutInput = ReturnType<typeof checkoutSchema.parse>;

export interface PricedLine {
  variantId: number;
  productId: number;
  name: string;
  variantLabel: string;
  sku: string | null;
  unitPrice: number;
  oldPrice: number | null;
  qty: number;
  stock: number;
  image: string | null;
  slug: string;
  available: boolean;
  problem?: string;
}

/** Перераховує кошик за даними БД. Ціни, наявність та назви клієнта ігноруються. */
export function priceCart(items: { variantId: number; qty: number }[]) {
  // Об'єднуємо дублікати одного варіанта
  const merged = new Map<number, number>();
  for (const it of items) merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + it.qty);

  const lines: PricedLine[] = [];
  for (const [variantId, qty] of merged) {
    const r = get<any>(
      `SELECT v.id AS variant_id, v.size, v.color, v.sku, v.stock, p.id AS product_id, p.name, p.slug, p.price, p.old_price, p.status, c.is_active,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image
       FROM variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id WHERE v.id = ?`,
      variantId,
    );
    if (!r) {
      lines.push({ variantId, productId: 0, name: 'Товар недоступний', variantLabel: '', sku: null, unitPrice: 0, oldPrice: null, qty, stock: 0, image: null, slug: '', available: false, problem: 'Товар більше не продається' });
      continue;
    }
    const label = [r.size, r.color].filter(Boolean).join(' · ');
    let problem: string | undefined;
    if (r.status !== 'active' || !r.is_active) problem = 'Товар більше не продається';
    else if (r.stock <= 0) problem = 'Немає в наявності';
    else if (qty > r.stock) problem = `Доступно лише ${r.stock} шт.`;
    lines.push({
      variantId, productId: r.product_id, name: r.name, variantLabel: label, sku: r.sku, unitPrice: r.price, oldPrice: r.old_price,
      qty, stock: r.stock, image: r.image, slug: r.slug, available: !problem, problem,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = lines.reduce((s, l) => s + (l.oldPrice ? (l.oldPrice - l.unitPrice) * l.qty : 0), 0);
  return { lines, subtotal, discount, ok: lines.every((l) => l.available) };
}

export function deliveryFor(methodId: string, subtotal: number) {
  const m = getSettings().deliveryMethods.find((d) => d.id === methodId && d.enabled);
  if (!m) throw new HttpError(422, 'Обраний спосіб доставки недоступний', { issues: { deliveryMethod: 'Оберіть спосіб доставки' } });
  const free = m.freeFrom !== null && subtotal >= m.freeFrom;
  return { method: m, price: free || m.variable ? 0 : m.price, payOnDelivery: m.variable && !free };
}

export interface OrderRow {
  id: number;
  number: string;
  status: OrderStatus;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  delivery_method: string;
  delivery_method_name: string;
  delivery_city: string;
  delivery_address: string;
  comment: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  delivery_price: number;
  total: number;
  created_at: string;
  updated_at: string;
}

function makeNumber(id: number) {
  // Номер формує сервер: дата + порядковий номер. Зрозумілий покупцеві й не збігається між днями.
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${ymd}-${String(id).padStart(5, '0')}`;
}

export function createOrder(input: CheckoutInput): { order: OrderRow; created: boolean } {
  const issues: Record<string, string> = {};

  const payment = availablePaymentMethods().find((p) => p.id === input.paymentMethod);
  if (!payment) throw new HttpError(422, 'Обраний спосіб оплати недоступний', { issues: { paymentMethod: 'Оберіть спосіб оплати' } });

  const settings = getSettings();
  const method = settings.deliveryMethods.find((d) => d.id === input.deliveryMethod && d.enabled);
  if (!method) throw new HttpError(422, 'Обраний спосіб доставки недоступний', { issues: { deliveryMethod: 'Оберіть спосіб доставки' } });
  if (method.kind !== 'pickup') {
    if (!input.city) issues.city = "Вкажіть місто";
    if (!input.address) issues.address = method.kind === 'branch' ? 'Вкажіть номер відділення' : 'Вкажіть адресу доставки';
  }
  if (Object.keys(issues).length) throw new HttpError(422, 'Перевірте введені дані', { issues });

  return tx(() => {
    // Повторна відправка тієї ж форми повертає вже створене замовлення, а не дублює його
    const existing = get<OrderRow>('SELECT * FROM orders WHERE idempotency_key = ?', input.idempotencyKey);
    if (existing) return { order: existing, created: false };

    const priced = priceCart(input.items);
    if (!priced.ok) {
      const bad = priced.lines.filter((l) => !l.available).map((l) => ({ variantId: l.variantId, name: l.name, variantLabel: l.variantLabel, problem: l.problem }));
      throw new HttpError(409, 'Деякі товари змінилися. Перевірте кошик.', { unavailable: bad });
    }
    const delivery = deliveryFor(input.deliveryMethod, priced.subtotal);
    const total = priced.subtotal + delivery.price;

    // Рядок із тимчасовим номером, потім оновлюємо його на основі id
    const ins = run(
      `INSERT INTO orders (number, first_name, last_name, phone, email, delivery_method, delivery_method_name, delivery_city, delivery_address,
         comment, payment_method, payment_status, subtotal, discount, delivery_price, total, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `tmp-${crypto.randomUUID()}`, input.firstName, input.lastName, input.phone, input.email ?? '', method.id, method.name,
      input.city ?? '', input.address ?? '', input.comment ?? '', input.paymentMethod, input.paymentMethod === 'cod' ? 'cod' : 'pending',
      priced.subtotal, priced.discount, delivery.price, total, input.idempotencyKey,
    );
    const orderId = Number(ins.lastInsertRowid);
    run('UPDATE orders SET number = ? WHERE id = ?', makeNumber(orderId), orderId);

    for (const l of priced.lines) {
      // Умовне списання: захищає від продажу більше, ніж є на складі
      const upd = run('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?', l.qty, l.variantId, l.qty);
      if (Number(upd.changes) !== 1) throw new HttpError(409, 'Товар закінчився під час оформлення. Перевірте кошик.', { unavailable: [{ variantId: l.variantId, name: l.name, variantLabel: l.variantLabel, problem: 'Немає в наявності' }] });
      run(
        `INSERT INTO order_items (order_id, product_id, variant_id, name, variant_label, sku, unit_price, old_price, qty, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId, l.productId, l.variantId, l.name, l.variantLabel, l.sku, l.unitPrice, l.oldPrice, l.qty, l.image,
      );
    }
    run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', orderId, 'created', `Замовлення створено, оплата: ${payment.name}`);
    return { order: get<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId)!, created: true };
  });
}

export function getOrderItems(orderId: number) {
  return all<any>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId).map((i) => ({
    id: i.id, productId: i.product_id, variantId: i.variant_id, name: i.name, variantLabel: i.variant_label, sku: i.sku,
    unitPrice: i.unit_price, oldPrice: i.old_price, qty: i.qty, image: i.image,
  }));
}

export function orderOut(o: OrderRow, withContacts: boolean) {
  const base = {
    number: o.number,
    status: o.status,
    statusLabel: STATUS_LABELS[o.status],
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    deliveryMethodName: o.delivery_method_name,
    subtotal: o.subtotal,
    discount: o.discount,
    deliveryPrice: o.delivery_price,
    total: o.total,
    createdAt: o.created_at,
    items: getOrderItems(o.id),
  };
  if (!withContacts) return base;
  return {
    ...base,
    id: o.id,
    firstName: o.first_name, lastName: o.last_name, phone: o.phone, email: o.email,
    deliveryMethod: o.delivery_method, city: o.delivery_city, address: o.delivery_address, comment: o.comment,
    updatedAt: o.updated_at,
    events: all<any>('SELECT type, detail, created_at AS createdAt FROM order_events WHERE order_id = ? ORDER BY id', o.id),
    notifications: all<any>('SELECT channel, status, detail, created_at AS createdAt FROM notifications WHERE order_id = ? ORDER BY id', o.id),
  };
}

export function setOrderStatus(id: number, next: OrderStatus, actor: string) {
  return tx(() => {
    const o = get<OrderRow>('SELECT * FROM orders WHERE id = ?', id);
    if (!o) throw new HttpError(404, 'Замовлення не знайдено');
    if (o.status === next) return o;
    if (!STATUS_FLOW[o.status].includes(next)) {
      throw new HttpError(409, `Перехід «${STATUS_LABELS[o.status]}» → «${STATUS_LABELS[next]}» неможливий`);
    }
    if (next === 'cancelled') {
      // Скасування повертає товар на склад
      for (const it of all<{ variant_id: number | null; qty: number }>('SELECT variant_id, qty FROM order_items WHERE order_id = ?', id)) {
        if (it.variant_id) run('UPDATE variants SET stock = stock + ? WHERE id = ?', it.qty, it.variant_id);
      }
    }
    run(`UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, next, id);
    run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', id, 'status', `${STATUS_LABELS[o.status]} → ${STATUS_LABELS[next]} (${actor})`);
    return get<OrderRow>('SELECT * FROM orders WHERE id = ?', id)!;
  });
}

export function markPayment(orderId: number, status: 'paid' | 'failed', detail: string) {
  tx(() => {
    const o = get<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o || o.payment_status === status) return;
    if (o.payment_status === 'paid') return; // не перезаписуємо підтверджену оплату
    run(`UPDATE orders SET payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, status, orderId);
    run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', orderId, 'payment', detail);
  });
}
