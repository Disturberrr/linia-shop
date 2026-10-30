import { migrate, dbFile } from './db.ts';

migrate();
console.log(`База даних готова: ${dbFile}`);
