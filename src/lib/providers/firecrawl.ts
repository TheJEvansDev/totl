// Firecrawl's ready-made travel data tools ("Alexandria"), with FIRECRAWL_API_KEY.
//
// - Skyscanner price calendar: the cheapest indicative fare for every day on a
//   route, up to a year ahead, in one call. These are cached prices, so they're
//   only used as a radar to choose which dates to check live, never shown.
// - Google Flights search: live one-way fares for one route and date. A backup
//   live source when there's no SerpApi key.
//
// Each call costs 5 Firecrawl credits.
//
// Docs: https://docs.firecrawl.dev/features/scrape (Alexandria data tools)

import type { Airport } from "../data/airports";
import { destinationAirports, getAirport } from "../data/places";
import { addDays, daysBetween, localToUtc, todayUK } from "../dates";
import type { OneWayFlight } from "../types";
import { TtlCache, mapLimit } from "../util";
import type { FlightProvider, LiveOneWayQuery } from "./types";

const API = "https://api.firecrawl.dev/v2/scrape";

async function alexandria<T>(key: string, provider: string, capability: string, options: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ alexandria: { provider, capability, options }, timeout: 45_000 }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: { alexandria?: { data?: T; error?: { code?: string; message?: string } | string }[] };
  };
  const result = body.data?.alexandria?.[0];
  const err = result?.error ?? body.error;
  if (!res.ok || body.success === false || err || !result?.data) {
    throw new Error(`Firecrawl ${res.status}: ${typeof err === "string" ? err : (err?.message ?? err?.code ?? "no data")}`);
  }
  return result.data;
}

// ---- Price calendar (the radar) ----

interface CalendarData {
  days?: { date?: string; amount?: number | null }[];
}

/** Indicative prices barely move within a few hours, and every call costs. */
const calendarCache = new TtlCache<Map<string, number>>(6 * 3_600_000);

/** Cheapest indicative one-way fare per departure date (GBP), from Skyscanner. */
export function priceCalendar(key: string, origin: string, destination: string, until: string): Promise<Map<string, number>> {
  const maxDays = Math.min(366, Math.max(1, daysBetween(todayUK(), until) + 1));
  return calendarCache.get(`${origin}>${destination}|${maxDays}`, async () => {
    const data = await alexandria<CalendarData>(key, "skyscanner-net", "flights/price_calendar", {
      origin,
      destination,
      currency: "GBP",
      market: "UK",
      locale: "en-GB",
      max_days: maxDays,
    });
    return parseCalendar(data);
  });
}

export function parseCalendar(data: CalendarData): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of data.days ?? []) if (d.date && typeof d.amount === "number" && d.amount > 0) out.set(d.date, d.amount);
  return out;
}

/** Which dates are cheap to fly on, for choosing what to check live. */
export interface DateRadar {
  /** Cheapest indicative fare per date, from any of the origins to any of the destinations (airport codes). */
  cheapestByDate(origins: string[], destinations: string[], until: string): Promise<Map<string, number>>;
}

export function firecrawlRadar(key: string): DateRadar {
  return {
    async cheapestByDate(origins, destinations, until) {
      const routes = origins.flatMap((o) => destinations.map((d) => [o, d] as const)).filter(([o, d]) => o !== d);
      const maps = await mapLimit(routes, 4, ([o, d]) => priceCalendar(key, o, d, until).catch(() => new Map<string, number>()));
      const out = new Map<string, number>();
      for (const m of maps) for (const [date, price] of m) out.set(date, Math.min(out.get(date) ?? Infinity, price));
      return out;
    },
  };
}

// ---- Live Google Flights (backup live source) ----

export interface GfSegment {
  airline?: string;
  flight_number?: string;
  origin?: string;
  destination?: string;
  departure_local?: string;
  arrival_local?: string;
}

