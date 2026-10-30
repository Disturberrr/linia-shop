import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { all, get } from './db.ts';
import { getProductBySlug, listCategories, listProducts, sitemapEntries } from './services/catalog.ts';
import { getPage, getSettings } from './services/settings.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** JSON для вставки в <script>: екрануємо «<», щоб виключити закриття тегу зсередини даних */
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028) + '|' + String.fromCharCode(0x2029), 'g'), '');
const abs = (p: string) => (/^https?:\/\//.test(p) ? p : `${config.publicUrl}${p}`);
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

interface Seo {
  status: number;
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  ogType?: string;
  noindex?: boolean;
  ld?: unknown[];
  body?: string;
  price?: { amount: number; currency: string };
}

let templateCache: string | null = null;
export function loadTemplate() {
  const file = path.join(config.clientDir, 'index.html');
  if (config.isProd && templateCache) return templateCache;
  if (!fs.existsSync(file)) {
    return '<!doctype html><html lang="uk"><head><meta charset="utf-8"><!--seo-head--></head><body><div id="root"><!--seo-body--></div><p>Клієнт не зібрано. Виконайте <code>npm run build</code>.</p></body></html>';
  }
  const t = fs.readFileSync(file, 'utf8');
  if (config.isProd) templateCache = t;
  return t;
}

function resolve(pathname: string, query: URLSearchParams): Seo {
  const s = getSettings();
  const store = s.store.name;
  const productsList = (items: { slug: string; name: string; price: number }[]) =>
    items.length
      ? `<ul>${items.map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.name)}</a> — ${p.price} ${esc(s.store.currency)}</li>`).join('')}</ul>`
      : '';

  if (pathname === '/') {
    const featured = listProducts({ featured: true, perPage: 8 }).items;
    return {
      status: 200,
      title: `${store} — ${s.store.tagline}`,
      description: clip(s.store.description, 160),
      canonical: '/',
      image: s.hero.image ? s.hero.image + '.w1600.webp' : undefined,
      ld: [
        { '@context': 'https://schema.org', '@type': 'Organization', name: store, url: config.publicUrl, ...(s.contacts.email ? { email: s.contacts.email } : {}), ...(s.contacts.phone ? { telephone: s.contacts.phone } : {}) },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: store, url: config.publicUrl, potentialAction: { '@type': 'SearchAction', target: `${config.publicUrl}/catalog?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
      ],
      body: `<h1>${esc(s.hero.title)}</h1><p>${esc(s.hero.subtitle)}</p>${productsList(featured)}`,
    };
  }

  if (pathname === '/catalog') {
    const cat = query.get('category');
    const cats = listCategories();
    const label = cat === 'new' ? 'Новинки' : cat === 'sale' ? 'Акції' : cats.find((c) => c.slug === cat)?.name;
    if (cat && !label) return { status: 404, title: `Категорію не знайдено — ${store}`, description: '', noindex: true };
    const q = query.get('q');
    const list = listProducts({ category: cat || undefined, q: q || undefined, perPage: 24 }).items;
    const title = q ? `Пошук «${q}» — ${store}` : `${label ?? 'Каталог'} — ${store}`;
    return {
      status: 200,
      title,
      description: clip(cats.find((c) => c.slug === cat)?.description || `${label ?? 'Каталог товарів'} в інтернет-магазині ${store}.`, 160),
      canonical: cat && !q ? `/catalog?category=${encodeURIComponent(cat)}` : '/catalog',
      noindex: !!q,
      body: `<h1>${esc(label ?? 'Каталог')}</h1>${productsList(list)}`,
    };
  }

  let m = /^\/product\/([^/]+)$/.exec(pathname);
  if (m) {
    const p = getProductBySlug(decodeURIComponent(m[1]));
    if (!p) return { status: 404, title: `Товар не знайдено — ${store}`, description: 'Такого товару немає або його знято з продажу.', noindex: true, body: '<h1>Товар не знайдено</h1>' };
    const url = `${config.publicUrl}/product/${p.slug}`;
    const images = p.images.map((i) => abs(i.src));
    const skus = p.variants.map((v) => v.sku).filter(Boolean);
    const desc = clip(p.description || `${p.name} — ${p.category.name} у магазині ${store}.`, 160);
    return {
      status: 200,
      title: `${p.name} — ${store}`,
      description: desc,
      canonical: `/product/${p.slug}`,
      image: p.images[0]?.src,
      ogType: 'product',
      price: { amount: p.price, currency: 'UAH' },
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description: p.description || undefined,
          image: images.length ? images : undefined,
          sku: skus.length === 1 ? skus[0] : undefined,
          category: p.category.name,
          offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'UAH',
            price: p.price,
            availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Головна', item: config.publicUrl },
            { '@type': 'ListItem', position: 2, name: p.category.name, item: `${config.publicUrl}/catalog?category=${p.category.slug}` },
            { '@type': 'ListItem', position: 3, name: p.name, item: url },
          ],
        },
      ],
      body: `<h1>${esc(p.name)}</h1><p>${p.price} ${esc(s.store.currency)}</p><p>${esc(p.description)}</p>`,
    };
  }

  m = /^\/page\/([^/]+)$/.exec(pathname);
  if (m) {
    const pg = getPage(decodeURIComponent(m[1]));
    if (!pg) return { status: 404, title: `Сторінку не знайдено — ${store}`, description: '', noindex: true };
    const first = pg.body.split(/\n\s*\n/).find((b) => b.trim() && !b.startsWith('#') && !b.startsWith('['));
    return { status: 200, title: `${pg.title} — ${store}`, description: clip(first ?? pg.title, 160), canonical: `/page/${pg.slug}`, body: `<h1>${esc(pg.title)}</h1>` };
  }

  if (pathname === '/contacts') {
    return { status: 200, title: `Контакти — ${store}`, description: clip(`Контакти магазину ${store}: телефон, email, адреса та графік роботи.`, 160), canonical: '/contacts', body: '<h1>Контакти</h1>' };
  }

  if (['/cart', '/wishlist', '/checkout'].includes(pathname) || pathname.startsWith('/order/') || pathname === '/admin' || pathname.startsWith('/admin/')) {
    const names: Record<string, string> = { '/cart': 'Кошик', '/wishlist': 'Обране', '/checkout': 'Оформлення замовлення' };
    return { status: 200, title: `${names[pathname] ?? (pathname.startsWith('/admin') ? 'Керування магазином' : 'Замовлення')} — ${store}`, description: '', noindex: true };
  }

  return { status: 404, title: `Сторінку не знайдено — ${store}`, description: 'Такої сторінки немає.', noindex: true, body: '<h1>Сторінку не знайдено</h1>' };
}

