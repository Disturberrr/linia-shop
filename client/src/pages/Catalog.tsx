import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { ProductCard, ProductGridSkeleton } from '../components/ProductCard';
import { Empty, ErrorBox, Modal } from '../components/ui';
import { api, qs } from '../lib/api';
import { plural } from '../lib/format';
import { useFetch } from '../lib/hooks';
import { Link, navigate, useLocation, useTitle } from '../lib/router';
import type { ProductSummary } from '../lib/types';
import { useConfig } from '../store/config';

interface Facets { minPrice: number; maxPrice: number; sizes: string[]; colors: { name: string; hex: string }[] }
interface Result { items: ProductSummary[]; total: number; page: number; pages: number }
const SORTS = [['', 'Рекомендовані'], ['new', 'Спочатку нові'], ['price_asc', 'Від дешевих до дорогих'], ['price_desc', 'Від дорогих до дешевих']] as const;
const csv = (s: string | null) => (s ? s.split(',').filter(Boolean) : []);

function useFilters() {
  const { search } = useLocation();
  const f = {
    category: search.get('category') ?? '', q: search.get('q') ?? '', sort: search.get('sort') ?? '',
    min: search.get('minPrice') ?? '', max: search.get('maxPrice') ?? '', sizes: csv(search.get('size')), colors: csv(search.get('color')),
  };
  const set = (patch: Partial<Record<'category' | 'q' | 'sort' | 'min' | 'max', string>> & { sizes?: string[]; colors?: string[] }) => {
    const n = { ...f, ...patch };
    navigate(`/catalog${qs({ category: n.category, q: n.q, sort: n.sort, minPrice: n.min, maxPrice: n.max, size: n.sizes.join(','), color: n.colors.join(',') })}`, { replace: true, scroll: false });
  };
  return { f, set };
}

function FilterPanel({ facets, onDone }: { facets?: Facets; onDone?: () => void }) {
  const { categories } = useConfig();
  const { f, set } = useFilters();
  const [min, setMin] = useState(f.min), [max, setMax] = useState(f.max);
  useEffect(() => { setMin(f.min); setMax(f.max); }, [f.min, f.max]);
  const apply = () => { if (min !== f.min || max !== f.max) set({ min, max }); };
  const toggle = (key: 'sizes' | 'colors', v: string) => set({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });
  return (
    <div className="filters-in" style={{ display: 'grid' }}>
      <div className="fgroup" style={{ borderTop: 0, paddingTop: 0 }}>
        <h3>Категорія</h3>
        <ul>
          <li><Link to={`/catalog${qs({ q: f.q })}`} aria-current={!f.category} onClick={onDone}>Усі товари</Link></li>
          {categories.map((c) => <li key={c.slug}><Link to={`/catalog${qs({ category: c.slug, q: f.q })}`} aria-current={f.category === c.slug} onClick={onDone}>{c.name}<span className="count">{c.productCount}</span></Link></li>)}
          <li><Link to={`/catalog${qs({ category: 'new', q: f.q })}`} aria-current={f.category === 'new'} onClick={onDone}>Новинки</Link></li>
          <li><Link to={`/catalog${qs({ category: 'sale', q: f.q })}`} aria-current={f.category === 'sale'} onClick={onDone}>Акції</Link></li>
        </ul>
      </div>
      <div className="fgroup">
        <h3>Ціна</h3>
        <form className="price-inputs" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <input className="input" inputMode="numeric" aria-label="Ціна від" placeholder={facets ? String(facets.minPrice) : 'від'} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} onBlur={apply} />
          <span aria-hidden="true">—</span>
          <input className="input" inputMode="numeric" aria-label="Ціна до" placeholder={facets ? String(facets.maxPrice) : 'до'} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} onBlur={apply} />
        </form>
      </div>
      {facets && facets.sizes.length > 0 && (
        <div className="fgroup"><h3>Розмір</h3><div className="chips">{facets.sizes.map((s) => <button key={s} className="chip" aria-pressed={f.sizes.includes(s)} onClick={() => toggle('sizes', s)}>{s}</button>)}</div></div>
      )}
      {facets && facets.colors.length > 0 && (
        <div className="fgroup"><h3>Колір</h3><div className="chips">{facets.colors.map((c) => <button key={c.name} className="swatch" style={{ background: c.hex }} title={c.name} aria-label={c.name} aria-pressed={f.colors.includes(c.name)} onClick={() => toggle('colors', c.name)} />)}</div></div>
      )}
    </div>
  );
}

