import { err, type Result } from "@/lib/result";
import type { AdminCheck } from "./auth";
import type { AdminError } from "./errors";

export type WriteDeps = {
  check: () => Promise<AdminCheck>;
  revalidate: () => void;
  // Receives a fixed context string and the PG code — never form values (FR-14).
  logError: (context: string, code: string | null) => void;
};

export type WriteOutcome<T> =
  { kind: "anonymous" } | { kind: "done"; result: Result<T, AdminError> };

// Every admin write goes through here: session check (D2), revalidation only
// after success (D11), logging of unexpected DB errors only (D12).
export async function adminWrite<T>(
  deps: WriteDeps,
  context: string,
  write: () => Promise<Result<T, AdminError>>
): Promise<WriteOutcome<T>> {
  const auth = await deps.check();
  if (auth.kind === "anonymous") return { kind: "anonymous" };
  if (auth.kind === "forbidden")
    return { kind: "done", result: err({ kind: "forbidden" }) };
  const result = await write();
  if (result.ok) deps.revalidate();
  else if (result.error.kind === "db_error")
    deps.logError(context, result.error.code);
  return { kind: "done", result };
}
