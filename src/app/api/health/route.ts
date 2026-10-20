import { NextResponse } from "next/server";
import { getAirport, getDestination } from "@/lib/data/places";
import { addDays, todayUK } from "@/lib/dates";
import { liteapiStays } from "@/lib/providers/liteapi";
import { lookup, serpapiFlights } from "@/lib/providers/serpapi";
import { createLimiter } from "@/lib/ratelimit";
import { getRates } from "@/lib/rates";

// Checks the flight, hotel and exchange-rate connections with the real keys
// and reports what came back. Never returns the keys themselves.
//   /api/health

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const limited = createLimiter(3);

const short = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 300);

/** Field names and a few safe values from the first item, to check the data shape. */
function shape(item: unknown, keep: string[]): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  return { fields: Object.keys(o), ...Object.fromEntries(keep.filter((k) => k in o).map((k) => [k, o[k]])) };
}

async function rawJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body };
}

async function checkFlights(key: string | undefined) {
  if (!key) return { configured: false, note: "Add SERPAPI_KEY in Vercel to use live Google Flights prices. Until then flights are sample data." };
  const out: Record<string, unknown> = { configured: true, source: "Google Flights via SerpApi (live). Each check uses 2 of your monthly lookups." };
  const date = addDays(todayUK(), 40);
  try {
    // Two departure airports in one lookup, to confirm several airports work together.
    const body = await lookup(key, { departure_id: "BRS,BHX", arrival_id: "BCN,GRO", outbound_date: date, type: "2", adults: "1", currency: "GBP", hl: "en", gl: "uk" });
    const all = [...(body.best_flights ?? []), ...(body.other_flights ?? [])];
    out.raw = {
      search: `Bristol or Birmingham to Barcelona or Girona, one way, ${date}`,
      itineraries: all.length,
      fromAirports: [...new Set(all.map((i) => i.flights?.[0]?.departure_airport?.id))],
      toAirports: [...new Set(all.map((i) => i.flights?.at(-1)?.arrival_airport?.id))],
      googleFlightsLink: Boolean(body.search_metadata?.google_flights_url),
      first: shape(all[0], ["price", "type", "total_duration"]),
      firstSegment: shape(all[0]?.flights?.[0], ["departure_airport", "arrival_airport", "airline", "flight_number", "duration"]),
    };
  } catch (e) {
    out.raw = { error: short(e) };
  }
  try {
    const provider = serpapiFlights(key);
    const flights = await provider.searchOneWayDates!({
      direction: "back",
      airports: [getAirport("BRS")!],
      destinations: [getDestination("BCN")!],
      dates: [addDays(date, 4)],
      adults: 1,
      children: 0,
    });
    const cheapest = [...flights].sort((a, b) => a.price - b.price)[0];
    out.viaApp = {
      search: `Barcelona to Bristol, one way, ${addDays(date, 4)}`,
      options: flights.length,
      cheapest: cheapest ? { price: cheapest.price, from: cheapest.from, to: cheapest.to, airline: cheapest.airline, depart: cheapest.depart, stops: cheapest.stops } : null,
    };
  } catch (e) {
    out.viaApp = { error: short(e) };
  }
  return out;
}

async function checkHotels(key: string | undefined) {
  if (!key) return { configured: false, note: "Add LITEAPI_KEY in Vercel to use real hotel prices." };
  const out: Record<string, unknown> = { configured: true, keyType: key.startsWith("sand") ? "sandbox (test prices only)" : "live" };
  try {
    const { status, body } = await rawJson("https://api.liteapi.travel/v3.0/data/hotels?countryCode=ES&cityName=Barcelona&limit=3", {
      headers: { "X-API-Key": key, accept: "application/json" },
    });
    const b = body as { data?: unknown[]; error?: unknown };
    out.rawHotels = { status, hotels: Array.isArray(b?.data) ? b.data.length : null, first: Array.isArray(b?.data) ? shape(b.data[0], ["id", "name", "rating", "stars", "latitude", "longitude"]) : body };
  } catch (e) {
    out.rawHotels = { error: short(e) };
  }
  try {
    const t = todayUK();
    const stays = await liteapiStays(key).search({
      destination: getDestination("BCN")!,
      checkin: addDays(t, 30),
      checkout: addDays(t, 32),
      adults: 2,
      children: 0,
      prefs: { type: "any", minRating: 7, maxCentreKm: 7 },
    });
    const cheapest = [...stays].sort((a, b) => a.total - b.total)[0];
    out.viaApp = {
      search: "Barcelona, 2 nights in 30 days, 2 adults, rated 7+, within 7 km",
      priced: stays.length,
      cheapest: cheapest ? { name: cheapest.name, total: cheapest.total, rating: cheapest.rating, km: cheapest.centreKm } : null,
    };
  } catch (e) {
    out.viaApp = { error: short(e) };
  }
  return out;
}

export async function GET(req: Request) {
  if (limited(req)) return NextResponse.json({ error: "Wait a minute before checking again." }, { status: 429 });
  const [flights, hotels, rates] = await Promise.all([
    checkFlights(process.env.SERPAPI_KEY?.trim()),
    checkHotels(process.env.LITEAPI_KEY?.trim()),
    getRates().then((r) => ({ source: r.source, date: r.date, eurPerGbp: r.rates.EUR })).catch((e) => ({ error: short(e) })),
  ]);
  return NextResponse.json(
    { checkedAt: new Date().toISOString(), flights, hotels, rates, ai: { configured: Boolean(process.env.ANTHROPIC_API_KEY) } },
    { headers: { "cache-control": "no-store" } },
  );
}
