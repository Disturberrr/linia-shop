import { useEffect, useState } from 'react';
import { api } from './api';
import type { PricedCart } from './types';
import { useCart } from '../store/cart';

/** Ціни, залишки й назви завжди беруться з сервера за variantId; у localStorage зберігаються лише id та кількість. */
export function useCartPricing() {
  const items = useCart();
  const sig = JSON.stringify(items);
  const [state, setState] = useState<{ cart?: PricedCart; loading: boolean; error?: Error }>({ loading: items.length > 0 });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!items.length) { setState({ loading: false, cart: { lines: [], subtotal: 0, discount: 0, ok: true } }); return; }
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const t = setTimeout(() => {
      api<PricedCart>('/api/cart/price', { body: { items }, signal: ac.signal })
        .then((cart) => setState({ cart, loading: false }))
        .catch((error) => { if (error.name !== 'AbortError') setState((s) => ({ ...s, loading: false, error })); });
    }, 120);
    return () => { clearTimeout(t); ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, tick]);
  return { items, ...state, reload: () => setTick((t) => t + 1) };
}
