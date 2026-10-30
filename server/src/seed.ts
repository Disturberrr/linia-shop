import sharp from 'sharp';
import { all, get, migrate, run, tx } from './db.ts';
import { config } from './config.ts';
import { heroSvg, productSvg, type Garment } from './lib/illustrations.ts';
import { slugify } from './lib/slug.ts';
import { createAdmin } from './services/auth.ts';
import { saveImage } from './services/images.ts';
import { DEFAULT_SETTINGS, setSetting } from './services/settings.ts';

// Безпечне початкове наповнення: нічого не стирає без --force, а з --force відмовляється, якщо є замовлення.
migrate(false);
const force = process.argv.includes('--force');
const existing = get<{ n: number }>('SELECT COUNT(*) AS n FROM products')!.n;
if (existing > 0 && !force) {
  console.log(`У каталозі вже є товари (${existing}). Сидування пропущено. Для повного перезаповнення: npm run seed -- --force`);
  maybeAdmin();
  process.exit(0);
}
if (force) {
  if (get<{ n: number }>('SELECT COUNT(*) AS n FROM orders')!.n > 0) {
    console.error('--force відхилено: у базі є замовлення. Видаліть файл бази вручну, якщо це справді потрібно.');
    process.exit(1);
  }
  tx(() => {
    run('DELETE FROM products');
    run('DELETE FROM categories');
    run('DELETE FROM pages');
  });
}

type Color = { name: string; hex: string };
const C = {
  white: { name: 'Білий', hex: '#f4f1ea' }, black: { name: 'Чорний', hex: '#1d1d1f' }, terracotta: { name: 'Теракотовий', hex: '#b5573a' },
  sand: { name: 'Пісочний', hex: '#d6c7a8' }, graphite: { name: 'Графітовий', hex: '#3a3d42' }, olive: { name: 'Оливковий', hex: '#6b705c' },
  beige: { name: 'Бежевий', hex: '#c8b8a0' }, melange: { name: 'Сірий меланж', hex: '#b8b8b8' }, milk: { name: 'Молочний', hex: '#efe8da' },
  forest: { name: 'Темно-зелений', hex: '#2f4a3c' }, khaki: { name: 'Хакі', hex: '#8a8566' }, navy: { name: 'Темно-синій', hex: '#26334d' },
  indigo: { name: 'Індиго', hex: '#2d3e5e' }, grey: { name: 'Сірий', hex: '#9aa0a6' }, brown: { name: 'Коричневий', hex: '#5a3b2a' },
  ecru: { name: 'Екрю', hex: '#e5dccb' }, mustard: { name: 'Гірчичний', hex: '#c79a2b' }, red: { name: 'Червоний', hex: '#9c2f2f' },
};
const APPAREL = ['XS', 'S', 'M', 'L', 'XL'];
const WAIST = ['28', '30', '32', '34', '36'];
const SHOES = ['38', '39', '40', '41', '42', '43', '44', '45'];
const BG: [string, string][] = [['#efeae2', '#d9d0c3'], ['#e9e4dc', '#cfc6b8'], ['#f1ede6', '#ddd6ca'], ['#e6e1d8', '#c9c0b1']];

interface P {
  name: string; cat: string; price: number; old?: number; isNew?: boolean; featured?: boolean; g: Garment; colors: Color[]; sizes: string[];
  desc: string; attrs: [string, string][];
}

const cats = [
  { slug: 'outerwear', name: 'Куртки та верхній одяг', description: 'Куртки, пальто та худі для прохолодної погоди.' },
  { slug: 'tshirts', name: 'Футболки', description: 'Базові футболки та лонгсліви на кожен день.' },
  { slug: 'trousers', name: 'Штани', description: 'Чиноси, джинси та карго прямого й широкого крою.' },
  { slug: 'shoes', name: 'Взуття', description: 'Кеди, кросівки та черевики.' },
  { slug: 'accessories', name: 'Аксесуари', description: 'Сумки, шапки та шарфи.' },
];

