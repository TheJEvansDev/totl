import { cityName, tzOf } from "./places";

// Prices are worked out in GBP and shown in the chosen currency.
let display = { code: "GBP", rate: 1 };
let formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function setDisplayCurrency(code: string, ratePerGbp: number): void {
  display = { code, rate: ratePerGbp };
  formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: code, maximumFractionDigits: 0 });
}

export function displayCurrency(): { code: string; rate: number } {
  return display;
}

/** Format a GBP amount in the display currency. */
export const money = (gbp: number) => formatter.format(Math.round(gbp * display.rate));

/** Convert an amount the user typed in their currency back to GBP. */
export const toGbp = (amount: number) => amount / display.rate;
export const fromGbp = (gbp: number) => Math.round(gbp * display.rate);

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const shortDate = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

const dayNumFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const dowFmt = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
export const dayNum = (d: string) => dayNumFmt.format(new Date(`${d}T00:00:00Z`));
export const dowLetter = (d: string) => dowFmt.format(new Date(`${d}T00:00:00Z`));
export const monthShort = (d: string) => monthFmt.format(new Date(`${d}T00:00:00Z`));

export function time(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function destName(code: string): string {
  return cityName(code);
}

export function destTz(code: string): string {
  return tzOf(code);
}

export function duration(aIso: string, bIso: string): string {
  const mins = Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Turns {£123} markers in server text into the display currency. */
export function moneyText(text: string): string {
  return text.replace(/\{£(-?\d+(?:\.\d+)?)\}/g, (_, n: string) => money(Number(n)));
}
