"use client";

export const MAX_PHOTOS = 30;
export const MAX_BYTES = Math.round(1.5 * 1024 * 1024);
const MAX_EDGE = 2560;

/** Capture time from EXIF, interpreted in local time like the Meshtastic export. */
export async function readTakenAt(file: File): Promise<number | null> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate"] });
    const d: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null;
  } catch {
    return null;
  }
}

async function decodeNative(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await decodeNative(file);
  } catch (error) {
    const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    if (!isHeic) throw error;
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return decodeNative(Array.isArray(converted) ? converted[0] : converted);
  }
}

/**
 * Scales and re-encodes until the photo is at most 1.5 MB.
 * Re-encoding through a canvas also drops all metadata, including GPS.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await decode(file);
  const w0 = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h0 = "naturalHeight" in img ? img.naturalHeight : img.height;
  let edge = Math.min(MAX_EDGE, Math.max(w0, h0));
  let quality = 0.86;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");

  for (let attempt = 0; attempt < 10; attempt++) {
    const scale = edge / Math.max(w0, h0);
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("Foto konnte nicht umgewandelt werden");
    if (blob.size <= MAX_BYTES) {
      if ("close" in img) img.close();
      return blob;
    }
    if (quality > 0.62) quality -= 0.08;
    else edge = Math.round(edge * 0.8);
  }
  throw new Error("Foto ließ sich nicht klein genug rechnen");
}
