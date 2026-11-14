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
