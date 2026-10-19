// Sample data providers. Deterministic, realistic-looking prices so the app
// can be built and tested before API keys arrive. Never shown as real: the UI
// labels every sample result.

import type { Airport } from "../data/airports";
import { estimatedMinutes } from "../area";
import { routeKm, routeMins } from "../data/places";
import type { Destination } from "../data/destinations";
import { addDays, dayOfWeek, daysBetween, localToUtc, parseDate, todayUK } from "../dates";
import { flightSearchUrl, hotelSearchUrl } from "../links";
import type { FlightOption, OneWayFlight, StayOption } from "../types";
import { rand } from "../util";
import { nightFactor } from "./estimate";
import type { Market } from "../markets";
import type { FlightProvider, FlightQuery, MarketQuote, OneWayQuery, StayProvider, StayQuery } from "./types";
import { roomsNeeded } from "./types";

// Day-of-week multipliers, 0 = Sunday.
const OUT_DOW = [1.05, 0.95, 0.8, 0.82, 1.1, 1.3, 1.1];
const RET_DOW = [1.3, 1.15, 0.85, 0.85, 0.95, 1.0, 0.95];
const CITY_SEASON = [0.75, 0.8, 0.9, 1.05, 1.05, 1.1, 1.25, 1.3, 1.0, 1.0, 0.8, 1.1];
const SUN_SEASON = [0.7, 0.75, 0.85, 1.05, 1.1, 1.3, 1.5, 1.55, 1.15, 1.0, 0.75, 0.95];

const EARLY_SLOTS = [6 * 60, 6 * 60 + 40, 21 * 60 + 10]; // cheap, antisocial
const GOOD_SLOTS = [8 * 60 + 15, 10 * 60 + 30, 13 * 60 + 5, 16 * 60 + 20];

/** Typical return fare per person: hand-entered from the UK, otherwise by distance. */
function routeBase(origin: Airport, dest: Destination): number {
  if (dest.flightBase && origin.countryCode === "GB") return dest.flightBase;
  const km = routeKm(origin, dest);
  return km <= 3000 ? 40 + km * 0.065 : 160 + km * 0.05;
}

/** Long flights from smaller airports usually need a connection. */
function routeStops(origin: Airport, dest: Destination): number {
  const km = routeKm(origin, dest);
  if (km > 9000) return 1;
  return km > 4500 && origin.size < 3 ? 1 : 0;
}

function servesRoute(origin: Airport, dest: Destination): boolean {
  if (routeStops(origin, dest) > 0) return true; // reachable with a connection
  if (origin.size === 3) return true;
  const r = rand(`route|${origin.code}|${dest.code}`);
  return origin.size === 2 ? r < 0.7 : r < 0.35;
}

/** Smaller airports only fly most routes on some days of the week. */
function operatesOn(origin: Airport, dest: Destination, date: string): boolean {
  if (origin.size === 3) return true;
  return rand(`days|${origin.code}|${dest.code}|${dayOfWeek(date)}`) < (origin.size === 2 ? 0.5 : 0.35);
}

