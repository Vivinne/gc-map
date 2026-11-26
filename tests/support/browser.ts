/* Test support: browser storage and window for tests that run outside a browser. Import it first. */
class Store {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.localStorage = new Store();
g.sessionStorage = new Store();
export {};
