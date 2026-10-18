// Names for airport and city codes in the browser. Filled from search results,
// the place search box and look-ups, so the full airport list never loads here.

import type { PlaceInfo } from "../data/places";

export type { PlaceInfo };

const cache = new Map<string, PlaceInfo>();

export function remember(places: Record<string, PlaceInfo> | PlaceInfo[] | undefined | null): void {
  if (!places) return;
  for (const p of Array.isArray(places) ? places : Object.values(places)) if (p) cache.set(p.code, p);
}

export function place(code: string): PlaceInfo | undefined {
  return cache.get(code);
}

/** Airport name, e.g. "Bristol" or "London Gatwick". */
export function airportName(code: string): string {
  return cache.get(code)?.name ?? code;
}

/** City name for a destination, e.g. "London" or "Málaga". */
export function cityName(code: string): string {
  const p = cache.get(code);
  return p ? p.city || p.name : code;
}

export function tzOf(code: string): string {
  return cache.get(code)?.tz ?? "UTC";
}

/** Look up any codes we don't have names for yet. */
export async function ensurePlaces(codes: string[]): Promise<void> {
  const missing = [...new Set(codes.filter((c) => c && !cache.has(c)))];
  if (missing.length === 0) return;
  try {
    const res = await fetch(`/api/places?codes=${missing.join(",")}`);
    if (res.ok) remember(((await res.json()) as { results: PlaceInfo[] }).results);
  } catch {
    // Names are a nicety; codes still show.
  }
}
