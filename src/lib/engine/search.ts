// The total-cost engine. For every origin airport, destination and date pair,
// works out flights + bags + getting to the airport + accommodation + transfers,
// then ranks trips by smart score (cost plus usability penalties).
// Amounts are GBP. Text shown to people writes money as {£123} so the browser
// can show it in the chosen currency.

import { formatKm } from "../area";
import { LIMITS, PENALTIES as P } from "../config/penalties";
import type { Airport } from "../data/airports";
import { getAirport, getDestination, nearbyAirports } from "../data/places";
import type { Destination } from "../data/destinations";
import { airlineName } from "../data/destinations";
import { addDays, dayName, dayOfWeek, daysBetween, localHour } from "../dates";
import { estimatedStay } from "../providers/estimate";
import type { FlightProvider, StayProvider } from "../providers/types";
import type {
  CostLine,
  Compromise,
  Deal,
  DestinationSummary,
  FlightOption,
  MarketPrice,
  OneWayFlight,
  GroupLeg,
  Heatmap,
  HeatCell,
  Penalty,
  SearchRequest,
  SearchResponse,
  StayAlternative,
  StayOption,
  TravellerGroup,
  Trip,
} from "../types";
import { mapLimit } from "../util";
import { access, assessFlight, assessStay, bagCost, groundCost, stayTransportCost } from "./costs";
import type { DatePlan } from "./request";
import { marketByCode, marketsToCheck } from "../markets";
import { getRates } from "../rates";
import { placesForTrips } from "./places";
import { destinationList, expandDates } from "./request";

export class SearchError extends Error {}

