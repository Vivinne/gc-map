// Single-file build: bundles the same React app (src/standalone/main.tsx) with MapLibre, the data,
// the offline basemap, the CSS and the Archivo font into self-contained HTML files in site/:
//   index.html     keeps the screen in the address, for disk or any static host
//   artifact.html  same page, for hosts that only pass a plain #name (claude.ai artifacts)
// The published site is the Next.js export (npm run build); this build is only for single-file copies.
// Street tiles load only where the network allows; the offline basemap always draws.
// Run: npm run site
import { build, type BuildResult } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../site/', import.meta.url);
mkdirSync(out, { recursive: true });

function bundle(): Promise<BuildResult<{ write: false }>> {
  return build({
    entryPoints: [new URL('../src/standalone/main.tsx', import.meta.url).pathname],
    bundle: true,
    write: false,
    minify: process.env.NO_MINIFY !== '1',
    format: 'iife',
    target: ['es2020', 'safari15'],
    jsx: 'automatic',
    outdir: 'bundle',
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
}

function page(result: BuildResult<{ write: false }>): string {
  const file = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
  // Keep "</script" out of the inline script
  const js = file('.js').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<title>GC Atlas</title>
<style>${file('.css')}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
}

void bundle().then((result) => {
  const html = page(result);
  for (const name of ['index.html', 'artifact.html']) {
    writeFileSync(new URL(name, out), html);
    console.log(`site/${name} written (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
  }
});
