// Airlines' own websites, and how to send people there.
//
// Budget airlines are almost always cheapest booked direct (booking sites add
// fees), so for them the main button goes to the airline. Full-service
// airlines are sometimes cheaper through a booking site, so for them we show
// both and lead with the booking site where we found the price.
//
// Only Ryanair and easyJet links pre-fill the search; their link formats are
// well known. For the rest we open the airline's site and show what to enter,
// rather than guess a link format that could break.

export interface AirlineSite {
  name: string;
  /** Budget airline: book direct by default. */
  budget: boolean;
  home: string;
  /** Builds a pre-filled search link, where the format is known. */
  search?: (q: SearchLinkQuery) => string;
}

export interface SearchLinkQuery {
  from: string;
  to: string;
  depart: string;
  /** Empty for one-way. */
  ret: string;
  adults: number;
  children: number;
}

export const AIRLINE_SITES: Record<string, AirlineSite> = {
  FR: {
    name: "Ryanair",
    budget: true,
    home: "https://www.ryanair.com",
    search: (q) => {
      const u = new URL("https://www.ryanair.com/gb/en/trip/flights/select");
      u.searchParams.set("adults", String(q.adults));
      u.searchParams.set("teens", "0");
      u.searchParams.set("children", String(q.children));
      u.searchParams.set("infants", "0");
      u.searchParams.set("dateOut", q.depart);
      if (q.ret) u.searchParams.set("dateIn", q.ret);
      u.searchParams.set("isConnectedFlight", "false");
      u.searchParams.set("isReturn", q.ret ? "true" : "false");
      u.searchParams.set("discount", "0");
      u.searchParams.set("originIata", q.from);
      u.searchParams.set("destinationIata", q.to);
      return u.toString();
    },
  },
  U2: {
    name: "easyJet",
    budget: true,
    home: "https://www.easyjet.com",
    search: (q) => {
      const u = new URL("https://www.easyjet.com/deeplink");
      u.searchParams.set("lang", "EN");
      u.searchParams.set("dep", q.from);
      u.searchParams.set("dest", q.to);
      u.searchParams.set("dd", q.depart);
      if (q.ret) u.searchParams.set("rd", q.ret);
      u.searchParams.set("apax", String(q.adults));
      u.searchParams.set("cpax", String(q.children));
      u.searchParams.set("ipax", "0");
      u.searchParams.set("isOneWay", q.ret ? "off" : "on");
      return u.toString();
    },
  },
  LS: { name: "Jet2", budget: true, home: "https://www.jet2.com" },
  W6: { name: "Wizz Air", budget: true, home: "https://wizzair.com" },
  VY: { name: "Vueling", budget: true, home: "https://www.vueling.com" },
  TOM: { name: "TUI", budget: true, home: "https://www.tui.co.uk" },
  PC: { name: "Pegasus", budget: true, home: "https://www.flypgs.com" },
  FZ: { name: "flydubai", budget: true, home: "https://www.flydubai.com" },
  "6E": { name: "IndiGo", budget: true, home: "https://www.goindigo.in" },
  B6: { name: "JetBlue", budget: true, home: "https://www.jetblue.com" },
  WN: { name: "Southwest", budget: true, home: "https://www.southwest.com" },
  NK: { name: "Spirit", budget: true, home: "https://www.spirit.com" },
  BA: { name: "British Airways", budget: false, home: "https://www.britishairways.com" },
  VS: { name: "Virgin Atlantic", budget: false, home: "https://www.virginatlantic.com" },
  EI: { name: "Aer Lingus", budget: false, home: "https://www.aerlingus.com" },
  KL: { name: "KLM", budget: false, home: "https://www.klm.com" },
  AF: { name: "Air France", budget: false, home: "https://www.airfrance.com" },
  LH: { name: "Lufthansa", budget: false, home: "https://www.lufthansa.com" },
  LX: { name: "Swiss", budget: false, home: "https://www.swiss.com" },
  OS: { name: "Austrian", budget: false, home: "https://www.austrian.com" },
  IB: { name: "Iberia", budget: false, home: "https://www.iberia.com" },
  TP: { name: "TAP Air Portugal", budget: false, home: "https://www.flytap.com" },
  AY: { name: "Finnair", budget: false, home: "https://www.finnair.com" },
  SK: { name: "SAS", budget: false, home: "https://www.flysas.com" },
  FI: { name: "Icelandair", budget: false, home: "https://www.icelandair.com" },
  TK: { name: "Turkish Airlines", budget: false, home: "https://www.turkishairlines.com" },
  EK: { name: "Emirates", budget: false, home: "https://www.emirates.com" },
  QR: { name: "Qatar Airways", budget: false, home: "https://www.qatarairways.com" },
  EY: { name: "Etihad", budget: false, home: "https://www.etihad.com" },
  SQ: { name: "Singapore Airlines", budget: false, home: "https://www.singaporeair.com" },
  CX: { name: "Cathay Pacific", budget: false, home: "https://www.cathaypacific.com" },
  QF: { name: "Qantas", budget: false, home: "https://www.qantas.com" },
  JL: { name: "Japan Airlines", budget: false, home: "https://www.jal.co.jp" },
  TG: { name: "Thai Airways", budget: false, home: "https://www.thaiairways.com" },
  AI: { name: "Air India", budget: false, home: "https://www.airindia.com" },
  AA: { name: "American Airlines", budget: false, home: "https://www.aa.com" },
  DL: { name: "Delta", budget: false, home: "https://www.delta.com" },
  UA: { name: "United", budget: false, home: "https://www.united.com" },
  AC: { name: "Air Canada", budget: false, home: "https://www.aircanada.com" },
  MS: { name: "EgyptAir", budget: false, home: "https://www.egyptair.com" },
  AT: { name: "Royal Air Maroc", budget: false, home: "https://www.royalairmaroc.com" },
};

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const nice = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

export interface BookingOption {
  label: string;
  url: string;
  /** Shown under the button. */
  note: string;
  primary: boolean;
  /** Earns us a commission (affiliate link). */
  sponsored: boolean;
}

/**
 * Booking buttons for one ticket: the airline direct and/or the booking site
 * where we found the price, cheapest-likely first.
 */
export function bookingOptions(
  airline: string,
  q: SearchLinkQuery,
  comparisonUrl: string,
  routeText: string,
): BookingOption[] {
  const site = AIRLINE_SITES[airline];
  const compare: BookingOption = {
    label: `Compare booking sites: ${routeText}`,
    url: comparisonUrl,
    note: site?.budget
      ? "Booking sites often add fees for budget airlines. Only use this if it's cheaper at checkout."
      : "Shows every site selling these flights. Sometimes cheaper than the airline itself.",
    primary: false,
    sponsored: true,
  };
  if (!site) return [{ ...compare, primary: true, note: "Shows every site selling these flights, including the airline." }];
  const direct: BookingOption = {
    label: `Book direct with ${site.name}`,
    url: site.search ? site.search(q) : site.home,
    note: site.search
      ? `Opens ${site.name} with your flights searched.`
      : `Opens ${site.name}. Search ${q.from} to ${q.to}, ${nice(q.depart)}${q.ret ? ` to ${nice(q.ret)}` : ", one way"}.`,
    primary: false,
    sponsored: false,
  };
  return site.budget ? [{ ...direct, primary: true }, compare] : [{ ...compare, primary: true }, direct];
}
