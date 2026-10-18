// Display currencies. Prices are worked out in GBP and converted for display.

export const CURRENCIES = [
  "GBP", "EUR", "USD", "CAD", "AUD", "NZD", "CHF", "NOK", "SEK", "DKK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY",
  "AED", "ILS", "INR", "THB", "SGD", "MYR", "IDR", "PHP", "HKD", "CNY", "JPY", "KRW", "ZAR", "MXN", "BRL",
] as const;

const EURO = "AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK".split(" ");
const BY_COUNTRY: Record<string, string> = {
  GB: "GBP", JE: "GBP", GG: "GBP", IM: "GBP", GI: "GBP", US: "USD", PR: "USD", CA: "CAD", AU: "AUD", NZ: "NZD",
  CH: "CHF", LI: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", FO: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", BG: "BGN", TR: "TRY", AE: "AED", IL: "ILS", IN: "INR", TH: "THB", SG: "SGD", MY: "MYR", ID: "IDR",
  PH: "PHP", HK: "HKD", CN: "CNY", JP: "JPY", KR: "KRW", ZA: "ZAR", MX: "MXN", BR: "BRL", MA: "MAD", EG: "EGP",
  VN: "VND", LK: "LKR", MV: "USD", DO: "DOP", JM: "JMD", BB: "BBD", CU: "CUP", RS: "RSD", AL: "ALL", BA: "BAM",
  MK: "MKD", GE: "GEL", QA: "QAR", JO: "JOD", TN: "TND", KE: "KES", TZ: "TZS", AR: "ARS", CO: "COP", PE: "PEN", CL: "CLP",
};

export function currencyForCountry(countryCode: string): string | undefined {
  if (EURO.includes(countryCode)) return "EUR";
  return BY_COUNTRY[countryCode];
}

/** The display currency for someone flying from this country, if we support it. */
export function defaultCurrency(countryCode: string): string {
  const c = currencyForCountry(countryCode);
  return c && (CURRENCIES as readonly string[]).includes(c) ? c : "GBP";
}

export function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en-GB"], { type: "currency" }).of(code);
    return name ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}
