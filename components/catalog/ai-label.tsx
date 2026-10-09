import { aiLabelText } from "@/lib/catalog/ai-label";
import type { ContentOrigin } from "@/lib/catalog/types";

export function AiLabel({ origin }: { origin: ContentOrigin }) {
  const text = aiLabelText(origin);
  if (!text) return null;
  return (
    <span className="inline-flex w-fit items-center rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">
      {text}
    </span>
  );
}
