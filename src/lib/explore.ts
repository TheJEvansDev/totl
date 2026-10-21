// "Explore the globe": the cheapest flights from one airport to places all
// over the world, with the dates they're cheapest. One Google Travel Explore
// lookup (SerpApi) covers every place. These are Google's latest prices for
// browsing; tapping a place runs a live total-cost search for those dates.
//
// Docs: https://serpapi.com/google-travel-explore-api

import { getAirport, getDestination, popularDestinations } from "./data/places";
import { addDays, todayUK } from "./dates";
import { TtlCache } from "./util";

export interface ExplorePlace {
  /** Airport code to search (resolves to the city in the engine). */
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  thumbnail: string | null;
  depart: string;
  return: string;
  /** Return flights per person, GBP, as Google last saw them. */
  flightPrice: number;
  airline: string | null;
  stops: number | null;
  flightMins: number | null;
}

export type TripLength = "weekend" | "week";

export interface ExploreQuery {
  from: string;
  length: TripLength;
  /** 1-12, or 0 for any time in the next 6 months. */
  month: number;
}

interface GteDestination {
  name?: string;
  country?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  thumbnail?: string;
  destination_airport?: { code?: string };
  start_date?: string;
  end_date?: string;
  flight_price?: number;
  flight_duration?: number;
  number_of_stops?: number;
  airline?: string;
}

const cache = new TtlCache<ExplorePlace[]>(60 * 60_000);

export function toPlace(d: GteDestination): ExplorePlace | null {
  const lat = d.gps_coordinates?.latitude;
  const lon = d.gps_coordinates?.longitude;
  const code = d.destination_airport?.code;
  if (!d.name || !code || lat === undefined || lon === undefined || !d.flight_price || !d.start_date || !d.end_date) return null;
  return {
    code,
    name: d.name,
    country: d.country ?? "",
    lat,
    lon,
    thumbnail: d.thumbnail ?? null,
    depart: d.start_date,
    return: d.end_date,
    flightPrice: Math.round(d.flight_price),
    airline: d.airline ?? null,
    stops: d.number_of_stops ?? null,
    flightMins: d.flight_duration ?? null,
  };
}

export function explore(key: string, q: ExploreQuery): Promise<ExplorePlace[]> {
  const params: Record<string, string> = {
    engine: "google_travel_explore",
    departure_id: q.from,
    currency: "GBP",
    gl: "uk",
    hl: "en",
    travel_duration: q.length === "weekend" ? "1" : "2",
    month: String(q.month),
  };
  return cache.get(JSON.stringify(params), async () => {
    const url = new URL("https://serpapi.com/search.json");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("api_key", key);
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { destinations?: GteDestination[]; error?: string };
    if (body.error && /hasn't returned any results|no results/i.test(body.error)) return [];
    if (!res.ok || body.error) throw new Error(`SerpApi explore ${res.status}: ${body.error ?? "request failed"}`);
    return (body.destinations ?? []).map(toPlace).filter((p): p is ExplorePlace => p !== null);
  });
}

/** Made-up places and prices for trying the globe without a key. Labelled as sample. */
export function sampleExplore(q: ExploreQuery): ExplorePlace[] {
  const home = getAirport(q.from);
  if (!home) return [];
  const nights = q.length === "weekend" ? 2 : 7;
  return popularDestinations(home, 9000, 40).map((d, i) => {
    const seed = [...d.code].reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
    const depart = addDays(todayUK(), 14 + (seed % 60));
    const dest = getDestination(d.code)!;
    return {
      code: d.code,
      name: dest.name,
      country: dest.country,
      lat: dest.lat,
      lon: dest.lon,
      thumbnail: null,
      depart,
      return: addDays(depart, nights),
      flightPrice: 30 + ((seed >>> 3) % 250) + i * 3,
      airline: null,
      stops: seed % 3 === 0 ? 1 : 0,
      flightMins: null,
    };
  });
}
