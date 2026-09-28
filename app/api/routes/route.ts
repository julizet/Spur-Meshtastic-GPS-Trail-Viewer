import { NextResponse } from "next/server";
import { createRoute } from "@/lib/server/store";
import { isRouteData } from "@/lib/snapshot";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !isRouteData(body.snapshot) || !isRouteData(body.source)) {
    return NextResponse.json({ error: "Die Route ist unvollständig." }, { status: 400 });
  }
  const { id, token } = await createRoute(body.snapshot, body.source);
  return NextResponse.json({ id, token });
}
