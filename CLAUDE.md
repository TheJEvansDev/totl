# Totl: notes for Claude

Trip finder (any airport worldwide, UK-first) that ranks trips by **total cost** (flights + bags + getting to
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
  `index.ts` by env vars. Flights are live only: `serpapi.ts` (Google Flights
  via SerpApi, `SERPAPI_KEY`), one-way lookups per exact date with all airports
  comma-separated (`searchOneWayDates`), capped at `LIMITS.liveLookups` per
  search. Travelpayouts (cached) is no longer wired in; don't bring it back.
  Stays: `googlehotels.ts` (Google Hotels via the same SerpApi key) when
  `SERPAPI_KEY` is set, else LiteAPI (live key needs business details), else
  sample. Live stays price `LIMITS.liveStayLookups` combos; the rest are scaled
  typical prices.
  Firecrawl (`firecrawl.ts`, `FIRECRAWL_API_KEY`, 5 credits a call): Skyscanner
  price calendar as a radar (`pickCheapPairs` narrows dates, ranks "anywhere"
  places; never shown as prices), and live Google Flights as a backup source.
- `src/lib/ai/plan.ts`: "Describe your trip" → structured search via Claude.
- `src/lib/data/places.ts`: worldwide airports/cities (server only, from
  `world-airports.json`, rebuilt with `scripts/build-airports.py`), metro city
  codes, country cost tiers, place search. Hand-entered UK airports
  (`airports.ts`) and destinations (`destinations.ts`) override it.
- Departure pickers accept cities ("LON" = all London airports) and areas
  ("MAN+" = an airport plus same-country airports within 90 km), expanded by
  `areaAirports()` via `/api/places?expand=`.
- The browser never loads the airport list: names come via `/api/places` and
  `places` in search responses (`src/lib/client/places.ts`).
- Money is GBP on the server. Server text writes amounts as `{£123}`; the UI
  converts with `moneyText()`/`money()` into the chosen currency (`/api/rates`, ECB).
- Booking-country prices (live: top trip only, both one-way tickets re-checked
  with Google's `gl`/`currency` set per country, exact flight numbers only) (`src/lib/markets.ts`, `checkBookingCountries` in
  search.ts): top trips are re-priced on other countries' sites (Travelpayouts
  `market` param). Shown as an option, never added to totals; always with the
  residency/card caveats.
- Stay distance is measured in km (`src/lib/area.ts`); minutes are estimates
  and must be labelled as such.
- First screen asks what they want (`IntentChooser.tsx`): a specific place
  ("pick"), "Surprise me" (anywhere in budget, with "I'm feeling lucky" that
  opens the best trip), or describe (AI). The form hides the destination-mode
  switch once chosen.
- Customising a trip (`src/lib/customise.ts`): tapping an airport option or a
  stay alternative swaps it in without a new search. Relies on cost lines and
  penalties being tagged `kind: "flight" | "stay"`; keep tagging new ones.
- Nearby arrival airports (`nearbyArrivalAirports`, e.g. Girona/Reus for
  Barcelona): searched for up to 3 chosen cities; flights are remapped to the
  city with `leg.viaAirport` set and a coach line (`arrivalTransfer`) instead of
  the usual airport transfer. The transfer line now lives in `legCostLines`.
- If nothing is found, `runSearch` widens to airports within 2 then 3 hours,
  then (not for live prices) to dates a week either side, and says so (`allowWiden`).
- `/api/health` (`src/app/api/health/route.ts`): checks the real flight, hotel
  and rates connections with the deployed keys and shows raw data shapes.
  Never return key values from it.
- `src/components/`: UI. `App.tsx` holds state; `Sheet.tsx` is the swipeable sheet;
  `SearchForm.tsx` is step-by-step (`Step`), folded after a search via `formKey`.
- `src/lib/airlineSites.ts`: airline websites and Book buttons. Budget airlines
  lead with "Book direct", full-service with "Compare booking sites". Only add a
  pre-filled `search` link when its format is verified.
- Stay type `none` = staying with friends/family or already booked: no stay costs.
- Bags: `small` (under seat, free), `cabin` (overhead; budget airlines charge,
  `cabinBagFee`), `checked`. Live deals use Google's `typical_price_range`, never
  the spread of fares within one search.
- Theme: Auto/Light/Dark (`ThemeToggle.tsx`), `data-theme` on `<html>`.

## Rules

- Never show sample data as real: it's labelled in the UI and hotel names end "(sample)".
- Never invent demand signals ("X people looking"). Only show what a provider
  actually returns or what we measure ourselves.
- Estimates must be marked `estimated: true` in cost lines.
- Design follows Apple's principles: instant press feedback, sheets leave the
  way they came, respect reduced motion/transparency/contrast, size-specific
  letter-spacing.
- SerpApi was written against docs but not yet tested with a real key.
- Live lookups cost money: never add one without counting it in `lookupsFor`.
