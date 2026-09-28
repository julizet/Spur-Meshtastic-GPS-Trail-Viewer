import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Snapshot, SourceDoc } from "../types";

const ACCESS = "private" as const;
export const MAX_PHOTOS = 30;
export const MAX_PHOTO_BYTES = Math.round(1.5 * 1024 * 1024);

type Stored = {
  snapshot: Snapshot;
  source: SourceDoc;
  tokenHash: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredPhoto = { id: string; i: number; takenAt: number | null };

const routePath = (id: string) => `routes/${id}/route.json`;
const photoPrefix = (id: string) => `routes/${id}/photos/`;

export const isValidId = (id: string) => /^[A-Za-z0-9]{10}$/.test(id);
export const isValidPhotoId = (id: string) => /^\d{1,6}_\d{1,14}_[A-Za-z0-9]{8}\.(jpg|webp)$/.test(id);

function randomString(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function readStored(id: string): Promise<Stored | null> {
  try {
    const res = await get(routePath(id), { access: ACCESS });
    if (!res || res.statusCode !== 200) return null;
    return JSON.parse(await new Response(res.stream).text()) as Stored;
  } catch {
    return null;
  }
}

async function writeStored(id: string, data: Stored) {
  await put(routePath(id), JSON.stringify(data), {
    access: ACCESS,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

/** Snapshot for viewers, cached until the route changes. */
export function loadSnapshot(id: string): Promise<Snapshot | null> {
  return unstable_cache(
    async () => (await readStored(id))?.snapshot ?? null,
    ["snapshot", id],
    { tags: [`route:${id}`], revalidate: 86_400 },
  )();
}

export function loadPhotos(id: string): Promise<StoredPhoto[]> {
  return unstable_cache(
    async () => {
      const { blobs } = await list({ prefix: photoPrefix(id), limit: 1000 });
      return blobs
        .map((b) => b.pathname.slice(photoPrefix(id).length))
        .filter(isValidPhotoId)
        .map((pid) => {
          const [i, t] = pid.split("_");
          return { id: pid, i: Number(i), takenAt: Number(t) || null };
        })
        .sort((x, y) => x.i - y.i || (x.takenAt ?? 0) - (y.takenAt ?? 0));
    },
    ["photos", id],
    { tags: [`photos:${id}`], revalidate: 86_400 },
  )();
}

export async function checkToken(id: string, token: string | null): Promise<Stored | null> {
  if (!token) return null;
  const stored = await readStored(id);
  if (!stored) return null;
  const a = Buffer.from(stored.tokenHash, "hex");
  const b = Buffer.from(hash(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? stored : null;
}

export async function createRoute(snapshot: Snapshot, source: SourceDoc) {
  const id = randomString(10);
  const token = randomString(32);
  const now = Date.now();
  await writeStored(id, { snapshot, source, tokenHash: hash(token), createdAt: now, updatedAt: now });
  return { id, token };
}

export async function updateRoute(id: string, stored: Stored, snapshot: Snapshot, source: SourceDoc) {
  await writeStored(id, { ...stored, snapshot, source, updatedAt: Date.now() });
  revalidateTag(`route:${id}`);
}

export async function deleteRoute(id: string) {
  let cursor: string | undefined;
  do {
    const res = await list({ prefix: `routes/${id}/`, cursor, limit: 1000 });
    if (res.blobs.length) await del(res.blobs.map((b) => b.url));
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  revalidateTag(`route:${id}`);
  revalidateTag(`photos:${id}`);
}

export async function savePhoto(id: string, i: number, takenAt: number | null, file: Blob, ext: "jpg" | "webp") {
  const pid = `${i}_${takenAt ?? 0}_${randomString(8)}.${ext}`;
  await put(photoPrefix(id) + pid, file, {
    access: ACCESS,
    addRandomSuffix: false,
    contentType: ext === "jpg" ? "image/jpeg" : "image/webp",
  });
  revalidateTag(`photos:${id}`);
  return pid;
}

export async function readPhoto(id: string, pid: string) {
  const res = await get(photoPrefix(id) + pid, { access: ACCESS });
  if (!res || res.statusCode !== 200) return null;
  return res;
}

export async function deletePhoto(id: string, pid: string) {
  await del(photoPrefix(id) + pid);
  revalidateTag(`photos:${id}`);
}
