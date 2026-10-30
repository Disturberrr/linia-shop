import { useCallback, useEffect, useState } from 'react';
import { ApiError, qs } from '../lib/api';
import { money } from '../lib/format';
import { Link, navigate } from '../lib/router';
import { toast } from '../store/toast';
import { Field } from '../components/ui';
import { A, ImageUploader, Pager, Panel, errText } from './common';

export function ProductsList() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState('active'); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(); const [cats, setCats] = useState<any[]>([]); const [err, setErr] = useState('');
  useEffect(() => { A('/api/admin/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => A(`/api/admin/products${qs({ q, status, category, page })}`).then(setData).catch((e) => setErr(errText(e))), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, status, category, page]);
  return (
    <Panel title="Товари" actions={<Link to="/admin/products/new" className="btn small">Додати товар</Link>}>
      <div className="filters-row">
        <input className="input" type="search" placeholder="Пошук за назвою" aria-label="Пошук товарів" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input" aria-label="Статус" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Усі</option><option value="active">Активні</option><option value="archived">В архіві</option></select>
        <select className="input" aria-label="Категорія" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">Усі категорії</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      {err && <div className="alert err">{err}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Назва</th><th>Категорія</th><th>Ціна</th><th>Залишок</th><th>Статус</th></tr></thead>
        <tbody>
          {data?.items.map((p: any) => (
            <tr key={p.id}>
              <td style={{ width: 56 }}>{p.image && <img className="thumb-sm" src={p.image.thumb} alt="" />}</td>
              <td><Link to={`/admin/products/${p.id}`} className="text-link">{p.name}</Link><br /><span className="muted">{p.variantCount} вар.</span></td>
              <td>{p.categoryName}</td>
              <td>{money(p.price)}{p.oldPrice ? <><br /><s className="muted">{money(p.oldPrice)}</s></> : null}</td>
              <td className={p.stock === 0 ? 'neg' : ''}>{p.stock}</td>
              <td><span className={`st ${p.status === 'active' ? 'st-completed' : 'st-cancelled'}`}>{p.status === 'active' ? 'Активний' : 'В архіві'}</span></td>
            </tr>
          ))}
          {data && !data.items.length && <tr><td colSpan={6} className="muted" style={{ padding: 24 }}>Товарів за цими умовами немає.</td></tr>}
        </tbody>
      </table></div>
      {data && <Pager page={page} pages={data.pages} onPage={setPage} />}
    </Panel>
  );
}

interface VariantForm { id?: number; size: string; color: string; colorHex: string; sku: string; stock: number }
const EMPTY = { name: '', slug: '', description: '', categoryId: 0, price: 0, oldPrice: null as number | null, isNew: false, isFeatured: false, status: 'active', attributes: [] as { name: string; value: string }[], images: [] as { url: string; alt: string }[], variants: [{ size: '', color: '', colorHex: '', sku: '', stock: 0 }] as VariantForm[] };

export function ProductEditor({ id }: { id?: string }) {
  const [f, setF] = useState<typeof EMPTY>(EMPTY);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    A('/api/admin/categories').then((c) => { setCats(c); if (!id) setF((x) => ({ ...x, categoryId: c[0]?.id ?? 0 })); });
    if (id) A(`/api/admin/products/${id}`).then((p) => {
      setF({ name: p.name, slug: p.slug, description: p.description, categoryId: p.categoryId, price: p.price, oldPrice: p.oldPrice, isNew: p.isNew, isFeatured: p.isFeatured, status: p.status,
        attributes: p.attributes, images: p.images.map((i: any) => ({ url: i.base, alt: i.alt })),
        variants: p.variants.map((v: any) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, sku: v.sku ?? '', stock: v.stock })) });
      setLoading(false);
    }).catch((e) => { toast.error(errText(e)); navigate('/admin/products'); });
  }, [id]);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => { setF((x) => ({ ...x, [k]: v })); setIssues((i) => ({ ...i, [k]: '' })); };
  const setVar = (i: number, patch: Partial<VariantForm>) => setF((x) => ({ ...x, variants: x.variants.map((v, k) => (k === i ? { ...v, ...patch } : v)) }));

  async function save() {
    setBusy(true); setIssues({});
    const body = { ...f, slug: f.slug.trim() || undefined, categoryId: Number(f.categoryId), price: Number(f.price), oldPrice: f.oldPrice ? Number(f.oldPrice) : null,
      attributes: f.attributes.filter((a) => a.name.trim() && a.value.trim()), variants: f.variants.map((v) => ({ ...v, sku: v.sku.trim() || undefined, stock: Number(v.stock) || 0 })) };
    try {
      const p = await A(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body });
      toast.ok('Товар збережено');
      if (!id) navigate(`/admin/products/${p.id}`, { replace: true });
    } catch (e) {
      setIssues((e as ApiError).issues ?? {});
      toast.error(errText(e));
    } finally { setBusy(false); }
  }
  async function archive() {
    if (!confirm('Архівувати товар? Він зникне з вітрини, але історія замовлень збережеться.')) return;
    try { await A(`/api/admin/products/${id}`, { method: 'DELETE' }); toast.ok('Товар архівовано'); navigate('/admin/products'); } catch (e) { toast.error(errText(e)); }
  }
  if (loading) return <div className="skel" style={{ height: 300 }} />;
  const iss = (k: string) => issues[k];
  return (
    <>
      <p><Link to="/admin/products" className="text-link">← Усі товари</Link></p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="stack">
        <Panel title={id ? 'Редагування товару' : 'Новий товар'} actions={id && f.status === 'active' ? <button type="button" className="btn small secondary danger" onClick={archive}>Архівувати</button> : null}>
          <Field label="Назва" htmlFor="p-name" error={iss('name')}><input id="p-name" className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Категорія" htmlFor="p-cat" error={iss('categoryId')}><select id="p-cat" className="input" value={f.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Статус" htmlFor="p-st"><select id="p-st" className="input" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Активний (видно на сайті)</option><option value="archived">В архіві (прихований)</option></select></Field>
          </div>
          <div className="grid-2">
            <Field label="Ціна, ₴" htmlFor="p-price" error={iss('price')}><input id="p-price" className="input" type="number" min={0} step={1} required value={f.price} onChange={(e) => set('price', Number(e.target.value))} /></Field>
            <Field label="Стара ціна, ₴" htmlFor="p-old" error={iss('oldPrice')} hint="Заповніть лише якщо є реальна знижка — мітка «−%» з’явиться автоматично"><input id="p-old" className="input" type="number" min={0} value={f.oldPrice ?? ''} onChange={(e) => set('oldPrice', e.target.value ? Number(e.target.value) : null)} /></Field>
          </div>
          <div className="checks"><label><input type="checkbox" checked={f.isNew} onChange={(e) => set('isNew', e.target.checked)} /> Новинка</label><label><input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Популярний (показувати на головній)</label></div>
          <Field label="Опис" htmlFor="p-desc" error={iss('description')}><textarea id="p-desc" className="input" rows={6} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Адреса сторінки (slug)" htmlFor="p-slug" error={iss('slug')} hint="Латиницею. Якщо порожньо — створиться з назви"><input id="p-slug" className="input" value={f.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
        </Panel>

        <Panel title="Фотографії"><ImageUploader images={f.images} onChange={(v) => set('images', v)} />{iss('images') && <span className="err">{iss('images')}</span>}</Panel>

        <Panel title="Варіанти та залишки" actions={<button type="button" className="btn small secondary" onClick={() => set('variants', [...f.variants, { size: '', color: '', colorHex: '', sku: '', stock: 0 }])}>Додати варіант</button>}>
          <p className="muted">Розмір і колір можна залишити порожніми, якщо варіантів немає. Комбінація «розмір + колір» має бути унікальною.</p>
          {Object.entries(issues).filter(([k]) => k.startsWith('variants')).map(([k, v]) => <div key={k} className="alert err">{v}</div>)}
          <div className="table-wrap"><table className="vtable">
            <thead><tr><th>Розмір</th><th>Колір</th><th>HEX</th><th>Артикул</th><th>Залишок</th><th></th></tr></thead>
            <tbody>{f.variants.map((v, i) => (
              <tr key={v.id ?? `n${i}`}>
                <td><input className="input" aria-label="Розмір" value={v.size} onChange={(e) => setVar(i, { size: e.target.value })} /></td>
                <td><input className="input" aria-label="Колір" value={v.color} onChange={(e) => setVar(i, { color: e.target.value })} /></td>
                <td><input className="input" aria-label="HEX кольору" placeholder="#000000" value={v.colorHex} onChange={(e) => setVar(i, { colorHex: e.target.value })} /></td>
                <td><input className="input" aria-label="Артикул" value={v.sku} onChange={(e) => setVar(i, { sku: e.target.value })} /></td>
                <td><input className="input" type="number" min={0} aria-label="Залишок" value={v.stock} onChange={(e) => setVar(i, { stock: Number(e.target.value) })} /></td>
                <td><button type="button" className="btn small secondary" disabled={f.variants.length === 1} onClick={() => set('variants', f.variants.filter((_, k) => k !== i))} aria-label="Видалити варіант">×</button></td>
              </tr>))}</tbody>
          </table></div>
        </Panel>

        <Panel title="Характеристики" actions={<button type="button" className="btn small secondary" onClick={() => set('attributes', [...f.attributes, { name: '', value: '' }])}>Додати</button>}>
          {f.attributes.map((a, i) => (
            <div key={i} className="grid-2" style={{ gridTemplateColumns: '1fr 1.5fr auto' }}>
              <input className="input" placeholder="Назва (напр. Склад)" aria-label="Назва характеристики" value={a.name} onChange={(e) => set('attributes', f.attributes.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input" placeholder="Значення" aria-label="Значення характеристики" value={a.value} onChange={(e) => set('attributes', f.attributes.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
              <button type="button" className="btn small secondary" onClick={() => set('attributes', f.attributes.filter((_, k) => k !== i))} aria-label="Видалити характеристику">×</button>
            </div>
          ))}
          {!f.attributes.length && <p className="muted">Характеристик поки немає.</p>}
        </Panel>
        <div className="save-bar"><button className="btn accent" type="submit" disabled={busy}>{busy ? 'Збереження…' : 'Зберегти товар'}</button></div>
      </form>
    </>
  );
}
