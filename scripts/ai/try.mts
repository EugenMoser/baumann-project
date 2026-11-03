// Runs the AI model chain for one product, read-only, and prints each attempt.
// Usage: pnpm ai:try --product <id> [--model <id>] [--allow-remote]
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runChain, TierTimeoutError, type Tier } from "../../lib/ai/chain.ts";
import {
  buildCopyInput,
  inputNumbers,
  loadCopySource,
} from "../../lib/ai/product-copy/input.ts";
import { checkCopy } from "../../lib/ai/product-copy/checks.ts";
import { tiersFor } from "../../lib/ai/providers.ts";
import { parseAiSettings, type AiSettings } from "../../lib/ai/settings.ts";

// Same shape as the import CLI's, without the env (passed separately).
export type CliIo = {
  log: (line: string) => void;
  error: (line: string) => void;
};

export type TryDeps = {
  createClient?: (url: string, key: string) => SupabaseClient;
  tiersFor?: (settings: AiSettings) => Tier[];
};

const USAGE =
  "usage: pnpm ai:try --product <id> [--model <id>] [--allow-remote]";

// Only these hosts count as the local stack; anything else may be production.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function parseTryArgs(
  argv: string[]
):
  | { productId: number; model: string | null; allowRemote: boolean }
  | { error: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: {
        product: { type: "string" },
        model: { type: "string" },
        "allow-remote": { type: "boolean" },
      },
      strict: true,
    }));
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (values.product === undefined || !/^[1-9]\d*$/.test(values.product))
    return { error: "--product must be a positive integer" };
  if (values.model !== undefined && values.model.trim() === "")
    return { error: "--model must not be empty" };
  return {
    productId: Number(values.product),
    model: values.model?.trim() ?? null,
    allowRemote: values["allow-remote"] ?? false,
  };
}

// R2: `--model` leaves exactly one tier. A claude- id is the Anthropic tier,
// anything else one free OpenRouter model.
function restrictTo(settings: AiSettings, model: string): AiSettings {
  const base = { ...settings, fake: false };
  return model.startsWith("claude-")
    ? { ...base, fallbackModel: model, freeModels: [] }
    : { ...base, freeModels: [model], anthropicKey: null };
}

type Row = { model: string; ms: number; result: string };

// Records latency and outcome per call. The outcome repeats the chain's check
// because runChain reports only the failures of a run that did not succeed.
function timed(tier: Tier, rows: Row[], numbers: () => Set<string>): Tier {
  return {
    ...tier,
    async call(input, signal) {
      const start = performance.now();
      const done = (result: string) =>
        rows.push({
          model: tier.model,
          ms: Math.round(performance.now() - start),
          result,
        });
      try {
        const answer = await tier.call(input, signal);
        const checked = checkCopy(answer.raw, numbers());
        done(
          checked.ok
            ? "ok"
            : checked.field
              ? `${checked.failure} (${checked.field})`
              : checked.failure
        );
        return answer;
      } catch (error: unknown) {
        // Provider error texts are dropped on purpose.
        done(
          signal.aborted || error instanceof TierTimeoutError
            ? "timeout"
            : "error"
        );
        throw error;
      }
    },
  };
}

export async function runTry(
  io: CliIo,
  env: Record<string, string | undefined>,
  argv: string[],
  deps: TryDeps = {}
): Promise<number> {
  const args = parseTryArgs(argv);
  if ("error" in args) {
    io.error(args.error);
    io.error(USAGE);
    return 2;
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  let local: boolean;
  try {
    local = LOCAL_HOSTS.has(new URL(url ?? "").hostname);
  } catch {
    io.error("NEXT_PUBLIC_SUPABASE_URL is missing or not a URL.");
    return 1;
  }
  if (!local && !args.allowRemote) {
    io.error(
      "Refusing: the Supabase URL is not the local stack. Pass --allow-remote to read published products there (read-only)."
    );
    return 2;
  }
  const key = local
    ? env.SUPABASE_SERVICE_ROLE_KEY
    : env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    io.error(
      local
        ? "SUPABASE_SERVICE_ROLE_KEY is missing."
        : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing."
    );
    return 1;
  }

  let settings: AiSettings;
  try {
    settings = parseAiSettings(env);
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (args.model !== null) settings = restrictTo(settings, args.model);

  const client = (
    deps.createClient ??
    ((u, k) =>
      createClient(u, k, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SupabaseClient)
  )(url as string, key);
  const source = await loadCopySource(client, args.productId);
  if (!source.ok) {
    io.error(
      source.error === "not_found"
        ? `Product ${args.productId} not found (a remote read only sees published products).`
        : "The database read failed."
    );
    return 1;
  }
  const published = source.value.status === "published";
  if (args.model !== null && !args.model.startsWith("claude-") && !published) {
    io.error(
      "Free models are only used for published products; this one is not published."
    );
    return 1;
  }

  const tiers = (deps.tiersFor ?? tiersFor)(settings);
  if (tiers.length === 0) {
    io.error(
      "No model configured (check the OPENROUTER_API_KEY / AI_FREE_MODELS / ANTHROPIC_API_KEY variables)."
    );
    return 1;
  }

  const input = buildCopyInput(source.value);
  const numbers = inputNumbers(input);
  const rows: Row[] = [];
  const result = await runChain(
    input,
    published,
    tiers.map((tier) => timed(tier, rows, () => numbers))
  );

  io.log(
    `Product ${args.productId} (${source.value.status}): ${source.value.name}`
  );
  rows.forEach((row, i) =>
    io.log(`${i + 1}. ${row.model}  ${row.ms} ms  ${row.result}`)
  );
  if (!result.ok) {
    io.log("No attempt passed the checks.");
    return 1;
  }
  io.log(`Answered by: ${result.value.model}`);
  io.log(`Description:\n${result.value.draft.description}`);
  io.log(`SEO title:\n${result.value.draft.seoTitle}`);
  io.log(`SEO description:\n${result.value.draft.seoDescription}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runTry(
      {
        log: (line) => console.log(line),
        error: (line) => console.error(line),
      },
      process.env,
      process.argv.slice(2)
    );
    process.exit(code);
  } catch (error: unknown) {
    console.error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
