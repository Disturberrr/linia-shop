import { Link, useTitle } from '../lib/router';

export default function NotFound({ title = 'Сторінку не знайдено', text = 'Можливо, адресу введено з помилкою або сторінку видалено.' }: { title?: string; text?: string }) {
  useTitle(title);
  return (
    <div className="wrap notfound">
      <div className="big" aria-hidden="true">404</div>
      <h1 style={{ fontSize: '1.8rem' }}>{title}</h1>
      <p className="muted">{text}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}><Link to="/" className="btn">На головну</Link><Link to="/catalog" className="btn secondary">До каталогу</Link></div>
    </div>
  );
}
