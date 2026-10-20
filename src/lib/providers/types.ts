import type { Airport } from "../data/airports";
import type { Destination } from "../data/destinations";
import type { Market } from "../markets";
import type { FlightOption, OneWayFlight, StayOption, StayPrefs } from "../types";

export interface FlightQuery {
  origin: Airport;
  destinations: Destination[];
  departFrom: string;
  departTo: string;
  minNights: number;
  maxNights: number;
  adults: number;
  children: number;
}

export interface OneWayQuery {
  /** "out": UK airport to destinations. "back": destinations to UK airport. */
  direction: "out" | "back";
  airport: Airport;
  destinations: Destination[];
  dateFrom: string;
  dateTo: string;
  adults: number;
  children: number;
}

/** Live one-way search for exact dates, covering several airports per lookup. */
export interface LiveOneWayQuery {
  /** "out": their airports to destinations. "back": destinations to their airports. */
  direction: "out" | "back";
  airports: Airport[];
  destinations: Destination[];
  dates: string[];
  adults: number;
  children: number;
}

/** The same return flights priced on one country's booking site. */
export interface MarketQuote {
  market: string;
  pricePerPerson: number; // GBP
  /** Per person in the market's own currency, when the provider gives it. */
  localAmount?: number;
  bookingUrl: string;
  returnBookingUrl?: string | null;
  seenHoursAgo: number | null;
}

export interface FlightProvider {
  id: string;
  label: string;
  sample: boolean;
  /** Live prices: every lookup costs, so searches use searchOneWayDates for exact dates. */
  live?: boolean;
  searchOneWayDates?(q: LiveOneWayQuery): Promise<OneWayFlight[]>;
  /** Return-trip options from one origin to any of the destinations. */
  search(q: FlightQuery): Promise<FlightOption[]>;
  /** One-way options, used to fly out of one airport and home into another. */
  searchOneWay(q: OneWayQuery): Promise<OneWayFlight[]>;
  /** Prices for these exact flights on other countries' booking sites. Missing markets are left out. */
  checkMarkets(flight: FlightOption, origin: Airport, dest: Destination, markets: Market[], adults: number, children: number): Promise<MarketQuote[]>;
}

export interface StayQuery {
  destination: Destination;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  prefs: StayPrefs;
}

export interface StayProvider {
  id: string;
  label: string;
  sample: boolean;
  /** Real (or sample) stays for exact dates. Expensive: only for shortlisted trips. */
  search(q: StayQuery): Promise<StayOption[]>;
}

export function roomsNeeded(adults: number): number {
  return Math.max(1, Math.ceil(adults / 2));
}
