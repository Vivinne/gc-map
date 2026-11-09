"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ERAS } from "../lib/model";
import { Icon } from "./Icons";

type Topic = "quiz" | "progress";

/**
 * One "?" per page (Quiz, Progress). It opens a window in the middle of the screen that shows how the page
 * works, step by step, each step a small picture of the real controls with one line under it. The window
 * stays until it is closed (close button, Got it, Esc or a click on the dark background).
 */
export default function Help({
  topic,
  className = "",
}: {
  topic: Topic;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) =>
      e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);
  const title =
    topic === "quiz" ? "How a quiz works" : "How progress is counted";
  return (
    <>
      <button
        type="button"
        className={`help-q ${className}`}
        aria-label={title}
        title={title}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            className="help-scrim"
            onPointerDown={(e) =>
              e.target === e.currentTarget && setOpen(false)
            }
          >
            <div
              className="help"
              role="dialog"
              aria-modal="true"
              aria-label={title}
            >
              <div className="help-h">
                <b>{title}</b>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="help-steps">
                {topic === "quiz" ? <QuizSteps /> : <ProgressSteps />}
              </div>
              <div className="help-f">
                <button
                  type="button"
                  className="btn dark"
                  onClick={() => setOpen(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>,
          // on top of everything, the tab bar included
          document.body,
        )}
    </>
  );
}

function Step({
  n,
  title,
  line,
  children,
}: {
  n?: number;
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hs">
      <h4>
        {n != null && <i>{n}</i>}
        {title}
      </h4>
      <div className="hs-pic" aria-hidden="true">
        {children}
      </div>
      <p>{line}</p>
    </div>
  );
}

const Box = ({ on }: { on?: boolean }) => (
  <span className={`hs-cb${on ? " on" : ""}`}>
    {on && <Icon name="check" size={9} />}
  </span>
);
const Sw = ({ on }: { on?: boolean }) => (
  <span className={`sw2${on ? " on" : ""}`}>
    <i />
  </span>
);

function QuizSteps() {
  return (
    <>
      <Step
        n={1}
        title="Question"
        line="One question about a building, 4 choices, one right."
      >
        <div className="hs-q">Which city is Pantheon in?</div>
        <div className="hs-o">Paris</div>
        <div className="hs-o">Rome</div>
        <div className="hs-o">Milan</div>
      </Step>
      <Step
        n={2}
        title="Range"
        line="Leave it on All, or tick any groups to mix them."
      >
        <div className="hs-r">
          <Box on />
          <i className="hs-dot" style={{ background: ERAS.baroque.color }} />
          Baroque
        </div>
        <div className="hs-r">
          <Box on />
          Italy
        </div>
        <div className="hs-r">
          <Box />
          France
        </div>
        <div className="hs-r hs-m">106 buildings</div>
      </Step>
      <Step
        n={3}
        title="Answers"
        line="On: pick, then Check to see right or wrong; a checked answer stays. Off: answers can change until the end."
      >
        <div className="hs-r">
          <Sw on />
          Show the answer after each question
        </div>
        <div className="hs-o no">
          Paris <Icon name="close" size={9} />
        </div>
        <div className="hs-o ok">
          Rome <Icon name="check" size={9} />
        </div>
      </Step>
      <Step
        n={4}
        title="Result"
        line="Accuracy counts answered questions only. Skipped questions are listed apart and change nothing. A right answer takes a question off Mistakes."
      >
        <div className="hs-score">80% · 10 answered</div>
        <div className="hs-r">
          <span className="hs-x">
            <Icon name="close" size={9} />
          </span>
          Mistakes 3: quiz them again
        </div>
      </Step>
    </>
  );
}

function ProgressSteps() {
  return (
    <>
      <Step title="Overview" line="Each building is tracked on its city, architect and style. Questions between an architect and a city or a style count in the quiz score only. Tap a state to see its buildings.">
        <div className="hs-r">
          <i className="hs-sq s-weak" />
          Needs work: a fact's last answer was wrong
        </div>
        <div className="hs-r">
          <i className="hs-sq s-learning" />
          Learning: nothing to fix, not all mastered
        </div>
        <div className="hs-r">
          <i className="hs-sq s-mastered" />
          Mastered: each fact right on 2 different days since the last mistake
        </div>
      </Step>
      <Step title="Mistakes" line="Questions you got wrong last time, with the answer. A right answer later takes them off.">
        <div className="hs-r">
          Palazzo Te<b className="hs-s">Mantua</b>
        </div>
        <div className="hs-r">
          Trevi Fountain<b className="hs-s">Nicola Salvi</b>
        </div>
      </Step>
      <Step title="Quiz history" line="Every quiz with its score and the questions missed in it.">
        <div className="hs-r">
          Building → City<b className="hs-s">8/10</b>
        </div>
        <div className="hs-r hs-m">
          Erechtheion<b className="hs-s">Athens</b>
        </div>
      </Step>
    </>
  );
}
