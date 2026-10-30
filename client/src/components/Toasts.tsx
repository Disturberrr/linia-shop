import { dismiss, useToasts } from '../store/toast';
import { Link } from '../lib/router';

export function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          <span>{t.text}</span>
          {t.action && <Link to={t.action.to} onClick={() => dismiss(t.id)}>{t.action.label}</Link>}
          <button onClick={() => dismiss(t.id)} aria-label="Закрити сповіщення">×</button>
        </div>
      ))}
    </div>
  );
}
