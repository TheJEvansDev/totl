"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Apple's momentum projection: where a flick would come to rest. */
function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary instead of a hard stop. */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Bottom sheet. Drag it down (or flick it) to close; it leaves the way it came in.
 * On desktop it's a centred dialog.
 */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ startY: number; y: number; history: { y: number; t: number }[] } | null>(null);

  const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const close = useCallback(() => {
    const el = sheetRef.current;
    setClosing(true);
    if (!el || reducedMotion()) {
      onClose();
      return;
    }
    // Animate from wherever the sheet is now, down the way it came in.
    el.style.transition = `transform 0.3s ${EASE}`;
    el.style.transform = window.innerWidth >= 700 ? "translateY(24px) scale(0.98)" : "translateY(100%)";
    setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [close]);

  function onPointerDown(e: React.PointerEvent) {
    const el = sheetRef.current;
    // Drags start from the handle and title area, on touch or pen; the rest scrolls.
    const fromTop = (e.target as HTMLElement).closest(".sheet-top");
    if (!el || !fromTop || e.pointerType === "mouse" || el.scrollTop > 0 || window.innerWidth >= 700) return;
    drag.current = { startY: e.clientY, y: 0, history: [{ y: e.clientY, t: e.timeStamp }] };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.startY;
    // Small threshold before committing to a drag, so taps and scrolls still work.
    if (d.y === 0 && Math.abs(dy) < 10) return;
    if (d.y === 0) el.setPointerCapture(e.pointerId);
    d.y = dy >= 0 ? dy : rubberband(dy, el.offsetHeight);
    d.history = [...d.history.slice(-4), { y: e.clientY, t: e.timeStamp }];
    el.style.transition = "none";
    el.style.transform = `translateY(${d.y}px)`;
  }

  function onPointerUp() {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el || d.y === 0) return;
    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const velocity = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    // Decide from where the flick is heading, not just where it was let go.
    if (d.y + project(velocity) > el.offsetHeight * 0.35) close();
    else {
      el.style.transition = `transform 0.4s ${EASE}`;
      el.style.transform = "translateY(0)";
    }
  }

  return (
    <div className="overlay" data-closing={closing} onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-top">
          <div className="sheet-grab" aria-hidden="true" />
          <div className="sheet-head">
            <div>
              <h2>{title}</h2>
              {subtitle && <div className="trip-dates">{subtitle}</div>}
            </div>
            <button ref={closeRef} className="close" aria-label="Close" onClick={close}>×</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
