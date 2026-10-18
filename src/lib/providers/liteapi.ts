// Accommodation from LiteAPI (https://docs.liteapi.travel).
// Two calls: static hotel list near the centre (cached for a week), then
// live rates for the best-rated candidates on the exact dates.

import type { Destination } from "../data/destinations";
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

const hotelCache = new TtlCache<LiteHotel[]>(7 * 86_400_000);
const rateCache = new TtlCache<Map<string, { total: number; refundable: boolean | null }>>(3 * 3_600_000);

/** Rough public transport minutes from the centre for a straight-line distance. */
export function centreMinutes(km: number): number {
  return Math.round(4 + km * 4.5);
}

function looksLikeApartment(name: string): boolean {
  return /apart|flat|suites?\b|residence|loft|studio/i.test(name);
}

async function cityHotels(key: string, dest: Destination): Promise<LiteHotel[]> {
  return hotelCache.get(dest.code, async () => {
    const url = new URL(`${API}/data/hotels`);
    url.searchParams.set("countryCode", dest.countryCode);
    url.searchParams.set("latitude", String(dest.lat));
    url.searchParams.set("longitude", String(dest.lon));
    url.searchParams.set("radius", "8000");
    url.searchParams.set("limit", "300");
    const res = await fetch(url, { headers: { "X-API-Key": key, accept: "application/json" }, next: { revalidate: 86_400 } });
    if (!res.ok) throw new Error(`LiteAPI hotels ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    return (body.data ?? [])
      .map((h) => ({
        id: String(h.id ?? ""),
        name: String(h.name ?? "Hotel"),
        rating: typeof h.rating === "number" && h.rating > 0 ? h.rating : null,
        lat: Number(h.latitude),
        lon: Number(h.longitude),
      }))
      .filter((h) => h.id && Number.isFinite(h.lat) && Number.isFinite(h.lon));
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
      const centre = { lat: dest.lat, lon: dest.lon };
      const candidates = (await cityHotels(key, dest))
        .map((h) => ({ ...h, centreMins: centreMinutes(haversineKm(centre, h)), type: looksLikeApartment(h.name) ? "apartment" as const : "hotel" as const }))
        .filter((h) => (h.rating ?? 0) >= prefs.minRating && h.centreMins <= prefs.maxCentreMins)
        .filter((h) => prefs.type === "any" || h.type === prefs.type)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, MAX_RATE_HOTELS);
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
            centreMins: c.centreMins,
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
