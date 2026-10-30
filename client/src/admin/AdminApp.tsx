import { useEffect, useState, type FormEvent } from 'react';
import { Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { dateTime } from '../lib/format';
import { Link, navigate, useLocation, useTitle } from '../lib/router';
import { toast } from '../store/toast';
import { CategoriesAdmin } from './Categories';
import { A, Panel, errText } from './common';
import { OrderDetail, OrdersList } from './Orders';
import { ProductEditor, ProductsList } from './Products';
import { PagesAdmin, SettingsAdmin } from './Settings';

function Login({ onDone }: { onDone: () => void }) {
  useTitle('Вхід — керування магазином');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await A('/api/admin/login', { body: { email, password } }); onDone(); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>Керування магазином</h1>
        <Field label="Email" htmlFor="l-email"><input id="l-email" className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Пароль" htmlFor="l-pass"><input id="l-pass" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Вхід…' : 'Увійти'}</button>
        <p className="hint">Реєстрації немає: обліковий запис адміністратора створюється власником командою <code>npm run create-admin</code>.</p>
      </form>
    </div>
  );
}

function Dashboard() {
  const [s, setS] = useState<any>(); const [i, setI] = useState<any>();
  useEffect(() => { A('/api/admin/summary').then(setS).catch((e) => toast.error(errText(e))); A('/api/admin/integrations').then(setI).catch(() => {}); }, []);
  const c = s?.orderCounts ?? {};
  const cards: [string, string][] = [['new', 'Нові'], ['confirmed', 'Підтверджені'], ['processing', 'Обробляються'], ['shipped', 'Відправлені']];
  return (
    <>
      <Panel title="Замовлення в роботі">
        <div className="stat-grid">{cards.map(([k, l]) => <Link key={k} to="/admin/orders" className="stat"><strong>{c[k] ?? 0}</strong><span>{l}</span></Link>)}</div>
      </Panel>
      <div className="two-col">
        <Panel title="Закінчуються на складі">
          {s?.lowStock.length ? <ul className="log">{s.lowStock.map((v: any) => <li key={v.id}><Link to={`/admin/products/${v.productId}`} className="text-link">{v.name}</Link> <span className="muted">{[v.size, v.color].filter(Boolean).join(' · ')}</span> — <strong className={v.stock === 0 ? 'neg' : ''}>{v.stock} шт.</strong></li>)}</ul> : <p className="muted">{s ? 'Усього вистачає.' : 'Завантаження…'}</p>}
        </Panel>
        <Panel title="Інтеграції">
          {i && <ul className="log">
            {([['onlinePayment', 'Онлайн-оплата (LiqPay)', 'LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY'], ['novaPoshta', 'Довідник Нової пошти', 'NOVAPOSHTA_API_KEY'], ['telegram', 'Сповіщення в Telegram', 'TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID'], ['email', 'Сповіщення на email (Resend)', 'RESEND_API_KEY, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO']] as const).map(([k, n, env]) => (
              <li key={k}><span className={`dotst ${i[k] ? 'on' : ''}`} /> <strong>{n}</strong>: {i[k] ? 'підключено' : <span className="muted">не налаштовано — задайте {env} у .env</span>}</li>))}
            <li className="muted">Публічна адреса: {i.publicUrl}</li>
          </ul>}
        </Panel>
      </div>
    </>
  );
}

const NAV: [string, string][] = [['/admin', 'Огляд'], ['/admin/orders', 'Замовлення'], ['/admin/products', 'Товари'], ['/admin/categories', 'Категорії'], ['/admin/pages', 'Сторінки'], ['/admin/settings', 'Налаштування']];

export default function AdminApp() {
  const { pathname } = useLocation();
  const [user, setUser] = useState<{ email: string } | null | undefined>(undefined);
  useTitle('Керування магазином');
  const check = () => A<{ user: { email: string } }>('/api/admin/me').then((r) => setUser(r.user)).catch(() => setUser(null));
  useEffect(() => { check(); }, []);
  useEffect(() => { document.querySelector('meta[name=robots]')?.setAttribute('content', 'noindex,nofollow'); }, []);
  if (user === undefined) return <div style={{ padding: 40 }} aria-busy="true">Завантаження…</div>;
  if (user === null) return <Login onDone={check} />;

  const logout = async () => { try { await A('/api/admin/logout', { method: 'POST', body: {} }); } finally { setUser(null); } };
  let m: RegExpExecArray | null; let body;
  if (pathname === '/admin') body = <Dashboard />;
  else if (pathname === '/admin/orders') body = <OrdersList />;
  else if ((m = /^\/admin\/orders\/(\d+)$/.exec(pathname))) body = <OrderDetail id={m[1]} key={m[1]} />;
  else if (pathname === '/admin/products') body = <ProductsList />;
  else if (pathname === '/admin/products/new') body = <ProductEditor key="new" />;
  else if ((m = /^\/admin\/products\/(\d+)$/.exec(pathname))) body = <ProductEditor id={m[1]} key={m[1]} />;
  else if (pathname === '/admin/categories') body = <CategoriesAdmin />;
  else if (pathname === '/admin/pages') body = <PagesAdmin />;
  else if ((m = /^\/admin\/pages\/([a-z0-9-]+)$/.exec(pathname))) body = <PagesAdmin slug={m[1]} key={m[1]} />;
  else if (pathname === '/admin/settings') body = <SettingsAdmin />;
  else body = <Panel title="Сторінку не знайдено"><Link to="/admin" className="text-link">До огляду</Link></Panel>;

  return (
    <div className="admin">
      <aside className="admin-side">
        <Link to="/admin" className="admin-brand">Керування</Link>
        <nav aria-label="Розділи панелі">
          {NAV.map(([to, label]) => <Link key={to} to={to} aria-current={to === '/admin' ? pathname === to : pathname.startsWith(to)}>{label}</Link>)}
        </nav>
        <div className="admin-user"><a href="/" target="_blank" rel="noopener">Відкрити магазин</a><span>{user.email}</span><button className="link-btn" onClick={logout}>Вийти</button></div>
      </aside>
      <main className="admin-main">{body}</main>
    </div>
  );
}
