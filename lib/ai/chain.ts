import { checkCopy, type CheckFailure } from "./product-copy/checks.ts";
import { inputNumbers, type CopyInput } from "./product-copy/input.ts";
import type { CopyDraft } from "./product-copy/schema.ts";

// Model chain (D4): free tiers in order, then Anthropic; the first answer that
// passes the D3 checks wins. No `@/` alias, no `server-only`: scripts/ai/try.mts
// imports this file under Node's type stripping.

export type TierAnswer = {
  raw: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type Tier = {
  kind: "free" | "anthropic" | "fake";
  model: string;
  timeoutMs: number;
  // Throws on HTTP error, timeout or empty answer.
  call(input: CopyInput, signal: AbortSignal): Promise<TierAnswer>;
};

export type ChainSuccess = {
  draft: CopyDraft;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ChainFailure = {
  attempts: { model: string; reason: "error" | "timeout" | CheckFailure }[];
};

// A tier throws this when its own SDK reports a timeout.
export class TierTimeoutError extends Error {}

// D4: at most the first two free models are tried.
const MAX_FREE_TIERS = 2;

type Attempt =
  { ok: true; answer: TierAnswer } | { ok: false; reason: "error" | "timeout" };

// The signal tells a cooperative tier to stop; the race covers a tier that
// ignores it. Provider errors are mapped to a reason and dropped: their texts
// may carry request details and never leave this function.
async function attempt(tier: Tier, input: CopyInput): Promise<Attempt> {
  const signal = AbortSignal.timeout(tier.timeoutMs);
  let onAbort: (() => void) | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    onAbort = () => resolve("timeout");
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const outcome = await Promise.race([
      tier.call(input, signal).then((answer) => ({ answer })),
      timedOut,
    ]);
    if (outcome === "timeout") return { ok: false, reason: "timeout" };
    if (outcome.answer.raw === null || outcome.answer.raw === undefined)
      return { ok: false, reason: "error" };
    return { ok: true, answer: outcome.answer };
  } catch (error) {
    const timeout = signal.aborted || error instanceof TierTimeoutError;
    return { ok: false, reason: timeout ? "timeout" : "error" };
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function runChain(
  input: CopyInput,
  published: boolean,
  tiers: Tier[]
): Promise<
  { ok: true; value: ChainSuccess } | { ok: false; error: ChainFailure }
> {
  // Free models may log prompts: only published products go there.
  const free = published
    ? tiers.filter((tier) => tier.kind === "free").slice(0, MAX_FREE_TIERS)
    : [];
  const rest = tiers.filter((tier) => tier.kind !== "free");
  const numbers = inputNumbers(input);
  const attempts: ChainFailure["attempts"] = [];

  for (const tier of [...free, ...rest]) {
    const result = await attempt(tier, input);
    if (!result.ok) {
      attempts.push({ model: tier.model, reason: result.reason });
      continue;
    }
    const checked = checkCopy(result.answer.raw, numbers);
    if (!checked.ok) {
      attempts.push({ model: tier.model, reason: checked.failure });
      continue;
    }
    return {
      ok: true,
      value: {
        draft: checked.value,
        model: result.answer.model,
        inputTokens: result.answer.inputTokens,
        outputTokens: result.answer.outputTokens,
      },
    };
  }
  return { ok: false, error: { attempts } };
}
