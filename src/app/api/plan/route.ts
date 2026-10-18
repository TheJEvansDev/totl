import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { PlanError, planFromText } from "@/lib/ai/plan";
import { planToRequest } from "@/lib/ai/toRequest";
import { placesFor } from "@/lib/engine/places";
import { parseRequest } from "@/lib/engine/request";
import { defaultRequest } from "@/lib/defaults";
import { createLimiter } from "@/lib/ratelimit";

export const maxDuration = 60;

const limited = createLimiter(5);

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Trip planning by description isn't switched on yet." }, { status: 503 });
  }
  if (limited(req)) {
    return NextResponse.json({ error: "Too many requests in a minute. Give it a moment and try again." }, { status: 429 });
  }
  let body: { text?: unknown; current?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = String(body.text ?? "").trim().slice(0, 800);
  if (text.length < 8) return NextResponse.json({ error: "Tell us a bit more about the trip." }, { status: 400 });
  try {
    // The form may not have a home airport yet; fall back to defaults.
    const current = parseRequest(body.current);
    const base = current.ok ? current.value : defaultRequest();
    const plan = await planFromText(text, base.groups[0].homeAirport);
    const request = planToRequest(plan, base);
    return NextResponse.json({ summary: plan.summary, assumptions: plan.assumptions, request, places: placesFor(request) });
  } catch (err) {
    if (err instanceof PlanError) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Trip planning is busy right now. Try again in a minute." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) console.error("plan API error", err.status, err.message);
    else console.error("plan failed", err);
    return NextResponse.json({ error: "Couldn't plan that right now. Try again, or use the search form." }, { status: 500 });
  }
}
