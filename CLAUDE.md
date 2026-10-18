# Totl: notes for Claude

UK trip finder that ranks trips by **total cost** (flights + bags + getting to
the airport + accommodation + local transport + transfers), not flight price.
The owner doesn't code: explain changes in plain British English, no em dashes.

## Commands

- `npm test`: engine tests (sample data, ~15s). Run after any engine change.
- `npm run typecheck`, `npm run build`
- `npm run dev`: http://localhost:3000

## Where things live

- `src/lib/engine/search.ts`: the core. `runSearch` → round trips per airport →
  `mixedAirportTrips` (one-way pairs, out of A / home into B) → best leg per
  destination+dates (smart and cheapest) → estimated stays → real stays for a
  shortlist (`chooseStay` adds further-out alternatives) → deals → airport
  options → `explain` → heatmap → `findCompromises`.
- `src/lib/engine/costs.ts`: ground costs, penalties, stay commute costs.
- `src/lib/engine/request.ts`: validation of every search (AI plans go through it too).
- `src/lib/config/penalties.ts`: all ranking weights and limits.
- `src/lib/providers/`: `sample.ts` (deterministic fake data), `travelpayouts.ts`
  (flights, cached prices), `liteapi.ts` (hotels), `estimate.ts`. Chosen in
  `index.ts` by env vars.
- `src/lib/ai/plan.ts`: "Describe your trip" → structured search via Claude.
- `src/lib/data/`: airports, destinations, bag fees, day tickets. Estimates.
- `src/components/`: UI. `App.tsx` holds state; `Sheet.tsx` is the swipeable sheet.

## Rules

- Never show sample data as real: it's labelled in the UI and hotel names end "(sample)".
- Never invent demand signals ("X people looking"). Only show what a provider
  actually returns or what we measure ourselves.
- Estimates must be marked `estimated: true` in cost lines.
- Design follows Apple's principles: instant press feedback, sheets leave the
  way they came, respect reduced motion/transparency/contrast, size-specific
  letter-spacing.
- Travelpayouts and LiteAPI were written against docs but not yet tested with
  real keys.
