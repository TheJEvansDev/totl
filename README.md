# Totl (working name)

Finds the cheapest **usable** trip by **total cost**: flights + accommodation +
bags + getting to and from the airports. It searches every combination of
nearby UK airports, dates and trip lengths, then ranks them with a "best value"
score that marks down 6am flights, long layovers, far-off airports and badly
located stays.

Phase 1: a web app for friends to test via a link. Works on phones and can be
added to the home screen.

## What's in it

- **Search from and to anywhere:** 3,180 airports worldwide with type-ahead
  search, cities with several airports (e.g. "London (all airports)"), home
  airport remembered, nearby airports by travel time, extra airports, "use my
  location", a destination list or "anywhere in budget" (popular places within
  sensible flying range for the trip length),
  exact/flexible/window dates, weekend-only option, travellers, bags,
  accommodation type, rating and distance filters
- **Describe your trip** box: type it in plain English ("2 of us from Bristol,
  somewhere warm in March, £350 each") and Claude fills in the search, listing
  anything it assumed
- **Fly out of one airport, home into another:** a clear "Fly home into"
  choice, e.g. out of Gatwick when it's cheap, back into Bristol. Uses two
  one-way tickets and costs the train to the far airport. Every trip also
  shows the other airport combinations it compared
- **Fly into a nearby airport:** Girona or Reus for Barcelona, Treviso for
  Venice and so on, with the coach into the city and the extra time costed in
- **Total-cost engine** with a line-by-line breakdown. Every estimate is
  marked "est."
- **Deals and possible error fares:** flights well below the typical price for
  that route in your search, with their own Deals tab
- **Where to stay, weighed up:** central vs cheapest vs further out, with
  day-ticket costs included and pros and cons for each
- **Same flights, other booking sites:** the top trips are re-checked on other
  countries' versions of the booking site (your own, the destination's, plus
  Türkiye, India and Brazil, which are often cheaper), shown in their currency
  and yours, with the catches (residents-only fares, needing a no-fee card)
- **Fly from a whole city or area:** "London (all airports)" picks all six;
  "Manchester area" adds the airports within about 90 km. Works worldwide
- **Starts by asking what you want:** "I know where I'm going", "Surprise
  me" (with "I'm feeling lucky", which opens the single best trip) or
  "Describe my trip"
- **Make the trip yours:** tap any other airport combination or place to
  stay to swap it in; the total, breakdown, times and Book buttons update,
  with "Back to our pick" to undo
- **No dead ends:** if your airport has nothing, it widens to airports within
  2, then 3 hours, and tells you
- **Step by step:** one section at a time, finished ones fold into a summary;
  returning visitors start with their airport filled in
- **No accommodation needed** option for staying with friends or family, or
  when it's already booked
- **Book direct:** budget airlines open the airline's own site (Ryanair and
  easyJet with the search filled in); full-service airlines show booking sites
  first, because they're sometimes cheaper, with the airline as an option
- **Light, dark or match the device**, with a toggle
- **Your currency:** prices shown in 32 currencies using daily European Central
  Bank rates, plus a tip to pay in the local currency with a no-fee card
- **Honest distances:** stays show km from the centre with a plain label
  ("In the centre", "Near the centre", "Outskirts"), estimated travel time
  marked as an estimate, and a map link
- **Ways to save:** compromises on the top trip (different dates, a night
  less, another airport, staying further out, no checked bags, another city)
- **Best value / Cheapest** sort toggle
- **"Why this is good value"** line, e.g. "Flying Thu instead of Fri saves £91"
- **Price calendar** (heatmap) of total trip price by departure date and nights
- **Map + list** of destinations for multi-destination and "anywhere" searches
- **Trip detail** with flight times, accommodation, booking links and an
  Airbnb comparison link
- **Saved searches** and **share links** (stored in the browser, no login)
- **Feedback button** on every screen
- Privacy page, affiliate disclosure, cookie-free analytics, installable (PWA)

## Sample data vs real data

With no API keys the app runs on **sample data**: realistic-looking but made-up
prices, clearly labelled on screen. Add keys and it switches automatically:

