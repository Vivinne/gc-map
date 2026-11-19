import { useEffect } from 'react';
import { flushAddress, setAddress } from './address';

/** Build id of a page: its meta gc-build (from 2026-11-20), else the comment Next.js 15 wrote at the top */
const buildOf = (html: string) => /<meta name="gc-build" content="([\w-]+)"/.exec(html)?.[1] ?? /^<!DOCTYPE html><!--([\w-]+)-->/i.exec(html)?.[1] ?? '';

/**
 * Keep phones on the newest version: in-app browsers (LINE, Instagram, ...) keep an old copy of the page.
 * At start and whenever the page comes back to the screen, the live page is fetched past every cache; if
 * it is a newer build, the page loads again under a fresh address so no cache can serve the old copy.
 */
export function useFreshVersion() {
  useEffect(() => {
    const mine = document.querySelector<HTMLMetaElement>('meta[name="gc-build"]')?.content ?? '';
    // the fresh address did its job: drop it from the address bar
    const q = new URLSearchParams(location.search);
    const tried = q.get('v') ?? '';
    if (q.has('v')) {
      q.delete('v');
      setAddress(location.pathname + (q.size ? `?${q}` : '') + location.hash);
    }
    if (!mine) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetch(`${location.pathname}?fresh=${Date.now()}`, { cache: 'no-store' });
        const live = r.ok ? buildOf(await r.text()) : '';
        // once per build: if the fresh address still brought the old copy, stay on it rather than loop
        let done = tried === live;
        try {
          done ||= sessionStorage.getItem('gc-atlas:fresh') === live;
          if (live && live !== mine && !done) sessionStorage.setItem('gc-atlas:fresh', live);
        } catch {
          /* storage blocked: the address check above still stops a loop */
        }
        if (live && live !== mine && !done) {
          // the fresh address keeps the screen's own address: the new copy opens the same screen, and the
          // history behind ＜ (kept for this tab) comes back with it
          flushAddress();
          const next = new URLSearchParams(location.search);
          next.set('v', live);
          location.replace(`${location.pathname}?${next}${location.hash}`);
        }
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
