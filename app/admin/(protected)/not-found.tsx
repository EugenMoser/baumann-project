import Link from "next/link";

// Admin 404 (e.g. a deleted product): rendered inside the admin layout, so
// the public header and footer never appear here.
export default function AdminNotFound() {
  return (
    <div className="grid gap-4 py-8">
      <h1 className="text-2xl font-semibold">Nicht gefunden</h1>
      <p className="text-muted-foreground">
        Diesen Datensatz gibt es nicht (mehr).
      </p>
      <Link
        href="/admin/produkte"
        className="justify-self-start text-sm underline-offset-4 hover:underline"
      >
        ← Alle Produkte
      </Link>
    </div>
  );
}
