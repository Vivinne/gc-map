// Generates a single-page build that opens by double-click and also works on any static host: site/index.html + app.js + app.css
// No Next.js needed. Needs a network: MapLibre script and style come from jsDelivr, basemap tiles from OpenFreeMap.
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => resolve(root, ...a);
const out = P(process.env.SITE_OUT ?? 'site');

const MAPLIBRE = '5.6.0';
const CDN = (v, f) => `https://cdn.jsdelivr.net/npm/maplibre-gl@${v}/dist/${f}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: [P('src/standalone/main.tsx')],
  bundle: true,
  minify: true,
  outfile: resolve(out, 'app.js'),
  format: 'iife',
  jsx: 'automatic',
  target: 'es2020',
  loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
  alias: { 'maplibre-gl': P('src/standalone/maplibre-global.ts') },
  plugins: [{
    name: 'css-via-link',
    setup(b) {
      // MapLibre's stylesheet is loaded by index.html through a <link> tag
      b.onResolve({ filter: /maplibre-gl\.css$/ }, () => ({ path: 'maplibre-css', namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
    },
  }],
  logLevel: 'warning',
});

copyFileSync(P('src/app/globals.css'), resolve(out, 'app.css'));
copyFileSync(P('public/robots.txt'), resolve(out, 'robots.txt'));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GC Buildings Map</title>
<link id="ml-css" rel="stylesheet" href="${CDN(MAPLIBRE, 'maplibre-gl.css')}">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="root"><p class="boot">Loading…</p></div>
<noscript><p class="boot">JavaScript must be enabled.</p></noscript>
<script>
(function () {
  // MapLibre: load the pinned version first; on failure fall back to the @5 range; if that fails too, show the reason. app.js starts only after MapLibre has loaded.
  var root = document.getElementById('root');
  function add(src, ok, fail) {
    var s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  }
  function app() { add('app.js', function () {}, function () { root.innerHTML = '<p class="boot">app.js failed to load.</p>'; }); }
  function giveUp() {
    root.innerHTML = '<p class="boot">Could not load MapLibre (jsDelivr). Check your network connection and refresh.</p>';
  }
  add('${CDN(MAPLIBRE, 'maplibre-gl.js')}', app, function () {
    var css = document.getElementById('ml-css');
    css.href = '${CDN('5', 'maplibre-gl.css')}';
    add('${CDN('5', 'maplibre-gl.js')}', app, giveUp);
  });
})();
</script>
</body>
</html>
`;
writeFileSync(resolve(out, 'index.html'), html);

const data = JSON.parse(readFileSync(P('src/data/places.json'), 'utf8'));
const pts = data.places.flatMap((p) => p.points);
const nEst = pts.filter((x) => x.precision === 'estimate').length;
const nWiki = pts.filter((x) => /^https:\/\/[a-z]{2}\.wikipedia\.org\//.test(x.sourceUrl)).length;
const nOther = pts.length - nEst - nWiki;
const nGap = data.places.filter((p) => !p.points.length).length;
writeFileSync(resolve(out, 'README.txt'), `GC Buildings Map (static build)

Opening
  Unzip and double-click index.html. A network is needed: the MapLibre script comes from jsDelivr and the basemap tiles from OpenFreeMap.
  If the map is blank or shows a load failure, open a terminal in this folder and run
      python3 -m http.server 3000
  then open http://localhost:3000 in a browser.

Contents
  Handout C3 §6 has ${data.places.length} rows and ${pts.length} map markers.
  ${nWiki} markers come from Wikipedia and ${nOther} from other web pages (named in the note); all are marked "Supplementary - to be verified" and the detail panel links to the source.
  ${nEst ? `${nEst} markers are memory estimates with no source; check each one.` : 'No marker is a memory estimate; every coordinate has a source.'}
  ${nGap ? `${nGap} rows have no coordinate and are listed in the sidebar "Unlocated list".` : 'Every row has a coordinate.'}

Publishing
  The whole folder can go on any static host (Cloudflare Pages, Netlify, GitHub Pages).
  Once published, anyone who knows the URL can open it. noindex and robots.txt are included, but that is not confidentiality;
  to restrict access, use the host's access control (for example Cloudflare Access).

Updating the data
  This folder is a generated snapshot. After the data changes, run npm run site in the project root to regenerate it.
`);
console.log(`site written: ${out} (app.js ${(readFileSync(resolve(out, 'app.js')).length / 1024).toFixed(0)} KB)`);
