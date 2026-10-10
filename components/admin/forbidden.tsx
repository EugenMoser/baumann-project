export function Forbidden() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
      <p className="mt-2 text-muted-foreground">
        Dieses Konto hat keine Admin-Rechte. Bitte melden Sie sich mit einem
        Admin-Konto an.
      </p>
    </main>
  );
}
