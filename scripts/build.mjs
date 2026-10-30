// Збірка клієнта: esbuild → dist/client (JS/CSS з хешами, index.html із підставленими тегами).
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist', 'client');
const watch = process.argv.includes('--watch');

function options() {
  return {
    entryPoints: { app: path.join(root, 'client/src/main.tsx') },
    outdir: path.join(out, 'assets'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    metafile: true,
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    loader: { '.svg': 'dataurl', '.woff2': 'file' },
    logLevel: 'info',
  };
}

function finish(meta) {
  const files = Object.keys(meta.outputs).map((f) => path.relative(out, path.resolve(root, f)).split(path.sep).join('/'));
  const entry = Object.entries(meta.outputs).find(([, o]) => o.entryPoint);
  const js = path.relative(out, path.resolve(root, entry[0])).split(path.sep).join('/');
  const css = files.find((f) => f.startsWith('assets/app-') && f.endsWith('.css'));
  let html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  html = html.replace('<!--assets-head-->', css ? `<link rel="stylesheet" href="/${css}">` : '');
  html = html.replace('<!--assets-body-->', `<script type="module" src="/${js}"></script>`);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const pub = path.join(root, 'client/public');
  if (fs.existsSync(pub)) fs.cpSync(pub, out, { recursive: true });
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

if (watch) {
  const ctx = await context({
    ...options(),
    plugins: [{ name: 'finish', setup(b) { b.onEnd((r) => { if (r.metafile) { try { finish(r.metafile); } catch (e) { console.error(e); } } }); } }],
  });
  await ctx.watch();
  console.log('Збірка клієнта у режимі спостереження…');
} else {
  const r = await build(options());
  finish(r.metafile);
  const kb = (f) => (fs.statSync(path.join(root, f)).size / 1024).toFixed(1);
  for (const f of Object.keys(r.metafile.outputs).filter((f) => !f.endsWith('.map'))) console.log(`  ${path.relative(root, f)}  ${kb(f)} KB`);
}
