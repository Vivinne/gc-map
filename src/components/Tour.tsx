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
  items: React.ReactNode[];
}

/** A numbered mark on the picture */
const N = ({ n }: { n: number }) => <mark className="tn">{n}</mark>;
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
          {pages.length > 1 && (
            <span className="tour-dots" aria-label={`Page ${i + 1} of ${pages.length}`}>
              {pages.map((_, k) => (
                <i key={k} className={k === i ? 'on' : ''} />
              ))}
            </span>
          )}
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
            {p.items.map((t, k) => (
              <li key={k}>
                <N n={k + 1} />
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="tour-f">
          <span className="tour-n">
            {i + 1} / {pages.length}
          </span>
          {i > 0 && (
            <button type="button" className="btn" onClick={() => setI(i - 1)}>
              <Icon name="left" size={12} />
              Back
            </button>
          )}
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

// ---------- pictures ----------
const C = (e: keyof typeof ERAS) => ERAS[e].color;

/** The map page in small: top bar, the map with a city circle, a pin, its buttons, the small map */
function MapPic({ mobile }: { mobile: boolean }) {
  return (
    <div className={`tp-screen${mobile ? ' m' : ''}`}>
      {mobile ? (
        <div className="tp-top">
          <span className="tp-search">
            <Icon name="search" size={12} /> Search
            <N n={2} />
          </span>
          <span className="tp-ic">
            <Icon name="filter" size={13} />
            <N n={1} />
          </span>
        </div>
      ) : (
        <div className="tp-top">
          <b className="tp-brand">GC Atlas</b>
          <span className="tp-ic">
            <Icon name="filter" size={13} />
            <N n={1} />
          </span>
          <span className="tp-search">
            <Icon name="search" size={12} /> Search
            <N n={2} />
          </span>
          <span className="tp-tabs">
            <span className="on">Map</span>
            <span>Quiz</span>
            <span>Progress</span>
            <Icon name="gear" size={12} />
            <N n={3} />
          </span>
        </div>
      )}
      <div className="tp-map">
        <span className="tp-city" style={{ left: '22%', top: '30%' }}>
          <b style={{ borderColor: C('renaissance') }}>26</b> Florence area
          <N n={4} />
        </span>
        <span className="tp-pin" style={{ left: '52%', top: '58%' }}>
          <b style={{ background: C('ancient') }}>6</b> Pantheon
          <N n={5} />
        </span>
        <span className="tp-ctrls" style={mobile ? { right: 8, top: 8 } : { right: 8, bottom: 8 }}>
          <Icon name="flag" size={12} />
          <Icon name="fit" size={12} />
          <N n={6} />
        </span>
        <span className="tp-loc" style={mobile ? { left: 8, top: 8 } : { right: 44, bottom: 8 }}>
          <i />
          <N n={7} />
        </span>
      </div>
      {mobile && (
        <div className="tp-tabbar">
          <span className="on">Map</span>
          <span>Quiz</span>
          <span>Progress</span>
          <span>Settings</span>
          <N n={3} />
        </div>
      )}
    </div>
  );
}

/** The filters and list panel */
function FiltersPic() {
  return (
    <div className="tp-panel">
      <div className="tp-grid">
        {(['ancient', 'medieval', 'renaissance', 'baroque'] as const).map((e, k) => (
          <span key={e} className={`tp-chip${k === 3 ? ' on' : ''}`}>
            <i style={{ background: C(e) }} />
            {ERAS[e].label}
            {k === 0 && <N n={1} />}
          </span>
        ))}
      </div>
      <div className="tp-row">
        <span className="tp-chip">
          Italy
          <N n={2} />
        </span>
        <span className="tp-chip">France</span>
        <span className="tp-chip">
          TEST-ARCHED
          <N n={3} />
        </span>
        <span className="tp-chip">
          <Icon name="star" size={11} />
        </span>
      </div>
      <div className="tp-list">
        <span>
          <i style={{ background: C('baroque') }} />
          Church of Gesù <em>1568</em>
          <N n={4} />
        </span>
        <span>
          <i style={{ background: C('baroque') }} />
          Santa Susanna <em>1597</em>
        </span>
      </div>
      <div className="tp-row">
        <span className="tp-fchip">
          <i style={{ background: C('baroque') }} />
          Baroque <Icon name="close" size={9} />
          <N n={5} />
        </span>
      </div>
    </div>
  );
}

/** The building card, with the phone's swipes */
function CardPic({ mobile }: { mobile: boolean }) {
  return (
    <div className="tp-cardwrap">
      <div className="tp-card">
        <div className="tp-ctop" style={{ background: C('ancient') }}>
          <div className="tp-cbar">
            <span>
              <Icon name="left" size={10} /> Rome
              <N n={1} />
            </span>
            <span>
              <Icon name="image" size={11} />
              <N n={2} />
            </span>
            <span className="sp" />
            <span>
              <Icon name="left" size={10} />
              <Icon name="right" size={10} />
              <N n={3} />
            </span>
            <span>
              <Icon name="star" size={11} />
              <N n={4} />
            </span>
            <span>
              <Icon name="close" size={10} />
              <N n={5} />
            </span>
          </div>
          <b className="tp-ctitle">
            <i>6</i> PANTHEON
          </b>
        </div>
        <div className="tp-cbody">
          <span>AD 118–125, Rome</span>
          <span className="tp-who">
            Hadrian
            <N n={6} />
          </span>
          <span className="tp-tags">
            <em>Dome</em>
            <em>Oculus</em>
            <N n={7} />
          </span>
          <span className="tp-tags">
            <em className="c">
              <i style={{ background: C('ancient') }} />
              Ancient
            </em>
            <em className="c">Italy</em>
            <N n={8} />
          </span>
        </div>
      </div>
      {mobile && (
        <div className="tp-gest">
          <span>
            <b>↕</b>
            Drag
            <N n={9} />
          </span>
          <span>
            <b>↔</b>
            Swipe
            <N n={10} />
          </span>
        </div>
      )}
    </div>
  );
}

function SearchPic() {
  return (
    <div className="tp-panel">
      <span className="tp-sbox">
        <Icon name="search" size={12} /> Search
        <N n={1} />
      </span>
      <div className="tp-list">
        <span className="h">
          Recently opened
          <N n={2} />
        </span>
        <span>
          <i style={{ background: C('ancient') }} />
          Pantheon
        </span>
        <span className="h">
          Try
          <N n={3} />
        </span>
        <span>
          <b className="av">LC</b>Le Corbusier <em>Architect</em>
        </span>
        <span>
          <Icon name="map" size={11} />
          Rome <em>City</em>
        </span>
      </div>
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

function GesturesPic() {
  return (
    <div className="tp-gest big">
      <span>
        <b>✋</b>Drag the map
        <N n={1} />
      </span>
      <span>
        <b>🤏</b>Pinch to zoom
        <N n={2} />
      </span>
      <span>
        <b>👆</b>Tap a circle or pin
        <N n={3} />
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
            <em className="g">
              Start
              <N n={1} />
            </em>
            <em className="o">
              Settings
              <N n={2} />
            </em>
          </span>
        </div>
        <div className="tp-qcard">
          <b>Quick quiz</b>
          <small>5 questions · City, architect &amp; style</small>
          <span className="tp-btns">
            <em className="d">
              Start
              <N n={3} />
            </em>
          </span>
        </div>
        <div className="tp-qcard">
          <b>Practice again</b>
          <small>New questions</small>
          <span className="tp-btns">
            <em className="o">
              Practice again
              <N n={4} />
            </em>
          </span>
        </div>
      </div>
      <div className="tp-qcard side">
        <b>
          Mistakes <N n={5} />
        </b>
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
        <span className="tp-prog">
          <i className="a" />
          <i className="c" />
          <i />
          <i />
          <i />
          <N n={1} />
        </span>
        <em className="o">
          End quiz
          <N n={2} />
        </em>
      </div>
      <p className="tp-q">
        Which city is <b>Villa Savoye</b> in?
      </p>
      <div className="tp-ops">
        <span>
          <i>1</i>Paris
        </span>
        <span className="pick">
          <i>2</i>Poissy
          <N n={3} />
        </span>
        <span>
          <i>3</i>Lyon
        </span>
      </div>
      <div className="tp-ra">
        <em className="o">
          <Icon name="left" size={10} /> Back
          <N n={4} />
        </em>
        <em className="d">
          Check / Next
          <N n={5} />
        </em>
      </div>
    </div>
  );
}

function QuizResultPic() {
  return (
    <div className="tp-run">
      <div className="tp-res">
        <b>80%</b>
        <span>Accuracy · 10 answered</span>
        <N n={1} />
      </div>
      <p className="tp-sum">
        Completion 10 of 10 · Right 8 · Wrong 2 · Skipped 0
        <N n={2} />
      </p>
      <div className="tp-ops res">
        <span>
          <i className="ok">✓</i>Pantheon <em>Rome</em>
          <N n={3} />
        </span>
        <span>
          <i className="no">✕</i>Fallingwater <em>Pennsylvania</em>
        </span>
      </div>
      <div className="tp-ra">
        <em className="o">
          Mistakes 2<N n={4} />
        </em>
        <em className="o">
          Retry these questions
          <N n={5} />
        </em>
        <em className="d">
          Practice again
          <N n={6} />
        </em>
      </div>
    </div>
  );
}

function ProgressPic({ mobile }: { mobile: boolean }) {
  const t = (n: string, label: string, k: number) => (
    <span className="tp-tile">
      <b>{n}</b>
      {label}
      <N n={k} />
    </span>
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
        <span>
          Mistakes
          <N n={1} />
        </span>
        <span>
          Quiz history
          <N n={2} />
        </span>
        <span>
          Collections
          <N n={3} />
        </span>
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
      <span className="tp-sec">
        About &amp; guides
        <N n={1} />
      </span>
      <div className="tp-row">
        <span className="tp-chip">Map guide</span>
        <span className="tp-chip">Quiz guide</span>
        <span className="tp-chip">
          Progress guide
          <N n={2} />
        </span>
      </div>
      <span className="tp-sec">Another device</span>
      <div className="tp-row">
        <span className="tp-chip">
          <Icon name="download" size={11} /> Save progress to file
          <N n={3} />
        </span>
        <span className="tp-chip">
          <Icon name="upload" size={11} /> Load file
          <N n={4} />
        </span>
      </div>
    </div>
  );
}

// ---------- pages ----------
const PAGES: Record<TourId, (mobile: boolean) => Page[]> = {
  map: (m) => [
    {
      title: 'The map',
      line: 'Every building of the course on one map. Find where it is, who designed it and its style.',
      pic: <MapPic mobile={m} />,
      items: [
        'Filters and the list: styles, countries, exam buildings, your stars.',
        'Search buildings, architects and cities.',
        'Pages: Map, Quiz, Progress, Settings.',
        'A circle is a city or an area: tap it to list its buildings.',
        'A numbered pin is one building: tap it to open its card.',
        'Country: the whole country. Full map: back to all buildings.',
        'The small map shows where you are.',
      ],
    },
    {
      title: 'Filters and the list',
      line: 'Narrow the map to what you want to study; the list shows what is left.',
      pic: <FiltersPic />,
      items: [
        <>Styles, oldest to newest{m ? '' : <> (keys <K k="1" />…<K k="0" />)</>}. Pick several to combine.</>,
        'Countries.',
        'TEST-ARCHED: buildings asked in past exams. The star: your starred buildings.',
        'The list: tap a building to open it.',
        'What is on, under the map: remove one, or Clear all.',
      ],
    },
    {
      title: 'A building',
      line: m ? 'Its card opens at the bottom; the map keeps the building in view above it.' : 'Its card opens at the left; the map keeps the building in view.',
      pic: <CardPic mobile={m} />,
      items: [
        'Back to the city or the list it came from.',
        'Photos of the building (new tab).',
        <>Previous and next building{m ? '' : <> (<K k="←" /> <K k="→" />)</>}.</>,
        <>Star it, or put it in a collection{m ? '' : <> (<K k="S" />)</>}.</>,
        'Close.',
        'The architect: tap to see their other buildings.',
        'Key features at a glance.',
        'Style and country: tap to show them all on the map.',
        ...(m ? ['Drag the card up or down: full screen, half, or just the title.', 'Swipe it sideways: the next or previous building comes in.'] : []),
      ],
    },
    m
      ? {
          title: 'Search and gestures',
          line: 'Type a name, or start from what you opened lately.',
          pic: (
            <>
              <SearchPic />
              <GesturesPic />
            </>
          ),
          items: ['Search box: a building, an architect, a city.', 'Recently opened: back to what you were reading.', 'Try: examples that open at once.'],
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
            <>
              Search box (<K k="/" />): a building, an architect, a city.
            </>,
            'Recently opened: back to what you were reading.',
            'Try: examples that open at once.',
          ],
        },
  ],
  quiz: (m) => [
    {
      title: 'Quiz',
      line: 'Test yourself on where the buildings are, who designed them and their style.',
      pic: <QuizStartPic mobile={m} />,
      items: [
        'Custom quiz: Start with the question type, range and number you set.',
        'Settings: choose them.',
        'Quick quiz: 5 questions on city, architect and style.',
        'Practice again: the last kind of quiz, new questions.',
        'Mistakes: what you got wrong, to quiz again.',
      ],
    },
    {
      title: 'Answering',
      line: 'One question at a time, four choices, one right.',
      pic: <QuizRunPic />,
      items: [
        'Where you are: answered, skipped, still to come.',
        'End quiz at any time; unanswered questions are listed as skipped.',
        <>Pick an answer{m ? '' : <> (keys <K k="1" />…<K k="4" />)</>}.</>,
        'Back to an earlier question.',
        'Skip when unsure. With answers shown, Check first, then Next.',
      ],
    },
    {
      title: 'The result',
      line: 'Skipped questions change nothing; only answers count.',
      pic: <QuizResultPic />,
      items: [
        'Accuracy: right out of answered.',
        'How many were answered, right, wrong and skipped.',
        'Each question: tap one to open the building.',
        'Mistakes: quiz the wrong ones again.',
        'Retry these questions: the same ones again.',
        'Practice again: new questions of the same kind.',
      ],
    },
  ],
  progress: (m) => [
    {
      title: 'Progress',
      line: 'How much you know, building by building: its city, architect and style.',
      pic: <ProgressPic mobile={m} />,
      items: [
        'Accuracy of your answers in the last 7 days.',
        'Needs work: a fact answered wrong last time.',
        'Learning: answered, nothing to fix, not all mastered yet.',
        'Mastered: city, architect and style each right on 2 different days.',
        'Not tested: never asked. Tap any of them to list its buildings, then show them on the map or quiz them.',
      ],
    },
    {
      title: 'More in Progress',
      line: 'Your answers and your own lists.',
      pic: <ProgressTabsPic />,
      items: ['Mistakes: each question you got wrong, with its answer.', 'Quiz history: every quiz and its score.', 'Collections: your starred buildings and your own lists.'],
    },
  ],
  settings: () => [
    {
      title: 'Settings',
      line: 'The guides, and your study progress on another device.',
      pic: <SettingsPic />,
      items: [
        'About: what the site is.',
        'Each page’s guide, to read again.',
        'Save your stars, collections and quiz results to a file.',
        'Load that file on the other device.',
      ],
    },
  ],
};
