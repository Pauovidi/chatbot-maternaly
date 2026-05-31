import { NextResponse } from "next/server";
import { getMaternalyHealth } from "@/lib/maternaly/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getMaternalyHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
