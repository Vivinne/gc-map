'use client';

import { Icon, type IconName } from '../../shared/ui';

/** What the desktop content panel shows; the rail lights the button of that page */
export type RailPage = 'search' | 'category' | 'other';

interface Props {
  /** The content panel is open */
  open: boolean;
  /** The page the open panel shows (nothing is lit while the panel is closed) */
  page: RailPage;
  /** Fold the open panel (a lit page button pressed again) */
  onFold(): void;
  /** A screen is out or folded away: the fold button shows */
  canFold: boolean;
  /** The fold button: fold the panel, or bring the folded screen back */
  onToggle(): void;
  onSearch(): void;
  onCategory(): void;
}

/**
 * Desktop only: the fixed rail on the left edge. Menu opens or closes the content panel; Search and Category
 * open it on their page. A lit button (its page is on screen) folds the panel, as Menu does (user, 2026-11-24).
 */
export default function Rail({ open, page, onFold, onSearch, onCategory, canFold, onToggle }: Props) {
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
  // grey also while folded: Search or Category alone brings its own page back (user, 2026-11-25)
  const foldOff = !canFold || page === 'search' || page === 'category';
  return (
    <nav className="rail" aria-label="Panel">
      {btn('search', 'Search', open && page === 'search', onSearch)}
      {btn('grid', 'Category', open && page === 'category', onCategory)}
      {/* the fold button (user, 2026-11-25): always shown, right under Category with no line between. It is grey and
          cannot be pressed while Search or Category already does its job (its page is open, or folded away), or when there is
          nothing to fold or bring back; otherwise it is live, lit while it is the one that folds the open panel (card, number point list), as a lit
          page button folds its page (user, 2026-11-25) */}
      <button
        type="button"
        className={`rail-btn rail-fold${open && !foldOff ? ' on' : ''}`}
        aria-label={open ? 'Fold panel' : 'Open panel'}
        title={foldOff ? undefined : open ? 'Fold panel' : 'Open panel'}
        aria-expanded={open}
        disabled={foldOff}
        onClick={onToggle}
      >
        <Icon name={open ? 'panel' : 'panelOff'} size={16} />
      </button>
    </nav>
  );
}
