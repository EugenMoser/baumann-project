import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import { runChain, type Tier } from "./chain.ts";
import { finishRequest, reserveRequest } from "./limits.ts";
import { buildCopyInput, loadCopySource } from "./product-copy/input.ts";
import { PROMPT_VERSION } from "./product-copy/prompt.ts";
import type { CopyDraft } from "./product-copy/schema.ts";
import { availability, type AiSettings } from "./settings.ts";

// One suggestion request (D1, D4, D6, D7): reserve, run the chain, write the
// audit rows. Never writes to `product`; the editor's save does that (D6).
// No `@/` alias, no `server-only`: the lib/ai rule for Node's type stripping.

export type Suggestion = {
  field: "description" | "seo_title" | "seo_description";
  generationId: number;
  text: string;
};

export type GenerateError =
  | "not_found"
  | "monthly_cap"
  | "hourly_limit"
  | "not_set_up"
  | "draft_needs_fallback"
  | "failed"
  | "db_error";

const FIELDS: { field: Suggestion["field"]; key: keyof CopyDraft }[] = [
  { field: "description", key: "description" },
  { field: "seo_title", key: "seoTitle" },
  { field: "seo_description", key: "seoDescription" },
];

export async function generateCopy(
  deps: {
    client: SupabaseClient<Database>;
    settings: AiSettings;
    tiers: Tier[];
  },
  productId: number
): Promise<
  | { ok: true; value: { model: string; suggestions: Suggestion[] } }
  | { ok: false; error: GenerateError }
> {
  const { client, settings, tiers } = deps;
  const mode = availability(settings);
  if (mode === "none") return { ok: false, error: "not_set_up" };

  const source = await loadCopySource(client, productId);
  if (!source.ok) return source;
  // D4: drafts and archived products never go to a free model.
  const published = source.value.status === "published";
  if (!published && mode === "free_only")
    return { ok: false, error: "draft_needs_fallback" };

  const reserved = await reserveRequest(client, productId, settings);
  if (!reserved.ok) return reserved;
  const requestId = reserved.value;

  const chain = await runChain(buildCopyInput(source.value), published, tiers);
  if (!chain.ok) {
    // Model ids and reasons only: no product text, output or provider text.
    console.error(
      "[ai] chain failed:",
      chain.error.attempts.map((a) => `${a.model}:${a.reason}`).join(", ")
    );
    await finishRequest(client, requestId, {
      status: "failed",
      model: null,
      inputTokens: null,
      outputTokens: null,
    });
    return { ok: false, error: "failed" };
  }

  const { draft, model, inputTokens, outputTokens } = chain.value;
  const { data, error } = await client
    .from("ai_generation")
    .insert(
      FIELDS.map(({ field, key }) => ({
        entity: "product",
        entity_id: productId,
        field,
        model,
        prompt_version: PROMPT_VERSION,
        output: draft[key],
        request_id: requestId,
      }))
    )
    .select("id, field");
  // Mapped by field: the insert does not promise the order of its rows.
  const suggestions: Suggestion[] = FIELDS.flatMap(({ field, key }) => {
    const row = (data ?? []).find((r) => r.field === field);
    return row ? [{ field, generationId: row.id, text: draft[key] }] : [];
  });
  if (error || suggestions.length !== FIELDS.length) {
    console.error("[ai] save suggestions failed:", error?.code ?? "no rows");
    // The provider call happened: keep model and tokens on the failed request.
    await finishRequest(client, requestId, {
      status: "failed",
      model,
      inputTokens,
      outputTokens,
    });
    return { ok: false, error: "db_error" };
  }

  await finishRequest(client, requestId, {
    status: "succeeded",
    model,
    inputTokens,
    outputTokens,
  });
  return { ok: true, value: { model, suggestions } };
}
