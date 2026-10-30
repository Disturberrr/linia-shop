import { Empty, ErrorBox, Picture, Price, Qty } from '../components/ui';
import { money, plural } from '../lib/format';
import { Link, navigate, useTitle } from '../lib/router';
import { useCartPricing } from '../lib/useCartPricing';
import type { PricedLine } from '../lib/types';
import { removeFromCart, setQty } from '../store/cart';

export function LineThumb({ src, alt = '' }: { src: string | null; alt?: string }) {
  return <div className="line-img">{src && <img src={`${src}.w400.webp`} alt={alt} loading="lazy" />}</div>;
}

export function CartLine({ l }: { l: PricedLine }) {
  return (
    <li className="line">
      <LineThumb src={l.image} />
      <div className="line-main">
        {l.slug ? <Link to={`/product/${l.slug}`}>{l.name}</Link> : <strong>{l.name}</strong>}
        {l.variantLabel && <span className="muted">{l.variantLabel}</span>}
        <Price price={l.unitPrice} oldPrice={l.oldPrice} />
        {l.problem && <span className="line-problem" role="alert">{l.problem}</span>}
        {l.problem && l.stock > 0 && l.qty > l.stock && <button className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setQty(l.variantId, l.stock)}>Залишити {l.stock} шт.</button>}
      </div>
      <div className="line-side">
        <strong>{money(l.unitPrice * l.qty)}</strong>
        {l.stock > 0 && <Qty value={l.qty} max={Math.min(l.stock, 20)} onChange={(n) => setQty(l.variantId, n)} label={`Кількість: ${l.name}`} />}
        <button className="link-btn" onClick={() => removeFromCart(l.variantId)} aria-label={`Видалити ${l.name} з кошика`}>Видалити</button>
      </div>
    </li>
  );
}

export function Totals({ subtotal, discount, delivery, total }: { subtotal: number; discount: number; delivery?: { price: number; note?: string } | null; total: number }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="sum-row"><span>Товари</span><span>{money(subtotal + discount)}</span></div>
      {discount > 0 && <div className="sum-row"><span>Знижка</span><span style={{ color: 'var(--sale)' }}>−{money(discount)}</span></div>}
      {delivery !== undefined && <div className="sum-row"><span>Доставка</span><span>{delivery === null ? 'Оберіть спосіб' : delivery.note ?? (delivery.price ? money(delivery.price) : 'Безкоштовно')}</span></div>}
      <div className="sum-row total"><span>Разом</span><span>{money(total)}</span></div>
    </div>
  );
}

export default function Cart() {
  useTitle('Кошик');
  const { items, cart, loading, error, reload } = useCartPricing();
  if (!items.length) return <div className="wrap section"><div className="page-head" style={{ paddingTop: 0 }}><h1>Кошик</h1></div><Empty title="У кошику поки порожньо" text="Додайте товари з каталогу — вони збережуться тут, навіть якщо ви закриєте сторінку."><Link to="/catalog" className="btn">Перейти до каталогу</Link></Empty></div>;
  const count = items.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="wrap">
      <div className="page-head"><h1>Кошик</h1><p>{count} {plural(count, 'товар', 'товари', 'товарів')}</p></div>
      {error && <ErrorBox error={error} retry={reload} />}
      <div className="cart-layout" aria-busy={loading}>
        <div>
          {!cart ? <div className="skel" style={{ height: 240 }} /> : <ul>{cart.lines.map((l) => <CartLine key={l.variantId} l={l} />)}</ul>}
          <p style={{ marginTop: 20 }}><Link to="/catalog" className="text-link">Продовжити покупки</Link></p>
        </div>
        <aside className="summary" aria-label="Підсумок замовлення">
          <h2>Підсумок</h2>
          {cart && <Totals subtotal={cart.subtotal} discount={cart.discount} delivery={{ price: 0, note: 'Розрахується під час оформлення' }} total={cart.subtotal} />}
          {cart && !cart.ok && <div className="alert warn">Деякі товари змінилися. Виправте їх у кошику, щоб оформити замовлення.</div>}
          <button className="btn accent block" disabled={!cart || !cart.ok || loading} onClick={() => navigate('/checkout')}>Оформити замовлення</button>
        </aside>
      </div>
    </div>
  );
}
