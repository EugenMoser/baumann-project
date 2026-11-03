import type { GenerateError } from "./generate.ts";

// Answer texts of the suggestion route, from the spec error table. No `@/`
// alias, no `server-only`: proxy.ts imports it too.
export const GENERATE_MESSAGES: Record<
  GenerateError | "unauthorized" | "forbidden" | "bad_request",
  string
> = {
  not_found: "Produkt nicht gefunden.",
  monthly_cap: "Das monatliche Kontingent für KI-Vorschläge ist aufgebraucht.",
  hourly_limit: "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen.",
  not_set_up: "Der KI-Assistent ist nicht eingerichtet.",
  draft_needs_fallback: "Für Entwürfe ist kein Modell eingerichtet.",
  failed:
    "Es konnte kein brauchbarer Vorschlag erstellt werden. Bitte später erneut versuchen.",
  // Not in the spec table: a database failure on load, reserve or audit.
  db_error:
    "Der Vorschlag konnte nicht erstellt werden. Bitte später erneut versuchen.",
  unauthorized: "Bitte neu anmelden.",
  // Same text as the other admin actions (lib/admin/errors.ts).
  forbidden: "Keine Berechtigung.",
  bad_request: "Ungültige Anfrage.",
};
