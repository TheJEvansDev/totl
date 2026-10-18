"use client";

import { useState } from "react";
import { UK_AIRPORTS, haversineKm } from "@/lib/data/airports";
import { DESTINATIONS, getDestination } from "@/lib/data/destinations";
import { addDays, daysBetween, todayUK } from "@/lib/dates";
import type { SearchRequest } from "@/lib/types";

const AIRPORTS_SORTED = [...UK_AIRPORTS].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
const DESTS_SORTED = [...DESTINATIONS].sort((a, b) => a.name.localeCompare(b.name));

export function defaultRequest(homeAirport = ""): SearchRequest {
  const t = todayUK();
  return {
    groups: [{ id: "you", homeAirport, extraAirports: [], nearbyHours: 0, mixAirports: true, returnTo: "", from: null, adults: 2, children: 0 }],
    destination: { mode: "anywhere", maxPerPerson: 300 },
    dates: { mode: "window", from: addDays(t, 14), to: addDays(t, 52), minNights: 2, maxNights: 3, weekendsOnly: true },
    bags: "cabin",
    stay: { type: "any", minRating: 7.5, maxCentreMins: 20 },
  };
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", flex: "1 1 160px" }}>
      <span>{label}</span>
      <span className="stepper">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </span>
    </div>
  );
}

