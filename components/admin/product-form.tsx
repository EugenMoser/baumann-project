"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleState, type FormState } from "@/lib/admin/form";
import { STATUS_LABEL, type ProductStatus } from "@/lib/admin/labels";
import type { EditorOptions } from "@/lib/admin/products";
import { AI_ACCEPT_FIELDS, type ProductValues } from "@/lib/admin/schemas";
import type { AiAvailability } from "@/lib/ai/settings";
import { autoProductMeta } from "@/lib/catalog/metadata";
import type { ContentOrigin } from "@/lib/catalog/types";
import { AddressLine } from "./address-line";
import {
  AiSuggest,
  SuggestionBox,
  type Suggestion,
  type SuggestionField,
} from "./ai-suggest";
import { DeleteProductButton } from "./delete-product-button";
import { describedBy, Field, selectClass } from "./field";
import { OriginBadge } from "./origin-badge";
import { SeoSection } from "./seo-section";

type TextKey = "description" | "seoTitle" | "seoDescription";

// Suggestion field of the route -> form field (also its element id) and the
// hidden input that carries the accepted generation id to the save action.
const TARGET = {
  description: {
    key: "description",
    accept: AI_ACCEPT_FIELDS.description,
  },
  seo_title: { key: "seoTitle", accept: AI_ACCEPT_FIELDS.seoTitle },
  seo_description: {
    key: "seoDescription",
    accept: AI_ACCEPT_FIELDS.seoDescription,
  },
} as const satisfies Record<SuggestionField, { key: TextKey; accept: string }>;
const ORDER: SuggestionField[] = [
  "description",
  "seo_title",
  "seo_description",
];

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
  /** Public path of a saved product; null on create. */
  address: string | null;
  /** Saved article numbers and colour count, for the automatic SEO preview. */
  seoContext: { articleNumbers: string[]; colorCount: number };
  /** AI assistant of a saved product; null on create. */
  ai: { availability: AiAvailability; status: ProductStatus } | null;
  /** Saved origin of the description and of the SEO texts. */
  origins: { description: ContentOrigin; seo: ContentOrigin };
};

