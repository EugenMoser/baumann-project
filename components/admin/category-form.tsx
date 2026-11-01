"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryValues } from "@/lib/admin/category-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import type { AttributeOption } from "@/lib/admin/products";
import { AddressLine } from "./address-line";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<CategoryValues>,
  formData: FormData
) => Promise<FormState<CategoryValues>>;

type Props = {
  action: SaveAction;
  initial: CategoryValues;
  attributes: AttributeOption[];
  categoryId: number | null;
  /** Public path of a saved category; null on create. */
  address: string | null;
};

export function CategoryForm({
  action,
  initial,
  attributes,
  categoryId,
  address,
}: Props) {
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(run, idleState(initial));
  const v = state.values;
  const e = state.fieldErrors;
  const assigned = new Map(
    v.attributes.map((a) => [a.attributeId, a.sortOrder])
  );
  const attributeError = Object.entries(e).find(([k]) =>
    k.startsWith("attributes")
  )?.[1];
  const text = (name: keyof CategoryValues, label: string, max?: number) => (
    <Field id={name} label={label} error={e[name]}>
      <Input
        id={name}
        name={name}
        defaultValue={v[name] as string}
        maxLength={max}
        aria-invalid={Boolean(e[name])}
        aria-describedby={describedBy(name, e[name])}
      />
    </Field>
  );
  return (
    <form action={formAction} className="mt-6 grid max-w-3xl gap-4" noValidate>
      {categoryId !== null ? (
        <input type="hidden" name="id" value={categoryId} />
      ) : null}
      <Field id="name" label="Name" error={e.name}>
        <Input
          id="name"
          name="name"
          defaultValue={v.name}
          aria-invalid={Boolean(e.name)}
          aria-describedby={describedBy("name", e.name)}
        />
      </Field>
      <AddressLine address={address} />
      <Field id="introText" label="Intro-Text (Markdown)" error={e.introText}>
        <Textarea
          id="introText"
          name="introText"
          rows={6}
          defaultValue={v.introText}
          aria-invalid={Boolean(e.introText)}
          aria-describedby={describedBy("introText", e.introText)}
        />
      </Field>
      {text("seoTitle", "SEO-Titel", 70)}
      {text("seoDescription", "SEO-Beschreibung", 160)}
      {text("sortOrder", "Reihenfolge")}
      <fieldset className="grid gap-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">
          Attribute im Artikel-Dialog
        </legend>
        {attributes.map((a) => {
          const cid = `attr-${a.id}`;
          const sid = `attrSort-${a.id}`;
          const label = a.unit ? `${a.label} (${a.unit})` : a.label;
          return (
            <div
              key={a.id}
              className="grid grid-cols-[auto_1fr_8rem] items-center gap-3"
            >
              <input
                id={cid}
                type="checkbox"
                name="attributeId"
                value={a.id}
                defaultChecked={assigned.has(String(a.id))}
              />
              <label htmlFor={cid} className="text-sm">
                {label}
              </label>
              <Input
                id={sid}
                name={sid}
                aria-label={`Reihenfolge ${a.label}`}
                inputMode="numeric"
                defaultValue={assigned.get(String(a.id)) ?? String(a.sortOrder)}
              />
            </div>
          );
        })}
      </fieldset>
      {attributeError ? (
        <p role="alert" className="text-sm text-destructive">
          {attributeError}
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
        {categoryId === null ? "Kategorie anlegen" : "Speichern"}
      </Button>
    </form>
  );
}
