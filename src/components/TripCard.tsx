"use client";

import { destName, destTz, money, shortDate, time, moneyText } from "@/lib/client/format";
import { areaFor, formatKm } from "@/lib/area";
import { airportName } from "@/lib/client/places";
import { airlineName } from "@/lib/data/destinations";
import type { Trip } from "@/lib/types";

export function flagTone(flag: string): string {
  if (flag.startsWith("Possible error fare")) return "tag tag-hot";
  if (flag.startsWith("Deal:") || flag.startsWith("Stay further out")) return "tag tag-deal";
  if (flag === "Free cancellation" || flag.startsWith("Back into")) return "tag tag-good";
  if (/Early|Lands|Home|Self-transfer|stop|No rooms/.test(flag)) return "tag tag-warn";
  return "tag";
}

export function TripCard({ trip, rank, onOpen }: { trip: Trip; rank: number; onOpen: () => void }) {
  const leg = trip.legs[0];
  const f = leg.flight;
  const tz = destTz(trip.destination);
  const stops = f.outStops + f.retStops;
  const outName = airportName(f.origin);
  const backName = airportName(f.returnAirport);
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
      <div className="trip-why">{moneyText(trip.why)}</div>
      <div className="trip-line">
        <span>
          ✈ {outName === backName ? outName : `Out of ${outName}, home into ${backName}`} · {airlineName(f.airline)}
          {f.returnAirline !== f.airline ? ` / ${airlineName(f.returnAirline)}` : ""} · {time(f.outDepart, destTz(f.origin))} out,{" "}
          {time(f.retDepart, tz)} back · {stops === 0 ? "direct" : `${stops} stop${stops > 1 ? "s" : ""}`}
        </span>
      </div>
      <div className="trip-line">
        <span>
          🛏 {trip.stayEstimated ? "Typical price for a suitable place" : trip.stay.name}
          {trip.stay.rating ? ` · ${trip.stay.rating}/10` : ""}
          {trip.stay.centreKm !== null ? ` · ${areaFor(trip.stay.centreKm).label.toLowerCase()} (${formatKm(trip.stay.centreKm)})` : ""}
        </span>
      </div>
      {trip.flags.length > 0 && (
        <div className="tags">
          {trip.flags.filter((fl) => !fl.startsWith("Back into")).map((fl) => (
            <span key={fl} className={flagTone(fl)}>{moneyText(fl)}</span>
          ))}
        </div>
      )}
    </button>
  );
}
