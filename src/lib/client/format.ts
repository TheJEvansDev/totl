import { getDestination } from "../data/destinations";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const money = (n: number) => gbp.format(n);

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
  return getDestination(code)?.name ?? code;
}

export function destTz(code: string): string {
  return getDestination(code)?.tz ?? "Europe/London";
}

export function duration(aIso: string, bIso: string): string {
  const mins = Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
