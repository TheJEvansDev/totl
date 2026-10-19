// Turns a typed trip description ("4 of us, somewhere hot in May, under £400
// each, from Bristol") into a search. Claude only fills in search settings;
// the normal validator checks them before anything runs.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { todayUK } from "../dates";

// Cheaper alternative if costs matter: "claude-haiku-5-5".
const MODEL = "claude-opus-5-5";

const PlanSchema = z.object({
  summary: z.string().describe("One short sentence restating the trip in plain British English"),
  assumptions: z.array(z.string()).describe("Anything you had to assume or guess, in plain words. Empty if nothing."),
  homeAirport: z.string().describe("IATA airport code of the user's home airport, or empty string if unknown"),
  extraAirports: z.array(z.string()).describe("Other departure airports the user mentioned (IATA airport codes)"),
  nearbyHours: z.number().describe("Include airports in the same country within this many hours of home. 2 if they're flexible on airports, 0 if they only want one"),
  returnTo: z.string().describe("IATA code if they want to land back at a specific airport, else empty string"),
  destinationMode: z.enum(["anywhere", "cities"]),
  cities: z.array(z.string()).describe("Destination IATA codes: city codes for multi-airport cities (LON, PAR, NYC, MIL, ROM, TYO...) or airport codes otherwise. For vague wishes (e.g. 'somewhere hot') pick up to 8 that fit"),
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
  stayType: z.enum(["any", "hotel", "apartment", "none"]).describe("'none' if they're staying with friends or family, or already have accommodation booked"),
  minRating: z.number().describe("Minimum accommodation rating out of 10. 7.5 unless they say otherwise"),
  maxCentreKm: z.number().describe("Max straight-line km from the centre: 1.5 for 'central', 4 by default, 7 if they don't mind the outskirts"),
});

export type Plan = z.infer<typeof PlanSchema>;

const SYSTEM = `You turn a traveller's description of their ideal trip into search settings for a trip-finding app that searches flights + accommodation by total cost, from and to anywhere in the world.

Rules:
- Use real IATA codes. Departure airports must be airport codes (e.g. BRS, JFK). Destinations can be city codes for multi-airport cities or airport codes. If you're unsure a place has a commercial airport, pick the nearest one that does and say so in assumptions.
- Date windows can be at most 45 days long. If they give a longer period (e.g. "sometime in summer"), pick the cheapest-looking 45 days inside it and say so in assumptions.
- "Weekend" or "city break" means 2-3 nights leaving Thu-Sat unless they say otherwise. "A week" means 7 nights.
- School holidays, bank holidays and peak summer are expensive. If their dates allow, prefer a window just outside them and mention it in assumptions.
- Budgets are per person, all in, in pounds. If they give a group total, divide it.
- Never invent a home airport. If they don't say where they're from, leave homeAirport empty.
- Keep the summary and assumptions short and plain, in British English.`;

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
