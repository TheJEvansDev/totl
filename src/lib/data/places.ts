// Worldwide airports and destinations. Server-side only: the browser gets
// names through the search API and search results, not this whole list.
//
// Hand-entered UK airports (airports.ts) and destinations (destinations.ts)
// have better cost estimates, so they take priority over the generated ones.

import world from "./world-airports.json";
import type { Airport } from "./airports";
import { UK_AIRPORTS, haversineKm, travelHours } from "./airports";
import type { Destination } from "./destinations";
import { DESTINATIONS, dayTicketOverride } from "./destinations";

type Row = [string, string, string, string, number, number, string, number, string];

export interface WorldAirport {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  lat: number;
  lon: number;
  tz: string;
  size: 2 | 3;
  continent: string;
}

const COUNTRIES = world.countries as Record<string, string>;

function cleanCity(municipality: string, name: string): string {
  return (municipality || name).split(/[,(]/)[0].trim();
}

function cleanName(name: string): string {
  return name.replace(/\s+(International\s+)?Airport$/i, "").replace(/\s+Airport\b/i, "").trim();
}

const WORLD: WorldAirport[] = (world.airports as Row[]).map((r) => ({
  code: r[0],
  name: cleanName(r[1]),
  city: cleanCity(r[2], r[1]),
  countryCode: r[3],
  lat: r[4],
  lon: r[5],
  tz: r[6],
  size: r[7] === 3 ? 3 : 2,
  continent: r[8],
}));
const WORLD_BY_CODE = new Map(WORLD.map((a) => [a.code, a]));

/** Cities with several airports, using their IATA city codes. */
export const METROS: Record<string, { name: string; airports: string[] }> = {
  LON: { name: "London", airports: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"] },
  PAR: { name: "Paris", airports: ["CDG", "ORY", "BVA"] },
  NYC: { name: "New York", airports: ["JFK", "EWR", "LGA"] },
  MIL: { name: "Milan", airports: ["MXP", "LIN", "BGY"] },
  ROM: { name: "Rome", airports: ["FCO", "CIA"] },
  STO: { name: "Stockholm", airports: ["ARN", "BMA", "NYO"] },
  OSL: { name: "Oslo", airports: ["OSL", "TRF"] },
  BRU: { name: "Brussels", airports: ["BRU", "CRL"] },
  REK: { name: "Reykjavík", airports: ["KEF", "RKV"] },
  TCI: { name: "Tenerife", airports: ["TFS", "TFN"] },
  BER: { name: "Berlin", airports: ["BER"] },
  IST: { name: "Istanbul", airports: ["IST", "SAW"] },
  MOW: { name: "Moscow", airports: ["SVO", "DME", "VKO"] },
  DXB: { name: "Dubai", airports: ["DXB", "DWC"] },
  TYO: { name: "Tokyo", airports: ["HND", "NRT"] },
  OSA: { name: "Osaka", airports: ["KIX", "ITM"] },
  SEL: { name: "Seoul", airports: ["ICN", "GMP"] },
  BJS: { name: "Beijing", airports: ["PEK", "PKX"] },
  SHA: { name: "Shanghai", airports: ["PVG", "SHA"] },
  BKK: { name: "Bangkok", airports: ["BKK", "DMK"] },
  JKT: { name: "Jakarta", airports: ["CGK", "HLP"] },
  CHI: { name: "Chicago", airports: ["ORD", "MDW"] },
  WAS: { name: "Washington", airports: ["IAD", "DCA", "BWI"] },
  YTO: { name: "Toronto", airports: ["YYZ", "YTZ"] },
  MEX: { name: "Mexico City", airports: ["MEX", "NLU"] },
  SAO: { name: "São Paulo", airports: ["GRU", "CGH", "VCP"] },
  RIO: { name: "Rio de Janeiro", airports: ["GIG", "SDU"] },
  BUE: { name: "Buenos Aires", airports: ["EZE", "AEP"] },
};
const METRO_OF = new Map(Object.entries(METROS).flatMap(([code, m]) => m.airports.map((a) => [a, code] as const)));

/**
 * Rough cost level per country: 1 = expensive (Switzerland, Norway, US...),
 * 4 = cheap (Türkiye, Thailand, Morocco...). Drives estimates for places
 * without hand-entered prices.
 */
const TIER_1 = "CH NO IS DK US AU NZ SG IE LU MC LI BS BM KY MV SC".split(" ");
const TIER_2 = "GB FR NL DE AT BE SE FI IT CA IL QA AE HK KR JP KW BH TW AD MT CY FO GL".split(" ");
const TIER_4 =
  "HU PL RO BG RS AL BA ME MK XK TR MA EG MX TH VN ID MY IN LK ZA BR AR CO PE KE TZ DO CU NP KH LA PH TN JO GE AM AZ UA MD BY KZ UZ BO EC PY GT NI HN SV BD PK ET UG RW GH NG SN".split(" ");
export function costTier(countryCode: string): 1 | 2 | 3 | 4 {
  if (TIER_1.includes(countryCode)) return 1;
  if (TIER_2.includes(countryCode)) return 2;
  if (TIER_4.includes(countryCode)) return 4;
  return 3;
}
const BY_TIER = {
  hotelNightly: [0, 170, 130, 95, 60],
  transferOneWayPP: [0, 18, 12, 6, 5],
  localReturnPP: [0, 25, 16, 10, 6],
  parkingPerDay: [0, 22, 15, 10, 6],
  dayTicketPP: [0, 12, 8, 5, 3],
};

export function countryName(code: string): string {
  return COUNTRIES[code] ?? code;
}

export function worldAirport(code: string): WorldAirport | undefined {
  return WORLD_BY_CODE.get(code.toUpperCase());
}

const UK_BY_CODE = new Map(UK_AIRPORTS.map((a) => [a.code, a]));
const airportCache = new Map<string, Airport>();

/** Any airport worldwide, with cost estimates. Hand-entered UK data wins. */
export function getAirport(code: string): Airport | undefined {
  const c = code.toUpperCase();
  const cached = airportCache.get(c);
  if (cached) return cached;
  const w = WORLD_BY_CODE.get(c);
  const uk = UK_BY_CODE.get(c);
  if (!w && !uk) return undefined;
  let a: Airport;
  if (uk) {
    a = { ...uk, cityCode: uk.cityCode ?? METRO_OF.get(c), tz: "Europe/London", countryCode: "GB", continent: "EU" };
  } else {
    const tier = costTier(w!.countryCode);
    a = {
      code: c,
      name: w!.name,
      city: w!.city,
      lat: w!.lat,
      lon: w!.lon,
      localReturnPP: BY_TIER.localReturnPP[tier],
      parkingPerDay: BY_TIER.parkingPerDay[tier],
      cityCode: METRO_OF.get(c),
      size: w!.size,
      tz: w!.tz,
      countryCode: w!.countryCode,
      continent: w!.continent,
    };
  }
  airportCache.set(c, a);
  return a;
}

const CURATED = new Map(DESTINATIONS.map((d) => [d.code, d]));
const destCache = new Map<string, Destination>();

/** A destination by IATA city or airport code. Airports in a multi-airport city resolve to the city. */
export function getDestination(code: string): Destination | undefined {
  let c = code.toUpperCase();
  if (!CURATED.has(c) && METRO_OF.has(c) && !METROS[c]) c = METRO_OF.get(c)!;
  const curated = CURATED.get(c);
  if (curated) return curated;
  const cached = destCache.get(c);
  if (cached) return cached;
  const metro = METROS[c];
  const main = WORLD_BY_CODE.get(metro ? metro.airports[0] : c);
  if (!main) return undefined;
  const tier = costTier(main.countryCode);
  const d: Destination = {
    code: c,
    name: metro?.name ?? main.city,
    country: countryName(main.countryCode),
    countryCode: main.countryCode,
    tz: main.tz,
    lat: main.lat,
    lon: main.lon,
    transferOneWayPP: BY_TIER.transferOneWayPP[tier],
    hotelNightly: BY_TIER.hotelNightly[tier],
    flightBase: 0,
    flightMins: 0,
    kind: POPULAR_SUN.has(c) ? "sun" : "city",
    centreKnown: false,
  };
  destCache.set(c, d);
  return d;
}

export function dayTicketFor(dest: Destination): number {
  return dayTicketOverride(dest.code) ?? BY_TIER.dayTicketPP[costTier(dest.countryCode)];
}

/** Codes that can be an airport for a destination (e.g. LON → LHR, LGW...). */
export function destinationAirports(code: string): string[] {
  return METROS[code]?.airports ?? [code];
}

// Popular destinations used for "anywhere" searches. Hand-entered ones first.
const POPULAR_CITY =
  "NYC BOS WAS CHI LAS LAX SFO YTO YVR MEX DXB DOH AUH CAI RAK BKK SIN KUL HKG TYO SEL SYD MEL AKL CPT JNB DEL BOM LON MAN EDI DUB OSL STO HEL TLL RIX VNO WAW GDN ZAG LJU BEG SOF OTP FLR BLQ PMO LYS GVA ZRH SVQ BIO TLV AMM".split(" ");
const POPULAR_SUN = new Set(
  "MIA MCO CUN PUJ MBJ BGI LPA ACE FUE IBZ MAH HER RHO CFU JTR DLM AYT BJV LCA PFO MLE CMB HKT DPS ZNZ FNC PDL CTA OLB SSH HRG TFS GOI".split(" "),
);
const POPULAR = [...DESTINATIONS.map((d) => d.code), ...POPULAR_CITY, ...POPULAR_SUN];

/** Popular destinations within range of an origin, nearest first. */
export function popularDestinations(origin: { lat: number; lon: number; code: string }, maxKm: number, limit = 40): Destination[] {
  const out: { d: Destination; km: number }[] = [];
  const seen = new Set<string>();
  for (const code of POPULAR) {
    const d = getDestination(code);
    if (!d || seen.has(d.code)) continue;
    seen.add(d.code);
    const km = haversineKm(origin, d);
    if (km < 150 || km > maxKm) continue;
    if (destinationAirports(d.code).includes(origin.code) || d.code === origin.code) continue;
    out.push({ d, km });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit).map((x) => x.d);
}

/** Scheduled airports in the same country within a travel time, nearest first. */
export function nearbyAirports(start: { lat: number; lon: number }, countryCode: string, hours: number): Airport[] {
  const list: { a: Airport; h: number }[] = [];
  for (const w of WORLD) {
    if (w.countryCode !== countryCode) continue;
    const h = travelHours(start, w);
    if (h <= hours) list.push({ a: getAirport(w.code)!, h });
  }
  return list.sort((x, y) => x.h - y.h).map((x) => x.a);
}

/** The nearest scheduled airport to a point. */
export function nearestAirport(point: { lat: number; lon: number }): Airport {
  let best = WORLD[0];
  let bestKm = Infinity;
  for (const w of WORLD) {
    const km = haversineKm(point, w);
    if (km < bestKm) {
      best = w;
      bestKm = km;
    }
  }
  return getAirport(best.code)!;
}

export interface PlaceInfo {
  code: string;
  /** "airport" or "city" (a city with several airports) */
  type: "airport" | "city";
  name: string;
  city: string;
  country: string;
  countryCode: string;
  tz: string;
  lat: number;
  lon: number;
}

export function placeInfo(code: string): PlaceInfo | undefined {
  const c = code.toUpperCase();
  const metro = METROS[c];
  if (metro && !WORLD_BY_CODE.has(c)) {
    const main = WORLD_BY_CODE.get(metro.airports[0])!;
    return { code: c, type: "city", name: `${metro.name} (all airports)`, city: metro.name, country: countryName(main.countryCode), countryCode: main.countryCode, tz: main.tz, lat: main.lat, lon: main.lon };
  }
  const a = getAirport(c);
  if (a) return { code: c, type: "airport", name: a.name, city: a.city, country: countryName(a.countryCode), countryCode: a.countryCode, tz: a.tz, lat: a.lat, lon: a.lon };
  const d = getDestination(c);
  if (d) return { code: d.code, type: "city", name: d.name, city: d.name, country: d.country, countryCode: d.countryCode, tz: d.tz, lat: d.lat, lon: d.lon };
  return undefined;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Search airports and cities by code, city, airport name or country. */
export function searchPlaces(query: string, opts: { cities: boolean; limit?: number }): PlaceInfo[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const scored: { code: string; score: number }[] = [];
  if (opts.cities) {
    for (const [code, m] of Object.entries(METROS)) {
      const n = norm(m.name);
      const s = code.toLowerCase() === q ? 100 : n.startsWith(q) ? 90 : n.includes(q) ? 40 : -1;
      if (s >= 0) scored.push({ code, score: s + 5 });
    }
  }
  for (const w of WORLD) {
    const a = getAirport(w.code)!;
    const city = norm(a.city);
    const name = norm(a.name);
    const country = norm(countryName(w.countryCode));
    let s = -1;
    if (w.code.toLowerCase() === q) s = 100;
    else if (city.startsWith(q)) s = 80;
    else if (name.startsWith(q)) s = 70;
    else if (city.includes(q) || name.includes(q)) s = 40;
    else if (country.startsWith(q) && q.length >= 4) s = 20;
    if (s >= 0) scored.push({ code: w.code, score: s + w.size * 3 + (w.countryCode === "GB" ? 2 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, opts.limit ?? 8)
    .map((s) => placeInfo(s.code)!)
    .filter(Boolean);
}

/** Straight-line flight distance between two places, in km. */
export function routeKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineKm(a, b);
}

/** Typical direct flight time in minutes. */
export function routeMins(origin: Airport, dest: Destination): number {
  if (dest.flightMins && origin.countryCode === "GB") return dest.flightMins;
  return Math.round(35 + (routeKm(origin, dest) / 780) * 60);
}
