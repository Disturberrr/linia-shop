import { all, db, get } from '../db.ts';

// SQLite LIKE не вміє регістронезалежний пошук для кирилиці — підключаємо власну функцію.
db.function('lower_uk', { deterministic: true }, (s: unknown) => String(s ?? '').toLowerCase());

export interface ImageOut {
  id: number;
  base: string;
  alt: string;
  src: string;
  srcSet: string;
  thumb: string;
}

export function imageOut(row: { id: number; url: string; alt: string }): ImageOut {
  const b = row.url;
  // Зовнішні/абсолютні URL (на випадок ручного заповнення) віддаємо як є
  if (/^https?:\/\//.test(b)) return { id: row.id, base: b, alt: row.alt, src: b, srcSet: '', thumb: b };
  return {
    id: row.id,
    base: b,
    alt: row.alt,
    src: `${b}.w800.webp`,
    srcSet: `${b}.w400.webp 400w, ${b}.w800.webp 800w, ${b}.w1600.webp 1600w`,
    thumb: `${b}.w400.webp`,
  };
}

interface ProductRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  category_id: number;
  category_slug: string;
  category_name: string;
  price: number;
  old_price: number | null;
  is_new: number;
  is_featured: number;
  status: string;
  attributes: string;
  created_at: string;
  updated_at: string;
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p JOIN categories c ON c.id = p.category_id`;

export interface VariantOut {
  id: number;
  size: string;
  color: string;
  colorHex: string;
  sku: string | null;
  stock: number;
}

function loadRelations(ids: number[]) {
  const images = new Map<number, ImageOut[]>();
  const variants = new Map<number, VariantOut[]>();
  if (!ids.length) return { images, variants };
  const ph = ids.map(() => '?').join(',');
  for (const r of all<any>(`SELECT * FROM product_images WHERE product_id IN (${ph}) ORDER BY sort_order, id`, ...ids)) {
    (images.get(r.product_id) ?? images.set(r.product_id, []).get(r.product_id)!).push(imageOut(r));
  }
  for (const r of all<any>(`SELECT * FROM variants WHERE product_id IN (${ph}) ORDER BY id`, ...ids)) {
    (variants.get(r.product_id) ?? variants.set(r.product_id, []).get(r.product_id)!).push({
      id: r.id, size: r.size, color: r.color, colorHex: r.color_hex, sku: r.sku, stock: r.stock,
    });
  }
  return { images, variants };
}

function shape(p: ProductRow, images: ImageOut[], variants: VariantOut[], detail: boolean) {
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);
  const colors: { name: string; hex: string }[] = [];
  for (const v of variants) if (v.color && !colors.some((c) => c.name === v.color)) colors.push({ name: v.color, hex: v.colorHex });
  const sizes = [...new Set(variants.filter((v) => v.size).map((v) => v.size))];
  const base = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    oldPrice: p.old_price,
    isNew: !!p.is_new,
    isFeatured: !!p.is_featured,
    status: p.status,
    category: { slug: p.category_slug, name: p.category_name },
    image: images[0] ?? null,
    secondImage: images[1] ?? null,
    inStock: totalStock > 0,
    colors,
    sizes,
    createdAt: p.created_at,
  };
  if (!detail) return base;
  return {
    ...base,
    description: p.description,
    attributes: JSON.parse(p.attributes || '[]') as { name: string; value: string }[],
    images,
    variants,
    categoryId: p.category_id,
    updatedAt: p.updated_at,
  };
}

export type ProductSummary = ReturnType<typeof shape>;

export interface CatalogQuery {
  category?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  colors?: string[];
  sort?: string;
  page?: number;
  perPage?: number;
  onlyNew?: boolean;
  onlySale?: boolean;
  featured?: boolean;
  slugs?: string[];
}

export function listProducts(q: CatalogQuery) {
  const where: string[] = [`p.status = 'active'`, `c.is_active = 1`];
  const params: any[] = [];

  if (q.category === 'new') where.push('p.is_new = 1');
  else if (q.category === 'sale') where.push('p.old_price IS NOT NULL');
  else if (q.category) {
    where.push('c.slug = ?');
    params.push(q.category);
  }
  if (q.onlyNew) where.push('p.is_new = 1');
  if (q.onlySale) where.push('p.old_price IS NOT NULL');
  if (q.featured) where.push('p.is_featured = 1');
  if (q.slugs) {
    if (!q.slugs.length) where.push('0');
    else { where.push(`p.slug IN (${q.slugs.map(() => '?').join(',')})`); params.push(...q.slugs); }
  }
  if (q.q) {
    where.push('lower_uk(p.name) LIKE ?');
    params.push(`%${q.q.toLowerCase().replace(/[%_]/g, '')}%`);
  }
  if (q.minPrice !== undefined) {
    where.push('p.price >= ?');
    params.push(q.minPrice);
  }
  if (q.maxPrice !== undefined) {
    where.push('p.price <= ?');
    params.push(q.maxPrice);
  }
  if (q.sizes?.length) {
    where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0 AND v.size IN (${q.sizes.map(() => '?').join(',')}))`);
    params.push(...q.sizes);
  }
  if (q.colors?.length) {
    where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0 AND v.color IN (${q.colors.map(() => '?').join(',')}))`);
    params.push(...q.colors);
  }

  const order =
    q.sort === 'price_asc' ? 'p.price ASC, p.id DESC'
    : q.sort === 'price_desc' ? 'p.price DESC, p.id DESC'
    : q.sort === 'new' ? 'p.created_at DESC, p.id DESC'
    : 'p.is_featured DESC, p.created_at DESC, p.id DESC';

  const perPage = Math.min(Math.max(q.perPage ?? 12, 1), 48);
  const page = Math.max(q.page ?? 1, 1);
  const whereSql = where.join(' AND ');

  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`, ...params)!.n;
  const rows = all<ProductRow>(`${PRODUCT_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, perPage, (page - 1) * perPage);
  const rel = loadRelations(rows.map((r) => r.id));
  return {
    items: rows.map((r) => shape(r, rel.images.get(r.id) ?? [], rel.variants.get(r.id) ?? [], false)),
    total,
    page,
    pages: Math.max(Math.ceil(total / perPage), 1),
    perPage,
  };
}

/** Доступні значення фільтрів для (опційно) категорії. */
export function facets(category?: string) {
  const where = [`p.status = 'active'`, `c.is_active = 1`];
  const params: any[] = [];
  if (category === 'new') where.push('p.is_new = 1');
  else if (category === 'sale') where.push('p.old_price IS NOT NULL');
  else if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  const w = where.join(' AND ');
  const price = get<{ lo: number | null; hi: number | null }>(
    `SELECT MIN(p.price) AS lo, MAX(p.price) AS hi FROM products p JOIN categories c ON c.id = p.category_id WHERE ${w}`, ...params)!;
  const variants = all<{ size: string; color: string; color_hex: string }>(
    `SELECT DISTINCT v.size, v.color, v.color_hex FROM variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id WHERE ${w} AND v.stock > 0`, ...params);
  const colors: { name: string; hex: string }[] = [];
  for (const v of variants) if (v.color && !colors.some((c) => c.name === v.color)) colors.push({ name: v.color, hex: v.color_hex });
  const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'uk', { numeric: true });
  });
  return { minPrice: price.lo ?? 0, maxPrice: price.hi ?? 0, sizes, colors };
}

export function getProductBySlug(slug: string, includeArchived = false) {
  const row = get<ProductRow>(`${PRODUCT_SELECT} WHERE p.slug = ? ${includeArchived ? '' : `AND p.status = 'active' AND c.is_active = 1`}`, slug);
  return row ? hydrate(row) : undefined;
}

export function getProductById(id: number) {
  const row = get<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = ?`, id);
  return row ? hydrate(row) : undefined;
}

