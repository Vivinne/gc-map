// Single-file build: bundles the same React app (src/standalone/main.tsx) with MapLibre, the data,
// the offline basemap, the CSS and the Archivo font into self-contained HTML files in site/:
//   index.html     keeps the view in the address (#m=...&b=...), for disk, GitHub Pages or any static host
//   artifact.html  same page without address state, for hosts that only pass a plain #name (claude.ai artifacts)
// Street tiles load only where the network allows; the offline basemap always draws.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../site/', import.meta.url);
mkdirSync(out, { recursive: true });

function bundle(hashState) {
  return build({
    entryPoints: [new URL('../src/standalone/main.tsx', import.meta.url).pathname],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    jsx: 'automatic',
    outdir: 'bundle',
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.GC_HASH': JSON.stringify(hashState) },
    legalComments: 'none',
    logLevel: 'warning',
  });
}

function page(result) {
  const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text;
  // Keep "</script" out of the inline script
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<title>GC Atlas</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${safeJs}</script>
</body>
</html>
`;
}

for (const [name, hashState] of [['index.html', 'on'], ['artifact.html', 'off']]) {
  const html = page(await bundle(hashState));
  writeFileSync(new URL(name, out), html);
  console.log(`site/${name} written (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}
