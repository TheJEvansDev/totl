import { App } from "@/components/App";

// Read at request time so adding the API key in Vercel switches the AI box on.
export const dynamic = "force-dynamic";

export default function Home() {
  return <App aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
