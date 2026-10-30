import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { ValidationError } from './validate.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  user?: { id: number; email: string; role: string };
  sessionToken?: string;
  json<T = unknown>(limit?: number): Promise<T>;
  raw(limit: number): Promise<Buffer>;
}

/** Явна відповідь обробника (статус, заголовки, довільне тіло). Звичайне значення → 200 JSON. */
export class Reply {
  constructor(
    public status: number,
    public body: unknown,
    public opts: { contentType?: string; headers?: Record<string, string> } = {},
  ) {}
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
  opts: RouteOpts;
}

export interface RouteOpts {
  /** Ліміт запитів на хвилину з одного IP (0 — без ліміту) */
  rate?: number;
  /** Потрібна авторизація адміністратора */
  admin?: boolean;
}

export class Router {
  routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler, opts: RouteOpts = {}) {
    const keys: string[] = [];
    const src = pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${src}/?$`), keys, handler, opts });
  }
  get = (p: string, h: Handler, o?: RouteOpts) => this.add('GET', p, h, o);
  post = (p: string, h: Handler, o?: RouteOpts) => this.add('POST', p, h, o);
  put = (p: string, h: Handler, o?: RouteOpts) => this.add('PUT', p, h, o);
  patch = (p: string, h: Handler, o?: RouteOpts) => this.add('PATCH', p, h, o);
  delete = (p: string, h: Handler, o?: RouteOpts) => this.add('DELETE', p, h, o);

  match(method: string, pathname: string) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return { route: null, params: {}, pathMatched };
  }
}

// ---------- Обмеження частоти запитів (фіксоване вікно, у пам'яті процесу) ----------
const buckets = new Map<string, { count: number; reset: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

/** Керування лімітами для тестів. У роботі завжди enabled = true. */
export const rateConfig = { enabled: true };
export const resetRateLimits = () => buckets.clear();

export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  if (!rateConfig.enabled) return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    throw new HttpError(429, 'Забагато запитів. Спробуйте трохи пізніше.', { retryAfter: Math.ceil((b.reset - now) / 1000) });
  }
}

export function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Запит завеликий'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res: ServerResponse, name: string, value: string, maxAgeSec: number) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (config.isProd) attrs.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, attrs.join('; ')]);
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function errorResponse(e: unknown): { status: number; body: Record<string, unknown> } {
  if (e instanceof ValidationError) return { status: 422, body: { error: 'Перевірте введені дані', issues: e.issues } };
  if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...e.extra } };
  console.error('Внутрішня помилка:', e);
  return { status: 500, body: { error: 'Внутрішня помилка сервера' } };
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "form-action 'self' https://www.liqpay.ua",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  );
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
}
