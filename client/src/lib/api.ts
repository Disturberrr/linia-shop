export class ApiError extends Error {
  constructor(public status: number, message: string, public data: any = {}) { super(message); }
  get issues(): Record<string, string> { return this.data?.issues ?? {}; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: BodyInit; admin?: boolean; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.admin && method !== 'GET') headers['X-Requested-With'] = 'shop-admin';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Немає зв’язку з сервером. Перевірте інтернет і спробуйте ще раз.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Щось пішло не так. Спробуйте ще раз.', data);
  return data as T;
}

export const qs = (o: Record<string, string | number | undefined | null | false>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
