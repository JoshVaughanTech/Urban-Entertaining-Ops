import { Card } from "@/components/ui";

/** Every screen under /app reads the database, so a slow connection would
 *  otherwise show nothing at all. */
export default function Loading() {
  return (
    <Card>
      <p style={{ color: "var(--muted)", margin: 0 }}>Loading…</p>
    </Card>
  );
}
