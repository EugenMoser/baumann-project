import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { TierTimeoutError, type Tier, type TierAnswer } from "./chain.ts";
import type { CopyInput } from "./product-copy/input.ts";
import { SYSTEM_PROMPT, userMessage } from "./product-copy/prompt.ts";
import { copySchema } from "./product-copy/schema.ts";
import type { AiSettings } from "./settings.ts";

// Providers behind the chain tiers (D4, D9). No `@/` alias, no `server-only`:
// scripts/ai/try.mts imports this file under Node's type stripping.
// Keys stay inside the SDK clients; errors propagate without being logged.

const FREE_TIMEOUT_MS = 25_000;
const ANTHROPIC_TIMEOUT_MS = 30_000;
const ANTHROPIC_MAX_TOKENS = 2000;
// Fixed in code (D4): raising it is a code change, not an env value.
const ANTHROPIC_EFFORT = "low";
const FAKE_DELAY_MS = 1500;
const FAKE_TIMEOUT_MS = 30_000;

const orNull = (value: number | undefined): number | null => value ?? null;

function freeTier(apiKey: string, model: string): Tier {
  return {
    kind: "free",
    model,
    timeoutMs: FREE_TIMEOUT_MS,
    async call(input, signal) {
      const result = await generateText({
        model: createOpenRouter({ apiKey })(model),
        system: SYSTEM_PROMPT,
        prompt: userMessage(input),
        output: Output.object({ schema: copySchema }),
        maxRetries: 0,
        abortSignal: signal,
      });
      // `output` throws when the model gave no parsable object; the chain
      // counts that as an error for this tier.
      return {
        raw: result.output,
        model,
        inputTokens: orNull(result.usage.inputTokens),
        outputTokens: orNull(result.usage.outputTokens),
      };
    },
  };
}

function anthropicTier(apiKey: string, model: string): Tier {
  return {
    kind: "anthropic",
    model,
    timeoutMs: ANTHROPIC_TIMEOUT_MS,
    async call(input, signal) {
      const client = new Anthropic({
        apiKey,
        maxRetries: 1,
        timeout: ANTHROPIC_TIMEOUT_MS,
      });
      try {
        const response = await client.messages.parse(
          {
            model,
            max_tokens: ANTHROPIC_MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage(input) }],
            output_config: {
              effort: ANTHROPIC_EFFORT,
              format: zodOutputFormat(copySchema),
            },
          },
          { signal }
        );
        // Null after a refusal, a max_tokens stop or an unparsable answer.
        if (response.parsed_output === null)
          throw new Error("no parsed output");
        return {
          raw: response.parsed_output,
          model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError)
          throw new TierTimeoutError();
        throw error;
      }
    },
  };
}

// Shortens the model-visible product text for the fake draft and drops
// trailing punctuation, so sentences built around it end cleanly.
function clip(text: string, max: number): string {
  return text.slice(0, max).replace(/[\s.,:;!?–-]+$/, "");
}

function fakeTier(): Tier {
  return {
    kind: "fake",
    model: "fake",
    timeoutMs: FAKE_TIMEOUT_MS,
    async call(input: CopyInput, signal: AbortSignal): Promise<TierAnswer> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, FAKE_DELAY_MS);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      // No digits of its own: the draft passes D3 with an empty number set.
      const produkt = clip(input.produkt, 80);
      const untertitel = input.untertitel ? clip(input.untertitel, 100) : "";
      const subtitle = untertitel ? ` Untertitel: ${untertitel}.` : "";
      return {
        raw: {
          description: `Testvorschlag für ${produkt}.${subtitle} Der Text stammt vom Testmodell und enthält nur Angaben aus den Produktdaten.`,
          seoTitle: clip(`${produkt} Testvorschlag`, 55),
          seoDescription: `Testvorschlag für ${produkt}.`,
        },
        model: "fake",
        inputTokens: null,
        outputTokens: null,
      };
    },
  };
}

// Fake only when settings say so; otherwise up to two free tiers (D4), then
// Anthropic. A tier without its key or models is left out.
export function tiersFor(s: AiSettings): Tier[] {
  if (s.fake) return [fakeTier()];
  const tiers: Tier[] = [];
  if (s.openRouterKey) {
    for (const model of s.freeModels.slice(0, 2))
      tiers.push(freeTier(s.openRouterKey, model));
  }
  if (s.anthropicKey)
    tiers.push(anthropicTier(s.anthropicKey, s.fallbackModel));
  return tiers;
}
