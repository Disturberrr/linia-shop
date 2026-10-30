import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.ts';
import { HttpError } from '../lib/http.ts';

export const UPLOAD_DIR = path.join(config.dataDir, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const IMAGE_WIDTHS = [400, 800, 1600] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Тип визначаємо за «магічними» байтами, а не за заголовком Content-Type чи розширенням. */
export function sniffImage(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

/**
 * Перевіряє файл, перекодовує в WebP трьох розмірів (400/800/1600) і повертає базовий URL
 * без суфікса, наприклад `/uploads/ab12…`. Оригінал не зберігається (разом із EXIF/метаданими).
 */
export async function saveImage(buf: Buffer): Promise<string> {
  if (!sniffImage(buf)) throw new HttpError(415, 'Підтримуються лише зображення JPEG, PNG або WebP');
  const id = crypto.randomBytes(8).toString('hex');
  try {
    for (const w of IMAGE_WIDTHS) {
      await sharp(buf, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(UPLOAD_DIR, `${id}.w${w}.webp`));
    }
  } catch {
    for (const w of IMAGE_WIDTHS) fs.rmSync(path.join(UPLOAD_DIR, `${id}.w${w}.webp`), { force: true });
    throw new HttpError(422, 'Не вдалося обробити зображення. Файл пошкоджений або завеликий за роздільною здатністю.');
  }
  return `/uploads/${id}`;
}

export function removeImage(base: string) {
  const m = /^\/uploads\/([a-f0-9]{16})$/.exec(base);
  if (!m) return;
  for (const w of IMAGE_WIDTHS) fs.rmSync(path.join(UPLOAD_DIR, `${m[1]}.w${w}.webp`), { force: true });
}
