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

  /** Each hour of extra travel to reach a non-home airport (counted both ways). */
  extraTravelHourPP: 8,

  /** Each hour lost at the destination: arriving after midday or leaving before 5pm. */
  lostDestinationHourPP: 2,
  arriveByHour: 12,
  leaveAfterHour: 17,

  /** Accommodation: per night, for each rating point below 7.5 (only if the user lowers the minimum). */
  ratingReference: 7.5,
  perRatingPointPerNight: 6,

  /** Accommodation: per night, for each minute beyond 15 mins from the centre. */
  centreFreeMins: 15,
  perCentreMinutePerNight: 0.4,
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
  maxTravellers: 9,
};
