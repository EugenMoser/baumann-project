export type AdminError =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "conflict"; field: string }
  | { kind: "invalid"; message: string }
  | { kind: "db_error"; code: string | null };

export const GENERIC_SAVE_ERROR = "Speichern fehlgeschlagen.";
export const FORBIDDEN_ERROR = "Keine Berechtigung.";
export const NOT_FOUND_ERROR =
  "Der Datensatz wurde nicht gefunden. Bitte die Seite neu laden.";
const TYPE_MISMATCH = "Ein Wert passt nicht zum Attributtyp.";

// Messages raised (SQLSTATE 22023) by our own SQL functions.
export const DUPLICATE_COLOR = "Jede Farbe darf nur einmal zugeordnet sein.";
export const DUPLICATE_SUFFIX = "Jedes Suffix darf nur einmal vorkommen.";
export const NEEDS_ONE_DEFAULT = "Genau eine Farbe muss Standard sein.";
export const INVALID_COLOR_LIST = "Ungültige Farbliste.";
export const INVALID_ARTICLE_DATA = "Ungültige Artikeldaten.";
export const ARTICLE_NUMBER_FIXED =
  "Die Artikelnummer kann nicht geändert werden.";
export const INVALID_MEDIA_LIST = "Ungültige Bildliste.";
export const STALE_MEDIA_LIST =
  "Die Bildliste ist veraltet. Bitte die Seite neu laden.";
export const NEEDS_ONE_THUMBNAIL = "Genau ein Bild muss Vorschaubild sein.";
export const ALT_TEXT_REQUIRED = "Jedes Bild braucht einen Alt-Text.";
export const INVALID_ACCESSORY_LIST = "Ungültige Zubehörliste.";
export const OWN_ARTICLE_ACCESSORY =
  "Artikel des eigenen Produkts sind kein Zubehör.";
export const DUPLICATE_ACCESSORY =
  "Jeder Artikel darf nur einmal Zubehör sein.";
export const INVALID_CATEGORY_DATA = "Ungültige Kategoriedaten.";
export const DELETE_PUBLISHED =
  "Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.";
const KNOWN_DB_MESSAGES: readonly string[] = [
  DUPLICATE_COLOR,
  DUPLICATE_SUFFIX,
  NEEDS_ONE_DEFAULT,
  INVALID_COLOR_LIST,
  INVALID_ARTICLE_DATA,
  ARTICLE_NUMBER_FIXED,
  INVALID_MEDIA_LIST,
  STALE_MEDIA_LIST,
  NEEDS_ONE_THUMBNAIL,
  ALT_TEXT_REQUIRED,
  INVALID_ACCESSORY_LIST,
  OWN_ARTICLE_ACCESSORY,
  DUPLICATE_ACCESSORY,
  INVALID_CATEGORY_DATA,
  DELETE_PUBLISHED,
];

// 23503 on a product save: a chosen category or material was deleted meanwhile.
export const STALE_SELECTION =
  "Eine Auswahl gibt es nicht mehr. Bitte die Seite neu laden.";

// 23503 on deleting master data that is still referenced (D7, D8).
export const CATEGORY_IN_USE = "Die Kategorie enthält noch Produkte.";
export const COLOR_IN_USE = "Die Farbe ist noch Produkten zugeordnet.";
export const MATERIAL_IN_USE = "Das Material wird noch verwendet.";
// Storage upload failed (D2); details go to the log only.
export const UPLOAD_FAILED = "Das Bild konnte nicht hochgeladen werden.";

export const CONFLICT_MESSAGES: Record<string, string> = {
  slug: "Dieser Slug ist in der Kategorie schon vergeben.",
  articleNumber: "Diese Artikelnummer gibt es schon.",
};

type PgError = {
  code?: string | null;
  message?: string;
  details?: string | null;
};

export function fromPg(
  error: PgError,
  conflicts: Record<string, string> = {},
  fkMessage?: string
): AdminError {
  const code = error.code ?? null;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (code === "23505") {
    const constraint = Object.keys(conflicts).find((name) =>
      text.includes(name)
    );
    if (constraint)
      return { kind: "conflict", field: conflicts[constraint] ?? constraint };
  }
  if (code === "42501") return { kind: "forbidden" };
  if (code === "P0002") return { kind: "not_found" };
  // Postgres itself raises 22023 with English text; only pass on our own.
  if (
    code === "22023" &&
    error.message !== undefined &&
    KNOWN_DB_MESSAGES.includes(error.message)
  )
    return { kind: "invalid", message: error.message };
  if (code === "23503")
    return { kind: "invalid", message: fkMessage ?? TYPE_MISMATCH };
  if (code === "23514") return { kind: "invalid", message: TYPE_MISMATCH };
  return { kind: "db_error", code };
}

export function formErrorFor(error: AdminError): string | null {
  switch (error.kind) {
    case "forbidden":
      return FORBIDDEN_ERROR;
    case "not_found":
      return NOT_FOUND_ERROR;
    case "invalid":
      return error.message;
    case "db_error":
      return GENERIC_SAVE_ERROR;
    case "conflict":
      return null;
  }
}
