"use client";

import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const KEY = "totl.theme";

/** Runs before the page paints, so there's no flash of the wrong theme. */
export const themeScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

const ICONS: Record<Theme, React.ReactNode> = {
  auto: (
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>
  ),
  light: (
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" /><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" /></g></svg>
  ),
  dark: (
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor" /></svg>
  ),
};
const LABELS: Record<Theme, string> = { auto: "Match my device", light: "Light mode", dark: "Dark mode" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "light" || t === "dark" ? t : "auto");
  }, []);
  return (
    <div className="theme-toggle" role="group" aria-label="Appearance">
      {(["auto", "light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          aria-label={LABELS[t]}
          title={LABELS[t]}
          onClick={() => {
            setTheme(t);
            apply(t);
          }}
        >
          {ICONS[t]}
        </button>
      ))}
    </div>
  );
}
