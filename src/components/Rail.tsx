'use client';

import { Icon, type IconName } from './Icons';

/** What the desktop content panel shows; the rail lights the button of that page */
export type RailPage = 'search' | 'category' | 'other';

interface Props {
  /** The content panel is open */
  open: boolean;
  /** The page the open panel shows (nothing is lit while the panel is closed) */
  page: RailPage;
  onMenu(): void;
  onSearch(): void;
  onCategory(): void;
}

/**
 * Desktop only: the fixed rail on the left edge. Menu opens or closes the content panel; Search and Category
 * open it on their page. A lit button (its page is on screen) cannot be pressed again.
 */
export default function Rail({ open, page, onMenu, onSearch, onCategory }: Props) {
  const btn = (name: IconName, label: string, lit: boolean, onClick: () => void) => (
    <button
      type="button"
      className={`rail-btn${lit ? ' on' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={lit}
      aria-disabled={lit || undefined}
      onClick={lit ? undefined : onClick}
    >
      <Icon name={name} size={16} />
    </button>
  );
  return (
    <nav className="rail" aria-label="Panel">
      {btn('menu', open ? 'Close panel' : 'Open panel', false, onMenu)}
      {/* the menu button controls the panel; the two below choose its page: a short line as wide as a button sets them apart */}
      <i className="rail-sep" aria-hidden="true" />
      {btn('search', 'Search', open && page === 'search', onSearch)}
      {btn('grid', 'Category', open && page === 'category', onCategory)}
    </nav>
  );
}
