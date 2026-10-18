// Destinations covered in Phase 1. Costs are rough GBP estimates and need
// checking before public launch.
//
// code: IATA city code (what Travelpayouts expects)
// transferOneWayPP: airport to centre by public transport, per person
// hotelNightly: typical price per room per night for a 7.5+ rated room
//   near the centre, mid-season, weeknight
// flightBase: typical return fare per person from a big UK airport,
//   used only for sample data
// kind: "city" (weekend breaks) or "sun" (beach/holiday, peaks in summer)

export interface Destination {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  tz: string;
  lat: number;
  lon: number;
  transferOneWayPP: number;
  hotelNightly: number;
  flightBase: number;
  flightMins: number;
  kind: "city" | "sun";
}

export const DESTINATIONS: Destination[] = [
  { code: "BCN", name: "Barcelona", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 41.387, lon: 2.17, transferOneWayPP: 6, hotelNightly: 125, flightBase: 95, flightMins: 130, kind: "city" },
  { code: "MAD", name: "Madrid", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 40.417, lon: -3.704, transferOneWayPP: 5, hotelNightly: 110, flightBase: 95, flightMins: 140, kind: "city" },
  { code: "AGP", name: "Málaga", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 36.721, lon: -4.421, transferOneWayPP: 4, hotelNightly: 95, flightBase: 105, flightMins: 165, kind: "sun" },
  { code: "ALC", name: "Alicante", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 38.345, lon: -0.481, transferOneWayPP: 4, hotelNightly: 80, flightBase: 95, flightMins: 150, kind: "sun" },
  { code: "PMI", name: "Palma, Mallorca", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 39.57, lon: 2.65, transferOneWayPP: 4, hotelNightly: 115, flightBase: 110, flightMins: 140, kind: "sun" },
  { code: "VLC", name: "Valencia", country: "Spain", countryCode: "ES", tz: "Europe/Madrid", lat: 39.47, lon: -0.376, transferOneWayPP: 4, hotelNightly: 90, flightBase: 90, flightMins: 140, kind: "city" },
  { code: "TCI", name: "Tenerife", country: "Spain", countryCode: "ES", tz: "Atlantic/Canary", lat: 28.05, lon: -16.71, transferOneWayPP: 8, hotelNightly: 100, flightBase: 170, flightMins: 260, kind: "sun" },
  { code: "LIS", name: "Lisbon", country: "Portugal", countryCode: "PT", tz: "Europe/Lisbon", lat: 38.722, lon: -9.139, transferOneWayPP: 2, hotelNightly: 115, flightBase: 100, flightMins: 160, kind: "city" },
  { code: "OPO", name: "Porto", country: "Portugal", countryCode: "PT", tz: "Europe/Lisbon", lat: 41.15, lon: -8.611, transferOneWayPP: 3, hotelNightly: 95, flightBase: 90, flightMins: 140, kind: "city" },
  { code: "FAO", name: "Faro", country: "Portugal", countryCode: "PT", tz: "Europe/Lisbon", lat: 37.019, lon: -7.93, transferOneWayPP: 3, hotelNightly: 85, flightBase: 105, flightMins: 165, kind: "sun" },
  { code: "PAR", name: "Paris", country: "France", countryCode: "FR", tz: "Europe/Paris", lat: 48.857, lon: 2.352, transferOneWayPP: 11, hotelNightly: 160, flightBase: 85, flightMins: 75, kind: "city" },
  { code: "NCE", name: "Nice", country: "France", countryCode: "FR", tz: "Europe/Paris", lat: 43.71, lon: 7.262, transferOneWayPP: 2, hotelNightly: 130, flightBase: 105, flightMins: 120, kind: "sun" },
  { code: "AMS", name: "Amsterdam", country: "Netherlands", countryCode: "NL", tz: "Europe/Amsterdam", lat: 52.37, lon: 4.895, transferOneWayPP: 5, hotelNightly: 165, flightBase: 85, flightMins: 75, kind: "city" },
  { code: "BRU", name: "Brussels", country: "Belgium", countryCode: "BE", tz: "Europe/Brussels", lat: 50.85, lon: 4.352, transferOneWayPP: 10, hotelNightly: 110, flightBase: 85, flightMins: 70, kind: "city" },
  { code: "DUB", name: "Dublin", country: "Ireland", countryCode: "IE", tz: "Europe/Dublin", lat: 53.35, lon: -6.26, transferOneWayPP: 8, hotelNightly: 150, flightBase: 65, flightMins: 60, kind: "city" },
  { code: "BER", name: "Berlin", country: "Germany", countryCode: "DE", tz: "Europe/Berlin", lat: 52.52, lon: 13.405, transferOneWayPP: 4, hotelNightly: 100, flightBase: 90, flightMins: 110, kind: "city" },
  { code: "MUC", name: "Munich", country: "Germany", countryCode: "DE", tz: "Europe/Berlin", lat: 48.137, lon: 11.575, transferOneWayPP: 11, hotelNightly: 125, flightBase: 110, flightMins: 115, kind: "city" },
  { code: "CPH", name: "Copenhagen", country: "Denmark", countryCode: "DK", tz: "Europe/Copenhagen", lat: 55.676, lon: 12.568, transferOneWayPP: 4, hotelNightly: 150, flightBase: 95, flightMins: 105, kind: "city" },
  { code: "PRG", name: "Prague", country: "Czechia", countryCode: "CZ", tz: "Europe/Prague", lat: 50.075, lon: 14.437, transferOneWayPP: 2, hotelNightly: 85, flightBase: 85, flightMins: 115, kind: "city" },
  { code: "BUD", name: "Budapest", country: "Hungary", countryCode: "HU", tz: "Europe/Budapest", lat: 47.498, lon: 19.04, transferOneWayPP: 5, hotelNightly: 75, flightBase: 85, flightMins: 145, kind: "city" },
  { code: "KRK", name: "Kraków", country: "Poland", countryCode: "PL", tz: "Europe/Warsaw", lat: 50.065, lon: 19.945, transferOneWayPP: 4, hotelNightly: 65, flightBase: 70, flightMins: 140, kind: "city" },
  { code: "VIE", name: "Vienna", country: "Austria", countryCode: "AT", tz: "Europe/Vienna", lat: 48.208, lon: 16.373, transferOneWayPP: 4, hotelNightly: 115, flightBase: 100, flightMins: 135, kind: "city" },
  { code: "ROM", name: "Rome", country: "Italy", countryCode: "IT", tz: "Europe/Rome", lat: 41.903, lon: 12.496, transferOneWayPP: 6, hotelNightly: 130, flightBase: 105, flightMins: 155, kind: "city" },
  { code: "MIL", name: "Milan", country: "Italy", countryCode: "IT", tz: "Europe/Rome", lat: 45.464, lon: 9.19, transferOneWayPP: 9, hotelNightly: 125, flightBase: 90, flightMins: 120, kind: "city" },
  { code: "VCE", name: "Venice", country: "Italy", countryCode: "IT", tz: "Europe/Rome", lat: 45.44, lon: 12.316, transferOneWayPP: 9, hotelNightly: 155, flightBase: 100, flightMins: 130, kind: "city" },
  { code: "NAP", name: "Naples", country: "Italy", countryCode: "IT", tz: "Europe/Rome", lat: 40.852, lon: 14.268, transferOneWayPP: 5, hotelNightly: 95, flightBase: 110, flightMins: 165, kind: "city" },
  { code: "ATH", name: "Athens", country: "Greece", countryCode: "GR", tz: "Europe/Athens", lat: 37.984, lon: 23.728, transferOneWayPP: 8, hotelNightly: 105, flightBase: 140, flightMins: 225, kind: "sun" },
  { code: "DBV", name: "Dubrovnik", country: "Croatia", countryCode: "HR", tz: "Europe/Zagreb", lat: 42.65, lon: 18.094, transferOneWayPP: 8, hotelNightly: 140, flightBase: 130, flightMins: 165, kind: "sun" },
  { code: "SPU", name: "Split", country: "Croatia", countryCode: "HR", tz: "Europe/Zagreb", lat: 43.508, lon: 16.44, transferOneWayPP: 7, hotelNightly: 115, flightBase: 125, flightMins: 160, kind: "sun" },
  { code: "MLA", name: "Malta", country: "Malta", countryCode: "MT", tz: "Europe/Malta", lat: 35.899, lon: 14.514, transferOneWayPP: 3, hotelNightly: 95, flightBase: 120, flightMins: 190, kind: "sun" },
  { code: "IST", name: "Istanbul", country: "Türkiye", countryCode: "TR", tz: "Europe/Istanbul", lat: 41.008, lon: 28.978, transferOneWayPP: 4, hotelNightly: 85, flightBase: 150, flightMins: 235, kind: "city" },
  { code: "REK", name: "Reykjavík", country: "Iceland", countryCode: "IS", tz: "Atlantic/Reykjavik", lat: 64.147, lon: -21.942, transferOneWayPP: 25, hotelNightly: 170, flightBase: 150, flightMins: 180, kind: "city" },
];

