import { useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import { toast } from '../store/toast';

export const A = <T = any,>(path: string, opts: Parameters<typeof api>[1] = {}) => api<T>(path, { ...opts, admin: true });

export function errText(e: unknown) {
  const err = e as ApiError;
  const iss = Object.values(err.issues ?? {}).filter(Boolean);
  return iss.length ? `${err.message}: ${iss.join('; ')}` : err.message;
}

/** Завантаження фото: сервер перевіряє тип за вмістом і створює три розміри WebP. */
export function ImageUploader({ images, onChange, max = 12, single = false }: { images: { url: string; alt: string }[]; onChange: (v: { url: string; alt: string }[]) => void; max?: number; single?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let next = [...images];
    for (const f of [...files].slice(0, max - (single ? 0 : images.length))) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`«${f.name}» більше 8 МБ`); continue; }
      try {
        const r = await A<{ url: string }>('/api/admin/uploads', { raw: f });
        next = single ? [{ url: r.url, alt: '' }] : [...next, { url: r.url, alt: '' }];
      } catch (e) { toast.error(`${f.name}: ${errText(e)}`); }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  }
  const move = (i: number, d: number) => { const n = [...images]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="uploader">
      <div className="up-grid">
        {images.map((im, i) => (
          <div key={im.url} className="up-item">
            <img src={`${im.url}.w400.webp`} alt={im.alt} />
            {!single && <input className="input" placeholder="Опис фото (alt)" aria-label={`Опис фото ${i + 1}`} value={im.alt} onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} />}
            <div className="up-actions">
              {!single && <><button type="button" className="btn small secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Перемістити лівіше">←</button>
              <button type="button" className="btn small secondary" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Перемістити правіше">→</button></>}
              <button type="button" className="btn small secondary" onClick={() => onChange(images.filter((_, k) => k !== i))}>Видалити</button>
            </div>
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={!single} hidden onChange={(e) => pick(e.target.files)} />
      <button type="button" className="btn secondary small" disabled={busy || (!single && images.length >= max)} onClick={() => input.current?.click()}>{busy ? 'Завантаження…' : single && images.length ? 'Замінити фото' : 'Завантажити фото'}</button>
      <span className="hint"> JPEG, PNG або WebP до 8 МБ{single ? '' : '. Перше фото — головне.'}</span>
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager" role="navigation" aria-label="Сторінки">
      <button className="btn small secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button>
      <span>{page} / {pages}</span>
      <button className="btn small secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Далі</button>
    </div>
  );
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{actions}</div>{children}</section>;
}
