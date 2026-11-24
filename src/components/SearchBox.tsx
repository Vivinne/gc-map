'use client';

import { forwardRef } from 'react';
import { Icon } from './Icons';

export const SEARCH_HINT = 'Search architecture, architect, style…';

interface Props {
  value: string;
  /** × shows while there is text or anything open */
  showClear: boolean;
  categoryOpen: boolean;
  /** After Enter (results on screen) the magnifier turns into ＜, which goes back to the previous screen */
  onBack?: () => void;
  onFocus(): void;
  onChange(text: string): void;
  onSubmit(): void;
  onClear(): void;
  onCategory(): void;
  /**
   * Desktop: the box is the content panel's top row (user, 2026-11-24): ＜ (when there is an earlier screen) and ×
   * sit in the box as on a phone; the rail carries Category
   */
  docked?: boolean;
}

/** Search box (magnifier, or ＜ after Enter, on the left; × on the right) and the Category button beside it, top left of the page */
const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ value, showClear, categoryOpen, onBack, onFocus, onChange, onSubmit, onClear, onCategory, docked = false }, ref) {
  return (
    <div className={docked ? 'p-search' : 'topbar'}>
      <form
        className="sbox"
        role="search"
        // the whole box is the search field (user, 2026-11-24): a press on the magnifier or the box's padding puts
        // the cursor in the text, as a press on the text does; the box's own buttons (＜, ×) keep their actions
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName !== 'INPUT' && !t.closest('button')) e.preventDefault();
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName !== 'INPUT' && !t.closest('button')) e.currentTarget.querySelector('input')?.focus();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {onBack ? (
          <button type="button" className="s-back" aria-label="Back" title="Back" onClick={onBack}>
            <Icon name="left" size={14} />
          </button>
        ) : (
          <Icon name="search" size={16} />
        )}
        <input
          ref={ref}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search"
          placeholder={SEARCH_HINT}
          value={value}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        {showClear && (
          <button type="button" className="s-x" aria-label="Clear" title="Clear (Esc)" onClick={onClear}>
            <Icon name="close" size={13} />
          </button>
        )}
      </form>
      {!docked && (
      <button type="button" className={`cat-btn${categoryOpen ? ' on' : ''}`} aria-label="Category" title="Category" aria-expanded={categoryOpen} onClick={onCategory}>
        <Icon name="grid" size={16} />
      </button>
      )}
    </div>
  );
});

export default SearchBox;
