"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { destName, money, shortDate } from "@/lib/client/format";
import { type SavedSearch, addSaved, decodeSearch, encodeSearch, loadPrefs, loadSaved, removeSaved, savePrefs } from "@/lib/client/storage";
import type { SearchRequest, SearchResponse, SortMode } from "@/lib/types";
import { Feedback } from "./Feedback";
import { Heatmap } from "./Heatmap";
import { SearchForm, defaultRequest } from "./SearchForm";
import { TripCard } from "./TripCard";
import { TripDetail } from "./TripDetail";

const DestinationMap = dynamic(() => import("./DestinationMap").then((m) => m.DestinationMap), {
  ssr: false,
  loading: () => <div className="map" />,
});

type Tab = "trips" | "calendar" | "map";

function describe(req: SearchRequest): string {
  const g = req.groups[0];
  const to = req.destination.mode === "anywhere" ? `Anywhere under ${money(req.destination.maxPerPerson)}` : req.destination.cities.map(destName).join(", ");
  const d = req.dates;
  const when = d.mode === "window" ? `${shortDate(d.from)}–${shortDate(d.to)}, ${d.minNights}-${d.maxNights} nights` : `${shortDate(d.depart)}–${shortDate(d.return)}`;
  return `${g.homeAirport} → ${to} · ${when}`;
}

