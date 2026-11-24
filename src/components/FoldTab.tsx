'use client';

import { Icon } from './Icons';

/**
 * Desktop: the tab on the content panel's right edge (user, 2026-11-24, in place of the rail's menu button). With the
 * panel out it folds the panel away (any page: search, Category, card, number point list); with the panel folded it
 * sits beside the rail and brings the same screen back. Folding is not ×: the screen and the map stay as they are.
 */
export default function FoldTab({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <button type="button" className={`fold-tab${open ? ' out' : ''}`} aria-label={open ? 'Fold panel' : 'Open panel'} title={open ? 'Fold panel' : 'Open panel'} aria-expanded={open} onClick={onToggle}>
      <Icon name={open ? 'left' : 'right'} size={12} />
    </button>
  );
}
