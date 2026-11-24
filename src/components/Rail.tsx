'use client';

import { Icon, type IconName } from './Icons';

/** What the desktop content panel shows; the rail lights the button of that page */
export type RailPage = 'search' | 'category' | 'other';

interface Props {
  /** The content panel is open */
  open: boolean;
  /** The page the open panel shows (nothing is lit while the panel is closed) */
  page: RailPage;
  /** Fold the open panel (a lit page button pressed again) */
  onFold(): void;
  onSearch(): void;
  onCategory(): void;
}

/**
 * Desktop only: the fixed rail on the left edge. Menu opens or closes the content panel; Search and Category
 * open it on their page. A lit button (its page is on screen) folds the panel, as Menu does (user, 2026-11-24).
 */
export default function Rail({ open, page, onFold, onSearch, onCategory }: Props) {
  const btn = (name: IconName, label: string, lit: boolean, onClick: () => void) => (
    <button
      type="button"
      className={`rail-btn${lit ? ' on' : ''}`}
      aria-label={label}
      title={lit ? `${label} (fold the panel)` : label}
      aria-pressed={lit}
      onClick={lit ? onFold : onClick}
    >
      <Icon name={name} size={16} />
    </button>
  );
  return (
    <nav className="rail" aria-label="Panel">
      {btn('search', 'Search', open && page === 'search', onSearch)}
      {btn('grid', 'Category', open && page === 'category', onCategory)}
    </nav>
  );
}
