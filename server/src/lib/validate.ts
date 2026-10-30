// Невелика бібліотека валідації (замість Zod, який недоступний у цьому середовищі).
// API навмисно схожий: v.object({...}).parse(data) кидає ValidationError з полями-помилками.

export class ValidationError extends Error {
  constructor(public issues: Record<string, string>) {
    super('Validation failed');
  }
}

export type Parser<T> = (value: unknown, path: string, issues: Record<string, string>) => T | undefined;

const fail = (issues: Record<string, string>, path: string, msg: string) => {
  issues[path || '_'] = msg;
  return undefined;
};

export const v = {
  string(o: { min?: number; max?: number; pattern?: RegExp; msg?: string; trim?: boolean } = {}): Parser<string> {
    return (val, path, issues) => {
      if (typeof val !== 'string') return fail(issues, path, 'Має бути текстом');
      const s = o.trim === false ? val : val.trim();
      if (o.min !== undefined && s.length < o.min) return fail(issues, path, o.min === 1 ? "Обов'язкове поле" : `Мінімум ${o.min} символів`);
      if (o.max !== undefined && s.length > o.max) return fail(issues, path, `Максимум ${o.max} символів`);
      if (o.pattern && !o.pattern.test(s)) return fail(issues, path, o.msg ?? 'Невірний формат');
      return s;
    };
  },
  int(o: { min?: number; max?: number } = {}): Parser<number> {
    return (val, path, issues) => {
      if (typeof val !== 'number' || !Number.isInteger(val)) return fail(issues, path, 'Має бути цілим числом');
      if (o.min !== undefined && val < o.min) return fail(issues, path, `Не менше ${o.min}`);
      if (o.max !== undefined && val > o.max) return fail(issues, path, `Не більше ${o.max}`);
      return val;
    };
  },
  bool(): Parser<boolean> {
    return (val, path, issues) => (typeof val === 'boolean' ? val : fail(issues, path, 'Має бути так/ні'));
  },
  oneOf<T extends string>(values: readonly T[]): Parser<T> {
    return (val, path, issues) =>
      typeof val === 'string' && (values as readonly string[]).includes(val) ? (val as T) : fail(issues, path, 'Недопустиме значення');
  },
  optional<T>(p: Parser<T>): Parser<T | undefined> {
    return (val, path, issues) => (val === undefined || val === null || val === '' ? undefined : p(val, path, issues));
  },
  nullable<T>(p: Parser<T>): Parser<T | null> {
    return (val, path, issues) => (val === null || val === undefined || val === '' ? null : (p(val, path, issues) as T | undefined) ?? undefined) as any;
  },
  array<T>(p: Parser<T>, o: { min?: number; max?: number } = {}): Parser<T[]> {
    return (val, path, issues) => {
      if (!Array.isArray(val)) return fail(issues, path, 'Має бути списком');
      if (o.min !== undefined && val.length < o.min) return fail(issues, path, `Мінімум елементів: ${o.min}`);
      if (o.max !== undefined && val.length > o.max) return fail(issues, path, `Максимум елементів: ${o.max}`);
      const out: T[] = [];
      val.forEach((item, i) => {
        const r = p(item, `${path}[${i}]`, issues);
        if (r !== undefined) out.push(r);
      });
      return out;
    };
  },
  object<S extends Record<string, Parser<any>>>(shape: S): Parser<{ [K in keyof S]: S[K] extends Parser<infer T> ? T : never }> & {
    parse(data: unknown): { [K in keyof S]: S[K] extends Parser<infer T> ? T : never };
  } {
    const parser = ((val: unknown, path: string, issues: Record<string, string>) => {
      if (typeof val !== 'object' || val === null || Array.isArray(val)) return fail(issues, path, 'Очікується об’єкт');
      const out: any = {};
      for (const [key, p] of Object.entries(shape)) {
        const r = p((val as any)[key], path ? `${path}.${key}` : key, issues);
        if (r !== undefined) out[key] = r;
      }
      return out;
    }) as any;
    parser.parse = (data: unknown) => {
      const issues: Record<string, string> = {};
      const r = parser(data, '', issues);
      if (Object.keys(issues).length) throw new ValidationError(issues);
      return r;
    };
    return parser;
  },
};

/** Розбирає значення будь-яким парсером (у т.ч. масивом) і кидає ValidationError. */
export function parseWith<T>(parser: Parser<T>, data: unknown): T {
  const issues: Record<string, string> = {};
  const out = parser(data, '', issues);
  if (Object.keys(issues).length) throw new ValidationError(issues);
  return out as T;
}

export const PHONE_RE = /^\+?[0-9()\-\s]{9,18}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
