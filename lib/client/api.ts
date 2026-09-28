"use client";
import type { Photo, Snapshot, SourceDoc } from "../types";

const tokenKey = (id: string) => `spur:token:${id}`;

export function getToken(id: string): string | null {
  try { return localStorage.getItem(tokenKey(id)); } catch { return null; }
}
export function setToken(id: string, token: string) {
  try { localStorage.setItem(tokenKey(id), token); } catch { /* private mode */ }
}
export function clearToken(id: string) {
  try { localStorage.removeItem(tokenKey(id)); } catch { /* ignore */ }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Etwas ist schiefgelaufen. Versuch es noch einmal.");
  return body as T;
}

export const photoUrl = (id: string, pid: string) => `/api/routes/${id}/photos/${pid}`;

export async function createShared(snapshot: Snapshot, source: SourceDoc) {
  return json<{ id: string; token: string }>(
    await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, source }),
    }),
  );
}

export async function updateShared(id: string, token: string, snapshot: Snapshot, source: SourceDoc) {
  return json<{ ok: true }>(
    await fetch(`/api/routes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-edit-token": token },
      body: JSON.stringify({ snapshot, source }),
    }),
  );
}

export async function loadSource(id: string, token: string) {
  return json<{ source: SourceDoc }>(
    await fetch(`/api/routes/${id}`, { headers: { "x-edit-token": token }, cache: "no-store" }),
  );
}

export async function deleteShared(id: string, token: string) {
  return json<{ ok: true }>(
    await fetch(`/api/routes/${id}`, { method: "DELETE", headers: { "x-edit-token": token } }),
  );
}

export async function uploadPhoto(
  id: string, i: number, takenAt: number | null, file: Blob, token: string | null,
): Promise<Photo> {
  const form = new FormData();
  form.set("file", file, "foto.jpg");
  form.set("i", String(i));
  if (takenAt) form.set("takenAt", String(takenAt));
  const res = await json<{ id: string; i: number; takenAt: number | null }>(
    await fetch(`/api/routes/${id}/photos`, {
      method: "POST",
      body: form,
      headers: token ? { "x-edit-token": token } : undefined,
    }),
  );
  return { ...res, src: photoUrl(id, res.id) };
}

export async function removePhoto(id: string, token: string, pid: string) {
  return json<{ ok: true }>(
    await fetch(`/api/routes/${id}/photos/${pid}`, { method: "DELETE", headers: { "x-edit-token": token } }),
  );
}
