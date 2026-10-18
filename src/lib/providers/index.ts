// Picks real providers when API keys are set, otherwise sample data.

import { liteapiStays } from "./liteapi";
import { sampleFlights, sampleStays } from "./sample";
import { travelpayoutsFlights } from "./travelpayouts";
import type { FlightProvider, StayProvider } from "./types";

export function getProviders(): { flights: FlightProvider; stays: StayProvider } {
  const tpToken = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  const tpMarker = process.env.TRAVELPAYOUTS_MARKER?.trim() || undefined;
  const liteKey = process.env.LITEAPI_KEY?.trim();
  return {
    flights: tpToken ? travelpayoutsFlights(tpToken, tpMarker) : sampleFlights,
    stays: liteKey ? liteapiStays(liteKey) : sampleStays,
  };
}
