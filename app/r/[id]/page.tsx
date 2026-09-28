import type { Metadata } from "next";
import { notFound } from "next/navigation";
import App from "@/components/App";
import { fmtDuration, fmtInt, fmtKm } from "@/lib/geo";
import { isValidId, loadPhotos, loadSnapshot } from "@/lib/server/store";
import { computeStats } from "@/lib/stats";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const snap = isValidId(id) ? await loadSnapshot(id) : null;
  if (!snap) return { title: "Spur", robots: { index: false, follow: false } };
  const s = computeStats(snap.points, snap.excluded, snap.segments);
  const description = `${fmtDuration(s.duration)} unterwegs, ${fmtKm(s.distance)}, ${fmtInt(s.ascent)} Höhenmeter`;
  return {
    title: snap.name,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: snap.name, description, type: "website" },
    twitter: { card: "summary_large_image", title: snap.name, description },
  };
}

export default async function SharedRoute({ params }: Props) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const [snapshot, photos] = await Promise.all([loadSnapshot(id), loadPhotos(id)]);
  if (!snapshot) notFound();
  return <App shared={{ id, snapshot, photos }} />;
}
