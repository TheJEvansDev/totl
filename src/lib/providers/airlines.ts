// Fares straight from airlines' own websites, read through Firecrawl
// (FIRECRAWL_API_KEY). An airline's own lowest fares are the most accurate
// price there is, and one call can cover a whole year of dates on a route,
// so every date in a search gets checked, not just a sample.
//
// - easyJet: its low-fare finder lists every flight on a route with its
//   lowest one-way fare, about a year ahead. 1 credit per route and direction.
// - Ryanair: Firecrawl doesn't support its site, but Google Flights (SerpApi)
//   carries Ryanair's live fares, so it's still covered.

import { AIRLINE_SITES } from "../airlineSites";
import { destinationAirports, getAirport } from "../data/places";
import { localToUtc } from "../dates";
import type { OneWayFlight } from "../types";
import { TtlCache, mapLimit } from "../util";
import type { LiveOneWayQuery } from "./types";

/** Airports easyJet flies from or to (UK and its main European network). */
const EASYJET = new Set(
  (
    "BRS LGW LTN STN SEN MAN LPL NCL EDI GLA ABZ INV BFS BHX JER IOM SOU " +
    "AMS BER BSL GVA ZRH MXP LIN NAP VCE FCO CTA PMO OLB CAG BRI BLQ PSA FLR VRN TRN " +
    "CDG ORY NCE LYS TLS BOD NTE MRS MPL BIQ AJA BIA " +
    "FAO LIS OPO FNC PDL BCN MAD AGP ALC PMI IBZ MAH VLC SVQ BIO TFS LPA ACE FUE " +
    "ATH HER CHQ RHO KGS CFU JMK JTR ZTH EFL PVK SKG " +
    "DBV SPU ZAG PUY LJU PRG BUD KRK WAW VIE SZG INN CPH ARN OSL HEL TLL RIX " +
    "DLM AYT BJV LCA PFO MLA RAK AGA HRG SSH TLV AMM CAI"
  ).split(" "),
);

/** Returning to the same results within this time doesn't spend another credit. */
const cache = new TtlCache<EasyjetFare[]>(30 * 60_000);

/** Fetch a URL's raw body (here JSON) through Firecrawl. 1 credit. */
async function scrapeRaw(key: string, url: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ["rawHtml"], maxAge: 0, location: { country: "GB" }, timeout: 30_000 }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { rawHtml?: string } };
  if (!res.ok || body.success === false || typeof body.data?.rawHtml !== "string") {
    throw new Error(`Firecrawl ${res.status}: ${body.error ?? "no content"}`);
  }
  return body.data.rawHtml;
}

export interface EasyjetFare {
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  outboundPrice?: number;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

/** "2026-11-30T06:45:00" (local time at the airport) to ISO UTC. */
function toUtc(local: string | undefined, airport: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  const tz = airport ? getAirport(airport)?.tz : undefined;
  if (!m || !tz) return null;
  return localToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

/** One easyJet fare as a one-way flight. `home`/`dest` are our codes for each end. */
export function easyjetToOneWay(f: EasyjetFare, direction: "out" | "back", home: string, dest: string): OneWayFlight | null {
  const from = f.departureAirport;
  const to = f.arrivalAirport;
  if (!from || !to || !f.flightNumber || !f.outboundPrice || f.outboundPrice <= 0) return null;
  const depart = toUtc(f.departureDateTime, from);
  const arrive = toUtc(f.arrivalDateTime, to);
  if (!depart || !arrive) return null;
  const date = f.departureDateTime!.slice(0, 10);
  const flight = `U2 ${f.flightNumber}`;
  return {
    id: `ej-${from}-${to}-${f.flightNumber}-${date}`,
    source: "easyjet",
    from: direction === "out" ? home : dest,
    to: direction === "out" ? dest : home,
    airline: "U2",
    date,
    depart,
    arrive,
    stops: 0,
    layoverMins: 0,
    price: Math.round(f.outboundPrice * 100) / 100,
    // Opens easyJet with this exact flight's date and route searched.
    bookingUrl: AIRLINE_SITES.U2.search!({ from, to, depart: date, ret: "", adults: 1, children: 0 }),
    seenHoursAgo: 0,
    seller: "easyJet",
    liveLeg: { from, to, date, flightNumbers: [flight] },
  };
}

/** Every easyJet flight on one route and direction, about a year ahead. */
function easyjetRoute(key: string, from: string, to: string): Promise<EasyjetFare[]> {
  const url = `https://www.easyjet.com/api/routepricing/v3/searchfares/GetLowestDailyFares?departureAirport=${from}&arrivalAirport=${to}&currency=GBP`;
  return cache.get(url, async () => {
    const parsed = JSON.parse(await scrapeRaw(key, url)) as unknown;
    return Array.isArray(parsed) ? (parsed as EasyjetFare[]) : [];
  });
}

/** Fares straight from airlines for exact dates, merged into live searches. */
export interface DirectAirlines {
  oneWays(q: LiveOneWayQuery, maxRoutes: number): Promise<OneWayFlight[]>;
  /** Routes (one per direction) a query would read, for counting credits. */
  routesFor(q: LiveOneWayQuery): number;
}

function easyjetRoutes(q: LiveOneWayQuery) {
  const routes: { home: string; away: string; dest: string }[] = [];
  for (const a of q.airports) {
    if (!EASYJET.has(a.code)) continue;
    for (const d of q.destinations) for (const away of destinationAirports(d.code)) if (EASYJET.has(away)) routes.push({ home: a.code, away, dest: d.code });
  }
  return routes;
}

export function directAirlines(key: string): DirectAirlines {
  return {
    routesFor: (q) => easyjetRoutes(q).length,
    async oneWays(q, maxRoutes) {
      const wanted = new Set(q.dates);
      const routes = easyjetRoutes(q).slice(0, maxRoutes);
      const lists = await mapLimit(routes, 4, async ({ home, away, dest }) => {
        const [from, to] = q.direction === "out" ? [home, away] : [away, home];
        try {
          const fares = await easyjetRoute(key, from, to);
          return fares
            .filter((f) => wanted.has((f.departureDateTime ?? "").slice(0, 10)))
            .map((f) => easyjetToOneWay(f, q.direction, home, dest))
            .filter((f): f is OneWayFlight => f !== null);
        } catch (err) {
          console.error("easyJet fares failed", from, to, err);
          return [];
        }
      });
      return lists.flat();
    },
  };
}
