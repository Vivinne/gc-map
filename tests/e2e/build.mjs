import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../.e2e');
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [resolve(here, 'main.tsx')],
  bundle: true,
  outfile: resolve(out, 'bundle.js'),
  format: 'iife',
  jsx: 'automatic',
  loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': '"development"' },
  // Not needed once the project has run npm install; in an environment with global installs, point NODE_PATH at them
  nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
  logLevel: 'info',
  plugins: [{
    name: 'stub-mapview',
    setup(b) {
      b.onResolve({ filter: /\/MapView$/ }, () => ({ path: resolve(here, 'MapViewStub.tsx') }));
    },
  }],
});
writeFileSync(resolve(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${resolve(here, '../../src/app/globals.css')}"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);
console.log('built', out);
