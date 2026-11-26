/**
 * Page address writes (history.replaceState), kept under the browser's rate limit.
 *
 * Safari allows at most 100 replaceState calls per 10 seconds and throws past that; the error took the
 * whole page down (B9). Every screen change and every map stop wants a new address, and a phone keyboard
 * sliding up or down stops the map on every frame. So:
 * - an address equal to the current one is not written;
 * - two writes are at least GAP ms apart; changes in between are folded into one write of the newest address
 *   (at most 10000 / GAP + 1 writes in any 10 s, far below the limit however fast the taps);
 * - when the page is left (reload, close, switch app) the waiting address is written at once, so a reload
 *   or a copied link still opens the screen that was last shown;
 * - a write the browser refuses is skipped instead of breaking the page.
 */

/** Shortest time between two address writes (ms): 40 writes per 10 s at most */
export const ADDRESS_GAP = 250;

export interface Clock {
  now(): number;
  later(f: () => void, ms: number): unknown;
  cancel(t: unknown): void;
}

export interface AddressWriter {
  /** Ask for this address; it is written now or within GAP ms */
  set(url: string): void;
  /** Write the waiting address now */
  flush(): void;
}

/**
 * Writer with its own clock and page access, so tests can drive it.
 * `read` gives the current address, `write` changes it (may throw).
 */
export function createAddressWriter(read: () => string, write: (url: string) => void, clock: Clock, gap = ADDRESS_GAP): AddressWriter {
  let pending: string | null = null;
  let timer: unknown = null;
  let last = -Infinity;

  const commit = () => {
    timer = null;
    const url = pending;
    pending = null;
    if (url === null || url === read()) return;
    try {
      write(url);
    } catch {
      /* refused by the browser: the next change tries again */
    }
    last = clock.now();
  };

  return {
    set(url) {
      pending = url;
      if (timer !== null) return;
      const wait = last + gap - clock.now();
      if (wait <= 0) commit();
      else timer = clock.later(commit, wait);
    },
    flush() {
      if (timer !== null) clock.cancel(timer);
      commit();
    },
  };
}

let page: AddressWriter | null = null;

function pageWriter(): AddressWriter {
  if (page) return page;
  const w = createAddressWriter(
    () => window.location.pathname + window.location.search + window.location.hash,
    (url) => window.history.replaceState(window.history.state, '', url),
    { now: () => performance.now(), later: (f, ms) => window.setTimeout(f, ms), cancel: (t) => window.clearTimeout(t as number) },
  );
  window.addEventListener('pagehide', () => w.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') w.flush();
  });
  page = w;
  return w;
}

/** Write a waiting address now (before the page loads again by itself) */
export function flushAddress(): void {
  pageWriter().flush();
}

/** Change the page address (path + query + hash), within the rate limit */
export function setAddress(url: string): void {
  pageWriter().set(url);
}
