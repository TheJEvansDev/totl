// Validates and normalises a search request from the browser.

import { LIMITS } from "../config/penalties";
import { getAirport, getDestination, popularDestinations } from "../data/places";
import { addDays, dayOfWeek, daysBetween, isValidDate, todayUK } from "../dates";
import type { DateQuery, SearchRequest, TravellerGroup } from "../types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function parseRequest(raw: unknown): Parsed<SearchRequest> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid search." };
  const r = raw as Record<string, unknown>;

  const rawGroups = Array.isArray(r.groups) ? r.groups.slice(0, 6) : [];
  if (rawGroups.length === 0) return { ok: false, error: "Choose where you're flying from." };
  const groups: TravellerGroup[] = [];
  for (const [i, g] of rawGroups.entries()) {
    const gr = (g ?? {}) as Record<string, unknown>;
    const home = getAirport(String(gr.homeAirport ?? ""));
    if (!home) return { ok: false, error: "Choose the airport you're flying from." };
    const extras = Array.isArray(gr.extraAirports)
      ? [...new Set(gr.extraAirports.map((c) => getAirport(String(c))?.code).filter((c): c is string => !!c && c !== home.code))]
      : [];
    const from = gr.from as { lat?: unknown; lon?: unknown } | null | undefined;
    const validFrom =
      from && Number.isFinite(Number(from.lat)) && Number.isFinite(Number(from.lon))
        ? { lat: Number(from.lat), lon: Number(from.lon) }
        : null;
    const adults = int(gr.adults, 1, LIMITS.maxTravellers, 1);
    const children = int(gr.children, 0, LIMITS.maxTravellers - adults, 0);
    groups.push({
      id: String(gr.id ?? `g${i + 1}`).slice(0, 20),
      homeAirport: home.code,
      extraAirports: extras.slice(0, LIMITS.maxAirportsPerGroup),
      nearbyHours: num(gr.nearbyHours, 0, 4, 0),
      mixAirports: gr.mixAirports !== false,
      returnTo: getAirport(String(gr.returnTo ?? ""))?.code ?? "",
      from: validFrom,
      adults,
      children,
    });
  }

  const d = (r.destination ?? {}) as Record<string, unknown>;
  let destination: SearchRequest["destination"];
  if (d.mode === "anywhere") {
    destination = { mode: "anywhere", maxPerPerson: num(d.maxPerPerson, 1, 50000, 300) };
  } else {
    const cities = Array.isArray(d.cities)
      ? [...new Set(d.cities.map((c) => getDestination(String(c))?.code).filter((c): c is string => !!c))]
      : [];
    if (cities.length === 0) return { ok: false, error: "Choose at least one destination, or search anywhere." };
    destination = { mode: "cities", cities: cities.slice(0, LIMITS.maxCities) };
  }

  const dates = parseDates(r.dates);
  if (!dates.ok) return dates;

  const s = (r.stay ?? {}) as Record<string, unknown>;
  const stayType = s.type === "hotel" || s.type === "apartment" || s.type === "none" ? s.type : "any";

  return {
    ok: true,
    value: {
      groups,
      destination,
      dates: dates.value,
      bags: r.bags === "checked" || r.bags === "small" ? r.bags : "cabin",
      stay: {
        type: stayType,
        minRating: num(s.minRating, 0, 9.5, 7.5),
        // Older saved searches used minutes; convert roughly.
        maxCentreKm: num(s.maxCentreKm ?? (s.maxCentreMins !== undefined ? (Number(s.maxCentreMins) - 4) / 4.5 : undefined), 0.5, 15, 4),
      },
    },
  };
}

