/*
 * Style ownership (MODULES.md): each class is styled by one style file only, so a change to one module's look can
 * not reach another module. A class counts as styled by a file when it is the subject of a selector there (its last
 * part); classes used as context (".is-mobile .credit") or as a state of the file's own part (".rail-btn.on") are free.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'src');

/** Agreed local adjustments: the card styles the shared title row and the sheet handle on its own panel only */
const ALLOWED: Record<string, string[]> = {
  'h-bar': ['shared/ui/ui.css', 'features/card/card.css'],
  'h-ic': ['shared/ui/ui.css', 'features/card/card.css'],
  'p-head': ['layout/layout.css', 'features/card/card.css'],
  drag: ['layout/layout.css', 'features/card/card.css'],
  grab: ['layout/layout.css', 'features/card/card.css'],
};
/** State words that each module puts on its own parts */
const STATES = new Set(['on', 'off', 'n', 'hot', 'sel', 'dim', 'full', 'fold', 'half', 'top', 'sheet', 'm', 'd', 'slide', 'slide-in', 'text', 'recent', 'more', 'country', 'card']);

test('styles: every class is styled by one style file only', () => {
  const owners = new Map<string, Set<string>>();
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.css') && !/(tokens|globals)\.css$/.test(f));
  for (const f of files) {
    const css = readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, sel] of css.matchAll(/([^{}@;]+)\{/g)) {
      for (const one of sel!.split(',')) {
        const s = one.trim();
        if (!s || /^(from|to|\d)/.test(s)) continue;
        const subject = s.split(/\s*[\s>+~]\s*/).pop()!;
        // the subject's own class is the first one written; later ones on the same part are its states
        const own = /\.([a-zA-Z][\w-]*)/.exec(subject)?.[1];
        if (!own || STATES.has(own)) continue;
        if (!owners.has(own)) owners.set(own, new Set());
        owners.get(own)!.add(f.replace(/\\/g, '/'));
      }
    }
  }
  const shared = [...owners].filter(([c, fs]) => fs.size > 1 && !(ALLOWED[c] && [...fs].every((f) => ALLOWED[c]!.includes(f))));
  assert.deepEqual(shared.map(([c, fs]) => `${c}: ${[...fs].join(', ')}`), []);
});
