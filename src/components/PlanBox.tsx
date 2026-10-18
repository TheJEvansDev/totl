"use client";

import { useState } from "react";
import { remember, type PlaceInfo } from "@/lib/client/places";
import type { SearchRequest } from "@/lib/types";

export interface PlanResult {
  summary: string;
  assumptions: string[];
}

export function PlanBox({ current, onPlan }: { current: SearchRequest; onPlan: (r: SearchRequest, plan: PlanResult) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, current }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't plan that.");
      remember(body.places as Record<string, PlaceInfo>);
      onPlan(body.request as SearchRequest, { summary: body.summary, assumptions: body.assumptions });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't plan that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card plan"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field">
        <span className="section-label" style={{ margin: 0 }}>Describe your trip</span>
        <textarea
          className="input plan-input"
          rows={3}
          maxLength={800}
          value={text}
          placeholder="e.g. 2 of us from Bristol, somewhere warm for 4 or 5 nights in March, about £350 each, central apartment"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) submit();
          }}
        />
      </label>
      {error && <p className="notice notice-bad" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="meta">We&apos;ll fill in the search and show where you could compromise to save.</span>
        <button className="btn btn-primary" disabled={busy || text.trim().length < 8}>{busy ? "Planning…" : "Plan my trip"}</button>
      </div>
    </form>
  );
}
