// The total-cost engine. For every origin airport, destination and date pair,
// works out flights + bags + getting to the airport + accommodation + transfers,
// then ranks trips by smart score (cost plus usability penalties).

import { LIMITS } from "../config/penalties";
import type { Airport } from "../data/airports";
import { UK_AIRPORTS, getAirport, travelHours } from "../data/airports";
import type { Destination } from "../data/destinations";
import { getDestination } from "../data/destinations";
import { airlineName } from "../data/destinations";
import { dayName, dayOfWeek, daysBetween } from "../dates";
import { estimatedStay } from "../providers/estimate";
import type { FlightProvider, StayProvider } from "../providers/types";
import type {
  CostLine,
  DestinationSummary,
  FlightOption,
  GroupLeg,
  Heatmap,
  HeatCell,
  Penalty,
  SearchRequest,
  SearchResponse,
  StayOption,
  TravellerGroup,
  Trip,
} from "../types";
import { mapLimit } from "../util";
import { assessFlight, assessStay, bagCost, groundCost } from "./costs";
import { destinationList, expandDates } from "./request";

export class SearchError extends Error {}

/** Airports a group will consider: home, any extras, and nearby ones if asked. */
export function candidateAirports(group: TravellerGroup): Airport[] {
  const home = getAirport(group.homeAirport)!;
  const chosen = new Map<string, Airport>([[home.code, home]]);
  for (const code of group.extraAirports) {
    const a = getAirport(code);
    if (a) chosen.set(a.code, a);
  }
  if (group.nearbyHours > 0) {
    const start = group.from ?? home;
    UK_AIRPORTS.map((a) => ({ a, h: travelHours(start, a) }))
      .filter(({ h }) => h <= group.nearbyHours)
      .sort((x, y) => x.h - y.h)
      .forEach(({ a }) => chosen.set(a.code, a));
  }
  return [...chosen.values()].slice(0, LIMITS.maxAirportsPerGroup);
}

interface LegChoice {
  leg: GroupLeg;
  cost: number; // flights + bags + ground
  bags: number;
  ground: number;
  penalties: Penalty[];
  flags: string[];
}

function evaluateLeg(group: TravellerGroup, flight: FlightOption, dest: Destination, bags: SearchRequest["bags"]): LegChoice {
  const people = group.adults + group.children;
  const airport = getAirport(flight.origin)!;
  const nights = daysBetween(flight.departDate, flight.returnDate);
  const ground = groundCost(group, airport, nights);
  const bag = bagCost(flight, bags, people);
  const { penalties, flags } = assessFlight(flight, dest, people, ground.extraHours);
  return {
    leg: {
      groupId: group.id,
      people,
      airport: airport.code,
      flight,
      groundNote: ground.note,
      extraTravelHours: Math.round(ground.extraHours * 10) / 10,
    },
    cost: flight.pricePerPerson * people + bag + ground.cost,
    bags: bag,
    ground: ground.cost,
    penalties,
    flags,
  };
}

const sum = (ps: Penalty[]) => ps.reduce((s, p) => s + p.amount, 0);

function buildTrip(
  id: string,
  dest: Destination,
  depart: string,
  ret: string,
  legs: LegChoice[],
  stay: StayOption,
  stayEstimated: boolean,
  extraFlags: string[],
): Trip {
  const nights = daysBetween(depart, ret);
  const people = legs.reduce((s, l) => s + l.leg.people, 0);
  const multi = legs.length > 1;
  const costs: CostLine[] = [];
  for (const l of legs) {
    const f = l.leg.flight;
    const who = multi ? ` (${l.leg.groupId})` : "";
    costs.push({
      label: `Flights ${f.origin}–${dest.code}, ${airlineName(f.airline)}, ${l.leg.people} × £${f.pricePerPerson}${who}`,
      amount: f.pricePerPerson * l.leg.people,
      estimated: false,
    });
    if (l.bags > 0) costs.push({ label: `Checked bags${who}`, amount: l.bags, estimated: true });
    costs.push({ label: `${l.leg.groundNote}${who}`, amount: Math.round(l.ground), estimated: true });
  }
  costs.push({
    label: stayEstimated
      ? `Accommodation, ${nights} night${nights > 1 ? "s" : ""} (typical price)`
      : `${stay.name}, ${nights} night${nights > 1 ? "s" : ""}`,
    amount: stay.total,
    estimated: stayEstimated,
  });
  costs.push({
    label: `Airport transfers in ${dest.name}`,
    amount: Math.round(dest.transferOneWayPP * 2 * people),
    estimated: true,
  });
  const total = Math.round(costs.reduce((s, c) => s + c.amount, 0));
  const penalties = [...legs.flatMap((l) => l.penalties), ...(stayEstimated ? [] : assessStay(stay, nights))];
  const flags = [...new Set([...legs.flatMap((l) => l.flags), ...extraFlags])];
  if (stay.freeCancellation) flags.push("Free cancellation");
  return {
    id,
    destination: dest.code,
    depart,
    return: ret,
    nights,
    legs: legs.map((l) => l.leg),
    stay,
    stayEstimated,
    costs,
    total,
    perPerson: Math.round(total / people),
    people,
    penalties,
    smartScore: total + sum(penalties),
    flags,
    why: "",
  };
}

