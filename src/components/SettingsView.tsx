'use client';

import { ERA_ORDER, ERAS } from '../lib/model';
import { THEMES, THEME_ORDER, type ThemeId } from '../lib/theme';
import { Icon } from './Icons';
import Guide, { GUIDE_NOTE } from './Guide';

interface Props {
  mobile: boolean;
  theme: ThemeId;
  onTheme(id: ThemeId): void;
  onExport(): void;
  onImport(text: string): void;
  onBrowse(): void;
  onQuick(): void;
  guideHidden: boolean;
  onShowGuide(): void;
}

/** Settings: what the site is for, the colour palette, and moving study progress to another device. */
export default function SettingsView(p: Props) {
  return (
    <div className={p.mobile ? 'me m set' : 'me set'}>
      <div className="me-pg">
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
        <section className="card" aria-labelledby="set-colours">
          <div className="hd">
            <h2 id="set-colours">Colours</h2>
          </div>
          <div className="bd th-list" role="radiogroup" aria-labelledby="set-colours">
            {THEME_ORDER.map((id) => {
              const t = THEMES[id];
              const on = p.theme === id;
              return (
                <button type="button" role="radio" aria-checked={on} key={id} className={`th-opt${on ? ' on' : ''}`} onClick={() => p.onTheme(id)}>
                  <span className="th-dot" aria-hidden="true">{on && <Icon name="check" size={12} />}</span>
                  <span className="th-txt">
                    <b>{t.label}</b>
                    <small>{t.note}</small>
                  </span>
                  {/* the styles from oldest to newest, so the gradient reads left to right */}
                  <span className="th-strip" aria-hidden="true">
                    {ERA_ORDER.map((e) => (
                      <i key={e} style={{ background: t.eras[e] }} title={ERAS[e].label} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
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
