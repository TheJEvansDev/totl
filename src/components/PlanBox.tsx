"use client";

import { useState } from "react";
import type { Plan } from "@/lib/ai/plan";
import { getAirport } from "@/lib/data/airports";
import { getDestination } from "@/lib/data/destinations";
import { addDays, isValidDate, todayUK } from "@/lib/dates";
import type { SearchRequest } from "@/lib/types";

/** Turns Claude's plan into a search, keeping anything it left blank from the current form. */
export function planToRequest(plan: Plan, current: SearchRequest): SearchRequest {
  const g = current.groups[0];
  const home = getAirport(plan.homeAirport)?.code ?? g.homeAirport;
  const cities = plan.cities.map((c) => getDestination(c)?.code).filter((c): c is string => !!c);
  const t = todayUK();
  const from = isValidDate(plan.from) ? plan.from : addDays(t, 14);
  const to = isValidDate(plan.to) ? plan.to : addDays(from, 30);
  return {
    groups: [
      {
        ...g,
        homeAirport: home,
        extraAirports: plan.extraAirports.map((c) => getAirport(c)?.code).filter((c): c is string => !!c && c !== home),
        nearbyHours: plan.nearbyHours,
        returnTo: getAirport(plan.returnTo)?.code ?? "",
        mixAirports: true,
        adults: Math.max(1, plan.adults),
        children: Math.max(0, plan.children),
      },
    ],
    destination:
      plan.destinationMode === "cities" && cities.length > 0
        ? { mode: "cities", cities }
        : { mode: "anywhere", maxPerPerson: plan.maxPerPerson > 0 ? plan.maxPerPerson : 400 },
    dates:
      plan.dateMode === "window"
        ? { mode: "window", from, to, minNights: Math.max(1, plan.minNights), maxNights: Math.max(plan.minNights, plan.maxNights), weekendsOnly: plan.weekendsOnly }
        : plan.dateMode === "flexible"
          ? { mode: "flexible", depart: from, return: to, flexDays: Math.min(3, Math.max(1, plan.flexDays)) }
          : { mode: "fixed", depart: from, return: to },
    bags: plan.checkedBag ? "checked" : "cabin",
    stay: { type: plan.stayType, minRating: plan.minRating || 7.5, maxCentreMins: plan.maxCentreMins || 20 },
  };
}

export function PlanBox({ current, onPlan }: { current: SearchRequest; onPlan: (r: SearchRequest, plan: Plan) => void }) {
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
        body: JSON.stringify({ text, homeAirport: current.groups[0].homeAirport }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't plan that.");
      onPlan(planToRequest(body.plan as Plan, current), body.plan as Plan);
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