export default function Catalog() {
  const { categories } = useConfig();
  const { f, set } = useFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const label = f.category === 'new' ? 'Новинки' : f.category === 'sale' ? 'Акції' : categories.find((c) => c.slug === f.category)?.name;
  const catObj = categories.find((c) => c.slug === f.category);
  const heading = f.q ? `Пошук: «${f.q}»` : label ?? 'Каталог';
  useTitle(`${heading} — ${useConfig().store.name}`);

  const facets = useFetch<Facets>(`/api/facets${qs({ category: f.category })}`).data;

  const key = JSON.stringify([f.category, f.q, f.sort, f.min, f.max, f.sizes, f.colors]);
  const [res, setRes] = useState<{ items: ProductSummary[]; total: number; page: number; pages: number }>();
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<Error>();
  const [tick, setTick] = useState(0);
  const reqId = useRef(0);

  const baseQuery = useMemo(() => ({ category: f.category, q: f.q, sort: f.sort, minPrice: f.min, maxPrice: f.max, size: f.sizes.join(','), color: f.colors.join(','), perPage: 12 }), [key]); // eslint-disable-line
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true); setError(undefined);
    api<Result>(`/api/products${qs({ ...baseQuery, page: 1 })}`)
      .then((r) => { if (id === reqId.current) { setRes(r); setLoading(false); } })
      .catch((e) => { if (id === reqId.current) { setError(e); setLoading(false); } });
  }, [baseQuery, tick]);

  async function loadMore() {
    if (!res) return;
    const id = reqId.current;
    setMore(true);
    try {
      const r = await api<Result>(`/api/products${qs({ ...baseQuery, page: res.page + 1 })}`);
      if (id === reqId.current) setRes({ ...r, items: [...res.items, ...r.items.filter((n) => !res.items.some((o) => o.id === n.id))] });
    } catch (e) { setError(e as Error); } finally { setMore(false); }
  }

  const pills: { label: string; clear: () => void }[] = [];
  if (f.q) pills.push({ label: `«${f.q}»`, clear: () => set({ q: '' }) });
  if (f.min || f.max) pills.push({ label: `Ціна: ${f.min || '0'}–${f.max || '∞'}`, clear: () => set({ min: '', max: '' }) });
  f.sizes.forEach((s) => pills.push({ label: `Розмір ${s}`, clear: () => set({ sizes: f.sizes.filter((x) => x !== s) }) }));
  f.colors.forEach((c) => pills.push({ label: c, clear: () => set({ colors: f.colors.filter((x) => x !== c) }) }));
  const anyFilter = pills.length > 0 || !!f.category;

  const invalidCategory = f.category && !label && categories.length > 0;
  return (
    <div className="wrap">
      <div className="page-head">
        <ol className="crumbs" aria-label="Навігація"><li><Link to="/">Головна</Link></li><li><Link to="/catalog">Каталог</Link></li>{label && <li aria-current="page">{label}</li>}</ol>
        <h1>{heading}</h1>
        {catObj?.description && <p>{catObj.description}</p>}
      </div>
      <div className="catalog">
        <aside className="filters" aria-label="Фільтри"><FilterPanel facets={facets} /></aside>
        <div>
          <div className="toolbar">
            <span className="found" aria-live="polite">{res && !loading ? `Знайдено: ${res.total} ${plural(res.total, 'товар', 'товари', 'товарів')}` : 'Завантаження…'}</span>
            <div className="toolbar-r">
              <button className="btn secondary small filter-toggle" onClick={() => setFiltersOpen(true)}><Icon name="filter" size={18} /> Фільтри{pills.length ? ` (${pills.length})` : ''}</button>
              <select className="input" style={{ minHeight: 38 }} aria-label="Сортування" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {pills.length > 0 && (
            <div className="active-filters">
              {pills.map((p) => <span key={p.label} className="pill">{p.label}<button onClick={p.clear} aria-label={`Прибрати фільтр ${p.label}`}>×</button></span>)}
              <button className="link-btn" onClick={() => navigate(`/catalog${qs({ category: f.category })}`, { replace: true, scroll: false })}>Скинути фільтри</button>
            </div>
          )}
          {error && <ErrorBox error={error} retry={() => setTick((t) => t + 1)} />}
          {invalidCategory ? (
            <Empty title="Такої категорії немає" text="Можливо, вона змінила назву. Перегляньте весь каталог."><Link to="/catalog" className="btn">До каталогу</Link></Empty>
          ) : loading && !more ? <ProductGridSkeleton n={8} /> : res && res.items.length > 0 ? (
            <>
              <div className="product-grid cols-3">{res.items.map((p, i) => <ProductCard key={p.id} p={p} eager={i < 3} />)}</div>
              {res.page < res.pages && (
                <div className="more">
                  <button className="btn secondary" onClick={loadMore} disabled={more}>{more ? <span className="spin" aria-label="Завантаження" /> : 'Показати ще'}</button>
                  <span>Показано {res.items.length} з {res.total}</span>
                </div>
              )}
            </>
          ) : !error && (
            <Empty title="Нічого не знайдено" text={f.q ? `За запитом «${f.q}» товарів немає. Перевірте написання або спробуйте коротше слово.` : 'За обраними фільтрами товарів немає. Спробуйте змінити або скинути фільтри.'}>
              {anyFilter && <button className="btn" onClick={() => navigate('/catalog', { replace: true, scroll: false })}>Скинути фільтри</button>}
            </Empty>
          )}
        </div>
      </div>
      {filtersOpen && (
        <Modal title="Фільтри" side="right" onClose={() => setFiltersOpen(false)}>
          <FilterPanel facets={facets} onDone={() => setFiltersOpen(false)} />
          <button className="btn block" style={{ marginTop: 20 }} onClick={() => setFiltersOpen(false)}>{res ? `Показати (${res.total})` : 'Показати'}</button>
        </Modal>
      )}
    </div>
  );
}
