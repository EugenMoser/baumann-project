import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import {
  COLOR_IN_USE,
  fromPg,
  MATERIAL_IN_USE,
  type AdminError,
} from "./errors";
import type { ColorMasterInput, MaterialInput } from "./master-schema";

const countOf = (embed: unknown): number => {
  if (!Array.isArray(embed)) return 0;
  const row: unknown = embed[0];
  return typeof row === "object" &&
    row !== null &&
    "count" in row &&
    typeof row.count === "number"
    ? row.count
    : 0;
};

export type ColorListItem = {
  id: number;
  name: string;
  ralReference: string | null;
  hexCode: string;
  family: string;
  productCount: number;
};

export async function listColors(
  client: AdminClient
): Promise<Result<ColorListItem[], AdminError>> {
  const { data, error } = await client
    .from("color")
    .select("id, name, ral_reference, hex_code, family, product_color(count)")
    .order("family")
    .order("name");
  if (error) return err(fromPg(error));
  return ok(
    data.map((c) => ({
      id: c.id,
      name: c.name,
      ralReference: c.ral_reference,
      hexCode: c.hex_code,
      family: c.family,
      productCount: countOf(c.product_color),
    }))
  );
}

export async function saveColor(
  client: AdminClient,
  id: number | null,
  input: ColorMasterInput
): Promise<Result<null, AdminError>> {
  const row = {
    name: input.name,
    ral_reference: input.ralReference,
    hex_code: input.hexCode,
    family: input.family,
  };
  const { data, error } =
    id === null
      ? await client.from("color").insert(row).select("id")
      : await client.from("color").update(row).eq("id", id).select("id");
  if (error) return err(fromPg(error, { color_name_hex_idx: "name" }));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function deleteColor(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("color")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, COLOR_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export type MaterialListItem = {
  id: number;
  code: string;
  name: string;
  productCount: number;
  articleCount: number;
};

export async function listMaterials(
  client: AdminClient
): Promise<Result<MaterialListItem[], AdminError>> {
  const { data, error } = await client
    .from("material")
    .select("id, code, name, product(count), article(count)")
    .order("code");
  if (error) return err(fromPg(error));
  return ok(
    data.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      productCount: countOf(m.product),
      articleCount: countOf(m.article),
    }))
  );
}

export async function saveMaterial(
  client: AdminClient,
  id: number | null,
  input: MaterialInput
): Promise<Result<null, AdminError>> {
  const row = { code: input.code, name: input.name };
  const { data, error } =
    id === null
      ? await client.from("material").insert(row).select("id")
      : await client.from("material").update(row).eq("id", id).select("id");
  if (error) return err(fromPg(error, { material_code_key: "code" }));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function deleteMaterial(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("material")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, MATERIAL_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}
