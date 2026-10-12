"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessoryItem } from "@/lib/admin/accessories";
import {
  accessoryValuesFrom,
  type AccessoryValues,
} from "@/lib/admin/accessory-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<AccessoryValues>,
  formData: FormData
) => Promise<FormState<AccessoryValues>>;

export function AccessorySection(props: {
  productId: number;
  items: AccessoryItem[];
  action: SaveAction;
}) {
  const { productId, items } = props;
  const run: SaveAction = async (prev, formData) => {
    const next = await props.action(prev, formData);
    if (next.status === "saved") toast.success("Zubehör gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(accessoryValuesFrom(productId, items))
  );
  const [rows, setRows] = useState(state.values.rows);
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows(state.values.rows);
  }
  const names = new Map(
    items.map((a) => [a.articleNumber, a.articleName ?? a.productName])
  );
  const e = state.fieldErrors;
  const move = (from: number, to: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });
  return (
    <section aria-labelledby="accessories-heading" className="mt-10 grid gap-4">
      <h2 id="accessories-heading" className="text-xl font-semibold">
        Zubehör
      </h2>
      <p className="text-sm text-muted-foreground">
        Artikel anderer Produkte, die auf der Produktseite als „Passendes
        Zubehör“ erscheinen.
      </p>
      <form action={formAction} className="grid gap-3" noValidate>
        <input type="hidden" name="productId" value={productId} />
        {rows.map((row, i) => {
          const id = `accessory-${i}`;
          const error = e[`rows.${i}.articleNumber`];
          const label = `Zubehör ${i + 1}`;
          const name = names.get(row.articleNumber.trim());
          return (
            <fieldset
              key={i}
              className="grid grid-cols-[1fr_auto] items-end gap-2"
            >
              <legend className="sr-only">{label}</legend>
              <Field id={id} label="Artikelnummer" error={error} hint={name}>
                <Input
                  id={id}
                  name="articleNumber"
                  value={row.articleNumber}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy(id, error, name)}
                  onChange={(ev) =>
                    setRows((rs) =>
                      rs.map((r, j) =>
                        j === i ? { articleNumber: ev.target.value } : r
                      )
                    )
                  }
                />
              </Field>
              <div className="flex gap-2 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} nach oben`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} nach unten`}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} entfernen`}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  Entfernen
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setRows((rs) => [...rs, { articleNumber: "" }])}
        >
          Zubehör hinzufügen
        </Button>
        {state.formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
          >
            {state.formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="justify-self-start">
          Zubehör speichern
        </Button>
      </form>
    </section>
  );
}
