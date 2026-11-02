'use client';

import dynamic from 'next/dynamic';

// The map needs the browser (WebGL, window), so the whole app renders on the client only
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <div className="boot">Loading the atlas</div> });

export default function ClientEntry() {
  return <App />;
}
