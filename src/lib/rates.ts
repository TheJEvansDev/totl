// Exchange rates per 1 GBP, from the European Central Bank's daily feed (free,
// no key). Cached for 12 hours; falls back to rough fixed rates if the feed is down.

const ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const TTL_MS = 12 * 3_600_000;

export const FALLBACK_PER_GBP: Record<string, number> = {
  GBP: 1, EUR: 1.17, USD: 1.3, CAD: 1.8, AUD: 2, NZD: 2.2, CHF: 1.12, NOK: 14, SEK: 14, DKK: 8.7,
  PLN: 5, CZK: 29, HUF: 470, JPY: 195, CNY: 9.4, HKD: 10.1, SGD: 1.7, INR: 110, ZAR: 23, TRY: 50,
  AED: 4.8, THB: 44, MXN: 24, BRL: 7.2, KRW: 1800, ILS: 4.8, ISK: 180, RON: 5.9, BGN: 2.3, MYR: 5.8, IDR: 21000, PHP: 75,
};

export interface Rates {
  rates: Record<string, number>;
  date: string | null;
  source: string;
}

let cached: { value: Rates; expires: number } | null = null;

export async function getRates(): Promise<Rates> {
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const res = await fetch(ECB, { next: { revalidate: TTL_MS / 1000 } });
    if (!res.ok) throw new Error(`ECB ${res.status}`);
    const xml = await res.text();
    const perEur: Record<string, number> = { EUR: 1 };
    for (const m of xml.matchAll(/currency='([A-Z]{3})' rate='([\d.]+)'/g)) perEur[m[1]] = Number(m[2]);
    const gbp = perEur.GBP;
    if (!gbp) throw new Error("No GBP rate");
    const rates = Object.fromEntries(Object.entries(perEur).map(([c, r]) => [c, r / gbp]));
    rates.GBP = 1;
    const value = { rates, date: xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1] ?? null, source: "European Central Bank" };
    cached = { value, expires: Date.now() + TTL_MS };
    return value;
  } catch (err) {
    console.error("rates failed", err);
    // Don't cache the fallback for long, so a recovered feed is picked up.
    const value = { rates: FALLBACK_PER_GBP, date: null, source: "approximate" };
    cached = { value, expires: Date.now() + 10 * 60_000 };
    return value;
  }
}
