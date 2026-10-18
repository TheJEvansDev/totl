import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Privacy · ${APP_NAME}` };

export default function Privacy() {
  return (
    <main className="shell prose">
      <h1>Privacy</h1>
      <p>{APP_NAME} is in testing. Here&apos;s what happens with your data.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your home airport and saved searches are stored in your own browser only. We never see them.</li>
        <li>Searches are sent to our server to find prices, then passed to our flight and accommodation data providers. We don&apos;t keep them linked to you.</li>
        <li>If you use &ldquo;Use my location&rdquo;, your approximate position is only used to find nearby airports. It is not stored.</li>
        <li>Feedback you send, and any name you add, is stored so we can read it.</li>
      </ul>
      <h2>Analytics</h2>
      <p>We use cookie-free analytics (Vercel Web Analytics) to count page views. It doesn&apos;t use cookies or track you across sites.</p>
      <h2>Booking links</h2>
      <p>
        When you click through to book, you&apos;re on that company&apos;s website and their privacy policy applies. Some links are affiliate
        links, which tell the site you came from us.
      </p>
      <h2>Contact</h2>
      <p>Use the Feedback button to ask a question or ask us to delete feedback you&apos;ve sent.</p>
    </main>
  );
}