interface Candidate {
  key: string;
  dest: Destination;
  depart: string;
  ret: string;
  variant: "smart" | "cheap";
  legs: LegChoice[];
}

export async function runSearch(
  req: SearchRequest,
  providers: { flights: FlightProvider; stays: StayProvider },
): Promise<SearchResponse> {
  const started = Date.now();
  const warnings: string[] = [];
  const plan = expandDates(req.dates);
  if (plan.pairs.length === 0) throw new SearchError("No dates match. Try a wider window.");
  if (plan.pairs.length > LIMITS.maxDatePairs)
    throw new SearchError("That's too many date combinations. Narrow the window or the range of nights.");
  const wantedPairs = new Set(plan.pairs.map((p) => `${p.depart}|${p.return}`));
  const destinations = destinationList(req);
  const adults = req.groups.reduce((s, g) => s + g.adults, 0);
  const children = req.groups.reduce((s, g) => s + g.children, 0);

  // 1. Flights for every group from every candidate airport.
  const perGroup = await Promise.all(
    req.groups.map(async (group) => {
      const airports = candidateAirports(group);
      const results = await mapLimit(airports, 4, async (origin) => {
        try {
          return await providers.flights.search({
            origin,
            destinations,
            departFrom: plan.departFrom,
            departTo: plan.departTo,
            minNights: plan.minNights,
            maxNights: plan.maxNights,
            adults: group.adults,
            children: group.children,
          });
        } catch (err) {
          console.error("flight search failed", origin.code, err);
          warnings.push(`Couldn't get flight prices from ${origin.name} right now.`);
          return [];
        }
      });
      // Best leg per destination and date pair, by smart score and by price.
      const best = new Map<string, { smart: LegChoice; cheap: LegChoice }>();
      for (const f of results.flat()) {
        if (!wantedPairs.has(`${f.departDate}|${f.returnDate}`)) continue;
        const dest = getDestination(f.destination);
        if (!dest) continue;
        const choice = evaluateLeg(group, f, dest, req.bags);
        const key = `${f.destination}|${f.departDate}|${f.returnDate}`;
        const cur = best.get(key);
        const smartOf = (c: LegChoice) => c.cost + sum(c.penalties);
        if (!cur) best.set(key, { smart: choice, cheap: choice });
        else {
          if (smartOf(choice) < smartOf(cur.smart)) cur.smart = choice;
          if (choice.cost < cur.cheap.cost) cur.cheap = choice;
        }
      }
      return best;
    }),
  );

  // 2. Keep dates and destinations every group can reach, with estimated stays.
  const candidates: Candidate[] = [];
  for (const key of perGroup[0].keys()) {
    if (!perGroup.every((m) => m.has(key))) continue;
    const [code, depart, ret] = key.split("|");
    const dest = getDestination(code)!;
    const smartLegs = perGroup.map((m) => m.get(key)!.smart);
    const cheapLegs = perGroup.map((m) => m.get(key)!.cheap);
    candidates.push({ key, dest, depart, ret, variant: "smart", legs: smartLegs });
    if (cheapLegs.some((l, i) => l.leg.flight.id !== smartLegs[i].leg.flight.id)) {
      candidates.push({ key, dest, depart, ret, variant: "cheap", legs: cheapLegs });
    }
  }
  if (candidates.length === 0) {
    return emptyResponse(providers, warnings, started, "No flights found for those dates and airports. Try nearby airports or more flexible dates.");
  }

  const estimate = (c: Candidate) => estimatedStay(c.dest, c.depart, c.ret, adults, children, req.stay);
  let trips = candidates.map((c) => buildTrip(`${c.key}|${c.variant}`, c.dest, c.depart, c.ret, c.legs, estimate(c), true, []));

  // 3. Real accommodation prices for the most promising date/destination combos.
  const shortlist = new Set<string>();
  const bySmart = [...trips].sort((a, b) => a.smartScore - b.smartScore);
  const byTotal = [...trips].sort((a, b) => a.total - b.total);
  const half = Math.ceil(LIMITS.stayLookups / 2);
  for (const list of [bySmart, byTotal]) {
    let added = 0;
    for (const t of list) {
      const k = `${t.destination}|${t.depart}|${t.return}`;
      if (shortlist.has(k)) continue;
      shortlist.add(k);
      if (++added >= half) break;
    }
  }
  let stayFailures = 0;
  const stays = new Map<string, StayOption[]>();
  await mapLimit([...shortlist], 4, async (k) => {
    const [code, checkin, checkout] = k.split("|");
    try {
      stays.set(k, await providers.stays.search({
        destination: getDestination(code)!,
        checkin,
        checkout,
        adults,
        children,
        prefs: req.stay,
      }));
    } catch (err) {
      console.error("stay search failed", k, err);
      stayFailures++;
    }
  });
  if (stayFailures > 0) warnings.push("Some accommodation prices couldn't be loaded, so typical prices are shown instead.");

  // Typical prices are only a model, so scale them by how real prices compared
  // for the same destination (or across all destinations if none were fetched).
  const ratios = new Map<string, number[]>();
  for (const [k, options] of stays) {
    if (options.length === 0) continue;
    const [code, checkin, checkout] = k.split("|");
    const est = estimatedStay(getDestination(code)!, checkin, checkout, adults, children, req.stay).total;
    const cheapest = Math.min(...options.map((o) => o.total));
    ratios.set(code, [...(ratios.get(code) ?? []), cheapest / est]);
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const allRatios = [...ratios.values()].flat();
  const globalRatio = allRatios.length > 0 ? median(allRatios) : 1;
  const calibrated = (c: Candidate): StayOption => {
    const base = estimate(c);
    const r = ratios.get(c.dest.code);
    return { ...base, total: Math.round(base.total * (r ? median(r) : globalRatio)) };
  };

  trips = candidates.map((c) => {
    const options = stays.get(c.key);
    const id = `${c.key}|${c.variant}`;
    if (!options) return buildTrip(id, c.dest, c.depart, c.ret, c.legs, calibrated(c), true, []);
    if (options.length === 0) {
      // Nothing available matching the filters: keep the trip but rank it lower.
      const trip = buildTrip(id, c.dest, c.depart, c.ret, c.legs, calibrated(c), true, ["No rooms matched your filters: typical price shown"]);
      const amount = Math.round(trip.stay.total * 0.25);
      trip.penalties.push({ label: "No matching rooms found for these dates", amount });
      trip.smartScore += amount;
      return trip;
    }
    const nights = daysBetween(c.depart, c.ret);
    const pick =
      c.variant === "cheap"
        ? options.reduce((a, b) => (b.total < a.total ? b : a))
        : options.reduce((a, b) => (b.total + sum(assessStay(b, nights)) < a.total + sum(assessStay(a, nights)) ? b : a));
    return buildTrip(id, c.dest, c.depart, c.ret, c.legs, pick, false, []);
  });

  // 4. Budget filter for "anywhere" searches.
  if (req.destination.mode === "anywhere") {
    const max = req.destination.maxPerPerson;
    const within = trips.filter((t) => t.perPerson <= max);
    if (within.length === 0) {
      const cheapest = Math.min(...trips.map((t) => t.perPerson));
      warnings.push(`Nothing under £${max} per person. The cheapest trip found is £${cheapest} per person.`);
    }
    trips = within;
  }

  for (const t of trips) t.why = explain(t, trips, req.groups[0]);

  const heatmap = buildHeatmap(trips, req, destinations);
  const destinationsSummary = summariseDestinations(trips);

  // Send the top trips for both sort orders, plus each heatmap cell's best trip.
  const keep = new Set<string>();
  [...trips].sort((a, b) => a.smartScore - b.smartScore).slice(0, 40).forEach((t) => keep.add(t.id));
  [...trips].sort((a, b) => a.total - b.total).slice(0, 40).forEach((t) => keep.add(t.id));
  if (heatmap) Object.values(heatmap.cells).forEach((c) => keep.add(c.tripId));
  destinationsSummary.forEach((d) => keep.add(d.bestTripId));

  return {
    trips: trips.filter((t) => keep.has(t.id)).sort((a, b) => a.smartScore - b.smartScore),
    heatmap,
    destinations: destinationsSummary,
    meta: {
      flightSource: providers.flights.label,
      staySource: providers.stays.label,
      sample: providers.flights.sample || providers.stays.sample,
      combinationsChecked: candidates.length,
      tookMs: Date.now() - started,
      warnings: [...new Set(warnings)],
    },
  };
}

function emptyResponse(
  providers: { flights: FlightProvider; stays: StayProvider },
  warnings: string[],
  started: number,
  message: string,
): SearchResponse {
  return {
    trips: [],
    heatmap: null,
    destinations: [],
    meta: {
      flightSource: providers.flights.label,
      staySource: providers.stays.label,
      sample: providers.flights.sample || providers.stays.sample,
      combinationsChecked: 0,
      tookMs: Date.now() - started,
      warnings: [...new Set([...warnings, message])],
    },
  };
}

/** "Flying Tue from Liverpool instead of Fri from Manchester saves £96". */
export function explain(trip: Trip, all: Trip[], group: TravellerGroup): string {
  const home = getAirport(group.homeAirport)!;
  const leg = trip.legs[0];
  const sameTrip = all.filter((t) => t.destination === trip.destination && t.nights === trip.nights);
  const fromHome = sameTrip.filter((t) => t.legs[0].airport === home.code);
  // The "default" most people would book: from home, leaving on a Friday.
  const pool = fromHome.length > 0 ? fromHome : sameTrip;
  const fridays = pool.filter((t) => dayOfWeek(t.depart) === 5);
  const baselinePool = (fridays.length > 0 ? fridays : pool).map((t) => t.total).sort((a, b) => a - b);
  const baseline = baselinePool[Math.floor(baselinePool.length / 2)];
  const saving = baseline - trip.total;
  const baselineDay = fridays.length > 0 ? "Fri" : null;

  if (saving >= 10) {
    const day = dayName(trip.depart);
    const parts: string[] = [];
    const airportChanged = leg.airport !== home.code;
    const dayChanged = baselineDay && day !== baselineDay;
    const name = getAirport(leg.airport)!.name;
    if (dayChanged && airportChanged) parts.push(`Flying ${day} from ${name} instead of ${baselineDay} from ${home.name}`);
    else if (dayChanged) parts.push(`Flying ${day} instead of ${baselineDay}`);
    else if (airportChanged) parts.push(`Flying from ${name} instead of ${home.name}`);
    else parts.push("Travelling on these dates");
    return `${parts[0]} saves £${Math.round(saving)} on a typical ${trip.nights}-night trip`;
  }
  const f = leg.flight;
  if (f.outStops + f.retStops === 0 && trip.penalties.length === 0) return "Direct flights at sensible times";
  const cheapest = Math.min(...sameTrip.map((t) => t.total));
  if (trip.total === cheapest) return `Cheapest ${trip.nights}-night option found`;
  return "Good balance of price and convenience";
}

function buildHeatmap(trips: Trip[], req: SearchRequest, destinations: Destination[]): Heatmap | null {
  if (trips.length === 0) return null;
  const cells: Record<string, HeatCell> = {};
  for (const t of trips) {
    const k = `${t.depart}|${t.nights}`;
    const cur = cells[k];
    if (!cur || t.total < cur.total) cells[k] = { total: t.total, perPerson: t.perPerson, estimated: t.stayEstimated, tripId: t.id };
  }
  const dates = [...new Set(trips.map((t) => t.depart))].sort();
  const nights = [...new Set(trips.map((t) => t.nights))].sort((a, b) => a - b);
  const title =
    req.destination.mode === "anywhere"
      ? "Cheapest destination for each date"
      : destinations.length === 1
        ? `Total trip price to ${destinations[0].name}`
        : "Cheapest of your destinations for each date";
  return { title, dates, nights, cells };
}

function summariseDestinations(trips: Trip[]): DestinationSummary[] {
  const best = new Map<string, Trip>();
  for (const t of trips) {
    const cur = best.get(t.destination);
    if (!cur || t.smartScore < cur.smartScore) best.set(t.destination, t);
  }
  return [...best.values()]
    .sort((a, b) => a.perPerson - b.perPerson)
    .map((t) => ({ code: t.destination, bestTripId: t.id, perPerson: t.perPerson, total: t.total }));
}
