import { all, get, run } from '../db.ts';
import { config } from '../config.ts';

export interface DeliveryMethod {
  id: string;
  name: string;
  description: string;
  /** Вартість у гривнях. 0 + variable=true означає «за тарифами перевізника» */
  price: number;
  variable: boolean;
  /** Безкоштовно від суми (null — ніколи) */
  freeFrom: number | null;
  /** branch — відділення, address — адреса, pickup — самовивіз */
  kind: 'branch' | 'address' | 'pickup';
  enabled: boolean;
}

export interface PaymentMethod {
  id: 'cod' | 'card';
  name: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_SETTINGS = {
  store: {
    name: 'LINIA',
    tagline: 'Одяг та аксесуари',
    /** URL завантаженого логотипа (порожньо — показується назва текстом) */
    logo: '',
    description: 'Мінімалістичний одяг та аксесуари на щодень. Демонстраційний магазин: тексти, фото та ціни замініть у панелі керування.',
    currency: '₴',
  },
  hero: {
    eyebrow: 'Нова колекція',
    title: 'Спокійний стиль на кожен день',
    subtitle: 'Базові речі нейтральних відтінків, які легко поєднувати між собою.',
    image: '',
    ctaPrimary: 'Перейти до каталогу',
    ctaSecondary: 'Дивитися новинки',
  },
  contacts: {
    phone: '+380 00 000 00 00',
    email: 'hello@example.com',
    address: 'Адресу вкажіть у налаштуваннях магазину',
    hours: 'Пн–Пт 10:00–18:00',
    instagram: '',
    facebook: '',
    telegram: '',
  },
  advantages: [
    { title: 'Зручне замовлення', text: 'Кілька кроків від кошика до підтвердження замовлення.' },
    { title: 'Зрозумілі умови доставки', text: 'Способи та вартість доставки видно до оформлення.' },
    { title: 'Безпечна оплата', text: 'Платіжні дані обробляє платіжний провайдер, а не магазин.' },
    { title: 'Підтримка покупців', text: 'Відповімо на питання щодо замовлення за контактами магазину.' },
  ],
  deliveryMethods: [
    { id: 'np-branch', name: 'Нова пошта — відділення', description: 'Вартість за тарифами перевізника', price: 0, variable: true, freeFrom: null, kind: 'branch', enabled: true },
    { id: 'np-courier', name: 'Нова пошта — кур’єр', description: 'Вартість за тарифами перевізника', price: 0, variable: true, freeFrom: null, kind: 'address', enabled: true },
    { id: 'pickup', name: 'Самовивіз', description: 'Адреса самовивозу — у контактах магазину', price: 0, variable: false, freeFrom: null, kind: 'pickup', enabled: true },
  ] as DeliveryMethod[],
  paymentMethods: [
    { id: 'cod', name: 'Оплата при отриманні', description: 'Оплата під час отримання замовлення', enabled: true },
    { id: 'card', name: 'Оплата карткою онлайн', description: 'Через платіжного провайдера (LiqPay)', enabled: true },
  ] as PaymentMethod[],
};

export type Settings = typeof DEFAULT_SETTINGS;

export function getSettings(): Settings {
  const stored = Object.fromEntries(all<{ key: string; value: string }>('SELECT key, value FROM settings').map((r) => [r.key, JSON.parse(r.value)]));
  const out: any = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const s = stored[k];
    out[k] = Array.isArray(def) ? (Array.isArray(s) ? s : def) : { ...(def as object), ...(s ?? {}) };
  }
  return out;
}

export function setSetting(key: keyof Settings, value: unknown) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

/** Чи доступна онлайн-оплата: потрібні ключі провайдера в середовищі. */
export const onlinePaymentConfigured = () => Boolean(config.liqpay.publicKey && config.liqpay.privateKey);

export function availablePaymentMethods() {
  return getSettings().paymentMethods.filter((m) => m.enabled && (m.id !== 'card' || onlinePaymentConfigured()));
}

export function getPage(slug: string) {
  return get<{ slug: string; title: string; body: string; updated_at: string }>('SELECT * FROM pages WHERE slug = ?', slug);
}
