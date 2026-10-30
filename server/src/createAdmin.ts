import { migrate } from './db.ts';
import { createAdmin } from './services/auth.ts';
import { config } from './config.ts';

// Використання: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin
// (або задайте їх у .env). Публічної реєстрації адміністраторів немає.
migrate(false);
const { email, password } = config.admin;
if (!email || !password) {
  console.error('Задайте ADMIN_EMAIL та ADMIN_PASSWORD (у .env або в середовищі).');
  process.exit(1);
}
try {
  const r = createAdmin(email, password);
  console.log(r === 'created' ? `Адміністратора ${email} створено.` : `Пароль адміністратора ${email} оновлено.`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
