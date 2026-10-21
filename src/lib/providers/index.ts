// Picks real providers when API keys are set, otherwise sample data.
// Flights are live only (Google Flights via SerpApi); cached Travelpayouts
// prices are no longer used.

import { type DirectAirlines, directAirlines } from "./airlines";
import { type DateRadar, firecrawlFlights, firecrawlRadar } from "./firecrawl";
import { googleHotels } from "./googlehotels";
import { liteapiStays } from "./liteapi";
import { sampleFlights, sampleStays } from "./sample";
import { serpapiFlights } from "./serpapi";
import type { FlightProvider, StayProvider } from "./types";

export function getProviders(): { flights: FlightProvider; stays: StayProvider; radar?: DateRadar; direct?: DirectAirlines } {
  const serpKey = process.env.SERPAPI_KEY?.trim();
  const fcKey = process.env.FIRECRAWL_API_KEY?.trim();
  const liteKey = process.env.LITEAPI_KEY?.trim();
  return {
    flights: serpKey ? serpapiFlights(serpKey) : fcKey ? firecrawlFlights(fcKey) : sampleFlights,
    // Skyscanner's price calendar (cached prices), only for choosing which dates and places to check live.
    ...(fcKey ? { radar: firecrawlRadar(fcKey), direct: directAirlines(fcKey) } : {}),
    // Google Hotels when there's a SerpApi key: live prices without LiteAPI's business sign-up.
    stays: serpKey ? googleHotels(serpKey) : liteKey ? liteapiStays(liteKey) : sampleStays,
  };
}
