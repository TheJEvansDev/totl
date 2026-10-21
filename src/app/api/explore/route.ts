import { NextResponse } from "next/server";
import { getAirport } from "@/lib/data/places";
import { type TripLength, explore, sampleExplore } from "@/lib/explore";
import { createLimiter } from "@/lib/ratelimit";

// Cheapest flights from one airport to places worldwide, for the globe.
//   /api/explore?from=BRS&length=weekend|week&month=0..12
// One SerpApi lookup per new combination (cached for an hour).

const limited = createLimiter(10);

export async function GET(req: Request) {
  if (limited(req)) return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  const url = new URL(req.url);
  const from = (url.searchParams.get("from") ?? "").toUpperCase().slice(0, 3);
  if (!getAirport(from)) return NextResponse.json({ error: "Choose the airport you're flying from." }, { status: 400 });
  const length: TripLength = url.searchParams.get("length") === "week" ? "week" : "weekend";
  const m = Number(url.searchParams.get("month"));
  const month = Number.isInteger(m) && m >= 0 && m <= 12 ? m : 0;
  const key = process.env.SERPAPI_KEY?.trim();
  try {
    const places = key ? await explore(key, { from, length, month }) : sampleExplore({ from, length, month });
    return NextResponse.json({ sample: !key, places });
  } catch (err) {
    console.error("explore failed", err);
    return NextResponse.json({ error: "Couldn't load prices for the globe right now. Try again in a moment." }, { status: 502 });
  }
}
