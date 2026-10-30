import { Link } from '../lib/router';
import { useFetch } from '../lib/hooks';
import { useTitle } from '../lib/router';
import type { ProductSummary } from '../lib/types';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Picture } from '../components/ui';
import { useConfig } from '../store/config';

interface List { items: ProductSummary[]; total: number }

function Shelf({ title, url, to, cols = 4 }: { title: string; url: string; to: string; cols?: number }) {
  const { data, loading, error } = useFetch<List>(url);
  if (!loading && (error || !data?.items.length)) return null;
  return (
    <section className="section" style={{ paddingTop: 0 }} aria-labelledby={`h-${to}`}>
      <div className="wrap">
        <div className="section-head"><h2 id={`h-${to}`}>{title}</h2><Link to={to} className="text-link">Дивитися всі</Link></div>
        {loading || !data ? <ProductGridSkeleton n={cols} /> : <div className="product-grid">{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      </div>
    </section>
  );
}

export default function Home() {
  const { hero, categories, advantages, store } = useConfig();
  useTitle(`${store.name} — ${store.tagline}`);
  const img = hero.image ? { id: 0, base: hero.image, alt: hero.title, src: `${hero.image}.w1600.webp`, srcSet: `${hero.image}.w800.webp 800w, ${hero.image}.w1600.webp 1600w`, thumb: `${hero.image}.w400.webp` } : null;
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-in">
          <div className="hero-copy">
            {hero.eyebrow && <span className="hero-eyebrow">{hero.eyebrow}</span>}
            <h1 id="hero-title">{hero.title}</h1>
            {hero.subtitle && <p>{hero.subtitle}</p>}
            <div className="hero-cta">
              <Link to="/catalog" className="btn accent">{hero.ctaPrimary || 'Перейти до каталогу'}</Link>
              {hero.ctaSecondary && <Link to="/catalog?category=new" className="btn secondary">{hero.ctaSecondary}</Link>}
            </div>
          </div>
          {img && <div className="hero-media"><Picture img={img} eager sizes="(max-width: 860px) 100vw, 50vw" /></div>}
        </div>
      </section>

      <section className="section" aria-labelledby="h-cats">
        <div className="wrap">
          <div className="section-head"><h2 id="h-cats">Категорії</h2><Link to="/catalog" className="text-link">Увесь каталог</Link></div>
          <div className="cat-grid">
            {categories.map((c) => (
              <Link key={c.slug} to={`/catalog?category=${c.slug}`} className="cat-card">
                {c.image && <Picture img={c.image} sizes="(max-width: 560px) 50vw, 17vw" />}
                <span className="cat-label">{c.name}<span>{c.productCount}</span></span>
              </Link>
            ))}
            <Link to="/catalog?category=new" className="cat-card plain"><span className="cat-label">Новинки</span></Link>
          </div>
        </div>
      </section>

      <Shelf title="Популярні товари" url="/api/products?featured=1&perPage=4" to="/catalog" />
      <Shelf title="Новинки" url="/api/products?new=1&sort=new&perPage=4" to="/catalog?category=new" />
      <Shelf title="Спеціальні пропозиції" url="/api/products?sale=1&perPage=4" to="/catalog?category=sale" />

      {advantages.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }} aria-label="Переваги магазину">
          <div className="wrap"><div className="adv">{advantages.map((a) => <div key={a.title}><h3>{a.title}</h3><p>{a.text}</p></div>)}</div></div>
        </section>
      )}
    </>
  );
}
