"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { money } from "@/lib/client/format";
import { getDestination } from "@/lib/data/destinations";
import type { DestinationSummary } from "@/lib/types";

export function DestinationMap({ items, onPick }: { items: DestinationSummary[]; onPick: (tripId: string) => void }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 10,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const points: [number, number][] = [];
      // Items arrive cheapest first. Only the cheapest few get a permanent label
      // so they don't pile on top of each other; the rest show on hover.
      items.forEach((item, i) => {
        const d = getDestination(item.code);
        if (!d) return;
        points.push([d.lat, d.lon]);
        const top = i < 5;
        L.circleMarker([d.lat, d.lon], { radius: top ? 8 : 6, color: "#ffffff", weight: 2, fillColor: top ? "#104281" : "#5598e7", fillOpacity: 1 })
          .addTo(map)
          .bindTooltip(`${d.name} ${money(item.perPerson)}`, { permanent: top, direction: "top", className: "map-label", offset: [0, -6] })
          .on("click", () => onPick(item.bestTripId));
      });
      if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 6 });
      else map.setView([48, 5], 4);
      cleanup = () => map.remove();
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [items, onPick]);

  return <div ref={el} className="map" role="region" aria-label="Map of destinations with prices per person" />;
}
