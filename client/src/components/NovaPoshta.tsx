import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDebounced } from '../lib/hooks';

interface City { ref: string; name: string }
interface Wh { ref: string; name: string; number: string }

/** Вибір міста та відділення через довідник Нової пошти. Працює лише коли на сервері задано NOVAPOSHTA_API_KEY. */
export function NpCity({ value, onChange, error, id }: { value: string; onChange: (name: string, ref: string) => void; error?: string; id: string }) {
  const [text, setText] = useState(value);
  const [list, setList] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const q = useDebounced(text, 300);
  useEffect(() => {
    if (!open || q.trim().length < 2) { setList([]); return; }
    let live = true;
    api<City[]>(`/api/np/cities${qs({ q })}`).then((r) => { if (live) { setList(r); setFailed(false); } }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [q, open]);
  return (
    <div className="suggest">
      <input id={id} className="input" autoComplete="off" value={text} aria-invalid={!!error} aria-autocomplete="list" placeholder="Почніть вводити назву міста"
        onChange={(e) => { setText(e.target.value); setOpen(true); onChange(e.target.value, ''); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && list.length > 0 && <ul role="listbox">{list.map((c) => <li key={c.ref}><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(c.name); onChange(c.name, c.ref); setOpen(false); }}>{c.name}</button></li>)}</ul>}
      {failed && <span className="hint">Довідник Нової пошти недоступний — введіть місто вручну.</span>}
    </div>
  );
}

export function NpWarehouse({ cityRef, value, onChange, error, id }: { cityRef: string; value: string; onChange: (v: string) => void; error?: string; id: string }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [list, setList] = useState<Wh[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!cityRef) { setList([]); return; }
    let live = true;
    api<Wh[]>(`/api/np/warehouses${qs({ city: cityRef, q })}`).then((r) => { if (live) { setList(r); setFailed(false); } }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [cityRef, q]);
  if (!cityRef || failed) {
    return <input id={id} className="input" value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} placeholder="Номер відділення, напр. «Відділення №12»" />;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input className="input" type="search" placeholder="Пошук відділення за номером або вулицею" aria-label="Пошук відділення" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select id={id} className="input" value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)}>
        <option value="">Оберіть відділення</option>
        {list.map((w) => <option key={w.ref} value={w.name}>{w.name}</option>)}
      </select>
    </div>
  );
}
