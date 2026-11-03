"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { ProductStatus } from "@/lib/admin/labels";
import { GENERATE_MESSAGES } from "@/lib/ai/messages";
import type { AiAvailability } from "@/lib/ai/settings";
import { err, ok, type Result } from "@/lib/result";

const FIELDS = ["description", "seo_title", "seo_description"] as const;
export type SuggestionField = (typeof FIELDS)[number];

export type Suggestion = {
  field: SuggestionField;
  generationId: number;
  text: string;
  model: string;
};

// Answer of the suggestion route (app/admin/…/ki-vorschlag/route.ts).
const answerSchema = z.object({
  model: z.string(),
  suggestions: z
    .array(
      z.object({
        field: z.enum(FIELDS),
        generationId: z.number().int(),
        text: z.string(),
      })
    )
    .length(3),
});
const errorSchema = z.object({ error: z.string() });

const HINT =
  "Grundlage ist der zuletzt gespeicherte Stand. Vorschläge werden erst mit „Speichern“ übernommen.";
const PENDING = "Vorschlag wird erstellt …";
const READY = "Drei Vorschläge bereit.";

async function requestSuggestions(
  productId: number,
  signal: AbortSignal
): Promise<Result<Suggestion[], string>> {
  try {
    const response = await fetch(`/admin/produkte/${productId}/ki-vorschlag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
    });
    const body: unknown = await response.json();
    if (response.ok) {
      const answer = answerSchema.safeParse(body);
      if (answer.success)
        return ok(
          answer.data.suggestions.map((s) => ({
            ...s,
            model: answer.data.model,
          }))
        );
    } else {
      const failure = errorSchema.safeParse(body);
      if (failure.success) return err(failure.data.error);
    }
  } catch {
    // Network failure or a body that is not JSON: generic text below.
  }
  return err(GENERATE_MESSAGES.db_error);
}

type AiSuggestProps = {
  productId: number;
  availability: AiAvailability;
  /** Saved status of the product; free-only setups serve published ones. */
  status: ProductStatus;
  /** Lets the parent move focus back here after the last box is discarded. */
  buttonRef: RefObject<HTMLButtonElement | null>;
  /**
   * `focusLost` is true when focus had fallen back to the page (the button is
   * disabled while pending); the parent then moves it to the first box.
   */
  onResult: (suggestions: Suggestion[], focusLost: boolean) => void;
};

export function AiSuggest({
  productId,
  availability,
  status,
  buttonRef,
  onResult,
}: AiSuggestProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const hintId = useId();
  const reasonId = useId();

  const refocusButton = useRef(false);

  useEffect(() => () => controller.current?.abort(), []);

  // The button is enabled again only after the render that ends `pending`.
  useEffect(() => {
    if (!pending && refocusButton.current) {
      refocusButton.current = false;
      buttonRef.current?.focus();
    }
  }, [pending, buttonRef]);

  const unavailable =
    availability === "none"
      ? GENERATE_MESSAGES.not_set_up
      : availability === "free_only" && status !== "published"
        ? GENERATE_MESSAGES.draft_needs_fallback
        : null;

  async function run() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setFailed(false);
    setMessage(PENDING);
    const result = await requestSuggestions(productId, current.signal);
    if (current.signal.aborted) return;
    // Never steal focus from a field the admin moved on to.
    const active = document.activeElement;
    const focusLost =
      !active || active === document.body || active === buttonRef.current;
    setPending(false);
    if (result.ok) {
      setMessage(READY);
      onResult(result.value, focusLost);
    } else {
      setFailed(true);
      setMessage(result.error);
      refocusButton.current = focusLost;
    }
  }

  return (
    <div className="grid gap-1.5">
      <div>
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          disabled={pending || unavailable !== null}
          aria-describedby={unavailable ? `${hintId} ${reasonId}` : hintId}
          onClick={run}
        >
          <span
            aria-hidden="true"
            className="rounded bg-secondary px-1 text-xs font-semibold text-secondary-foreground"
          >
            KI
          </span>
          {pending ? PENDING : "Mit KI vorschlagen"}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {HINT}
      </p>
      {unavailable ? (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {unavailable}
        </p>
      ) : null}
      <p
        role="status"
        className={failed ? "text-sm text-destructive" : "sr-only"}
      >
        {message}
      </p>
    </div>
  );
}

type SuggestionBoxProps = {
  suggestion: Suggestion;
  /** Label of the field the suggestion is for; names the group. */
  fieldLabel: string;
  onAccept: (suggestion: Suggestion) => void;
  onDiscard: (suggestion: Suggestion) => void;
  /** Lets the parent focus this box's "Übernehmen" button. */
  acceptRef?: Ref<HTMLButtonElement>;
};

export function SuggestionBox({
  suggestion,
  fieldLabel,
  onAccept,
  onDiscard,
  acceptRef,
}: SuggestionBoxProps) {
  return (
    <div
      role="group"
      aria-label={`KI-Vorschlag: ${fieldLabel}`}
      className="grid gap-2 rounded-md border border-dashed bg-surface p-3"
    >
      <p className="text-sm font-medium">KI-Vorschlag</p>
      <p className="text-sm whitespace-pre-wrap">{suggestion.text}</p>
      <p className="text-xs text-muted-foreground">
        Modell: {suggestion.model}
      </p>
      <div className="flex gap-2">
        <Button
          ref={acceptRef}
          type="button"
          size="sm"
          onClick={() => onAccept(suggestion)}
        >
          Übernehmen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onDiscard(suggestion)}
        >
          Verwerfen
        </Button>
      </div>
    </div>
  );
}
