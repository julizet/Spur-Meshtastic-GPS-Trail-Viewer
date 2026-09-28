import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", height: "100dvh", padding: 24 }}>
      <div style={{ maxWidth: 340 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>Diese Route gibt es nicht mehr</h1>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          Vielleicht wurde der Link gelöscht oder er ist unvollständig.
        </p>
        <Link href="/" className="link" style={{ fontSize: 15 }}>Eigene Route laden</Link>
      </div>
    </main>
  );
}
