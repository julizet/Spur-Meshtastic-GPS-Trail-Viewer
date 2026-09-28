import { NextResponse } from "next/server";
import { checkToken, deletePhoto, isValidId, isValidPhotoId, readPhoto } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string; photo: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id, photo } = await params;
  if (!isValidId(id) || !isValidPhotoId(photo)) return new NextResponse("Nicht gefunden", { status: 404 });
  const res = await readPhoto(id, photo);
  if (!res) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, photo } = await params;
  if (!isValidId(id) || !isValidPhotoId(photo)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const stored = await checkToken(id, req.headers.get("x-edit-token"));
  if (!stored) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  await deletePhoto(id, photo);
  return NextResponse.json({ ok: true });
}
