import { writeFile } from "node:fs/promises";
import type { Finding } from "./findings.mts";
import type { CatalogStats } from "./map/index.mts";

export type ReportInput = {
  generatedAt: Date;
  mode: "dry-run" | "import";
  outcome: string;
  stats: CatalogStats | null;
  findings: readonly Finding[];
  result: Readonly<Record<string, unknown>> | null;
};

const SECTIONS: readonly { kind: Finding["kind"]; title: string }[] = [
  { kind: "unknown_field", title: "Unknown snapshot fields" },
  { kind: "failed_image", title: "Failed image downloads" },
  { kind: "unparsed_attribute", title: "Unparsed attribute values" },
  { kind: "partial_attribute", title: "Partially parsed attribute values" },
  { kind: "material_fallback", title: "Material fallbacks" },
  { kind: "default_color_by_rule", title: "Default colour set by rule" },
  { kind: "merged_color", title: "Merged colours" },
  { kind: "shared_article", title: "Shared articles" },
  { kind: "slug_collision", title: "Slug collisions" },
  { kind: "skipped_image", title: "Skipped images" },
  { kind: "packaging_note", title: "Packaging notes" },
  { kind: "alt_text_review", title: "Alt texts to review" },
];

function line(f: Finding): string {
  switch (f.kind) {
    case "unknown_field":
      return `- ${f.file}.json: \`${f.field}\` (${f.count} records)`;
    case "failed_image":
      return `- \`${f.storagePath}\` ← ${f.url}: ${f.reason}`;
    case "unparsed_attribute":
      return `- ${f.articleNumber}: \`${f.text}\``;
    case "partial_attribute":
      return `- ${f.articleNumber}: \`${f.text}\` → note \`${f.remainder}\``;
    case "material_fallback":
      return `- product ${f.legacyProductId}: \`${f.text}\``;
    case "default_color_by_rule":
      return `- product ${f.legacyProductId}: suffix \`${f.suffix}\``;
    case "merged_color":
      return `- \`${f.name}\` ${f.hex}: ${f.legacyColorIds.join(", ")}`;
    case "shared_article":
      return `- ${f.articleNumber}: home product ${f.homeLegacyProductId}, accessory of ${f.accessoryLegacyProductIds.join(", ")}`;
    case "slug_collision":
      return `- product ${f.legacyProductId}: \`${f.slug}\` (${f.level === "subtitle" ? "name + subtitle" : "name + legacy id"})`;
    case "skipped_image":
      return `- product ${f.legacyProductId}: \`${f.reference}\``;
    case "packaging_note":
      return `- ${f.articleNumber}: \`${f.text}\``;
    case "alt_text_review":
      return `- \`${f.storagePath}\``;
  }
}

export function renderReport(input: ReportInput): string {
  const out: string[] = [
    "# Import report",
    "",
    `- Generated: ${input.generatedAt.toISOString()}`,
    `- Mode: ${input.mode === "dry-run" ? "dry run" : "import"}`,
    `- Outcome: ${input.outcome}`,
  ];
  if (input.stats !== null) {
    const s = input.stats;
    out.push(
      "",
      "## Summary",
      "",
      "| Item | Count |",
      "| --- | --- |",
      `| Products | ${s.products} |`,
      `| Articles | ${s.articles} |`,
      `| Accessory links | ${s.accessories} |`,
      `| Colours | ${s.colors} |`,
      `| Materials | ${s.materials} |`,
      `| Attributes | ${s.attributes} |`,
      `| Images | ${s.images} |`,
      `| Typed description fragments | ${s.typedFragments} of ${s.fragments} |`
    );
  }
  if (input.result !== null) {
    out.push("", "## Database result", "", "| Key | Value |", "| --- | --- |");
    for (const [key, value] of Object.entries(input.result))
      out.push(`| ${key} | ${String(value)} |`);
  }
  for (const section of SECTIONS) {
    const entries = input.findings.filter((f) => f.kind === section.kind);
    if (entries.length === 0) continue;
    out.push(
      "",
      `## ${section.title}`,
      "",
      `${entries.length} entries.`,
      "",
      ...entries.map(line)
    );
  }
  return `${out.join("\n")}\n`;
}

export async function writeReport(
  path: string,
  input: ReportInput
): Promise<void> {
  await writeFile(path, renderReport(input), "utf8");
}
