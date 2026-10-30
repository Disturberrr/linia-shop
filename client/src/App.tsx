import { Suspense, lazy, useEffect, useState } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Toasts } from './components/Toasts';
import { ErrorBox } from './components/ui';
import { api } from './lib/api';
import { setCurrency } from './lib/format';
import { useLocation } from './lib/router';
import type { ShopConfig } from './lib/types';
import Cart from './pages/Cart';
import Catalog from './pages/Catalog';
import Checkout from './pages/Checkout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Order from './pages/Order';
import Product from './pages/Product';
import StaticPage, { Contacts } from './pages/Static';
import Wishlist from './pages/Wishlist';
import { ConfigContext } from './store/config';

const Admin = lazy(() => import('./admin/AdminApp'));

function Routes() {
  const { pathname } = useLocation();
  let m: RegExpExecArray | null;
  if (pathname === '/') return <Home />;
  if (pathname === '/catalog') return <Catalog />;
  if ((m = /^\/product\/([^/]+)$/.exec(pathname))) return <Product slug={decodeURIComponent(m[1])} />;
  if (pathname === '/cart') return <Cart />;
  if (pathname === '/wishlist') return <Wishlist />;
  if (pathname === '/checkout') return <Checkout />;
  if ((m = /^\/order\/([^/]+)$/.exec(pathname))) return <Order number={decodeURIComponent(m[1])} />;
  if ((m = /^\/page\/([^/]+)$/.exec(pathname))) return <StaticPage slug={decodeURIComponent(m[1])} />;
  if (pathname === '/contacts') return <Contacts />;
  return <NotFound />;
}

export default function App() {
  const { pathname } = useLocation();
  const [cfg, setCfg] = useState<ShopConfig>();
  const [error, setError] = useState<Error>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api<ShopConfig>('/api/config').then((c) => { setCurrency(c.store.currency); setCfg(c); }).catch(setError);
  }, [tick]);

  // Адмінка підвантажується окремим чанком і не збільшує вагу вітрини
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <Suspense fallback={<div style={{ padding: 40 }} aria-busy="true">Завантаження…</div>}><Admin /><Toasts /></Suspense>;
  }
  if (error) return <div className="wrap section"><ErrorBox error={error} retry={() => { setError(undefined); setTick((t) => t + 1); }} /></div>;
  if (!cfg) return <div className="wrap section" aria-busy="true"><div className="skel" style={{ height: 420 }} /></div>;
  return (
    <ConfigContext.Provider value={cfg}>
      <Header />
      <main id="main" tabIndex={-1}><Routes /></main>
      <Footer />
      <Toasts />
    </ConfigContext.Provider>
  );
}
