import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Empty, ErrorBox } from '../components/ui';
import { qs } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { Link, useTitle } from '../lib/router';
import type { ProductSummary } from '../lib/types';
import { removeWish, useWishlist } from '../store/wishlist';

export default function Wishlist() {
  useTitle('Обране');
  const slugs = useWishlist();
  const { data, loading, error } = useFetch<{ items: ProductSummary[] }>(slugs.length ? `/api/products${qs({ slugs: slugs.join(','), perPage: 48 })}` : null, [slugs.length]);
  const items = data?.items.filter((p) => slugs.includes(p.slug)) ?? [];
  return (
    <div className="wrap">
      <div className="page-head"><h1>Обране</h1></div>
      {!slugs.length ? <Empty title="В обраному поки нічого немає" text="Натисніть на серце біля товару, щоб зберегти його тут."><Link to="/catalog" className="btn">До каталогу</Link></Empty>
        : error ? <ErrorBox error={error} /> : loading && !data ? <ProductGridSkeleton n={Math.min(slugs.length, 8)} /> : (
          <>
            {items.length < slugs.length && <div className="alert warn" style={{ marginBottom: 20 }}>Деякі збережені товари більше недоступні. <button className="link-btn" onClick={() => slugs.filter((s) => !items.some((p) => p.slug === s)).forEach(removeWish)}>Прибрати їх</button></div>}
            <div className="product-grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          </>
        )}
    </div>
  );
}
