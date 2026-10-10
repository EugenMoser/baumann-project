import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "./database.types";

export type AdminClient = SupabaseClient<Database>;

// Admin only (spec D2): reads the session from cookies. Public pages keep
// using createServerSupabase() and never touch cookies.
export async function createSessionSupabase(): Promise<AdminClient> {
  const store = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list)
              store.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there;
            // proxy.ts refreshes the session instead.
          }
        },
      },
    }
  );
}
