import type { ContentOrigin } from "./types";

export function aiLabelText(origin: ContentOrigin): string | null {
  switch (origin) {
    case "ai":
      return "KI-generiert";
    case "ai_edited":
      return "KI-unterstützt, redaktionell bearbeitet";
    case "human":
      return null;
  }
}
