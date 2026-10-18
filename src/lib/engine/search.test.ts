import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, localHour, localToUtc, todayUK } from "../dates";
import { sampleFlights, sampleStays } from "../providers/sample";
import { _internal as lite } from "../providers/liteapi";
import { _internal as tp } from "../providers/travelpayouts";
import { getAirport } from "../data/airports";
import { getDestination } from "../data/destinations";
import { parseRequest, expandDates } from "./request";
import { candidateAirports, runSearch } from "./search";

const providers = { flights: sampleFlights, stays: sampleStays };
const start = addDays(todayUK(), 40);

function request(overrides: Record<string, unknown> = {}) {
  return {
    groups: [{ homeAirport: "MAN", extraAirports: [], nearbyHours: 2, adults: 2, children: 0 }],
    destination: { mode: "cities", cities: ["BCN"] },
    dates: { mode: "window", from: start, to: addDays(start, 27), minNights: 2, maxNights: 4, weekendsOnly: false },
    bags: "cabin",
    stay: { type: "any", minRating: 7.5, maxCentreMins: 20 },
    ...overrides,
  };
}

test("time zone conversion round-trips", () => {
  const iso = localToUtc("2027-07-01", 6 * 60 + 30, "Europe/Madrid");
  assert.equal(iso, "2027-07-01T04:30:00.000Z");
  assert.equal(localHour(iso, "Europe/Madrid"), 6.5);
  assert.equal(localToUtc("2027-01-10", 9 * 60, "Europe/London"), "2027-01-10T09:00:00.000Z");
});

test("rejects bad requests with a friendly message", () => {
  const r = parseRequest({ ...request(), groups: [] });
  assert.equal(r.ok, false);
  const bad = parseRequest(request({ dates: { mode: "window", from: start, to: addDays(start, 90), minNights: 2, maxNights: 3 } }));
  assert.equal(bad.ok, false);
});

test("flexible dates expand around the chosen dates", () => {
  const plan = expandDates({ mode: "flexible", depart: start, return: addDays(start, 3), flexDays: 1 });
  // 3x3 shifts, minus the two that change the length by 2 nights.
  assert.equal(plan.pairs.length, 7);
  assert.ok(plan.minNights >= 2 && plan.maxNights <= 4);
});

test("nearby airports from Manchester include Liverpool and Leeds", () => {
  const codes = candidateAirports({ id: "g", homeAirport: "MAN", extraAirports: [], nearbyHours: 2, adults: 1, children: 0 }).map((a) => a.code);
  assert.equal(codes[0], "MAN");
  assert.ok(codes.includes("LPL"));
  assert.ok(codes.includes("LBA"));
});

test("city search returns ranked trips with breakdowns and a heatmap", async () => {
  const parsed = parseRequest(request());
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 10);
  assert.ok(res.heatmap && res.heatmap.dates.length > 20);
  for (const t of res.trips) {
    const sum = t.costs.reduce((s, c) => s + c.amount, 0);
    assert.ok(Math.abs(sum - t.total) <= 1, "breakdown adds up to total");
    assert.ok(t.why.length > 0);
    assert.ok(t.smartScore >= t.total);
  }
  // Sorted by smart score.
  for (let i = 1; i < res.trips.length; i++) assert.ok(res.trips[i].smartScore >= res.trips[i - 1].smartScore);
  // Every heatmap cell points to a trip we sent.
  const ids = new Set(res.trips.map((t) => t.id));
  for (const c of Object.values(res.heatmap!.cells)) assert.ok(ids.has(c.tripId));
  assert.ok(res.meta.tookMs < 10_000, `took ${res.meta.tookMs}ms`);
  console.log("top:", res.trips[0].why, res.trips[0].total, "| took", res.meta.tookMs, "ms,", res.meta.combinationsChecked, "combos");
});

test("anywhere search respects the budget", async () => {
  const parsed = parseRequest(request({ destination: { mode: "anywhere", maxPerPerson: 250 } }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0);
  assert.ok(res.trips.every((t) => t.perPerson <= 250));
  assert.ok(res.destinations.length > 3);
  console.log("anywhere:", res.destinations.slice(0, 5).map((d) => `${d.code} £${d.perPerson}`).join(", "), "| took", res.meta.tookMs, "ms");
});

test("group mode combines travellers from different airports", async () => {
  const parsed = parseRequest(
    request({
      groups: [
        { id: "Manchester", homeAirport: "MAN", adults: 2 },
        { id: "London", homeAirport: "STN", adults: 1 },
      ],
    }),
  );
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0);
  assert.equal(res.trips[0].legs.length, 2);
  assert.equal(res.trips[0].people, 3);
});

test("Travelpayouts tickets are mapped and filtered", () => {
  assert.deepEqual(tp.monthsBetween("2026-11-20", "2027-01-05"), ["2026-11", "2026-12", "2027-01"]);
  const q = {
    origin: getAirport("STN")!,
    destinations: [getDestination("BCN")!],
    departFrom: "2027-03-01",
    departTo: "2027-03-31",
    minNights: 2,
    maxNights: 4,
    adults: 1,
    children: 0,
  };
  const ticket = {
    origin: "LON", destination: "BCN", origin_airport: "STN", destination_airport: "BCN", price: 61, airline: "FR",
    departure_at: "2027-03-12T06:30:00+00:00", return_at: "2027-03-15T21:10:00+01:00",
    transfers: 0, return_transfers: 0, duration_to: 125, duration_back: 130, link: "/search/STN1203BCN15031?t=abc",
  };
  const opt = tp.toOption(ticket, q, getDestination("BCN")!, "12345");
  assert.ok(opt);
  assert.equal(opt.departDate, "2027-03-12");
  assert.equal(opt.returnDate, "2027-03-15");
  assert.ok(opt.bookingUrl.includes("marker=12345"));
  assert.equal(tp.toOption({ ...ticket, origin_airport: "LTN" }, q, getDestination("BCN")!), null);
});

test("LiteAPI rates parse to the lowest price per hotel", () => {
  const rates = lite.parseRates({
    data: [
      { hotelId: "h1", roomTypes: [{ offerRetailRate: { amount: 300 }, rates: [{ cancellationPolicies: { refundableTag: "RFN" } }] }, { offerRetailRate: { amount: 250 }, rates: [] }] },
      { hotelId: "h2", roomTypes: [{ rates: [{ retailRate: { total: [{ amount: 199 }] }, cancellationPolicies: { refundableTag: "NRFN" } }] }] },
    ],
  });
  assert.equal(rates.get("h1")?.total, 250);
  assert.equal(rates.get("h2")?.total, 199);
  assert.equal(rates.get("h2")?.refundable, false);
  assert.deepEqual(lite.occupancies(3, 1), [{ adults: 2, children: [8] }, { adults: 1, children: [] }]);
});

test("sample accommodation has options matching the default filters in every city", async () => {
  const { DESTINATIONS } = await import("../data/destinations");
  const empty: string[] = [];
  for (const d of DESTINATIONS) {
    const r = await sampleStays.search({ destination: d, checkin: start, checkout: addDays(start, 2), adults: 2, children: 0, prefs: { type: "any", minRating: 7.5, maxCentreMins: 20 } });
    if (r.length === 0) empty.push(d.code);
  }
  assert.deepEqual(empty, []);
});
