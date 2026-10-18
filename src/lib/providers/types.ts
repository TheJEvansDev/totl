import type { Airport } from "../data/airports";
import type { Destination } from "../data/destinations";
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

export interface FlightProvider {
  id: string;
  label: string;
  sample: boolean;
  /** Return-trip options from one origin to any of the destinations. */
  search(q: FlightQuery): Promise<FlightOption[]>;
  /** One-way options, used to fly out of one airport and home into another. */
  searchOneWay(q: OneWayQuery): Promise<OneWayFlight[]>;
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
