"use client";

import { destName, destTz, money, shortDate, time } from "@/lib/client/format";
import { getAirport } from "@/lib/data/airports";
import { airlineName } from "@/lib/data/destinations";
import type { Trip } from "@/lib/types";

export function flagTone(flag: string): string {
  if (flag === "Free cancellation") return "tag tag-good";
  if (/Early|Lands|Home|Self-transfer|stop|No rooms/.test(flag)) return "tag tag-warn";
  return "tag";
}

export function TripCard({ trip, rank, onOpen }: { trip: Trip; rank: number; onOpen: () => void }) {
  const leg = trip.legs[0];
  const f = leg.flight;
  const tz = destTz(trip.destination);
  const stops = f.outStops + f.retStops;
  return (
    <button type="button" className="card trip" onClick={onOpen}>
      <div className="trip-top">
        <div>
          <div className="trip-dest">
            <span className="sr-only">Result {rank}: </span>
            {destName(trip.destination)}
          </div>
          <div className="trip-dates">
            {shortDate(trip.depart)} → {shortDate(trip.return)} · {trip.nights} night{trip.nights > 1 ? "s" : ""}
          </div>
        </div>
        <div className="trip-price">
          <div className="trip-total tabular">{money(trip.total)}</div>
          <div className="trip-pp tabular">
            {trip.people > 1 ? `${money(trip.perPerson)} pp · ` : ""}all in
          </div>
        </div>
      </div>
      <div className="trip-why">{trip.why}</div>
      <div className="trip-line">
        <span>
          ✈ {getAirport(leg.airport)?.name ?? leg.airport} · {airlineName(f.airline)} · {time(f.outDepart, "Europe/London")} out,{" "}
          {time(f.retDepart, tz)} back · {stops === 0 ? "direct" : `${stops} stop${stops > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="trip-line">
        <span>
          🛏 {trip.stayEstimated ? "Typical price for a suitable place" : trip.stay.name}
          {trip.stay.rating ? ` · ${trip.stay.rating}/10` : ""}
          {trip.stay.centreMins !== null ? ` · ${trip.stay.centreMins} mins to centre` : ""}
        </span>
      </div>
      {trip.flags.length > 0 && (
        <div className="tags">
          {trip.flags.map((fl) => (
            <span key={fl} className={flagTone(fl)}>{fl}</span>
          ))}
        </div>
      )}
    </button>
  );
}
