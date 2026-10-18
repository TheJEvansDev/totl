"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";

export function Feedback() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, name, page: location.pathname + location.search.slice(0, 200) }),
      });
      if (!res.ok) throw new Error();
      setState("sent");
      setMessage("");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button className="btn btn-small feedback-fab" onClick={() => { setOpen(true); setState("idle"); }}>
        💬 Feedback
      </button>
      {open && (
        <Sheet title="Send feedback" subtitle="What worked, what didn't, what you'd want it to do." onClose={() => setOpen(false)}>
          {state === "sent" ? (
            <p>Thanks, that&apos;s been sent.</p>
          ) : (
            <form
              style={{ display: "grid", gap: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label className="field">
                <span>Your feedback</span>
                <textarea className="input" required value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <label className="field">
                <span>Your name (optional)</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {state === "error" && <p className="notice notice-bad">Couldn&apos;t send that. Please try again.</p>}
              <button className="btn btn-primary" disabled={state === "sending" || !message.trim()}>
                {state === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
