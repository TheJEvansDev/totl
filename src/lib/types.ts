// Shared types for the search request, provider results and trips.

export type BagOption = "cabin" | "checked";
export type StayType = "hotel" | "apartment" | "any";
export type SortMode = "smart" | "cheapest";

/**
 * A set of people travelling together from the same place.
 * Phase 1 uses one group. Group trip mode (Phase 3) adds more groups
 * from different origins, which the engine already handles.
 */
export interface TravellerGroup {
  id: string;
  homeAirport: string; // IATA airport code, e.g. "MAN"
  extraAirports: string[];
  /** Include airports within this many hours by road/rail. 0 = off. */
  nearbyHours: number;
  /** Optional starting point (e.g. from geolocation). Defaults to the home airport. */
  from?: { lat: number; lon: number } | null;
  adults: number;
  children: number;
}

export type DestinationQuery =
  | { mode: "cities"; cities: string[] }
  | { mode: "anywhere"; maxPerPerson: number };

export type DateQuery =
  | { mode: "fixed"; depart: string; return: string }
  | { mode: "flexible"; depart: string; return: string; flexDays: number }
  | {
      mode: "window";
      from: string;
      to: string;
      minNights: number;
      maxNights: number;
      weekendsOnly: boolean;
    };

export interface StayPrefs {
  type: StayType;
  minRating: number; // 0-10
  maxCentreMins: number;
}

export interface SearchRequest {
  groups: TravellerGroup[];
  destination: DestinationQuery;
  dates: DateQuery;
  bags: BagOption;
  stay: StayPrefs;
}

export interface FlightOption {
  id: string;
  source: "sample" | "travelpayouts";
  origin: string; // airport code
  destination: string; // city code
  destinationAirport: string;
  airline: string; // IATA carrier code
  departDate: string; // YYYY-MM-DD (local, origin)
  returnDate: string; // YYYY-MM-DD (local, destination)
  outDepart: string; // ISO UTC
  outArrive: string;
  outStops: number;
  retDepart: string;
  retArrive: string;
  retStops: number;
  /** Longest single layover across both directions, in minutes. */
  maxLayoverMins: number;
  selfTransfer: boolean;
  pricePerPerson: number; // GBP, return, before bags
  bookingUrl: string;
  /** How old the cached price is, if known. */
  seenHoursAgo: number | null;
}

export interface StayOption {
  id: string;
  source: "sample" | "liteapi" | "estimate";
  name: string;
  type: "hotel" | "apartment";
  rating: number | null; // 0-10
  centreMins: number | null;
  total: number; // GBP for the whole stay
  freeCancellation: boolean | null;
  bookingUrl: string;
}

export interface CostLine {
  label: string;
  amount: number;
  estimated: boolean;
}

export interface Penalty {
  label: string;
  amount: number;
}

export interface GroupLeg {
  groupId: string;
  people: number;
  airport: string;
  flight: FlightOption;
  groundNote: string;
  extraTravelHours: number;
}

export interface Trip {
  id: string;
  destination: string; // city code
  depart: string;
  return: string;
  nights: number;
  legs: GroupLeg[];
  stay: StayOption;
  stayEstimated: boolean;
  costs: CostLine[];
  total: number;
  perPerson: number;
  people: number;
  penalties: Penalty[];
  smartScore: number;
  flags: string[];
  why: string;
}

export interface HeatCell {
  total: number;
  perPerson: number;
  estimated: boolean;
  tripId: string;
}

export interface Heatmap {
  title: string;
  dates: string[];
  nights: number[];
  cells: Record<string, HeatCell>; // key `${date}|${nights}`
}

export interface DestinationSummary {
  code: string;
  bestTripId: string;
  perPerson: number;
  total: number;
}

export interface SearchResponse {
  trips: Trip[];
  heatmap: Heatmap | null;
  destinations: DestinationSummary[];
  meta: {
    flightSource: string;
    staySource: string;
    sample: boolean;
    combinationsChecked: number;
    tookMs: number;
    warnings: string[];
  };
}
