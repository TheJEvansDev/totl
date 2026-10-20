"use client";

import { useEffect, useState } from "react";
import { DISTANCE_CHOICES } from "@/lib/area";
import { displayCurrency, fromGbp, toGbp } from "@/lib/client/format";
import { type PlaceInfo, airportName, cityName, place, remember } from "@/lib/client/places";
import { addDays, daysBetween, todayUK } from "@/lib/dates";
import type { SearchRequest } from "@/lib/types";
import { PlacePicker } from "./PlacePicker";

export { defaultRequest } from "@/lib/defaults";

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper-row">
      <span>{label}</span>
      <span className="stepper">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </span>
    </div>
  );
}

/** A chosen airport or city, shown as a removable pill. */
function Pill({ code, city, onRemove }: { code: string; city?: boolean; onRemove: () => void }) {
  const p = place(code);
  const name = city ? cityName(code) : airportName(code);
  return (
    <span className="pill">
      <span className="pill-code">{code}</span>
      <span className="pill-name">{name}{p ? `, ${p.country}` : ""}</span>
      <button type="button" className="pill-x" aria-label={`Remove ${name}`} onClick={onRemove}>×</button>
    </span>
  );
}

/**
 * Budget in the display currency. Keeps exactly what's typed (no rounding to
 * steps, no jumping while converting) and passes the GBP amount up.
 */
function BudgetInput({ gbp, onChange }: { gbp: number; onChange: (gbp: number) => void }) {
  const [text, setText] = useState(String(fromGbp(gbp)));
  // Follow changes from elsewhere (e.g. a saved search or the trip planner).
  useEffect(() => {
    if (Math.round(toGbp(Number(text))) !== gbp) setText(String(fromGbp(gbp)));
    // Only react to the amount changing from outside.
  }, [gbp]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(amount) && amount > 0;
  return (
    <>
      <input
        className="input"
        type="text"
        inputMode="numeric"
        aria-invalid={!valid}
        value={text}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d]/g, "").slice(0, 6);
          setText(cleaned);
          const n = Number(cleaned);
          if (cleaned && n > 0) onChange(Math.max(1, Math.round(toGbp(n))));
        }}
      />
      {!valid && <span className="input-error">Enter an amount</span>}
    </>
  );
}

/** The airports behind a pick: itself, every airport of a city, or an area. */
async function airportsFor(p: PlaceInfo): Promise<string[]> {
  if (p.type === "airport") return [p.code];
  try {
    const res = await fetch(`/api/places?expand=${encodeURIComponent(p.code)}`);
    const { results } = (await res.json()) as { results: PlaceInfo[] };
    remember(results);
    return results.map((r) => r.code);
  } catch {
    return [];
  }
}

