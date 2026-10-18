"use client";

import { money } from "@/lib/client/format";
import type { Compromise } from "@/lib/types";

export function Compromises({ items, onOpen }: { items: Compromise[]; onOpen: (tripId: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="card saves" aria-label="Ways to save">
      <div className="section-label" style={{ margin: 0 }}>Ways to save on the top trip</div>
      {items.map((c) => {
        const body = (
          <>
            <span>
              <b>{c.label}</b>
              <br />
              <span className="meta">{c.detail}</span>
            </span>
            <span className="save-amount tabular">−{money(c.saving)}</span>
          </>
        );
        return c.tripId ? (
          <button key={c.label} className="save-row" onClick={() => onOpen(c.tripId!)}>{body}</button>
        ) : (
          <div key={c.label} className="save-row">{body}</div>
        );
      })}
    </section>
  );
}
