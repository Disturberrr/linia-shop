import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.ts';
import { migrate } from './db.ts';
import {
  HttpError, Reply, Router, clientIp, errorResponse, parseCookies, rateLimit, readBody, securityHeaders, sendJson, type Ctx,
} from './lib/http.ts';
import { registerAdmin } from './routes/admin.ts';
import { registerPublic } from './routes/public.ts';
import { renderShell, robotsTxt, sitemapXml } from './seo.ts';
import { purgeExpiredSessions, userFromToken } from './services/auth.ts';
import { UPLOAD_DIR } from './services/images.ts';
import { setOrderStatus } from './services/orders.ts';
import { expiredUnpaidOrderIds } from './services/payment.ts';

export const router = new Router();
registerPublic(router);
registerAdmin(router);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.map': 'application/json',
};

function sendFile(res: http.ServerResponse, file: string, cache: string) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

/** Безпечно резолвить шлях усередині каталогу (захист від ../). */
function inside(root: string, rel: string): string | null {
  const full = path.resolve(root, '.' + path.sep + rel);
  return full.startsWith(root + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ip: string) {
  const method = req.method === 'HEAD' ? 'GET' : req.method ?? 'GET';
  const { route, params, pathMatched } = router.match(method, url.pathname) as any;
  if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Метод не підтримується' : 'Не знайдено');

  rateLimit(`${ip}:all`, 300);
  if (route.opts.rate) rateLimit(`${ip}:${route.method} ${route.regex.source}`, route.opts.rate);

  const sessionToken = parseCookies(req.headers.cookie).sid;
  const user = userFromToken(sessionToken);
  const isAdminApi = url.pathname.startsWith('/api/admin/');
  if (route.opts.admin && (!user || user.role !== 'admin')) throw new HttpError(401, 'Потрібен вхід до панелі керування');
  // Додатковий захист від CSRF: змінюючі запити адмін-API мають містити власний заголовок
  // (крос-сайтова форма не може його виставити; cookie ще й SameSite=Strict).
  if (isAdminApi && !['GET', 'HEAD'].includes(method) && req.headers['x-requested-with'] !== 'shop-admin') {
    throw new HttpError(403, 'Заборонено');
  }

  let rawCache: Buffer | null = null;
  const raw = async (limit: number) => (rawCache ??= await readBody(req, limit));
  const ctx: Ctx = {
    req, res, url, params, query: url.searchParams, ip, user, sessionToken,
    raw,
    async json(limit = 64 * 1024) {
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Очікується application/json');
      const buf = await raw(limit);
      try { return JSON.parse(buf.toString('utf8') || 'null'); } catch { throw new HttpError(400, 'Некоректний JSON'); }
    },
  };

  const out = await route.handler(ctx);
  if (out instanceof Reply) {
    if (out.opts.contentType) {
      res.writeHead(out.status, { 'Content-Type': out.opts.contentType, ...out.opts.headers });
      res.end(out.body as string);
    } else sendJson(res, out.status, out.body);
  } else sendJson(res, 200, out);
}

export async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  securityHeaders(res);
  const ip = clientIp(req);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);

    if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Метод не підтримується');
    const p = decodeURIComponent(url.pathname);

    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return void res.end(robotsTxt()); }
    if (p === '/sitemap.xml') { res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return void res.end(sitemapXml()); }

    if (p.startsWith('/uploads/')) {
      if (!/^\/uploads\/[a-f0-9]{16}\.w(400|800|1600)\.webp$/.test(p)) throw new HttpError(404, 'Не знайдено');
      const f = inside(UPLOAD_DIR, p.slice('/uploads/'.length));
      if (!f) throw new HttpError(404, 'Не знайдено');
      return sendFile(res, f, 'public, max-age=31536000, immutable');
    }

    // Статичні файли клієнта (assets/*, favicon тощо); усе інше — HTML-оболонка з SEO
    if (p !== '/' && p !== '/index.html' && path.extname(p)) {
      const f = inside(config.clientDir, p.slice(1));
      if (f) return sendFile(res, f, p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      throw new HttpError(404, 'Не знайдено');
    }

    const { status, html } = renderShell(p.replace(/\/+$/, '') || '/', url.searchParams);
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (e) {
    if (res.headersSent) return void res.end();
    const { status, body } = errorResponse(e);
    if (url.pathname.startsWith('/api/')) {
      const extra: Record<string, string> = {};
      if (typeof (body as any).retryAfter === 'number') extra['Retry-After'] = String((body as any).retryAfter);
      res.setHeader('Cache-Control', 'no-store');
      for (const [k, val] of Object.entries(extra)) res.setHeader(k, val);
      sendJson(res, status, body);
    } else {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(body.error));
    }
  }
}

/** Скасовує онлайн-замовлення, які не оплатили за відведений час, і повертає товар на склад. */
export function cancelUnpaidOrders(minutes = config.unpaidCancelMinutes) {
  if (minutes <= 0) return 0;
  let n = 0;
  for (const id of expiredUnpaidOrderIds(minutes)) {
    try { setOrderStatus(id, 'cancelled', 'system: не оплачено вчасно'); n++; } catch (e) { console.error('auto-cancel:', e); }
  }
  return n;
}

export function start() {
  migrate();
  purgeExpiredSessions();
  const server = http.createServer((req, res) => void handle(req, res));
  server.requestTimeout = 30_000;
  server.listen(config.port, () => console.log(`Магазин: ${config.publicUrl} (порт ${config.port}, ${config.isProd ? 'production' : 'dev'})`));
  setInterval(() => { purgeExpiredSessions(); const n = cancelUnpaidOrders(); if (n) console.log(`Скасовано неоплачених замовлень: ${n}`); }, 10 * 60_000).unref();
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
