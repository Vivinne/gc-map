/** @type {import('next').NextConfig} */
// Pure static export (out/). BASE_PATH serves the site from a sub-path, e.g. BASE_PATH=/gc-map/atlas for
// https://vivinne.github.io/gc-map/atlas/ on GitHub Pages; leave it empty for a site at the domain root.
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
