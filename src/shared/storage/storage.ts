/**
 * Per-browser settings kept between visits (recent searches and buildings), under the gc-atlas: prefix.
 * Browser storage can be missing or throw (private mode, sandboxed frames), so every access is guarded
 * and the app keeps working from memory.
 */
const PREFIX = 'gc-atlas:';
const memory = new Map<string, string>();

export function load<T>(key: string, fallback: T): T {
  let raw: string | null = memory.get(key) ?? null;
  try {
    raw = window.localStorage.getItem(PREFIX + key) ?? raw;
  } catch {
    /* storage unavailable */
  }
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Per-tab values (this tab only, kept over a reload): the history behind ＜, typed text, sheet heights.
 * Blocked storage reads as nothing and writes are dropped; the app then keeps the value in memory only.
 */
export function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

export function sessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}
