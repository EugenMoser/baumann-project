import { Badge } from "@/components/ui/badge";
import { aiLabelText } from "@/lib/catalog/ai-label";
import type { ContentOrigin } from "@/lib/catalog/types";

/** Saved origin of a text, in the public wording; nothing for human text. */
export function OriginBadge({ origin }: { origin: ContentOrigin }) {
  const label = aiLabelText(origin);
  if (!label) return null;
  return <Badge variant="secondary">{label}</Badge>;
}
