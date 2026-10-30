import { useEffect, useState, type ReactNode } from 'react';
import { Field } from '../components/ui';
import { Link, navigate } from '../lib/router';
import { toast } from '../store/toast';
import { A, ImageUploader, Panel, errText } from './common';

function Section<T>({ title, k, data, children }: { title: string; k: string; data: T; children: (v: T, set: (v: T) => void) => ReactNode }) {
  const [v, setV] = useState<T>(data); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  async function save() {
    setBusy(true);
    try { setV(await A(`/api/admin/settings/${k}`, { method: 'PUT', body: v })); setDirty(false); toast.ok('Збережено'); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <Panel title={title}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }} onChange={() => setDirty(true)}>
        {children(v, (n) => { setV(n); setDirty(true); })}
        <div><button className="btn small" disabled={busy || !dirty}>{busy ? 'Збереження…' : 'Зберегти'}</button></div>
      </form>
    </Panel>
  );
}
const T = ({ label, value, onChange, hint, type = 'text', area }: { label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; area?: boolean }) => {
  const id = `s-${label}`;
  return <Field label={label} htmlFor={id} hint={hint}>{area ? <textarea id={id} className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} /> : <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
};

export function SettingsAdmin() {
  const [s, setS] = useState<any>(); const [integ, setInteg] = useState<any>();
  useEffect(() => { A('/api/admin/settings').then(setS).catch((e) => toast.error(errText(e))); A('/api/admin/integrations').then(setInteg).catch(() => {}); }, []);
  if (!s) return <div className="skel" style={{ height: 300 }} />;
  const img = (u: string) => (u ? [{ url: u, alt: '' }] : []);
  return (
    <div className="stack">
      <Section title="Магазин" k="store" data={s.store}>{(v: any, set) => <>
        <div className="grid-2"><T label="Назва" value={v.name} onChange={(x) => set({ ...v, name: x })} /><T label="Слоган" value={v.tagline} onChange={(x) => set({ ...v, tagline: x })} /></div>
        <T label="Короткий опис" area value={v.description} onChange={(x) => set({ ...v, description: x })} hint="Показується у підвалі та в описі сайту для пошуковиків" />
        <T label="Символ валюти" value={v.currency} onChange={(x) => set({ ...v, currency: x })} hint="Лише для відображення; онлайн-оплата виконується в гривнях (UAH)" />
        <div><div className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Логотип</div><ImageUploader single images={img(v.logo)} onChange={(i) => set({ ...v, logo: i[0]?.url ?? '' })} /></div>
      </>}</Section>
      <Section title="Головний екран" k="hero" data={s.hero}>{(v: any, set) => <>
        <div className="grid-2"><T label="Мітка над заголовком" value={v.eyebrow} onChange={(x) => set({ ...v, eyebrow: x })} /><T label="Заголовок" value={v.title} onChange={(x) => set({ ...v, title: x })} /></div>
        <T label="Підзаголовок" area value={v.subtitle} onChange={(x) => set({ ...v, subtitle: x })} />
        <div className="grid-2"><T label="Основна кнопка" value={v.ctaPrimary} onChange={(x) => set({ ...v, ctaPrimary: x })} /><T label="Додаткова кнопка (порожньо — без неї)" value={v.ctaSecondary} onChange={(x) => set({ ...v, ctaSecondary: x })} /></div>
        <div><div className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Зображення</div><ImageUploader single images={img(v.image)} onChange={(i) => set({ ...v, image: i[0]?.url ?? '' })} /></div>
      </>}</Section>
      <Section title="Контакти" k="contacts" data={s.contacts}>{(v: any, set) => <>
        <div className="grid-2"><T label="Телефон" value={v.phone} onChange={(x) => set({ ...v, phone: x })} /><T label="Email" value={v.email} onChange={(x) => set({ ...v, email: x })} /></div>
        <div className="grid-2"><T label="Адреса" value={v.address} onChange={(x) => set({ ...v, address: x })} /><T label="Графік роботи" value={v.hours} onChange={(x) => set({ ...v, hours: x })} /></div>
        <div className="grid-2"><T label="Instagram (повне посилання)" value={v.instagram} onChange={(x) => set({ ...v, instagram: x })} /><T label="Facebook" value={v.facebook} onChange={(x) => set({ ...v, facebook: x })} /></div>
        <T label="Telegram" value={v.telegram} onChange={(x) => set({ ...v, telegram: x })} />
      </>}</Section>
      <Section title="Переваги магазину" k="advantages" data={s.advantages}>{(v: any[], set) => <>
        {v.map((a, i) => <div key={i} className="grid-2" style={{ gridTemplateColumns: '1fr 2fr auto' }}>
          <input className="input" aria-label="Заголовок переваги" value={a.title} onChange={(e) => set(v.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
          <input className="input" aria-label="Текст переваги" value={a.text} onChange={(e) => set(v.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
          <button type="button" className="btn small secondary" onClick={() => set(v.filter((_, k) => k !== i))} aria-label="Видалити">×</button></div>)}
        <div><button type="button" className="btn small secondary" disabled={v.length >= 8} onClick={() => set([...v, { title: '', text: '' }])}>Додати перевагу</button></div>
        <p className="hint">Не вказуйте гарантії, терміни доставки чи сертифікати, якщо вони не підтверджені документами.</p>
      </>}</Section>
      <Section title="Способи доставки" k="deliveryMethods" data={s.deliveryMethods}>{(v: any[], set) => <>
        {v.map((d, i) => { const up = (p: any) => set(v.map((x, k) => (k === i ? { ...x, ...p } : x))); return (
          <fieldset key={d.id} className="fs">
            <div className="grid-2"><T label="Назва" value={d.name} onChange={(x) => up({ name: x })} /><T label="Опис" value={d.description} onChange={(x) => up({ description: x })} /></div>
            <div className="grid-2">
              <T label="Вартість, ₴" type="number" value={String(d.price)} onChange={(x) => up({ price: Number(x) || 0 })} />
              <T label="Безкоштовно від, ₴ (порожньо — ніколи)" type="number" value={d.freeFrom === null ? '' : String(d.freeFrom)} onChange={(x) => up({ freeFrom: x === '' ? null : Number(x) })} />
            </div>
            <div className="checks">
              <label><input type="checkbox" checked={d.enabled} onChange={(e) => up({ enabled: e.target.checked })} /> Увімкнено</label>
              <label><input type="checkbox" checked={d.variable} onChange={(e) => up({ variable: e.target.checked })} /> Вартість за тарифами перевізника (не входить у суму)</label>
              <span className="muted">Тип: {d.kind === 'branch' ? 'відділення' : d.kind === 'address' ? 'за адресою' : 'самовивіз'} · id: {d.id}</span>
            </div>
          </fieldset>); })}
      </>}</Section>
      <Section title="Способи оплати" k="paymentMethods" data={s.paymentMethods}>{(v: any[], set) => <>
        {v.map((p, i) => <fieldset key={p.id} className="fs">
          <div className="grid-2"><T label="Назва" value={p.name} onChange={(x) => set(v.map((o, k) => (k === i ? { ...o, name: x } : o)))} /><T label="Опис" value={p.description} onChange={(x) => set(v.map((o, k) => (k === i ? { ...o, description: x } : o)))} /></div>
          <div className="checks"><label><input type="checkbox" checked={p.enabled} onChange={(e) => set(v.map((o, k) => (k === i ? { ...o, enabled: e.target.checked } : o)))} /> Увімкнено</label>
            {p.id === 'card' && <span className="muted">{integ?.onlinePayment ? 'Ключі LiqPay задано — оплата карткою доступна покупцям.' : 'Ключі LiqPay не задано (.env) — на сайті цей спосіб прихований.'}</span>}</div>
        </fieldset>)}
      </>}</Section>
    </div>
  );
}

export function PagesAdmin({ slug }: { slug?: string }) {
  const [list, setList] = useState<any[]>([]); const [page, setPage] = useState<any>(); const [busy, setBusy] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  useEffect(() => { A('/api/admin/pages').then(setList).catch((e) => toast.error(errText(e))); }, [slug]);
  useEffect(() => { setPage(undefined); if (slug) A(`/api/admin/pages/${slug}`).then(setPage).catch((e) => (e.status === 404 ? setPage({ title: '', body: '' }) : toast.error(errText(e)))); }, [slug]);
  async function save() {
    setBusy(true);
    try { await A(`/api/admin/pages/${slug}`, { method: 'PUT', body: { title: page.title, body: page.body } }); toast.ok('Сторінку збережено'); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  if (slug) return (
    <>
      <p><Link to="/admin/pages" className="text-link">← Усі сторінки</Link></p>
      <Panel title={`Сторінка /page/${slug}`} actions={<a className="text-link" href={`/page/${slug}`} target="_blank" rel="noopener">Відкрити на сайті</a>}>
        {!page ? <div className="skel" style={{ height: 240 }} /> : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <T label="Заголовок" value={page.title} onChange={(x) => setPage({ ...page, title: x })} />
            <Field label="Текст" htmlFor="pg-body" hint="Абзаци розділяйте порожнім рядком. Заголовок розділу: рядок, що починається з «## ». Видаліть абзац «ЧЕРНЕТКА», коли текст перевірено."><textarea id="pg-body" className="input" rows={18} value={page.body} onChange={(e) => setPage({ ...page, body: e.target.value })} /></Field>
            <div><button className="btn small" disabled={busy}>{busy ? 'Збереження…' : 'Зберегти'}</button></div>
          </form>)}
      </Panel>
    </>
  );
  return (
    <Panel title="Сторінки (доставка, повернення, політика конфіденційності…)">
      <p className="muted">Юридичні тексти в цій демонстрації — чернетки. Замініть їх своїми й перевірте в юриста до запуску.</p>
      <ul className="log">{list.map((p) => <li key={p.slug}><Link to={`/admin/pages/${p.slug}`} className="text-link">{p.title}</Link> <span className="muted">/page/{p.slug}</span></li>)}</ul>
      <form className="btn-row" onSubmit={(e) => { e.preventDefault(); if (/^[a-z0-9-]+$/.test(newSlug)) navigate(`/admin/pages/${newSlug}`); else toast.error('Адреса: лише малі латинські літери, цифри та дефіси'); }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="адреса-нової-сторінки" aria-label="Адреса нової сторінки" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase())} />
        <button className="btn small secondary">Створити сторінку</button>
      </form>
    </Panel>
  );
}
