// Live hotel and apartment prices from Google Hotels, through SerpApi (same
// key as flights). One lookup per destination and dates, so only the
// shortlisted trips get real prices; the rest use typical prices scaled to
// match.
//
// Docs: https://serpapi.com/google-hotels-api

import { estimatedMinutes } from "../area";
import { haversineKm } from "../data/airports";
import type { StayOption } from "../types";
import { TtlCache } from "../util";
import type { StayProvider, StayQuery } from "./types";

const API = "https://serpapi.com/search.json";
const CACHE_TTL_MS = 30 * 60_000;

export interface GhProperty {
  type?: string;
  name?: string;
  link?: string;
  property_token?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rate_per_night?: { extracted_lowest?: number };
  total_rate?: { extracted_lowest?: number };
  overall_rating?: number;
  free_cancellation?: boolean;
}

interface GhResponse {
  properties?: GhProperty[];
  search_metadata?: { google_hotels_url?: string };
  error?: string;
}

const cache = new TtlCache<GhResponse>(CACHE_TTL_MS);

/** Google's rating filter: 7 = 3.5+, 8 = 4.0+, 9 = 4.5+ (out of 5). */
function ratingFilter(minRating10: number): string | null {
  if (minRating10 >= 9) return "9";
  if (minRating10 >= 8) return "8";
  if (minRating10 >= 7) return "7";
  return null;
}

export function toStay(p: GhProperty, nights: number, centre: { lat: number; lon: number }, fallbackUrl: string): StayOption | null {
  const lat = p.gps_coordinates?.latitude;
  const lon = p.gps_coordinates?.longitude;
  const total = p.total_rate?.extracted_lowest ?? (p.rate_per_night?.extracted_lowest ? p.rate_per_night.extracted_lowest * nights : undefined);
  if (!p.name || !total || lat === undefined || lon === undefined) return null;
  const km = Math.round(haversineKm(centre, { lat, lon }) * 10) / 10;
  return {
    id: `gh-${p.property_token ?? p.name}`,
    source: "google",
    name: p.name,
    type: /rental|apartment/i.test(p.type ?? "") ? "apartment" : "hotel",
    // Google rates out of 5; we use 10.
    rating: p.overall_rating ? Math.round(p.overall_rating * 20) / 10 : null,
    centreKm: km,
    centreMins: estimatedMinutes(km),
    lat,
    lon,
    total: Math.round(total),
    freeCancellation: p.free_cancellation ?? null,
    bookingUrl: p.link ?? fallbackUrl,
  };
}

export function googleHotels(key: string): StayProvider {
  return {
    id: "google-hotels",
    label: "Google Hotels (live)",
    sample: false,
    live: true,
    async search(q: StayQuery): Promise<StayOption[]> {
      const { destination: dest, checkin, checkout, adults, children, prefs } = q;
      const params: Record<string, string> = {
        engine: "google_hotels",
        q: `${dest.name}, ${dest.country}`,
        check_in_date: checkin,
        check_out_date: checkout,
        adults: String(adults),
        children: String(children),
        currency: "GBP",
        gl: "uk",
        hl: "en",
      };
      if (children > 0) params.children_ages = Array.from({ length: children }, () => "8").join(",");
      const rating = ratingFilter(prefs.minRating);
      if (rating) params.rating = rating;
      if (prefs.type === "apartment") params.vacation_rentals = "true";
      const body = await cache.get(JSON.stringify(params), async () => {
        const url = new URL(API);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        url.searchParams.set("api_key", key);
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as GhResponse;
        if (json.error && /hasn't returned any results|no results/i.test(json.error)) return {};
        if (!res.ok || json.error) throw new Error(`SerpApi hotels ${res.status}: ${json.error ?? "request failed"}`);
        return json;
      });
      const props = body.properties ?? [];
      const nights = Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000));
      // Generated destinations only know the airport's position: use the middle of the hotels.
      const centre =
        dest.centreKnown === false && props.length > 0
          ? (() => {
              const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
              const pts = props.filter((p) => p.gps_coordinates?.latitude !== undefined);
              return pts.length ? { lat: mid(pts.map((p) => p.gps_coordinates!.latitude!)), lon: mid(pts.map((p) => p.gps_coordinates!.longitude!)) } : dest;
            })()
          : dest;
      const fallback = body.search_metadata?.google_hotels_url ?? "https://www.google.com/travel/hotels";
      return props
        .map((p) => toStay(p, nights, centre, fallback))
        .filter((s): s is StayOption => s !== null)
        .filter((s) => (s.rating ?? 0) >= prefs.minRating && (s.centreKm ?? 0) <= prefs.maxCentreKm)
        .filter((s) => prefs.type === "any" || s.type === prefs.type);
    },
  };
}
