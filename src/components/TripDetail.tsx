"use client";

import { destTz, duration, money, shortDate, time } from "@/lib/client/format";
import { getAirport } from "@/lib/data/airports";
import { airlineName, getDestination } from "@/lib/data/destinations";
import { airbnbUrl } from "@/lib/links";
import type { Trip } from "@/lib/types";
import { Sheet } from "./Sheet";
import { flagTone } from "./TripCard";

export function TripDetail({ trip, sample, adults, children, onClose }: { trip: Trip; sample: boolean; adults: number; children: number; onClose: () => void }) {
  const dest = getDestination(trip.destination)!;
  const tz = destTz(trip.destination);
  const penaltyTotal = trip.penalties.reduce((s, p) => s + p.amount, 0);
  const multi = trip.legs.length > 1;

  return (
    <Sheet
      title={`${dest.name}, ${dest.country}`}
      subtitle={`${shortDate(trip.depart)} → ${shortDate(trip.return)} · ${trip.nights} nights · ${trip.people} traveller${trip.people > 1 ? "s" : ""}`}
      onClose={onClose}
    >
      {sample && <p className="notice notice-warn">Sample data: these prices are made up for testing.</p>}
      <div className="trip-why">{trip.why}</div>

      <h3>Total trip cost</h3>
      <table className="breakdown">
        <tbody>
          {trip.costs.map((c, i) => (
            <tr key={i}>
              <td>
                {c.label}
                {c.estimated && <span className="est">est.</span>}
              </td>
              <td>{money(c.amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total{trip.people > 1 ? ` (${money(trip.perPerson)} per person)` : ""}</td>
            <td>{money(trip.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="fineprint">
        &ldquo;est.&rdquo; means an estimate from typical prices. Flight prices are the latest seen and are confirmed on the booking site.
      </p>

      {trip.flags.length > 0 && (
        <div className="tags" style={{ marginTop: 8 }}>
          {trip.flags.map((f) => <span key={f} className={flagTone(f)}>{f}</span>)}
        </div>
      )}

      <h3>Flights</h3>
      {trip.legs.map((leg) => {
        const f = leg.flight;
        const airport = getAirport(leg.airport);
        return (
          <div key={leg.groupId}>
            {multi && <p style={{ fontWeight: 700, margin: "8px 0 0" }}>{leg.groupId}</p>}
            <div className="flight">
              <b>{time(f.outDepart, "Europe/London")}</b>
              <span>
                {airport?.name} → {dest.name} · {airlineName(f.airline)}
                <br />
                <span className="meta">
                  {shortDate(f.departDate)} · {duration(f.outDepart, f.outArrive)} · {f.outStops === 0 ? "direct" : `${f.outStops} stop`}
                </span>
              </span>
              <b>{time(f.outArrive, tz)}</b>
            </div>
            <div className="flight">
              <b>{time(f.retDepart, tz)}</b>
              <span>
                {dest.name} → {airport?.name} · {airlineName(f.airline)}
                <br />
                <span className="meta">
                  {shortDate(f.returnDate)} · {duration(f.retDepart, f.retArrive)} · {f.retStops === 0 ? "direct" : `${f.retStops} stop`}
                </span>
              </span>
              <b>{time(f.retArrive, "Europe/London")}</b>
            </div>
            <p className="fineprint">
              Local times. {f.seenHoursAgo !== null ? `Price seen ${f.seenHoursAgo} hours ago.` : "Cached price seen in the last 48 hours."}
              {f.selfTransfer && " Self-transfer: separate tickets, so if the first flight is late the airline won't rebook you."}
            </p>
          </div>
        );
      })}

      <h3>Accommodation</h3>
      {trip.stayEstimated ? (
        <p style={{ margin: 0 }}>
          Typical price for a {trip.stay.type === "apartment" ? "apartment" : "hotel"} matching your filters. Check the live prices below.
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          <b>{trip.stay.name}</b>
          <br />
          <span className="meta">
            {trip.stay.type === "apartment" ? "Apartment" : "Hotel"}
            {trip.stay.rating ? ` · rated ${trip.stay.rating}/10` : ""}
            {trip.stay.centreMins !== null ? ` · about ${trip.stay.centreMins} mins to the centre` : ""}
            {trip.stay.freeCancellation === true ? " · free cancellation" : trip.stay.freeCancellation === false ? " · non-refundable" : ""}
          </span>
        </p>
      )}

      <h3>Book</h3>
      <div className="book">
        {trip.legs.map((leg) => (
          <a key={leg.groupId} className="btn btn-primary" href={leg.flight.bookingUrl} target="_blank" rel="noopener noreferrer sponsored">
            Check flights{multi ? ` (${leg.groupId})` : ""}: {leg.airport} → {dest.name}
          </a>
        ))}
        <a className="btn" href={trip.stay.bookingUrl} target="_blank" rel="noopener noreferrer">
          {trip.stayEstimated ? "See accommodation prices" : `Check ${trip.stay.name}`}
        </a>
        <a className="btn" href={airbnbUrl(dest, trip.depart, trip.return, adults, children)} target="_blank" rel="noopener noreferrer">
          Compare on Airbnb
        </a>
      </div>
      <p className="fineprint">Prices can change. The final price is confirmed on the booking site. Some links earn us a small commission at no cost to you.</p>

      {penaltyTotal > 0 && (
        <>
          <h3>Why it ranks where it does</h3>
          <p className="fineprint" style={{ marginTop: 0 }}>
            Smart ranking adds a cost for things that make a trip less usable. These aren&apos;t charges, just how we compare trips.
          </p>
          <table className="breakdown">
            <tbody>
              {trip.penalties.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>+{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
}
