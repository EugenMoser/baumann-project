"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import type { ColorListItem } from "@/lib/admin/master-data";
import {
  emptyColorValues,
  type ColorMasterValues,
} from "@/lib/admin/master-schema";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<ColorMasterValues>,
  formData: FormData
) => Promise<FormState<ColorMasterValues>>;

type Props = {
  action: SaveAction;
  color: ColorListItem | null;
  families: string[];
};

const valuesOf = (c: ColorListItem | null): ColorMasterValues =>
  c
    ? {
        name: c.name,
        ralReference: c.ralReference ?? "",
        hexCode: c.hexCode,
        family: c.family,
      }
    : emptyColorValues();

export function ColorDialog(props: Props) {
  const { color } = props;
  const [open, setOpen] = useState(false);
  // Remount the form on every open so stale action state is dropped.
  const [openCount, setOpenCount] = useState(0);
  const title = color ? `Farbe „${color.name}“ bearbeiten` : "Farbe anlegen";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((c) => c + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {color ? (
          <Button type="button" variant="outline" size="sm" aria-label={title}>
            Bearbeiten
          </Button>
        ) : (
          <Button type="button">Farbe anlegen</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Der Farbcode bestimmt das Farbfeld auf der Produktseite.
          </DialogDescription>
        </DialogHeader>
        <ColorForm key={openCount} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ColorForm({
  action,
  color,
  families,
  onSaved,
}: Props & { onSaved: () => void }) {
  // Toast in the wrapper so it survives a re-render of the refreshed tree.
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Farbe gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(valuesOf(color))
  );
  const [hex, setHex] = useState(state.values.hexCode);
  const seen = useRef(state);
  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") onSaved();
  }, [state, onSaved]);

  const v = state.values;
  const e = state.fieldErrors;
  const swatchOk = /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="id" value={color?.id ?? ""} />
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}
      <Field id="color-name" label="Name" error={e.name}>
        <Input
          id="color-name"
          name="name"
          defaultValue={v.name}
          aria-invalid={Boolean(e.name)}
          aria-describedby={describedBy("color-name", e.name)}
        />
      </Field>
      <Field
        id="color-ral"
        label="RAL-Hinweis (optional)"
        error={e.ralReference}
      >
        <Input
          id="color-ral"
          name="ralReference"
          defaultValue={v.ralReference}
          aria-invalid={Boolean(e.ralReference)}
          aria-describedby={describedBy("color-ral", e.ralReference)}
        />
      </Field>
      <Field id="color-hex" label="Farbcode" error={e.hexCode}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            data-testid="color-swatch"
            className="size-8 shrink-0 rounded border border-border"
            style={{ background: swatchOk ? hex.trim() : "transparent" }}
          />
          <Input
            id="color-hex"
            name="hexCode"
            value={hex}
            onChange={(ev) => setHex(ev.target.value)}
            aria-invalid={Boolean(e.hexCode)}
            aria-describedby={describedBy("color-hex", e.hexCode)}
          />
        </div>
      </Field>
      <Field id="color-family" label="Farbfamilie" error={e.family}>
        <Input
          id="color-family"
          name="family"
          list="color-families"
          defaultValue={v.family}
          aria-invalid={Boolean(e.family)}
          aria-describedby={describedBy("color-family", e.family)}
        />
      </Field>
      <datalist id="color-families">
        {families.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Speichern
      </Button>
    </form>
  );
}
