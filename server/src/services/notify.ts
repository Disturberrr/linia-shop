import { config } from '../config.ts';
import { run } from '../db.ts';
import { getSettings } from './settings.ts';
import { getOrderItems, type OrderRow } from './orders.ts';

type Result = { status: 'sent' | 'failed' | 'skipped'; detail: string };

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

export function orderText(o: OrderRow) {
  const cur = getSettings().store.currency;
  const items = getOrderItems(o.id)
    .map((i) => `• ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.qty} — ${i.unitPrice * i.qty} ${cur}`)
    .join('\n');
  const pay = o.payment_method === 'cod' ? 'оплата при отриманні' : `онлайн-оплата (${o.payment_status === 'paid' ? 'сплачено' : 'очікує оплати'})`;
  return [
    `Нове замовлення №${o.number}`,
    `${o.first_name} ${o.last_name}, ${o.phone}${o.email ? `, ${o.email}` : ''}`,
    '',
    items,
    '',
    `Разом: ${o.total} ${cur} (доставка: ${o.delivery_price} ${cur})`,
    `Доставка: ${o.delivery_method_name}${o.delivery_city ? `, ${o.delivery_city}` : ''}${o.delivery_address ? `, ${o.delivery_address}` : ''}`,
    `Оплата: ${pay}`,
    o.comment ? `Коментар: ${o.comment}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

async function telegram(text: string): Promise<Result> {
  const { token, chatId } = config.telegram;
  if (!token || !chatId) return { status: 'skipped', detail: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не задано' };
  try {
    const r = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text });
    // «Надіслано» лише якщо Telegram явно підтвердив
    if (r.ok && r.json?.ok === true) return { status: 'sent', detail: `message_id ${r.json.result?.message_id ?? '?'}` };
    return { status: 'failed', detail: `Telegram: ${r.json?.description ?? `HTTP ${r.status}`}` };
  } catch (e) {
    return { status: 'failed', detail: `Telegram: ${(e as Error).message}` };
  }
}

async function email(subject: string, text: string): Promise<Result> {
  const { resendKey, from, to } = config.email;
  if (!resendKey || !from || !to) return { status: 'skipped', detail: 'RESEND_API_KEY / NOTIFY_EMAIL_FROM / NOTIFY_EMAIL_TO не задано' };
  try {
    const r = await postJson(
      'https://api.resend.com/emails',
      { from, to: to.split(',').map((s) => s.trim()).filter(Boolean), subject, text },
      { Authorization: `Bearer ${resendKey}` },
    );
    if (r.ok && r.json?.id) return { status: 'sent', detail: `id ${r.json.id}` };
    return { status: 'failed', detail: `Resend: ${r.json?.message ?? `HTTP ${r.status}`}` };
  } catch (e) {
    return { status: 'failed', detail: `Resend: ${(e as Error).message}` };
  }
}

/** Сповіщає власника про нове замовлення. Результат кожного каналу пишеться в таблицю notifications. */
export async function notifyNewOrder(o: OrderRow) {
  const text = orderText(o);
  const results: Record<string, Result> = {
    telegram: await telegram(text),
    email: await email(`Нове замовлення №${o.number}`, text),
  };
  for (const [channel, r] of Object.entries(results)) {
    run('INSERT INTO notifications (order_id, channel, status, detail) VALUES (?, ?, ?, ?)', o.id, channel, r.status, r.detail);
    if (r.status === 'failed') console.error(`Сповіщення (${channel}) про замовлення ${o.number} не доставлено: ${r.detail}`);
  }
  return results;
}
