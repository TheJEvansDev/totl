"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { money, shortDate } from "@/lib/client/format";
import { type PlaceInfo, airportName, place } from "@/lib/client/places";
import type { ExplorePlace, TripLength } from "@/lib/explore";
import { PlacePicker } from "./PlacePicker";
import { Seg } from "./SearchForm";

const Globe = dynamic(() => import("./Globe").then((m) => m.Globe), {
  ssr: false,
  loading: () => <div className="globe globe-loading" aria-hidden="true" />,
});

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short" });

/** "Any time" plus the next six months, as Google Explore's month numbers. */
function monthOptions(): [number, string][] {
  const now = new Date();
  const opts: [number, string][] = [[0, "Any time"]];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push([d.getMonth() + 1, monthFmt.format(d)]);
  }
  return opts;
}

/**
 * Spin the globe and see the cheapest places to fly from your airport, with
 * the dates they're cheapest. Tapping a place works out the whole trip cost
 * live; "I'm feeling lucky" flies to one of the cheapest and does it for you.
 */
export function Explore({
  home,
  onHome,
  onSearch,
  busy,
}: {
  home: string;
  onHome: (p: PlaceInfo) => void;
  onSearch: (p: ExplorePlace, lucky: boolean) => void;
  busy: boolean;
}) {
  const [length, setLength] = useState<TripLength>("weekend");
  const [month, setMonth] = useState(0);
  const [places, setPlaces] = useState<ExplorePlace[]>([]);
  const [sample, setSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ExplorePlace | null>(null);
  const months = useMemo(monthOptions, []);
  const homeInfo = home ? place(home) : undefined;

  useEffect(() => {
    if (!home) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    fetch(`/api/explore?from=${encodeURIComponent(home)}&length=${length}&month=${month}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load the globe.");
        setPlaces(body.places);
        setSample(body.sample);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [home, length, month]);

  const cheapest = useMemo(() => [...places].sort((a, b) => a.flightPrice - b.flightPrice), [places]);

  function lucky() {
    // One of the three cheapest, so it's a surprise but still a bargain.
    const pick = cheapest[Math.floor(Math.random() * Math.min(3, cheapest.length))];
    if (!pick) return;
    setSelected(pick);
    const wait = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2300;
    setTimeout(() => onSearch(pick, true), wait);
  }

  if (!home) {
    return (
      <section className="card explore-start">
        <p style={{ marginTop: 0 }}>Where are you flying from? We&apos;ll show the cheapest places you can get to from there.</p>
        <PlacePicker label="Your airport" placeholder="e.g. Bristol or BRS" onPick={onHome} autoFocus />
      </section>
    );
  }

  return (
    <section className="explore" aria-label="Explore the globe">
      <div className="explore-controls">
        <Seg label="Trip length" value={length} options={[["weekend", "Weekend"], ["week", "A week"]]} onChange={setLength} />
        <label className="explore-month">
          <span className="sr-only">Month</span>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {months.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="globe-wrap">
        <Globe places={places} home={homeInfo ? { lat: homeInfo.lat, lon: homeInfo.lon } : null} selected={selected} onSelect={setSelected} />
        <div className="globe-top">
          <span className="globe-from">From {homeInfo ? homeInfo.city || airportName(home) : home}</span>
          {loading && <span className="globe-status">Finding prices…</span>}
          {sample && !loading && <span className="globe-status">Sample prices</span>}
        </div>
        <button type="button" className="btn btn-primary globe-lucky" onClick={lucky} disabled={busy || loading || cheapest.length === 0}>
          I&apos;m feeling lucky
        </button>
      </div>

      {error && <p className="notice notice-bad" role="alert">{error}</p>}

      {selected ? (
        <article className="card explore-pick" aria-live="polite">
          {selected.thumbnail && <img className="explore-photo" src={selected.thumbnail} alt="" />}
          <div className="explore-pick-body">
            <div className="explore-pick-head">
              <div>
                <h2>{selected.name}</h2>
                <span className="meta">{selected.country}</span>
              </div>
              <div className="explore-price">
                <b className="tabular">{money(selected.flightPrice)}</b>
                <span className="meta">return flights pp</span>
              </div>
            </div>
            <p className="explore-when">
              {shortDate(selected.depart)} → {shortDate(selected.return)}
              {selected.airline ? ` · ${selected.airline}` : ""}
              {selected.stops !== null ? ` · ${selected.stops === 0 ? "direct" : `${selected.stops} stop${selected.stops > 1 ? "s" : ""}`}` : ""}
            </p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onSearch(selected, false)}>
              {busy ? "Working it out…" : "See the full trip cost"}
            </button>
            <p className="fineprint">
              {sample
                ? "Sample prices for trying the globe, not real fares."
                : "Google's latest price for these dates. We'll check it live and add bags, getting to the airport and where to stay."}
            </p>
          </div>
        </article>
      ) : (
        cheapest.length > 0 && <p className="fineprint explore-hint">Spin the globe and tap a price, or pick from the cheapest below.</p>
      )}

      {cheapest.length > 0 && (
        <>
          <h3>Cheapest from {homeInfo?.city ?? home}</h3>
          <ul className="explore-list">
            {cheapest.slice(0, 12).map((p) => (
              <li key={p.code}>
                <button type="button" className={`explore-row${selected?.code === p.code ? " explore-row-on" : ""}`} onClick={() => setSelected(p)}>
                  <span>
                    <b>{p.name}</b>
                    <span className="meta"> {p.country}</span>
                    <br />
                    <span className="meta">{shortDate(p.depart)} → {shortDate(p.return)}</span>
                  </span>
                  <b className="tabular">{money(p.flightPrice)}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
