// UK departure airports. Costs are rough estimates in GBP and need
// checking against real fares/parking prices before public launch.
//
// localReturnPP: typical return public transport fare per person from the
//   airport's main city centre (used when this is your home airport).
// parkingPerDay: typical pre-booked long-stay parking per day.
// cityCode: the Travelpayouts/IATA city code when it differs (London).
// size: rough route coverage, used by sample data (3 = biggest).

export interface Airport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  localReturnPP: number;
  parkingPerDay: number;
  cityCode?: string;
  size: 1 | 2 | 3;
}

export const UK_AIRPORTS: Airport[] = [
  { code: "LHR", name: "Heathrow", city: "London", lat: 51.47, lon: -0.454, localReturnPP: 12, parkingPerDay: 18, cityCode: "LON", size: 3 },
  { code: "LGW", name: "Gatwick", city: "London", lat: 51.153, lon: -0.182, localReturnPP: 25, parkingPerDay: 14, cityCode: "LON", size: 3 },
  { code: "STN", name: "Stansted", city: "London", lat: 51.885, lon: 0.235, localReturnPP: 30, parkingPerDay: 13, cityCode: "LON", size: 3 },
  { code: "LTN", name: "Luton", city: "London", lat: 51.875, lon: -0.368, localReturnPP: 30, parkingPerDay: 13, cityCode: "LON", size: 3 },
  { code: "LCY", name: "London City", city: "London", lat: 51.505, lon: 0.055, localReturnPP: 8, parkingPerDay: 35, cityCode: "LON", size: 1 },
  { code: "SEN", name: "Southend", city: "London", lat: 51.571, lon: 0.696, localReturnPP: 30, parkingPerDay: 9, cityCode: "LON", size: 1 },
  { code: "MAN", name: "Manchester", city: "Manchester", lat: 53.354, lon: -2.275, localReturnPP: 9, parkingPerDay: 11, size: 3 },
  { code: "LPL", name: "Liverpool John Lennon", city: "Liverpool", lat: 53.334, lon: -2.85, localReturnPP: 7, parkingPerDay: 8, size: 2 },
  { code: "LBA", name: "Leeds Bradford", city: "Leeds", lat: 53.866, lon: -1.661, localReturnPP: 8, parkingPerDay: 10, size: 2 },
  { code: "NCL", name: "Newcastle", city: "Newcastle", lat: 55.038, lon: -1.692, localReturnPP: 8, parkingPerDay: 9, size: 2 },
  { code: "MME", name: "Teesside", city: "Darlington", lat: 54.509, lon: -1.429, localReturnPP: 10, parkingPerDay: 7, size: 1 },
  { code: "EMA", name: "East Midlands", city: "Nottingham", lat: 52.831, lon: -1.328, localReturnPP: 12, parkingPerDay: 9, size: 2 },
  { code: "BHX", name: "Birmingham", city: "Birmingham", lat: 52.454, lon: -1.748, localReturnPP: 9, parkingPerDay: 10, size: 3 },
  { code: "BRS", name: "Bristol", city: "Bristol", lat: 51.383, lon: -2.719, localReturnPP: 14, parkingPerDay: 11, size: 2 },
  { code: "EXT", name: "Exeter", city: "Exeter", lat: 50.734, lon: -3.414, localReturnPP: 8, parkingPerDay: 9, size: 1 },
  { code: "NQY", name: "Newquay", city: "Newquay", lat: 50.441, lon: -4.995, localReturnPP: 10, parkingPerDay: 8, size: 1 },
  { code: "CWL", name: "Cardiff", city: "Cardiff", lat: 51.397, lon: -3.343, localReturnPP: 10, parkingPerDay: 9, size: 1 },
  { code: "SOU", name: "Southampton", city: "Southampton", lat: 50.95, lon: -1.357, localReturnPP: 8, parkingPerDay: 12, size: 1 },
  { code: "BOH", name: "Bournemouth", city: "Bournemouth", lat: 50.78, lon: -1.843, localReturnPP: 10, parkingPerDay: 8, size: 1 },
  { code: "NWI", name: "Norwich", city: "Norwich", lat: 52.676, lon: 1.283, localReturnPP: 6, parkingPerDay: 8, size: 1 },
  { code: "EDI", name: "Edinburgh", city: "Edinburgh", lat: 55.95, lon: -3.373, localReturnPP: 9, parkingPerDay: 12, size: 3 },
  { code: "GLA", name: "Glasgow", city: "Glasgow", lat: 55.872, lon: -4.433, localReturnPP: 15, parkingPerDay: 10, size: 2 },
  { code: "PIK", name: "Glasgow Prestwick", city: "Glasgow", lat: 55.509, lon: -4.587, localReturnPP: 12, parkingPerDay: 6, size: 1 },
  { code: "ABZ", name: "Aberdeen", city: "Aberdeen", lat: 57.202, lon: -2.198, localReturnPP: 8, parkingPerDay: 10, size: 1 },
  { code: "INV", name: "Inverness", city: "Inverness", lat: 57.542, lon: -4.048, localReturnPP: 8, parkingPerDay: 7, size: 1 },
  { code: "BFS", name: "Belfast International", city: "Belfast", lat: 54.658, lon: -6.216, localReturnPP: 15, parkingPerDay: 9, size: 2 },
  { code: "BHD", name: "Belfast City", city: "Belfast", lat: 54.618, lon: -5.873, localReturnPP: 5, parkingPerDay: 11, size: 1 },
];

const byCode = new Map(UK_AIRPORTS.map((a) => [a.code, a]));

export function getAirport(code: string): Airport | undefined {
  return byCode.get(code.toUpperCase());
}

/** Straight-line distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rough one-way road/rail travel time in hours between two points in the UK. */
export function travelHours(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const roadKm = haversineKm(a, b) * 1.25;
  return roadKm < 3 ? 0 : roadKm / 80 + 0.25;
}