export function App() {
  const [req, setReq] = useState<SearchRequest>(() => defaultRequest());
  const [lastReq, setLastReq] = useState<SearchRequest | null>(null);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortMode>("smart");
  const [tab, setTab] = useState<Tab>("trips");
  const [shown, setShown] = useState(15);
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [toast, setToast] = useState("");

  const run = useCallback(async (r: SearchRequest) => {
    if (!r.groups[0].homeAirport) {
      setError("Choose your home airport first.");
      return;
    }
    setBusy(true);
    setError("");
    setOpenTrip(null);
    savePrefs({ homeAirport: r.groups[0].homeAirport });
    try {
      history.replaceState(null, "", `?q=${encodeSearch(r)}`);
    } catch {
      // URL update is a nicety only.
    }
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(r),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      setRes(body as SearchResponse);
      setLastReq(r);
      setShown(15);
      setTab("trips");
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setSaved(loadSaved());
    const q = new URLSearchParams(location.search).get("q");
    const shared = q ? decodeSearch(q) : null;
    if (shared) {
      setReq(shared);
      run(shared);
      return;
    }
    const prefs = loadPrefs();
    if (prefs.homeAirport) setReq(defaultRequest(prefs.homeAirport));
  }, [run]);

  const trips = useMemo(() => {
    if (!res) return [];
    const list = [...res.trips];
    if (sort === "smart") list.sort((a, b) => a.smartScore - b.smartScore);
    else list.sort((a, b) => a.total - b.total);
    // Keep variety near the top: at most 3 trips per destination before the rest.
    const counts = new Map<string, number>();
    const first: typeof list = [];
    const rest: typeof list = [];
    for (const t of list) {
      const n = counts.get(t.destination) ?? 0;
      counts.set(t.destination, n + 1);
      (n < 3 ? first : rest).push(t);
    }
    return [...first, ...rest];
  }, [res, sort]);

  const tripById = useMemo(() => new Map(res?.trips.map((t) => [t.id, t]) ?? []), [res]);
  const selected = openTrip ? tripById.get(openTrip) : undefined;
  const closeTrip = useCallback(() => setOpenTrip(null), []);
  const showMap = (res?.destinations.length ?? 0) > 1;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      flash("Link copied. Send it to a friend.");
    } catch {
      flash("Couldn't copy. Copy the address bar instead.");
    }
  }

  return (
    <main className="shell">
      <SearchForm value={req} onChange={setReq} onSubmit={() => run(req)} busy={busy} />

      {error && <p className="notice notice-bad" role="alert" style={{ marginTop: 12 }}>{error}</p>}

      {busy && (
        <div className="card loading" style={{ marginTop: 16 }} aria-live="polite">
          <div>Checking every date, airport and stay combination…</div>
          <div className="bar"><i /></div>
        </div>
      )}

      {res && !busy && (
        <section id="results" className="results" aria-label="Results">
          {res.meta.sample && (
            <p className="notice notice-warn" style={{ margin: 0 }}>
              <b>Sample data.</b> Prices are made up so you can try the app. Real prices appear once the API keys are added.
            </p>
          )}
          {res.meta.warnings.map((w) => (
            <p key={w} className="notice notice-info" style={{ margin: 0 }}>{w}</p>
          ))}

          {trips.length > 0 && (
            <>
              <div className="results-head">
                <div className="meta">
                  Checked {res.meta.combinationsChecked.toLocaleString("en-GB")} trip combinations in {(res.meta.tookMs / 1000).toFixed(1)}s
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-small" onClick={() => lastReq && setSaved(addSaved(describe(lastReq), lastReq))}>☆ Save</button>
                  <button className="btn btn-small" onClick={share}>Share link</button>
                </div>
              </div>

              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="seg" role="tablist" aria-label="View">
                  {(["trips", "calendar", ...(showMap ? ["map"] : [])] as Tab[]).map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                      {t === "trips" ? "Trips" : t === "calendar" ? "Price calendar" : "Map"}
                    </button>
                  ))}
                </div>
                {tab === "trips" && (
                  <div className="seg" role="group" aria-label="Sort">
                    <button aria-pressed={sort === "smart"} onClick={() => setSort("smart")}>Best value</button>
                    <button aria-pressed={sort === "cheapest"} onClick={() => setSort("cheapest")}>Cheapest</button>
                  </div>
                )}
              </div>
              {tab === "trips" && sort === "smart" && (
                <p className="meta" style={{ margin: 0 }}>
                  Best value ranks by total price, but marks down 6am flights, long layovers, far-off airports and badly located stays.
                </p>
              )}
            </>
          )}

          {tab === "trips" && (
            <>
              {trips.slice(0, shown).map((t, i) => (
                <TripCard key={t.id} trip={t} rank={i + 1} onOpen={() => setOpenTrip(t.id)} />
              ))}
              {trips.length > shown && (
                <button className="btn" onClick={() => setShown((n) => n + 15)}>Show more trips</button>
              )}
            </>
          )}
          {tab === "calendar" && res.heatmap && <Heatmap data={res.heatmap} onPick={setOpenTrip} />}
          {tab === "map" && showMap && (
            <>
              <DestinationMap items={res.destinations} onPick={setOpenTrip} />
              <div className="dest-list">
                {res.destinations.map((d) => (
                  <button key={d.code} className="dest-row" onClick={() => setOpenTrip(d.bestTripId)}>
                    <span>{destName(d.code)}</span>
                    <span className="tabular"><b>{money(d.perPerson)}</b> pp</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {saved.length > 0 && (
        <section className="card saved" aria-label="Saved searches">
          <div className="section-label" style={{ margin: 0 }}>Saved searches</div>
          {saved.map((s) => (
            <div key={s.id} className="saved-row">
              <button className="name" onClick={() => { setReq(s.request); run(s.request); }} title={s.name}>{s.name}</button>
              <button className="btn-link" aria-label={`Delete ${s.name}`} onClick={() => setSaved(removeSaved(s.id))}>Delete</button>
            </div>
          ))}
        </section>
      )}

      {selected && res && lastReq && (
        <TripDetail
          trip={selected}
          sample={res.meta.sample}
          adults={lastReq.groups.reduce((s, g) => s + g.adults, 0)}
          children={lastReq.groups.reduce((s, g) => s + g.children, 0)}
          onClose={closeTrip}
        />
      )}

      {toast && (
        <div role="status" className="notice notice-info" style={{ position: "fixed", left: 16, right: 16, bottom: 72, maxWidth: 420, margin: "0 auto", zIndex: 1100, boxShadow: "var(--shadow)" }}>
          {toast}
        </div>
      )}
      <Feedback />
    </main>
  );
}