function parseDates(raw: unknown): Parsed<DateQuery> {
  const d = (raw ?? {}) as Record<string, unknown>;
  const tomorrow = addDays(todayUK(), 1);
  if (d.mode === "fixed" || d.mode === "flexible") {
    if (!isValidDate(d.depart) || !isValidDate(d.return)) return { ok: false, error: "Choose your travel dates." };
    if (d.depart < tomorrow) return { ok: false, error: "Departure date must be in the future." };
    const nights = daysBetween(d.depart, d.return);
    if (nights < 1 || nights > LIMITS.maxNights) return { ok: false, error: `Trips can be 1-${LIMITS.maxNights} nights.` };
    if (d.mode === "fixed") return { ok: true, value: { mode: "fixed", depart: d.depart, return: d.return } };
    return {
      ok: true,
      value: { mode: "flexible", depart: d.depart, return: d.return, flexDays: int(d.flexDays, 1, LIMITS.maxFlexDays, 3) },
    };
  }
  if (d.mode === "window") {
    if (!isValidDate(d.from) || !isValidDate(d.to)) return { ok: false, error: "Choose your date window." };
    const from = d.from < tomorrow ? tomorrow : d.from;
    if (d.to < from) return { ok: false, error: "The date window has already passed." };
    if (daysBetween(from, d.to) > LIMITS.maxWindowDays)
      return { ok: false, error: `Date windows can be up to ${LIMITS.maxWindowDays} days. Try a shorter range.` };
    const minNights = int(d.minNights, 1, LIMITS.maxNights, 2);
    const maxNights = int(d.maxNights, minNights, LIMITS.maxNights, Math.max(minNights, 4));
    return { ok: true, value: { mode: "window", from, to: d.to, minNights, maxNights, weekendsOnly: d.weekendsOnly === true } };
  }
  return { ok: false, error: "Choose your travel dates." };
}

export interface DatePlan {
  pairs: { depart: string; return: string }[];
  departFrom: string;
  departTo: string;
  minNights: number;
  maxNights: number;
}

/** Every (depart, return) pair the search should consider. */
export function expandDates(q: DateQuery): DatePlan {
  const pairs: { depart: string; return: string }[] = [];
  const tomorrow = addDays(todayUK(), 1);
  if (q.mode === "fixed") {
    pairs.push({ depart: q.depart, return: q.return });
  } else if (q.mode === "flexible") {
    // Shift the dates, but keep the trip within a night of the chosen length.
    const chosen = daysBetween(q.depart, q.return);
    for (let a = -q.flexDays; a <= q.flexDays; a++) {
      for (let b = -q.flexDays; b <= q.flexDays; b++) {
        const depart = addDays(q.depart, a);
        const ret = addDays(q.return, b);
        const n = daysBetween(depart, ret);
        if (depart >= tomorrow && n >= 1 && Math.abs(n - chosen) <= 1 && n <= LIMITS.maxNights) pairs.push({ depart, return: ret });
      }
    }
  } else {
    for (let depart = q.from; depart <= q.to; depart = addDays(depart, 1)) {
      // Weekend breaks leave Thu, Fri or Sat.
      if (q.weekendsOnly && ![4, 5, 6].includes(dayOfWeek(depart))) continue;
      for (let n = q.minNights; n <= q.maxNights; n++) pairs.push({ depart, return: addDays(depart, n) });
    }
  }
  const limited = pairs;
  const departs = limited.map((p) => p.depart).sort();
  const nights = limited.map((p) => daysBetween(p.depart, p.return));
  return {
    pairs: limited,
    departFrom: departs[0],
    departTo: departs[departs.length - 1],
    minNights: Math.min(...nights),
    maxNights: Math.max(...nights),
  };
}

export function destinationList(req: SearchRequest) {
  if (req.destination.mode === "cities") return req.destination.cities.map((c) => getDestination(c)!).filter(Boolean);
  // "Anywhere": popular places within a sensible flying distance for the trip length.
  const d = req.dates;
  const nights = d.mode === "window" ? d.maxNights : daysBetween(d.depart, d.return);
  const maxKm = nights <= 4 ? 3500 : nights <= 8 ? 7000 : 12000;
  return popularDestinations(getAirport(req.groups[0].homeAirport)!, maxKm);
}
