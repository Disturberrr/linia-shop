import { useEffect, useState } from 'react';
import { api } from './api';

export function useFetch<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: !!path });
  useEffect(() => {
    if (!path) { setState({ loading: false }); return; }
    const ac = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    api<T>(path, { signal: ac.signal })
      .then((data) => setState({ data, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ error, loading: false }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
