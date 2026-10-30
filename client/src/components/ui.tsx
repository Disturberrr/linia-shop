import { useEffect, useRef, type ReactNode } from 'react';
import { discountPct, money } from '../lib/format';
import type { Img } from '../lib/types';
import { Icon } from './Icon';

export function Price({ price, oldPrice, className = '' }: { price: number; oldPrice?: number | null; className?: string }) {
  const sale = !!oldPrice && oldPrice > price;
  return (
    <span className={`price ${sale ? 'sale' : ''} ${className}`}>
      <span>{money(price)}</span>
      {sale && <s aria-label={`Стара ціна ${money(oldPrice!)}`}>{money(oldPrice!)}</s>}
    </span>
  );
}

export function Picture({ img, sizes = '(max-width: 720px) 50vw, 25vw', eager = false, alt }: { img: Img | null; sizes?: string; eager?: boolean; alt?: string }) {
  if (!img) return <div className="skel" style={{ position: 'absolute', inset: 0, animation: 'none' }} aria-hidden="true" />;
  return <img src={img.src} srcSet={img.srcSet || undefined} sizes={img.srcSet ? sizes : undefined} alt={alt ?? img.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

export function Qty({ value, max, onChange, label = 'Кількість' }: { value: number; max: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Менше">−</button>
      <input type="number" inputMode="numeric" min={1} max={max} value={value} aria-label={label}
        onChange={(e) => { const n = Math.floor(Number(e.target.value)); if (n >= 1) onChange(Math.min(n, max)); }} />
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Більше">+</button>
    </div>
  );
}

export function Modal({ title, onClose, children, side }: { title: string; onClose: () => void; children: ReactNode; side?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    el.querySelector<HTMLElement>('input, button, select, a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className={`overlay ${side ?? ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={side ? 'drawer' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 style={{ fontSize: '1.25rem' }}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2>{text && <p>{text}</p>}{children}</div>;
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="alert err" role="alert" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span>{error.message}</span>{retry && <button className="btn small secondary" onClick={retry}>Повторити</button>}
    </div>
  );
}
