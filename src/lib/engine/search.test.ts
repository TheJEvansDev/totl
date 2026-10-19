import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, localHour, localToUtc, todayUK } from "../dates";
import { sampleFlights, sampleStays } from "../providers/sample";
import { _internal as lite } from "../providers/liteapi";
import { _internal as tp } from "../providers/travelpayouts";
import { getAirport, getDestination } from "../data/places";
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
    stay: { type: "any", minRating: 7.5, maxCentreKm: 4 },
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
  const codes = candidateAirports({ id: "g", homeAirport: "MAN", extraAirports: [], nearbyHours: 2, mixAirports: true, returnTo: "", adults: 1, children: 0 }).map((a) => a.code);
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
    const r = await sampleStays.search({ destination: d, checkin: start, checkout: addDays(start, 2), adults: 2, children: 0, prefs: { type: "any", minRating: 7.5, maxCentreKm: 4 } });
    if (r.length === 0) empty.push(d.code);
  }
  assert.deepEqual(empty, []);
});

test("can fly out of one airport and home into another", async () => {
  const parsed = parseRequest(
    request({
      groups: [{ homeAirport: "BRS", extraAirports: ["STN", "LGW"], nearbyHours: 0, adults: 2 }],
      destination: { mode: "cities", cities: ["BCN", "AMS"] },
    }),
  );
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  // Every trip shows the other airport pairs it compared, including mixed ones.
  const options = res.trips.flatMap((t) => t.airportOptions);
  const mixedOption = options.find((o) => o.out !== o.back);
  assert.ok(mixedOption, "mixed airport pairs are compared");
  assert.ok(mixedOption.returnBookingUrl, "separate return booking link");

  // Asking to fly home into Bristol only returns trips that land there.
  const homeBrs = parseRequest(
    request({
      groups: [{ homeAirport: "BRS", extraAirports: ["STN", "LGW"], returnTo: "BRS", adults: 2 }],
      destination: { mode: "cities", cities: ["BCN", "AMS"] },
    }),
  );
  assert.ok(homeBrs.ok);
  const resBrs = await runSearch(homeBrs.value, providers);
  assert.ok(resBrs.trips.length > 0);
  assert.ok(resBrs.trips.every((t) => t.legs[0].flight.returnAirport === "BRS"));
  const mixed = resBrs.trips.find((t) => t.legs[0].flight.origin !== "BRS");
  assert.ok(mixed, "some trips fly out of London and home into Bristol");
  assert.ok(mixed.costs.some((c) => c.label.includes("two one-way tickets")));
  console.log("mixed:", mixed.legs[0].flight.origin, "→", mixed.legs[0].flight.returnAirport, "|", mixed.why, "|", mixed.legs[0].groundNote);

  const off = parseRequest(request({ groups: [{ homeAirport: "BRS", extraAirports: ["STN"], mixAirports: false, adults: 2 }] }));
  assert.ok(off.ok);
  const resOff = await runSearch(off.value, providers);
  assert.ok(resOff.trips.every((t) => t.legs[0].flight.returnAirport === t.legs[0].flight.origin));
});

