'use client';

import { type ThemeId } from '../lib/theme';
import { Icon } from './Icons';
import Guide, { GUIDE_LINE, GUIDE_NOTE } from './Guide';
import { TOURS, TOUR_LABEL, type TourId } from './Tour';

interface Props {
  mobile: boolean;
  theme: ThemeId;
  onTheme(id: ThemeId): void;
  onExport(): void;
  onImport(text: string): void;
  /** Open a page's guide again (computer) */
  onTour(id: TourId): void;
  /** Phone, until its page guides are out: the getting-started card */
  onBrowse(): void;
  onQuick(): void;
  guideHidden: boolean;
  onShowGuide(): void;
}

/** Settings: what the site is for, and moving study progress to another device. */
export default function SettingsView(p: Props) {
  return (
    <div className={p.mobile ? 'me m set' : 'me set'}>
      <div className="me-pg">
        {p.mobile ? (
          <section className="card" aria-labelledby="set-about">
            <div className="hd">
              <h2 id="set-about">About &amp; getting started</h2>
            </div>
            <div className="bd set-about">
              <Guide className="s" onBrowse={p.onBrowse} onQuick={p.onQuick} />
              <p className="note">{GUIDE_NOTE}</p>
              {p.guideHidden && (
                <button type="button" className="btn" onClick={p.onShowGuide}>
                  Show the getting-started card on the map
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="card" aria-labelledby="set-about">
            <div className="hd">
              <h2 id="set-about">About &amp; guides</h2>
            </div>
            <div className="bd set-about">
              <p className="set-line">{GUIDE_LINE}</p>
              <p className="note">{GUIDE_NOTE}</p>
              <div className="set-btns">
                {TOURS.map((id) => (
                  <button type="button" className="btn" key={id} onClick={() => p.onTour(id)}>
                    <Icon name="info" size={14} />
                    {TOUR_LABEL[id]} guide
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
        <section className="card" aria-labelledby="set-device">
          <div className="hd">
            <h2 id="set-device">Another device</h2>
          </div>
          <div className="bd set-dev">
            <p className="note">Stars, collections and quiz results. Save them to a file here, then load the file on the other device.</p>
            <div className="set-btns">
              <button type="button" className="btn" onClick={p.onExport}>
                <Icon name="download" size={14} />
                Save progress to file
              </button>
              <label className="btn">
                <Icon name="upload" size={14} />
                Load file
                <input
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) p.onImport(await f.text());
                  }}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
