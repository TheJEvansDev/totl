import { NextResponse } from "next/server";

// Daily exchange rates from the European Central Bank (free, no key),
// re-based to GBP. Falls back to rough fixed rates if the feed is down.
const ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const FALLBACK_PER_GBP: Record<string, number> = {
  GBP: 1, EUR: 1.17, USD: 1.3, CAD: 1.8, AUD: 2, NZD: 2.2, CHF: 1.12, NOK: 14, SEK: 14, DKK: 8.7,
  PLN: 5, CZK: 29, HUF: 470, JPY: 195, CNY: 9.4, HKD: 10.1, SGD: 1.7, INR: 110, ZAR: 23, TRY: 50,
  AED: 4.8, THB: 44, MXN: 24, BRL: 7.2, KRW: 1800, ILS: 4.8, ISK: 180, RON: 5.9, BGN: 2.3, MYR: 5.8, IDR: 21000, PHP: 75,
};

// Fetched per request; the ECB response itself is cached for 12 hours, failures are not.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(ECB, { next: { revalidate: 43200 } });
    if (!res.ok) throw new Error(`ECB ${res.status}`);
    const xml = await res.text();
    const perEur: Record<string, number> = { EUR: 1 };
    for (const m of xml.matchAll(/currency='([A-Z]{3})' rate='([\d.]+)'/g)) perEur[m[1]] = Number(m[2]);
    const gbp = perEur.GBP;
    if (!gbp) throw new Error("No GBP rate");
    const perGbp = Object.fromEntries(Object.entries(perEur).map(([c, r]) => [c, r / gbp]));
    perGbp.GBP = 1;
    const date = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1] ?? null;
    return NextResponse.json({ base: "GBP", rates: perGbp, date, source: "European Central Bank" });
  } catch (err) {
    console.error("rates failed", err);
    return NextResponse.json({ base: "GBP", rates: FALLBACK_PER_GBP, date: null, source: "approximate" });
  }
}
