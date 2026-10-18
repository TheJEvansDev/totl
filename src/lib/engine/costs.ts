// Cost and penalty calculations for one group's flights and the stay.

import { PENALTIES as P } from "../config/penalties";
import type { Airport } from "../data/airports";
import { getAirport, haversineKm, travelHours } from "../data/airports";
import type { Destination } from "../data/destinations";
import { airlineName, checkedBagFee } from "../data/destinations";
import { localHour } from "../dates";
import type { BagOption, FlightOption, Penalty, StayOption, TravellerGroup } from "../types";

export interface Ground {
  cost: number;
  note: string;
  extraHours: number;
}

/** Estimated cost of getting from home to the airport and back. */
export function groundCost(group: TravellerGroup, airport: Airport, nights: number): Ground {
  const people = group.adults + group.children;
  const home = getAirport(group.homeAirport)!;
  const start = group.from ?? home;
  const days = nights + 1;
  const parking = airport.parkingPerDay * days;

  if (!group.from && airport.code === home.code) {
    const transit = airport.localReturnPP * people;
    return transit <= parking
      ? { cost: transit, note: `Train/bus to ${airport.name} and back`, extraHours: 0 }
      : { cost: parking, note: `Parking at ${airport.name}, ${days} days`, extraHours: 0 };
  }

  const hours = travelHours(start, airport);
  if (hours < 0.4) {
    const transit = airport.localReturnPP * people;
    return { cost: Math.min(transit, parking), note: transit <= parking ? `Local transport to ${airport.name}` : `Parking at ${airport.name}`, extraHours: 0 };
  }
  const roadKm = haversineKm(start, airport) * 1.25;
  const rail = (8 + roadKm * 0.22) * people;
  const car = roadKm * 2 * 0.17 + parking;
  // Hours beyond what the home airport would take count as extra travel.
  const homeHours = group.from ? travelHours(start, home) : 0;
  const extraHours = Math.max(0, hours - homeHours);
  return rail <= car
    ? { cost: rail, note: `Train to ${airport.name} (~${hours.toFixed(1)} hrs each way)`, extraHours }
    : { cost: car, note: `Drive to ${airport.name} (~${Math.round(roadKm)} km) + ${days} days parking`, extraHours };
}

export function bagCost(flight: FlightOption, bags: BagOption, people: number): number {
  if (bags === "cabin") return 0;
  return checkedBagFee(flight.airline) * 2 * people;
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

export function assessFlight(flight: FlightOption, dest: Destination, people: number, extraHours: number): FlightAssessment {
  const penalties: Penalty[] = [];
  const flags: string[] = [];
  const add = (label: string, amount: number) => amount > 0 && penalties.push({ label, amount: Math.round(amount) });

  const outDep = localHour(flight.outDepart, "Europe/London");
  const retDep = localHour(flight.retDepart, dest.tz);
  const outArr = localHour(flight.outArrive, dest.tz);
  const retArr = localHour(flight.retArrive, "Europe/London");

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
  if (extraHours > 0.1) add(`Extra ${extraHours.toFixed(1)} hrs travel each way to the airport`, extraHours * 2 * P.extraTravelHourPP * people);

  // Time lost at the destination on the first and last days.
  const lostArrive = late(outArr) ? 12 : Math.max(0, outArr - P.arriveByHour);
  const lostLeave = Math.max(0, P.leaveAfterHour - retDep);
  const lost = lostArrive + lostLeave;
  if (lost >= 1) add(`${Math.round(lost)} hrs less at the destination`, lost * P.lostDestinationHourPP * people);

  return { penalties, flags };
}

export function assessStay(stay: StayOption, nights: number): Penalty[] {
  const out: Penalty[] = [];
  if (stay.rating !== null && stay.rating < P.ratingReference) {
    out.push({ label: `Rated ${stay.rating}/10`, amount: Math.round((P.ratingReference - stay.rating) * P.perRatingPointPerNight * nights) });
  }
  if (stay.centreMins !== null && stay.centreMins > P.centreFreeMins) {
    out.push({
      label: `${stay.centreMins} mins from the centre`,
      amount: Math.round((stay.centreMins - P.centreFreeMins) * P.perCentreMinutePerNight * nights),
    });
  }
  return out.filter((p) => p.amount > 0);
}

export function describeAirline(flight: FlightOption): string {
  return airlineName(flight.airline);
}