export function SearchForm({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: SearchRequest;
  onChange: (r: SearchRequest) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const g = value.groups[0];
  const setGroup = (patch: Partial<typeof g>) => onChange({ ...value, groups: [{ ...g, ...patch }, ...value.groups.slice(1)] });
  const t = todayUK();
  const d = value.dates;

  function useLocation() {
    if (!navigator.geolocation) {
      setLocError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const from = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const nearest = [...UK_AIRPORTS].sort((a, b) => haversineKm(from, a) - haversineKm(from, b))[0];
        setGroup({ from, homeAirport: g.homeAirport || nearest.code, nearbyHours: g.nearbyHours || 2 });
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
    if (mode === "window") onChange({ ...value, dates: defaultRequest().dates });
    else {
      const depart = d.mode === "window" ? d.from : d.depart;
      const ret = d.mode === "window" ? addDays(d.from, d.minNights) : d.return;
      onChange({ ...value, dates: mode === "fixed" ? { mode, depart, return: ret } : { mode, depart, return: ret, flexDays: 3 } });
    }
  }

  function preset(kind: "weekend" | "week") {
    onChange({
      ...value,
      dates:
        kind === "weekend"
          ? { mode: "window", from: addDays(t, 7), to: addDays(t, 49), minNights: 2, maxNights: 3, weekendsOnly: true }
          : { mode: "window", from: addDays(t, 14), to: addDays(t, 56), minNights: 7, maxNights: 7, weekendsOnly: false },
    });
  }

  const cities = value.destination.mode === "cities" ? value.destination.cities : [];
  const windowTooLong = d.mode === "window" && daysBetween(d.from, d.to) > 45;

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <div className="section-label">From</div>
        <div className="row">
          <label className="field">
            <span>Home airport</span>
            <select className="input" value={g.homeAirport} required onChange={(e) => setGroup({ homeAirport: e.target.value })}>
              <option value="">Select…</option>
              {AIRPORTS_SORTED.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.city === a.name ? a.name : `${a.city} ${a.name}`} ({a.code})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nearby airports</span>
            <select className="input" value={g.nearbyHours} onChange={(e) => setGroup({ nearbyHours: Number(e.target.value) })}>
              <option value={0}>No, just mine</option>
              <option value={1}>Within 1 hour</option>
              <option value={1.5}>Within 1.5 hours</option>
              <option value={2}>Within 2 hours</option>
              <option value={3}>Within 3 hours</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Add another airport</span>
            <select
              className="input"
              value=""
              onChange={(e) => e.target.value && setGroup({ extraAirports: [...new Set([...g.extraAirports, e.target.value])] })}
            >
              <option value="">Choose…</option>
              {AIRPORTS_SORTED.filter((a) => a.code !== g.homeAirport && !g.extraAirports.includes(a.code)).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.city === a.name ? a.name : `${a.city} ${a.name}`} ({a.code})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={useLocation} disabled={locating} style={{ alignSelf: "end" }}>
            {g.from ? "✓ Using your location" : locating ? "Finding you…" : "Use my location"}
          </button>
        </div>
        {g.extraAirports.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {g.extraAirports.map((code) => (
              <button type="button" key={code} className="chip" aria-label={`Remove ${code}`} onClick={() => setGroup({ extraAirports: g.extraAirports.filter((c) => c !== code) })}>
                {code} <span className="x">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Fly home into</span>
            <select
              className="input"
              value={!g.mixAirports ? "same" : g.returnTo}
              onChange={(e) =>
                e.target.value === "same"
                  ? setGroup({ mixAirports: false, returnTo: "" })
                  : setGroup({ mixAirports: true, returnTo: e.target.value })
              }
            >
              <option value="">Whichever works out best</option>
              <option value="same">The airport I flew out of</option>
              {AIRPORTS_SORTED.map((a) => (
                <option key={a.code} value={a.code}>
                  Only {a.city === a.name ? a.name : `${a.city} ${a.name}`} ({a.code}){a.code === g.homeAirport ? " (home)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          Fly out of a cheaper airport further away and land back close to home. Getting home quickly counts for more in Best value.
        </p>
        {locError && <p className="meta">{locError}</p>}
      </div>

      <div>
        <div className="section-label">To</div>
        <Seg
          label="Destination type"
          value={value.destination.mode}
          options={[["anywhere", "Anywhere under £X"], ["cities", "Choose places"]]}
          onChange={(mode) =>
            onChange({ ...value, destination: mode === "anywhere" ? { mode, maxPerPerson: 300 } : { mode, cities: [] } })
          }
        />
        <div style={{ marginTop: 10 }}>
          {value.destination.mode === "anywhere" ? (
            <label className="field" style={{ maxWidth: 260 }}>
              <span>Max total per person (all in)</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={50}
                step={10}
                value={value.destination.maxPerPerson}
                onChange={(e) => onChange({ ...value, destination: { mode: "anywhere", maxPerPerson: Number(e.target.value) } })}
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Add a destination</span>
                <select
                  className="input"
                  value=""
                  onChange={(e) =>
                    e.target.value && onChange({ ...value, destination: { mode: "cities", cities: [...new Set([...cities, e.target.value])] } })
                  }
                >
                  <option value="">Choose…</option>
                  {DESTS_SORTED.filter((c) => !cities.includes(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}, {c.country}
                    </option>
                  ))}
                </select>
              </label>
              {cities.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {cities.map((code) => (
                    <button
                      type="button"
                      key={code}
                      className="chip"
                      aria-label={`Remove ${getDestination(code)?.name}`}
                      onClick={() => onChange({ ...value, destination: { mode: "cities", cities: cities.filter((c) => c !== code) } })}
                    >
                      {getDestination(code)?.name} <span className="x">×</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="section-label">When</div>
        <div className="chips" style={{ marginBottom: 10 }}>
          <button type="button" className="chip" onClick={() => preset("weekend")}>Weekend break, next 6 weeks</button>
          <button type="button" className="chip" onClick={() => preset("week")}>A week away</button>
        </div>
        <Seg
          label="Date type"
          value={d.mode}
          options={[["window", "Date window"], ["flexible", "Flexible"], ["fixed", "Exact dates"]]}
          onChange={setDateMode}
        />
        <div className="row" style={{ marginTop: 10 }}>
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
                <span>Nights (min)</span>
                <select className="input" value={d.minNights} onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ ...value, dates: { ...d, minNights: n, maxNights: Math.max(n, d.maxNights) } });
                }}>
                  {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Nights (max)</span>
                <select className="input" value={d.maxNights} onChange={(e) => onChange({ ...value, dates: { ...d, maxNights: Number(e.target.value) } })}>
                  {Array.from({ length: 14 }, (_, i) => i + 1).filter((n) => n >= d.minNights).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="check" style={{ flexBasis: "100%" }}>
                <input type="checkbox" checked={d.weekendsOnly} onChange={(e) => onChange({ ...value, dates: { ...d, weekendsOnly: e.target.checked } })} />
                Only leave Thu, Fri or Sat (weekend breaks)
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
                  <span>Flexibility</span>
                  <select className="input" value={d.flexDays} onChange={(e) => onChange({ ...value, dates: { ...d, flexDays: Number(e.target.value) } })}>
                    <option value={1}>± 1 day</option>
                    <option value={2}>± 2 days</option>
                    <option value={3}>± 3 days</option>
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="section-label">Who</div>
        <div className="row" style={{ gap: 16 }}>
          <Stepper label="Adults" value={g.adults} min={1} max={9} onChange={(n) => setGroup({ adults: n, children: Math.min(g.children, 9 - n) })} />
          <Stepper label="Children" value={g.children} min={0} max={9 - g.adults} onChange={(n) => setGroup({ children: n })} />
        </div>
      </div>

      <details className="advanced">
        <summary>Bags and accommodation options</summary>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div className="section-label">Bags (per person)</div>
            <Seg
              label="Bags"
              value={value.bags}
              options={[["cabin", "Cabin bag only"], ["checked", "1 checked bag"]]}
              onChange={(bags) => onChange({ ...value, bags })}
            />
          </div>
          <div>
            <div className="section-label">Accommodation</div>
            <Seg
              label="Accommodation type"
              value={value.stay.type}
              options={[["any", "Either"], ["hotel", "Hotel"], ["apartment", "Apartment"]]}
              onChange={(type) => onChange({ ...value, stay: { ...value.stay, type } })}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <label className="field">
                <span>Minimum rating</span>
                <select className="input" value={value.stay.minRating} onChange={(e) => onChange({ ...value, stay: { ...value.stay, minRating: Number(e.target.value) } })}>
                  {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((r) => <option key={r} value={r}>{r}+ {r === 7.5 ? "(recommended)" : ""}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Max from the centre</span>
                <select className="input" value={value.stay.maxCentreMins} onChange={(e) => onChange({ ...value, stay: { ...value.stay, maxCentreMins: Number(e.target.value) } })}>
                  {[10, 20, 30, 45].map((m) => <option key={m} value={m}>{m} mins{m === 20 ? " (recommended)" : ""}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
      </details>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy || windowTooLong}>
        {busy ? "Searching…" : "Find the cheapest trips"}
      </button>
    </form>
  );
}