function carriers(origin: Airport, dest?: Destination): [string, string] {
  const longHaul = dest ? routeKm(origin, dest) > 4000 : false;
  if (longHaul) return origin.countryCode === "GB" ? ["VS", "BA"] : origin.continent === "NA" ? ["AA", "DL"] : ["EK", "QR"];
  if (origin.continent === "NA") return ["B6", "UA"];
  if (origin.continent === "AS" || origin.continent === "OC") return ["EK", "SQ"];
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

/** Occasional flash sales and error fares, so deal detection has something to find. */
function saleFactor(key: string): number {
  const r = rand(`sale|${key}`);
  if (r < 0.003) return 0.3;
  if (r < 0.025) return 0.55;
  return 1;
}

function leadFactor(depart: string): number {
  const days = daysBetween(todayUK(), depart);
  if (days < 14) return 1.4;
  if (days < 30) return 1.12;
  return 1;
}

/** How each market's price tends to compare, as [lowest, highest] multipliers. */
const MARKET_SPREAD: Record<string, [number, number]> = {
  tr: [0.78, 1.04], in: [0.82, 1.05], br: [0.86, 1.06], mx: [0.88, 1.05], th: [0.88, 1.05], za: [0.9, 1.05],
  pl: [0.92, 1.03], hu: [0.92, 1.03], cz: [0.93, 1.03], us: [0.96, 1.08],
};

export const sampleFlights: FlightProvider = {
  id: "sample",
  label: "Sample flight data",
  sample: true,
  async checkMarkets(flight: FlightOption, origin: Airport, dest: Destination, markets: Market[], adults: number, children: number): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const m of markets) {
      const key = `mkt|${flight.id}|${m.code}`;
      if (m.country === origin.countryCode) continue; // that's the price we already show
      if (rand(`${key}|has`) < 0.25) continue; // not every market has a recent price
      const [lo, hi] = MARKET_SPREAD[m.code] ?? [0.97, 1.04];
      quotes.push({
        market: m.code,
        pricePerPerson: Math.max(10, Math.round(flight.pricePerPerson * (lo + rand(key) * (hi - lo)))),
        bookingUrl: flightSearchUrl(flight.origin, dest.code, flight.departDate, flight.returnDate, adults, children),
        seenHoursAgo: Math.floor(rand(`${key}|seen`) * 40) + 1,
      });
    }
    return quotes;
  },
  async searchOneWay(q: OneWayQuery): Promise<OneWayFlight[]> {
    const out: OneWayFlight[] = [];
    const dows = q.direction === "out" ? OUT_DOW : RET_DOW;
    for (const dest of q.destinations) {
      if (!servesRoute(q.airport, dest)) continue;
      const [cheapCarrier, altCarrier] = carriers(q.airport, dest);
      const stops = routeStops(q.airport, dest);
      const mins = routeMins(q.airport, dest) + stops * 150;
      const routeKey = `${q.airport.code}|${dest.code}`;
      const routeFactor = 0.85 + rand(`rf|${routeKey}`) * 0.3;
      for (let d = parseDate(q.dateFrom); d <= parseDate(q.dateTo); d += 86_400_000) {
        const date = new Date(d).toISOString().slice(0, 10);
        if (!operatesOn(q.airport, dest, date)) continue;
        const key = `ow|${q.direction}|${routeKey}|${date}`;
        const month = Number(date.slice(5, 7)) - 1;
        const season = dest.kind === "sun" ? SUN_SEASON[month] : CITY_SEASON[month];
        // One-way fares are roughly half a return, a bit more for flag carriers.
        const base =
          routeBase(q.airport, dest) * 0.52 * originFactor(q.airport) * routeFactor * dows[dayOfWeek(date)] * season *
          leadFactor(date) * (0.75 + rand(`noise|${key}`) * 0.55) * saleFactor(key);
        const tz = q.direction === "out" ? q.airport.tz : dest.tz;
        const [from, to] = q.direction === "out" ? [q.airport.code, dest.code] : [dest.code, q.airport.code];
        const options: [string, number, number][] = [
          [cheapCarrier, EARLY_SLOTS[Math.floor(rand(`a|${key}`) * EARLY_SLOTS.length)], base * 0.85],
          [altCarrier, GOOD_SLOTS[Math.floor(rand(`b|${key}`) * GOOD_SLOTS.length)], base * 1.08],
        ];
        options.forEach(([airline, mins, price], i) => {
          const depart = localToUtc(date, mins, tz);
          out.push({
            id: `s-${key}|${i}`,
            source: "sample",
            from,
            to,
            airline,
            date,
            depart,
            arrive: new Date(Date.parse(depart) + mins * 60000).toISOString(),
            stops,
            layoverMins: stops * 90,
            price: Math.max(15, Math.round(price)),
            bookingUrl: flightSearchUrl(from, to, date, "", q.adults, q.children),
            seenHoursAgo: Math.floor(rand(`seen|${key}|${i}`) * 40) + 1,
          });
        });
      }
    }
    return out;
  },
  async search(q: FlightQuery): Promise<FlightOption[]> {
    const out: FlightOption[] = [];
    for (const dest of q.destinations) {
      if (!servesRoute(q.origin, dest)) continue;
      const [cheapCarrier, altCarrier] = carriers(q.origin, dest);
      const longStops = routeStops(q.origin, dest);
      const routeKey = `${q.origin.code}|${dest.code}`;
      const routeFactor = 0.85 + rand(`rf|${routeKey}`) * 0.3;
      // Small airports often need a connection to less popular places.
      const altStops = Math.max(longStops, q.origin.size === 1 ? 1 : 0);
      for (let d = parseDate(q.departFrom); d <= parseDate(q.departTo); d += 86_400_000) {
        const depart = new Date(d).toISOString().slice(0, 10);
        if (!operatesOn(q.origin, dest, depart)) continue;
        for (let n = q.minNights; n <= q.maxNights; n++) {
          const ret = addDays(depart, n);
          if (!operatesOn(q.origin, dest, ret)) continue;
          const key = `${routeKey}|${depart}|${ret}`;
          const month = Number(depart.slice(5, 7)) - 1;
          const season = dest.kind === "sun" ? SUN_SEASON[month] : CITY_SEASON[month];
          const base =
            routeBase(q.origin, dest) *
            originFactor(q.origin) *
            routeFactor *
            OUT_DOW[dayOfWeek(depart)] *
            RET_DOW[dayOfWeek(ret)] *
            season *
            leadFactor(depart) *
            (0.78 + rand(`noise|${key}`) * 0.5) *
            saleFactor(key);

          // Option A: budget carrier, antisocial times, cheapest.
          const aOut = EARLY_SLOTS[Math.floor(rand(`ao|${key}`) * EARLY_SLOTS.length)];
          const aRet = EARLY_SLOTS[Math.floor(rand(`ar|${key}`) * EARLY_SLOTS.length)];
          out.push(makeFlight(q, dest, depart, ret, cheapCarrier, aOut, aRet, longStops, longStops * 100, false, base * 0.82, `${key}|a`));

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
  const legMins = routeMins(q.origin, dest) + stops * (60 + layoverMins);
  const outDepart = localToUtc(depart, outMin, q.origin.tz);
  const retDepart = localToUtc(ret, retMin, dest.tz);
  const destCode = dest.code;
  return {
    id: `s-${id}`,
    source: "sample",
    origin: q.origin.code,
    returnAirport: q.origin.code,
    destination: destCode,
    destinationAirport: destCode,
    airline,
    returnAirline: airline,
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
    returnBookingUrl: null,
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
      const centreKm = Math.round((0.3 + rand(`dist|${k}`) ** 1.8 * 8.5) * 10) / 10;
      const centreMins = estimatedMinutes(centreKm);
      if (rating < prefs.minRating || centreKm > prefs.maxCentreKm) continue;
      const bearing = rand(`bearing|${k}`) * 2 * Math.PI;
      // Further out is cheaper, more so in expensive cities.
      const distanceDiscount = centreKm * (dest.hotelNightly > 130 ? 0.05 : 0.036);
      const quality = 0.78 + (rating - 7) * 0.13 - distanceDiscount + rand(`q|${k}`) * 0.18;
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
        centreKm,
        centreMins,
        lat: dest.lat + (centreKm / 111) * Math.cos(bearing),
        lon: dest.lon + (centreKm / (111 * Math.cos((dest.lat * Math.PI) / 180))) * Math.sin(bearing),
        total: Math.round(total),
        freeCancellation: rand(`fc|${k}`) < 0.6,
        bookingUrl: hotelSearchUrl(`${dest.name}, ${dest.country}`, checkin, checkout, adults, children, roomsNeeded(adults)),
      });
    }
    return results;
  },
};
