"use client";

import { destTz, duration, money, shortDate, time, moneyText } from "@/lib/client/format";
import { describeDistance, formatKm } from "@/lib/area";
import { displayCurrency } from "@/lib/client/format";
import { airportName, cityName, place, tzOf } from "@/lib/client/places";
import { currencyForCountry } from "@/lib/currency";
import { airlineName } from "@/lib/data/destinations";
import { airbnbUrl, mapUrl } from "@/lib/links";
import type { Trip } from "@/lib/types";
import { Sheet } from "./Sheet";
import { flagTone } from "./TripCard";

export function TripDetail({ trip, sample, adults, children, onClose }: { trip: Trip; sample: boolean; adults: number; children: number; onClose: () => void }) {
  const info = place(trip.destination);
  const dest = { name: cityName(trip.destination), country: info?.country ?? "" };
  const localCurrency = info ? currencyForCountry(info.countryCode) : undefined;
  const payTip = localCurrency && localCurrency !== displayCurrency().code ? localCurrency : null;
  const tz = destTz(trip.destination);
  const penaltyTotal = trip.penalties.reduce((s, p) => s + p.amount, 0);
  const multi = trip.legs.length > 1;

  return (
    <Sheet
      title={dest.country ? `${dest.name}, ${dest.country}` : dest.name}
      subtitle={`${shortDate(trip.depart)} → ${shortDate(trip.return)} · ${trip.nights} nights · ${trip.people} traveller${trip.people > 1 ? "s" : ""}`}
      onClose={onClose}
    >
      {sample && <p className="notice notice-warn">Sample data: these prices are made up for testing.</p>}
      <div className="trip-why">{moneyText(trip.why)}</div>

      <h3>Total trip cost</h3>
      <table className="breakdown">
        <tbody>
          {trip.costs.map((c, i) => (
            <tr key={i}>
              <td>
                {moneyText(c.label)}
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
          {trip.flags.map((f) => <span key={f} className={flagTone(f)}>{moneyText(f)}</span>)}
        </div>
      )}

      <h3>Flights</h3>
      {trip.legs.map((leg) => {
        const f = leg.flight;
        const airport = { name: airportName(f.origin) };
        const backAirport = { name: airportName(f.returnAirport) };
        return (
          <div key={leg.groupId}>
            {multi && <p style={{ fontWeight: 700, margin: "8px 0 0" }}>{leg.groupId}</p>}
            <div className="flight">
              <b>{time(f.outDepart, tzOf(f.origin))}</b>
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
                {dest.name} → {backAirport?.name} · {airlineName(f.returnAirline)}
                <br />
                <span className="meta">
                  {shortDate(f.returnDate)} · {duration(f.retDepart, f.retArrive)} · {f.retStops === 0 ? "direct" : `${f.retStops} stop`}
                </span>
              </span>
              <b>{time(f.retArrive, tzOf(f.returnAirport))}</b>
            </div>
            <p className="fineprint">
              Local times. {f.seenHoursAgo !== null ? `Price seen ${f.seenHoursAgo} hours ago.` : "Cached price seen in the last 48 hours."}
              {f.selfTransfer && " Self-transfer: separate tickets, so if the first flight is late the airline won't rebook you."}
            </p>
          </div>
        );
      })}

      {trip.airportOptions.length > 1 && (
        <>
          <h3>Other airports for these dates</h3>
          <div className="options">
            {trip.airportOptions.map((o) => {
              const chosen = o.out === trip.legs[0].flight.origin && o.back === trip.legs[0].flight.returnAirport;
              const name = airportName;
              return (
                <div key={`${o.out}>${o.back}`} className={`option${chosen ? " option-chosen" : ""}`}>
                  <div className="option-head">
                    <b>{o.out === o.back ? `${name(o.out)} return` : `Out of ${name(o.out)}, home into ${name(o.back)}`}</b>
                    <span className="tabular">{chosen ? "Chosen" : o.totalDelta === 0 ? "Same price" : `${o.totalDelta > 0 ? "+" : "−"}${money(Math.abs(o.totalDelta))}`}</span>
                  </div>
                  <div className="meta">
                    {money(o.pricePerPerson)} pp flights · {o.groundNote}
                    {o.extraHours > 0 ? ` · +${o.extraHours} hrs travel` : ""}
                  </div>
                  {o.flags.length > 0 && <div className="meta">{o.flags.join(" · ")}</div>}
                </div>
              );
            })}
          </div>
          <p className="fineprint">Prices include flights, bags and getting to and from the airports. Accommodation is the same for each.</p>
        </>
      )}

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

            {trip.stay.freeCancellation === true ? " · free cancellation" : trip.stay.freeCancellation === false ? " · non-refundable" : ""}
          </span>
          {trip.stay.centreKm !== null && (
            <>
              <br />
              <span className="meta">{describeDistance(trip.stay.centreKm)}</span>
            </>
          )}
          {trip.stay.lat !== null && trip.stay.lon !== null && (
            <>
              <br />
              <a className="btn-link" href={mapUrl(trip.stay.lat, trip.stay.lon)} target="_blank" rel="noopener noreferrer">See where it is on a map</a>
            </>
          )}
        </p>
      )}

      {trip.stayAlternatives.length > 1 && (
        <>
          <h3>Where to stay: weighing it up</h3>
          <div className="options">
            {trip.stayAlternatives.map((a) => (
              <div key={a.stay.id} className={`option${a.label === "Chosen" ? " option-chosen" : ""}`}>
                <div className="option-head">
                  <b>{a.label === "Chosen" ? "Chosen" : a.label}: {a.stay.name}</b>
                  <span className="tabular">
                    {a.label === "Chosen" ? money(a.stay.total + a.transportCost) : `${a.netVsChosen > 0 ? "+" : "−"}${money(Math.abs(a.netVsChosen))}`}
                  </span>
                </div>
                <div className="meta">
                  {a.stay.rating ? `${a.stay.rating}/10 · ` : ""}
                  {a.stay.centreKm !== null ? `${formatKm(a.stay.centreKm)} from centre · ` : ""}
                  {money(a.stay.total)}
                  {a.transportCost > 0 ? ` + ${money(a.transportCost)} transport` : ""}
                </div>
                <ul className="proscons">
                  {a.pros.map((p) => <li key={p} className="pro">{moneyText(p)}</li>)}
                  {a.cons.map((c) => <li key={c} className="con">{moneyText(c)}</li>)}
                </ul>
                <span className="row" style={{ gap: 14 }}>
                  <a className="btn-link" href={a.stay.bookingUrl} target="_blank" rel="noopener noreferrer">Check this one</a>
                  {a.stay.lat !== null && a.stay.lon !== null && (
                    <a className="btn-link" href={mapUrl(a.stay.lat, a.stay.lon)} target="_blank" rel="noopener noreferrer">Map</a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Book</h3>
      <div className="book">
        {trip.legs.map((leg) =>
          leg.flight.returnBookingUrl ? (
            <div key={leg.groupId} className="book">
              <a className="btn btn-primary" href={leg.flight.bookingUrl} target="_blank" rel="noopener noreferrer sponsored">
                Outbound{multi ? ` (${leg.groupId})` : ""}: {leg.flight.origin} → {dest.name}
              </a>
              <a className="btn btn-primary" href={leg.flight.returnBookingUrl} target="_blank" rel="noopener noreferrer sponsored">
                Return{multi ? ` (${leg.groupId})` : ""}: {dest.name} → {leg.flight.returnAirport}
              </a>
              <p className="fineprint" style={{ margin: 0 }}>Two separate one-way tickets: book both. If one flight changes, the other airline won&apos;t rebook you.</p>
            </div>
          ) : (
            <a key={leg.groupId} className="btn btn-primary" href={leg.flight.bookingUrl} target="_blank" rel="noopener noreferrer sponsored">
              Check flights{multi ? ` (${leg.groupId})` : ""}: {leg.airport} → {dest.name}
            </a>
          ),
        )}
        <a className="btn" href={trip.stay.bookingUrl} target="_blank" rel="noopener noreferrer">
          {trip.stayEstimated ? "See accommodation prices" : `Check ${trip.stay.name}`}
        </a>
        <a className="btn" href={airbnbUrl(dest, trip.depart, trip.return, adults, children)} target="_blank" rel="noopener noreferrer">
          Compare on Airbnb
        </a>
      </div>
      {payTip && (
        <p className="notice notice-info" style={{ marginTop: 10 }}>
          <b>Money tip:</b> if a site offers to charge you in {displayCurrency().code} instead of {payTip}, say no. Paying in {payTip} with a
          card that has no foreign transaction fees (such as Revolut, Monzo or Starling) is usually 3-5% cheaper than the site&apos;s own conversion.
        </p>
      )}
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
