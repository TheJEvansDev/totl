import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME}: ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <div className="shell" style={{ paddingBottom: 0 }}>
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-name">
                {APP_NAME.slice(0, -1)}
                <span>{APP_NAME.slice(-1)}</span>
              </span>
              <span className="brand-tag">{APP_TAGLINE}</span>
            </Link>
          </header>
        </div>
        {children}
        <footer className="shell footer" style={{ marginTop: 0 }}>
          <span>Prices can change. The final price is confirmed on the booking site.</span>
          <span>Some links are affiliate links: we may earn a small commission at no extra cost to you.</span>
          <span>
            <Link href="/privacy">Privacy</Link> · Testing version
          </span>
        </footer>
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
