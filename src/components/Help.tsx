"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HelpSheet from "./HelpSheet";
import Tour, { toursOn } from "./Tour";

/**
 * The "?" on the Quiz and Progress pages: opens that page's guide. On the first visit a small note points at it
 * from empty room beside it (Quiz: to its right; Progress: under it), taking no room on the page and covering no
 * control; the first touch anywhere puts it away.
 */
export default function Help({ topic, hint = false, className = "" }: { topic: "quiz" | "progress"; hint?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(hint);
  useEffect(() => setNote(hint), [hint]);
  // the note is drawn over the page (bars that clip what overflows them cannot cut it), placed from the button
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!note) return;
    const place = () => btn.current && setAt(btn.current.getBoundingClientRect());
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [note]);
  useEffect(() => {
    if (!note) return;
    const away = () => setNote(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", away, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", away, true);
    };
  }, [note]);
  const title = topic === "quiz" ? "How a quiz works" : "How progress is counted";
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  if (!toursOn(mobile)) return <HelpSheet topic={topic} className={className} />;
  return (
    <>
      <button ref={btn} type="button" className={`help-q ${className}`} aria-label={title} title={title} onClick={() => setOpen(true)}>
        ?
      </button>
      {note &&
        at &&
        at.width > 0 &&
        createPortal(
          <span
            className={`help-tip ${topic === "quiz" ? "r" : "b"}`}
            aria-hidden="true"
            style={topic === "quiz" ? { left: at.right + 10, top: at.top + at.height / 2 } : { right: window.innerWidth - at.right, top: at.bottom + 10 }}
          >
            {title}
            <i />
          </span>,
          document.body,
        )}
      {open && <Tour id={topic} mobile={mobile} onClose={() => setOpen(false)} />}
    </>
  );
}