export function ProductForm({
  action,
  deleteAction,
  initial,
  options,
  productId,
  savedStatus,
  address,
  seoContext,
  ai,
  origins,
}: Props) {
  const [state, formAction, pending] = useActionState(
    action,
    idleState(initial)
  );
  const [name, setName] = useState(state.values.name);
  const [subtitle, setSubtitle] = useState(state.values.subtitle);
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    description: state.values.description,
    seoTitle: state.values.seoTitle,
    seoDescription: state.values.seoDescription,
  });
  // Ids of accepted AI suggestions, sent as hidden fields (D6).
  const [accepted, setAccepted] = useState<Partial<Record<TextKey, number>>>(
    {}
  );
  const [suggestions, setSuggestions] = useState<
    Partial<Record<SuggestionField, Suggestion>>
  >({});
  const generateButton = useRef<HTMLButtonElement>(null);
  const acceptButtons = useRef<
    Partial<Record<SuggestionField, HTMLButtonElement | null>>
  >({});
  const seen = useRef(state);

  // Re-sync the controlled fields with each action response. Accepted ids
  // survive a save with errors and are consumed by a successful save.
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setName(state.values.name);
    setSubtitle(state.values.subtitle);
    setTexts({
      description: state.values.description,
      seoTitle: state.values.seoTitle,
      seoDescription: state.values.seoDescription,
    });
    if (state.status === "saved") setAccepted({});
  }

  const setText = (key: TextKey, value: string) =>
    setTexts((prev) => ({ ...prev, [key]: value }));

  const removeSuggestion = (field: SuggestionField) =>
    setSuggestions((prev) => {
      const rest = { ...prev };
      delete rest[field];
      return rest;
    });

  const accept = (s: Suggestion) => {
    const { key } = TARGET[s.field];
    setText(key, s.text);
    setAccepted((prev) => ({ ...prev, [key]: s.generationId }));
    removeSuggestion(s.field);
    document.getElementById(key)?.focus();
  };

  const discard = (s: Suggestion) => {
    removeSuggestion(s.field);
    const open = ORDER.filter((f) => f !== s.field && suggestions[f]);
    const next =
      open.find((f) => ORDER.indexOf(f) > ORDER.indexOf(s.field)) ?? open[0];
    (next ? acceptButtons.current[next] : generateButton.current)?.focus();
  };

  const box = (field: SuggestionField) => {
    const suggestion = suggestions[field];
    return suggestion ? (
      <SuggestionBox
        suggestion={suggestion}
        onAccept={accept}
        onDiscard={discard}
        acceptRef={(el) => {
          acceptButtons.current[field] = el;
        }}
      />
    ) : null;
  };

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") toast.success("Gespeichert.");
  }, [state]);

  const v = state.values;
  const e = state.fieldErrors;
  const creating = productId === null;
  const statusHint = creating
    ? "Artikel, Farben, Bilder und KI-Vorschläge folgen nach dem ersten Speichern."
    : undefined;
  const statusOptions = (Object.keys(STATUS_LABEL) as ProductStatus[]).filter(
    (s) => !creating || s === "draft"
  );
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
        {ai
          ? ORDER.map((field) => {
              const { key, accept: hidden } = TARGET[field];
              const id = accepted[key];
              return id === undefined ? null : (
                <input key={hidden} type="hidden" name={hidden} value={id} />
              );
            })
          : null}
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
            key={v.categoryId}
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
        <Field id="status" label="Status" error={e.status} hint={statusHint}>
          <select
            id="status"
            name="status"
            key={v.status}
            defaultValue={v.status}
            className={selectClass}
            aria-invalid={Boolean(e.status)}
            aria-describedby={describedBy("status", e.status, statusHint)}
          >
            {statusOptions.map((s) => (
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
            onChange={(ev) => setName(ev.target.value)}
          />
        </Field>
        <AddressLine
          address={address}
          hint="Eine Änderung der Kategorie ändert die Adresse."
        />
        <Field id="subtitle" label="Untertitel" error={e.subtitle}>
          <Input
            id="subtitle"
            name="subtitle"
            value={subtitle}
            aria-invalid={Boolean(e.subtitle)}
            aria-describedby={describedBy("subtitle", e.subtitle)}
            onChange={(ev) => setSubtitle(ev.target.value)}
          />
        </Field>
        {text("sortOrder", "Reihenfolge")}
        <div className="grid gap-4 md:col-span-2">
          {ai && productId !== null ? (
            <AiSuggest
              productId={productId}
              availability={ai.availability}
              status={ai.status}
              buttonRef={generateButton}
              onResult={(list) =>
                setSuggestions(
                  Object.fromEntries(list.map((s) => [s.field, s]))
                )
              }
            />
          ) : null}
          <Field
            id="description"
            label="Beschreibung (Markdown)"
            error={e.description}
            badge={<OriginBadge origin={origins.description} />}
          >
            <Textarea
              id="description"
              name="description"
              rows={6}
              value={texts.description}
              onChange={(ev) => setText("description", ev.target.value)}
              aria-invalid={Boolean(e.description)}
              aria-describedby={describedBy("description", e.description)}
            />
          </Field>
          {box("description")}
        </div>
        <Field id="materialId" label="Material" error={e.materialId}>
          <select
            id="materialId"
            name="materialId"
            key={v.materialId}
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
        <SeoSection
          values={texts}
          errors={e}
          onChange={setText}
          origin={origins.seo}
          boxes={{
            seoTitle: box("seo_title"),
            seoDescription: box("seo_description"),
          }}
          auto={autoProductMeta({
            name,
            subtitle: subtitle.trim() || null,
            ...seoContext,
          })}
        />
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
