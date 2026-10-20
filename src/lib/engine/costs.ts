// Cost and penalty calculations for one group's flights and the stay.

import { PENALTIES as P } from "../config/penalties";
import type { Airport } from "../data/airports";
import { haversineKm, travelHours } from "../data/airports";
import { formatKm } from "../area";
import { dayTicketFor, getAirport } from "../data/places";
import type { Destination } from "../data/destinations";
import { airlineName, checkedBagFee } from "../data/destinations";
import { localHour } from "../dates";
import type { BagOption, FlightOption, Penalty, StayOption, TravellerGroup } from "../types";

export interface Ground {
  cost: number;
  note: string;
  /** Extra hours each way compared with using the home airport. */
  extraOutHours: number;
  extraBackHours: number;
}

export interface Access {
  hours: number;
  extraHours: number;
  /** One-way public transport cost for everyone. */
  oneWay: number;
  roadKm: number;
}

export function access(group: TravellerGroup, airport: Airport): Access {
  const people = group.adults + group.children;
  const home = getAirport(group.homeAirport)!;
  const start = group.from ?? home;
  const local = !group.from && airport.code === home.code;
  const hours = local ? 0 : travelHours(start, airport);
  if (local || hours < 0.4) return { hours: 0, extraHours: 0, oneWay: (airport.localReturnPP / 2) * people, roadKm: 0 };
  const roadKm = haversineKm(start, airport) * 1.25;
  // Hours beyond what the home airport would take count as extra travel.
  const homeHours = group.from ? travelHours(start, home) : 0;
  return { hours, extraHours: Math.max(0, hours - homeHours), oneWay: (8 + roadKm * 0.22) * 0.6 * people, roadKm };
}

/** Estimated cost of getting from home to the airport(s) and back. */
export function groundCost(group: TravellerGroup, outAirport: Airport, backAirport: Airport, nights: number): Ground {
  const people = group.adults + group.children;
  const days = nights + 1;
  const out = access(group, outAirport);

  if (outAirport.code !== backAirport.code) {
    // Different airports: you can't drive and park, so it's two one-way journeys.
    const back = access(group, backAirport);
    const outNote = out.hours === 0 ? `Bus/train to ${outAirport.name}` : `Train to ${outAirport.name} (~${out.hours.toFixed(1)} hrs)`;
    const backNote = back.hours === 0 ? `home from ${backAirport.name} by bus/train` : `home from ${backAirport.name} (~${back.hours.toFixed(1)} hrs)`;
    return { cost: out.oneWay + back.oneWay, note: `${outNote}, then ${backNote}`, extraOutHours: out.extraHours, extraBackHours: back.extraHours };
  }

  const parking = outAirport.parkingPerDay * days;
  const transit = out.oneWay * 2;
  if (out.hours === 0) {
    return transit <= parking
      ? { cost: transit, note: `Train/bus to ${outAirport.name} and back`, extraOutHours: 0, extraBackHours: 0 }
      : { cost: parking, note: `Parking at ${outAirport.name}, ${days} days`, extraOutHours: 0, extraBackHours: 0 };
  }
  const rail = (8 + out.roadKm * 0.22) * people;
  const car = out.roadKm * 2 * 0.17 + parking;
  return rail <= car
    ? { cost: rail, note: `Train to ${outAirport.name} and back (~${out.hours.toFixed(1)} hrs each way)`, extraOutHours: out.extraHours, extraBackHours: out.extraHours }
    : { cost: car, note: `Drive to ${outAirport.name} (~${Math.round(out.roadKm)} km) + ${days} days parking`, extraOutHours: out.extraHours, extraBackHours: out.extraHours };
}

export function bagCost(flight: FlightOption, bags: BagOption, people: number): number {
  if (bags === "cabin") return 0;
  return (checkedBagFee(flight.airline) + checkedBagFee(flight.returnAirline)) * people;
}

