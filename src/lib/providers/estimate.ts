// Quick accommodation estimate used for the heatmap and before real prices
// are fetched. Same seasonal model as the sample data, without the noise.

import type { Destination } from "../data/destinations";
import { addDays, dayOfWeek, daysBetween } from "../dates";
import { hotelSearchUrl } from "../links";
import type { StayOption, StayPrefs } from "../types";
import { roomsNeeded } from "./types";

const CITY_SEASON = [0.8, 0.8, 0.9, 1.0, 1.05, 1.1, 1.15, 1.15, 1.05, 1.0, 0.85, 1.05];
const SUN_SEASON = [0.7, 0.72, 0.8, 0.95, 1.05, 1.3, 1.5, 1.55, 1.2, 0.95, 0.75, 0.85];

/** Multiplier for one night, by day of week and month. */
export function nightFactor(dest: Destination, night: string): number {
  const dow = dayOfWeek(night);
  const month = Number(night.slice(5, 7)) - 1;
  const weekend = dow === 5 || dow === 6;
  const season = dest.kind === "sun" ? SUN_SEASON[month] : CITY_SEASON[month];
  const weekendUplift = dest.kind === "city" ? 1.3 : 1.08;
  return season * (weekend ? weekendUplift : 1);
}

/** Price of a typical acceptable room (or apartment) for the stay. */
export function estimateStayTotal(
  dest: Destination,
  checkin: string,
  checkout: string,
  adults: number,
  children: number,
  prefs: StayPrefs,
): number {
  const nights = daysBetween(checkin, checkout);
  let sum = 0;
  for (let i = 0; i < nights; i++) sum += nightFactor(dest, addDays(checkin, i));
  // Lower rating and longer distance thresholds open up cheaper options.
  const ratingFactor = 1 - Math.max(0, 7.5 - prefs.minRating) * 0.06;
  const distanceFactor = prefs.maxCentreKm > 4 ? 0.92 : prefs.maxCentreKm < 2 ? 1.12 : 1;
  const people = adults + children;
  const units =
    prefs.type === "apartment"
      ? 1 + Math.max(0, people - 2) * 0.18
      : roomsNeeded(adults) * (children > 0 ? 1.1 : 1);
  return dest.hotelNightly * sum * ratingFactor * distanceFactor * units;
}

export function estimatedStay(
  dest: Destination,
  checkin: string,
  checkout: string,
  adults: number,
  children: number,
  prefs: StayPrefs,
): StayOption {
  if (prefs.type === "none") {
    return {
      id: "none",
      source: "none",
      name: "Your own arrangements",
      type: "hotel",
      rating: null,
      centreKm: null,
      centreMins: null,
      lat: null,
      lon: null,
      total: 0,
      freeCancellation: null,
      bookingUrl: "",
    };
  }
  return {
    id: `est-${dest.code}-${checkin}-${checkout}`,
    source: "estimate",
    name: `Typical ${prefs.minRating}+ rated ${prefs.type === "apartment" ? "apartment" : "hotel"} in ${dest.name}`,
    type: prefs.type === "apartment" ? "apartment" : "hotel",
    rating: null,
    centreKm: null,
    centreMins: null,
    lat: null,
    lon: null,
    total: Math.round(estimateStayTotal(dest, checkin, checkout, adults, children, prefs)),
    freeCancellation: null,
    bookingUrl: hotelSearchUrl(`${dest.name}, ${dest.country}`, checkin, checkout, adults, children, roomsNeeded(adults)),
  };
}
