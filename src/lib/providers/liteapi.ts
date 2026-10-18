// Accommodation from LiteAPI (https://docs.liteapi.travel).
// Two calls: static hotel list near the centre (cached for a week), then
// live rates for the best-rated candidates on the exact dates.

import type { Destination } from "../data/destinations";
import { estimatedMinutes } from "../area";
import { haversineKm } from "../data/airports";
import { hotelSearchUrl } from "../links";
import type { StayOption } from "../types";
import { TtlCache } from "../util";
import type { StayProvider, StayQuery } from "./types";
import { roomsNeeded } from "./types";

const API = "https://api.liteapi.travel/v3.0";
const MAX_RATE_HOTELS = 40;

interface LiteHotel {
  id: string;
  name: string;
  rating: number | null;
  lat: number;
  lon: number;
}

const hotelCache = new TtlCache<{ hotels: LiteHotel[]; centre: { lat: number; lon: number } }>(7 * 86_400_000);
const rateCache = new TtlCache<Map<string, { total: number; refundable: boolean | null }>>(3 * 3_600_000);


function looksLikeApartment(name: string): boolean {
  return /apart|flat|suites?\b|residence|loft|studio/i.test(name);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Hotels in a city and where its centre is. Hand-entered destinations have a
 * known centre; for others we only know the airport, so we search by city name
 * and take the middle of where hotels cluster as the centre.
 */
async function cityHotels(key: string, dest: Destination) {
  return hotelCache.get(dest.code, async () => {
    const url = new URL(`${API}/data/hotels`);
    url.searchParams.set("countryCode", dest.countryCode);
    if (dest.centreKnown === false) {
      url.searchParams.set("cityName", dest.name);
    } else {
      url.searchParams.set("latitude", String(dest.lat));
      url.searchParams.set("longitude", String(dest.lon));
      url.searchParams.set("radius", "9000");
    }
    url.searchParams.set("limit", "400");
    const res = await fetch(url, { headers: { "X-API-Key": key, accept: "application/json" }, next: { revalidate: 86_400 } });
    if (!res.ok) throw new Error(`LiteAPI hotels ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const hotels = (body.data ?? [])
      .map((h) => ({
        id: String(h.id ?? ""),
        name: String(h.name ?? "Hotel"),
        rating: typeof h.rating === "number" && h.rating > 0 ? h.rating : null,
        lat: Number(h.latitude),
        lon: Number(h.longitude),
      }))
      .filter((h) => h.id && Number.isFinite(h.lat) && Number.isFinite(h.lon));
    const centre =
      dest.centreKnown === false && hotels.length >= 10
        ? { lat: median(hotels.map((h) => h.lat)), lon: median(hotels.map((h) => h.lon)) }
        : { lat: dest.lat, lon: dest.lon };
    return { hotels, centre };
  });
}

function occupancies(adults: number, children: number) {
  const rooms = roomsNeeded(adults);
  return Array.from({ length: rooms }, (_, i) => ({
    adults: Math.min(2, adults - i * 2),
    // Child ages aren't collected yet; 8 is a neutral default.
    children: i === 0 ? Array.from({ length: children }, () => 8) : [],
  }));
}

/** Lowest total price per hotel from the rates response. */
function parseRates(body: unknown): Map<string, { total: number; refundable: boolean | null }> {
  const out = new Map<string, { total: number; refundable: boolean | null }>();
  const data = (body as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return out;
  for (const h of data as Record<string, unknown>[]) {
    const hotelId = String(h.hotelId ?? "");
    const roomTypes = Array.isArray(h.roomTypes) ? (h.roomTypes as Record<string, unknown>[]) : [];
    for (const rt of roomTypes) {
      const offer = rt.offerRetailRate as { amount?: number } | undefined;
      const rates = Array.isArray(rt.rates) ? (rt.rates as Record<string, unknown>[]) : [];
      const fallback = (rates[0]?.retailRate as { total?: { amount?: number }[] } | undefined)?.total?.[0]?.amount;
      const amount = offer?.amount ?? fallback;
      if (typeof amount !== "number" || amount <= 0) continue;
      const tag = (rates[0]?.cancellationPolicies as { refundableTag?: string } | undefined)?.refundableTag;
      const refundable = tag ? tag === "RFN" : null;
      const prev = out.get(hotelId);
      if (!prev || amount < prev.total) out.set(hotelId, { total: amount, refundable });
    }
  }
  return out;
}

export function liteapiStays(key: string): StayProvider {
  return {
    id: "liteapi",
    label: "LiteAPI hotel rates",
    sample: false,
    async search(q: StayQuery): Promise<StayOption[]> {
      const { destination: dest, checkin, checkout, adults, children, prefs } = q;
      const { hotels, centre } = await cityHotels(key, dest);
      const candidates = hotels
        .map((h) => {
          const km = Math.round(haversineKm(centre, h) * 10) / 10;
          return { ...h, centreKm: km, centreMins: estimatedMinutes(km), type: looksLikeApartment(h.name) ? ("apartment" as const) : ("hotel" as const) };
        })
        .filter((h) => (h.rating ?? 0) >= prefs.minRating && h.centreKm <= prefs.maxCentreKm)
        .filter((h) => prefs.type === "any" || h.type === prefs.type)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      // Price a mix: mostly close in, some further out for the comparison.
      const close = candidates.filter((c) => c.centreKm <= 4).slice(0, MAX_RATE_HOTELS - 12);
      const further = candidates.filter((c) => c.centreKm > 4).slice(0, MAX_RATE_HOTELS - close.length);
      candidates.splice(0, candidates.length, ...close, ...further);
      if (candidates.length === 0) return [];

      const rateKey = `${dest.code}|${checkin}|${checkout}|${adults}|${children}|${candidates.map((c) => c.id).join(",")}`;
      const rates = await rateCache.get(rateKey, async () => {
        const res = await fetch(`${API}/hotels/rates`, {
          method: "POST",
          headers: { "X-API-Key": key, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            hotelIds: candidates.map((c) => c.id),
            checkin,
            checkout,
            currency: "GBP",
            guestNationality: "GB",
            occupancies: occupancies(adults, children),
            timeout: 8,
          }),
        });
        if (!res.ok) throw new Error(`LiteAPI rates ${res.status}`);
        return parseRates(await res.json());
      });

      return candidates.flatMap((c): StayOption[] => {
        const rate = rates.get(c.id);
        if (!rate) return [];
        return [
          {
            id: `lite-${c.id}-${checkin}-${checkout}`,
            source: "liteapi",
            name: c.name,
            type: c.type,
            rating: c.rating,
            centreKm: c.centreKm,
            centreMins: c.centreMins,
            lat: c.lat,
            lon: c.lon,
            total: Math.round(rate.total),
            freeCancellation: rate.refundable,
            bookingUrl: hotelSearchUrl(`${c.name}, ${dest.name}`, checkin, checkout, adults, children, roomsNeeded(adults)),
          },
        ];
      });
    },
  };
}

// Exported for tests.
export const _internal = { parseRates, occupancies };
