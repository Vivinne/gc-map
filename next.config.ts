import type { NextConfig } from 'next';

// Pure static export (out/). BASE_PATH serves the site from a sub-path, e.g. BASE_PATH=/gc-map for
// https://vivinne.github.io/gc-map/ on GitHub Pages; leave it empty for a site at the domain root.
const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.BASE_PATH || '',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
