import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";
import type { ColorAssignment } from "./products";

// The function keeps the display order of the array (sort_order = position).
export async function setProductColors(
  client: AdminClient,
  productId: number,
  rows: ColorAssignment[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_colors", {
    p_product_id: productId,
    payload: rows.map((r) => ({
      color_id: r.colorId,
      suffix: r.suffix,
      is_default: r.isDefault,
    })),
  });
  if (error) return err(fromPg(error));
  return ok(null);
}
