import { NextResponse } from "next/server";

// Feedback goes to the server logs and, if set, a Discord/Slack-style webhook.
export async function POST(req: Request) {
  let body: { message?: unknown; name?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "Please write something first." }, { status: 400 });
  const name = String(body.name ?? "").trim().slice(0, 80) || "Anonymous";
  const page = String(body.page ?? "").slice(0, 300);
  const text = `Feedback from ${name}${page ? ` (${page})` : ""}:\n${message}`;
  console.log("[feedback]", text);

  const webhook = process.env.FEEDBACK_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      // "content" is Discord's field, "text" is Slack's.
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, text }),
      });
    } catch (err) {
      console.error("feedback webhook failed", err);
    }
  }
  return NextResponse.json({ ok: true });
}
