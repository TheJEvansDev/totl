// Names, countries and time zones for every code in a request or set of
// results, so the browser can show them without the whole airport list.

import type { PlaceInfo } from "../data/places";
import { placeInfo } from "../data/places";
import type { SearchRequest, Trip } from "../types";

export type Places = Record<string, PlaceInfo>;

function collect(codes: Iterable<string>): Places {
  const out: Places = {};
  for (const code of codes) {
    if (!code || out[code]) continue;
    const p = placeInfo(code);
    if (p) out[code] = p;
  }
  return out;
}

export function placesFor(req: SearchRequest): Places {
  const codes = req.groups.flatMap((g) => [g.homeAirport, g.returnTo, ...g.extraAirports]);
  if (req.destination.mode === "cities") codes.push(...req.destination.cities);
  return collect(codes);
}

export function placesForTrips(trips: Trip[], req: SearchRequest): Places {
  const codes: string[] = [];
  for (const t of trips) {
    codes.push(t.destination);
    for (const l of t.legs) codes.push(l.flight.origin, l.flight.returnAirport);
    for (const o of t.airportOptions) codes.push(o.out, o.back);
  }
  return { ...placesFor(req), ...collect(codes) };
}
