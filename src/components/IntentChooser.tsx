"use client";

export type Intent = "pick" | "anywhere" | "describe";

const OPTIONS: { id: Intent; icon: string; title: string; text: string }[] = [
  { id: "pick", icon: "📍", title: "I know where I'm going", text: "Pick the place. We'll find the cheapest way to do it: dates, airports and where to stay." },
  { id: "anywhere", icon: "🧭", title: "Surprise me", text: "Set a budget and see the best places you can go, or let us pick one for you." },
  { id: "describe", icon: "💬", title: "Describe my trip", text: "Tell us in your own words and we'll set the search up." },
];

/** First question: what does the traveller want to do? */
export function IntentChooser({ onChoose, aiEnabled }: { onChoose: (i: Intent) => void; aiEnabled: boolean }) {
  return (
    <section className="intent" aria-labelledby="intent-title">
      <h1 id="intent-title" className="intent-title">What would you like to do?</h1>
      <div className="intent-options">
        {OPTIONS.filter((o) => o.id !== "describe" || aiEnabled).map((o) => (
          <button key={o.id} type="button" className="card intent-option" onClick={() => onChoose(o.id)}>
            <span className="intent-icon" aria-hidden="true">{o.icon}</span>
            <span>
              <b>{o.title}</b>
              <span className="intent-text">{o.text}</span>
            </span>
            <span className="intent-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export const INTENT_LABEL: Record<Intent, string> = {
  pick: "I know where I'm going",
  anywhere: "Surprise me",
  describe: "Describe my trip",
};
