"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { destName, money, setDisplayCurrency, shortDate, moneyText } from "@/lib/client/format";
import { ensurePlaces, place, remember } from "@/lib/client/places";
import { CURRENCIES, currencyLabel, defaultCurrency } from "@/lib/currency";
import { type SavedSearch, addSaved, decodeSearch, encodeSearch, loadPrefs, loadSaved, removeSaved, savePrefs } from "@/lib/client/storage";
import type { SearchRequest, SearchResponse, SortMode } from "@/lib/types";
import { Compromises } from "./Compromises";
import { Feedback } from "./Feedback";
import { Heatmap } from "./Heatmap";
import { INTENT_LABEL, type Intent, IntentChooser } from "./IntentChooser";
import { type PlanResult, PlanBox } from "./PlanBox";
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

export function App({ aiEnabled }: { aiEnabled: boolean }) {
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
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  // Remounting the form folds every step up (after a search, or a loaded/planned search).
  const [formKey, setFormKey] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const foldForm = useCallback(() => {
    setReviewing(true);
    setFormKey((k) => k + 1);
  }, []);
  const [currency, setCurrency] = useState("GBP");
  const [rates, setRates] = useState<Record<string, number>>({ GBP: 1 });
  const [ratesNote, setRatesNote] = useState("");

  function chooseCurrency(code: string, rateTable = rates) {
    const rate = rateTable[code];
    if (!rate) return;
    setDisplayCurrency(code, rate);
    setCurrency(code);
    savePrefs({ currency: code });
  }

  const run = useCallback(async (r: SearchRequest, lucky = false) => {
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
      remember((body as SearchResponse).places);
      setRes(body as SearchResponse);
      foldForm();
      setLastReq(r);
      setShown(15);
      setTab("trips");
      // "I'm feeling lucky": open the single best trip straight away.
      const best = [...(body as SearchResponse).trips].sort((a, b) => a.smartScore - b.smartScore)[0];
      if (lucky && best) setOpenTrip(best.id);
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }, [foldForm]);

  useEffect(() => {
    const prefs = loadPrefs();
    fetch("/api/rates")
      .then((r) => r.json())
      .then((body: { rates: Record<string, number>; date: string | null; source: string }) => {
        setRates(body.rates);
        setRatesNote(body.date ? `Exchange rates from the ${body.source}, ${body.date}` : "Approximate exchange rates");
        if (prefs.currency && body.rates[prefs.currency]) {
          setDisplayCurrency(prefs.currency, body.rates[prefs.currency]);
          setCurrency(prefs.currency);
        }
      })
      .catch(() => {});

    const saved = loadSaved();
    setSaved(saved);
    const q = new URLSearchParams(location.search).get("q");
    const shared = q ? decodeSearch(q) : null;
    const codesOf = (r: SearchRequest) => [
      ...r.groups.flatMap((g) => [g.homeAirport, g.returnTo, ...g.extraAirports]),
      ...(r.destination.mode === "cities" ? r.destination.cities : []),
    ];
    if (shared) {
      ensurePlaces(codesOf(shared)).then(() => {
        setReq({ ...shared });
        setIntent(shared.destination.mode === "anywhere" ? "anywhere" : "pick");
        run(shared);
      });
      return;
    }
    if (prefs.homeAirport) {
      const home = prefs.homeAirport;
      ensurePlaces([home]).then(() => setReq(defaultRequest(home)));
    }
  }, [run]);

  // Default the currency to the home airport's country, unless the user picked one.
  const home = req.groups[0].homeAirport;
  useEffect(() => {
    if (!home || loadPrefs().currency) return;
    const p = place(home);
    if (p) {
      const code = defaultCurrency(p.countryCode);
      if (rates[code]) {
        setDisplayCurrency(code, rates[code]);
        setCurrency(code);
      }
    }
  }, [home, rates]);

  const trips = useMemo(() => {
    if (!res) return [];
    const list = [...res.trips];
    if (sort === "smart") list.sort((a, b) => a.smartScore - b.smartScore);
    else if (sort === "cheapest") list.sort((a, b) => a.total - b.total);
    else list.sort((a, b) => (b.deal?.pctBelow ?? -1) - (a.deal?.pctBelow ?? -1) || a.smartScore - b.smartScore);
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

  const dealCount = useMemo(() => res?.trips.filter((t) => t.deal).length ?? 0, [res]);
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
      <div className="currency-row">
        <Feedback />
        <label className="currency">
          <span>Prices in</span>
          <select value={currency} onChange={(e) => chooseCurrency(e.target.value)} aria-label="Currency">
            {CURRENCIES.filter((c) => rates[c]).map((c) => (
              <option key={c} value={c}>{currencyLabel(c)}</option>
            ))}
          </select>
        </label>
      </div>
      {intent === null ? (
        <IntentChooser
          aiEnabled={aiEnabled}
          onChoose={(i) => {
            setIntent(i);
            setPlan(null);
            setError("");
            if (i === "pick") setReq((r) => ({ ...r, destination: r.destination.mode === "cities" ? r.destination : { mode: "cities", cities: [] } }));
            if (i === "anywhere") setReq((r) => ({ ...r, destination: r.destination.mode === "anywhere" ? r.destination : { mode: "anywhere", maxPerPerson: 300 } }));
            setReviewing(false);
            setFormKey((k) => k + 1);
          }}
        />
      ) : (
        <div className="intent-bar">
          <span>{INTENT_LABEL[intent]}</span>
          <button type="button" className="btn-link" onClick={() => setIntent(null)}>Change</button>
        </div>
      )}
      {aiEnabled && intent === "describe" && (
        <PlanBox
          current={req}
          onPlan={(r, p) => {
            setReq(r);
            setPlan(p);
            setIntent(r.destination.mode === "anywhere" ? "anywhere" : "pick");
            foldForm();
            if (r.groups[0].homeAirport) run(r);
            else setError("Which airport are you flying from? Choose it below, then search.");
          }}
        />
      )}
      {plan && (
        <div className="notice notice-info plan-summary">
          <b>{plan.summary}</b>
          {plan.assumptions.length > 0 && (
            <ul>
              {plan.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          <span className="meta">Check the details below and change anything that&apos;s not right.</span>
        </div>
      )}
      {(intent === "pick" || intent === "anywhere") && (
        <SearchForm
          key={formKey}
          reviewing={reviewing}
          intent={intent}
          value={req}
          onChange={setReq}
          onSubmit={(lucky) => run(req, lucky)}
          busy={busy}
        />
      )}

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
            <p key={w} className="notice notice-info" style={{ margin: 0 }}>{moneyText(w)}</p>
          ))}

          {trips.length > 0 && (
            <>
              <div className="results-head">
                <div className="meta">
                  Checked {res.meta.combinationsChecked.toLocaleString("en-GB")} trip combinations in {(res.meta.tookMs / 1000).toFixed(1)}s
                  {currency !== "GBP" && ratesNote ? ` · ${ratesNote}` : ""}
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
                    <button aria-pressed={sort === "deals"} onClick={() => setSort("deals")}>
                      Deals{dealCount > 0 ? ` (${dealCount})` : ""}
                    </button>
                  </div>
                )}
              </div>
              {tab === "trips" && <Compromises items={res.compromises} onOpen={setOpenTrip} />}
              {tab === "trips" && sort === "smart" && (
                <p className="meta" style={{ margin: 0 }}>
                  Best value ranks by total price, but marks down 6am flights, long layovers, far-off airports and badly located stays.
                </p>
              )}
              {tab === "trips" && sort === "deals" && (
                <p className="meta" style={{ margin: 0 }}>
                  {dealCount > 0
                    ? "Flights well below the typical price for that route in this search. Possible error fares can be cancelled by the airline, so don't book non-refundable extras until it's confirmed."
                    : "No unusually cheap flights in this search. Try a wider date window or more airports."}
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
              <button className="name" onClick={() => { setReq(s.request); setIntent(s.request.destination.mode === "anywhere" ? "anywhere" : "pick"); run(s.request); }} title={s.name}>{s.name}</button>
              <button className="btn-link" aria-label={`Delete ${s.name}`} onClick={() => setSaved(removeSaved(s.id))}>Delete</button>
            </div>
          ))}
        </section>
      )}

      {selected && res && lastReq && (
        <TripDetail
          key={selected.id}
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
    </main>
  );
}
