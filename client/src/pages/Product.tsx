import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ProductCard } from '../components/ProductCard';
import { QtyPicker, StockNote, VariantOptions, useVariantPicker } from '../components/Variants';
import { Picture, Price, ErrorBox } from '../components/ui';
import { discountPct } from '../lib/format';
import { useFetch } from '../lib/hooks';
import { Link, navigate, useTitle } from '../lib/router';
import type { ProductDetail, ProductSummary } from '../lib/types';
import { useConfig } from '../store/config';
import { toast } from '../store/toast';
import { toggleWish, useWishlist } from '../store/wishlist';
import NotFound from './NotFound';

function Gallery({ p }: { p: ProductDetail }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [p.id]);
  const imgs = p.images;
  const go = (d: number) => setI((i + d + imgs.length) % imgs.length);
  return (
    <div className="gallery" aria-roledescription="галерея" aria-label={`Фото: ${p.name}`}>
      <div className="gallery-main" tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}>
        <Picture img={imgs[i] ?? null} eager sizes="(max-width: 860px) 100vw, 55vw" />
        {imgs.length > 1 && <>
          <button className="icon-btn gal-nav prev" onClick={() => go(-1)} aria-label="Попереднє фото"><Icon name="left" /></button>
          <button className="icon-btn gal-nav next" onClick={() => go(1)} aria-label="Наступне фото"><Icon name="right" /></button>
        </>}
      </div>
      {imgs.length > 1 && (
        <div className="gallery-thumbs">
          {imgs.map((im, k) => <button key={im.id} className="thumb" aria-current={k === i} aria-label={`Фото ${k + 1} з ${imgs.length}`} onClick={() => setI(k)}><img src={im.thumb} alt="" loading="lazy" /></button>)}
        </div>
      )}
    </div>
  );
}

function Buy({ p }: { p: ProductDetail }) {
  const cfg = useConfig();
  const pk = useVariantPicker(p);
  const wish = useWishlist().includes(p.slug);
  const pct = discountPct(p.price, p.oldPrice);
  const soldOut = !p.inStock;
  const blocked = pk.variant ? pk.free <= 0 : false;
  return (
    <div className="pdp-info">
      <div style={{ display: 'grid', gap: 10 }}>
        <ol className="crumbs" aria-label="Навігація"><li><Link to="/">Головна</Link></li><li><Link to={`/catalog?category=${p.category.slug}`}>{p.category.name}</Link></li></ol>
        <h1>{p.name}</h1>
        <div className="pdp-price price"><Price price={p.price} oldPrice={p.oldPrice} />{pct > 0 && <span className="pct">−{pct}%</span>}</div>
      </div>
      {soldOut ? <div className="alert warn">Цього товару зараз немає в наявності.</div> : <>
        <VariantOptions pk={pk} />
        <StockNote pk={pk} />
        <div className="buy-row">
          <QtyPicker pk={pk} />
          <button className="btn" disabled={blocked} onClick={() => { if (pk.add()) toast.ok(`«${p.name}» додано до кошика`, { label: 'Відкрити кошик', to: '/cart' }); }}>
            {blocked ? 'Максимум у кошику' : 'Додати до кошика'}
          </button>
        </div>
        <button className="btn accent block" disabled={blocked && !pk.variant} onClick={() => { if (blocked || pk.add()) navigate('/checkout'); }}>Купити зараз</button>
      </>}
      <button className="btn secondary" aria-pressed={wish} onClick={() => toggleWish(p.slug)}>{wish ? 'В обраному' : 'Додати до обраного'}</button>
      {p.description && <p className="desc">{p.description}</p>}
      {p.attributes.length > 0 && <dl className="specs" style={{ margin: 0 }}>{p.attributes.map((a) => <div key={a.name}><dt>{a.name}</dt><dd>{a.value}</dd></div>)}</dl>}
      <div className="info-box">
        <strong>Доставка</strong>
        <p>{cfg.deliveryMethods.map((d) => d.name).join(', ')}. Вартість і умови — на етапі оформлення.</p>
        <strong style={{ marginTop: 8 }}>Оплата</strong>
        <p>{cfg.paymentMethods.map((d) => d.name).join(', ')}.</p>
      </div>
    </div>
  );
}

export default function Product({ slug }: { slug: string }) {
  const { data, error, loading } = useFetch<{ product: ProductDetail; related: ProductSummary[] }>(`/api/products/${encodeURIComponent(slug)}`);
  const store = useConfig().store.name;
  useTitle(data ? `${data.product.name} — ${store}` : undefined);
  if (error && (error as any).status === 404) return <NotFound title="Товар не знайдено" text="Такого товару немає або його знято з продажу." />;
  if (error) return <div className="wrap section"><ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="wrap section"><div className="pdp"><div className="skel" style={{ aspectRatio: '4/5' }} /><div style={{ display: 'grid', gap: 14 }}><div className="skel" style={{ height: 40 }} /><div className="skel" style={{ height: 28, width: '30%' }} /><div className="skel" style={{ height: 160 }} /></div></div></div>;
  const { product: p, related } = data;
  return (
    <div className="wrap" style={{ paddingTop: 24 }}>
      <div className="pdp" key={p.id}><Gallery p={p} /><Buy p={p} /></div>
      {related.length > 0 && (
        <section className="section" aria-labelledby="rel"><div className="section-head"><h2 id="rel">Схожі товари</h2></div>
          <div className="product-grid">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}