export interface GfFlight {
  origin?: string;
  destination?: string;
  price?: { amount?: number; currency?: string };
  segments?: GfSegment[];
  stops?: number;
}

interface GfData {
  flights?: GfFlight[];
  search_url?: string;
}

const flightCache = new TtlCache<GfData>(20 * 60_000);

/** "2026-11-30T07:15:00" (local time at the airport) to ISO UTC. */
function toUtc(local: string | undefined, airport: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  const tz = airport ? getAirport(airport)?.tz : undefined;
  if (!m || !tz) return null;
  return localToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

export function gfToOneWay(f: GfFlight, direction: "out" | "back", home: string, dest: string, searchUrl: string): OneWayFlight | null {
  const segs = f.segments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  const price = f.price?.currency === "GBP" ? f.price.amount : undefined;
  if (!first || !last || !price || !first.origin || !last.destination) return null;
  const depart = toUtc(first.departure_local, first.origin);
  const arrive = toUtc(last.arrival_local, last.destination);
  if (!depart || !arrive) return null;
  const numbers = segs.map((s) => `${s.airline ?? ""} ${s.flight_number ?? ""}`.trim());
  // Layovers: the gaps between one segment landing and the next leaving.
  let layover = 0;
  for (let i = 1; i < segs.length; i++) {
    const a = toUtc(segs[i - 1].arrival_local, segs[i - 1].destination);
    const b = toUtc(segs[i].departure_local, segs[i].origin);
    if (a && b) layover = Math.max(layover, (Date.parse(b) - Date.parse(a)) / 60000);
  }
  const date = first.departure_local!.slice(0, 10);
  return {
    id: `fc-${first.origin}-${last.destination}-${numbers.join("+")}-${depart}`,
    source: "firecrawl",
    from: direction === "out" ? home : dest,
    to: direction === "out" ? dest : home,
    airline: first.airline ?? "",
    date,
    depart,
    arrive,
    stops: segs.length - 1,
    layoverMins: Math.round(layover),
    price: Math.round(price),
    bookingUrl: searchUrl,
    seenHoursAgo: 0,
    seller: null,
    liveLeg: { from: first.origin, to: last.destination, date, flightNumbers: numbers },
  };
}

export function firecrawlFlights(key: string): FlightProvider {
  return {
    id: "firecrawl",
    label: "Google Flights (live, via Firecrawl)",
    sample: false,
    live: true,
    // One route per lookup: it can't combine airports like SerpApi.
    airportsPerLookup: 1,
    async search() {
      return [];
    },
    async searchOneWay() {
      return [];
    },
    async checkMarkets() {
      return [];
    },
    async searchOneWayDates(q: LiveOneWayQuery): Promise<OneWayFlight[]> {
      const jobs = q.dates.flatMap((date) =>
        q.airports.flatMap((home: Airport) =>
          q.destinations.flatMap((d) => destinationAirports(d.code).map((away) => ({ date, home: home.code, away, dest: d.code }))),
        ),
      );
      const results = await mapLimit(jobs, 6, async ({ date, home, away, dest }) => {
        const [origin, destination] = q.direction === "out" ? [home, away] : [away, home];
        const options = { origin, destination, departure_date: date, currency: "GBP", market: "GB", limit: 15 };
        try {
          const data = await flightCache.get(JSON.stringify(options), () => alexandria<GfData>(key, "flights-google-com", "flights/search_flights", options));
          const url = data.search_url ?? "https://www.google.com/travel/flights";
          return (data.flights ?? []).map((f) => gfToOneWay(f, q.direction, home, dest, url)).filter((f): f is OneWayFlight => f !== null && f.date === date);
        } catch (err) {
          console.error("firecrawl flight search failed", origin, destination, date, err);
          return [];
        }
      });
      return results.flat();
    },
  };
}

/** The last date a trip in this plan could need a fare for. */
export const radarUntil = (departTo: string, maxNights: number) => addDays(departTo, maxNights);
