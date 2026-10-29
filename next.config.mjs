/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export (out/); no server needed; no rewrites / redirects / headers / Server Actions / ISR
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
