// Turns a typed trip description ("4 of us, somewhere hot in May, under £400
// each, from Bristol") into a search. Claude only fills in search settings;
// the normal validator checks them before anything runs.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { UK_AIRPORTS } from "../data/airports";
import { DESTINATIONS } from "../data/destinations";
import { todayUK } from "../dates";

// Cheaper alternative if costs matter: "claude-haiku-5-5".
const MODEL = "claude-opus-5-5";

const PlanSchema = z.object({
  summary: z.string().describe("One short sentence restating the trip in plain British English"),
  assumptions: z.array(z.string()).describe("Anything you had to assume or guess, in plain words. Empty if nothing."),
  homeAirport: z.string().describe("IATA code of the user's UK home airport, or empty string if unknown"),
  extraAirports: z.array(z.string()).describe("Other UK airports the user mentioned (IATA codes)"),
  nearbyHours: z.number().describe("Include UK airports within this many hours of home. 2 if they're flexible on airports, 0 if they only want one"),
  returnTo: z.string().describe("IATA code if they want to land back at a specific airport, else empty string"),
  destinationMode: z.enum(["anywhere", "cities"]),
  cities: z.array(z.string()).describe("Destination city codes from the list. For vague wishes (e.g. 'somewhere hot') pick up to 8 that fit"),
  maxPerPerson: z.number().describe("Total budget per person in GBP, all in. 0 if not given"),
  dateMode: z.enum(["window", "flexible", "fixed"]),
  from: z.string().describe("YYYY-MM-DD: window start, or departure date for fixed/flexible"),
  to: z.string().describe("YYYY-MM-DD: window end, or return date for fixed/flexible"),
  minNights: z.number(),
  maxNights: z.number(),
  weekendsOnly: z.boolean(),
  flexDays: z.number().describe("For flexible dates: 1 to 3"),
  adults: z.number(),
  children: z.number(),
  checkedBag: z.boolean(),
  stayType: z.enum(["any", "hotel", "apartment"]),
  minRating: z.number().describe("Minimum accommodation rating out of 10. 7.5 unless they say otherwise"),
  maxCentreMins: z.number().describe("Max minutes from the centre. 20 unless they say otherwise"),
});

export type Plan = z.infer<typeof PlanSchema>;

const SYSTEM = `You turn a traveller's description of their ideal trip into search settings for a UK trip-finding app that searches flights + accommodation by total cost.

Rules:
- Only use airport and destination codes from the lists below. If they name somewhere not on the list, pick the closest match and say so in assumptions.
- Date windows can be at most 45 days long. If they give a longer period (e.g. "sometime in summer"), pick the cheapest-looking 45 days inside it and say so in assumptions.
- "Weekend" or "city break" means 2-3 nights leaving Thu-Sat unless they say otherwise. "A week" means 7 nights.
- School holidays, bank holidays and peak summer are expensive. If their dates allow, prefer a window just outside them and mention it in assumptions.
- Budgets are per person, all in, in pounds. If they give a group total, divide it.
- Never invent a home airport. If they don't say where they're from, leave homeAirport empty.
- Keep the summary and assumptions short and plain.

UK airports: ${UK_AIRPORTS.map((a) => `${a.code} ${a.city === a.name ? a.name : `${a.city} ${a.name}`}`).join("; ")}

Destinations (code, name, type): ${DESTINATIONS.map((d) => `${d.code} ${d.name} (${d.kind === "sun" ? "beach/sun" : "city"})`).join("; ")}`;

export class PlanError extends Error {}

export async function planFromText(text: string, homeAirport: string): Promise<Plan> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Today is ${todayUK()}.${homeAirport ? ` The user's saved home airport is ${homeAirport}.` : ""}\n\nTheir trip, in their words:\n<trip>${text}</trip>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new PlanError("Couldn't plan that trip. Try describing it differently.");
  if (!response.parsed_output) throw new PlanError("Couldn't understand that. Try adding where from, when and your budget.");
  return response.parsed_output;
}
