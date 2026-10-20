// Picks real providers when API keys are set, otherwise sample data.
// Flights are live only (Google Flights via SerpApi); cached Travelpayouts
// prices are no longer used.

import { liteapiStays } from "./liteapi";
import { sampleFlights, sampleStays } from "./sample";
import { serpapiFlights } from "./serpapi";
import type { FlightProvider, StayProvider } from "./types";

export function getProviders(): { flights: FlightProvider; stays: StayProvider } {
  const serpKey = process.env.SERPAPI_KEY?.trim();
  const liteKey = process.env.LITEAPI_KEY?.trim();
  return {
    flights: serpKey ? serpapiFlights(serpKey) : sampleFlights,
    stays: liteKey ? liteapiStays(liteKey) : sampleStays,
  };
}
