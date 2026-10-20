// Live flight prices from Google Flights, through SerpApi.
// Every lookup is a live Google Flights search, so they're rationed: one
// lookup per date covers all the chosen airports (Google accepts several
// airport codes separated by commas). Prices are per person (searched for one
// adult) in GBP.
//
// Docs: https://serpapi.com/google-flights-api

import type { Airport } from "../data/airports";
import { destinationAirports, getAirport } from "../data/places";
import { localToUtc } from "../dates";
import type { Market } from "../markets";
import { getRates } from "../rates";
import type { FlightOption, LiveLeg, OneWayFlight } from "../types";
import { TtlCache, mapLimit } from "../util";
import type { FlightProvider, LiveOneWayQuery, MarketQuote } from "./types";

const API = "https://serpapi.com/search.json";
/** Same search within this time reuses the result rather than spending another lookup. */
const CACHE_TTL_MS = 20 * 60_000;
/** Airport codes per side of one lookup. */
export const AIRPORTS_PER_LOOKUP = 7;

export interface SerpSegment {
  departure_airport?: { id?: string; name?: string; time?: string };
  arrival_airport?: { id?: string; name?: string; time?: string };
  duration?: number;
  airline?: string;
  flight_number?: string;
}

export interface SerpItinerary {
  flights?: SerpSegment[];
  layovers?: { duration?: number; id?: string }[];
  total_duration?: number;
  price?: number;
  type?: string;
  booking_token?: string;
}

export interface SerpResponse {
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
  search_metadata?: { google_flights_url?: string; status?: string };
  price_insights?: { lowest_price?: number; typical_price_range?: number[]; price_level?: string };
  error?: string;
}

const cache = new TtlCache<SerpResponse>(CACHE_TTL_MS);

