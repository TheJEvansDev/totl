"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type PlaceInfo, remember } from "@/lib/client/places";

/**
 * Type-to-search box for airports (and optionally cities with several
 * airports). Results come from /api/places so the full list never loads here.
 */
export function PlacePicker({
  label,
  placeholder,
  cities = false,
  exclude = [],
  onPick,
  autoFocus = false,
}: {
  label: string;
  placeholder: string;
  cities?: boolean;
  exclude?: string[];
  onPick: (p: PlaceInfo) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}${cities ? "&cities=1" : ""}`, { signal: ctrl.signal });
        const body = (await res.json()) as { results: PlaceInfo[] };
        setResults(body.results.filter((r) => !exclude.includes(r.code)));
        setActive(0);
        setOpen(true);
      } catch {
        // Aborted or offline: keep the previous list.
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // exclude is compared by its contents so a new array each render doesn't refetch.
  }, [query, cities, exclude.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(p: PlaceInfo) {
    remember([p]);
    onPick(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const listId = `${id}-list`;
  return (
    <div className="picker">
      <label className="field">
        <span>{label}</span>
        <input
          className="input"
          type="text"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-${results[active].code}` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>
      {open && query.trim().length >= 2 && (
        <ul className="picker-list" id={listId} role="listbox" onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}>
          {results.length === 0 && !loading && <li className="picker-empty">No airports found. Try a city name or airport code.</li>}
          {results.map((r, i) => (
            <li
              key={r.code}
              id={`${id}-${r.code}`}
              role="option"
              aria-selected={i === active}
              className="picker-option"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className="picker-code">{r.code}</span>
              <span>
                <b>{r.type === "city" ? r.name : r.name === r.city || r.name.startsWith(r.city) ? r.name : `${r.city} ${r.name}`}</b>
                <br />
                <span className="meta">{r.type === "city" ? `Every airport · ${r.country}` : r.country}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
