import { useRef, useState, type FormEvent } from 'react';
import { NpCity, NpWarehouse } from '../components/NovaPoshta';
import { Empty, ErrorBox, Field } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { money, uid } from '../lib/format';
import { Link, navigate, useTitle } from '../lib/router';
import type { PaymentForm } from '../lib/types';
import { useCartPricing } from '../lib/useCartPricing';
import { clearCart } from '../store/cart';
import { useConfig } from '../store/config';
import { LineThumb, Totals } from './Cart';

const DRAFT_KEY = 'shop.checkout.v1';
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } }

/** Передає покупця на сторінку платіжного провайдера (LiqPay) через POST-форму. Дані картки магазин не бачить. */
export function redirectToPayment(p: PaymentForm) {
  const form = document.createElement('form');
  form.method = 'POST'; form.action = p.action; form.acceptCharset = 'utf-8';
  for (const [k, v] of Object.entries({ data: p.data, signature: p.signature })) {
    const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function Checkout() {
  useTitle('Оформлення замовлення');
  const cfg = useConfig();
  const { items, cart, loading, error: priceError, reload } = useCartPricing();
  const draft = useRef(loadDraft()).current;
  const [form, setForm] = useState({
    firstName: draft.firstName ?? '', lastName: draft.lastName ?? '', phone: draft.phone ?? '', email: draft.email ?? '',
    deliveryMethod: draft.deliveryMethod ?? cfg.deliveryMethods[0]?.id ?? '', city: draft.city ?? '', address: draft.address ?? '', comment: '',
    paymentMethod: draft.paymentMethod ?? cfg.paymentMethods[0]?.id ?? '',
  });
  const [cityRef, setCityRef] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [unavailable, setUnavailable] = useState<{ name: string; variantLabel: string; problem: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const lastPayload = useRef(''); const idem = useRef(uid());

  const method = cfg.deliveryMethods.find((d) => d.id === form.deliveryMethod);
  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setIssues((i) => ({ ...i, [k]: '' })); };

  if (!items.length && !busy) return <div className="wrap section"><div className="page-head" style={{ paddingTop: 0 }}><h1>Оформлення замовлення</h1></div><Empty title="Кошик порожній" text="Щоб оформити замовлення, додайте хоча б один товар."><Link to="/catalog" className="btn">До каталогу</Link></Empty></div>;

  const subtotal = cart?.subtotal ?? 0;
  const free = method && method.freeFrom !== null && subtotal >= method.freeFrom;
  const delivery = method ? (method.variable && !free ? { price: 0, note: 'За тарифами перевізника' } : { price: free ? 0 : method.price }) : null;
  const total = subtotal + (delivery?.price ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !cart) return;
    setFormError(undefined); setUnavailable([]);
    const local: Record<string, string> = {};
    if (!form.firstName.trim()) local.firstName = 'Вкажіть ім’я';
    if (!form.lastName.trim()) local.lastName = 'Вкажіть прізвище';
    if (!form.phone.trim()) local.phone = 'Вкажіть телефон, наприклад +380501234567';
    if (method && method.kind !== 'pickup') {
      if (!form.city.trim()) local.city = 'Вкажіть місто';
      if (!form.address.trim()) local.address = method.kind === 'branch' ? 'Оберіть або вкажіть відділення' : 'Вкажіть адресу доставки';
    }
    if (!form.deliveryMethod) local.deliveryMethod = 'Оберіть спосіб доставки';
    if (!form.paymentMethod) local.paymentMethod = 'Оберіть спосіб оплати';
    if (Object.keys(local).length) {
      setIssues(local);
      document.getElementById(`f-${Object.keys(local)[0]}`)?.focus();
      return;
    }
    const body = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
      deliveryMethod: form.deliveryMethod, city: method?.kind === 'pickup' ? undefined : form.city.trim(), address: method?.kind === 'pickup' ? undefined : form.address.trim(),
      comment: form.comment.trim() || undefined, paymentMethod: form.paymentMethod, items,
    };
    // Той самий ключ для точно такого самого запиту (повторне натискання / повтор після збою мережі) → сервер не створить дубль.
    const sig = JSON.stringify(body);
    if (sig !== lastPayload.current) { idem.current = uid(); lastPayload.current = sig; }
    setBusy(true);
    try {
      const r = await api<{ number: string; token: string; payment: PaymentForm | null }>('/api/orders', { body: { ...body, idempotencyKey: idem.current } });
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, deliveryMethod: form.deliveryMethod, city: form.city, address: form.address, paymentMethod: form.paymentMethod })); } catch { /* ігноруємо */ }
      clearCart();
      if (r.payment) { redirectToPayment(r.payment); return; }
      navigate(`/order/${encodeURIComponent(r.number)}?t=${r.token}`);
    } catch (err) {
      const e2 = err as ApiError;
      setIssues(e2.issues ?? {});
      if (e2.data?.unavailable) setUnavailable(e2.data.unavailable);
      setFormError(e2.message);
      if (e2.status === 409) reload();
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const inv = (k: string) => ({ id: `f-${k}`, 'aria-invalid': !!issues[k] });
  return (
    <div className="wrap">
      <div className="page-head"><h1>Оформлення замовлення</h1></div>
      {priceError && <ErrorBox error={priceError} retry={reload} />}
      {formError && (
        <div className="alert err" role="alert" style={{ marginBottom: 16 }}>
          <strong>{formError}</strong>
          {unavailable.length > 0 && <ul style={{ marginTop: 6 }}>{unavailable.map((u, i) => <li key={i}>{u.name}{u.variantLabel ? ` (${u.variantLabel})` : ''} — {u.problem}</li>)}</ul>}
          {unavailable.length > 0 && <p style={{ marginTop: 8 }}><Link to="/cart" className="text-link">Перейти до кошика</Link></p>}
        </div>
      )}
      <form className="cart-layout" onSubmit={submit} noValidate>
        <div>
          <section className="co-block" aria-labelledby="c1">
            <h2 id="c1">Контактні дані</h2>
            <div className="grid-2">
              <Field label="Ім’я" htmlFor="f-firstName" error={issues.firstName}><input {...inv('firstName')} className="input" autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
              <Field label="Прізвище" htmlFor="f-lastName" error={issues.lastName}><input {...inv('lastName')} className="input" autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Телефон" htmlFor="f-phone" error={issues.phone}><input {...inv('phone')} className="input" type="tel" autoComplete="tel" placeholder="+380501234567" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Email (необов’язково)" htmlFor="f-email" error={issues.email} hint="Для підтвердження замовлення"><input {...inv('email')} className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
          </section>

          <section className="co-block" aria-labelledby="c2">
            <h2 id="c2">Доставка</h2>
            <div role="radiogroup" aria-label="Спосіб доставки" style={{ display: 'grid', gap: 10 }}>
              {cfg.deliveryMethods.map((d) => {
                const fr = d.freeFrom !== null && subtotal >= d.freeFrom;
                return (
                  <label key={d.id} className="opt">
                    <input type="radio" name="delivery" checked={form.deliveryMethod === d.id} onChange={() => { set('deliveryMethod', d.id); set('address', ''); }} />
                    <span>{d.name}{d.description && <small>{d.description}</small>}{d.freeFrom !== null && !fr && <small>Безкоштовно від {money(d.freeFrom)}</small>}</span>
                    <strong>{fr ? 'Безкоштовно' : d.variable ? '' : d.price ? money(d.price) : 'Безкоштовно'}</strong>
                  </label>
                );
              })}
            </div>
            {issues.deliveryMethod && <span className="err" role="alert" style={{ color: 'var(--err)' }}>{issues.deliveryMethod}</span>}
            {method && method.kind !== 'pickup' && (
              <>
                <Field label="Місто" htmlFor="f-city" error={issues.city}>
                  {cfg.features.novaPoshta && method.id.startsWith('np')
                    ? <NpCity id="f-city" value={form.city} error={issues.city} onChange={(n, r) => { set('city', n); setCityRef(r); set('address', ''); }} />
                    : <input {...inv('city')} className="input" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />}
                </Field>
                <Field label={method.kind === 'branch' ? 'Відділення' : 'Адреса доставки'} htmlFor="f-address" error={issues.address}
                  hint={method.kind === 'branch' && !cfg.features.novaPoshta ? 'Довідник відділень не підключено — вкажіть номер відділення вручну.' : undefined}>
                  {method.kind === 'branch' && cfg.features.novaPoshta && method.id.startsWith('np')
                    ? <NpWarehouse id="f-address" cityRef={cityRef} value={form.address} error={issues.address} onChange={(v) => set('address', v)} />
                    : <input {...inv('address')} className="input" autoComplete="street-address" placeholder={method.kind === 'branch' ? 'Наприклад: Відділення №12' : 'Вулиця, будинок, квартира'} value={form.address} onChange={(e) => set('address', e.target.value)} />}
                </Field>
              </>
            )}
            {method?.kind === 'pickup' && cfg.contacts.address && <div className="info-box"><strong>Адреса самовивозу</strong><p>{cfg.contacts.address}{cfg.contacts.hours ? `. ${cfg.contacts.hours}` : ''}</p></div>}
            <Field label="Коментар до замовлення (необов’язково)" htmlFor="f-comment" error={issues.comment}><textarea id="f-comment" className="input" maxLength={500} value={form.comment} onChange={(e) => set('comment', e.target.value)} /></Field>
          </section>

          <section className="co-block" aria-labelledby="c3">
            <h2 id="c3">Оплата</h2>
            <div role="radiogroup" aria-label="Спосіб оплати" style={{ display: 'grid', gap: 10 }}>
              {cfg.paymentMethods.map((p) => (
                <label key={p.id} className="opt" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <input type="radio" name="payment" checked={form.paymentMethod === p.id} onChange={() => set('paymentMethod', p.id)} />
                  <span>{p.name}{p.description && <small>{p.description}</small>}{p.id === 'card' && <small>Ви перейдете на сторінку платіжного провайдера. Дані картки магазин не отримує.</small>}</span>
                </label>
              ))}
            </div>
            {issues.paymentMethod && <span role="alert" style={{ color: 'var(--err)' }}>{issues.paymentMethod}</span>}
          </section>
        </div>

        <aside className="summary" aria-label="Ваше замовлення">
          <h2>Ваше замовлення</h2>
          {!cart ? <div className="skel" style={{ height: 120 }} /> : (
            <>
              <ul style={{ display: 'grid', gap: 12 }}>
                {cart.lines.map((l) => (
                  <li key={l.variantId} className="mini-line">
                    <LineThumb src={l.image} />
                    <span>{l.name}<br /><span className="muted">{[l.variantLabel, `${l.qty} шт.`].filter(Boolean).join(' · ')}</span>{l.problem && <><br /><span className="line-problem">{l.problem}</span></>}</span>
                    <span>{money(l.unitPrice * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <Totals subtotal={cart.subtotal} discount={cart.discount} delivery={delivery} total={total} />
              {method?.variable && !free && <p className="muted" style={{ fontSize: '.85rem' }}>Вартість доставки сплачується перевізнику за його тарифами і не входить до суми замовлення.</p>}
              {!cart.ok && <div className="alert warn">Деякі товари змінилися. <Link to="/cart" className="text-link">Перевірити кошик</Link></div>}
            </>
          )}
          <button className="btn accent block" type="submit" disabled={busy || loading || !cart || !cart.ok}>
            {busy ? <><span className="spin" /> Оформлюємо…</> : form.paymentMethod === 'card' ? 'Оформити й перейти до оплати' : 'Підтвердити замовлення'}
          </button>
          <p className="muted" style={{ fontSize: '.8rem' }}>Натискаючи кнопку, ви погоджуєтесь з <Link to="/page/privacy" className="text-link">політикою конфіденційності</Link>.</p>
        </aside>
      </form>
    </div>
  );
}