function hydrate(row: ProductRow) {
  const rel = loadRelations([row.id]);
  return shape(row, rel.images.get(row.id) ?? [], rel.variants.get(row.id) ?? [], true) as ProductSummary & {
    description: string;
    attributes: { name: string; value: string }[];
    images: ImageOut[];
    variants: VariantOut[];
    categoryId: number;
    updatedAt: string;
  };
}

export function relatedProducts(productId: number, categoryId: number, limit = 4) {
  const rows = all<ProductRow>(
    `${PRODUCT_SELECT} WHERE p.status = 'active' AND c.is_active = 1 AND p.id != ?
     ORDER BY (p.category_id = ?) DESC, p.is_featured DESC, p.created_at DESC LIMIT ?`,
    productId, categoryId, limit);
  const rel = loadRelations(rows.map((r) => r.id));
  return rows.map((r) => shape(r, rel.images.get(r.id) ?? [], rel.variants.get(r.id) ?? [], false));
}

export function listCategories(includeInactive = false) {
  return all<any>(
    `SELECT c.id, c.slug, c.name, c.description, c.image, c.sort_order AS sortOrder, c.is_active AS isActive,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS productCount
     FROM categories c ${includeInactive ? '' : 'WHERE c.is_active = 1'} ORDER BY c.sort_order, c.id`,
  ).map((c) => ({
    ...c,
    isActive: !!c.isActive,
    image: c.image ? imageOut({ id: 0, url: c.image, alt: c.name }) : null,
  }));
}

export function sitemapEntries() {
  return {
    products: all<{ slug: string; updated_at: string }>(
      `SELECT p.slug, p.updated_at FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'active' AND c.is_active = 1`),
    categories: all<{ slug: string }>('SELECT slug FROM categories WHERE is_active = 1'),
  };
}
