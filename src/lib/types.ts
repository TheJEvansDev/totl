// Shared types for the search request, provider results and trips.

export type BagOption = "cabin" | "checked";
export type StayType = "hotel" | "apartment" | "any";
export type SortMode = "smart" | "cheapest" | "deals";

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
  /** Allow flying out of one airport and home into another (e.g. out from Stansted, back into Bristol). */
  mixAirports: boolean;
  /** Only fly home into this airport. Empty = whichever works out best. */
  returnTo: string;
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
  /** Max straight-line distance from the centre, in km. */
  maxCentreKm: number;
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
  origin: string; // airport code, outbound
  /** Airport you fly home into. Same as origin for a normal return ticket. */
  returnAirport: string;
  destination: string; // city code
  destinationAirport: string;
  airline: string; // IATA carrier code, outbound
  returnAirline: string;
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
  /** Separate link for the return flight when it's two one-way tickets. */
  returnBookingUrl: string | null;
  /** How old the cached price is, if known. */
  seenHoursAgo: number | null;
}

export interface StayOption {
  id: string;
  source: "sample" | "liteapi" | "estimate";
  name: string;
  type: "hotel" | "apartment";
  rating: number | null; // 0-10
  /** Straight-line distance from the centre, in km. */
  centreKm: number | null;
  /** Estimated public transport minutes to the centre. */
  centreMins: number | null;
  lat: number | null;
  lon: number | null;
  total: number; // GBP for the whole stay
  freeCancellation: boolean | null;
  bookingUrl: string;
}

/** One-way flight, used to build "out from A, back into B" trips. */
export interface OneWayFlight {
  id: string;
  source: "sample" | "travelpayouts";
  from: string; // airport code (UK) or city code (destination)
  to: string;
  airline: string;
  date: string; // local departure date
  depart: string; // ISO UTC
  arrive: string;
  stops: number;
  layoverMins: number;
  price: number; // per person
  bookingUrl: string;
  seenHoursAgo: number | null;
}

export interface StayAlternative {
  label: string;
  stay: StayOption;
  /** Public transport to the centre over the trip, all travellers. */
  transportCost: number;
  /** Difference vs the chosen stay, including transport. Negative = cheaper. */
  netVsChosen: number;
  pros: string[];
  cons: string[];
}

/** Same trip with a different pair of airports, for comparison. */
export interface AirportOption {
  out: string;
  back: string;
  pricePerPerson: number;
  /** Change in total cost vs the chosen flights (negative = cheaper). */
  totalDelta: number;
  groundNote: string;
  extraHours: number;
  flags: string[];
  bookingUrl: string;
  returnBookingUrl: string | null;
}

export interface Deal {
  kind: "deal" | "error";
  pctBelow: number;
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
  stayAlternatives: StayAlternative[];
  airportOptions: AirportOption[];
  deal: Deal | null;
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

/** A trade-off that saves money compared with the top result. */
export interface Compromise {
  label: string;
  detail: string;
  saving: number;
  tripId: string | null;
}

export interface SearchResponse {
  trips: Trip[];
  /** Names, countries and time zones for every code in the results. */
  places: Record<string, import("./data/places").PlaceInfo>;
  compromises: Compromise[];
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