| Variable | What it's for | Where to get it |
|---|---|---|
| `SERPAPI_KEY` | Live flight prices (Google Flights) | serpapi.com → Dashboard → API key. Free plan: 250 lookups a month; one search uses about 10-20 |
| `LITEAPI_KEY` | Hotel prices | LiteAPI dashboard → API keys (sandbox key is fine to start) |
| `ANTHROPIC_API_KEY` | "Describe your trip" box (hidden without it) | console.anthropic.com → API keys. Costs roughly 1-3p per description with the default model |
| `FEEDBACK_WEBHOOK_URL` | Optional: sends feedback to a Discord channel | Discord channel → Edit → Integrations → Webhooks → New webhook → Copy URL |

You can add one at a time. For example, flights become real while
accommodation stays sample.

**Never paste keys into the code, a chat or a message.** They only go in
Vercel's settings (below) or a local `.env.local` file.

## Getting it online (no coding needed)

1. **GitHub:** create a free account, then a new **private** repository called
   `totl` (leave it empty). Send Claude the repository name and it can push the
   code for you.
2. **Vercel:** sign up at vercel.com with your GitHub account → **Add New →
   Project** → pick the `totl` repository → **Deploy**. In about a minute you
   get a link like `totl-xyz.vercel.app`. That's the link to send friends.
3. **Add API keys:** in Vercel, open the project → **Settings → Environment
   Variables** → add each variable from the table above → then **Deployments →
   ⋯ → Redeploy** so they take effect.
4. **Analytics (optional):** in Vercel open the project → **Analytics → Enable**.

Every time new code is pushed to GitHub, Vercel updates the live site
automatically.

## Before public launch: things to check

- **Estimated costs** in `src/lib/data/airports.ts` (train fares, parking) and
  `src/lib/data/destinations.ts` (transfers, typical hotel prices, bag fees)
  are rough figures and need checking against real prices.
- **Flight prices are live** from Google Flights via SerpApi. Each date checked
  costs one lookup, so a search is limited to 30 lookups (narrow windows work
  best). "Anywhere" searches only cover the places that fit in one lookup per
  date for now; Google's Explore results would make this much better.
- Cached Travelpayouts prices are no longer used (`travelpayouts.ts` is kept
  but not wired in), so the "other countries' booking sites" check is off.
- **SerpApi hasn't been tested with a real key yet.** The network here can't
  reach it; `/api/health` shows what comes back. The code follows their documented formats
  and handles errors, but the first real search may need small fixes.
- **Accommodation booking links** go to a Booking.com search with your dates,
  which earns nothing yet. Options: Booking.com affiliate programme, or LiteAPI's
  own booking pages.
- Map tiles come from OpenStreetMap, which is fine for testing. Switch to a
  proper tile provider before any real traffic.

## Limits worth knowing

- **Deals** are judged against the other prices in the same search, not a
  long-term price history. A proper deal feed needs a scanner that runs on a
  schedule, a database of past prices and alerts (Phase 2).
- **The AI box** uses Claude Opus 5.5. Switching `MODEL` in
  `src/lib/ai/plan.ts` to `claude-haiku-5-5` makes it much cheaper, though
  possibly less accurate on vague requests.

## Tuning the ranking

All "best value" penalties live in `src/lib/config/penalties.ts`, in pounds,
e.g. how much a 6am flight or a stop counts against a trip. Adjust them based
on testers' feedback. Search limits (max date window, how many trips get real
hotel prices) are in the same file.

## For developers

```bash
npm install
cp .env.example .env.local   # optional: add keys
npm run dev                  # http://localhost:3000
npm test                     # engine tests
npm run build
```

Next.js 15 (App Router) + TypeScript, no database.

```
src/lib/engine/        total-cost engine, request validation, ranking, explanations
src/lib/ai/            "describe your trip" planning with Claude
src/lib/providers/     sample, Travelpayouts (flights), LiteAPI (hotels), estimates
src/lib/data/          UK airports, destinations, airlines/bag fees
src/lib/config/        penalties and limits
src/components/        UI
src/app/api/           /api/search, /api/feedback
```

The data model already supports several traveller groups from different
airports (see `TravellerGroup`), so group trip mode (Phase 3) mostly needs UI.

## Roadmap

- **Phase 2:** email login and price-drop alerts, long-haul, positioning
  flights to avoid UK Air Passenger Duty, open-jaw trips, live fare check
  before booking
- **Phase 3:** group trip mode (friends in different cities, shared
  accommodation split), mobile app, error-fare/deal feed
