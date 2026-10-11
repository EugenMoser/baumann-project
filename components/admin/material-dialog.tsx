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
import type { MaterialListItem } from "@/lib/admin/master-data";
import {
  emptyMaterialValues,
  type MaterialValues,
} from "@/lib/admin/master-schema";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<MaterialValues>,
  formData: FormData
) => Promise<FormState<MaterialValues>>;

type Props = {
  action: SaveAction;
  material: MaterialListItem | null;
};

const valuesOf = (m: MaterialListItem | null): MaterialValues =>
  m ? { code: m.code, name: m.name } : emptyMaterialValues();

export function MaterialDialog(props: Props) {
  const { material } = props;
  const [open, setOpen] = useState(false);
  // Remount the form on every open so stale action state is dropped.
  const [openCount, setOpenCount] = useState(0);
  const title = material
    ? `Material „${material.code}“ bearbeiten`
    : "Material anlegen";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((c) => c + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {material ? (
          <Button type="button" variant="outline" size="sm" aria-label={title}>
            Bearbeiten
          </Button>
        ) : (
          <Button type="button">Material anlegen</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Kürzel und Name erscheinen in den Produktdaten.
          </DialogDescription>
        </DialogHeader>
        <MaterialForm
          key={openCount}
          {...props}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MaterialForm({
  action,
  material,
  onSaved,
}: Props & { onSaved: () => void }) {
  // Toast in the wrapper so it survives a re-render of the refreshed tree.
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Material gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(valuesOf(material))
  );
  const seen = useRef(state);
  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") onSaved();
  }, [state, onSaved]);

  const v = state.values;
  const e = state.fieldErrors;
  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="id" value={material?.id ?? ""} />
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}
      <Field id="material-code" label="Kürzel" error={e.code}>
        <Input
          id="material-code"
          name="code"
          defaultValue={v.code}
          aria-invalid={Boolean(e.code)}
          aria-describedby={describedBy("material-code", e.code)}
        />
      </Field>
      <Field id="material-name" label="Name" error={e.name}>
        <Input
          id="material-name"
          name="name"
          defaultValue={v.name}
          aria-invalid={Boolean(e.name)}
          aria-describedby={describedBy("material-name", e.name)}
        />
      </Field>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Speichern
      </Button>
    </form>
  );
}
