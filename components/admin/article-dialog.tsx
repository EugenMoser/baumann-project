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
import { Textarea } from "@/components/ui/textarea";
import {
  articleValuesFrom,
  type ArticleValues,
} from "@/lib/admin/article-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import type {
  ArticleEditItem,
  AttributeOption,
  EditorOptions,
} from "@/lib/admin/products";
import { describedBy, Field, selectClass } from "./field";

type SaveAction = (
  prev: FormState<ArticleValues>,
  formData: FormData
) => Promise<FormState<ArticleValues>>;

type Props = {
  action: SaveAction;
  productId: number;
  article: ArticleEditItem | null;
  attributes: AttributeOption[];
  materials: EditorOptions["materials"];
};

type PackRow = { quantity: string; label: string };
const emptyRows = (rows: PackRow[]): PackRow[] =>
  rows.length > 0 ? rows : [{ quantity: "", label: "" }];

export function ArticleDialog(props: Props) {
  const { article } = props;
  const [open, setOpen] = useState(false);
  // Remount the form on every open so stale action state is dropped.
  const [openCount, setOpenCount] = useState(0);
  const title = article
    ? `Artikel ${article.articleNumber} bearbeiten`
    : "Artikel hinzufügen";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((c) => c + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {article ? (
          <Button type="button" variant="outline" size="sm" aria-label={title}>
            Bearbeiten
          </Button>
        ) : (
          <Button type="button">Artikel hinzufügen</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Angaben zum Artikel, seinen Maßen und Verpackungseinheiten.
          </DialogDescription>
        </DialogHeader>
        <ArticleForm
          key={openCount}
          {...props}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ArticleForm({
  action,
  productId,
  article,
  attributes,
  materials,
  onSaved,
}: Props & { onSaved: () => void }) {
  // Toast in the wrapper so it survives a re-render of the refreshed tree.
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Artikel gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(articleValuesFrom(article, productId))
  );
  const [rows, setRows] = useState(() => emptyRows(state.values.packaging));
  const seen = useRef(state);

  // Re-sync pack rows with each action response.
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows(emptyRows(state.values.packaging));
  }

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (state.status === "saved") onSaved();
  }, [state, onSaved]);

  const v = state.values;
  const e = state.fieldErrors;
  const text = (
    id: "name" | "note" | "materialNote" | "sortOrder",
    label: string
  ) => (
    <Field id={`article-${id}`} label={label} error={e[id]}>
      <Input
        id={`article-${id}`}
        name={id}
        defaultValue={v[id]}
        aria-invalid={Boolean(e[id])}
        aria-describedby={describedBy(`article-${id}`, e[id])}
      />
    </Field>
  );
  const numberHint = article
    ? "Kann nach dem Anlegen nicht mehr geändert werden."
    : undefined;
  const setRow = (i: number, patch: Partial<PackRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="id" value={article?.id ?? ""} />
      <input type="hidden" name="productId" value={productId} />
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}
      <Field
        id="article-number"
        label="Artikelnummer"
        error={e.articleNumber}
        hint={numberHint}
      >
        <Input
          id="article-number"
          name="articleNumber"
          defaultValue={v.articleNumber}
          readOnly={article !== null}
          aria-invalid={Boolean(e.articleNumber)}
          aria-describedby={describedBy(
            "article-number",
            e.articleNumber,
            numberHint
          )}
        />
      </Field>
      {text("name", "Name")}
      <Field
        id="article-description"
        label="Beschreibung"
        error={e.description}
      >
        <Textarea
          id="article-description"
          name="description"
          rows={3}
          defaultValue={v.description}
          aria-invalid={Boolean(e.description)}
          aria-describedby={describedBy("article-description", e.description)}
        />
      </Field>
      {text("note", "Hinweis")}
      <Field id="article-material" label="Material" error={e.materialId}>
        <select
          id="article-material"
          name="materialId"
          key={v.materialId}
          defaultValue={v.materialId}
          className={selectClass}
          aria-invalid={Boolean(e.materialId)}
          aria-describedby={describedBy("article-material", e.materialId)}
        >
          <option value="">Wie Produkt</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {text("materialNote", "Materialhinweis")}
      {text("sortOrder", "Reihenfolge")}
      {attributes.map((a) => {
        const id = `article-attr-${a.id}`;
        const key = `attr:${a.id}`;
        return (
          <Field
            key={a.id}
            id={id}
            label={`${a.label}${a.unit ? ` (${a.unit})` : ""}`}
            error={e[key]}
          >
            <Input
              id={id}
              name={key}
              defaultValue={v.attributes[String(a.id)] ?? ""}
              inputMode={a.dataType === "decimal" ? "decimal" : undefined}
              aria-invalid={Boolean(e[key])}
              aria-describedby={describedBy(id, e[key])}
            />
          </Field>
        );
      })}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">
          Verpackungseinheiten
        </legend>
        {rows.map((row, i) => {
          const err = e[`packaging.${i}`];
          const qid = `pack-q-${i}`;
          const lid = `pack-l-${i}`;
          return (
            <div key={i} className="grid gap-1.5">
              <div className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
                <Field id={qid} label="Menge">
                  <Input
                    id={qid}
                    name="packQuantity"
                    inputMode="numeric"
                    value={row.quantity}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${qid}-row-error` : undefined}
                    onChange={(ev) => setRow(i, { quantity: ev.target.value })}
                  />
                </Field>
                <Field id={lid} label="Bezeichnung (optional)">
                  <Input
                    id={lid}
                    name="packLabel"
                    value={row.label}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${qid}-row-error` : undefined}
                    onChange={(ev) => setRow(i, { label: ev.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Einheit ${i + 1} entfernen`}
                  onClick={() =>
                    setRows((rs) => emptyRows(rs.filter((_, j) => j !== i)))
                  }
                >
                  Entfernen
                </Button>
              </div>
              {err ? (
                <p id={`${qid}-row-error`} className="text-sm text-destructive">
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setRows((rs) => [...rs, { quantity: "", label: "" }])}
        >
          Weitere Einheit
        </Button>
      </fieldset>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Speichern
      </Button>
    </form>
  );
}
