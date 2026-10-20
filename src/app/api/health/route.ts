import { NextResponse } from "next/server";
import { getAirport, getDestination } from "@/lib/data/places";
import { addDays, todayUK } from "@/lib/dates";
import { liteapiStays } from "@/lib/providers/liteapi";
import { travelpayoutsFlights } from "@/lib/providers/travelpayouts";
import { createLimiter } from "@/lib/ratelimit";
import { getRates } from "@/lib/rates";

// Checks the flight, hotel and exchange-rate connections with the real keys
// and reports what came back. Never returns the keys themselves.
//   /api/health
//   /api/health?route=BRS-BCN&month=2026-12 (cached fares on one route)

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

async function checkFlights(token: string | undefined) {
  if (!token) return { configured: false, note: "Add TRAVELPAYOUTS_TOKEN in Vercel to use real flight prices." };
  const month = addDays(todayUK(), 35).slice(0, 7);
  const out: Record<string, unknown> = { configured: true };
  try {
    const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
    Object.entries({ origin: "LON", destination: "BCN", departure_at: month, one_way: "false", currency: "gbp", market: "gb", limit: "5", sorting: "price" }).forEach(([k, v]) =>
      url.searchParams.set(k, v),
    );
    const { status, body } = await rawJson(url.toString(), { headers: { "X-Access-Token": token } });
    const b = body as { success?: boolean; data?: unknown[]; error?: string };
    out.raw = {
      status,
      success: b?.success ?? null,
      error: b?.error ?? null,
      tickets: Array.isArray(b?.data) ? b.data.length : null,
      first: Array.isArray(b?.data) ? shape(b.data[0], ["origin", "destination", "origin_airport", "destination_airport", "price", "airline", "departure_at", "return_at", "transfers", "duration_to"]) : body,
    };
  } catch (e) {
    out.raw = { error: short(e) };
  }
  try {
    const provider = travelpayoutsFlights(token, process.env.TRAVELPAYOUTS_MARKER?.trim() || undefined);
    const t = todayUK();
    const flights = await provider.search({
      origin: getAirport("LGW")!,
      destinations: [getDestination("BCN")!],
      departFrom: addDays(t, 20),
      departTo: addDays(t, 50),
      minNights: 2,
      maxNights: 5,
      adults: 1,
      children: 0,
    });
    const cheapest = [...flights].sort((a, b) => a.pricePerPerson - b.pricePerPerson)[0];
    const oneWay = { airport: getAirport("LGW")!, destinations: [getDestination("BCN")!], dateFrom: addDays(t, 20), dateTo: addDays(t, 55), adults: 1, children: 0 };
    const [outs, backs] = await Promise.all([
      provider.searchOneWay({ ...oneWay, direction: "out" }),
      provider.searchOneWay({ ...oneWay, direction: "back" }),
    ]);
    const cheapestOut = [...outs].sort((a, b) => a.price - b.price)[0];
    out.oneWays = {
      out: outs.length,
      back: backs.length,
      cheapestOut: cheapestOut ? { price: cheapestOut.price, from: cheapestOut.from, date: cheapestOut.date, airline: cheapestOut.airline, seller: cheapestOut.seller ?? null } : null,
    };
    out.viaApp = {
      route: "Gatwick (or another London airport) to Barcelona, 2-5 nights, leaving in 20-50 days",
      options: flights.length,
      cheapest: cheapest
        ? { price: cheapest.pricePerPerson, from: cheapest.origin, airline: cheapest.airline, seller: cheapest.seller ?? null, depart: cheapest.departDate, return: cheapest.returnDate, stops: cheapest.outStops + cheapest.retStops }
        : null,
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

/**
 * Which dates have cached fares on one route, both ways, for one month.
 *   /api/health?route=BRS-BCN&month=2026-12
 */
async function checkRoute(token: string | undefined, route: string, month: string) {
  if (!token) return { configured: false };
  const [from, to] = route.toUpperCase().split("-");
  if (!/^[A-Z]{3}$/.test(from ?? "") || !/^[A-Z]{3}$/.test(to ?? "") || !/^\d{4}-\d{2}$/.test(month)) {
    return { error: "Use ?route=BRS-BCN&month=2026-12" };
  }
  const get = async (origin: string, destination: string, oneWay: boolean) => {
    const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
    Object.entries({ origin, destination, departure_at: month, one_way: String(oneWay), currency: "gbp", market: "gb", limit: "1000", sorting: "price", direct: "false", unique: "false" }).forEach(([k, v]) =>
      url.searchParams.set(k, v),
    );
    const { status, body } = await rawJson(url.toString(), { headers: { "X-Access-Token": token } });
    const data = (body as { data?: Record<string, unknown>[] })?.data;
    if (!Array.isArray(data)) return { status, error: (body as { error?: string })?.error ?? "no data" };
    const fares = data
      .map((t) => ({
        date: String(t.departure_at ?? "").slice(0, 10),
        back: t.return_at ? String(t.return_at).slice(0, 10) : undefined,
        price: t.price,
        airline: t.airline,
        from: t.origin_airport,
        to: t.destination_airport,
        stops: t.transfers,
      }))
      .sort((x, y) => (x.date < y.date ? -1 : 1));
    return { status, count: fares.length, fares: fares.slice(0, 60) };
  };
  const [out, back, returns] = await Promise.all([get(from, to, true), get(to, from, true), get(from, to, false)]);
  return { route: `${from} to ${to}`, month, oneWayOut: out, oneWayBack: back, returnTrips: returns };
}

export async function GET(req: Request) {
  if (limited(req)) return NextResponse.json({ error: "Wait a minute before checking again." }, { status: 429 });
  const params = new URL(req.url).searchParams;
  const route = params.get("route");
  if (route) {
    const result = await checkRoute(process.env.TRAVELPAYOUTS_TOKEN?.trim(), route, params.get("month") ?? addDays(todayUK(), 35).slice(0, 7)).catch((e) => ({ error: short(e) }));
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  }
  const [flights, hotels, rates] = await Promise.all([
    checkFlights(process.env.TRAVELPAYOUTS_TOKEN?.trim()),
    checkHotels(process.env.LITEAPI_KEY?.trim()),
    getRates().then((r) => ({ source: r.source, date: r.date, eurPerGbp: r.rates.EUR })).catch((e) => ({ error: short(e) })),
  ]);
  return NextResponse.json(
    { checkedAt: new Date().toISOString(), flights, hotels, rates, ai: { configured: Boolean(process.env.ANTHROPIC_API_KEY) } },
    { headers: { "cache-control": "no-store" } },
  );
}
