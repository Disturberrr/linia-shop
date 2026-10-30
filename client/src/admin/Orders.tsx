import { useCallback, useEffect, useState } from 'react';
import { qs } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { Link } from '../lib/router';
import { toast } from '../store/toast';
import { A, Pager, Panel, errText } from './common';

const PAY: Record<string, string> = { pending: 'Очікує оплати', paid: 'Оплачено', failed: 'Не пройшла', cod: 'При отриманні' };
const ONE: Record<string, string> = { new: 'Новий', confirmed: 'Підтверджений', processing: 'Обробляється', shipped: 'Відправлений', completed: 'Виконаний', cancelled: 'Скасований' };
const STATUS_LABELS: Record<string, string> = { new: 'Нові', confirmed: 'Підтверджені', processing: 'Обробляються', shipped: 'Відправлені', completed: 'Виконані', cancelled: 'Скасовані' };

export function OrdersList() {
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(); const [err, setErr] = useState('');
  const load = useCallback(() => { A(`/api/admin/orders${qs({ status, q, page })}`).then(setData).catch((e) => setErr(errText(e))); }, [status, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  return (
    <Panel title="Замовлення">
      <div className="tabs" role="tablist">
        {[['', 'Усі'], ...Object.entries(STATUS_LABELS)].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={status === id} className="tab" onClick={() => { setStatus(id); setPage(1); }}>
            {label}{data && id && data.counts[id] ? <span className="tab-n">{data.counts[id]}</span> : null}
          </button>
        ))}
      </div>
      <input className="input" type="search" placeholder="Пошук за номером, телефоном або іменем" aria-label="Пошук замовлень" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 420 }} />
      {err && <div className="alert err">{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>№</th><th>Дата</th><th>Покупець</th><th>Товарів</th><th>Сума</th><th>Оплата</th><th>Статус</th></tr></thead>
          <tbody>
            {data?.items.map((o: any) => (
              <tr key={o.id}>
                <td><Link to={`/admin/orders/${o.id}`} className="text-link">{o.number}</Link></td>
                <td>{dateTime(o.createdAt)}</td><td>{o.firstName} {o.lastName}<br /><span className="muted">{o.phone}</span></td>
                <td>{o.itemCount}</td><td>{money(o.total)}</td><td>{PAY[o.paymentStatus] ?? o.paymentStatus}</td>
                <td><span className={`st st-${o.status}`}>{ONE[o.status] ?? o.status}</span></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={7} className="muted" style={{ padding: 24 }}>Замовлень за цими умовами немає.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} pages={data.pages} onPage={setPage} />}
    </Panel>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const [o, setO] = useState<any>(); const [err, setErr] = useState('');
  const load = useCallback(() => { A(`/api/admin/orders/${id}`).then(setO).catch((e) => setErr(errText(e))); }, [id]);
  useEffect(load, [load]);
  async function setStatus(status: string) {
    if (status === 'cancelled' && !confirm('Скасувати замовлення? Товари повернуться на склад.')) return;
    try { setO(await A(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: { status } })); toast.ok('Статус змінено'); } catch (e) { toast.error(errText(e)); }
  }
  async function setPayment(paymentStatus: string) {
    try { setO(await A(`/api/admin/orders/${id}/payment`, { method: 'PATCH', body: { paymentStatus } })); toast.ok('Статус оплати змінено'); load(); } catch (e) { toast.error(errText(e)); }
  }
  if (err) return <div className="alert err">{err}</div>;
  if (!o) return <div className="skel" style={{ height: 300 }} />;
  return (
    <>
      <p><Link to="/admin/orders" className="text-link">← Усі замовлення</Link></p>
      <Panel title={`Замовлення №${o.number}`} actions={<span className={`st st-${o.status}`}>{o.statusLabel}</span>}>
        <div className="detail-grid">
          <div>
            <h3>Покупець</h3>
            <p><strong>{o.firstName} {o.lastName}</strong><br /><a href={`tel:${o.phone}`}>{o.phone}</a>{o.email && <><br /><a href={`mailto:${o.email}`}>{o.email}</a></>}</p>
            <h3>Доставка</h3>
            <p>{o.deliveryMethodName}{o.city && <><br />{o.city}</>}{o.address && <><br />{o.address}</>}</p>
            {o.comment && <><h3>Коментар покупця</h3><p>{o.comment}</p></>}
          </div>
          <div>
            <h3>Статус замовлення</h3>
            <div className="btn-row">
              {o.allowedNext.length ? o.allowedNext.map((n: any) => <button key={n.id} className={`btn small ${n.id === 'cancelled' ? 'secondary danger' : ''}`} onClick={() => setStatus(n.id)}>{n.label}</button>) : <span className="muted">Кінцевий статус</span>}
            </div>
            <h3>Оплата</h3>
            <p>{o.paymentMethod === 'card' ? 'Картка онлайн' : 'При отриманні'} — <strong>{PAY[o.paymentStatus] ?? o.paymentStatus}</strong></p>
            {o.paymentMethod === 'card' && o.paymentStatus !== 'paid' && <button className="btn small secondary" onClick={() => confirm('Позначити як оплачене вручну? Робіть це лише після перевірки надходження коштів.') && setPayment('paid')}>Позначити як оплачене</button>}
          </div>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Товар</th><th>Варіант</th><th>Ціна</th><th>К-сть</th><th>Сума</th></tr></thead>
          <tbody>{o.items.map((i: any) => <tr key={i.id}><td>{i.name}</td><td>{i.variantLabel}{i.sku ? <span className="muted"> · {i.sku}</span> : null}</td><td>{money(i.unitPrice)}</td><td>{i.qty}</td><td>{money(i.unitPrice * i.qty)}</td></tr>)}</tbody>
          <tfoot>
            {o.discount > 0 && <tr><td colSpan={4}>Знижка</td><td>−{money(o.discount)}</td></tr>}
            <tr><td colSpan={4}>Доставка</td><td>{o.deliveryPrice ? money(o.deliveryPrice) : 'за тарифами перевізника / безкоштовно'}</td></tr>
            <tr><td colSpan={4}><strong>Разом</strong></td><td><strong>{money(o.total)}</strong></td></tr>
          </tfoot>
        </table></div>
      </Panel>
      <div className="two-col">
        <Panel title="Історія"><ul className="log">{o.events.map((e: any, i: number) => <li key={i}><span className="muted">{dateTime(e.createdAt)}</span> {e.detail}</li>)}</ul></Panel>
        <Panel title="Сповіщення про замовлення">
          {o.notifications.length ? <ul className="log">{o.notifications.map((n: any, i: number) => <li key={i}><strong>{n.channel}</strong>: {n.status === 'sent' ? 'надіслано' : n.status === 'skipped' ? 'не налаштовано' : 'помилка'} <span className="muted">{n.detail}</span></li>)}</ul> : <p className="muted">Ще немає записів.</p>}
        </Panel>
      </div>
    </>
  );
}
