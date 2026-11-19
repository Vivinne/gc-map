import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/archivo/wdth.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

/**
 * Content security rule (S4): scripts, styles, fonts and images from this site only, map data from this site and
 * OpenFreeMap, no plugins, no forms. Next.js writes small inline scripts and React inline styles, so those stay allowed.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export const metadata: Metadata = {
  title: 'GC Atlas',
  description: 'General Culture buildings on a map',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
  // light only, also when a phone browser forces web pages dark: the map stays light, so the page does too (N23)
  colorScheme: 'only light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* only this site and the OpenFreeMap tile server may be used by the page (S4) */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        {/* the street tiles come from OpenFreeMap: open the connection while the app script loads */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
