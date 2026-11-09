"use client";

import { useState } from "react";
import Tour from "./Tour";

/** The "?" on the Quiz and Progress pages: opens that page's guide (the same one shown on the first visit) */
export default function Help({ topic, className = "" }: { topic: "quiz" | "progress"; className?: string }) {
  const [open, setOpen] = useState(false);
  const title = topic === "quiz" ? "How a quiz works" : "How progress is counted";
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  return (
    <>
      <button type="button" className={`help-q ${className}`} aria-label={title} title={title} onClick={() => setOpen(true)}>
        ?
      </button>
      {open && <Tour id={topic} mobile={mobile} onClose={() => setOpen(false)} />}
    </>
  );
}
