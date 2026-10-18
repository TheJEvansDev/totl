import { NextResponse } from "next/server";
import { parseRequest } from "@/lib/engine/request";
import { SearchError, runSearch } from "@/lib/engine/search";
import { getProviders } from "@/lib/providers";

export const maxDuration = 30;

// Simple per-IP limit to protect free API quotas. Per server instance only.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many searches in a minute. Give it a moment and try again." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid search." }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const result = await runSearch(parsed.value, getProviders());
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SearchError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("search failed", err);
    return NextResponse.json({ error: "Something went wrong with that search. Please try again." }, { status: 500 });
  }
}
