"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
import type { AdminError } from "@/lib/admin/errors";
import { errorState, type FormState } from "@/lib/admin/form";
import {
  checkImage,
  IMAGE_MESSAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/admin/image-check";
import {
  attachMedia,
  listProductMedia,
  removeMediaRow,
  setProductMedia,
} from "@/lib/admin/media";
import { removeFiles, storeImage, type FileLog } from "@/lib/admin/media-flow";
import {
  parseMedia,
  parseUploadMeta,
  readMediaForm,
  readUpload,
  withAltOrigins,
  type MediaValues,
  type UploadValues,
} from "@/lib/admin/media-schema";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";

const log: FileLog = (context, detail) => console.error(context, detail);
const bucket = (client: AdminClient) => client.storage.from("catalog");
const invalid = <V>(values: V): FormState<V> => ({
  status: "error",
  values,
  fieldErrors: {},
  formError: "Ungültige Anfrage.",
});

async function runWrite<T, V>(
  values: V,
  context: string,
  write: (client: AdminClient) => Promise<Result<T, AdminError>>
): Promise<{ state: FormState<V> } | { value: T }> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    write(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok)
    return { state: errorState(values, outcome.result.error) };
  return { value: outcome.result.value };
}

export async function uploadImageAction(
  _prev: FormState<UploadValues>,
  formData: FormData
): Promise<FormState<UploadValues>> {
  const { values, file } = readUpload(formData);
  const meta = parseUploadMeta(values);
  const fieldErrors = meta.ok ? {} : { ...meta.fieldErrors };
  if (file === null) fieldErrors.file = IMAGE_MESSAGES.missing;
  else if (file.size > MAX_IMAGE_BYTES)
    fieldErrors.file = IMAGE_MESSAGES.tooLarge;
  if (fieldErrors.form) return invalid(values);
  if (!meta.ok || file === null || Object.keys(fieldErrors).length > 0)
    return { status: "error", values, fieldErrors, formError: null };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = checkImage(bytes);
  if (!image.ok)
    return {
      status: "error",
      values,
      fieldErrors: { file: image.error },
      formError: null,
    };
  const done = await runWrite(values, "[admin] upload image", (client) =>
    storeImage(
      {
        storage: bucket(client),
        attach: (input) => attachMedia(client, input),
        uuid: () => crypto.randomUUID(),
        log,
      },
      {
        productId: meta.value.productId,
        image: image.value,
        bytes,
        altText: meta.value.altText,
      }
    )
  );
  if ("state" in done) return done.state;
  return {
    status: "saved",
    values: { productId: values.productId, altText: "" },
    fieldErrors: {},
    formError: null,
  };
}

export async function saveMediaAction(
  _prev: FormState<MediaValues>,
  formData: FormData
): Promise<FormState<MediaValues>> {
  const values = readMediaForm(formData);
  const parsed = parseMedia(values);
  if (!parsed.ok) {
    if (parsed.fieldErrors.form) return invalid(values);
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  }
  const { productId, rows } = parsed.value;
  const done = await runWrite(values, "[admin] save images", async (client) => {
    const current = await listProductMedia(client, productId);
    if (!current.ok) return current;
    return setProductMedia(
      client,
      productId,
      withAltOrigins(current.value, rows)
    );
  });
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

const idFrom = (formData: FormData, name: string): number | null => {
  const raw = formData.get(name);
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
};

export async function removeImageAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const productId = idFrom(formData, "productId");
  const mediaId = idFrom(formData, "mediaId");
  if (productId === null || mediaId === null) return invalid(null);
  const done = await runWrite(null, "[admin] remove image", async (client) => {
    const removed = await removeMediaRow(client, productId, mediaId);
    if (removed.ok) await removeFiles(bucket(client), [removed.value], log);
    return removed;
  });
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}
