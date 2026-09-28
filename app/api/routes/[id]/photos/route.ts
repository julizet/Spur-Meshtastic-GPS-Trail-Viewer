import { NextResponse } from "next/server";
import { checkToken, isValidId, loadPhotos, loadSnapshot, MAX_PHOTO_BYTES, MAX_PHOTOS, savePhoto } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

/** Everyone with the link may add photos, within the limits below. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const snapshot = await loadSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const i = Number(form?.get("i"));
  const takenAtRaw = Number(form?.get("takenAt"));
  const takenAt = Number.isFinite(takenAtRaw) && takenAtRaw > 0 ? Math.round(takenAtRaw) : null;

  if (!(file instanceof Blob)) return NextResponse.json({ error: "Kein Foto erhalten." }, { status: 400 });
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : null;
  if (!ext) return NextResponse.json({ error: "Nur JPEG- oder WebP-Fotos." }, { status: 415 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Das Foto ist größer als 1,5 MB." }, { status: 413 });
  // The owner may attach photos to any original point (the snapshot can be a few seconds old).
  const owner = req.headers.get("x-edit-token") ? await checkToken(id, req.headers.get("x-edit-token")) : null;
  const allowed = owner ? owner.source.points : snapshot.points;
  if (!Number.isInteger(i) || !allowed.some((p) => p.i === i)) {
    return NextResponse.json({ error: "Dieser Wegpunkt gehört nicht zur geteilten Route." }, { status: 400 });
  }
  const photos = await loadPhotos(id);
  if (photos.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Diese Route hat bereits ${MAX_PHOTOS} Fotos.` }, { status: 409 });
  }
  const pid = await savePhoto(id, i, takenAt, file, ext);
  return NextResponse.json({ id: pid, i, takenAt });
}
