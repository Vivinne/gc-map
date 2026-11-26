'use client';

import { Icon } from './Icons';

/**
 * The small grey × at the right end of a recent search row: takes that entry off the recent list (user, 2026-11-24).
 * A press keeps the cursor in the search box, so the preview stays open and typing can go on.
 */
export default function RemoveButton({ label, onRemove }: { label: string; onRemove(): void }) {
  return (
    <button type="button" className="rm-x" aria-label={`Remove ${label} from recent`} title="Remove from recent" onMouseDown={(e) => e.preventDefault()} onClick={onRemove}>
      <Icon name="close" size={11} />
    </button>
  );
}