const byCode = new Map(DESTINATIONS.map((d) => [d.code, d]));

export function getDestination(code: string): Destination | undefined {
  return byCode.get(code.toUpperCase());
}

/** Airline names and estimated checked-bag fee per bag per direction (GBP). */
export const AIRLINES: Record<string, { name: string; checkedBag: number }> = {
  FR: { name: "Ryanair", checkedBag: 35 },
  U2: { name: "easyJet", checkedBag: 30 },
  LS: { name: "Jet2", checkedBag: 30 },
  W6: { name: "Wizz Air", checkedBag: 35 },
  BA: { name: "British Airways", checkedBag: 30 },
  TOM: { name: "TUI", checkedBag: 30 },
  VY: { name: "Vueling", checkedBag: 30 },
  EI: { name: "Aer Lingus", checkedBag: 30 },
  KL: { name: "KLM", checkedBag: 35 },
  LH: { name: "Lufthansa", checkedBag: 35 },
  TP: { name: "TAP Air Portugal", checkedBag: 35 },
  TK: { name: "Turkish Airlines", checkedBag: 0 },
  FI: { name: "Icelandair", checkedBag: 40 },
  PC: { name: "Pegasus", checkedBag: 30 },
};

/** Public transport day ticket per person (GBP, est.). Default for unlisted cities. */
const DAY_TICKETS: Record<string, number> = { AMS: 8, PAR: 8, CPH: 10, BER: 9, MUC: 8, VIE: 7, DUB: 8, REK: 10, BRU: 7, MIL: 7, ROM: 6, VCE: 22 };
export function dayTicketPP(code: string): number {
  return DAY_TICKETS[code] ?? 5;
}

export function airlineName(code: string): string {
  return AIRLINES[code]?.name ?? code;
}

export function checkedBagFee(code: string): number {
  return AIRLINES[code]?.checkedBag ?? 35;
}
