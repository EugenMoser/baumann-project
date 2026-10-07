import { serverEnv } from "@/lib/env/server";
import { checkHealth, supabaseProbe } from "@/lib/health";
import { createServerSupabase } from "@/lib/supabase/server";

// Evaluated per request: reports the running commit and live DB status.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const health = await checkHealth(
    supabaseProbe(createServerSupabase()),
    serverEnv.SOURCE_COMMIT
  );
  return Response.json(health, { headers: { "Cache-Control": "no-store" } });
}
