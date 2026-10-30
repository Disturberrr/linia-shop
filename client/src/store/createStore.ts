import { useSyncExternalStore } from 'react';

/** Мінімальне сховище з підпискою та збереженням у localStorage (з try/catch: сховище може бути недоступним). */
export function createStore<T>(key: string | null, initial: T, validate?: (v: unknown) => T) {
  let state = initial;
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) state = validate ? validate(JSON.parse(raw)) : (JSON.parse(raw) as T);
    } catch { /* пошкоджені дані ігноруємо */ }
  }
  const subs = new Set<() => void>();
  const persist = () => { if (key) try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ігноруємо */ } };
  const set = (next: T) => { state = next; persist(); subs.forEach((s) => s()); };
  const subscribe = (s: () => void) => { subs.add(s); return () => subs.delete(s); };
  if (key) window.addEventListener('storage', (e) => {
    if (e.key !== key) return;
    try { state = e.newValue ? (validate ? validate(JSON.parse(e.newValue)) : JSON.parse(e.newValue)) : initial; subs.forEach((s) => s()); } catch { /* ігноруємо */ }
  });
  return { get: () => state, set, use: () => useSyncExternalStore(subscribe, () => state, () => initial) };
}
