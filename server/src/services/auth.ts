import crypto from 'node:crypto';
import { get, run } from '../db.ts';

const SESSION_TTL_SEC = 60 * 60 * 12; // 12 годин

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Фіктивний хеш, щоб час відповіді не відрізнявся для існуючих/неіснуючих email
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function login(email: string, password: string) {
  const user = get<{ id: number; email: string; password_hash: string; role: string }>(
    'SELECT id, email, password_hash, role FROM users WHERE email = ?',
    email.toLowerCase(),
  );
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, Math.floor(Date.now() / 1000) + SESSION_TTL_SEC);
  return { token, ttl: SESSION_TTL_SEC, user: { id: user.id, email: user.email, role: user.role } };
}

export function userFromToken(token: string | undefined) {
  if (!token) return undefined;
  const row = get<{ id: number; email: string; role: string; expires_at: number }>(
    `SELECT u.id, u.email, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return undefined;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
    return undefined;
  }
  return { id: row.id, email: row.email, role: row.role };
}

export function logout(token: string | undefined) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Math.floor(Date.now() / 1000));
}

export function createAdmin(email: string, password: string) {
  if (password.length < 10) throw new Error('Пароль має містити щонайменше 10 символів');
  const hash = hashPassword(password);
  const existing = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email.toLowerCase());
  if (existing) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hash, existing.id);
    run('DELETE FROM sessions WHERE user_id = ?', existing.id);
    return 'updated' as const;
  }
  run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', email.toLowerCase(), hash, 'admin');
  return 'created' as const;
}
