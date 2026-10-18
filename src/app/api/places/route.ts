import { NextResponse } from "next/server";
import { nearestAirport, placeInfo, searchPlaces } from "@/lib/data/places";

// Airport and city search for the search form.
//   ?q=bristol&cities=1   search by name or code
//   ?codes=BRS,LON        look up specific codes
//   ?lat=..&lon=..        nearest airport
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const codes = url.searchParams.get("codes");
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const headers = { "cache-control": "public, max-age=86400" };
  if (q) {
    return NextResponse.json({ results: searchPlaces(q.slice(0, 60), { cities: url.searchParams.get("cities") === "1" }) }, { headers });
  }
  if (codes) {
    const list = codes.split(",").slice(0, 30).map((c) => placeInfo(c.trim())).filter(Boolean);
    return NextResponse.json({ results: list }, { headers });
  }
  if (Number.isFinite(lat) && Number.isFinite(lon) && url.searchParams.has("lat")) {
    return NextResponse.json({ results: [placeInfo(nearestAirport({ lat, lon }).code)] });
  }
  return NextResponse.json({ results: [] });
}
