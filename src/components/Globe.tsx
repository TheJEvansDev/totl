"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { money } from "@/lib/client/format";
import type { ExplorePlace } from "@/lib/explore";

type Theme = "light" | "dark";

const PALETTE: Record<Theme, Record<string, string>> = {
  light: { land: "#f1eee5", water: "#b8d2ea", ice: "#ffffff", border: "#c2bcac", country: "#6b6a63", city: "#3a3934", halo: "#f1eee5", sky: "#cfe2f6", horizon: "#ffffff", space: "#0b1730" },
  dark: { land: "#24262c", water: "#0d1828", ice: "#3a3d44", border: "#41444c", country: "#9aa0aa", city: "#dfe2e7", halo: "#14161a", sky: "#0d1b33", horizon: "#3d6aa8", space: "#03060d" },
};

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const nameExpr: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** A themed, minimal world map on a globe: land, sea, borders and labels only, so prices stand out. */
function buildStyle(theme: Theme, accent: string): StyleSpecification {
  const c = PALETTE[theme];
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sky: {
      "sky-color": c.sky,
      "horizon-color": c.horizon,
      "sky-horizon-blend": 0.6,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
    },
    sources: {
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      places: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      // Same points for the price labels: kept separate so the dots still draw if the label font can't load.
      labels: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      route: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      home: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": c.land } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "ice", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", ["get", "subclass"], ["literal", ["glacier", "ice_shelf"]]], paint: { "fill-color": c.ice, "fill-opacity": 0.6 } },
      {
        id: "borders",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": c.border, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.2] },
      },
      {
        id: "countries",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 2.5,
        filter: ["==", ["get", "class"], "country"],
        layout: { "text-field": nameExpr, "text-font": ["Noto Sans Regular"], "text-size": 11, "text-letter-spacing": 0.08, "text-transform": "uppercase" },
        paint: { "text-color": c.country, "text-halo-color": c.halo, "text-halo-width": 1 },
      },
      {
        id: "cities",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 5,
        filter: ["==", ["get", "class"], "city"],
        layout: { "text-field": nameExpr, "text-font": ["Noto Sans Regular"], "text-size": 12 },
        paint: { "text-color": c.city, "text-halo-color": c.halo, "text-halo-width": 1.2 },
      },
      {
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round" },
        paint: { "line-color": accent, "line-width": 2.5, "line-dasharray": [1, 1.6], "line-opacity": 0.9 },
      },
      { id: "home-dot", type: "circle", source: "home", paint: { "circle-radius": 6, "circle-color": c.city, "circle-stroke-color": c.halo, "circle-stroke-width": 2 } },
      {
        id: "place-dot",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["get", "selected"], 8, 3.5], 6, ["case", ["get", "selected"], 10, 6]],
          "circle-color": ["get", "color"],
          "circle-stroke-color": c.halo,
          "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
        },
      },
      {
        id: "place-price",
        type: "symbol",
        source: "labels",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["case", ["get", "selected"], 15, 12.5],
          "text-offset": [0, -1.25],
          "text-anchor": "bottom",
          // Cheapest first when labels would overlap.
          "symbol-sort-key": ["get", "rank"],
          "text-allow-overlap": false,
          "text-padding": 3,
        },
        paint: { "text-color": ["get", "color"], "text-halo-color": c.halo, "text-halo-width": 2 },
      },
    ],
  };
}

/** Points along the shortest path over the Earth, so the route curves like a flight. */
function greatCircle(a: [number, number], b: [number, number], steps = 64): [number, number][] {
  const rad = Math.PI / 180;
  const [lon1, lat1, lon2, lat2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([Math.atan2(y, x) / rad, Math.atan2(z, Math.sqrt(x * x + y * y)) / rad]);
  }
  return out;
}

