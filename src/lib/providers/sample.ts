// Sample data providers. Deterministic, realistic-looking prices so the app
// can be built and tested before API keys arrive. Never shown as real: the UI
// labels every sample result.

import type { Airport } from "../data/airports";
import type { Destination } from "../data/destinations";
import { addDays, dayOfWeek, daysBetween, localToUtc, parseDate, todayUK } from "../dates";
import { flightSearchUrl, hotelSearchUrl } from "../links";
import type { FlightOption, StayOption } from "../types";
import { rand } from "../util";
import { nightFactor } from "./estimate";
import type { FlightProvider, FlightQuery, StayProvider, StayQuery } from "./types";
import { roomsNeeded } from "./types";

// Day-of-week multipliers, 0 = Sunday.
const OUT_DOW = [1.05, 0.95, 0.8, 0.82, 1.1, 1.3, 1.1];
const RET_DOW = [1.3, 1.15, 0.85, 0.85, 0.95, 1.0, 0.95];
const CITY_SEASON = [0.75, 0.8, 0.9, 1.05, 1.05, 1.1, 1.25, 1.3, 1.0, 1.0, 0.8, 1.1];
const SUN_SEASON = [0.7, 0.75, 0.85, 1.05, 1.1, 1.3, 1.5, 1.55, 1.15, 1.0, 0.75, 0.95];

const EARLY_SLOTS = [6 * 60, 6 * 60 + 40, 21 * 60 + 10]; // cheap, antisocial
const GOOD_SLOTS = [8 * 60 + 15, 10 * 60 + 30, 13 * 60 + 5, 16 * 60 + 20];

function servesRoute(origin: Airport, dest: Destination): boolean {
  if (origin.size === 3) return true;
  const r = rand(`route|${origin.code}|${dest.code}`);
  return origin.size === 2 ? r < 0.7 : r < 0.35;
}

function carriers(origin: Airport): [string, string] {
  if (origin.code === "LHR") return ["BA", "BA"];
  if (origin.code === "LCY") return ["BA", "KL"];
  const budget = ["FR", "U2", "LS", "W6"];
  const r = Math.floor(rand(`carrier|${origin.code}`) * budget.length);
  return [budget[r], origin.size === 3 ? "BA" : budget[(r + 1) % budget.length]];
}

function originFactor(origin: Airport): number {
  if (origin.code === "LHR" || origin.code === "LCY") return 1.3;
  if (origin.size === 3) return 0.92;
  if (origin.size === 2) return 1.02;
  return 1.18;
}

function leadFactor(depart: string): number {
  const days = daysBetween(todayUK(), depart);
  if (days < 14) return 1.4;
  if (days < 30) return 1.12;
  return 1;
}

export const sampleFlights: FlightProvider = {
  id: "sample",
  label: "Sample flight data",
  sample: true,
  async search(q: FlightQuery): Promise<FlightOption[]> {
    const out: FlightOption[] = [];
    const [cheapCarrier, altCarrier] = carriers(q.origin);
    for (const dest of q.destinations) {
      if (!servesRoute(q.origin, dest)) continue;
      const routeKey = `${q.origin.code}|${dest.code}`;
      const routeFactor = 0.85 + rand(`rf|${routeKey}`) * 0.3;
      // Small airports often need a connection to less popular places.
      const altStops = q.origin.size === 1 ? 1 : 0;
      for (let d = parseDate(q.departFrom); d <= parseDate(q.departTo); d += 86_400_000) {
        const depart = new Date(d).toISOString().slice(0, 10);
        for (let n = q.minNights; n <= q.maxNights; n++) {
          const ret = addDays(depart, n);
          const key = `${routeKey}|${depart}|${ret}`;
          const month = Number(depart.slice(5, 7)) - 1;
          const season = dest.kind === "sun" ? SUN_SEASON[month] : CITY_SEASON[month];
          const base =
            dest.flightBase *
            originFactor(q.origin) *
            routeFactor *
            OUT_DOW[dayOfWeek(depart)] *
            RET_DOW[dayOfWeek(ret)] *
            season *
            leadFactor(depart) *
            (0.78 + rand(`noise|${key}`) * 0.5);

          // Option A: budget carrier, antisocial times, cheapest.
          const aOut = EARLY_SLOTS[Math.floor(rand(`ao|${key}`) * EARLY_SLOTS.length)];
          const aRet = EARLY_SLOTS[Math.floor(rand(`ar|${key}`) * EARLY_SLOTS.length)];
          out.push(makeFlight(q, dest, depart, ret, cheapCarrier, aOut, aRet, 0, 0, false, base * 0.82, `${key}|a`));

          // Option B: better times, sometimes a connection, costs more.
          const bOut = GOOD_SLOTS[Math.floor(rand(`bo|${key}`) * GOOD_SLOTS.length)];
          const bRet = GOOD_SLOTS[Math.floor(rand(`br|${key}`) * GOOD_SLOTS.length)];
          const layover = altStops ? 70 + Math.floor(rand(`lay|${key}`) * 200) : 0;
          const selfTransfer = altStops > 0 && rand(`st|${key}`) < 0.25;
          const bPrice = base * (selfTransfer ? 0.9 : 1.08) * (altStops ? 0.95 : 1);
          out.push(makeFlight(q, dest, depart, ret, altCarrier, bOut, bRet, altStops, layover, selfTransfer, bPrice, `${key}|b`));
        }
      }
    }
    return out;
  },
};

