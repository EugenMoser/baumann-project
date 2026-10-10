"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleState, type FormState } from "@/lib/admin/form";
import { STATUS_LABEL, type ProductStatus } from "@/lib/admin/labels";
import type { EditorOptions } from "@/lib/admin/products";
import type { ProductValues } from "@/lib/admin/schemas";
import { slugify } from "@/lib/catalog/slug";
import { DeleteProductButton } from "./delete-product-button";
import { describedBy, Field, selectClass } from "./field";

type Props = {
  action: (
    prev: FormState<ProductValues>,
    formData: FormData
  ) => Promise<FormState<ProductValues>>;
  deleteAction: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
  initial: ProductValues;
  options: EditorOptions;
  productId: number | null;
  savedStatus: ProductStatus | null;
};

export function ProductForm({
  action,
  deleteAction,
  initial,
  options,
  productId,
  savedStatus,
}: Props) {
  const [state, formAction, pending] = useActionState(
    action,
    idleState(initial)
  );
  const [name, setName] = useState(state.values.name);
  const [slug, setSlug] = useState(state.values.slug);
  const slugTouched = useRef(productId !== null);
  const seen = useRef(state);

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") toast.success("Gespeichert.");
  }, [state]);

  const v = state.values;
  const e = state.fieldErrors;
  const slugHint =
    productId !== null
      ? "Eine Änderung von Slug oder Kategorie ändert die öffentliche Adresse."
      : "Wird aus dem Namen erzeugt.";
  const text = (
    id: keyof ProductValues,
    label: string,
    hint?: string,
    multiline = false
  ) => {
    const props = {
      id,
      name: id,
      defaultValue: v[id],
      "aria-invalid": Boolean(e[id]),
      "aria-describedby": describedBy(id, e[id], hint),
    };
    return (
      <Field id={id} label={label} error={e[id]} hint={hint}>
        {multiline ? <Textarea rows={6} {...props} /> : <Input {...props} />}
      </Field>
    );
  };

  return (
    <div className="mt-6 grid gap-6">
      <form
        action={formAction}
        className="grid gap-4 md:grid-cols-2"
        noValidate
      >
        <input type="hidden" name="id" value={productId ?? ""} />
        {state.formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive md:col-span-2"
          >
            {state.formError}
          </p>
        ) : null}
        <Field id="categoryId" label="Kategorie" error={e.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={v.categoryId}
            className={selectClass}
            aria-invalid={Boolean(e.categoryId)}
            aria-describedby={describedBy("categoryId", e.categoryId)}
          >
            <option value="">Bitte wählen</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="status" label="Status" error={e.status}>
          <select
            id="status"
            name="status"
            defaultValue={v.status}
            className={selectClass}
            aria-invalid={Boolean(e.status)}
            aria-describedby={describedBy("status", e.status)}
          >
            {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="name" label="Name" error={e.name}>
          <Input
            id="name"
            name="name"
            value={name}
            aria-invalid={Boolean(e.name)}
            aria-describedby={describedBy("name", e.name)}
            onChange={(ev) => {
              setName(ev.target.value);
              if (!slugTouched.current) setSlug(slugify(ev.target.value));
            }}
          />
        </Field>
        <Field id="slug" label="Slug" error={e.slug} hint={slugHint}>
          <Input
            id="slug"
            name="slug"
            value={slug}
            aria-invalid={Boolean(e.slug)}
            aria-describedby={describedBy("slug", e.slug, slugHint)}
            onChange={(ev) => {
              slugTouched.current = true;
              setSlug(ev.target.value);
            }}
          />
        </Field>
        {text("subtitle", "Untertitel")}
        {text("sortOrder", "Reihenfolge")}
        <div className="md:col-span-2">
          {text("description", "Beschreibung (Markdown)", undefined, true)}
        </div>
        <Field id="materialId" label="Material" error={e.materialId}>
          <select
            id="materialId"
            name="materialId"
            defaultValue={v.materialId}
            className={selectClass}
            aria-invalid={Boolean(e.materialId)}
            aria-describedby={describedBy("materialId", e.materialId)}
          >
            <option value="">Kein Material</option>
            {options.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} – {m.name}
              </option>
            ))}
          </select>
        </Field>
        {text("materialNote", "Materialhinweis")}
        {text(
          "seoTitle",
          "SEO-Titel",
          "Höchstens 70 Zeichen; leer = automatisch."
        )}
        {text(
          "seoDescription",
          "SEO-Beschreibung",
          "Höchstens 160 Zeichen; leer = automatisch."
        )}
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Speichern …"
              : productId === null
                ? "Produkt anlegen"
                : "Speichern"}
          </Button>
        </div>
      </form>
      {productId !== null &&
      savedStatus !== null &&
      savedStatus !== "published" ? (
        <DeleteProductButton
          action={deleteAction}
          productId={productId}
          productName={initial.name}
        />
      ) : null}
    </div>
  );
}
