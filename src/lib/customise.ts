// Swapping one part of a trip (the flights or the place to stay) for an
// alternative, without a new search. Works on the cost lines and penalties the
// server tagged as "flight" or "stay".

import type { AirportOption, CostLine, Penalty, StayAlternative, Trip } from "./types";

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

/** Flags that describe the stay rather than the flights. */
const STAY_FLAG = /^(Free cancellation|Stay further out|No rooms matched|Nothing available that close)/;

function retotal(t: Trip, costs: CostLine[], penalties: Penalty[]): Trip {
  const total = Math.round(sum(costs));
  return { ...t, costs, penalties, total, perPerson: Math.round(total / t.people), smartScore: total + sum(penalties) };
}

/** The current flights' share of the cost (flights, bags, getting to the airports). */
export function flightCost(t: Trip): number {
  return sum(t.costs.filter((c) => c.kind === "flight"));
}

/** The current stay's share of the cost (accommodation and local transport). */
export function stayCost(t: Trip): number {
  return sum(t.costs.filter((c) => c.kind === "stay"));
}

export function optionCost(o: AirportOption | StayAlternative): number {
  return sum(o.costs);
}

export function swapFlights(t: Trip, o: AirportOption): Trip {
  if (t.legs.length !== 1 || o.leg.flight.id === t.legs[0].flight.id) return t;
  const costs = [...o.costs, ...t.costs.filter((c) => c.kind !== "flight")];
  const penalties = [...o.penalties, ...t.penalties.filter((p) => p.kind !== "flight")];
  return retotal(
    {
      ...t,
      legs: [o.leg],
      flags: [...o.flags, ...t.flags.filter((f) => STAY_FLAG.test(f))],
      // Deals and other-country prices were for the old flights.
      deal: null,
      marketPrices: [],
    },
    costs,
    penalties,
  );
}

export function swapStay(t: Trip, a: StayAlternative): Trip {
  if (a.stay.id === t.stay.id) return t;
  const flights = t.costs.filter((c) => c.kind === "flight");
  const rest = t.costs.filter((c) => c.kind !== "flight" && c.kind !== "stay");
  const penalties = [...t.penalties.filter((p) => p.kind !== "stay"), ...a.penalties];
  return retotal(
    {
      ...t,
      stay: a.stay,
      stayEstimated: false,
      flags: [...t.flags.filter((f) => !STAY_FLAG.test(f)), ...(a.stay.freeCancellation ? ["Free cancellation"] : [])],
    },
    [...flights, ...a.costs, ...rest],
    penalties,
  );
}
