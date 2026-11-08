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
        line="You see one thing about a building and pick another from 4 choices."
      >
        <div className="hs-q">Pantheon</div>
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
        line="On: right or wrong at once, the first pick counts. Off: answers can change until Finish."
      >
        <div className="hs-r">
          <Sw on />
          Show answer at once
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
        title="Finish"
        line="Questions not answered count as wrong. A right answer takes a question off Mistakes."
      >
        <div className="hs-score">7 / 10</div>
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
      <Step
        title="Mastery"
        line="Each building counts once, whatever is asked. A building can be in more than one group."
      >
        <div className="hs-r">
          <i className="hs-sq s-mastered" />
          Mastered: right twice, on different days
        </div>
        <div className="hs-r">
          <i className="hs-sq s-learning" />
          Learning: right last time
        </div>
        <div className="hs-r">
          <i className="hs-sq s-weak" />
          Weak: wrong last time
        </div>
        <div className="hs-r">
          <i className="hs-sq s-untested" />
          Not tested
        </div>
      </Step>
      <Step
        title="Practise next"
        line="What you got wrong last time, most missed first. With none: buildings never asked."
      >
        <div className="hs-r">
          Louvre Pyramid<span className="hs-f">City</span>
        </div>
        <div className="hs-r">
          Pantheon<span className="hs-f">Architect</span>
        </div>
      </Step>
      <Step
        title="Correct per day"
        line="The small number is how many answers the day stands for."
      >
        <div className="hs-days">
          {[
            ["12", "75%", "ok"],
            ["4", "50%", "mid"],
            ["20", "85%", "ok"],
          ].map(([n, v, c], k) => (
            <span key={k}>
              {n}
              <b className={c}>{v}</b>
            </span>
          ))}
        </div>
      </Step>
      <Step
        title="Recent quizzes"
        line="A quiz finished early shows how many questions were answered."
      >
        <div className="hs-r">
          Building → City<b className="hs-s">7/10</b>
        </div>
        <div className="hs-r hs-m">
          Style → Building<b className="hs-s">2/10</b>
        </div>
        <div className="hs-r hs-m hs-i">4 answered</div>
      </Step>
    </>
  );
}
