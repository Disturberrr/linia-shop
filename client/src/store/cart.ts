import { createStore } from './createStore';
import { toast } from './toast';

export interface CartItem { variantId: number; qty: number }
const MAX_QTY = 20;

const store = createStore<CartItem[]>('shop.cart.v1', [], (v) => {
  if (!Array.isArray(v)) return [];
  return v.filter((i) => Number.isInteger(i?.variantId) && Number.isInteger(i?.qty) && i.qty > 0).slice(0, 50).map((i) => ({ variantId: i.variantId, qty: Math.min(i.qty, MAX_QTY) }));
});

export const useCart = store.use;
export const useCartCount = () => store.use().reduce((s, i) => s + i.qty, 0);
export const cartItems = store.get;

/** Додає товар; не дозволяє перевищити залишок. Повертає фактично додану кількість. */
export function addToCart(variantId: number, qty: number, stock: number): number {
  const items = store.get();
  const cur = items.find((i) => i.variantId === variantId)?.qty ?? 0;
  const limit = Math.min(stock, MAX_QTY);
  const next = Math.min(cur + qty, limit);
  const added = next - cur;
  if (added <= 0) { toast.error(stock <= cur ? `У кошику вже максимум доступної кількості (${cur} шт.)` : 'Більше додати не можна'); return 0; }
  store.set(cur ? items.map((i) => (i.variantId === variantId ? { ...i, qty: next } : i)) : [...items, { variantId, qty: next }]);
  return added;
}
export const setQty = (variantId: number, qty: number) =>
  store.set(store.get().map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(qty, MAX_QTY)) } : i)));
export const removeFromCart = (variantId: number) => store.set(store.get().filter((i) => i.variantId !== variantId));
export const clearCart = () => store.set([]);
export const setCartItems = (items: CartItem[]) => store.set(items);
export { MAX_QTY };
