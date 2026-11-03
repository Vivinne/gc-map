'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';

// The map needs the browser (WebGL, window), so the whole app renders on the client only
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <div className="boot">Loading the atlas</div> });

const RELOADED = 'gc-atlas:reloaded';

/**
 * Last line of defence: an error anywhere in the app shows a short message with a reload button
 * instead of a blank page. Saved progress (seen, stars, collections, quiz) lives in localStorage and is kept.
 * A script that fails to load (an open page that still points at the files of an older deploy)
 * reloads the page once by itself to fetch the new files.
 */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = String((error as { name?: string; message?: string })?.name ?? '') + ' ' + String((error as { message?: string })?.message ?? '');
    if (!/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)) return;
    try {
      if (sessionStorage.getItem(RELOADED)) return;
      sessionStorage.setItem(RELOADED, '1');
    } catch {
      return;
    }
    window.location.reload();
  }

  componentDidMount() {
    // a successful start clears the one-reload guard
    window.setTimeout(() => {
      try {
        if (!this.state.failed) sessionStorage.removeItem(RELOADED);
      } catch {
        /* storage blocked */
      }
    }, 5000);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <p>Something went wrong. Your saved progress is safe.</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export default function ClientEntry() {
  return (
    <Guard>
      <App />
    </Guard>
  );
}
