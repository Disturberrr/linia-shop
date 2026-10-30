import { useEffect, useState, type FormEvent } from 'react';
import { Link, navigate, useLocation } from '../lib/router';
import { useCartCount } from '../store/cart';
import { useConfig } from '../store/config';
import { useWishlist } from '../store/wishlist';
import { Icon } from './Icon';
import { Modal } from './ui';

export function Logo() {
  const { store } = useConfig();
  return (
    <Link to="/" className="logo" aria-label={`${store.name} — на головну`}>
      {store.logo ? <img src={`${store.logo}.w400.webp`} alt={store.name} /> : store.name}
    </Link>
  );
}

export function Header() {
  const cfg = useConfig();
  const cart = useCartCount();
  const wish = useWishlist().length;
  const { pathname, search } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { setMenu(false); setSearchOpen(false); }, [pathname, search.toString()]);
  useEffect(() => { if (pathname === '/catalog') setQ(search.get('q') ?? ''); }, [pathname, search]);
  const cat = pathname === '/catalog' ? search.get('category') : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    navigate(v ? `/catalog?q=${encodeURIComponent(v)}` : '/catalog');
  };
  const cur = (ok: boolean) => (ok ? { 'aria-current': 'page' as const } : {});

  return (
    <header className="header">
      <a href="#main" className="skip">Перейти до вмісту</a>
      <div className="wrap header-in">
        <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Відкрити меню"><Icon name="menu" /></button>
        <Logo />
        <nav className="nav" aria-label="Основна навігація">
          <Link to="/" {...cur(pathname === '/')}>Головна</Link>
          <div className="nav-drop">
            <Link to="/catalog" {...cur(pathname === '/catalog' && !cat)}>Каталог</Link>
            <div className="nav-drop-menu">
              <Link to="/catalog">Усі товари</Link>
              {cfg.categories.map((c) => <Link key={c.slug} to={`/catalog?category=${c.slug}`}>{c.name}<span>{c.productCount}</span></Link>)}
              <Link to="/catalog?category=new">Новинки</Link>
            </div>
          </div>
          <Link to="/catalog?category=sale" className="sale" {...cur(cat === 'sale')}>Акції</Link>
          <Link to="/page/about" {...cur(pathname === '/page/about')}>Про магазин</Link>
          <Link to="/contacts" {...cur(pathname === '/contacts')}>Контакти</Link>
        </nav>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="Пошук" aria-expanded={searchOpen}><Icon name="search" /></button>
          <Link to="/wishlist" className="icon-btn" aria-label={`Обране${wish ? `, товарів: ${wish}` : ''}`}>
            <Icon name="heart" />{wish > 0 && <span className="badge" aria-hidden="true">{wish}</span>}
          </Link>
          <Link to="/cart" className="icon-btn" aria-label={`Кошик${cart ? `, товарів: ${cart}` : ''}`}>
            <Icon name="bag" />{cart > 0 && <span className="badge" aria-hidden="true">{cart}</span>}
          </Link>
        </div>
      </div>
      {searchOpen && (
        <div className="search-bar">
          <form className="wrap" role="search" onSubmit={submit}>
            <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за назвою товару" aria-label="Пошук за назвою товару" />
            <button className="btn" type="submit">Шукати</button>
          </form>
        </div>
      )}
      {menu && (
        <Modal title={cfg.store.name} side="left" onClose={() => setMenu(false)}>
          <nav className="mobile-nav" aria-label="Мобільна навігація">
            <Link to="/">Головна</Link>
            <Link to="/catalog">Каталог</Link>
            <div className="sub">{cfg.categories.map((c) => <Link key={c.slug} to={`/catalog?category=${c.slug}`}>{c.name}</Link>)}<Link to="/catalog?category=new">Новинки</Link></div>
            <Link to="/catalog?category=sale">Акції</Link>
            <Link to="/page/about">Про магазин</Link>
            <Link to="/contacts">Контакти</Link>
          </nav>
        </Modal>
      )}
    </header>
  );
}
