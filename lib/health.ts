import type { CatalogClient } from "@/lib/supabase/server";

export type Health = { commit: string; db: "ok" | "error" };
export type DbProbe = (signal: AbortSignal) => Promise<boolean>;

const DEFAULT_TIMEOUT_MS = 3000;

// Never throws and never hangs: Docker health checks and the deploy smoke
// check depend on a fast answer.
export async function checkHealth(
  probe: DbProbe,
  commit: string | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Health> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });

  let dbOk = false;
  try {
    dbOk = await Promise.race([probe(controller.signal), timeout]);
  } catch {
    dbOk = false;
  } finally {
    clearTimeout(timer);
  }
  return { commit: commit ?? "unknown", db: dbOk ? "ok" : "error" };
}

export function supabaseProbe(client: CatalogClient): DbProbe {
  return async (signal) => {
    const { error } = await client
      .from("category")
      .select("id", { head: true, count: "exact" })
      .abortSignal(signal);
    return error === null;
  };
}
