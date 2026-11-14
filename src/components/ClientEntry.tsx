'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, type ReactNode } from 'react';

// The map needs the browser (WebGL, window), so the whole app renders on the client only
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <div className="boot">Loading the atlas</div> });

const RELOADED = 'gc-atlas:reloaded';

/**
 * Last line of defence: an error anywhere in the app shows a short message with a reload button
 * instead of a blank page. Data saved in the browser (localStorage) is kept.
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

/** Build id written by Next.js as the first comment of the exported page */
const buildOf = (html: string) => /^<!DOCTYPE html><!--([\w-]+)-->/i.exec(html)?.[1] ?? '';

/**
 * Keep phones on the newest version: in-app browsers (LINE, Instagram, ...) keep an old copy of the page.
 * At start and whenever the page comes back to the screen, the live page is fetched past every cache; if
 * it is a newer build, the page loads again under a fresh address so no cache can serve the old copy.
 */
function useFreshVersion() {
  useEffect(() => {
    const mine = document.firstChild?.nextSibling?.nodeType === Node.COMMENT_NODE ? (document.firstChild.nextSibling as Comment).data.trim() : '';
    // the fresh address did its job: drop it from the address bar
    const q = new URLSearchParams(location.search);
    const tried = q.get('v') ?? '';
    if (q.has('v')) {
      q.delete('v');
      history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    }
    if (!mine) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetch(`${location.pathname}?fresh=${Date.now()}`, { cache: 'no-store' });
        const live = r.ok ? buildOf((await r.text()).slice(0, 200)) : '';
        // once per build: if the fresh address still brought the old copy, stay on it rather than loop
        let done = tried === live;
        try {
          done ||= sessionStorage.getItem('gc-atlas:fresh') === live;
          if (live && live !== mine && !done) sessionStorage.setItem('gc-atlas:fresh', live);
        } catch {
          /* storage blocked: the address check above still stops a loop */
        }
        if (live && live !== mine && !done) location.replace(`${location.pathname}?v=${live}`);
      } catch {
        /* offline: keep the copy we have */
      } finally {
        busy = false;
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);
}

export default function ClientEntry() {
  useFreshVersion();
  return (
    <Guard>
      <App />
    </Guard>
  );
}