test("accommodation comparison lists further-out options with pros and cons", async () => {
  const parsed = parseRequest(request({ destination: { mode: "cities", cities: ["AMS"] } }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  const withAlts = res.trips.filter((t) => t.stayAlternatives.length > 1);
  assert.ok(withAlts.length > 0);
  const t = withAlts[0];
  assert.equal(t.stayAlternatives[0].label, "Chosen");
  assert.ok(t.stay.centreKm === null || t.stay.centreKm <= 4, "chosen stay respects the filter");
  const further = res.trips.flatMap((x) => x.stayAlternatives).find((a) => a.label === "Further out");
  assert.ok(further, "a further-out option is offered");
  assert.ok(further.cons.some((c) => c.includes("km from the centre")));
  assert.ok(further.stay.centreKm! <= 7, "never suggests anywhere remote");
  console.log("further out:", further.stay.name, further.stay.centreKm, "km, net", further.netVsChosen, "|", further.pros.concat(further.cons).join("; "));
});

test("flags deals well below the typical price", async () => {
  const parsed = parseRequest(
    request({
      groups: [{ homeAirport: "MAN", nearbyHours: 2, adults: 1 }],
      destination: { mode: "anywhere", maxPerPerson: 2000 },
      dates: { mode: "window", from: start, to: addDays(start, 40), minNights: 2, maxNights: 5, weekendsOnly: false },
    }),
  );
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  const deals = res.trips.filter((t) => t.deal);
  assert.ok(deals.length > 0, "sample data includes some deals");
  for (const d of deals) assert.ok(d.flags[0].includes("below typical"));
  console.log("deals:", deals.length, deals.slice(0, 3).map((d) => `${d.destination} ${d.deal!.kind} ${d.deal!.pctBelow}%`).join(", "), "| took", res.meta.tookMs, "ms");
});

test("suggests compromises that save money against the top trip", async () => {
  const parsed = parseRequest(request({ destination: { mode: "cities", cities: ["AMS", "BCN"] }, bags: "checked" }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.compromises.length > 0);
  for (const c of res.compromises) assert.ok(c.saving >= 15);
  assert.ok(res.compromises.some((c) => c.label.includes("cabin bags")));
  const ids = new Set(res.trips.map((t) => t.id));
  for (const c of res.compromises) if (c.tripId) assert.ok(ids.has(c.tripId));
  console.log("compromises:", res.compromises.map((c) => `${c.label} (£${c.saving})`).join("; "));
});

test("an AI plan becomes a valid search", async () => {
  const { planToRequest } = await import("../ai/toRequest");
  const { defaultRequest } = await import("../../components/SearchForm");
  const plan = {
    summary: "Two of you from Bristol, somewhere warm in March for 4-5 nights, about £350 each",
    assumptions: [],
    homeAirport: "BRS",
    extraAirports: ["STN", "XXX"],
    nearbyHours: 2,
    returnTo: "BRS",
    destinationMode: "cities" as const,
    cities: ["AGP", "FAO", "TCI", "NOPE"],
    maxPerPerson: 350,
    dateMode: "window" as const,
    from: start,
    to: addDays(start, 30),
    minNights: 4,
    maxNights: 5,
    weekendsOnly: false,
    flexDays: 0,
    adults: 2,
    children: 0,
    checkedBag: false,
    stayType: "apartment" as const,
    minRating: 0,
    maxCentreKm: 0,
  };
  const req = planToRequest(plan, defaultRequest("MAN"));
  assert.equal(req.groups[0].homeAirport, "BRS");
  assert.deepEqual(req.groups[0].extraAirports, ["STN"]);
  assert.deepEqual(req.destination, { mode: "cities", cities: ["AGP", "FAO", "TCI"] });
  assert.equal(req.stay.minRating, 7.5);
  const parsed = parseRequest(req);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0);
});

test("place search finds airports and cities worldwide", async () => {
  const { searchPlaces, getAirport: ga, nearbyAirports } = await import("../data/places");
  assert.equal(searchPlaces("bristol", { cities: false })[0].code, "BRS");
  assert.equal(searchPlaces("new york", { cities: true })[0].code, "NYC");
  assert.equal(searchPlaces("LHR", { cities: false })[0].code, "LHR");
  assert.equal(searchPlaces("málaga", { cities: true })[0].code, "AGP");
  // Every UK airport with scheduled flights is there, not just the hand-entered ones.
  for (const code of ["JER", "GCI", "IOM", "SOU", "NQY", "DND", "KOI", "LSI", "BHD", "LDY"]) assert.ok(ga(code), `${code} missing`);
  const near = nearbyAirports(ga("MAN")!, "GB", 2).map((a) => a.code);
  assert.ok(near.includes("LPL") && !near.includes("DUB"));
});

test("searches from outside the UK, including long-haul", async () => {
  const parsed = parseRequest(
    request({
      groups: [{ homeAirport: "JFK", nearbyHours: 1.5, adults: 2 }],
      destination: { mode: "anywhere", maxPerPerson: 3000 },
      dates: { mode: "window", from: start, to: addDays(start, 20), minNights: 6, maxNights: 7, weekendsOnly: false },
    }),
  );
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0);
  const dests = new Set(res.trips.map((t) => t.destination));
  assert.ok(res.places.JFK && res.places.JFK.tz === "America/New_York");
  for (const t of res.trips.slice(0, 5)) assert.ok(res.places[t.destination], `no name for ${t.destination}`);
  console.log("from JFK:", [...dests].slice(0, 8).join(", "), "| took", res.meta.tookMs, "ms");

  const lh = parseRequest(request({ groups: [{ homeAirport: "LHR", adults: 1 }], destination: { mode: "cities", cities: ["BKK", "NYC"] }, dates: { mode: "window", from: start, to: addDays(start, 14), minNights: 7, maxNights: 9, weekendsOnly: false } }));
  assert.ok(lh.ok);
  const resLh = await runSearch(lh.value, providers);
  assert.ok(resLh.trips.some((t) => t.destination === "BKK") && resLh.trips.some((t) => t.destination === "NYC"));
  const bkk = resLh.trips.find((t) => t.destination === "BKK")!;
  console.log("LHR-BKK:", `£${bkk.legs[0].flight.pricePerPerson} pp`, Math.round((Date.parse(bkk.legs[0].flight.outArrive) - Date.parse(bkk.legs[0].flight.outDepart)) / 3.6e6), "hrs");
});

test("compares the same flights on other countries' booking sites", async () => {
  const parsed = parseRequest(request({ destination: { mode: "cities", cities: ["BCN", "IST"] } }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  const checked = res.trips.filter((t) => t.marketPrices.length > 0);
  assert.ok(checked.length > 0, "top trips are compared");
  for (const t of checked) {
    assert.ok(!t.marketPrices.some((m) => m.market === "gb"), "home market isn't compared against itself");
    for (let i = 1; i < t.marketPrices.length; i++) assert.ok(t.marketPrices[i].pricePerPerson >= t.marketPrices[i - 1].pricePerPerson);
    const tr = t.marketPrices.find((m) => m.market === "tr");
    if (tr) assert.ok(tr.localAmount > tr.pricePerPerson * 10, "lira amount is converted");
  }
  const flagged = res.trips.find((t) => t.flags.some((f) => f.startsWith("Cheaper on the")));
  console.log("markets:", checked[0].marketPrices.map((m) => `${m.countryName} ${m.currency} ${m.localAmount} (save £${m.saving})`).join("; "), "| flagged:", flagged?.flags.find((f) => f.startsWith("Cheaper")));
});

test("trips without accommodation (staying with friends or already booked)", async () => {
  const parsed = parseRequest(request({ stay: { type: "none", minRating: 7.5, maxCentreKm: 4 } }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0);
  for (const t of res.trips) {
    assert.equal(t.stay.source, "none");
    assert.ok(!t.costs.some((c) => /accommodation|Day tickets/i.test(c.label)), "no stay costs");
    assert.equal(t.stayAlternatives.length, 0);
  }
  assert.ok(!Object.values(res.heatmap!.cells).some((c) => c.estimated), "no typical-price markers");
});

test("booking buttons send budget airlines direct and compare full-service ones", async () => {
  const { bookingOptions } = await import("../airlineSites");
  const q = { from: "MAN", to: "BCN", depart: "2027-03-12", ret: "2027-03-15", adults: 2, children: 1 };
  const fr = bookingOptions("FR", q, "https://compare.example", "MAN → Barcelona");
  assert.equal(fr[0].label, "Book direct with Ryanair");
  assert.ok(fr[0].primary && !fr[0].sponsored);
  const url = new URL(fr[0].url);
  assert.equal(url.searchParams.get("originIata"), "MAN");
  assert.equal(url.searchParams.get("dateIn"), "2027-03-15");
  assert.equal(url.searchParams.get("children"), "1");
  const oneWay = new URL(bookingOptions("U2", { ...q, ret: "" }, "x", "r")[0].url);
  assert.equal(oneWay.searchParams.get("isOneWay"), "on");
  const ba = bookingOptions("BA", q, "https://compare.example", "r");
  assert.ok(ba[0].label.startsWith("Compare") && ba[0].primary);
  assert.ok(ba[1].label === "Book direct with British Airways" && ba[1].note.includes("Search MAN to BCN, Fri 12 Mar to Mon 15 Mar"));
  assert.equal(bookingOptions("ZZ", q, "x", "r").length, 1);
});

test("widens to nearby airports when the home airport has no flights", async () => {
  const { DESTINATIONS } = await import("../data/destinations");
  // Find a destination Newquay (a small airport) doesn't fly to in the sample data.
  let missing: string | null = null;
  for (const d of DESTINATIONS) {
    const p = parseRequest(request({ groups: [{ homeAirport: "NQY", nearbyHours: 0, adults: 1 }], destination: { mode: "cities", cities: [d.code] } }));
    assert.ok(p.ok);
    const direct = await sampleFlights.search({
      origin: (await import("../data/places")).getAirport("NQY")!,
      destinations: [d],
      departFrom: start,
      departTo: addDays(start, 27),
      minNights: 2,
      maxNights: 4,
      adults: 1,
      children: 0,
    });
    if (direct.length === 0) {
      missing = d.code;
      break;
    }
  }
  assert.ok(missing, "a route Newquay doesn't serve");
  const parsed = parseRequest(request({ groups: [{ homeAirport: "NQY", nearbyHours: 0, adults: 1 }], destination: { mode: "cities", cities: [missing] }, stay: { type: "none", minRating: 7.5, maxCentreKm: 4 } }));
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  assert.ok(res.trips.length > 0, "found trips from nearby airports");
  assert.ok(/airports within [23] hours/.test(res.meta.warnings[0]));
});

test("sample one-way flights have sensible durations", async () => {
  const { getAirport: ga, getDestination: gd } = await import("../data/places");
  for (const direction of ["out", "back"] as const) {
    const flights = await sampleFlights.searchOneWay({ direction, airport: ga("LHR")!, destinations: [gd("BER")!], dateFrom: start, dateTo: addDays(start, 6), adults: 1, children: 0 });
    assert.ok(flights.length > 0);
    for (const f of flights) {
      const hours = (Date.parse(f.arrive) - Date.parse(f.depart)) / 3.6e6;
      assert.ok(hours > 1 && hours < 3, `${direction} LHR-BER took ${hours} hrs`);
    }
  }
});

test("swapping in alternative flights or stays recalculates the trip", async () => {
  const { swapFlights, swapStay } = await import("../customise");
  const parsed = parseRequest(
    request({ groups: [{ homeAirport: "BRS", extraAirports: ["STN", "LGW"], adults: 2 }], destination: { mode: "cities", cities: ["AMS"] } }),
  );
  assert.ok(parsed.ok);
  const res = await runSearch(parsed.value, providers);
  const t = res.trips.find((x) => x.airportOptions.length > 1 && x.stayAlternatives.length > 1);
  assert.ok(t, "a trip with both kinds of alternative");
  const addUp = (x: typeof t) => assert.equal(x.total, Math.round(x.costs.reduce((s, c) => s + c.amount, 0)));

  const other = t.airportOptions.find((o) => o.leg.flight.id !== t.legs[0].flight.id)!;
  const swapped = swapFlights(t, other);
  addUp(swapped);
  assert.equal(swapped.legs[0].flight.id, other.leg.flight.id);
  // The change in total matches what the option said it would be.
  assert.ok(Math.abs(swapped.total - t.total - other.totalDelta) <= 2, `${swapped.total - t.total} vs ${other.totalDelta}`);
  assert.equal(swapped.stay.id, t.stay.id, "stay unchanged");

  const alt = t.stayAlternatives.find((a) => a.stay.id !== t.stay.id)!;
  const both = swapStay(swapped, alt);
  addUp(both);
  assert.equal(both.stay.id, alt.stay.id);
  assert.equal(both.legs[0].flight.id, other.leg.flight.id, "flights kept");
  assert.ok(Math.abs(both.total - swapped.total - alt.netVsChosen) <= 2, `${both.total - swapped.total} vs ${alt.netVsChosen}`);
});
