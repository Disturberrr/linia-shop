let currency = '₴';
export const setCurrency = (c: string) => { currency = c; };
const nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
export const money = (n: number) => `${nf.format(n)} ${currency}`;
export const dateTime = (iso: string) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const discountPct = (price: number, old: number | null) => (old && old > price ? Math.round((1 - price / old) * 100) : 0);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).padEnd(24, 'x');
