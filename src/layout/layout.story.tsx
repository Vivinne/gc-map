/* Component-test wrappers for the layout: a panel, a leaving panel and the covered part of the map, on a full page.
   The test changes them through window.layoutTest. */
import { useEffect, useRef, useState } from 'react';
import { HeadBar } from '../shared/ui';
import { Leave, Panel, useMapRoom } from './index';

declare global {
  interface Window {
    layoutTest: { set(p: Partial<StoryProps>): void; clicks: number };
  }
}

export interface StoryProps {
  mobile: boolean;
  place: 'top' | 'sheet';
  rows: number;
  resetKey: string;
  scroll?: number;
  show: boolean;
  slide: boolean;
  title: string;
  /** a search box on top, as on a phone */
  topbar: boolean;
}

const DEFAULTS: StoryProps = { mobile: false, place: 'sheet', rows: 5, resetKey: 'a', show: true, slide: false, title: 'Results', topbar: false };

function useStory(first: Partial<StoryProps>) {
  const [p, setP] = useState<StoryProps>({ ...DEFAULTS, ...first });
  useEffect(() => {
    window.layoutTest = { set: (n) => setP((o) => ({ ...o, ...n })), clicks: 0 };
  }, []);
  return p;
}

const Rows = ({ n }: { n: number }) => (
  <ul>
    {Array.from({ length: n }, (_, i) => (
      <li key={i} className="story-row" style={{ height: 40 }}>
        <button type="button" onClick={() => window.layoutTest.clicks++}>
          Row {i + 1}
        </button>
      </li>
    ))}
  </ul>
);

/** A panel (with \uff1c × title row) in a Leave, as the shell shows it */
export function PanelStory(first: Partial<StoryProps>) {
  const p = useStory(first);
  return (
    <div className={`app${p.mobile ? ' is-mobile' : ''}`}>
      <main className="main">
        <Leave show={p.show} slide={p.slide}>
          <Panel key={p.resetKey} mobile={p.mobile} place={p.place} label={p.title} resetKey={p.resetKey} scroll={p.scroll} head={<HeadBar canBack title={p.title} onBack={() => {}} onClose={() => {}} />}>
            <Rows n={p.rows} />
          </Panel>
        </Leave>
      </main>
    </div>
  );
}

/** The part of the map covered (L1), printed as JSON for the test */
export function RoomStory(first: Partial<StoryProps>) {
  const p = useStory(first);
  const app = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const room = useMapRoom(app, panel, p.mobile, { left: 56, right: 48 });
  return (
    <div className={`app${p.mobile ? ' is-mobile' : ''}`} ref={app}>
      <main className="main">
        {p.topbar && <div className="topbar" style={{ height: 40 }} />}
        {p.show && (
          <Panel ref={panel} mobile={p.mobile} place={p.place} label="Panel" resetKey={p.resetKey} head={<HeadBar canBack={false} title="Panel" onBack={() => {}} onClose={() => {}} />}>
            <Rows n={p.rows} />
          </Panel>
        )}
      </main>
      <output id="room">{JSON.stringify(room)}</output>
    </div>
  );
}
