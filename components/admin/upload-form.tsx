// components/admin/upload-form.tsx
"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import { IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "@/lib/admin/image-check";
import type { UploadValues } from "@/lib/admin/media-schema";
import { describedBy, Field } from "./field";

type UploadAction = (
  prev: FormState<UploadValues>,
  formData: FormData
) => Promise<FormState<UploadValues>>;

export function UploadForm({
  productId,
  action,
}: {
  productId: number;
  action: UploadAction;
}) {
  const run: UploadAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Bild hochgeladen.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState<UploadValues>({ productId: String(productId), altText: "" })
  );
  // Quick client-side check (D2); the server check is authoritative.
  const [sizeError, setSizeError] = useState<string | null>(null);
  const fileError = sizeError ?? state.fieldErrors.file;
  const altError = state.fieldErrors.altText;
  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-md border p-4"
      noValidate
    >
      <h3 className="font-medium">Bild hochladen</h3>
      <input type="hidden" name="productId" value={productId} />
      <Field
        id="upload-file"
        label="Bilddatei"
        error={fileError}
        hint="JPEG, PNG oder WebP, höchstens 5 MB."
      >
        <Input
          id="upload-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={Boolean(fileError)}
          aria-describedby={describedBy("upload-file", fileError, "hint")}
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            setSizeError(
              file && file.size > MAX_IMAGE_BYTES
                ? IMAGE_MESSAGES.tooLarge
                : null
            );
          }}
        />
      </Field>
      <Field id="upload-alt" label="Alt-Text" error={altError}>
        <Input
          id="upload-alt"
          name="altText"
          defaultValue={state.values.altText}
          key={state.status === "saved" ? "reset" : "keep"}
          maxLength={250}
          aria-invalid={Boolean(altError)}
          aria-describedby={describedBy("upload-alt", altError)}
        />
      </Field>
      {state.formError ? (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || sizeError !== null}
        className="justify-self-start"
      >
        Bild hochladen
      </Button>
    </form>
  );
}
