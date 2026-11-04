import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import type { AiSettings } from "./settings.ts";

// Request log, monthly cap and hourly limit (D7). The database function
// serialises callers, so parallel clicks cannot pass a limit together.

export type LimitError = "monthly_cap" | "hourly_limit" | "db_error";

// SQLSTATEs raised by public.reserve_ai_request.
const limitError = (code: string): LimitError =>
  code === "AI001"
    ? "monthly_cap"
    : code === "AI002"
      ? "hourly_limit"
      : "db_error";

export async function reserveRequest(
  client: SupabaseClient<Database>,
  productId: number,
  s: Pick<AiSettings, "monthlyCap" | "hourlyLimit">
): Promise<{ ok: true; value: number } | { ok: false; error: LimitError }> {
  const { data, error } = await client.rpc("reserve_ai_request", {
    p_product_id: productId,
    p_monthly_cap: s.monthlyCap,
    p_hourly_limit: s.hourlyLimit,
  });
  if (error) {
    const kind = limitError(error.code);
    // Limits are expected; anything else logs its code only.
    if (kind === "db_error")
      console.error("[ai] reserve request failed:", error.code);
    return { ok: false, error: kind };
  }
  if (typeof data !== "number") return { ok: false, error: "db_error" };
  return { ok: true, value: data };
}

// Logs, never throws: the generation result matters more than its log row.
// Only the database code and message are logged, never keys or provider texts.
export async function finishRequest(
  client: SupabaseClient<Database>,
  id: number,
  outcome: {
    status: "succeeded" | "failed";
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }
): Promise<void> {
  try {
    const { error } = await client
      .from("ai_request")
      .update({
        status: outcome.status,
        model: outcome.model,
        input_tokens: outcome.inputTokens,
        output_tokens: outcome.outputTokens,
      })
      .eq("id", id);
    if (error)
      console.error("[ai] finish request failed:", error.code, error.message);
  } catch (e) {
    console.error(
      "[ai] finish request failed:",
      e instanceof Error ? e.name : "unknown"
    );
  }
}
