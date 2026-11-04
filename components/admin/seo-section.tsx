"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PageMeta } from "@/lib/catalog/metadata";
import type { ContentOrigin } from "@/lib/catalog/types";
import { describedBy, Field } from "./field";
import { OriginBadge } from "./origin-badge";

type SeoField = "seoTitle" | "seoDescription";

type Props = {
  /** Current (controlled) values of the two fields. */
  values: Record<SeoField, string>;
  errors: { seoTitle?: string; seoDescription?: string };
  onChange: (field: SeoField, value: string) => void;
  /** Saved origin of the SEO texts, shown in the summary; omit if none. */
  origin?: ContentOrigin;
  /** Automatic title and description, shown as placeholders. */
  auto: PageMeta;
  /** AI suggestion boxes, rendered below their field; open the section. */
  boxes?: Partial<Record<SeoField, ReactNode>>;
  /** Changes with every new set of boxes; each new non-empty key opens the section. */
  boxesKey?: string;
};

const TITLE_HINT = "Höchstens 70 Zeichen.";
const DESCRIPTION_HINT = "Höchstens 160 Zeichen.";

export function SeoSection({
  values,
  errors,
  onChange,
  origin,
  auto,
  boxes = {},
  boxesKey = "",
}: Props) {
  const wantsOpen = Boolean(
    values.seoTitle ||
    values.seoDescription ||
    errors.seoTitle ||
    errors.seoDescription
  );
  // Opens when a reason appears (content, errors, a new set of suggestion
  // boxes, also after the user collapsed it), but never closes by itself
  // (typing, accepting a suggestion); closing stays with the user.
  const [open, setOpen] = useState(wantsOpen || boxesKey !== "");
  const [prevWantsOpen, setPrevWantsOpen] = useState(wantsOpen);
  const [prevBoxesKey, setPrevBoxesKey] = useState(boxesKey);
  if (prevWantsOpen !== wantsOpen) {
    setPrevWantsOpen(wantsOpen);
    if (wantsOpen) setOpen(true);
  }
  if (prevBoxesKey !== boxesKey) {
    setPrevBoxesKey(boxesKey);
    if (boxesKey !== "") setOpen(true);
  }
  return (
    <details
      open={open}
      onToggle={(ev) => setOpen(ev.currentTarget.open)}
      className="rounded-md border p-4 md:col-span-2"
    >
      <summary className="cursor-pointer text-sm font-medium">
        Suchmaschinen (optional){" "}
        {origin ? <OriginBadge origin={origin} /> : null}
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="text-sm text-muted-foreground">
          Leer lassen, dann erzeugt die Seite Titel und Beschreibung
          automatisch. Die Felder zeigen diesen Text als Vorschau.
        </p>
        <Field
          id="seoTitle"
          label="Titel für Suchmaschinen"
          hint={TITLE_HINT}
          error={errors.seoTitle}
        >
          <Input
            id="seoTitle"
            name="seoTitle"
            value={values.seoTitle}
            onChange={(ev) => onChange("seoTitle", ev.target.value)}
            placeholder={auto.title}
            aria-invalid={Boolean(errors.seoTitle)}
            aria-describedby={describedBy(
              "seoTitle",
              errors.seoTitle,
              TITLE_HINT
            )}
          />
        </Field>
        {boxes.seoTitle}
        <Field
          id="seoDescription"
          label="Beschreibung für Suchmaschinen"
          hint={DESCRIPTION_HINT}
          error={errors.seoDescription}
        >
          <Textarea
            id="seoDescription"
            name="seoDescription"
            rows={3}
            value={values.seoDescription}
            onChange={(ev) => onChange("seoDescription", ev.target.value)}
            placeholder={auto.description}
            aria-invalid={Boolean(errors.seoDescription)}
            aria-describedby={describedBy(
              "seoDescription",
              errors.seoDescription,
              DESCRIPTION_HINT
            )}
          />
        </Field>
        {boxes.seoDescription}
      </div>
    </details>
  );
}
