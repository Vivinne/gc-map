'use client';

import { type ThemeId } from '../lib/theme';
import { Icon } from './Icons';
import { STUDY_ON } from '../lib/features';
import Guide, { GUIDE_LINE, GUIDE_NOTE } from './Guide';
import { TOURS, TOUR_LABEL, toursOn, type TourId } from './Tour';

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

/** Settings: what the site is for, its guides, and a backup of stars and collections to move to another device. */
export default function SettingsView(p: Props) {
  return (
    <div className={p.mobile ? 'me m set' : 'me set'}>
      <div className="me-pg">
        {!toursOn(p.mobile) ? (
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
            <h2 id="set-device">Backup &amp; transfer</h2>
          </div>
          <div className="bd set-dev">
            {/* what the buttons move, and what an import does to what is here, said before either is used */}
            <p className="note">
              {STUDY_ON ? 'Stars, collections and quiz results' : 'Stars and collections'} to a file, and back on any device. An import adds to what is here: nothing is removed, collections with the same name are joined.
            </p>
            <div className="set-btns">
              <button type="button" className="btn" onClick={p.onExport}>
                <Icon name="download" size={14} />
                {STUDY_ON ? 'Export stars, collections & quizzes' : 'Export stars & collections'}
              </button>
              <label className="btn">
                <Icon name="upload" size={14} />
                Import file
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
