import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

export const currentUrl = () => location.pathname + location.search;
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useUrl() {
  return useSyncExternalStore(subscribe, currentUrl, () => '/');
}
export function useLocation() {
  const url = useUrl();
  const u = new URL(url, location.origin);
  return { pathname: u.pathname.replace(/\/+$/, '') || '/', search: u.searchParams, url };
}

export function navigate(to: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
  if (to === currentUrl()) return;
  const samePath = new URL(to, location.origin).pathname === location.pathname;
  history[opts.replace ? 'replaceState' : 'pushState']({}, '', to);
  emit();
  if (opts.scroll ?? !samePath) window.scrollTo({ top: 0 });
}

export function Link({ to, replace, onClick, ...rest }: { to: string; replace?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest} />;
}

/** Заголовок вкладки для SPA-переходів (для першого завантаження title формує сервер). */
export function useTitle(title: string | undefined) {
  useEffect(() => { if (title) document.title = title; }, [title]);
}
