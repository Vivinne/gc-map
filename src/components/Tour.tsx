'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ERAS } from '../lib/model';
import { load, save } from '../lib/storage';
import { Icon } from './Icons';

/**
 * Page guides: the first time each page (Map, Quiz, Progress, Settings) is opened, a window in the middle of
 * the screen shows how it works, the rest of the screen dimmed. Up to 4 pages, each a picture of the real
 * controls with numbered marks and one line per number. Closed with the close button, Done or Esc; Settings
 * opens any of them again.
 */
export type TourId = 'map' | 'quiz' | 'progress' | 'settings';
export const TOUR_LABEL: Record<TourId, string> = { map: 'Map', quiz: 'Quiz', progress: 'Progress', settings: 'Settings' };
export const TOURS: TourId[] = ['map', 'quiz', 'progress', 'settings'];
const KEY = 'tours-seen';

export function toursSeen(): TourId[] {
  const v = load<unknown>(KEY, []);
  return Array.isArray(v) ? v.filter((x): x is TourId => (TOURS as string[]).includes(x)) : [];
}
export function markSeen(id: TourId): void {
  const s = toursSeen();
  if (!s.includes(id)) save(KEY, [...s, id]);
}


interface Page {
  title: string;
  /** What this page of the site is for (first page) or what this picture shows */
  line: string;
  pic: React.ReactNode;
  /** One line per number: the control's name (bold), then what it does */
  items: [React.ReactNode, React.ReactNode][];
}

/** A control in a picture and its number, placed outside it: above (t), below (b), right (r) or left (l) */
function T({ n, at = 't', children, className = '' }: { n: number; at?: 't' | 'b' | 'r' | 'l'; children: React.ReactNode; className?: string }) {
  return (
    <span className={`tt ${at} ${className}`}>
      {children}
      <mark className="tn">{n}</mark>
    </span>
  );
}
/** A row of a picture with its number in a column at the left */
function R({ n, children }: { n?: number; children: React.ReactNode }) {
  return (
    <div className="tr">
      <span className="tr-n">{n != null && <mark className="tn">{n}</mark>}</span>
      <div className="tr-c">{children}</div>
    </div>
  );
}
/** A key on the keyboard */
const K = ({ k }: { k: string }) => <kbd className="tk">{k}</kbd>;

