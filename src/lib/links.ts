// Booking links. Each opens the provider's own site with details pre-filled.


function ddmm(date: string): string {
  return date.slice(8, 10) + date.slice(5, 7);
}

/** Aviasales search link (Travelpayouts affiliate when a marker is set). */
export function flightSearchUrl(
  origin: string,
  destination: string,
  depart: string,
  ret: string,
  adults: number,
  children: number,
  marker?: string,
): string {
  const pax = `${adults}${children > 0 ? children : ""}`;
  // An empty return date gives a one-way search.
  const back = ret ? ddmm(ret) : "";
  const url = new URL(`https://www.aviasales.com/search/${origin}${ddmm(depart)}${destination}${back}${pax}`);
  url.searchParams.set("currency", "gbp");
  if (marker) url.searchParams.set("marker", marker);
  return url.toString();
}

/** Turns a Travelpayouts relative link into a full affiliate link. */
export function travelpayoutsUrl(link: string, marker?: string): string {
  const url = new URL(link, "https://www.aviasales.com");
  url.searchParams.set("currency", "gbp");
  if (marker) url.searchParams.set("marker", marker);
  return url.toString();
}

export function hotelSearchUrl(
  query: string,
  checkin: string,
  checkout: string,
  adults: number,
  children: number,
  rooms: number,
): string {
  const url = new URL("https://www.booking.com/searchresults.en-gb.html");
  url.searchParams.set("ss", query);
  url.searchParams.set("checkin", checkin);
  url.searchParams.set("checkout", checkout);
  url.searchParams.set("group_adults", String(adults));
  url.searchParams.set("group_children", String(children));
  url.searchParams.set("no_rooms", String(rooms));
  url.searchParams.set("selected_currency", "GBP");
  return url.toString();
}

export function airbnbUrl(dest: { name: string; country: string }, checkin: string, checkout: string, adults: number, children: number): string {
  const place = encodeURIComponent(`${dest.name}, ${dest.country}`).replace(/%20/g, "-");
  const url = new URL(`https://www.airbnb.co.uk/s/${place}/homes`);
  url.searchParams.set("checkin", checkin);
  url.searchParams.set("checkout", checkout);
  url.searchParams.set("adults", String(adults));
  if (children > 0) url.searchParams.set("children", String(children));
  return url.toString();
}

/** Google Maps pin for a stay, so people can see exactly where it is. */
export function mapUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;
}
