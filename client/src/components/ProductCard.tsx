import { useState } from 'react';
import { discountPct } from '../lib/format';
import type { ProductSummary } from '../lib/types';
import { Link } from '../lib/router';
import { toggleWish, useWishlist } from '../store/wishlist';
import { Icon } from './Icon';
import { QuickAdd } from './QuickAdd';
import { Picture, Price } from './ui';

export function ProductCard({ p, eager }: { p: ProductSummary; eager?: boolean }) {
  const wish = useWishlist().includes(p.slug);
  const [quick, setQuick] = useState(false);
  const pct = discountPct(p.price, p.oldPrice);
  return (
    <article className="card">
      <div className="card-media">
        <Picture img={p.image} eager={eager} />
        {p.secondImage && <Picture img={p.secondImage} alt="" />}
        <div className="card-tags">
          {!p.inStock ? <span className="tag out">Немає в наявності</span> : <>
            {p.isNew && <span className="tag new">Новинка</span>}
            {pct > 0 && <span className="tag sale">−{pct}%</span>}
          </>}
        </div>
        <button type="button" className="icon-btn wish" aria-pressed={wish} aria-label={wish ? `Прибрати «${p.name}» з обраного` : `Додати «${p.name}» до обраного`} onClick={() => toggleWish(p.slug)}>
          <Icon name="heart" />
        </button>
      </div>
      <div className="card-body">
        <Link to={`/product/${p.slug}`} className="card-name">{p.name}</Link>
        <Price price={p.price} oldPrice={p.oldPrice} />
        {(p.colors.length > 1 || p.sizes.length > 1) && (
          <div className="card-meta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {p.colors.length > 1 && <span className="dots" aria-label={`Кольорів: ${p.colors.length}`}>{p.colors.slice(0, 5).map((c) => <span key={c.name} className="dot" style={{ background: c.hex }} title={c.name} />)}</span>}
            {p.sizes.length > 1 && <span>{p.sizes[0]}–{p.sizes[p.sizes.length - 1]}</span>}
          </div>
        )}
      </div>
      <button type="button" className="btn secondary small card-add" disabled={!p.inStock} onClick={() => setQuick(true)}>
        {p.inStock ? 'Додати до кошика' : 'Немає в наявності'}
      </button>
      {quick && <QuickAdd slug={p.slug} onClose={() => setQuick(false)} />}
    </article>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="product-grid" aria-busy="true" aria-label="Завантаження товарів">
      {Array.from({ length: n }, (_, i) => <div key={i} style={{ display: 'grid', gap: 10 }}><div className="skel" style={{ aspectRatio: '4/5', borderRadius: 10 }} /><div className="skel" style={{ height: 16, width: '70%' }} /><div className="skel" style={{ height: 16, width: '30%' }} /></div>)}
    </div>
  );
}
