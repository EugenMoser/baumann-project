import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PageMeta } from "@/lib/catalog/metadata";
import { describedBy, Field } from "./field";

type Props = {
  values: { seoTitle: string; seoDescription: string };
  errors: { seoTitle?: string; seoDescription?: string };
  /** Automatic title and description, shown as placeholders. */
  auto: PageMeta;
};

const TITLE_HINT = "Höchstens 70 Zeichen.";
const DESCRIPTION_HINT = "Höchstens 160 Zeichen.";

export function SeoSection({ values, errors, auto }: Props) {
  const open = Boolean(
    values.seoTitle ||
    values.seoDescription ||
    errors.seoTitle ||
    errors.seoDescription
  );
  return (
    <details open={open} className="rounded-md border p-4 md:col-span-2">
      <summary className="cursor-pointer text-sm font-medium">
        Suchmaschinen (optional)
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
            defaultValue={values.seoTitle}
            placeholder={auto.title}
            aria-invalid={Boolean(errors.seoTitle)}
            aria-describedby={describedBy(
              "seoTitle",
              errors.seoTitle,
              TITLE_HINT
            )}
          />
        </Field>
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
            defaultValue={values.seoDescription}
            placeholder={auto.description}
            aria-invalid={Boolean(errors.seoDescription)}
            aria-describedby={describedBy(
              "seoDescription",
              errors.seoDescription,
              DESCRIPTION_HINT
            )}
          />
        </Field>
      </div>
    </details>
  );
}
