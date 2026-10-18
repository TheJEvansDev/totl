// Turns Claude's plan into a search, keeping anything it left blank from the
// current form. Unknown codes are dropped here; parseRequest checks the rest.

import { getAirport, getDestination } from "../data/places";
import { addDays, isValidDate, todayUK } from "../dates";
import type { SearchRequest } from "../types";
import type { Plan } from "./plan";

export function planToRequest(plan: Plan, current: SearchRequest): SearchRequest {
  const g = current.groups[0];
  const home = getAirport(plan.homeAirport)?.code ?? g.homeAirport;
  const cities = [...new Set(plan.cities.map((c) => getDestination(c)?.code).filter((c): c is string => !!c))];
  const t = todayUK();
  const from = isValidDate(plan.from) ? plan.from : addDays(t, 14);
  const to = isValidDate(plan.to) ? plan.to : addDays(from, 30);
  return {
    groups: [
      {
        ...g,
        homeAirport: home,
        extraAirports: plan.extraAirports.map((c) => getAirport(c)?.code).filter((c): c is string => !!c && c !== home),
        nearbyHours: plan.nearbyHours,
        returnTo: getAirport(plan.returnTo)?.code ?? "",
        mixAirports: true,
        adults: Math.max(1, plan.adults),
        children: Math.max(0, plan.children),
      },
    ],
    destination:
      plan.destinationMode === "cities" && cities.length > 0
        ? { mode: "cities", cities }
        : { mode: "anywhere", maxPerPerson: plan.maxPerPerson > 0 ? plan.maxPerPerson : 400 },
    dates:
      plan.dateMode === "window"
        ? { mode: "window", from, to, minNights: Math.max(1, plan.minNights), maxNights: Math.max(plan.minNights, plan.maxNights), weekendsOnly: plan.weekendsOnly }
        : plan.dateMode === "flexible"
          ? { mode: "flexible", depart: from, return: to, flexDays: Math.min(3, Math.max(1, plan.flexDays)) }
          : { mode: "fixed", depart: from, return: to },
    bags: plan.checkedBag ? "checked" : "cabin",
    stay: { type: plan.stayType, minRating: plan.minRating || 7.5, maxCentreKm: plan.maxCentreKm || 4 },
  };
}
