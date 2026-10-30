import { Link } from '../lib/router';
import { useConfig } from '../store/config';

export function Footer() {
  const { store, contacts, categories } = useConfig();
  const socials = [['Instagram', contacts.instagram], ['Facebook', contacts.facebook], ['Telegram', contacts.telegram]].filter(([, u]) => /^https?:\/\//.test(u));
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Link to="/" className="logo">{store.name}</Link>
            <p>{store.description}</p>
          </div>
          <nav aria-label="Категорії">
            <h4>Каталог</h4>
            <ul>
              {categories.map((c) => <li key={c.slug}><Link to={`/catalog?category=${c.slug}`}>{c.name}</Link></li>)}
              <li><Link to="/catalog?category=sale">Акції</Link></li>
            </ul>
          </nav>
          <nav aria-label="Інформація">
            <h4>Покупцям</h4>
            <ul>
              <li><Link to="/page/delivery">Доставка та оплата</Link></li>
              <li><Link to="/page/returns">Умови повернення</Link></li>
              <li><Link to="/page/privacy">Політика конфіденційності</Link></li>
              <li><Link to="/page/about">Про магазин</Link></li>
              <li><Link to="/contacts">Контакти</Link></li>
            </ul>
          </nav>
          <div>
            <h4>Зв’язок</h4>
            <ul>
              {contacts.phone && <li><a href={`tel:${contacts.phone.replace(/[^+\d]/g, '')}`}>{contacts.phone}</a></li>}
              {contacts.email && <li><a href={`mailto:${contacts.email}`}>{contacts.email}</a></li>}
              {contacts.address && <li>{contacts.address}</li>}
              {contacts.hours && <li>{contacts.hours}</li>}
              {socials.length > 0 && <li style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{socials.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer">{n}</a>)}</li>}
            </ul>
          </div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} {store.name}</span></div>
      </div>
    </footer>
  );
}
