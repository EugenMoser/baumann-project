import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export type CatalogClient = SupabaseClient<Database>;

// Public reads run as `anon` with the publishable key, so RLS decides what is
// visible. Sessions (admin) come with @supabase/ssr in feature 6.
export function createServerSupabase(): CatalogClient {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
