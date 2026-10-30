import { all, get, run, tx } from '../db.ts';
import { HttpError } from '../lib/http.ts';
import { slugify, uniqueSlug } from '../lib/slug.ts';
import { SLUG_RE, v } from '../lib/validate.ts';
import { getProductById, imageOut } from './catalog.ts';

const UPLOAD_URL_RE = /^\/uploads\/[a-f0-9]{16}$/;

export const productSchema = v.object({
  name: v.string({ min: 1, max: 160 }),
  slug: v.optional(v.string({ max: 100, pattern: SLUG_RE, msg: 'Лише латинські літери, цифри та дефіси' })),
  description: v.string({ max: 10000, trim: false }),
  categoryId: v.int({ min: 1 }),
  price: v.int({ min: 0, max: 10_000_000 }),
  oldPrice: v.nullable(v.int({ min: 1, max: 10_000_000 })),
  isNew: v.bool(),
  isFeatured: v.bool(),
  status: v.oneOf(['active', 'archived'] as const),
  attributes: v.array(v.object({ name: v.string({ min: 1, max: 80 }), value: v.string({ min: 1, max: 200 }) }), { max: 30 }),
  images: v.array(v.object({ url: v.string({ min: 1, max: 80, pattern: UPLOAD_URL_RE, msg: 'Зображення має бути завантажене через панель' }), alt: v.string({ max: 200 }) }), { max: 12 }),
  variants: v.array(
    v.object({
      id: v.optional(v.int({ min: 1 })),
      size: v.string({ max: 20 }),
      color: v.string({ max: 40 }),
      colorHex: v.string({ max: 7, pattern: /^(#[0-9a-fA-F]{6})?$/, msg: 'Колір у форматі #RRGGBB' }),
      sku: v.optional(v.string({ max: 40 })),
      stock: v.int({ min: 0, max: 100000 }),
    }),
    { min: 1, max: 100 },
  ),
});
export type ProductInput = ReturnType<typeof productSchema.parse>;

function checkInput(input: ProductInput) {
  const issues: Record<string, string> = {};
  if (input.oldPrice !== null && input.oldPrice <= input.price) issues.oldPrice = 'Стара ціна має бути більшою за поточну (або залиште порожньою)';
  if (!get('SELECT 1 FROM categories WHERE id = ?', input.categoryId)) issues.categoryId = 'Оберіть категорію';
  const seen = new Set<string>();
  input.variants.forEach((vr, i) => {
    const key = `${vr.size}|${vr.color}`;
    if (seen.has(key)) issues[`variants[${i}]`] = 'Така комбінація розміру та кольору вже є';
    seen.add(key);
  });
  if (Object.keys(issues).length) throw new HttpError(422, 'Перевірте введені дані', { issues });
}

function writeChildren(productId: number, input: ProductInput) {
  run('DELETE FROM product_images WHERE product_id = ?', productId);
  input.images.forEach((im, i) => run('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)', productId, im.url, im.alt, i));

  const keep = new Set<number>();
  for (const vr of input.variants) {
    if (vr.id) {
      const owned = get('SELECT 1 FROM variants WHERE id = ? AND product_id = ?', vr.id, productId);
      if (!owned) throw new HttpError(422, 'Невірний варіант товару', { issues: { variants: 'Невірний варіант' } });
      run('UPDATE variants SET size = ?, color = ?, color_hex = ?, sku = ?, stock = ? WHERE id = ?', vr.size, vr.color, vr.colorHex, vr.sku ?? null, vr.stock, vr.id);
      keep.add(vr.id);
    }
  }
  // Спочатку видаляємо зайві (звільняє унікальні комбінації), потім додаємо нові
  for (const r of all<{ id: number }>('SELECT id FROM variants WHERE product_id = ?', productId)) {
    if (!keep.has(r.id)) run('DELETE FROM variants WHERE id = ?', r.id);
  }
  for (const vr of input.variants) {
    if (!vr.id) run('INSERT INTO variants (product_id, size, color, color_hex, sku, stock) VALUES (?, ?, ?, ?, ?, ?)', productId, vr.size, vr.color, vr.colorHex, vr.sku ?? null, vr.stock);
  }
}

function friendlyDbError(e: unknown): never {
  const msg = (e as Error).message ?? '';
  if (/UNIQUE.*sku/i.test(msg)) throw new HttpError(409, 'Артикул (SKU) уже використовується іншим варіантом', { issues: { variants: 'Артикул має бути унікальним' } });
  if (/UNIQUE.*slug/i.test(msg)) throw new HttpError(409, 'Така адреса (slug) вже зайнята', { issues: { slug: 'Адреса вже зайнята' } });
  if (/UNIQUE.*variants/i.test(msg)) throw new HttpError(409, 'Така комбінація розміру та кольору вже є');
  throw e;
}

export function createProduct(input: ProductInput) {
  checkInput(input);
  try {
    const id = tx(() => {
      const slug = input.slug ?? uniqueSlug(slugify(input.name), (s) => !!get('SELECT 1 FROM products WHERE slug = ?', s));
      const r = run(
        `INSERT INTO products (slug, name, description, category_id, price, old_price, is_new, is_featured, status, attributes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        slug, input.name, input.description, input.categoryId, input.price, input.oldPrice, +input.isNew, +input.isFeatured, input.status, JSON.stringify(input.attributes),
      );
      const pid = Number(r.lastInsertRowid);
      writeChildren(pid, input);
      return pid;
    });
    return getProductById(id)!;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    friendlyDbError(e);
  }
}

export function updateProduct(id: number, input: ProductInput) {
  if (!get('SELECT 1 FROM products WHERE id = ?', id)) throw new HttpError(404, 'Товар не знайдено');
  checkInput(input);
  try {
    tx(() => {
      const cur = get<{ slug: string }>('SELECT slug FROM products WHERE id = ?', id)!;
      run(
        `UPDATE products SET slug = ?, name = ?, description = ?, category_id = ?, price = ?, old_price = ?, is_new = ?, is_featured = ?,
           status = ?, attributes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        input.slug ?? cur.slug, input.name, input.description, input.categoryId, input.price, input.oldPrice, +input.isNew, +input.isFeatured, input.status, JSON.stringify(input.attributes), id,
      );
      writeChildren(id, input);
    });
    return getProductById(id)!;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    friendlyDbError(e);
  }
}

/** «Видалення» — архівація: товар зникає з вітрини, але історія замовлень лишається цілою. */
export function archiveProduct(id: number) {
  const r = run(`UPDATE products SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, id);
  if (Number(r.changes) !== 1) throw new HttpError(404, 'Товар не знайдено');
}

export function listAdminProducts(opts: { q?: string; status?: string; category?: number; page: number; perPage: number }) {
  const where: string[] = [];
  const params: any[] = [];
  if (opts.q) { where.push('lower_uk(p.name) LIKE ?'); params.push(`%${opts.q.toLowerCase().replace(/[%_]/g, '')}%`); }
  if (opts.status === 'active' || opts.status === 'archived') { where.push('p.status = ?'); params.push(opts.status); }
  if (opts.category) { where.push('p.category_id = ?'); params.push(opts.category); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM products p ${w}`, ...params)!.n;
  const rows = all<any>(
    `SELECT p.id, p.slug, p.name, p.price, p.old_price AS oldPrice, p.status, p.is_new AS isNew, p.is_featured AS isFeatured, c.name AS categoryName,
            (SELECT COALESCE(SUM(stock),0) FROM variants v WHERE v.product_id = p.id) AS stock,
            (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variantCount,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image
     FROM products p JOIN categories c ON c.id = p.category_id ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    ...params, opts.perPage, (opts.page - 1) * opts.perPage,
  );
  return {
    items: rows.map((r) => ({ ...r, isNew: !!r.isNew, isFeatured: !!r.isFeatured, image: r.image ? imageOut({ id: 0, url: r.image, alt: r.name }) : null })),
    total,
    pages: Math.max(Math.ceil(total / opts.perPage), 1),
  };
}

// ---------- Категорії ----------
export const categorySchema = v.object({
  name: v.string({ min: 1, max: 80 }),
  slug: v.optional(v.string({ max: 60, pattern: SLUG_RE, msg: 'Лише латинські літери, цифри та дефіси' })),
  description: v.string({ max: 500 }),
  image: v.nullable(v.string({ max: 80, pattern: UPLOAD_URL_RE, msg: 'Зображення має бути завантажене через панель' })),
  sortOrder: v.int({ min: 0, max: 10000 }),
  isActive: v.bool(),
});
export type CategoryInput = ReturnType<typeof categorySchema.parse>;

const RESERVED_SLUGS = ['new', 'sale'];

export function saveCategory(id: number | null, input: CategoryInput) {
  const slug = input.slug ?? uniqueSlug(slugify(input.name), (s) => RESERVED_SLUGS.includes(s) || !!get('SELECT 1 FROM categories WHERE slug = ? AND id != ?', s, id ?? 0));
  if (RESERVED_SLUGS.includes(slug)) throw new HttpError(422, 'Ця адреса зарезервована', { issues: { slug: 'Адреса зарезервована системою' } });
  try {
    if (id === null) {
      const r = run('INSERT INTO categories (slug, name, description, image, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)', slug, input.name, input.description, input.image, input.sortOrder, +input.isActive);
      return Number(r.lastInsertRowid);
    }
    const r = run('UPDATE categories SET slug = ?, name = ?, description = ?, image = ?, sort_order = ?, is_active = ? WHERE id = ?', slug, input.name, input.description, input.image, input.sortOrder, +input.isActive, id);
    if (Number(r.changes) !== 1) throw new HttpError(404, 'Категорію не знайдено');
    return id;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (/UNIQUE/i.test((e as Error).message)) throw new HttpError(409, 'Така адреса вже зайнята', { issues: { slug: 'Адреса вже зайнята' } });
    throw e;
  }
}

export function deleteCategory(id: number) {
  const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', id)!.n;
  if (n > 0) throw new HttpError(409, `У категорії є товари (${n}). Перенесіть їх в іншу категорію або вимкніть категорію.`);
  const r = run('DELETE FROM categories WHERE id = ?', id);
  if (Number(r.changes) !== 1) throw new HttpError(404, 'Категорію не знайдено');
}

// ---------- Замовлення (адмін) ----------
export function listAdminOrders(opts: { status?: string; q?: string; page: number; perPage: number }) {
  const where: string[] = [];
  const params: any[] = [];
  if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  if (opts.q) {
    where.push(`(number LIKE ? OR phone LIKE ? OR lower_uk(first_name || ' ' || last_name) LIKE ?)`);
    const like = `%${opts.q.toLowerCase().replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders ${w}`, ...params)!.n;
  const items = all<any>(
    `SELECT id, number, status, first_name AS firstName, last_name AS lastName, phone, total, payment_method AS paymentMethod,
            payment_status AS paymentStatus, delivery_method_name AS deliveryMethodName, created_at AS createdAt,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = orders.id) AS itemCount
     FROM orders ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ...params, opts.perPage, (opts.page - 1) * opts.perPage,
  );
  const counts = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
  return { items, total, pages: Math.max(Math.ceil(total / opts.perPage), 1), counts };
}

export function adminSummary() {
  const counts = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
  const lowStock = all<any>(
    `SELECT v.id, v.size, v.color, v.stock, p.id AS productId, p.name FROM variants v JOIN products p ON p.id = v.product_id
     WHERE p.status = 'active' AND v.stock <= 2 ORDER BY v.stock, p.name LIMIT 20`,
  );
  return { orderCounts: counts, lowStock };
}
