import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiSettings } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Tier } from "./chain.ts";
import { tiersFor } from "./providers.ts";
import type { AiSettings } from "./settings.ts";

// The only lib/ai file that reads env: wires the validated settings and their
// tiers into generateCopy() for the Route Handler.
export function generationDeps(client: SupabaseClient<Database>): {
  client: SupabaseClient<Database>;
  settings: AiSettings;
  tiers: Tier[];
} {
  return { client, settings: aiSettings, tiers: tiersFor(aiSettings) };
}