/** Airports a group will consider: home, any extras, and nearby ones if asked. */
export function candidateAirports(group: TravellerGroup): Airport[] {
  const home = getAirport(group.homeAirport)!;
  const chosen = new Map<string, Airport>([[home.code, home]]);
  for (const code of [...group.extraAirports, group.returnTo].filter(Boolean)) {
    const a = getAirport(code);
    if (a) chosen.set(a.code, a);
  }
  if (group.nearbyHours > 0) {
    const start = group.from ?? home;
    nearbyAirports(start, home.countryCode, group.nearbyHours).forEach((a) => chosen.set(a.code, a));
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
  const ground = groundCost(group, airport, getAirport(flight.returnAirport)!, nights);
  const bag = bagCost(flight, bags, people);
  const { penalties, flags } = assessFlight(flight, dest, people, ground);
  if (flight.returnAirport !== flight.origin) flags.push(`Back into ${getAirport(flight.returnAirport)!.name}`);
  return {
    leg: {
      groupId: group.id,
      people,
      airport: airport.code,
      flight,
      groundNote: ground.note,
      extraTravelHours: Math.round((ground.extraOutHours + ground.extraBackHours) * 10) / 10,
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
  stayAlternatives: StayAlternative[] = [],
): Trip {
  const nights = daysBetween(depart, ret);
  const people = legs.reduce((s, l) => s + l.leg.people, 0);
  const multi = legs.length > 1;
  const plural = (n: number) => `${n} night${n > 1 ? "s" : ""}`;
  const costs: CostLine[] = [];
  for (const l of legs) {
    const f = l.leg.flight;
    const who = multi ? ` (${l.leg.groupId})` : "";
    const route =
      f.returnAirport !== f.origin
        ? `Flights ${f.origin}–${dest.code}–${f.returnAirport}, two one-way tickets`
        : f.returnBookingUrl
          ? `Flights ${f.origin}–${dest.code}, two one-way tickets`
          : `Flights ${f.origin}–${dest.code}, ${airlineName(f.airline)}`;
    costs.push({ label: `${route}, ${l.leg.people} × {£${f.pricePerPerson}}${who}`, amount: f.pricePerPerson * l.leg.people, estimated: false });
    if (l.bags > 0) costs.push({ label: `Checked bags${who}`, amount: l.bags, estimated: true });
    costs.push({ label: `${l.leg.groundNote}${who}`, amount: Math.round(l.ground), estimated: true });
  }
  if (stay.source !== "none") {
    costs.push({
      label: stayEstimated ? `Accommodation, ${plural(nights)} (typical price)` : `${stay.name}, ${plural(nights)}`,
      amount: stay.total,
      estimated: stayEstimated,
    });
  }
  const localTransport = stayTransportCost(stay, dest, nights, people);
  if (localTransport > 0) costs.push({ label: `Day tickets into the centre, ${plural(nights)}`, amount: localTransport, estimated: true });
  costs.push({
    label: `Airport transfers in ${dest.name}`,
    amount: Math.round(dest.transferOneWayPP * 2 * people),
    estimated: true,
  });
  const total = Math.round(costs.reduce((s, c) => s + c.amount, 0));
  const penalties = [...legs.flatMap((l) => l.penalties), ...(stayEstimated ? [] : assessStay(stay, nights, people))];
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
    stayAlternatives,
    airportOptions: [],
    marketPrices: [],
    deal: null,
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

/** Picks a stay and lists alternatives (central, cheapest, further out) with pros and cons. */
function chooseStay(
  options: StayOption[],
  dest: Destination,
  nights: number,
  people: number,
  maxCentreKm: number,
  variant: "smart" | "cheap",
): { pick: StayOption; alternatives: StayAlternative[]; flags: string[] } | null {
  if (options.length === 0) return null;
  const transport = (o: StayOption) => stayTransportCost(o, dest, nights, people);
  const cost = (o: StayOption) => o.total + transport(o);
  const value = (o: StayOption) => cost(o) + sum(assessStay(o, nights, people));
  const best = (list: StayOption[], f: (o: StayOption) => number) =>
    list.length === 0 ? null : list.reduce((a, b) => (f(b) < f(a) ? b : a));

  const within = options.filter((o) => o.centreKm === null || o.centreKm <= maxCentreKm);
  const flags: string[] = [];
  let pick = best(within, variant === "cheap" ? cost : value);
  if (!pick) {
    pick = best(options, variant === "cheap" ? cost : value)!;
    flags.push("Nothing available that close in: staying further out");
  }

  const candidates: [string, StayOption | null][] = [
    ["Central", best(options.filter((o) => o.centreKm !== null && o.centreKm <= 1.5), value)],
    ["Cheapest in your filters", best(within, cost)],
    ["Further out", best(options.filter((o) => o.centreKm !== null && o.centreKm > maxCentreKm), cost)],
  ];
  const seen = new Set([pick.id]);
  const describe = (label: string, o: StayOption): StayAlternative => {
    const net = cost(o) - cost(pick!);
    const pros: string[] = [];
    const cons: string[] = [];
    if (net <= -5) pros.push(`{£${Math.round(-net)}} cheaper, including transport`);
    if (net >= 5) cons.push(`{£${Math.round(net)}} more`);
    if (o.centreKm !== null && o.centreKm <= P.walkableKm) pros.push("Walkable to the centre, no transport costs");
    if (o.centreKm !== null && o.centreMins !== null && o.centreKm > P.walkableKm) {
      cons.push(`${formatKm(o.centreKm)} from the centre: about ${o.centreMins} mins each way by public transport (est.), ~${Math.round((o.centreMins * 2 * nights) / 60)} hrs over the trip`);
      if (transport(o) > 0) cons.push(`Day tickets add about {£${transport(o)}}`);
    }
    if (o.centreKm !== null && o.centreKm > 4) cons.push("Outskirts: check the map and how late public transport runs before booking");
    if (o.rating !== null && o.rating >= 8.5) pros.push(`Highly rated (${o.rating}/10)`);
    if (o.rating !== null && o.rating < 7.5) cons.push(`Lower rated (${o.rating}/10)`);
    if (o.freeCancellation === true) pros.push("Free cancellation");
    if (o.freeCancellation === false) cons.push("Non-refundable");
    return { label, stay: o, transportCost: transport(o), netVsChosen: Math.round(net), pros, cons };
  };
  const alternatives = [describe("Chosen", pick)];
  for (const [label, o] of candidates) {
    if (!o || seen.has(o.id)) continue;
    seen.add(o.id);
    alternatives.push(describe(label, o));
  }
  const further = alternatives.find((a) => a.label === "Further out");
  if (further && further.netVsChosen <= -30) flags.push(`Stay further out, save {£${-further.netVsChosen}}`);
  return { pick, alternatives, flags };
}

interface Candidate {
  combos: Map<string, LegChoice>;
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
  const routePrices = new Map<string, number[]>();
  const perGroup = await Promise.all(
    req.groups.map(async (group, gi) => {
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
      let flights = results.flat();
      if (group.mixAirports && airports.length > 1) {
        try {
          flights = flights.concat(await mixedAirportTrips(group, airports, destinations, plan, wantedPairs, providers.flights, flights));
        } catch (err) {
          console.error("mixed airport search failed", err);
          warnings.push("Couldn't check flying home to a different airport right now.");
        }
      }
      // Best leg per destination and date pair, by smart score and by price.
      const best = new Map<string, { smart: LegChoice; cheap: LegChoice; combos: Map<string, LegChoice> }>();
      for (const f of flights) {
        if (!wantedPairs.has(`${f.departDate}|${f.returnDate}`)) continue;
        if (group.returnTo && f.returnAirport !== group.returnTo) continue;
        // Typical fares per destination, used to spot deals.
        if (gi === 0) routePrices.set(f.destination, [...(routePrices.get(f.destination) ?? []), f.pricePerPerson]);
        const dest = getDestination(f.destination);
        if (!dest) continue;
        const choice = evaluateLeg(group, f, dest, req.bags);
        const key = `${f.destination}|${f.departDate}|${f.returnDate}`;
        const cur = best.get(key);
        const smartOf = (c: LegChoice) => c.cost + sum(c.penalties);
        const combo = `${f.origin}>${f.returnAirport}`;
        if (!cur) best.set(key, { smart: choice, cheap: choice, combos: new Map([[combo, choice]]) });
        else {
          if (smartOf(choice) < smartOf(cur.smart)) cur.smart = choice;
          if (choice.cost < cur.cheap.cost) cur.cheap = choice;
          const c = cur.combos.get(combo);
          if (!c || smartOf(choice) < smartOf(c)) cur.combos.set(combo, choice);
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
    const combos = perGroup[0].get(key)!.combos;
    candidates.push({ key, dest, depart, ret, variant: "smart", legs: smartLegs, combos });
    if (cheapLegs.some((l, i) => l.leg.flight.id !== smartLegs[i].leg.flight.id)) {
      candidates.push({ key, dest, depart, ret, variant: "cheap", legs: cheapLegs, combos });
    }
  }
  if (candidates.length === 0) {
    return emptyResponse(providers, warnings, started, "No flights found for those dates and airports. Try nearby airports or more flexible dates.");
  }

  const estimate = (c: Candidate) => estimatedStay(c.dest, c.depart, c.ret, adults, children, req.stay);
  let trips = candidates.map((c) => buildTrip(`${c.key}|${c.variant}`, c.dest, c.depart, c.ret, c.legs, estimate(c), true, []));

  // 3. Real accommodation prices for the most promising date/destination combos
  //    (skipped when they're staying with friends or have already booked).
  const ownStay = req.stay.type === "none";
  const shortlist = new Set<string>();
  const bySmart = [...trips].sort((a, b) => a.smartScore - b.smartScore);
  const byTotal = [...trips].sort((a, b) => a.total - b.total);
  const half = Math.ceil(LIMITS.stayLookups / 2);
  for (const list of ownStay ? [] : [bySmart, byTotal]) {
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
        // Look further out than asked, so cheaper options can be compared.
        prefs: { ...req.stay, maxCentreKm: Math.max(req.stay.maxCentreKm, LIMITS.stayCompareKm) },
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
  for (const [k, all] of stays) {
    const options = all.filter((o) => o.centreKm === null || o.centreKm <= req.stay.maxCentreKm);
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
    if (ownStay) return buildTrip(id, c.dest, c.depart, c.ret, c.legs, estimate(c), false, []);
    if (!options) return buildTrip(id, c.dest, c.depart, c.ret, c.legs, calibrated(c), true, []);
    if (options.length === 0) {
      // Nothing available matching the filters: keep the trip but rank it lower.
      const trip = buildTrip(id, c.dest, c.depart, c.ret, c.legs, calibrated(c), true, ["No rooms matched your filters: typical price shown"]);
      const amount = Math.round(trip.stay.total * 0.25);
      trip.penalties.push({ label: "No matching rooms found for these dates", amount });
      trip.smartScore += amount;
      return trip;
    }
    const people = adults + children;
    const chosen = chooseStay(options, c.dest, daysBetween(c.depart, c.ret), people, req.stay.maxCentreKm, c.variant)!;
    return buildTrip(id, c.dest, c.depart, c.ret, c.legs, chosen.pick, false, chosen.flags, chosen.alternatives);
  });

  // Other airport pairs for the same trip, so you can see the trade-offs.
  const byId = new Map(candidates.map((c) => [`${c.key}|${c.variant}`, c]));
  for (const t of trips) {
    const c = byId.get(t.id);
    const chosen = c?.legs[0];
    if (!c || !chosen) continue;
    t.airportOptions = [...c.combos.values()]
      .sort((a, b) => a.cost + sum(a.penalties) - (b.cost + sum(b.penalties)))
      .slice(0, 6)
      .map((l) => ({
        out: l.leg.flight.origin,
        back: l.leg.flight.returnAirport,
        pricePerPerson: l.leg.flight.pricePerPerson,
        totalDelta: Math.round(l.cost - chosen.cost),
        groundNote: l.leg.groundNote,
        extraHours: l.leg.extraTravelHours,
        flags: l.flags.filter((f) => !f.startsWith("Back into")),
        bookingUrl: l.leg.flight.bookingUrl,
        returnBookingUrl: l.leg.flight.returnBookingUrl,
      }));
  }

  // Flag flights well below the typical price for the route in this search.
  const typical = new Map<string, number>();
  for (const [code, prices] of routePrices) if (prices.length >= P.dealMinSamples) typical.set(code, median(prices));
  for (const t of trips) {
    const usual = typical.get(t.destination);
    if (!usual) continue;
    const pct = 1 - t.legs[0].flight.pricePerPerson / usual;
    const deal: Deal | null =
      pct >= P.errorFarePctBelow ? { kind: "error", pctBelow: Math.round(pct * 100) } : pct >= P.dealPctBelow ? { kind: "deal", pctBelow: Math.round(pct * 100) } : null;
    if (!deal) continue;
    t.deal = deal;
    t.flags.unshift(deal.kind === "error" ? `Possible error fare: ${deal.pctBelow}% below typical` : `Deal: flights ${deal.pctBelow}% below typical`);
  }

  // 4. Budget filter for "anywhere" searches.
  if (req.destination.mode === "anywhere") {
    const max = req.destination.maxPerPerson;
    const within = trips.filter((t) => t.perPerson <= max);
    if (within.length === 0) {
      const cheapest = Math.min(...trips.map((t) => t.perPerson));
      warnings.push(`Nothing under {£${max}} per person. The cheapest trip found is {£${cheapest}} per person.`);
    }
    trips = within;
  }

  await checkBookingCountries(trips, req, providers.flights, warnings);

  for (const t of trips) t.why = explain(t, trips, req.groups[0]);

  const heatmap = buildHeatmap(trips, req, destinations);
  const destinationsSummary = summariseDestinations(trips);

  // Send the top trips for both sort orders, plus each heatmap cell's best trip.
  const keep = new Set<string>();
  [...trips].sort((a, b) => a.smartScore - b.smartScore).slice(0, 40).forEach((t) => keep.add(t.id));
  [...trips].sort((a, b) => a.total - b.total).slice(0, 40).forEach((t) => keep.add(t.id));
  if (heatmap) Object.values(heatmap.cells).forEach((c) => keep.add(c.tripId));
  destinationsSummary.forEach((d) => keep.add(d.bestTripId));
  const compromises = findCompromises(trips, req);
  compromises.forEach((c) => c.tripId && keep.add(c.tripId));

  const sent = trips.filter((t) => keep.has(t.id)).sort((a, b) => a.smartScore - b.smartScore);
  return {
    trips: sent,
    places: placesForTrips(sent, req),
    compromises,
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

/**
 * "Out from one airport, back into another" trips built from one-way fares,
 * e.g. out from Stansted when it's cheap, home into Bristol to save the long
 * trip back. Only checks the most promising destinations to keep API use down.
 */
async function mixedAirportTrips(
  group: TravellerGroup,
  airports: Airport[],
  destinations: Destination[],
  plan: DatePlan,
  wantedPairs: Set<string>,
  provider: FlightProvider,
  roundTrips: FlightOption[],
): Promise<FlightOption[]> {
  const people = group.adults + group.children;
  const cheapest = new Map<string, number>();
  for (const f of roundTrips) cheapest.set(f.destination, Math.min(cheapest.get(f.destination) ?? Infinity, f.pricePerPerson));
  const dests =
    destinations.length <= LIMITS.mixedAirportDestinations
      ? destinations
      : [...cheapest.entries()]
          .sort((a, b) => a[1] - b[1])
          .slice(0, LIMITS.mixedAirportDestinations)
          .map(([code]) => getDestination(code)!);
  if (dests.length === 0) return [];

  const fetchAll = (direction: "out" | "back", dateFrom: string, dateTo: string) =>
    mapLimit(airports, 4, (airport) =>
      provider.searchOneWay({ direction, airport, destinations: dests, dateFrom, dateTo, adults: group.adults, children: group.children }),
    ).then((r) => r.flat());
  const [outs, backs] = await Promise.all([
    fetchAll("out", plan.departFrom, plan.departTo),
    fetchAll("back", addDays(plan.departFrom, plan.minNights), addDays(plan.departTo, plan.maxNights)),
  ]);

  // Rough score per one-way flight so only the best few get combined.
  const score = (f: OneWayFlight, direction: "out" | "back") => {
    const dest = getDestination(direction === "out" ? f.to : f.from)!;
    const airport = getAirport(direction === "out" ? f.from : f.to)!;
    const a = access(group, airport);
    const [depTz, arrTz] = direction === "out" ? [airport.tz, dest.tz] : [dest.tz, airport.tz];
    const arr = localHour(f.arrive, arrTz);
    let s = f.price * people + a.oneWay + a.extraHours * P.extraTravelHourPP * people * (direction === "back" ? P.returnTravelMultiplier : 1);
    if (localHour(f.depart, depTz) < P.earlyDepartureBeforeHour) s += P.earlyDeparturePP * people;
    if (arr >= P.lateArrivalFromHour || arr < 4) s += P.lateArrivalPP * people;
    return s + f.stops * P.perStopPP * people;
  };
  const topByKey = (list: OneWayFlight[], direction: "out" | "back") => {
    const map = new Map<string, { f: OneWayFlight; s: number }[]>();
    for (const f of list) {
      const key = `${direction === "out" ? f.to : f.from}|${f.date}`;
      const arr = map.get(key) ?? [];
      arr.push({ f, s: score(f, direction) });
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.s - b.s).splice(3);
    return map;
  };
  const outMap = topByKey(outs, "out");
  const backMap = topByKey(backs, "back");

  const trips: FlightOption[] = [];
  for (const pair of wantedPairs) {
    const [depart, ret] = pair.split("|");
    for (const dest of dests) {
      for (const { f: o } of outMap.get(`${dest.code}|${depart}`) ?? []) {
        for (const { f: b } of backMap.get(`${dest.code}|${ret}`) ?? []) {
          trips.push({
            id: `mix-${o.id}-${b.id}`,
            source: o.source,
            origin: o.from,
            returnAirport: b.to,
            destination: dest.code,
            destinationAirport: dest.code,
            airline: o.airline,
            returnAirline: b.airline,
            departDate: depart,
            returnDate: ret,
            outDepart: o.depart,
            outArrive: o.arrive,
            outStops: o.stops,
            retDepart: b.depart,
            retArrive: b.arrive,
            retStops: b.stops,
            maxLayoverMins: Math.round(Math.max(o.layoverMins, b.layoverMins)),
            selfTransfer: false,
            pricePerPerson: o.price + b.price,
            bookingUrl: o.bookingUrl,
            returnBookingUrl: b.bookingUrl,
            seenHoursAgo: o.seenHoursAgo !== null && b.seenHoursAgo !== null ? Math.max(o.seenHoursAgo, b.seenHoursAgo) : null,
          });
        }
      }
    }
  }
  return trips;
}

/**
 * For the most promising trips, price the same flights on other countries'
 * booking sites (e.g. the Turkish site in lira). Doesn't change totals, since
 * it needs the traveller to book that way; it's shown as an option.
 */
async function checkBookingCountries(trips: Trip[], req: SearchRequest, provider: FlightProvider, warnings: string[]): Promise<void> {
  const home = getAirport(req.groups[0].homeAirport)!;
  // Two separate one-way tickets are compared leg by leg elsewhere; check return tickets only.
  const eligible = trips.filter((t) => t.legs.length === 1 && !t.legs[0].flight.returnBookingUrl);
  const picked = new Map<string, Trip>();
  for (const list of [[...eligible].sort((a, b) => a.smartScore - b.smartScore), [...eligible].sort((a, b) => a.total - b.total)]) {
    for (const t of list.slice(0, LIMITS.marketChecks)) picked.set(t.legs[0].flight.id, t);
  }
  if (picked.size === 0) return;
  const { rates } = await getRates();
  const quotes = new Map<string, MarketPrice[]>();
  let failed = 0;
  await mapLimit([...picked.values()], 3, async (t) => {
    const f = t.legs[0].flight;
    const dest = getDestination(t.destination)!;
    try {
      const found = await provider.checkMarkets(f, home, dest, marketsToCheck(home.countryCode, dest.countryCode), req.groups[0].adults, req.groups[0].children);
      const people = t.legs[0].people;
      quotes.set(
        f.id,
        found
          .map((q) => {
            const m = marketByCode(q.market)!;
            return {
              market: m.code,
              countryName: m.countryName,
              currency: m.currency,
              localAmount: Math.round(q.pricePerPerson * (rates[m.currency] ?? 1)),
              pricePerPerson: q.pricePerPerson,
              saving: Math.round((f.pricePerPerson - q.pricePerPerson) * people),
              bookingUrl: q.bookingUrl,
              seenHoursAgo: q.seenHoursAgo,
            };
          })
          .sort((a, b) => a.pricePerPerson - b.pricePerPerson),
      );
    } catch (err) {
      console.error("booking country check failed", err);
      failed++;
    }
  });
  if (failed > 0) warnings.push("Couldn't compare prices on other countries' booking sites for every trip.");
  for (const t of trips) {
    const found = quotes.get(t.legs[0].flight.id);
    if (!found) continue;
    t.marketPrices = found;
    const best = found[0];
    const flightCost = t.legs[0].flight.pricePerPerson * t.legs[0].people;
    if (best && best.saving >= Math.max(P.marketMinSaving, flightCost * P.marketMinSavingPct)) {
      t.flags.push(`Cheaper on the ${best.countryName} site: save {£${best.saving}}`);
    }
  }
}

function emptyResponse(
  providers: { flights: FlightProvider; stays: StayProvider },
  warnings: string[],
  started: number,
  message: string,
): SearchResponse {
  return {
    trips: [],
    places: {},
    compromises: [],
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
    const out = getAirport(leg.airport)!.name;
    const back = getAirport(leg.flight.returnAirport)!.name;
    const mixed = out !== back;
    const dayChanged = baselineDay !== null && day !== baselineDay;
    const airportChanged = mixed || leg.airport !== home.code;
    const amount = `{£${Math.round(saving)}}`;
    if (!dayChanged && !airportChanged) return `Travelling on these dates saves ${amount} on a typical ${trip.nights}-night trip`;
    const route = mixed ? ` out of ${out}, back into ${back}` : airportChanged ? ` from ${out}` : "";
    const instead = `${dayChanged ? `a ${baselineDay} ` : "a "}return from ${home.name}`;
    return `Flying${dayChanged ? ` ${day}` : ""}${route} instead of ${instead} saves ${amount}`;
  }
  const f = leg.flight;
  if (f.outStops + f.retStops === 0 && trip.penalties.length === 0) return "Direct flights at sensible times";
  const cheapest = Math.min(...sameTrip.map((t) => t.total));
  if (trip.total === cheapest) return `Cheapest ${trip.nights}-night option found`;
  return "Good balance of price and convenience";
}

/**
 * Ways to save compared with the top "best value" trip, each changing one
 * thing: dates, length, airport, where you stay, bags or destination.
 */
export function findCompromises(trips: Trip[], req: SearchRequest): Compromise[] {
  if (trips.length === 0) return [];
  const top = trips.reduce((a, b) => (b.smartScore < a.smartScore ? b : a));
  const out: Compromise[] = [];
  const cheapest = (list: Trip[]) => (list.length === 0 ? null : list.reduce((a, b) => (b.total < a.total ? b : a)));
  const destName = getDestination(top.destination)!.name;

  const otherDates = cheapest(trips.filter((t) => t.destination === top.destination && t.nights === top.nights && t.depart !== top.depart));
  if (otherDates)
    out.push({
      label: `Leave ${dayName(otherDates.depart)} ${otherDates.depart.slice(8)}/${otherDates.depart.slice(5, 7)} instead`,
      detail: `Same ${top.nights}-night trip to ${destName}, different dates`,
      saving: top.total - otherDates.total,
      tripId: otherDates.id,
    });

  const shorter = cheapest(trips.filter((t) => t.destination === top.destination && t.nights === top.nights - 1 && t.depart === top.depart));
  if (shorter)
    out.push({ label: "Go for one night less", detail: `${shorter.nights} nights in ${destName}, same departure`, saving: top.total - shorter.total, tripId: shorter.id });

  const airport = top.airportOptions.filter((o) => o.totalDelta < 0).sort((a, b) => a.totalDelta - b.totalDelta)[0];
  if (airport) {
    const name = (c: string) => getAirport(c)?.name ?? c;
    out.push({
      label: airport.out === airport.back ? `Fly from ${name(airport.out)}` : `Fly out of ${name(airport.out)}, home into ${name(airport.back)}`,
      detail: airport.extraHours > 0 ? `About ${airport.extraHours} hrs more travelling in total` : "Same dates and stay",
      saving: -airport.totalDelta,
      tripId: null,
    });
  }

  const further = top.stayAlternatives.find((a) => a.label === "Further out" && a.netVsChosen < 0);
  if (further)
    out.push({
      label: "Stay further out",
      detail: `${further.stay.name}, ${formatKm(further.stay.centreKm ?? 0)} from the centre (transport included)`,
      saving: -further.netVsChosen,
      tripId: null,
    });

  if (req.bags === "checked") {
    const bags = top.costs.find((c) => c.label.startsWith("Checked bags"));
    if (bags) out.push({ label: "Travel with cabin bags only", detail: "No checked bags on either flight", saving: bags.amount, tripId: null });
  }

  const elsewhere = cheapest(trips.filter((t) => t.destination !== top.destination && t.nights === top.nights));
  if (elsewhere)
    out.push({
      label: `Go to ${getDestination(elsewhere.destination)!.name} instead`,
      detail: `${elsewhere.nights} nights, leaving ${dayName(elsewhere.depart)}`,
      saving: top.total - elsewhere.total,
      tripId: elsewhere.id,
    });

  return out
    .filter((c) => c.saving >= 15)
    .map((c) => ({ ...c, saving: Math.round(c.saving) }))
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 5);
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
