'use client';

import dynamic from 'next/dynamic';

// maplibre-gl reads window at import time, so load it in the browser only
const MapApp = dynamic(() => import('./MapApp'), {
  ssr: false,
  loading: () => <p className="boot">Loading map…</p>,
});

export default function ClientEntry() {
  return <MapApp />;
}
