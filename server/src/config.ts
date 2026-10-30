import fs from 'node:fs';
import path from 'node:path';

// Мінімальний завантажувач .env (без залежностей). Змінні середовища мають пріоритет.
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
loadDotEnv(path.join(ROOT, '.env'));

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const isProd = env('NODE_ENV') === 'production';

export const config = {
  isProd,
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', `http://localhost:${env('PORT', '3000')}`).replace(/\/$/, ''),
  dataDir: path.resolve(ROOT, env('DATA_DIR', './data')),
  clientDir: path.join(ROOT, 'dist', 'client'),
  sessionSecret: env('SESSION_SECRET'),
  /** Ключ для HMAC-токенів замовлень. У dev є запасне значення, у production SESSION_SECRET обов'язковий. */
  get hmacKey() { return this.sessionSecret || 'dev-only-secret'; },
  unpaidCancelMinutes: Number(env('UNPAID_CANCEL_MINUTES', '120')),
  trustProxy: env('TRUST_PROXY') === 'true',
  admin: { email: env('ADMIN_EMAIL'), password: env('ADMIN_PASSWORD') },
  liqpay: { publicKey: env('LIQPAY_PUBLIC_KEY'), privateKey: env('LIQPAY_PRIVATE_KEY') },
  novaPoshtaKey: env('NOVAPOSHTA_API_KEY'),
  telegram: { token: env('TELEGRAM_BOT_TOKEN'), chatId: env('TELEGRAM_CHAT_ID') },
  email: {
    resendKey: env('RESEND_API_KEY'),
    from: env('NOTIFY_EMAIL_FROM'),
    to: env('NOTIFY_EMAIL_TO'),
  },
};

if (isProd && (!config.sessionSecret || config.sessionSecret === 'change-me')) {
  console.error('SESSION_SECRET не задано. Задайте довгий випадковий рядок у .env.');
  process.exit(1);
}
