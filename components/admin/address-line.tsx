import type { ReactNode } from "react";

/**
 * Read-only public address of a record (6c D2). Without an address (create)
 * it explains where the address comes from; `hint` adds a line below a saved one.
 */
export function AddressLine({
  address,
  hint,
}: {
  address: string | null;
  hint?: ReactNode;
}) {
  if (address === null)
    return (
      <p className="text-sm text-muted-foreground">
        Die Adresse entsteht beim Anlegen aus dem Namen.
      </p>
    );
  return (
    <div className="grid gap-1">
      <p className="text-sm">Adresse: {address}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
