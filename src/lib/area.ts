// Plain-English labels for how far a stay is from the centre. Distance is
// measured (straight line); travel time is only an estimate, so distance leads.

export interface Area {
  label: string;
  tone: "good" | "neutral" | "warn";
}

export function areaFor(km: number): Area {
  if (km <= 1.5) return { label: "In the centre", tone: "good" };
  if (km <= 4) return { label: "Near the centre", tone: "good" };
  if (km <= 7) return { label: "Outskirts", tone: "neutral" };
  return { label: "Far from the centre", tone: "warn" };
}

/** Rough public transport time from a straight-line distance. Always shown as an estimate. */
export function estimatedMinutes(km: number): number {
  return Math.round(4 + km * 4.5);
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : `${km.toFixed(1)} km`;
}

/** "Near the centre: 2.4 km, about 15 mins by public transport (est.)" */
export function describeDistance(km: number): string {
  if (km <= 1.5) return `${areaFor(km).label}: ${formatKm(km)}, walkable`;
  return `${areaFor(km).label}: ${formatKm(km)}, about ${estimatedMinutes(km)} mins by public transport (est.)`;
}

/** Choices offered in the search form. */
export const DISTANCE_CHOICES = [
  { km: 1.5, label: "In the centre", hint: "within 1.5 km" },
  { km: 4, label: "Near the centre", hint: "within 4 km" },
  { km: 7, label: "Outskirts are fine", hint: "within 7 km" },
];
