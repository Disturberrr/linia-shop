// Розробка: збірка клієнта в режимі watch + сервер з автоперезапуском.
import { spawn } from 'node:child_process';
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [run('node', ['scripts/build.mjs', '--watch']), run('npx', ['tsx', 'watch', 'server/src/index.ts'])];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
