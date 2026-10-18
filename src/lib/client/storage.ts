// Browser storage helpers. Storage can be blocked (private mode etc.), so
// every call is wrapped and the app works without it.

import type { SearchRequest } from "../types";

const PREFS_KEY = "totl.prefs.v1";
const SAVED_KEY = "totl.saved.v1";

export interface Prefs {
  homeAirport?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  savedAt: string;
  request: SearchRequest;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: nothing to do.
  }
}

export const loadPrefs = () => read<Prefs>(PREFS_KEY, {});
export const savePrefs = (p: Prefs) => write(PREFS_KEY, { ...loadPrefs(), ...p });

export const loadSaved = () => read<SavedSearch[]>(SAVED_KEY, []);
export function addSaved(name: string, request: SearchRequest): SavedSearch[] {
  const list = [
    { id: String(Date.now()), name, savedAt: new Date().toISOString(), request },
    ...loadSaved(),
  ].slice(0, 20);
  write(SAVED_KEY, list);
  return list;
}
export function removeSaved(id: string): SavedSearch[] {
  const list = loadSaved().filter((s) => s.id !== id);
  write(SAVED_KEY, list);
  return list;
}

/** Shareable link: the search request encoded in the URL. */
export function encodeSearch(req: SearchRequest): string {
  const json = JSON.stringify(req);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSearch(s: string): SearchRequest | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as SearchRequest;
  } catch {
    return null;
  }
}