export async function lookup(key: string, params: Record<string, string>): Promise<SerpResponse> {
  const cacheKey = JSON.stringify(params);
  return cache.get(cacheKey, async () => {
    const url = new URL(API);
    url.searchParams.set("engine", "google_flights");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("api_key", key);
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as SerpResponse;
    // "No results" comes back as an error message; it's just an empty answer.
    if (body.error && /hasn't returned any results|no results/i.test(body.error)) return {};
    if (!res.ok || body.error) throw new Error(`SerpApi ${res.status}: ${body.error ?? "request failed"}`);
    return body;
  });
}

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** "2026-12-01 06:05" (local time at the airport) to ISO UTC. */
function toUtc(local: string | undefined, airport: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(local ?? "");
  const tz = airport ? getAirport(airport)?.tz : undefined;
  if (!m || !tz) return null;
  return localToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

export function toOneWay(it: SerpItinerary, homeCodes: Set<string>, destOf: Map<string, string>, direction: "out" | "back", searchUrl: string): OneWayFlight | null {
  const segs = it.flights ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last || !it.price) return null;
  const fromId = first.departure_airport?.id;
  const toId = last.arrival_airport?.id;
  if (!fromId || !toId) return null;
  // Out: from one of their airports to a destination. Back: the reverse.
  const [home, away] = direction === "out" ? [fromId, toId] : [toId, fromId];
  const dest = destOf.get(away);
  if (!homeCodes.has(home) || !dest) return null;
  const depart = toUtc(first.departure_airport?.time, fromId);
  const arrive = toUtc(last.arrival_airport?.time, toId);
  if (!depart || !arrive) return null;
  const airline = first.flight_number?.split(" ")[0] || first.airline || "";
  const date = first.departure_airport!.time!.slice(0, 10);
  return {
    id: `gf-${fromId}-${toId}-${segs.map((s) => s.flight_number ?? "").join("+")}-${depart}`,
    source: "serpapi",
    from: direction === "out" ? home : dest,
    to: direction === "out" ? dest : home,
    airline,
    date,
    depart,
    arrive,
    stops: segs.length - 1,
    layoverMins: Math.max(0, ...(it.layovers ?? []).map((l) => l.duration ?? 0)),
    price: Math.round(it.price),
    bookingUrl: searchUrl,
    seenHoursAgo: 0,
    seller: null,
    liveLeg: { from: fromId, to: toId, date, flightNumbers: flightNumbers(it) },
  };
}

const flightNumbers = (it: SerpItinerary) => (it.flights ?? []).map((s) => s.flight_number ?? "").filter(Boolean);

/** Google's country setting for a booking country ("uk" rather than "gb"). */
const googleCountry = (m: Market) => (m.code === "gb" ? "uk" : m.code);

/**
 * The same two tickets priced with Google Flights set to other countries, in
 * their currency. Only exact matches (same flight numbers) count. Two lookups
 * per country.
 */
async function sameFlightsElsewhere(key: string, flight: FlightOption, markets: Market[]): Promise<MarketQuote[]> {
  const legs = flight.liveLegs;
  if (!legs || legs.length !== 2 || legs.some((l) => l.flightNumbers.length === 0)) return [];
  const { rates } = await getRates();
  const priceLeg = async (l: LiveLeg, m: Market) => {
    const body = await lookup(key, {
      departure_id: l.from,
      arrival_id: l.to,
      outbound_date: l.date,
      type: "2",
      adults: "1",
      currency: m.currency,
      hl: "en",
      gl: googleCountry(m),
      deep_search: "true",
    });
    const wanted = l.flightNumbers.join("+");
    const same = [...(body.best_flights ?? []), ...(body.other_flights ?? [])].find((it) => flightNumbers(it).join("+") === wanted);
    return same?.price ? { price: same.price, url: body.search_metadata?.google_flights_url ?? "https://www.google.com/travel/flights" } : null;
  };
  // The price we show was found with the UK setting.
  const others = markets.filter((m) => m.code !== "gb" && rates[m.currency]);
  const quotes = await mapLimit(others, 4, async (m): Promise<MarketQuote | null> => {
    try {
      const [out, back] = await Promise.all(legs.map((l) => priceLeg(l, m)));
      if (!out || !back) return null;
      const local = out.price + back.price;
      return {
        market: m.code,
        localAmount: Math.round(local),
        pricePerPerson: Math.round(local / rates[m.currency]),
        bookingUrl: out.url,
        returnBookingUrl: back.url,
        seenHoursAgo: 0,
      };
    } catch (err) {
      console.error("live market check failed", m.code, err);
      return null;
    }
  });
  return quotes.filter((q): q is MarketQuote => q !== null);
}

/** How many lookups a live one-way search will spend. */
export function lookupsFor(q: Pick<LiveOneWayQuery, "airports" | "destinations" | "dates">): number {
  const destCodes = new Set(q.destinations.flatMap((d) => destinationAirports(d.code)));
  return q.dates.length * Math.ceil(destCodes.size / AIRPORTS_PER_LOOKUP) * Math.ceil(q.airports.length / AIRPORTS_PER_LOOKUP);
}

export function serpapiFlights(key: string): FlightProvider {
  return {
    id: "serpapi",
    label: "Google Flights (live)",
    sample: false,
    live: true,
    // Return-ticket search across date ranges would cost a lookup per date
    // pair, so live searches are built from one-way tickets instead.
    async search() {
      return [];
    },
    async searchOneWay() {
      return [];
    },
    checkMarkets(flight, _origin, _dest, markets) {
      return sameFlightsElsewhere(key, flight, markets);
    },
    async searchOneWayDates(q: LiveOneWayQuery): Promise<OneWayFlight[]> {
      const destOf = new Map<string, string>();
      for (const d of q.destinations) for (const a of destinationAirports(d.code)) destOf.set(a, d.code);
      const homeCodes = new Set(q.airports.map((a: Airport) => a.code));
      const jobs = q.dates.flatMap((date) =>
        chunk([...homeCodes], AIRPORTS_PER_LOOKUP).flatMap((home) => chunk([...destOf.keys()], AIRPORTS_PER_LOOKUP).map((away) => ({ date, home, away }))),
      );
      const results = await mapLimit(jobs, 8, async ({ date, home, away }) => {
        const [from, to] = q.direction === "out" ? [home, away] : [away, home];
        const body = await lookup(key, {
          departure_id: from.join(","),
          arrival_id: to.join(","),
          outbound_date: date,
          type: "2",
          adults: "1",
          currency: "GBP",
          hl: "en",
          gl: "uk",
          // Slower, but the same results as Google Flights in a browser.
          deep_search: "true",
        });
        const url = body.search_metadata?.google_flights_url ?? "https://www.google.com/travel/flights";
        const range = body.price_insights?.typical_price_range;
        const typical: [number, number] | undefined = range?.length === 2 && range[0] > 0 ? [range[0], range[1]] : undefined;
        return [...(body.best_flights ?? []), ...(body.other_flights ?? [])]
          .map((it) => toOneWay(it, homeCodes, destOf, q.direction, url))
          .filter((f): f is OneWayFlight => f !== null && f.date === date)
          .map((f) => (typical ? { ...f, typical } : f));
      });
      return results.flat();
    },
  };
}
