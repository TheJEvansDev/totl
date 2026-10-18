import { NextResponse } from "next/server";
import { parseRequest } from "@/lib/engine/request";
import { SearchError, runSearch } from "@/lib/engine/search";
import { getProviders } from "@/lib/providers";
import { createLimiter } from "@/lib/ratelimit";

export const maxDuration = 30;

const limited = createLimiter(12);

export async function POST(req: Request) {
  if (limited(req)) {
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