function fmtTime(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface FlightAssessment {
  penalties: Penalty[];
  flags: string[];
}

export function assessFlight(flight: FlightOption, dest: Destination, people: number, ground: Ground): FlightAssessment {
  const penalties: Penalty[] = [];
  const flags: string[] = [];
  const add = (label: string, amount: number) => amount > 0 && penalties.push({ label, amount: Math.round(amount) });

  const homeTz = getAirport(flight.origin)?.tz ?? "Europe/London";
  const backTz = getAirport(flight.returnAirport)?.tz ?? homeTz;
  const outDep = localHour(flight.outDepart, homeTz);
  const retDep = localHour(flight.retDepart, dest.tz);
  const outArr = localHour(flight.outArrive, dest.tz);
  const retArr = localHour(flight.retArrive, backTz);

  if (outDep < P.earlyDepartureBeforeHour) {
    add(`Early start (${fmtTime(outDep)} departure)`, P.earlyDeparturePP * people);
    flags.push(`Early start ${fmtTime(outDep)}`);
  }
  if (retDep < P.earlyDepartureBeforeHour) {
    add(`Early return flight (${fmtTime(retDep)})`, P.earlyDeparturePP * people);
    flags.push(`Early return ${fmtTime(retDep)}`);
  }
  const late = (h: number) => h >= P.lateArrivalFromHour || h < 4;
  if (late(outArr)) {
    add(`Late arrival (${fmtTime(outArr)})`, P.lateArrivalPP * people);
    flags.push(`Lands ${fmtTime(outArr)}`);
  }
  if (late(retArr)) {
    add(`Late home (${fmtTime(retArr)})`, P.lateArrivalPP * people);
    flags.push(`Home ${fmtTime(retArr)}`);
  }

  const stops = flight.outStops + flight.retStops;
  if (stops > 0) {
    add(`${stops} stop${stops > 1 ? "s" : ""}`, P.perStopPP * stops * people);
    add("Time waiting at connections", (flight.maxLayoverMins / 60) * stops * P.perLayoverHourPP * people);
    flags.push(`${stops} stop${stops > 1 ? "s" : ""}`);
  }
  if (flight.selfTransfer) {
    add("Self-transfer (separate tickets)", P.selfTransferPP * people);
    flags.push("Self-transfer: missed connection risk");
  }
  if (ground.extraOutHours > 0.1) add(`Extra ${ground.extraOutHours.toFixed(1)} hrs getting to the airport`, ground.extraOutHours * P.extraTravelHourPP * people);
  if (ground.extraBackHours > 0.1)
    add(`Extra ${ground.extraBackHours.toFixed(1)} hrs getting home`, ground.extraBackHours * P.extraTravelHourPP * P.returnTravelMultiplier * people);

  // Time lost at the destination on the first and last days.
  const lostArrive = late(outArr) ? 12 : Math.max(0, outArr - P.arriveByHour);
  const lostLeave = Math.max(0, P.leaveAfterHour - retDep);
  const lost = lostArrive + lostLeave;
  if (lost >= 1) add(`${Math.round(lost)} hrs less at the destination`, lost * P.lostDestinationHourPP * people);

  return { penalties, flags };
}

/** Day tickets into the centre for a stay too far out to walk, all travellers. */
/**
 * Coach or train between an out-of-town arrival airport (e.g. Girona for
 * Barcelona) and the city. A rough estimate from the distance.
 */
export function arrivalTransfer(km: number): { oneWayPP: number; hours: number } {
  return { oneWayPP: Math.round(4 + km * 0.12), hours: Math.round((km / 60 + 0.25) * 4) / 4 };
}

export function stayTransportCost(stay: StayOption, dest: Destination, nights: number, people: number): number {
  if (stay.centreKm === null || stay.centreKm <= P.walkableKm) return 0;
  return Math.round(dayTicketFor(dest) * people * nights);
}

export function assessStay(stay: StayOption, nights: number, people: number): Penalty[] {
  const out: Penalty[] = [];
  if (stay.rating !== null && stay.rating < P.ratingReference) {
    out.push({ label: `Rated ${stay.rating}/10`, amount: Math.round((P.ratingReference - stay.rating) * P.perRatingPointPerNight * nights) });
  }
  if (stay.centreMins !== null && stay.centreMins > P.centreFreeMins) {
    const hours = ((stay.centreMins - P.centreFreeMins) * 2 * nights) / 60;
    out.push({
      label: `${formatKm(stay.centreKm ?? 0)} from the centre (~${Math.round((stay.centreMins * 2 * nights) / 60)} hrs travelling over the trip, est.)`,
      amount: Math.round(hours * P.commuteHourPP * people),
    });
  }
  return out.filter((p) => p.amount > 0);
}

export function describeAirline(flight: FlightOption): string {
  return airlineName(flight.airline);
}
