/* Component test stories for F3 list: the list inside a scrolling panel body, with a "framed" answer chosen by the test. */
import { useState } from 'react';
import type { Building } from '../../data';
import ResultList from './ResultList';

export function ListInPanel(props: { list: Building[]; more?: Building[]; framed?: boolean; country?: boolean; remove?: boolean; onEvent(kind: string, value: string): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-body" style={{ height: 400, overflowY: 'auto', width: 380 }}>
      <ResultList
        list={props.list}
        onOpen={(id) => props.onEvent('open', id)}
        onHover={(ids) => props.onEvent('hover', ids)}
        onVisible={(ids) => props.onEvent('visible', ids.join('~'))}
        onCountry={props.country ? (items) => props.onEvent('country', items.map((b) => b.id).join('~')) : undefined}
        framed={() => !!props.framed}
        onRemove={props.remove ? (id) => props.onEvent('remove', id) : undefined}
        more={props.more ? { list: props.more, open, onOpen: () => (setOpen(true), props.onEvent('more', 'open')), onClose: () => (setOpen(false), props.onEvent('more', 'close')) } : undefined}
      />
    </div>
  );
}
