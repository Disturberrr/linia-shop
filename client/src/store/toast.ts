import { createStore } from './createStore';

export interface Toast { id: number; kind: 'ok' | 'error'; text: string; action?: { label: string; to: string } }
const store = createStore<Toast[]>(null, []);
let seq = 0;
function push(t: Omit<Toast, 'id'>, ms = 5000) {
  const id = ++seq;
  store.set([...store.get().slice(-2), { ...t, id }]);
  setTimeout(() => dismiss(id), ms);
}
export const dismiss = (id: number) => store.set(store.get().filter((t) => t.id !== id));
export const useToasts = store.use;
export const toast = {
  ok: (text: string, action?: Toast['action']) => push({ kind: 'ok', text, action }),
  error: (text: string) => push({ kind: 'error', text }, 7000),
};
