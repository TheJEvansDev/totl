// Picks real providers when API keys are set, otherwise sample data.
// Flights are live only (Google Flights via SerpApi); cached Travelpayouts
// prices are no longer used.

import { googleHotels } from "./googlehotels";
import { liteapiStays } from "./liteapi";
import { sampleFlights, sampleStays } from "./sample";
import { serpapiFlights } from "./serpapi";
import type { FlightProvider, StayProvider } from "./types";

export function getProviders(): { flights: FlightProvider; stays: StayProvider } {
  const serpKey = process.env.SERPAPI_KEY?.trim();
  const liteKey = process.env.LITEAPI_KEY?.trim();
  return {
    flights: serpKey ? serpapiFlights(serpKey) : sampleFlights,
    // Google Hotels when there's a SerpApi key: live prices without LiteAPI's business sign-up.
    stays: serpKey ? googleHotels(serpKey) : liteKey ? liteapiStays(liteKey) : sampleStays,
  };
}
