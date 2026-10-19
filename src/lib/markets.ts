// Booking countries ("markets"). Airlines and booking sites price the same
// flight differently depending on which country's site you book through.
// Countries with weaker currencies are often priced lower to match local
// spending power, and their exchange rates can lag behind.

export interface Market {
  /** Travelpayouts market code (lower-case country code). */
  code: string;
  country: string;
  countryName: string;
  currency: string;
}

export const MARKETS: Market[] = [
  { code: "gb", country: "GB", countryName: "UK", currency: "GBP" },
  { code: "us", country: "US", countryName: "US", currency: "USD" },
  { code: "de", country: "DE", countryName: "German", currency: "EUR" },
  { code: "es", country: "ES", countryName: "Spanish", currency: "EUR" },
  { code: "fr", country: "FR", countryName: "French", currency: "EUR" },
  { code: "it", country: "IT", countryName: "Italian", currency: "EUR" },
  { code: "pt", country: "PT", countryName: "Portuguese", currency: "EUR" },
  { code: "nl", country: "NL", countryName: "Dutch", currency: "EUR" },
  { code: "ie", country: "IE", countryName: "Irish", currency: "EUR" },
  { code: "gr", country: "GR", countryName: "Greek", currency: "EUR" },
  { code: "pl", country: "PL", countryName: "Polish", currency: "PLN" },
  { code: "cz", country: "CZ", countryName: "Czech", currency: "CZK" },
  { code: "hu", country: "HU", countryName: "Hungarian", currency: "HUF" },
  { code: "tr", country: "TR", countryName: "Turkish", currency: "TRY" },
  { code: "in", country: "IN", countryName: "Indian", currency: "INR" },
  { code: "br", country: "BR", countryName: "Brazilian", currency: "BRL" },
  { code: "mx", country: "MX", countryName: "Mexican", currency: "MXN" },
  { code: "th", country: "TH", countryName: "Thai", currency: "THB" },
  { code: "za", country: "ZA", countryName: "South African", currency: "ZAR" },
  { code: "ae", country: "AE", countryName: "UAE", currency: "AED" },
  { code: "ca", country: "CA", countryName: "Canadian", currency: "CAD" },
  { code: "au", country: "AU", countryName: "Australian", currency: "AUD" },
];

/** Markets that are often cheaper, checked on every trip. */
const OFTEN_CHEAPER = ["tr", "in", "br"];

const byCountry = new Map(MARKETS.map((m) => [m.country, m]));
const byCode = new Map(MARKETS.map((m) => [m.code, m]));

export function marketByCode(code: string): Market | undefined {
  return byCode.get(code);
}

/**
 * Which booking countries to compare: your home country, the destination's
 * and the airline's country if we cover them, plus a few that are often cheaper.
 */
export function marketsToCheck(homeCountry: string, destCountry: string, max = 6): Market[] {
  const picked = new Map<string, Market>();
  for (const c of [homeCountry, destCountry]) {
    const m = byCountry.get(c);
    if (m) picked.set(m.code, m);
  }
  for (const code of OFTEN_CHEAPER) picked.set(code, byCode.get(code)!);
  if (picked.size < max && !picked.has("us")) picked.set("us", byCode.get("us")!);
  return [...picked.values()].slice(0, max);
}
