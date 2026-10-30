import { useMemo, useState } from 'react';
import type { ProductDetail, Variant } from '../lib/types';
import { addToCart, cartItems } from '../store/cart';
import { toast } from '../store/toast';
import { Qty } from './ui';

/** Логіка вибору варіанта: розмір/колір, недоступні комбінації блокуються. Спільна для сторінки товару й швидкого додавання. */
export function useVariantPicker(p: ProductDetail) {
  const sizes = useMemo(() => [...new Set(p.variants.map((v) => v.size).filter(Boolean))], [p]);
  const colors = useMemo(() => {
    const out: { name: string; hex: string }[] = [];
    for (const v of p.variants) if (v.color && !out.some((c) => c.name === v.color)) out.push({ name: v.color, hex: v.colorHex });
    return out;
  }, [p]);
  const [size, setSize] = useState(sizes.length === 1 ? sizes[0] : '');
  const [color, setColor] = useState(colors.length === 1 ? colors[0].name : '');
  const [qty, setQty] = useState(1);
  const [showErr, setShowErr] = useState(false);

  const needSize = sizes.length > 0 && !size;
  const needColor = colors.length > 0 && !color;
  const variant: Variant | undefined = !needSize && !needColor ? p.variants.find((v) => v.size === size && v.color === color) : undefined;
  const inCart = variant ? cartItems().find((i) => i.variantId === variant.id)?.qty ?? 0 : 0;
  const stock = variant?.stock ?? 0;
  const free = Math.max(stock - inCart, 0);

  const sizeAvailable = (s: string) => p.variants.some((v) => v.size === s && v.stock > 0 && (!color || v.color === color));
  const colorAvailable = (c: string) => p.variants.some((v) => v.color === c && v.stock > 0 && (!size || v.size === size));

  const missing = [needSize && 'розмір', needColor && 'колір'].filter(Boolean).join(' і ');
  function add(): boolean {
    if (!variant) { setShowErr(true); toast.error(`Оберіть ${missing || 'варіант, що є в наявності'}`); return false; }
    if (stock <= 0) { toast.error('Цього варіанта немає в наявності'); return false; }
    return addToCart(variant.id, qty, stock) > 0;
  }
  return { sizes, colors, size, setSize, color, setColor, qty, setQty: (n: number) => setQty(Math.max(1, n)), variant, stock, free, inCart, sizeAvailable, colorAvailable, missing, showErr, add };
}

export function VariantOptions({ pk }: { pk: ReturnType<typeof useVariantPicker> }) {
  return (
    <>
      {pk.colors.length > 0 && (
        <div role="group" aria-label="Колір">
          <div className="opt-title">Колір <span>{pk.color || (pk.showErr ? 'оберіть колір' : '')}</span></div>
          <div className="chips">
            {pk.colors.map((c) => (
              <button key={c.name} type="button" className="swatch" style={{ background: c.hex || '#ccc' }} title={c.name} aria-label={c.name}
                aria-pressed={pk.color === c.name} disabled={!pk.colorAvailable(c.name)} onClick={() => pk.setColor(pk.color === c.name ? '' : c.name)} />
            ))}
          </div>
        </div>
      )}
      {pk.sizes.length > 0 && (
        <div role="group" aria-label="Розмір">
          <div className="opt-title">Розмір <span>{pk.showErr && !pk.size ? 'оберіть розмір' : ''}</span></div>
          <div className="chips">
            {pk.sizes.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={pk.size === s} disabled={!pk.sizeAvailable(s)} onClick={() => pk.setSize(pk.size === s ? '' : s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function StockNote({ pk }: { pk: ReturnType<typeof useVariantPicker> }) {
  if (!pk.variant) return <span className="stock" style={{ color: 'var(--muted)' }}>{pk.missing ? `Оберіть ${pk.missing}, щоб побачити наявність` : 'Немає в наявності'}</span>;
  if (pk.stock <= 0) return <span className="stock none">Немає в наявності</span>;
  if (pk.stock <= 3) return <span className="stock low">Залишилось {pk.stock} шт.</span>;
  return <span className="stock">В наявності</span>;
}

export function QtyPicker({ pk }: { pk: ReturnType<typeof useVariantPicker> }) {
  return <Qty value={Math.min(pk.qty, Math.max(pk.free, 1))} max={Math.max(pk.free, 1)} onChange={pk.setQty} />;
}