function makeFlight(
  q: FlightQuery,
  dest: Destination,
  depart: string,
  ret: string,
  airline: string,
  outMin: number,
  retMin: number,
  stops: number,
  layoverMins: number,
  selfTransfer: boolean,
  price: number,
  id: string,
): FlightOption {
  const legMins = dest.flightMins + stops * (60 + layoverMins);
  const outDepart = localToUtc(depart, outMin, "Europe/London");
  const retDepart = localToUtc(ret, retMin, dest.tz);
  const destCode = dest.code;
  return {
    id: `s-${id}`,
    source: "sample",
    origin: q.origin.code,
    destination: destCode,
    destinationAirport: destCode,
    airline,
    departDate: depart,
    returnDate: ret,
    outDepart,
    outArrive: new Date(Date.parse(outDepart) + legMins * 60000).toISOString(),
    outStops: stops,
    retDepart,
    retArrive: new Date(Date.parse(retDepart) + legMins * 60000).toISOString(),
    retStops: stops,
    maxLayoverMins: layoverMins,
    selfTransfer,
    pricePerPerson: Math.max(25, Math.round(price)),
    bookingUrl: flightSearchUrl(q.origin.code, destCode, depart, ret, q.adults, q.children),
    seenHoursAgo: Math.floor(rand(`seen|${id}`) * 40) + 1,
  };
}

const AREAS = ["Old Town", "Central", "Riverside", "Station", "Market", "Harbour", "Gallery", "Park", "Plaza", "University", "Castle", "Cathedral", "Garden", "Quarter", "Canal", "Square"];

export const sampleStays: StayProvider = {
  id: "sample",
  label: "Sample accommodation data",
  sample: true,
  async search(q: StayQuery): Promise<StayOption[]> {
    const { destination: dest, checkin, checkout, adults, children, prefs } = q;
    const nights = daysBetween(checkin, checkout);
    const people = adults + children;
    const results: StayOption[] = [];
    for (let i = 0; i < AREAS.length; i++) {
      const k = `${dest.code}|${i}`;
      const type: "hotel" | "apartment" = rand(`type|${k}`) < 0.35 ? "apartment" : "hotel";
      if (prefs.type !== "any" && prefs.type !== type) continue;
      const rating = Math.round((6.6 + rand(`rating|${k}`) * 2.8) * 10) / 10;
      const centreMins = Math.round(3 + rand(`dist|${k}`) ** 1.8 * 40);
      if (rating < prefs.minRating || centreMins > prefs.maxCentreMins) continue;
      const quality = 0.72 + (rating - 7) * 0.13 - centreMins * 0.006 + rand(`q|${k}`) * 0.18;
      const units = type === "apartment" ? 1 + Math.max(0, people - 2) * 0.18 : roomsNeeded(adults) * (children > 0 ? 1.1 : 1);
      let total = 0;
      for (let n = 0; n < nights; n++) {
        const night = addDays(checkin, n);
        const event = rand(`event|${dest.code}|${night}`) < 0.05 ? 1.7 : 1;
        const jitter = 0.92 + rand(`nj|${k}|${night}`) * 0.16;
        total += dest.hotelNightly * nightFactor(dest, night) * quality * event * jitter * units;
      }
      const name = `${AREAS[i]} ${type === "apartment" ? "Apartments" : "Hotel"} ${dest.name} (sample)`;
      results.push({
        id: `s-${k}-${checkin}-${checkout}`,
        source: "sample",
        name,
        type,
        rating,
        centreMins,
        total: Math.round(total),
        freeCancellation: rand(`fc|${k}`) < 0.6,
        bookingUrl: hotelSearchUrl(`${dest.name}, ${dest.country}`, checkin, checkout, adults, children, roomsNeeded(adults)),
      });
    }
    return results;
  },
};