export default function Tour({ id, mobile, onClose }: { id: TourId; mobile: boolean; onClose(): void }) {
  const pages = PAGES[id](mobile);
  const [i, setI] = useState(0);
  const p = pages[i]!;
  const last = i === pages.length - 1;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && !last) setI(i + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [i, last, onClose]);
  return createPortal(
    <div className="tour-bg">
      <div className={`tour${mobile ? ' m' : ''}`} role="dialog" aria-modal="true" aria-label={`${TOUR_LABEL[id]} guide`}>
        <div className="tour-h">
          <span className="tour-k">{TOUR_LABEL[id]} guide</span>
          <button type="button" className="tour-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="tour-bd" key={i}>
          <h2>{p.title}</h2>
          <p className="tour-line">{p.line}</p>
          <div className="tour-pic" aria-hidden="true">
            {p.pic}
          </div>
          <ol className="tour-items">
            {p.items.map(([term, text], k) => (
              <li key={k}>
                <mark className="tn">{k + 1}</mark>
                <span>
                  <b>{term}</b>
                  <span className="tour-dash"> – </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </div>
        {/* the page count sits between Back and Next, where the eye already is */}
        <div className="tour-f">
          <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            <Icon name="left" size={12} />
            Back
          </button>
          <span className="tour-n" aria-label={`Page ${i + 1} of ${pages.length}`}>
            {pages.map((_, k) => (
              <i key={k} className={k === i ? 'on' : ''} />
            ))}
            <b>
              {i + 1} / {pages.length}
            </b>
          </span>
          <button type="button" className="btn dark" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Done' : 'Next'}
            {!last && <Icon name="right" size={12} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- pictures: small drawings of the real controls, each numbered outside itself ----------
const C = (e: keyof typeof ERAS) => ERAS[e].color;

function MapPic({ mobile }: { mobile: boolean }) {
  return (
    <div className={`tp-screen${mobile ? ' m' : ''}`}>
      <div className="tp-top">
        {!mobile && <b className="tp-brand">GC Atlas</b>}
        {!mobile && (
          <T n={1}>
            <span className="tp-ic">
              <Icon name="filter" size={13} />
            </span>
          </T>
        )}
        <T n={2} className="grow">
          <span className="tp-search">
            <Icon name="search" size={12} /> Search
          </span>
        </T>
        {mobile ? (
          <T n={1}>
            <span className="tp-ic">
              <Icon name="filter" size={13} />
            </span>
          </T>
        ) : (
          <T n={3}>
            <span className="tp-tabs">
              <span className="on">Map</span>
              <span>Quiz</span>
              <span>Progress</span>
              <Icon name="gear" size={12} />
            </span>
          </T>
        )}
      </div>
      <div className="tp-map">
        <span className="tp-at" style={mobile ? { left: '16%', top: '48%' } : { left: '18%', top: '26%' }}>
          <T n={4} at="r">
            <span className="tp-city">
              <b style={{ borderColor: C('renaissance') }}>26</b> Florence area
            </span>
          </T>
        </span>
        <span className="tp-at" style={mobile ? { left: '34%', top: '74%' } : { left: '46%', top: '58%' }}>
          <T n={5} at="r">
            <span className="tp-pin">
              <b style={{ background: C('ancient') }}>12</b> Pantheon
            </span>
          </T>
        </span>
        <span className="tp-at" style={mobile ? { right: 8, top: 10 } : { right: 10, bottom: 10 }}>
          <T n={6} at="l">
            <span className="tp-ctrls">
              {!mobile && <Icon name="plus" size={11} />}
              {!mobile && <Icon name="minus" size={11} />}
              <Icon name="flag" size={11} />
              <Icon name="fit" size={11} />
            </span>
          </T>
        </span>
        <span className="tp-at" style={mobile ? { left: 10, top: 10 } : { right: 78, bottom: 10 }}>
          <T n={7} at={mobile ? 'r' : 't'}>
            <span className="tp-loc">
              <i />
            </span>
          </T>
        </span>
      </div>
      {mobile && (
        <T n={3} at="b" className="block">
          <span className="tp-tabbar">
            <span className="on">Map</span>
            <span>Quiz</span>
            <span>Progress</span>
            <span>Settings</span>
          </span>
        </T>
      )}
    </div>
  );
}

function FiltersPic() {
  return (
    <div className="tp-panel">
      <R n={1}>
        <div className="tp-grid">
          {(['ancient', 'medieval', 'renaissance', 'baroque'] as const).map((e, k) => (
            <span key={e} className={`tp-chip${k === 3 ? ' on' : ''}`}>
              <i style={{ background: C(e) }} />
              {ERAS[e].label}
            </span>
          ))}
        </div>
      </R>
      <R n={2}>
        <div className="tp-row">
          <span className="tp-chip">Italy</span>
          <span className="tp-chip">France</span>
          <span className="tp-chip">Germany</span>
        </div>
      </R>
      <R n={3}>
        <div className="tp-row">
          <span className="tp-chip">TEST-ARCHED</span>
          <span className="tp-chip">
            <Icon name="star" size={11} />
          </span>
        </div>
      </R>
      <R n={4}>
        <div className="tp-list">
          <span>
            <i style={{ background: C('baroque') }} />
            Church of Gesù <em>1568</em>
          </span>
          <span>
            <i style={{ background: C('baroque') }} />
            Santa Susanna <em>1597</em>
          </span>
        </div>
      </R>
      <R n={5}>
        <span className="tp-fchip">
          <i style={{ background: C('baroque') }} />
          Baroque <Icon name="close" size={9} />
        </span>
      </R>
    </div>
  );
}

function CardPic({ mobile }: { mobile: boolean }) {
  return (
    <div className="tp-cardwrap">
      {mobile && (
        <span className="tp-g v">
          <b>↕</b>
          <T n={9} at="b">
            <small>Drag up / down</small>
          </T>
        </span>
      )}
      <div className="tp-cardcol">
        <div className="tp-card">
          <div className="tp-ctop" style={{ background: C('ancient') }}>
            <div className="tp-cbar">
              <T n={1}>
                <span>
                  <Icon name="left" size={10} /> Rome
                </span>
              </T>
              <T n={2}>
                <Icon name="image" size={11} />
              </T>
              <span className="sp" />
              <T n={3}>
                <span>
                  <Icon name="left" size={10} />
                  <Icon name="right" size={10} />
                </span>
              </T>
              <T n={4}>
                <Icon name="star" size={11} />
              </T>
              <T n={5}>
                <Icon name="close" size={10} />
              </T>
            </div>
            <b className="tp-ctitle">
              <i>12</i> PANTHEON
            </b>
          </div>
          <div className="tp-cbody">
            <span>AD 118–125, Rome</span>
            <T n={6} at="r">
              <span className="tp-who">Hadrian</span>
            </T>
            <T n={7} at="r">
              <span className="tp-tags">
                <em>Dome</em>
                <em>Oculus</em>
              </span>
            </T>
            <T n={8} at="r">
              <span className="tp-tags">
                <em className="c">
                  <i style={{ background: C('ancient') }} />
                  Ancient
                </em>
                <em className="c">Italy</em>
              </span>
            </T>
          </div>
        </div>
        {mobile && (
          <span className="tp-g h">
            <b>↔</b>
            <T n={10} at="r">
              <small>Swipe sideways</small>
            </T>
          </span>
        )}
      </div>
    </div>
  );
}

function SearchPic() {
  return (
    <div className="tp-panel">
      <R n={1}>
        <span className="tp-sbox">
          <Icon name="search" size={12} /> Search
        </span>
      </R>
      <R n={2}>
        <div className="tp-list">
          <span className="h">Recently opened</span>
          <span>
            <i style={{ background: C('ancient') }} />
            Pantheon
          </span>
        </div>
      </R>
      <R n={3}>
        <div className="tp-list">
          <span className="h">Try</span>
          <span>
            <b className="av">LC</b>Le Corbusier <em>Architect</em>
          </span>
          <span>
            <Icon name="map" size={11} />
            Rome <em>City</em>
          </span>
        </div>
      </R>
    </div>
  );
}

function KeysPic() {
  return (
    <div className="tp-keys">
      <span>
        <K k="/" /> Search
      </span>
      <span>
        <K k="F" /> Filters
      </span>
      <span>
        <K k="1" />…<K k="0" /> Styles
      </span>
      <span>
        <K k="←" />
        <K k="→" /> Previous / next
      </span>
      <span>
        <K k="S" /> Star
      </span>
      <span>
        <K k="M" />
        <K k="Q" />
        <K k="U" /> Pages
      </span>
      <span>
        <K k="Esc" /> Close
      </span>
    </div>
  );
}

/** Map gestures on a phone: what the fingers do, written beside a mark of the gesture (nothing to press) */
function GesturesPic() {
  return (
    <div className="tp-gests">
      <span>
        <b>✥</b>Drag to move the map
      </span>
      <span>
        <b>⤢</b>Pinch to zoom
      </span>
      <span>
        <b>●</b>Tap a circle or a pin
      </span>
    </div>
  );
}

function QuizStartPic({ mobile }: { mobile: boolean }) {
  return (
    <div className={`tp-quiz${mobile ? ' m' : ''}`}>
      <div className="tp-col">
        <div className="tp-qcard">
          <b>Custom quiz</b>
          <small>Building → City · All · 10 questions</small>
          <span className="tp-btns">
            <T n={1} at="b">
              <em className="g">Start</em>
            </T>
            <T n={2} at="b">
              <em className="o">Settings</em>
            </T>
          </span>
        </div>
        <div className="tp-qcard">
          <b>Quick quiz</b>
          <small>5 questions · City, architect &amp; style</small>
          <span className="tp-btns">
            <T n={3} at="b">
              <em className="d">Start</em>
            </T>
          </span>
        </div>
        <div className="tp-qcard">
          <b>Practice again</b>
          <small>New questions</small>
          <span className="tp-btns">
            <T n={4} at="b">
              <em className="o">Practice again</em>
            </T>
          </span>
        </div>
      </div>
      <div className="tp-qcard side">
        <T n={5} at="r">
          <b>Mistakes</b>
        </T>
        <small>Palazzo Te · City</small>
        <small>Trevi Fountain · Architect</small>
      </div>
    </div>
  );
}

function QuizRunPic() {
  return (
    <div className="tp-run">
      <div className="tp-rh">
        <b>Question 2 of 10</b>
        <T n={1} className="grow">
          <span className="tp-prog">
            <i className="a" />
            <i className="c" />
            <i />
            <i />
            <i />
          </span>
        </T>
        <T n={2}>
          <em className="o">End quiz</em>
        </T>
      </div>
      <p className="tp-q">
        Which city is <b>Villa Savoye</b> in?
      </p>
      <div className="tp-ops">
        <span>
          <i>1</i>Paris
        </span>
        <T n={3} at="r" className="block">
          <span className="pick">
            <i>2</i>Poissy
          </span>
        </T>
        <span>
          <i>3</i>Lyon
        </span>
      </div>
      <div className="tp-ra">
        <T n={4} at="b">
          <em className="o">
            <Icon name="left" size={10} /> Back
          </em>
        </T>
        <T n={5} at="b">
          <em className="d">Skip / Check / Next</em>
        </T>
      </div>
    </div>
  );
}

function QuizResultPic() {
  return (
    <div className="tp-run">
      <R n={1}>
        <div className="tp-res">
          <b>80%</b>
          <span>Accuracy · 10 answered</span>
        </div>
      </R>
      <R n={2}>
        <p className="tp-sum">Completion 10 of 10 · Right 8 · Wrong 2 · Skipped 0</p>
      </R>
      <R n={3}>
        <div className="tp-ops res">
          <span>
            <i className="ok">✓</i>Pantheon <em>Rome</em>
          </span>
          <span>
            <i className="no">✕</i>Fallingwater <em>Pennsylvania</em>
          </span>
        </div>
      </R>
      <div className="tp-ra">
        <T n={4} at="b">
          <em className="o">Mistakes 2</em>
        </T>
        <T n={5} at="b">
          <em className="o">Retry these questions</em>
        </T>
        <T n={6} at="b">
          <em className="d">Practice again</em>
        </T>
      </div>
    </div>
  );
}

function ProgressPic({ mobile }: { mobile: boolean }) {
  const t = (n: string, label: string, k: number) => (
    <T n={k} className="block">
      <span className="tp-tile">
        <b>{n}</b>
        {label}
      </span>
    </T>
  );
  return (
    <div className={`tp-tiles${mobile ? ' m' : ''}`}>
      {t('78%', 'Accuracy', 1)}
      {t('12', 'Needs work', 2)}
      {t('30', 'Learning', 3)}
      {t('41', 'Mastered', 4)}
      {t('116', 'Not tested', 5)}
    </div>
  );
}

function ProgressTabsPic() {
  return (
    <div className="tp-panel">
      <div className="tp-ptabs">
        <span className="on">Overview</span>
        <T n={1}>
          <span>Mistakes</span>
        </T>
        <T n={2}>
          <span>Quiz history</span>
        </T>
        <T n={3}>
          <span>Collections</span>
        </T>
      </div>
      <div className="tp-list">
        <span>
          Palazzo Te <em>Mantua</em>
        </span>
        <span>
          Quick quiz · All <em>4 / 5</em>
        </span>
        <span>
          <Icon name="star" size={11} /> Starred <em>12</em>
        </span>
      </div>
    </div>
  );
}

function SettingsPic() {
  return (
    <div className="tp-panel">
      <R n={1}>
        <span className="tp-sec">About &amp; guides</span>
      </R>
      <R n={2}>
        <div className="tp-row">
          <span className="tp-chip">Map guide</span>
          <span className="tp-chip">Quiz guide</span>
          <span className="tp-chip">Progress guide</span>
        </div>
      </R>
      <R>
        <span className="tp-sec">Another device</span>
      </R>
      <R n={3}>
        <span className="tp-chip">
          <Icon name="download" size={11} /> Save progress to file
        </span>
      </R>
      <R n={4}>
        <span className="tp-chip">
          <Icon name="upload" size={11} /> Load file
        </span>
      </R>
    </div>
  );
}

// ---------- pages ----------
const PAGES: Record<TourId, (mobile: boolean) => Page[]> = {
  map: (m) => [
    {
      title: 'The map',
      line: 'Every building of the course on one map: where it is, who designed it, its style.',
      pic: <MapPic mobile={m} />,
      items: [
        ['Filters and list', 'styles, countries, exam buildings, your stars.'],
        ['Search', 'buildings, architects and cities.'],
        ['Pages', 'Map, Quiz, Progress, Settings.'],
        ['City circle', 'a city or an area: tap it to list its buildings.'],
        ['Numbered pin', 'one building: tap it to open its card.'],
        [m ? 'Country and Full map' : 'Zoom, Country, Full map', m ? 'the whole country; back to all buildings.' : 'closer or farther; the whole country; back to all buildings.'],
        ['Small map', 'shows where you are.'],
      ],
    },
    {
      title: 'Filters and the list',
      line: 'Narrow the map to what you want to study; the list shows what is left.',
      pic: <FiltersPic />,
      items: [
        ['Styles', <>oldest to newest{m ? '' : <> (keys <K k="1" />…<K k="0" />)</>}; pick several to combine.</>],
        ['Countries', 'one or more.'],
        ['TEST-ARCHED and the star', 'buildings asked in past exams; your starred buildings.'],
        ['List', 'tap a building to open it.'],
        ['Active filters', 'under the map: remove one, or Clear all.'],
      ],
    },
    {
      title: 'A building',
      line: m ? 'Its card opens at the bottom; the map keeps the building in view above it.' : 'Its card opens at the left; the map keeps the building in view.',
      pic: <CardPic mobile={m} />,
      items: [
        ['Back', 'to the city or the list it came from.'],
        ['Photos', 'of the building, in a new tab.'],
        ['Previous / Next', <>the next building{m ? '' : <> (<K k="←" /> <K k="→" />)</>}.</>],
        ['Star', <>keep it, or put it in a collection{m ? '' : <> (<K k="S" />)</>}.</>],
        ['Close', 'back to the map.'],
        ['Architect', 'tap to see their other buildings.'],
        ['Features', 'what to look for, at a glance.'],
        ['Style and country', 'tap one to show all of them on the map.'],
        ...(m
          ? ([
              ['Drag up / down', 'anywhere on the card: full screen, half, or just its title.'],
              ['Swipe sideways', 'the next or previous building slides in.'],
            ] as [string, string][])
          : []),
      ],
    },
    m
      ? {
          title: 'Search and the map',
          line: 'Type a name, or start from what you opened lately.',
          pic: (
            <>
              <SearchPic />
              <GesturesPic />
            </>
          ),
          items: [
            ['Search', 'a building, an architect, a city.'],
            ['Recently opened', 'back to what you were reading.'],
            ['Try', 'examples that open at once.'],
          ],
        }
      : {
          title: 'Search and keys',
          line: 'Type a name, or start from what you opened lately. Most things have a key.',
          pic: (
            <>
              <SearchPic />
              <KeysPic />
            </>
          ),
          items: [
            ['Search', <>(<K k="/" />) a building, an architect, a city.</>],
            ['Recently opened', 'back to what you were reading.'],
            ['Try', 'examples that open at once.'],
          ],
        },
  ],
  quiz: (m) => [
    {
      title: 'Quiz',
      line: 'Test yourself on where the buildings are, who designed them and their style.',
      pic: <QuizStartPic mobile={m} />,
      items: [
        ['Start (Custom quiz)', 'with the question type, range and number you set.'],
        ['Settings', 'choose them.'],
        ['Start (Quick quiz)', '5 questions on city, architect and style.'],
        ['Practice again', 'the last kind of quiz, with new questions.'],
        ['Mistakes', 'what you got wrong, to quiz again.'],
      ],
    },
    {
      title: 'Answering',
      line: 'One question at a time, four choices, one right.',
      pic: <QuizRunPic />,
      items: [
        ['Progress bar', 'answered, skipped, still to come.'],
        ['End quiz', 'at any time; unanswered questions are listed as skipped.'],
        ['Answer', <>tap one{m ? '' : <> (keys <K k="1" />…<K k="4" />)</>}.</>],
        ['Back', 'to an earlier question.'],
        ['Skip / Check / Next', 'Skip when unsure. With answers shown: Check, then Next.'],
      ],
    },
    {
      title: 'The result',
      line: 'Skipped questions change nothing; only answers count.',
      pic: <QuizResultPic />,
      items: [
        ['Accuracy', 'right out of answered.'],
        ['Completion', 'answered, right, wrong and skipped.'],
        ['Questions', 'tap one to open its building.'],
        ['Mistakes', 'quiz the wrong ones again.'],
        ['Retry these questions', 'the same ones again.'],
        ['Practice again', 'new questions of the same kind.'],
      ],
    },
  ],
  progress: (m) => [
    {
      title: 'Progress',
      line: 'How well you know each building: its city, architect and style.',
      pic: <ProgressPic mobile={m} />,
      items: [
        ['Accuracy', 'of your answers in the last 7 days.'],
        ['Needs work', 'a fact answered wrong last time.'],
        ['Learning', 'answered, nothing to fix, not all mastered yet.'],
        ['Mastered', 'city, architect and style each right on 2 different days.'],
        ['Not tested', 'never asked. Tap any state to list its buildings, then show them on the map or quiz them.'],
      ],
    },
    {
      title: 'More in Progress',
      line: 'Your answers and your own lists.',
      pic: <ProgressTabsPic />,
      items: [
        ['Mistakes', 'each question you got wrong, with its answer.'],
        ['Quiz history', 'every quiz and its score.'],
        ['Collections', 'your starred buildings and your own lists.'],
      ],
    },
  ],
  settings: () => [
    {
      title: 'Settings',
      line: 'The guides, and your study progress on another device.',
      pic: <SettingsPic />,
      items: [
        ['About', 'what the site is.'],
        ['Guides', 'read any page’s guide again.'],
        ['Save progress to file', 'stars, collections and quiz results.'],
        ['Load file', 'on the other device.'],
      ],
    },
  ],
};
