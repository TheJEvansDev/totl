import { NextResponse } from "next/server";
import { getRates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rates, date, source } = await getRates();
  return NextResponse.json({ base: "GBP", rates, date, source });
}
