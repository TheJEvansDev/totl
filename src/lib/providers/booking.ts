// Booking.com stays, read through Firecrawl's Booking.com tool
// (FIRECRAWL_API_KEY, 5 credits a search). Added to Google Hotels' results
// so each trip gets the cheapest suitable stay from either. Booking.com also
// lists charges paid at the property (city tax, VAT), which go into the
// total, so prices aren't flattered.

import { estimatedMinutes } from "../area";
import { haversineKm } from "../data/airports";
import type { StayOption } from "../types";
import { TtlCache } from "../util";
import { HOSTEL } from "./googlehotels";
import type { StayProvider, StayQuery } from "./types";
import { roomsNeeded } from "./types";

export interface BookingResult {
  hotel_id?: number;
  name?: string;
  accommodation_type_id?: number;
  latitude?: number;
  longitude?: number;
  price?: { amount?: number; currency?: string };
  excluded_charges?: { amount?: number; currency?: string };
  review_score?: number | null;
  free_cancellation?: boolean;
  is_sold_out?: boolean;
  url?: string;
}

/** Booking.com property types: 203 hostel; 201 apartment, 220 holiday home, 213 villa. */
const HOSTEL_TYPE = 203;
const APARTMENT_TYPES = new Set([201, 213, 220]);

const cache = new TtlCache<BookingResult[]>(30 * 60_000);

export function bookingToStay(r: BookingResult, centre: { lat: number; lon: number }, q: StayQuery): StayOption | null {
  if (!r.name || !r.hotel_id || r.is_sold_out || r.price?.currency !== "GBP" || !r.price.amount) return null;
  if (r.accommodation_type_id === HOSTEL_TYPE || HOSTEL.test(r.name)) return null;
  if (r.latitude === undefined || r.longitude === undefined) return null;
  const extra = r.excluded_charges?.currency === "GBP" ? (r.excluded_charges.amount ?? 0) : 0;
  const km = Math.round(haversineKm(centre, { lat: r.latitude, lon: r.longitude }) * 10) / 10;
  const link = new URL(r.url ?? "https://www.booking.com");
  link.searchParams.set("checkin", q.checkin);
  link.searchParams.set("checkout", q.checkout);
  link.searchParams.set("group_adults", String(q.adults));
  link.searchParams.set("group_children", String(q.children));
  link.searchParams.set("no_rooms", String(roomsNeeded(q.adults)));
  link.searchParams.set("selected_currency", "GBP");
  return {
    id: `bk-${r.hotel_id}`,
    source: "booking",
    name: r.name,
    type: APARTMENT_TYPES.has(r.accommodation_type_id ?? 0) ? "apartment" : "hotel",
    rating: r.review_score ?? null,
    centreKm: km,
    centreMins: estimatedMinutes(km),
    lat: r.latitude,
    lon: r.longitude,
    // Includes city tax and other charges Booking.com says are paid at the property.
    total: Math.round(r.price.amount + extra),
    freeCancellation: r.free_cancellation ?? null,
    bookingUrl: link.toString(),
  };
}

async function bookingSearch(key: string, q: StayQuery): Promise<BookingResult[]> {
  const filters = [`review_score=${Math.max(60, Math.min(90, Math.floor(q.prefs.minRating) * 10))}`, `distance=${Math.round(q.prefs.maxCentreKm * 1000)}`];
  if (q.prefs.type === "apartment") filters.push("ht_id=201");
  const options = {
    query: q.destination.name,
    checkin: q.checkin,
    checkout: q.checkout,
    adults: q.adults,
    rooms: roomsNeeded(q.adults),
    ...(q.children > 0 ? { children_ages: Array.from({ length: q.children }, () => 8) } : {}),
    currency: "GBP",
    lang: "en-gb",
    sort: "price",
    rows: 40,
    filters: filters.join(";"),
  };
  return cache.get(JSON.stringify(options), async () => {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ alexandria: { provider: "booking-com", capability: "hotels/search", options }, timeout: 45_000 }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      data?: { alexandria?: { data?: { results?: BookingResult[] }; error?: unknown }[] };
    };
    const result = body.data?.alexandria?.[0];
    if (!res.ok || body.success === false || result?.error || !result?.data) throw new Error(`Booking.com via Firecrawl ${res.status}: ${body.error ?? "no data"}`);
    return result.data.results ?? [];
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Google Hotels (or whatever the main stay source is) plus Booking.com for the
 * first few searches of each request, merged: the same property is kept once,
 * at its lower price.
 */
export function withBooking(primary: StayProvider, key: string, maxSearches: number): StayProvider {
  let used = 0;
  return {
    ...primary,
    label: `${primary.label} + Booking.com`,
    async search(q) {
      const useBooking = used++ < maxSearches;
      const [main, extra] = await Promise.all([
        primary.search(q),
        useBooking ? bookingSearch(key, q).catch((err) => (console.error("Booking.com search failed", err), [] as BookingResult[])) : Promise.resolve([] as BookingResult[]),
      ]);
      // Places we only know by airport: measure from the middle of the properties found.
      const pts = extra.filter((r) => r.latitude !== undefined && r.longitude !== undefined);
      const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const centre =
        q.destination.centreKnown === false && pts.length > 0
          ? { lat: mid(pts.map((r) => r.latitude!)), lon: mid(pts.map((r) => r.longitude!)) }
          : q.destination;
      const extraStays = extra
        .map((r) => bookingToStay(r, centre, q))
        .filter((s): s is StayOption => s !== null)
        .filter((s) => (s.rating ?? 0) >= q.prefs.minRating && (s.centreKm ?? 0) <= q.prefs.maxCentreKm)
        .filter((s) => q.prefs.type === "any" || s.type === q.prefs.type);
      const best = new Map<string, StayOption>();
      for (const s of [...main, ...extraStays]) {
        const k = norm(s.name);
        const cur = best.get(k);
        if (!cur || s.total < cur.total) best.set(k, s);
      }
      return [...best.values()];
    },
  };
}