const products: P[] = [
  { name: 'Куртка-бомбер «Нейтраль»', cat: 'outerwear', price: 3200, old: 3900, g: 'jacket', colors: [C.olive, C.black], sizes: ['S', 'M', 'L', 'XL'], featured: true,
    desc: 'Легкий бомбер вільного крою з трикотажними манжетами та потайною застібкою-блискавкою. Підходить на міжсезоння.',
    attrs: [['Крій', 'Вільний'], ['Сезон', 'Міжсезоння'], ['Застібка', 'Блискавка'], ['Догляд', 'Делікатне прання при 30 °C']] },
  { name: 'Пальто вовняне прямого крою', cat: 'outerwear', price: 5900, g: 'coat', colors: [C.beige, C.graphite], sizes: ['XS', 'S', 'M', 'L'], isNew: true, featured: true,
    desc: 'Класичне пальто прямого силуету з відкладним коміром і двома кишенями. Нейтральні кольори легко поєднуються з будь-яким гардеробом.',
    attrs: [['Крій', 'Прямий'], ['Довжина', 'Нижче коліна'], ['Сезон', 'Осінь–зима'], ['Догляд', 'Хімчистка']] },
  { name: 'Худі з щільного футеру', cat: 'outerwear', price: 1650, g: 'hoodie', colors: [C.melange, C.black], sizes: APPAREL, isNew: true,
    desc: 'М’яке худі з капюшоном на шнурках і кишенею-кенгуру. Щільний футер тримає форму.',
    attrs: [['Крій', 'Вільний'], ['Капюшон', 'Так, на шнурках'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Футболка базова', cat: 'tshirts', price: 690, g: 'tee', colors: [C.white, C.black, C.terracotta], sizes: APPAREL, featured: true,
    desc: 'Базова футболка прямого крою з круглим вирізом. Основа для будь-якого образу.',
    attrs: [['Склад', 'Бавовна'], ['Крій', 'Прямий'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Футболка oversize «Лінія»', cat: 'tshirts', price: 890, old: 1090, g: 'tee', colors: [C.sand, C.graphite], sizes: ['S', 'M', 'L', 'XL'],
    desc: 'Футболка вільного крою зі спущеною лінією плеча.',
    attrs: [['Склад', 'Бавовна'], ['Крій', 'Oversize'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Лонгслів у рубчик', cat: 'tshirts', price: 950, g: 'longsleeve', colors: [C.milk, C.forest], sizes: ['XS', 'S', 'M', 'L'], isNew: true,
    desc: 'Приталений лонгслів із рельєфною фактурою рубчика.',
    attrs: [['Крій', 'Приталений'], ['Фактура', 'Рубчик'], ['Догляд', 'Делікатне прання']] },
  { name: 'Штани чиноси прямі', cat: 'trousers', price: 1890, g: 'trousers', colors: [C.khaki, C.navy], sizes: WAIST, featured: true,
    desc: 'Чиноси прямого крою із середньою посадкою. Підходять і для офісу, і для прогулянок.',
    attrs: [['Посадка', 'Середня'], ['Крій', 'Прямий'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Джинси широкі', cat: 'trousers', price: 2100, old: 2600, g: 'trousers', colors: [C.indigo], sizes: WAIST,
    desc: 'Джинси широкого крою з високою посадкою.',
    attrs: [['Посадка', 'Висока'], ['Крій', 'Широкий'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Штани карго', cat: 'trousers', price: 2250, g: 'trousers', colors: [C.olive, C.black], sizes: WAIST, isNew: true,
    desc: 'Штани карго з накладними кишенями та зав’язками внизу штанин.',
    attrs: [['Посадка', 'Середня'], ['Кишені', 'Накладні'], ['Догляд', 'Прання при 30 °C']] },
  { name: 'Кеди шкіряні білі', cat: 'shoes', price: 3400, g: 'sneaker', colors: [C.white], sizes: SHOES, featured: true,
    desc: 'Мінімалістичні кеди на гумовій підошві. Верх зі шкіри, внутрішня частина — текстиль.',
    attrs: [['Верх', 'Шкіра'], ['Підошва', 'Гума'], ['Догляд', 'Протирати вологою ганчіркою']] },
  { name: 'Кросівки Run Light', cat: 'shoes', price: 3900, old: 4600, g: 'sneaker', colors: [C.grey, C.black], sizes: SHOES.slice(1),
    desc: 'Легкі кросівки з текстильним верхом для щоденних прогулянок.',
    attrs: [['Верх', 'Текстиль'], ['Підошва', 'Піна EVA'], ['Догляд', 'Ручне прання']] },
  { name: 'Черевики челсі', cat: 'shoes', price: 4800, g: 'boot', colors: [C.brown, C.black], sizes: SHOES.slice(2), isNew: true,
    desc: 'Черевики челсі з еластичними вставками. Класичний силует на кожен день.',
    attrs: [['Верх', 'Шкіра'], ['Підкладка', 'Текстиль'], ['Догляд', 'Крем для шкіри']] },
  { name: 'Сумка-шопер з канвасу', cat: 'accessories', price: 780, g: 'tote', colors: [C.ecru, C.black], sizes: [''], featured: true,
    desc: 'Містка сумка з щільного канвасу з довгими ручками.',
    attrs: [['Матеріал', 'Щільний канвас'], ['Ручки', 'Довгі'], ['Догляд', 'Ручне прання']] },
  { name: 'Шапка-біні з вовни', cat: 'accessories', price: 640, g: 'beanie', colors: [C.melange, C.mustard, C.black], sizes: [''], isNew: true,
    desc: 'Тепла шапка-біні з відворотом. Один розмір.',
    attrs: [['Матеріал', 'Вовна'], ['Розмір', 'Універсальний'], ['Догляд', 'Делікатне прання']] },
  { name: 'Шарф вовняний', cat: 'accessories', price: 1350, old: 1650, g: 'scarf', colors: [C.red, C.grey], sizes: [''],
    desc: 'Довгий шарф з бахромою на кінцях.',
    attrs: [['Матеріал', 'Вовна'], ['Довжина', '180 см'], ['Догляд', 'Хімчистка']] },
];

async function img(g: Garment, color: string, i: number, view: 'front' | 'detail') {
  const png = await sharp(Buffer.from(productSvg({ garment: g, color, bg: BG[i % BG.length], view }))).png().toBuffer();
  return saveImage(png);
}

const STAMP = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

const catIds = new Map<string, number>();
const catImages = new Map<string, string>();

for (const [i, c] of cats.entries()) {
  const r = run('INSERT INTO categories (slug, name, description, sort_order) VALUES (?, ?, ?, ?)', c.slug, c.name, c.description, i);
  catIds.set(c.slug, Number(r.lastInsertRowid));
}

let n = 0;
for (const [pi, p] of products.entries()) {
  const first = p.colors[0];
  const images = [await img(p.g, first.hex, pi, 'front'), await img(p.g, first.hex, pi + 1, 'detail')];
  if (!catImages.has(p.cat)) catImages.set(p.cat, images[0]);
  tx(() => {
    let slug = slugify(p.name);
    for (let k = 2; get('SELECT 1 FROM products WHERE slug = ?', slug); k++) slug = `${slugify(p.name)}-${k}`;
    const ts = STAMP(pi * 7 + (p.isNew ? 0 : 24 * 30));
    const r = run(
      `INSERT INTO products (slug, name, description, category_id, price, old_price, is_new, is_featured, attributes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug, p.name, p.desc, catIds.get(p.cat)!, p.price, p.old ?? null, +!!p.isNew, +!!p.featured, JSON.stringify(p.attrs.map(([name, value]) => ({ name, value }))), ts, ts,
    );
    const id = Number(r.lastInsertRowid);
    images.forEach((u, i) => run('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)', id, u, `${p.name} — ${first.name.toLowerCase()}${i ? ', деталь' : ''}`, i));
    for (const [ci, col] of p.colors.entries()) {
      for (const [si, size] of p.sizes.entries()) {
        // Детермінований «розкид» залишків: є і великі, і малі, і нульові
        const stock = (pi * 7 + ci * 3 + si * 5) % 11 === 0 ? 0 : 2 + ((pi + ci * 2 + si * 3) % 9);
        run('INSERT INTO variants (product_id, size, color, color_hex, sku, stock) VALUES (?, ?, ?, ?, ?, ?)', id, size, col.name, col.hex, `${p.cat.slice(0, 3).toUpperCase()}${String(pi + 1).padStart(2, '0')}-${ci + 1}${size ? `-${size}` : ''}`, stock);
      }
    }
  });
  n++;
}

for (const [slug, url] of catImages) run('UPDATE categories SET image = ? WHERE slug = ?', url, slug);

// Hero-зображення (композиція з тих самих ілюстрацій)
const heroPng = await sharp(Buffer.from(heroSvg(['#b8a68a', '#8d8f93', '#f1ede6', '#c9764f'], ['#efeae2', '#d3c9ba']))).png().toBuffer();
const heroUrl = await saveImage(heroPng);
setSetting('hero', { ...DEFAULT_SETTINGS.hero, image: heroUrl });

// Юридичні та інформаційні сторінки — ЧЕРНЕТКИ. Власник має замінити їх і перевірити в юриста.
const DRAFT = '[ЧЕРНЕТКА — замініть цей текст на дійсні умови вашого магазину та перевірте його перед запуском.]';
const pages: [string, string, string][] = [
  ['about', 'Про магазин', `${DRAFT}\n\nМи — демонстраційний магазин мінімалістичного одягу та аксесуарів. Розкажіть тут про свій бренд, асортимент і підхід до роботи.\n\n## Що можна змінити\n\nНазву, логотип, тексти, фотографії, ціни та контакти змінюються в панелі керування без правки коду.`],
  ['delivery', 'Доставка та оплата', `${DRAFT}\n\n## Доставка\n\nДоступні способи доставки та їхня вартість показуються під час оформлення замовлення. Терміни та тарифи вкажіть відповідно до вашої служби доставки.\n\n## Оплата\n\nОплата при отриманні та (після підключення платіжного провайдера) оплата карткою онлайн. Платіжні дані обробляє провайдер, магазин їх не зберігає.`],
  ['returns', 'Умови повернення', `${DRAFT}\n\nОпишіть тут строки та порядок повернення й обміну товару відповідно до законодавства вашої країни.`],
  ['privacy', 'Політика конфіденційності', `${DRAFT}\n\n## Які дані ми збираємо\n\nПід час оформлення замовлення магазин отримує ім’я, телефон, email (за бажанням) і адресу доставки — лише для виконання замовлення.\n\n## Як ми їх використовуємо\n\nОпишіть мету обробки, строки зберігання, права покупців і контакт відповідальної особи.`],
];
for (const [slug, title, body] of pages) run('INSERT INTO pages (slug, title, body) VALUES (?, ?, ?)', slug, title, body);

console.log(`Готово: ${cats.length} категорій, ${n} товарів, ${all('SELECT id FROM variants').length} варіантів, ${pages.length} сторінок.`);
maybeAdmin();

function maybeAdmin() {
  if (config.admin.email && config.admin.password) {
    const r = createAdmin(config.admin.email, config.admin.password);
    console.log(r === 'created' ? `Адміністратора ${config.admin.email} створено.` : `Пароль адміністратора ${config.admin.email} оновлено.`);
  } else {
    console.log('Адміністратора не створено: задайте ADMIN_EMAIL і ADMIN_PASSWORD (≥10 символів) і виконайте `npm run create-admin`.');
  }
}
