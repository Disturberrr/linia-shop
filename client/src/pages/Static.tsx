import { Fragment } from 'react';
import { useFetch } from '../lib/hooks';
import { Link, useTitle } from '../lib/router';
import { ErrorBox } from '../components/ui';
import { useConfig } from '../store/config';
import NotFound from './NotFound';

/** Дуже проста розмітка текстових сторінок: «## Заголовок», абзаци через порожній рядок; чернетка в [квадратних дужках] виділяється. */
export function Prose({ body }: { body: string }) {
  return (
    <div className="prose">
      {body.split(/\n\s*\n/).map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        if (t.startsWith('## ')) return <h2 key={i}>{t.slice(3)}</h2>;
        if (t.startsWith('[ЧЕРНЕТКА')) return <p key={i} className="draft">{t.replace(/^\[|\]$/g, '')}</p>;
        return <p key={i}>{t.split('\n').map((l, k) => <Fragment key={k}>{k > 0 && <br />}{l}</Fragment>)}</p>;
      })}
    </div>
  );
}

export default function StaticPage({ slug }: { slug: string }) {
  const { data, error, loading } = useFetch<{ title: string; body: string }>(`/api/pages/${encodeURIComponent(slug)}`);
  const store = useConfig().store.name;
  useTitle(data ? `${data.title} — ${store}` : undefined);
  if ((error as any)?.status === 404) return <NotFound />;
  if (error) return <div className="wrap section"><ErrorBox error={error} /></div>;
  return (
    <div className="wrap">
      <div className="page-head"><ol className="crumbs"><li><Link to="/">Головна</Link></li></ol><h1>{data?.title ?? ' '}</h1></div>
      {loading || !data ? <div className="skel" style={{ height: 200, maxWidth: 700 }} /> : <Prose body={data.body} />}
    </div>
  );
}

export function Contacts() {
  const { contacts, store } = useConfig();
  useTitle(`Контакти — ${store.name}`);
  const socials = [['Instagram', contacts.instagram], ['Facebook', contacts.facebook], ['Telegram', contacts.telegram]].filter(([, u]) => /^https?:\/\//.test(u));
  return (
    <div className="wrap">
      <div className="page-head"><h1>Контакти</h1></div>
      <div className="contact-grid">
        {contacts.phone && <div className="contact-card"><h2>Телефон</h2><a href={`tel:${contacts.phone.replace(/[^+\d]/g, '')}`}>{contacts.phone}</a></div>}
        {contacts.email && <div className="contact-card"><h2>Email</h2><a href={`mailto:${contacts.email}`}>{contacts.email}</a></div>}
        {contacts.address && <div className="contact-card"><h2>Адреса</h2><p>{contacts.address}</p></div>}
        {contacts.hours && <div className="contact-card"><h2>Графік роботи</h2><p>{contacts.hours}</p></div>}
        {socials.length > 0 && <div className="contact-card"><h2>Соцмережі</h2>{socials.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer">{n}</a>)}</div>}
      </div>
    </div>
  );
}
