'use client';

import { forwardRef } from 'react';
import { Icon } from './Icons';

export const SEARCH_HINT = 'Search architecture, architect, style…';

interface Props {
  value: string;
  /** × shows while there is text or anything open */
  showClear: boolean;
  categoryOpen: boolean;
  onFocus(): void;
  onChange(text: string): void;
  onSubmit(): void;
  onClear(): void;
  onCategory(): void;
}

/** Search box (magnifier on the left, × on the right) and the Category button beside it, top left of the page */
const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ value, showClear, categoryOpen, onFocus, onChange, onSubmit, onClear, onCategory }, ref) {
  return (
    <div className="topbar">
      <form
        className="sbox"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Icon name="search" size={16} />
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
      <button type="button" className={`cat-btn${categoryOpen ? ' on' : ''}`} aria-label="Category" title="Category" aria-expanded={categoryOpen} onClick={onCategory}>
        <Icon name="grid" size={16} />
      </button>
    </div>
  );
});

export default SearchBox;
