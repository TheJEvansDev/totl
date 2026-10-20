import { addDays, todayUK } from "./dates";
import type { SearchRequest } from "./types";

export function defaultRequest(homeAirport = ""): SearchRequest {
  const t = todayUK();
  return {
    groups: [{ id: "you", homeAirport, extraAirports: [], nearbyHours: 0, mixAirports: true, returnTo: "", from: null, adults: 2, children: 0 }],
    destination: { mode: "anywhere", maxPerPerson: 300 },
    dates: { mode: "window", from: addDays(t, 14), to: addDays(t, 28), minNights: 2, maxNights: 3, weekendsOnly: true },
    bags: "cabin",
    stay: { type: "any", minRating: 7.5, maxCentreKm: 4 },
  };
}
