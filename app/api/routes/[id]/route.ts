import { NextResponse } from "next/server";
import { checkToken, deleteRoute, isValidId, loadPhotos, loadSnapshot, updateRoute } from "@/lib/server/store";
import { isRouteData } from "@/lib/snapshot";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const token = req.headers.get("x-edit-token");
  if (token) {
    const stored = await checkToken(id, token);
    if (!stored) return NextResponse.json({ error: "Der Bearbeitungslink ist ungültig." }, { status: 403 });
    return NextResponse.json({ snapshot: stored.snapshot, source: stored.source, photos: await loadPhotos(id) });
  }
  const snapshot = await loadSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ snapshot, photos: await loadPhotos(id) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const stored = isValidId(id) ? await checkToken(id, req.headers.get("x-edit-token")) : null;
  if (!stored) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !isRouteData(body.snapshot) || !isRouteData(body.source)) {
    return NextResponse.json({ error: "Die Route ist unvollständig." }, { status: 400 });
  }
  await updateRoute(id, stored, body.snapshot, body.source);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const stored = isValidId(id) ? await checkToken(id, req.headers.get("x-edit-token")) : null;
  if (!stored) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  await deleteRoute(id);
  return NextResponse.json({ ok: true });
}