export function renderShell(pathname: string, query: URLSearchParams) {
  const seo = resolve(pathname, query);
  const store = getSettings().store.name;
  const tags: string[] = [`<title>${esc(seo.title)}</title>`];
  if (seo.description) tags.push(`<meta name="description" content="${esc(seo.description)}">`);
  tags.push(`<meta name="robots" content="${seo.noindex ? 'noindex,nofollow' : 'index,follow'}">`);
  if (seo.canonical) tags.push(`<link rel="canonical" href="${esc(abs(seo.canonical))}">`);
  tags.push(
    `<meta property="og:site_name" content="${esc(store)}">`,
    `<meta property="og:type" content="${seo.ogType ?? 'website'}">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:locale" content="uk_UA">`,
  );
  if (seo.description) tags.push(`<meta property="og:description" content="${esc(seo.description)}">`);
  if (seo.canonical) tags.push(`<meta property="og:url" content="${esc(abs(seo.canonical))}">`);
  tags.push(`<meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}">`);
  if (seo.image) tags.push(`<meta property="og:image" content="${esc(abs(seo.image))}">`);
  if (seo.price) tags.push(`<meta property="product:price:amount" content="${seo.price.amount}">`, `<meta property="product:price:currency" content="${seo.price.currency}">`);
  for (const o of seo.ld ?? []) tags.push(`<script type="application/ld+json">${jsonLd(o)}</script>`);

  const html = loadTemplate()
    .replace('<!--seo-head-->', tags.join('\n    '))
    .replace('<!--seo-body-->', seo.body ? `<div class="prerender">${seo.body}</div>` : '');
  return { status: seo.status, html };
}

export function robotsTxt() {
  return ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /cart', 'Disallow: /checkout', 'Disallow: /order/', 'Disallow: /wishlist', `Sitemap: ${config.publicUrl}/sitemap.xml`, ''].join('\n');
}

export function sitemapXml() {
  const { products, categories } = sitemapEntries();
  const pages = all<{ slug: string; updated_at: string }>('SELECT slug, updated_at FROM pages ORDER BY slug');
  const url = (loc: string, lastmod?: string) => `  <url><loc>${esc(abs(loc))}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}</url>`;
  const lines = [
    url('/'),
    url('/catalog'),
    url('/contacts'),
    ...categories.map((c) => url(`/catalog?category=${c.slug}`)),
    ...products.map((p) => url(`/product/${p.slug}`, p.updated_at)),
    ...pages.map((p) => url(`/page/${p.slug}`, p.updated_at)),
  ];
  void get;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;
}
