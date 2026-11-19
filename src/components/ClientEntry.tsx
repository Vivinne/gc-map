'use client';

import dynamic from 'next/dynamic';
import { useFreshVersion } from '../lib/fresh';
import Guard from './Guard';

// The map needs the browser (WebGL, window), so the whole app renders on the client only
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <div className="boot">Loading the atlas</div> });

/** Inside another site's frame (S3): no app, only a link that opens the atlas in its own window */
const framed = typeof window !== 'undefined' && window.top !== window.self;

export default function ClientEntry() {
  useFreshVersion();
  if (framed) {
    return (
      <p className="moved">
        <a href={window.location.href} target="_top" rel="noopener">
          Open GC Atlas
        </a>
      </p>
    );
  }
  return (
    <Guard>
      <App />
    </Guard>
  );
}
