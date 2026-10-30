import { createStore } from './createStore';

const store = createStore<string[]>('shop.wishlist.v1', [], (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, 200) : []));
export const useWishlist = store.use;
export const toggleWish = (slug: string) => {
  const cur = store.get();
  store.set(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
};
export const removeWish = (slug: string) => store.set(store.get().filter((s) => s !== slug));
