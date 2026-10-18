// Flights from the Travelpayouts (Aviasales) Data API.
// These are cached prices found by Aviasales users in roughly the last 48
// hours: great for spotting cheap dates, but the final price is confirmed on
// the booking site.
//
// Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163

import type { Destination } from "../data/destinations";
import { getDestination } from "../data/destinations";
import { daysBetween, localDate } from "../dates";
import { travelpayoutsUrl } from "../links";
import type { FlightOption, OneWayFlight } from "../types";
import { TtlCache, mapLimit } from "../util";
import type { FlightProvider, FlightQuery, OneWayQuery } from "./types";

const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const CACHE_TTL_MS = 6 * 3_600_000;

interface TpTicket {
  origin?: string;
  destination?: string;
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  airline?: string;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

const cache = new TtlCache<TpTicket[]>(CACHE_TTL_MS);

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

async function fetchMonth(token: string, origin: string, destination: string | null, month: string, oneWay = false): Promise<TpTicket[]> {
  const key = `${origin}|${destination ?? "*"}|${month}|${oneWay ? "ow" : "rt"}`;
  return cache.get(key, async () => {
    const url = new URL(API);
    url.searchParams.set("origin", origin);
    if (destination) url.searchParams.set("destination", destination);
    url.searchParams.set("departure_at", month);
    url.searchParams.set("one_way", String(oneWay));
    url.searchParams.set("direct", "false");
    url.searchParams.set("unique", "false");
    url.searchParams.set("sorting", "price");
    url.searchParams.set("currency", "gbp");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("page", "1");
    const res = await fetch(url, {
      headers: { "X-Access-Token": token, "Accept-Encoding": "gzip" },
      next: { revalidate: CACHE_TTL_MS / 1000 },
    });
    if (!res.ok) throw new Error(`Travelpayouts ${res.status}`);
    const body = (await res.json()) as { success?: boolean; data?: unknown };
    if (body.success === false || !Array.isArray(body.data)) throw new Error("Travelpayouts returned no data");
    return body.data as TpTicket[];
  });
}

function toOption(t: TpTicket, q: FlightQuery, dest: Destination, marker?: string): FlightOption | null {
  if (!t.price || !t.departure_at || !t.return_at || !t.airline) return null;
  // London searches use the city code, so keep only the chosen airport.
  if (t.origin_airport && t.origin_airport !== q.origin.code) return null;
  const durTo = t.duration_to ?? dest.flightMins;
  const durBack = t.duration_back ?? dest.flightMins;
  const outStops = t.transfers ?? 0;
  const retStops = t.return_transfers ?? 0;
  // The API doesn't give layover lengths, so estimate from the extra journey time.
  const layoverOut = outStops > 0 ? Math.max(45, durTo - dest.flightMins - 30) / outStops : 0;
  const layoverBack = retStops > 0 ? Math.max(45, durBack - dest.flightMins - 30) / retStops : 0;
  const outDepart = new Date(t.departure_at).toISOString();
  const retDepart = new Date(t.return_at).toISOString();
  const departDate = localDate(outDepart, "Europe/London");
  const returnDate = localDate(retDepart, dest.tz);
  const nights = daysBetween(departDate, returnDate);
  if (departDate < q.departFrom || departDate > q.departTo || nights < q.minNights || nights > q.maxNights) return null;
  return {
    id: `tp-${q.origin.code}-${dest.code}-${t.airline}-${outDepart}-${retDepart}`,
    source: "travelpayouts",
    origin: q.origin.code,
    returnAirport: q.origin.code,
    destination: dest.code,
    destinationAirport: t.destination_airport ?? dest.code,
    airline: t.airline,
    returnAirline: t.airline,
    departDate,
    returnDate,
    outDepart,
    outArrive: new Date(Date.parse(outDepart) + durTo * 60000).toISOString(),
    outStops,
    retDepart,
    retArrive: new Date(Date.parse(retDepart) + durBack * 60000).toISOString(),
    retStops,
    maxLayoverMins: Math.round(Math.max(layoverOut, layoverBack)),
    selfTransfer: false,
    // Cached prices are per adult; children are charged the same as an estimate.
    pricePerPerson: Math.round(t.price),
    bookingUrl: t.link
      ? travelpayoutsUrl(t.link, marker)
      : travelpayoutsUrl(`/search/${q.origin.code}`, marker),
    returnBookingUrl: null,
    seenHoursAgo: null,
  };
}

export function travelpayoutsFlights(token: string, marker?: string): FlightProvider {
  return {
    id: "travelpayouts",
    label: "Travelpayouts (cached prices from the last ~48 hours)",
    sample: false,
    async searchOneWay(q: OneWayQuery): Promise<OneWayFlight[]> {
      const uk = q.airport.cityCode ?? q.airport.code;
      const months = monthsBetween(q.dateFrom, q.dateTo);
      const jobs = q.destinations.flatMap((d) => months.map((month) => ({ d, month })));
      const batches = await mapLimit(jobs, 4, async ({ d, month }) => {
        const [origin, destination] = q.direction === "out" ? [uk, d.code] : [d.code, uk];
        const tickets = await fetchMonth(token, origin, destination, month, true);
        return tickets.map((t) => toOneWay(t, q, d, marker)).filter((o): o is OneWayFlight => o !== null);
      });
      return batches.flat();
    },
    async search(q: FlightQuery): Promise<FlightOption[]> {
      const origin = q.origin.cityCode ?? q.origin.code;
      // Returns can fall in the month after the last departure.
      const months = monthsBetween(q.departFrom, q.departTo);
      // For many destinations, one "anywhere" call per month is far cheaper.
      const broad = q.destinations.length > 3;
      const targets: (string | null)[] = broad ? [null] : q.destinations.map((d) => d.code);
      const wanted = new Set(q.destinations.map((d) => d.code));
      const jobs = targets.flatMap((dest) => months.map((month) => ({ dest, month })));
      const batches = await mapLimit(jobs, 4, (j) => fetchMonth(token, origin, j.dest, j.month));
      const out: FlightOption[] = [];
      const seen = new Set<string>();
      for (const t of batches.flat()) {
        const code = t.destination ?? "";
        if (!wanted.has(code)) continue;
        const dest = getDestination(code);
        if (!dest) continue;
        const opt = toOption(t, q, dest, marker);
        if (opt && !seen.has(opt.id)) {
          seen.add(opt.id);
          out.push(opt);
        }
      }
      return out;
    },
  };
}

function toOneWay(t: TpTicket, q: OneWayQuery, dest: Destination, marker?: string): OneWayFlight | null {
  if (!t.price || !t.departure_at || !t.airline) return null;
  const ukAirport = q.direction === "out" ? t.origin_airport : t.destination_airport;
  if (ukAirport && ukAirport !== q.airport.code) return null;
  const tz = q.direction === "out" ? "Europe/London" : dest.tz;
  const depart = new Date(t.departure_at).toISOString();
  const date = localDate(depart, tz);
  if (date < q.dateFrom || date > q.dateTo) return null;
  const dur = t.duration_to ?? t.duration ?? dest.flightMins;
  const stops = t.transfers ?? 0;
  const [from, to] = q.direction === "out" ? [q.airport.code, dest.code] : [dest.code, q.airport.code];
  return {
    id: `tp-ow-${from}-${to}-${t.airline}-${depart}`,
    source: "travelpayouts",
    from,
    to,
    airline: t.airline,
    date,
    depart,
    arrive: new Date(Date.parse(depart) + dur * 60000).toISOString(),
    stops,
    layoverMins: stops > 0 ? Math.max(45, dur - dest.flightMins - 30) / stops : 0,
    price: Math.round(t.price),
    bookingUrl: travelpayoutsUrl(t.link ?? `/search/${from}`, marker),
    seenHoursAgo: null,
  };
}

// Exported for tests.
export const _internal = { monthsBetween, toOption, toOneWay };
