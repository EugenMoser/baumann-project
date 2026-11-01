"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { colorValuesFrom, type ColorValues } from "@/lib/admin/color-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import type { ColorAssignment, EditorOptions } from "@/lib/admin/products";
import { describedBy, Field, selectClass } from "./field";
import { SortableList } from "./sortable-list";

type SaveAction = (
  prev: FormState<ColorValues>,
  formData: FormData
) => Promise<FormState<ColorValues>>;

type Props = {
  action: SaveAction;
  productId: number;
  initial: ColorAssignment[];
  colors: EditorOptions["colors"];
};

// Keys exist only on the client: they keep a row's identity (and its inputs)
// stable while rows are reordered, added or removed.
type Row = ColorValues["rows"][number] & { key: string };

let rowSeq = 0;
const newKey = () => `color-row-${++rowSeq}`;
const keyed = (
  rows: ColorValues["rows"],
  previous: readonly Row[] = []
): Row[] => rows.map((r, i) => ({ ...r, key: previous[i]?.key ?? newKey() }));

export function ColorSection({ action, productId, initial, colors }: Props) {
  // Toast in the wrapper so it survives a re-render of the refreshed tree.
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Farben gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(colorValuesFrom(productId, initial))
  );
  const [rows, setRows] = useState<Row[]>(() => keyed(state.values.rows));
  const [defaultId, setDefaultId] = useState(state.values.defaultColorId);

  // Re-sync controlled rows with each action response.
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows((prev) => keyed(state.values.rows, prev));
    setDefaultId(state.values.defaultColorId);
  }

  const e = state.fieldErrors;
  const used = new Set(rows.map((r) => r.colorId));
  const nextColor = colors.find((c) => !used.has(String(c.id)));
  const setRow = (i: number, patch: Partial<Omit<Row, "key">>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const hexOf = (colorId: string) =>
    colors.find((c) => String(c.id) === colorId)?.hexCode;
  const nameOf = (colorId: string) =>
    colors.find((c) => String(c.id) === colorId)?.name ?? "Farbe";

  return (
    <section aria-labelledby="colors-heading" className="mt-10 grid gap-4">
      <h2 id="colors-heading" className="text-xl font-semibold">
        Farben
      </h2>
      <p className="text-sm text-muted-foreground">
        Bestellnummer = Artikelnummer + „ - “ + Suffix. Ohne Farben gilt die
        reine Artikelnummer. Position 1 ist die erste Farbe auf der
        Produktseite.
      </p>
      <form action={formAction} className="grid gap-4" noValidate>
        <input type="hidden" name="productId" value={productId} />
        <SortableList
          items={rows}
          getKey={(r) => r.key}
          getLabel={(r) => nameOf(r.colorId)}
          noun="Farbe"
          onReorder={setRows}
          renderItem={(row, i) => {
            const hex = hexOf(row.colorId);
            const cid = `color-${i}`;
            const sid = `suffix-${i}`;
            const did = `default-${i}`;
            return (
              <fieldset className="grid min-w-0 grid-cols-[auto_1fr] items-end gap-2 sm:grid-cols-[auto_2fr_1fr_auto_auto]">
                <legend className="sr-only">Farbe {i + 1}</legend>
                <span
                  aria-hidden
                  className="mb-1 size-6 rounded border"
                  style={{ background: hex ?? "transparent" }}
                />
                <Field id={cid} label="Farbe" error={e[`rows.${i}.colorId`]}>
                  <select
                    id={cid}
                    name="colorId"
                    value={row.colorId}
                    className={selectClass}
                    aria-invalid={Boolean(e[`rows.${i}.colorId`])}
                    aria-describedby={describedBy(cid, e[`rows.${i}.colorId`])}
                    onChange={(ev) => {
                      // Keep the default radio attached to this row's colour.
                      if (defaultId === row.colorId)
                        setDefaultId(ev.target.value);
                      setRow(i, { colorId: ev.target.value });
                    }}
                  >
                    {colors.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="col-span-2 sm:col-span-1">
                  <Field id={sid} label="Suffix" error={e[`rows.${i}.suffix`]}>
                    <Input
                      id={sid}
                      name="suffix"
                      value={row.suffix}
                      aria-invalid={Boolean(e[`rows.${i}.suffix`])}
                      aria-describedby={describedBy(sid, e[`rows.${i}.suffix`])}
                      onChange={(ev) => setRow(i, { suffix: ev.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-2 mb-2 flex items-center gap-1.5 sm:col-span-1">
                  <input
                    id={did}
                    type="radio"
                    name="defaultColor"
                    value={row.colorId}
                    checked={defaultId === row.colorId}
                    onChange={() => setDefaultId(row.colorId)}
                  />
                  <label htmlFor={did} className="text-sm">
                    Standard
                  </label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="col-span-2 justify-self-start sm:col-span-1"
                  aria-label={`Farbe ${i + 1} entfernen`}
                  onClick={() => {
                    const rest = rows.filter((_, j) => j !== i);
                    // The default moves to the first remaining row.
                    if (defaultId === row.colorId)
                      setDefaultId(rest[0]?.colorId ?? "");
                    setRows(rest);
                  }}
                >
                  Entfernen
                </Button>
              </fieldset>
            );
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={!nextColor}
          onClick={() => {
            if (!nextColor) return;
            const id = String(nextColor.id);
            setRows((rs) => [
              ...rs,
              { key: newKey(), colorId: id, suffix: "" },
            ]);
            // Without a default, the new row becomes the default.
            if (!rows.some((r) => r.colorId === defaultId)) setDefaultId(id);
          }}
        >
          Farbe hinzufügen
        </Button>
        {e.colors ? (
          <p role="alert" className="text-sm text-destructive">
            {e.colors}
          </p>
        ) : null}
        {state.formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
          >
            {state.formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="justify-self-start">
          Farben speichern
        </Button>
      </form>
    </section>
  );
}
