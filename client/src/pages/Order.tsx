import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ErrorBox } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { Link, useLocation, useTitle } from '../lib/router';
import type { PaymentForm, PublicOrder } from '../lib/types';
import { LineThumb, Totals } from './Cart';
import { redirectToPayment } from './Checkout';
import NotFound from './NotFound';

const PAY_LABEL: Record<string, string> = { pending: 'Очікує оплати', paid: 'Оплачено', failed: 'Оплата не пройшла', cod: 'Оплата при отриманні' };

export default function Order({ number }: { number: string }) {
  const { search } = useLocation();
  const token = search.get('t') ?? '';
  useTitle(`Замовлення №${number}`);
  const [order, setOrder] = useState<PublicOrder>();
  const [error, setError] = useState<Error & { status?: number }>();
  const [polls, setPolls] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<PublicOrder>(`/api/orders/${encodeURIComponent(number)}?t=${encodeURIComponent(token)}`).then((o) => live && setOrder(o)).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [number, token, polls]);

  // Після повернення з платіжної сторінки статус «оплачено» приходить із сервера від провайдера — тимчасово опитуємо його.
  useEffect(() => {
    if (order?.paymentMethod === 'card' && order.paymentStatus === 'pending' && polls < 6) {
      const t = setTimeout(() => setPolls((p) => p + 1), 4000);
      return () => clearTimeout(t);
    }
  }, [order, polls]);

  if ((error as any)?.status === 404 || !token) return <NotFound title="Замовлення не знайдено" text="Перевірте посилання з підтвердження або зв’яжіться з магазином." />;
  if (error) return <div className="wrap section"><ErrorBox error={error} retry={() => { setError(undefined); setPolls((p) => p + 1); }} /></div>;
  if (!order) return <div className="wrap section"><div className="skel" style={{ height: 300 }} /></div>;

  async function pay() {
    setBusy(true);
    try { const r = await api<{ payment: PaymentForm }>(`/api/orders/${encodeURIComponent(number)}/pay?t=${encodeURIComponent(token)}`, { method: 'POST', body: {} }); redirectToPayment(r.payment); }
    catch (e) { setError(e as Error); setBusy(false); }
  }
  const c = order.contact;
  const awaiting = order.paymentMethod === 'card' && order.paymentStatus === 'pending';
  return (
    <div className="wrap">
      <div className="done">
        <div className="check"><Icon name="check" /></div>
        <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)' }}>{order.paymentStatus === 'failed' ? 'Замовлення створено, але оплата не пройшла' : 'Дякуємо! Замовлення прийнято'}</h1>
        <div className="muted">Номер вашого замовлення</div>
        <div className="order-no">№{order.number}</div>
        <p className="muted" style={{ maxWidth: '52ch' }}>Збережіть це посилання — за ним можна переглянути статус замовлення. {c.email ? 'Підтвердження може надійти на ' + c.email + '. ' : ''}Менеджер зв’яжеться з вами за телефоном {c.phone}.</p>
      </div>
      {awaiting && <div className="alert warn" style={{ marginBottom: 16 }} role="status">Чекаємо підтвердження оплати від платіжного провайдера. Якщо ви ще не оплатили — натисніть «Перейти до оплати».</div>}
      {order.paymentStatus === 'failed' && <div className="alert err" style={{ marginBottom: 16 }} role="alert">Оплата не пройшла. Замовлення збережено — спробуйте оплатити ще раз.</div>}
      {order.canPay && <p style={{ marginBottom: 20 }}><button className="btn accent" onClick={pay} disabled={busy}>{busy ? 'Переходимо…' : 'Перейти до оплати'}</button></p>}
      <div className="cart-layout" style={{ paddingBottom: 24 }}>
        <section className="co-block" aria-label="Склад замовлення">
          <h2>Склад замовлення</h2>
          <ul style={{ display: 'grid', gap: 14 }}>{order.items.map((i) => (
            <li key={i.id} className="mini-line"><LineThumb src={i.image} /><span>{i.name}<br /><span className="muted">{[i.variantLabel, `${i.qty} шт.`].filter(Boolean).join(' · ')}</span></span><span>{money(i.unitPrice * i.qty)}</span></li>
          ))}</ul>
          <Totals subtotal={order.subtotal} discount={order.discount} delivery={{ price: order.deliveryPrice, note: order.deliveryPrice ? undefined : 'За тарифами перевізника / безкоштовно' }} total={order.total} />
        </section>
        <aside className="summary" aria-label="Деталі замовлення">
          <h2>Деталі</h2>
          <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
            <div><dt className="muted">Статус</dt><dd style={{ margin: 0, fontWeight: 650 }}>{order.statusLabel}</dd></div>
            <div><dt className="muted">Оплата</dt><dd style={{ margin: 0 }}>{PAY_LABEL[order.paymentStatus] ?? order.paymentStatus}</dd></div>
            <div><dt className="muted">Доставка</dt><dd style={{ margin: 0 }}>{order.deliveryMethodName}{c.city ? `, ${c.city}` : ''}{c.address ? `, ${c.address}` : ''}</dd></div>
            <div><dt className="muted">Одержувач</dt><dd style={{ margin: 0 }}>{c.firstName} {c.lastName}, {c.phone}</dd></div>
            <div><dt className="muted">Створено</dt><dd style={{ margin: 0 }}>{dateTime(order.createdAt)}</dd></div>
          </dl>
          <Link to="/catalog" className="btn secondary">Продовжити покупки</Link>
        </aside>
      </div>
    </div>
  );
}
