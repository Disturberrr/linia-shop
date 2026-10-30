import { config } from '../config.ts';
import { get } from '../db.ts';
import { HttpError, Reply, type Router } from '../lib/http.ts';
import { v } from '../lib/validate.ts';
import { facets, getProductBySlug, listCategories, listProducts, relatedProducts } from '../services/catalog.ts';
import { notifyNewOrder } from '../services/notify.ts';
import { searchCities, searchWarehouses } from '../services/novaposhta.ts';
import { checkoutSchema, createOrder, deliveryFor, orderOut, priceCart, type OrderRow } from '../services/orders.ts';
import { checkOrderToken, handleLiqpayCallback, liqpayForm, orderToken } from '../services/payment.ts';
import { availablePaymentMethods, getPage, getSettings, onlinePaymentConfigured } from '../services/settings.ts';

const csv = (s: string | null) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20) : undefined);
const num = (s: string | null) => (s !== null && s !== '' && Number.isFinite(Number(s)) ? Math.round(Number(s)) : undefined);

export function publicConfig() {
  const s = getSettings();
  return {
    store: s.store,
    hero: s.hero,
    contacts: s.contacts,
    advantages: s.advantages,
    deliveryMethods: s.deliveryMethods.filter((d) => d.enabled),
    paymentMethods: availablePaymentMethods(),
    features: { onlinePayment: onlinePaymentConfigured(), novaPoshta: Boolean(config.novaPoshtaKey) },
    categories: listCategories(),
  };
}

function orderPublic(o: OrderRow) {
  const canPay = o.payment_method === 'card' && ['pending', 'failed'].includes(o.payment_status) && o.status !== 'cancelled' && onlinePaymentConfigured();
  return { ...orderPublicBase(o), canPay };
}
const orderPublicBase = (o: OrderRow) => ({ ...orderOut(o, false), contact: { firstName: o.first_name, lastName: o.last_name, phone: o.phone, email: o.email, city: o.delivery_city, address: o.delivery_address } });

export function registerPublic(r: Router) {
  r.get('/api/config', () => publicConfig());

  r.get('/api/products', ({ query }) =>
    listProducts({
      category: query.get('category') || undefined,
      q: query.get('q')?.trim().slice(0, 100) || undefined,
      minPrice: num(query.get('minPrice')),
      maxPrice: num(query.get('maxPrice')),
      sizes: csv(query.get('size')),
      colors: csv(query.get('color')),
      sort: query.get('sort') || undefined,
      page: num(query.get('page')),
      perPage: num(query.get('perPage')),
      featured: query.get('featured') === '1',
      slugs: query.has('slugs') ? csv(query.get('slugs')) ?? [] : undefined,
      onlyNew: query.get('new') === '1',
      onlySale: query.get('sale') === '1',
    }),
  );

  r.get('/api/facets', ({ query }) => facets(query.get('category') || undefined));

  r.get('/api/products/:slug', ({ params }) => {
    const p = getProductBySlug(params.slug);
    if (!p) throw new HttpError(404, 'Товар не знайдено');
    return { product: p, related: relatedProducts(p.id, p.categoryId, 4) };
  });

  // Перерахунок кошика на сервері: клієнтські ціни ніколи не використовуються
  r.post(
    '/api/cart/price',
    async (ctx) => {
      const body = v.object({ items: v.array(v.object({ variantId: v.int({ min: 1 }), qty: v.int({ min: 1, max: 99 }) }), { max: 50 }) }).parse(await ctx.json());
      return priceCart(body.items);
    },
    { rate: 90 },
  );

  r.post(
    '/api/delivery/quote',
    async (ctx) => {
      const b = v.object({ method: v.string({ min: 1, max: 40 }), subtotal: v.int({ min: 0, max: 100_000_000 }) }).parse(await ctx.json());
      const d = deliveryFor(b.method, b.subtotal);
      return { price: d.price, variable: d.method.variable && d.price === 0 };
    },
    { rate: 60 },
  );

  r.post(
    '/api/orders',
    async (ctx) => {
      const input = checkoutSchema.parse(await ctx.json());
      const { order, created } = createOrder(input);
      if (created) {
        // Сповіщення не блокують відповідь покупцю; результат кожного каналу фіксується в БД
        notifyNewOrder(order).catch((e) => console.error('notify:', e));
      }
      const pay = order.payment_method === 'card' && order.payment_status !== 'paid' && onlinePaymentConfigured() ? liqpayForm(order) : null;
      return new Reply(created ? 201 : 200, {
        number: order.number,
        token: orderToken(order.number),
        order: orderPublic(order),
        payment: pay,
        replay: !created,
      });
    },
    { rate: 10 },
  );

  r.get('/api/orders/:number', ({ params, query }) => {
    if (!checkOrderToken(params.number, query.get('t'))) throw new HttpError(404, 'Замовлення не знайдено');
    const o = get<OrderRow>('SELECT * FROM orders WHERE number = ?', params.number);
    if (!o) throw new HttpError(404, 'Замовлення не знайдено');
    return orderPublic(o);
  }, { rate: 60 });

  // Повторна спроба оплати (наприклад, після невдалого платежу)
  r.post('/api/orders/:number/pay', ({ params, query }) => {
    if (!checkOrderToken(params.number, query.get('t'))) throw new HttpError(404, 'Замовлення не знайдено');
    const o = get<OrderRow>('SELECT * FROM orders WHERE number = ?', params.number);
    if (!o) throw new HttpError(404, 'Замовлення не знайдено');
    if (o.payment_method !== 'card' || o.payment_status === 'paid' || o.status === 'cancelled') throw new HttpError(409, 'Оплата для цього замовлення недоступна');
    if (!onlinePaymentConfigured()) throw new HttpError(503, 'Онлайн-оплату не налаштовано');
    return { payment: liqpayForm(o) };
  }, { rate: 10 });

  // Серверний колбек LiqPay (application/x-www-form-urlencoded: data, signature)
  r.post('/api/payments/liqpay/callback', async (ctx) => {
    const form = new URLSearchParams((await ctx.raw(64 * 1024)).toString('utf8'));
    const res = handleLiqpayCallback(form.get('data') ?? '', form.get('signature') ?? '');
    if (!res.ok) throw new HttpError(400, `Колбек відхилено: ${res.note}`);
    return { ok: true };
  }, { rate: 120 });

  r.get('/api/np/cities', async ({ query }) => {
    const q = (query.get('q') ?? '').trim();
    return q.length < 2 ? [] : searchCities(q);
  }, { rate: 60 });
  r.get('/api/np/warehouses', async ({ query }) => {
    const city = query.get('city') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(city)) throw new HttpError(422, 'Невірне місто');
    return searchWarehouses(city, (query.get('q') ?? '').trim().slice(0, 60));
  }, { rate: 60 });

  r.get('/api/pages/:slug', ({ params }) => {
    const p = getPage(params.slug);
    if (!p) throw new HttpError(404, 'Сторінку не знайдено');
    return p;
  });
}
