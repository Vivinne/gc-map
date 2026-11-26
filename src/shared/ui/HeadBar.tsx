'use client';

import type { ReactNode } from 'react';
import { Icon } from './Icons';

/** Top row of a list or card: ＜ (when there is an earlier screen) and a title on the left, × on the right */
export function HeadBar({ canBack, onBack, onClose, title }: { canBack: boolean; onBack(): void; onClose(): void; title?: ReactNode }) {
  return (
    <div className="h-bar">
      {canBack && (
        <button type="button" className="h-ic" aria-label="Back" title="Back" onClick={onBack}>
          <Icon name="left" size={14} />
        </button>
      )}
      {title != null && <span className="h-title">{title}</span>}
      <span className="h-sp" />
      <button type="button" className="h-ic" aria-label="Close" title="Close (Esc)" onClick={onClose}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
