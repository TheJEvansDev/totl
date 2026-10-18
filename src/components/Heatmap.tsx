"use client";

import { dayNum, dowLetter, money, monthShort, shortDate } from "@/lib/client/format";
import type { Heatmap as HeatmapData } from "@/lib/types";

const BINS = 6;

export function Heatmap({ data, onPick }: { data: HeatmapData; onPick: (tripId: string) => void }) {
  const values = Object.values(data.cells).map((c) => c.total).sort((a, b) => a - b);
  // Quantile bins so the colour spread is useful even with one outlier.
  const edges = Array.from({ length: BINS - 1 }, (_, i) => values[Math.floor(((i + 1) * values.length) / BINS)]);
  const bin = (v: number) => edges.filter((e) => v >= e).length; // 0 = cheapest
  const anyEstimated = Object.values(data.cells).some((c) => c.estimated);

  return (
    <div className="card heat-wrap">
      <p className="heat-title">{data.title}</p>
      <p className="meta" style={{ margin: 0 }}>Departure date across, nights down. Tap a price to see the trip.</p>
      <div className="heat-scroll">
        <table className="heat">
          <thead>
            <tr>
              <th className="rowhead" />
              {data.dates.map((d, i) => (
                <th key={d} className="heat-month">{i === 0 || monthShort(d) !== monthShort(data.dates[i - 1]) ? monthShort(d) : ""}</th>
              ))}
            </tr>
            <tr>
              <th className="rowhead"><span className="sr-only">Nights</span></th>
              {data.dates.map((d) => (
                <th key={d} scope="col">
                  {dowLetter(d)}
                  <br />
                  {dayNum(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.nights.map((n) => (
              <tr key={n}>
                <th className="rowhead" scope="row">{n} night{n > 1 ? "s" : ""}</th>
                {data.dates.map((d) => {
                  const cell = data.cells[`${d}|${n}`];
                  if (!cell) return <td key={d}><div className="heat-empty" aria-label="No trip" /></td>;
                  const b = bin(cell.total);
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        className="heat-cell"
                        style={{
                          background: `var(--heat-${b + 1})`,
                          color: b < 3 ? "var(--heat-ink-dark)" : "var(--heat-ink-light)",
                        }}
                        title={`${shortDate(d)}, ${n} nights: ${money(cell.total)} total, ${money(cell.perPerson)} per person${cell.estimated ? " (typical accommodation price)" : ""}`}
                        aria-label={`${shortDate(d)}, ${n} nights, ${money(cell.total)} total`}
                        onClick={() => onPick(cell.tripId)}
                      >
                        {cell.estimated ? "~" : ""}
                        {cell.total >= 1000 ? `${(cell.total / 1000).toFixed(1)}k` : cell.total}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heat-legend">
        <span>Cheaper</span>
        <span className="swatches" aria-hidden="true">
          {Array.from({ length: BINS }, (_, i) => <i key={i} style={{ background: `var(--heat-${i + 1})` }} />)}
        </span>
        <span>Pricier</span>
        <span>· Totals in £ for everyone</span>
        {anyEstimated && <span>· ~ uses a typical accommodation price</span>}
      </div>
    </div>
  );
}
