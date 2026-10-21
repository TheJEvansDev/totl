// Smart score penalties, in GBP. A trip's smart score is its total cost plus
// these penalties, so a slightly dearer trip with sensible times can rank above
// a cheaper one that means a 4am alarm.
//
// Tune these after testers' feedback. "PP" means per person.

export const PENALTIES = {
  /** Flight departing before this local hour counts as an early start. */
  earlyDepartureBeforeHour: 7,
  earlyDeparturePP: 15,

  /** Flight landing at or after this local hour (or before 04:00) counts as late. */
  lateArrivalFromHour: 23,
  lateArrivalPP: 15,

  /** Each stop, plus each hour spent waiting at a connection. */
  perStopPP: 25,
  perLayoverHourPP: 4,

  /** Separate tickets: if the first flight is late, the airline won't rebook you. */
  selfTransferPP: 30,

  /** Each hour of extra travel to or from a non-home airport. */
  extraTravelHourPP: 8,
  /** Travel home after a trip counts for more: you're tired and carrying bags. */
  returnTravelMultiplier: 1.5,

  /** Each hour lost at the destination: arriving after midday or leaving before 5pm. */
  lostDestinationHourPP: 2,
  arriveByHour: 12,
  leaveAfterHour: 17,

  /** Accommodation: per night, for each rating point below 7.5 (only if the user lowers the minimum). */
  ratingReference: 7.5,
  perRatingPointPerNight: 6,

  /** Accommodation: time spent getting to the centre, beyond this many minutes each way. */
  centreFreeMins: 12,
  /** Value of each hour spent commuting into the centre, per person (two trips a day). */
  commuteHourPP: 4,
  /** A stay further out than this (km) is too far to walk, so a day ticket is added to the cost. */
  walkableKm: 2,

  /** Deals: how far below the typical price for the route a flight must be. */
  dealPctBelow: 0.3,
  errorFarePctBelow: 0.55,
  /** Need at least this many prices for a route before calling something a deal. */
  dealMinSamples: 10,

  /** Flag another country's booking site only when it saves at least this much (GBP) and this share of the flight cost. */
  marketMinSaving: 10,
  marketMinSavingPct: 0.03,
};

/** Search limits that keep searches fast and within free API quotas. */
export const LIMITS = {
  maxWindowDays: 45,
  maxNights: 21,
  maxDatePairs: 400,
  maxFlexDays: 3,
  maxAirportsPerGroup: 6,
  maxCities: 12,
  /** How many trips get real accommodation prices (the rest use estimates). */
  stayLookups: 16,
  /** Accommodation is fetched up to this far out (km) so cheaper options can be compared. Kept modest so we never suggest the middle of nowhere. */
  stayCompareKm: 7,
  /** How many trips (by best value and by price) get compared across booking countries. */
  marketChecks: 6,
  /** Destinations checked for "out from one airport, back into another" trips. */
  mixedAirportDestinations: 4,
  /** Up to this many destinations also check nearby airports to fly into (Girona for Barcelona). */
  altArrivalDestinations: 3,
  /** Live searches: most paid lookups one search may spend, and destinations per search. */
  liveLookups: 30,
  liveDestinations: 7,
  /** Live "anywhere" with the price calendar: places ranked by cheapest fare (one calendar call each). */
  radarDestinations: 12,
  /** Airline-direct fares (easyJet via Firecrawl): routes read per direction, 1 credit each. */
  directRoutes: 6,
  /** Live "same flights, other countries' prices": trips checked, and countries (incl. the UK) per trip. */
  liveMarketTrips: 1,
  /** Live hotel prices: date/destination combos priced per search (one lookup each). */
  liveStayLookups: 4,
  liveMarkets: 5,
  maxTravellers: 9,
};
