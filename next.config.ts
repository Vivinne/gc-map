import type { NextConfig } from 'next';

// Pure static export (out/). BASE_PATH serves the site from a sub-path, e.g. BASE_PATH=/gc-map for
// https://vivinne.github.io/gc-map/ on GitHub Pages; leave it empty for a site at the domain root.
// The build's own id, written into every page (meta gc-build): an open page compares it with the live one to
// load a newer deploy (src/lib/fresh.ts). Next.js 16 no longer writes its build id at the top of the page.
const BUILD = process.env.GITHUB_SHA?.slice(0, 12) || `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  output: 'export',
  env: { NEXT_PUBLIC_GC_BUILD: BUILD },
  basePath: process.env.BASE_PATH || '',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