export function Globe({
  places,
  home,
  selected,
  onSelect,
}: {
  places: ExplorePlace[];
  home: { lat: number; lon: number } | null;
  selected: ExplorePlace | null;
  onSelect: (p: ExplorePlace) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ places, home, selected, onSelect });
  latest.current = { places, home, selected, onSelect };

  // Push the current places, home and route into the map.
  const sync = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const { places: ps, home: h, selected: sel } = latest.current;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#256abf";
    const good = getComputedStyle(document.documentElement).getPropertyValue("--good").trim() || "#1f7a4d";
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#74746c";
    const sorted = [...ps].sort((a, b) => a.flightPrice - b.flightPrice);
    const third = Math.max(1, Math.ceil(sorted.length / 3));
    const points: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: sorted.map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          code: p.code,
          label: money(p.flightPrice),
          rank: i,
          selected: sel?.code === p.code,
          // Cheapest third stand out; the priciest fade back.
          color: i < third ? good : i < third * 2 ? accent : muted,
        },
      })),
    };
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(points);
    (map.getSource("labels") as GeoJSONSource | undefined)?.setData(points);
    (map.getSource("home") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: h ? [{ type: "Feature", geometry: { type: "Point", coordinates: [h.lon, h.lat] }, properties: {} }] : [],
    });
    (map.getSource("route") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features:
        h && sel ? [{ type: "Feature", geometry: { type: "LineString", coordinates: greatCircle([h.lon, h.lat], [sel.lon, sel.lat]) }, properties: {} }] : [],
    });
  };

  useEffect(() => {
    let cancelled = false;
    let spin = 0;
    let themeObserver: MutationObserver | null = null;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#256abf";
    const restyle = () => {
      const map = mapRef.current;
      if (!map) return;
      ready.current = false;
      map.setStyle(buildStyle(currentTheme(), accent()));
      map.once("style.load", () => {
        ready.current = true;
        sync();
      });
    };
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (cancelled || !el.current) return;
      const start = latest.current.home ?? { lat: 30, lon: 0 };
      // Fit the whole globe in the box (its diameter is about 512 × 2^zoom / π pixels).
      const box = Math.min(el.current.clientWidth, el.current.clientHeight);
      const fitZoom = Math.min(2, Math.max(0, Math.log2((0.82 * box * Math.PI) / 512)));
      const map = new maplibre.Map({
        container: el.current,
        style: buildStyle(currentTheme(), accent()),
        center: [start.lon, start.lat],
        zoom: fitZoom,
        minZoom: Math.max(0, fitZoom - 0.4),
        maxZoom: 9,
        attributionControl: { compact: true, customAttribution: "© OpenFreeMap © OpenStreetMap" },
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      // Data can go in as soon as the style is read, without waiting for map tiles.
      const onStyle = () => {
        ready.current = true;
        sync();
      };
      map.once("style.load", onStyle);
      map.once("load", onStyle);
      const pick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
        const code = e.features?.[0]?.properties?.code;
        const p = latest.current.places.find((x) => x.code === code);
        if (p) latest.current.onSelect(p);
      };
      map.on("click", "place-dot", pick);
      map.on("click", "place-price", pick);
      for (const layer of ["place-dot", "place-price"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      // A slow spin until the first touch, like a globe on a desk.
      if (!reducedMotion()) {
        let spinning = true;
        const stop = () => (spinning = false);
        map.on("mousedown", stop);
        map.on("touchstart", stop);
        map.on("wheel", stop);
        const step = () => {
          if (cancelled) return;
          if (spinning && !map.isMoving() && map.getZoom() < 3) {
            const c = map.getCenter();
            map.setCenter([c.lng + 0.06, c.lat]);
          }
          spin = requestAnimationFrame(step);
        };
        spin = requestAnimationFrame(step);
      }
      themeObserver = new MutationObserver(restyle);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      media.addEventListener("change", restyle);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(spin);
      themeObserver?.disconnect();
      media.removeEventListener("change", restyle);
      mapRef.current?.remove();
      mapRef.current = null;
      ready.current = false;
    };
    // The map is created once; data changes go through sync().
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(sync, [places, home, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to the chosen place (a jump when reduced motion is on).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const target = { center: [selected.lon, selected.lat] as [number, number], zoom: Math.max(map.getZoom(), 3.2) };
    if (reducedMotion()) map.jumpTo(target);
    else map.flyTo({ ...target, duration: 2200, curve: 1.6, essential: false });
  }, [selected]);

  return <div ref={el} className="globe" role="application" aria-label="Globe of places to fly to, with prices. Drag to spin, pinch or scroll to zoom." />;
}
