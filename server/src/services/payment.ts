import crypto from 'node:crypto';
import { config } from '../config.ts';
import { all, get, run } from '../db.ts';
import { markPayment, type OrderRow } from './orders.ts';

/**
 * Онлайн-оплата через LiqPay (офіційний API checkout). Магазин не бачить і не зберігає
 * дані карток: покупець переходить на сторінку LiqPay, а результат приходить на server_url.
 * Документація: https://www.liqpay.ua/doc/api/internet_acquiring/checkout
 */
export const LIQPAY_CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout';

export const liqpaySign = (data: string, privateKey = config.liqpay.privateKey) =>
  crypto.createHash('sha1').update(privateKey + data + privateKey).digest('base64');

export function orderToken(number: string) {
  return crypto.createHmac('sha256', config.hmacKey).update(`order:${number}`).digest('base64url').slice(0, 22);
}

export function checkOrderToken(number: string, token: string | null | undefined) {
  if (!token) return false;
  const a = Buffer.from(orderToken(number));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const orderUrl = (number: string) => `${config.publicUrl}/order/${encodeURIComponent(number)}?t=${orderToken(number)}`;

/** Дані для форми переходу на LiqPay. Кожна спроба оплати має власний order_id (number-aN). */
export function liqpayForm(o: OrderRow) {
  const attempt = (get<{ n: number }>(`SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND type = 'pay_init'`, o.id)?.n ?? 0) + 1;
  run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', o.id, 'pay_init', `Спроба оплати №${attempt}`);
  const payload = {
    version: 3,
    public_key: config.liqpay.publicKey,
    action: 'pay',
    amount: o.total,
    currency: 'UAH',
    description: `Замовлення №${o.number}`,
    order_id: `${o.number}-a${attempt}`,
    result_url: orderUrl(o.number),
    server_url: `${config.publicUrl}/api/payments/liqpay/callback`,
    language: 'uk',
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  return { action: LIQPAY_CHECKOUT_URL, data, signature: liqpaySign(data) };
}

export function verifyCallbackSignature(data: string, signature: string) {
  if (!config.liqpay.privateKey) return false;
  const a = Buffer.from(liqpaySign(data));
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Обробляє серверний колбек LiqPay. Підтвердженням оплати вважається лише підписаний колбек зі статусом success. */
export function handleLiqpayCallback(data: string, signature: string): { ok: boolean; note: string } {
  if (!verifyCallbackSignature(data, signature)) return { ok: false, note: 'invalid signature' };
  let p: any;
  try { p = JSON.parse(Buffer.from(data, 'base64').toString('utf8')); } catch { return { ok: false, note: 'bad payload' }; }
  const m = /^(.+)-a\d+$/.exec(String(p.order_id ?? ''));
  const order = m ? get<OrderRow>('SELECT * FROM orders WHERE number = ?', m[1]) : undefined;
  if (!order) return { ok: false, note: 'order not found' };

  const status = String(p.status ?? '');
  const success = status === 'success' || (!config.isProd && status === 'sandbox');
  if (success) {
    if (Number(p.amount) !== order.total || p.currency !== 'UAH') {
      run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', order.id, 'payment', `Сума/валюта в колбеку не збігається (${p.amount} ${p.currency}), оплату не підтверджено`);
      return { ok: false, note: 'amount mismatch' };
    }
    markPayment(order.id, 'paid', `LiqPay: оплату підтверджено (payment_id ${p.payment_id ?? '—'})`);
  } else if (['failure', 'error', 'reversed'].includes(status)) {
    markPayment(order.id, 'failed', `LiqPay: оплата не пройшла (${status}${p.err_description ? `: ${p.err_description}` : ''})`);
  } else {
    run('INSERT INTO order_events (order_id, type, detail) VALUES (?, ?, ?)', order.id, 'payment', `LiqPay: проміжний статус «${status}»`);
  }
  return { ok: true, note: status };
}

/** Невикуплені онлайн-замовлення: за N хв скасовуємо й повертаємо товар на склад. */
export function expiredUnpaidOrderIds(minutes: number) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  return all<{ id: number }>(
    `SELECT id FROM orders WHERE payment_method = 'card' AND payment_status IN ('pending','failed') AND status = 'new' AND created_at < ?`,
    cutoff,
  ).map((r) => r.id);
}
