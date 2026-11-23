'use client';

import { Icon } from './Icons';

/**
 * Desktop: what the content panel shows when nothing is open (a fresh visit, or after ×) and the rail's menu
 * button opens it. Each button acts as the rail button with the same icon.
 */
export default function RailMenu({ onSearch, onCategory }: { onSearch(): void; onCategory(): void }) {
  return (
    <div className="r-menu">
      <button type="button" className="r-item" onClick={onSearch}>
        <Icon name="search" size={16} />
        Search
      </button>
      <button type="button" className="r-item" onClick={onCategory}>
        <Icon name="grid" size={16} />
        Category
      </button>
    </div>
  );
}
