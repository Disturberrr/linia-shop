import { useEffect, useState } from 'react';
import { Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { toast } from '../store/toast';
import { A, ImageUploader, Panel, errText } from './common';

interface Cat { id?: number; name: string; slug: string; description: string; image: string | null; sortOrder: number; isActive: boolean }
const blank: Cat = { name: '', slug: '', description: '', image: null, sortOrder: 0, isActive: true };

function CatForm({ cat, onSaved, onCancel }: { cat: Cat; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<Cat>({ ...cat, image: cat.image ? (cat.image as any).base ?? cat.image : null });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setIssues({});
    try {
      await A(f.id ? `/api/admin/categories/${f.id}` : '/api/admin/categories', { method: f.id ? 'PUT' : 'POST', body: { name: f.name, slug: f.slug.trim() || undefined, description: f.description, image: f.image, sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive } });
      toast.ok('Категорію збережено'); onSaved();
    } catch (e) { setIssues((e as ApiError).issues ?? {}); toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <form className="stack cat-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid-2">
        <Field label="Назва" htmlFor="c-name" error={issues.name}><input id="c-name" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Адреса (slug)" htmlFor="c-slug" error={issues.slug} hint="Латиницею; порожньо — з назви"><input id="c-slug" className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
      </div>
      <Field label="Опис" htmlFor="c-desc"><textarea id="c-desc" className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Порядок" htmlFor="c-ord"><input id="c-ord" className="input" type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        <div className="checks" style={{ alignSelf: 'end' }}><label><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Показувати на сайті</label></div>
      </div>
      <div><div className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Фото категорії</div>
        <ImageUploader single images={f.image ? [{ url: f.image, alt: '' }] : []} onChange={(v) => setF({ ...f, image: v[0]?.url ?? null })} /></div>
      <div className="btn-row"><button className="btn small" disabled={busy}>{busy ? 'Збереження…' : 'Зберегти'}</button><button type="button" className="btn small secondary" onClick={onCancel}>Скасувати</button></div>
    </form>
  );
}

export function CategoriesAdmin() {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState<Cat | null>(null);
  const load = () => A('/api/admin/categories').then(setList).catch((e) => toast.error(errText(e)));
  useEffect(() => { load(); }, []);
  async function del(c: any) {
    if (!confirm(`Видалити категорію «${c.name}»?`)) return;
    try { await A(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); toast.ok('Категорію видалено'); load(); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Panel title="Категорії" actions={!edit && <button className="btn small" onClick={() => setEdit(blank)}>Додати категорію</button>}>
      {edit && <CatForm cat={edit} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Назва</th><th>Адреса</th><th>Товарів</th><th>Порядок</th><th>На сайті</th><th></th></tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.id}>
            <td style={{ width: 56 }}>{c.image && <img className="thumb-sm" src={c.image.thumb} alt="" />}</td>
            <td><strong>{c.name}</strong></td><td className="muted">{c.slug}</td><td>{c.productCount}</td><td>{c.sortOrder}</td><td>{c.isActive ? 'Так' : 'Ні'}</td>
            <td className="btn-row"><button className="btn small secondary" onClick={() => setEdit(c)}>Змінити</button><button className="btn small secondary danger" onClick={() => del(c)}>Видалити</button></td>
          </tr>))}</tbody>
      </table></div>
    </Panel>
  );
}
