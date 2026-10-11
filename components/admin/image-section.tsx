// components/admin/image-section.tsx
"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import type { MediaItem } from "@/lib/admin/media";
import {
  mediaValuesFrom,
  type MediaValues,
  type UploadValues,
} from "@/lib/admin/media-schema";
import { publicMediaUrl } from "@/lib/catalog/media";
import { describedBy, Field } from "./field";
import { RemoveImageButton } from "./remove-image-button";
import { UploadForm } from "./upload-form";

type SaveAction = (
  prev: FormState<MediaValues>,
  formData: FormData
) => Promise<FormState<MediaValues>>;
type UploadAction = (
  prev: FormState<UploadValues>,
  formData: FormData
) => Promise<FormState<UploadValues>>;
type RemoveAction = (
  prev: FormState<null>,
  formData: FormData
) => Promise<FormState<null>>;

type Props = {
  productId: number;
  items: MediaItem[];
  saveAction: SaveAction;
  uploadAction: UploadAction;
  removeAction: RemoveAction;
};

export function ImageSection({
  productId,
  items,
  saveAction,
  uploadAction,
  removeAction,
}: Props) {
  const run: SaveAction = async (prev, formData) => {
    const next = await saveAction(prev, formData);
    if (next.status === "saved") toast.success("Bilder gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(mediaValuesFrom(productId, items))
  );
  const [rows, setRows] = useState(state.values.rows);
  const [thumbnailId, setThumbnailId] = useState(state.values.thumbnailId);
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows(state.values.rows);
    setThumbnailId(state.values.thumbnailId);
  }
  const byId = new Map(items.map((m) => [String(m.mediaId), m]));
  const e = state.fieldErrors;
  const move = (from: number, to: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });

  return (
    <section aria-labelledby="images-heading" className="mt-10 grid gap-4">
      <h2 id="images-heading" className="text-xl font-semibold">
        Bilder
      </h2>
      <p className="text-sm text-muted-foreground">
        Das Vorschaubild erscheint in Kacheln und als erstes Bild auf der
        Produktseite.
      </p>
      {rows.length === 0 ? (
        <p>Noch keine Bilder.</p>
      ) : (
        <form action={formAction} className="grid gap-4" noValidate>
          <input type="hidden" name="productId" value={productId} />
          {rows.map((row, i) => {
            const media = byId.get(row.mediaId);
            const aid = `alt-${row.mediaId}`;
            const tid = `thumb-${row.mediaId}`;
            const label = `Bild ${i + 1}`;
            return (
              <fieldset
                key={row.mediaId}
                className="grid grid-cols-[96px_1fr_auto] items-end gap-3"
              >
                <legend className="sr-only">{label}</legend>
                <input
                  type="hidden"
                  name="mediaId"
                  value={row.mediaId}
                  data-testid="media-id"
                />
                {media ? (
                  <Image
                    src={publicMediaUrl(media.storagePath)}
                    alt=""
                    width={media.width}
                    height={media.height}
                    sizes="96px"
                    className="h-24 w-24 rounded border object-contain"
                  />
                ) : (
                  <span className="h-24 w-24 rounded border" aria-hidden />
                )}
                <Field id={aid} label="Alt-Text" error={e[`rows.${i}.altText`]}>
                  <Input
                    id={aid}
                    name="altText"
                    value={row.altText}
                    maxLength={250}
                    aria-invalid={Boolean(e[`rows.${i}.altText`])}
                    aria-describedby={describedBy(aid, e[`rows.${i}.altText`])}
                    onChange={(ev) =>
                      setRows((rs) =>
                        rs.map((r, j) =>
                          j === i ? { ...r, altText: ev.target.value } : r
                        )
                      )
                    }
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <input
                    id={tid}
                    type="radio"
                    name="thumbnail"
                    value={row.mediaId}
                    checked={thumbnailId === row.mediaId}
                    onChange={() => setThumbnailId(row.mediaId)}
                  />
                  <label htmlFor={tid} className="text-sm">
                    Vorschaubild
                  </label>
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
                  <RemoveImageButton
                    action={removeAction}
                    productId={productId}
                    mediaId={Number(row.mediaId)}
                    label={label}
                  />
                </div>
              </fieldset>
            );
          })}
          {e.media ? (
            <p role="alert" className="text-sm text-destructive">
              {e.media}
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
          <Button
            type="submit"
            disabled={pending}
            className="justify-self-start"
          >
            Bilder speichern
          </Button>
        </form>
      )}
      <UploadForm productId={productId} action={uploadAction} />
    </section>
  );
}