type ReturnChoice = "best" | "same" | "specific";
type StepState = "open" | "done" | "hidden";

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDay = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** One step of the search: open (editable), done (one-line summary) or hidden (not reached yet). */
function Step({
  index,
  total,
  title,
  state,
  summary,
  valid,
  onOpen,
  onNext,
  children,
}: {
  index: number;
  total: number;
  title: string;
  state: StepState;
  summary: string;
  valid: boolean;
  onOpen: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  if (state === "hidden") return null;
  if (state === "done") {
    return (
      <button type="button" id={`step-${index}`} className="card step-summary" onClick={onOpen}>
        <span>
          <span className="step-summary-title">{title}</span>
          <span className="step-summary-text">{summary}</span>
        </span>
        <span className="step-change">Change</span>
      </button>
    );
  }
  return (
    <section className="card group step-open" id={`step-${index}`} aria-label={title}>
      <div className="step-head">
        <h2 className="group-title">{title}</h2>
        <span className="step-count">{index + 1} of {total}</span>
      </div>
      {children}
      <button type="button" className="btn btn-primary step-next" disabled={!valid} onClick={onNext}>
        {index === total - 1 ? "Done" : "Continue"}
      </button>
    </section>
  );
}

export function SearchForm({
  value,
  onChange,
  onSubmit,
  busy,
  reviewing = false,
  intent,
}: {
  value: SearchRequest;
  onChange: (r: SearchRequest) => void;
  onSubmit: (lucky?: boolean) => void;
  /** What they chose up front: a specific place or anywhere. Hides the switch between them. */
  intent?: "pick" | "anywhere";
  busy: boolean;
  /** Start with every step folded up, e.g. for a shared link or a planned trip. */
  reviewing?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [addingAirport, setAddingAirport] = useState(false);
  const g = value.groups[0];
  const setGroup = (patch: Partial<typeof g>) => onChange({ ...value, groups: [{ ...g, ...patch }, ...value.groups.slice(1)] });
  const t = todayUK();
  const d = value.dates;
  const cur = displayCurrency().code;
  const returnChoice: ReturnChoice = !g.mixAirports ? "same" : g.returnTo ? "specific" : "best";
  const [pickingReturn, setPickingReturn] = useState(returnChoice === "specific");

  function useLocation() {
    if (!navigator.geolocation) {
      setLocError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const from = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try {
          const res = await fetch(`/api/places?lat=${from.lat}&lon=${from.lon}`);
          const { results } = (await res.json()) as { results: PlaceInfo[] };
          remember(results);
          const nearest = results[0];
          setGroup({ from, homeAirport: g.homeAirport || nearest?.code || "", nearbyHours: g.nearbyHours || 2 });
        } catch {
          setGroup({ from, nearbyHours: g.nearbyHours || 2 });
        }
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get your location. You can still choose airports yourself.");
        setLocating(false);
      },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  function setDateMode(mode: SearchRequest["dates"]["mode"]) {
    if (mode === d.mode) return;
    if (mode === "window") onChange({ ...value, dates: { mode: "window", from: addDays(t, 14), to: addDays(t, 52), minNights: 2, maxNights: 3, weekendsOnly: false } });
    else {
      const depart = d.mode === "window" ? d.from : d.depart;
      const ret = d.mode === "window" ? addDays(d.from, d.minNights) : d.return;
      onChange({ ...value, dates: mode === "fixed" ? { mode, depart, return: ret } : { mode, depart, return: ret, flexDays: 3 } });
    }
  }

  function preset(kind: "weekend" | "week" | "fortnight") {
    const dates: SearchRequest["dates"] =
      kind === "weekend"
        ? { mode: "window", from: addDays(t, 7), to: addDays(t, 49), minNights: 2, maxNights: 3, weekendsOnly: true }
        : kind === "week"
          ? { mode: "window", from: addDays(t, 14), to: addDays(t, 56), minNights: 7, maxNights: 7, weekendsOnly: false }
          : { mode: "window", from: addDays(t, 21), to: addDays(t, 63), minNights: 13, maxNights: 14, weekendsOnly: false };
    onChange({ ...value, dates });
  }

  const cities = value.destination.mode === "cities" ? value.destination.cities : [];
  const windowTooLong = d.mode === "window" && daysBetween(d.from, d.to) > 45;
  const departAirports = [g.homeAirport, ...g.extraAirports].filter(Boolean);

  // Step-by-step: one section open at a time; finished ones fold into a summary.
  const STEPS = 6;
  const destinationOk = value.destination.mode === "anywhere" ? value.destination.maxPerPerson > 0 : cities.length > 0;
  const valid = [!!g.homeAirport, returnChoice !== "specific" || !!g.returnTo, destinationOk, !windowTooLong, true, true];
  const [reached, setReached] = useState(() => (reviewing ? STEPS : g.homeAirport ? 2 : 0));
  const [active, setActive] = useState<number | null>(() => (reviewing ? null : g.homeAirport ? 2 : 0));
  const canSearch = !!g.homeAirport && destinationOk && reached >= 3;

  useEffect(() => {
    if (active === null) return;
    const el = document.getElementById(`step-${active}`);
    if (el && active > 0) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [active]);

  const summaries = [
    g.homeAirport
      ? [airportName(g.homeAirport), ...g.extraAirports.map(airportName)].join(", ") + (g.nearbyHours ? ` + airports within ${g.nearbyHours} hr${g.nearbyHours > 1 ? "s" : ""}` : "")
      : "Not chosen yet",
    returnChoice === "best" ? "Best option, any of your airports" : returnChoice === "same" ? "The airport you fly out of" : g.returnTo ? `Into ${airportName(g.returnTo)}` : "Not chosen yet",
    value.destination.mode === "anywhere"
      ? `Anywhere up to ${cur} ${fromGbp(value.destination.maxPerPerson).toLocaleString("en-GB")} per person`
      : cities.length
        ? cities.map(cityName).join(", ")
        : "Not chosen yet",
    d.mode === "window"
      ? `Leaving ${shortDay(d.from)} to ${shortDay(d.to)}, ${d.minNights === d.maxNights ? d.minNights : `${d.minNights}-${d.maxNights}`} nights${d.weekendsOnly ? ", Thu-Sat only" : ""}`
      : `${shortDay(d.depart)} to ${shortDay(d.return)}${d.mode === "flexible" ? `, give or take ${d.flexDays} day${d.flexDays > 1 ? "s" : ""}` : ""}`,
    `${g.adults} adult${g.adults > 1 ? "s" : ""}${g.children ? `, ${g.children} child${g.children > 1 ? "ren" : ""}` : ""} · ${value.bags === "small" ? "small bag only" : value.bags === "cabin" ? "cabin bag" : "checked bag"}`,
    value.stay.type === "none"
      ? "Not needed"
      : `${value.stay.type === "any" ? "Hotel or flat" : value.stay.type === "hotel" ? "Hotel" : "Apartment"}, ${DISTANCE_CHOICES.find((c) => c.km === value.stay.maxCentreKm)?.label.toLowerCase() ?? `within ${value.stay.maxCentreKm} km`}, ${value.stay.minRating}+`,
  ];

  function stepProps(i: number) {
    return {
      index: i,
      total: STEPS,
      state: (active === i ? "open" : i <= reached ? "done" : "hidden") as StepState,
      summary: summaries[i],
      valid: valid[i],
      onOpen: () => setActive(i),
      onNext: () => {
        const frontier = Math.max(reached, i + 1);
        setReached(frontier);
        // First time through, open the next step. When changing an earlier
        // step, go back to wherever they'd got to (or close if all done).
        setActive(frontier >= STEPS ? null : frontier);
      },
    };
  }


  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {/* Where from */}
      <Step {...stepProps(0)} title="Flying from">
        {g.homeAirport ? (
          <div className="pills">
            <Pill code={g.homeAirport} onRemove={() => setGroup({ homeAirport: "", from: null })} />
          </div>
        ) : (
          <PlacePicker
            label="Your airport or city"
            placeholder="e.g. London, Bristol or BRS"
            cities
            areas
            onPick={async (p) => {
              const [first, ...rest] = await airportsFor(p);
              if (first) setGroup({ homeAirport: first, extraAirports: [...new Set([...rest, ...g.extraAirports])].filter((c) => c !== first) });
            }}
          />
        )}

        <div className="sub">
          <span className="sub-label">Also check airports nearby</span>
          <Seg
            label="Nearby airports"
            value={g.nearbyHours}
            options={[[0, "No"], [1, "1 hr"], [2, "2 hrs"], [3, "3 hrs"]]}
            onChange={(n) => setGroup({ nearbyHours: n })}
          />
        </div>

        {g.extraAirports.length > 0 && (
          <div className="pills">
            {g.extraAirports.map((code) => (
              <Pill key={code} code={code} onRemove={() => setGroup({ extraAirports: g.extraAirports.filter((c) => c !== code) })} />
            ))}
          </div>
        )}
        {addingAirport ? (
          <PlacePicker
            label="Add another airport or city to fly from"
            placeholder="e.g. London Stansted, or London for all of them"
            exclude={departAirports}
            cities
            areas
            autoFocus
            onPick={async (p) => {
              const codes = await airportsFor(p);
              setGroup({ extraAirports: [...new Set([...g.extraAirports, ...codes])].filter((c) => c !== g.homeAirport) });
              setAddingAirport(false);
            }}
          />
        ) : (
          <div className="row" style={{ gap: 16 }}>
            <button type="button" className="btn-link" onClick={() => setAddingAirport(true)}>+ Add another airport</button>
            <button type="button" className="btn-link" onClick={useLocation} disabled={locating}>
              {g.from ? "✓ Using your location" : locating ? "Finding you…" : "Use my location"}
            </button>
          </div>
        )}
        {locError && <p className="hint">{locError}</p>}
      </Step>

      {/* Flying home to */}
      <Step {...stepProps(1)} title="Flying home to">
        <Seg
          label="Flying home to"
          value={returnChoice}
          options={[["best", "Best option"], ["same", "Same airport"], ["specific", "Pick one"]]}
          onChange={(c) => {
            if (c === "best") setGroup({ mixAirports: true, returnTo: "" });
            if (c === "same") setGroup({ mixAirports: false, returnTo: "" });
            if (c === "specific") {
              setPickingReturn(true);
              setGroup({ mixAirports: true, returnTo: g.homeAirport });
            }
          }}
        />
        <p className="hint">
          {returnChoice === "best" && "We'll check flying home into a different airport too, e.g. out of a cheaper airport further away and back into your nearest."}
          {returnChoice === "same" && "You'll fly home into the airport you left from."}
          {returnChoice === "specific" && "Every trip will land back here, whichever airport you fly out of."}
        </p>
        {returnChoice === "specific" &&
          (g.returnTo && !pickingReturn ? (
            <div className="pills">
              <Pill code={g.returnTo} onRemove={() => setPickingReturn(true)} />
            </div>
          ) : (
            <PlacePicker
              label="Land back at"
              placeholder="e.g. Bristol"
              onPick={(p) => {
                setGroup({ returnTo: p.code, mixAirports: true });
                setPickingReturn(false);
              }}
            />
          ))}
      </Step>

      {/* Where to */}
      <Step {...stepProps(2)} title={intent === "pick" ? "Where are you going?" : intent === "anywhere" ? "Your budget" : "Going to"}>
        {!intent && (
          <Seg
            label="Destination type"
            value={value.destination.mode}
            options={[["anywhere", "Anywhere in budget"], ["cities", "Choose places"]]}
            onChange={(mode) =>
              onChange({ ...value, destination: mode === "anywhere" ? { mode, maxPerPerson: 300 } : { mode, cities: [] } })
            }
          />
        )}
        {value.destination.mode === "anywhere" ? (
          <label className="field budget">
            <span>Most you&apos;d spend per person, all in</span>
            <span className="input-prefix">
              <span aria-hidden="true">{cur}</span>
              <BudgetInput
                key={cur}
                gbp={value.destination.maxPerPerson}
                onChange={(gbp) => onChange({ ...value, destination: { mode: "anywhere", maxPerPerson: gbp } })}
              />
            </span>
          </label>
        ) : (
          <>
            {cities.length > 0 && (
              <div className="pills">
                {cities.map((code) => (
                  <Pill key={code} code={code} city onRemove={() => onChange({ ...value, destination: { mode: "cities", cities: cities.filter((c) => c !== code) } })} />
                ))}
              </div>
            )}
            <PlacePicker
              label={cities.length ? "Add another place" : "Where do you want to go?"}
              placeholder="City or airport, e.g. Lisbon or New York"
              cities
              exclude={cities}
              onPick={(p) => onChange({ ...value, destination: { mode: "cities", cities: [...new Set([...cities, p.code])] } })}
            />
          </>
        )}
      </Step>

      {/* When */}
      <Step {...stepProps(3)} title="When">
        <div className="chips">
          <button type="button" className="chip" onClick={() => preset("weekend")}>Weekend away</button>
          <button type="button" className="chip" onClick={() => preset("week")}>A week</button>
          <button type="button" className="chip" onClick={() => preset("fortnight")}>Two weeks</button>
        </div>
        <Seg
          label="Date type"
          value={d.mode}
          options={[["window", "Flexible window"], ["flexible", "Around dates"], ["fixed", "Exact dates"]]}
          onChange={setDateMode}
        />
        <div className="row">
          {d.mode === "window" ? (
            <>
              <label className="field">
                <span>Leave from</span>
                <input className="input" type="date" min={addDays(t, 1)} value={d.from} onChange={(e) => onChange({ ...value, dates: { ...d, from: e.target.value } })} />
              </label>
              <label className="field">
                <span>Leave by</span>
                <input className="input" type="date" min={d.from} value={d.to} onChange={(e) => onChange({ ...value, dates: { ...d, to: e.target.value } })} />
              </label>
              <label className="field">
                <span>Nights, from</span>
                <select
                  className="input"
                  value={d.minNights}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onChange({ ...value, dates: { ...d, minNights: n, maxNights: Math.max(n, d.maxNights) } });
                  }}
                >
                  {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="field">
                <span>to</span>
                <select className="input" value={d.maxNights} onChange={(e) => onChange({ ...value, dates: { ...d, maxNights: Number(e.target.value) } })}>
                  {Array.from({ length: 21 }, (_, i) => i + 1).filter((n) => n >= d.minNights).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="check" style={{ flexBasis: "100%" }}>
                <input type="checkbox" checked={d.weekendsOnly} onChange={(e) => onChange({ ...value, dates: { ...d, weekendsOnly: e.target.checked } })} />
                Only leave Thursday to Saturday
              </label>
              {windowTooLong && <p className="notice notice-warn" style={{ flexBasis: "100%", margin: 0 }}>Windows can be up to 45 days. Shorten it to search.</p>}
            </>
          ) : (
            <>
              <label className="field">
                <span>Depart</span>
                <input className="input" type="date" min={addDays(t, 1)} value={d.depart} onChange={(e) => onChange({ ...value, dates: { ...d, depart: e.target.value } })} />
              </label>
              <label className="field">
                <span>Return</span>
                <input className="input" type="date" min={d.depart} value={d.return} onChange={(e) => onChange({ ...value, dates: { ...d, return: e.target.value } })} />
              </label>
              {d.mode === "flexible" && (
                <label className="field">
                  <span>Give or take</span>
                  <select className="input" value={d.flexDays} onChange={(e) => onChange({ ...value, dates: { ...d, flexDays: Number(e.target.value) } })}>
                    <option value={1}>1 day</option>
                    <option value={2}>2 days</option>
                    <option value={3}>3 days</option>
                  </select>
                </label>
              )}
              {d.mode === "flexible" && d.return > d.depart && (() => {
                const nights = daysBetween(d.depart, d.return);
                const tomorrow = addDays(todayUK(), 1);
                const from = addDays(d.depart, -d.flexDays) < tomorrow ? tomorrow : addDays(d.depart, -d.flexDays);
                return (
                  <p className="fineprint" style={{ margin: 0 }}>
                    Leaving any day from {shortDay(from)} to {shortDay(addDays(d.depart, d.flexDays))}, coming home up to {d.flexDays} day
                    {d.flexDays > 1 ? "s" : ""} either side of {shortDay(d.return)}. Trips can be a night shorter or longer than your {nights}{" "}
                    night{nights > 1 ? "s" : ""}, so {Math.max(1, nights - 1)} to {nights + 1} nights.
                  </p>
                );
              })()}
            </>
          )}
        </div>
      </Step>

      {/* Who and stay */}
      <Step {...stepProps(4)} title="Who’s going">
        <Stepper label="Adults" value={g.adults} min={1} max={9} onChange={(n) => setGroup({ adults: n, children: Math.min(g.children, 9 - n) })} />
        <Stepper label="Children" value={g.children} min={0} max={9 - g.adults} onChange={(n) => setGroup({ children: n })} />
        <div className="sub">
          <span className="sub-label">Bags each</span>
          <Seg label="Bags" value={value.bags} options={[["small", "Small bag only"], ["cabin", "Cabin bag"], ["checked", "Checked bag"]]} onChange={(bags) => onChange({ ...value, bags })} />
        </div>
        <p className="fineprint" style={{ margin: 0 }}>
          Small bag: fits under the seat, free on every airline. Cabin bag: a wheelie bag for the overhead lockers, which budget airlines
          charge for, so we add their fee.
        </p>
      </Step>

      <Step {...stepProps(5)} title="Where you stay">
        <Seg
          label="Accommodation type"
          value={value.stay.type}
          options={[["any", "Hotel or flat"], ["hotel", "Hotel"], ["apartment", "Apartment"], ["none", "Not needed"]]}
          onChange={(type) => onChange({ ...value, stay: { ...value.stay, type } })}
        />
        {value.stay.type === "none" && (
          <p className="hint">Staying with friends or family, or already booked? We&apos;ll just find the cheapest way to get there and back.</p>
        )}
        {value.stay.type !== "none" && (
        <>
        <div className="sub">
          <span className="sub-label">How close to the centre</span>
          <Seg
            label="Distance from the centre"
            value={value.stay.maxCentreKm}
            options={DISTANCE_CHOICES.map((c) => [c.km, c.label] as [number, string])}
            onChange={(km) => onChange({ ...value, stay: { ...value.stay, maxCentreKm: km } })}
          />
          <p className="hint">
            {DISTANCE_CHOICES.find((c) => c.km === value.stay.maxCentreKm)?.hint ?? `within ${value.stay.maxCentreKm} km`} as the crow flies. We&apos;ll still show
            you if staying a little further out saves real money, with the travel cost included.
          </p>
        </div>
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Guest rating at least</span>
          <select className="input" value={value.stay.minRating} onChange={(e) => onChange({ ...value, stay: { ...value.stay, minRating: Number(e.target.value) } })}>
            {[6, 7, 7.5, 8, 8.5, 9].map((r) => <option key={r} value={r}>{r} / 10{r === 7.5 ? " (good)" : r >= 8.5 ? " (excellent)" : r >= 8 ? " (very good)" : ""}</option>)}
          </select>
        </label>
        </>
        )}
      </Step>

      {canSearch && (
      <div className="submit-bar">
        {value.destination.mode === "anywhere" ? (
          <div className="submit-pair">
            <button className="btn btn-primary btn-block" type="submit" disabled={busy || windowTooLong}>
              {busy ? "Searching…" : "Show me the best places"}
            </button>
            <button className="btn btn-block lucky" type="button" disabled={busy || windowTooLong} onClick={() => onSubmit(true)}>
              I&apos;m feeling lucky
            </button>
          </div>
        ) : (
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || windowTooLong}>
            {busy ? "Searching…" : "Find the cheapest trips"}
          </button>
        )}
      </div>
      )}
    </form>
  );
}
