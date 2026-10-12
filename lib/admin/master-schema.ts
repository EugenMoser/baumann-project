import { z } from "zod";
import { optionalText, requiredText } from "./schemas";

export const COLOR_FIELDS = [
  "name",
  "ralReference",
  "hexCode",
  "family",
] as const;
export type ColorMasterValues = Record<(typeof COLOR_FIELDS)[number], string>;
export const emptyColorValues = (): ColorMasterValues => ({
  name: "",
  ralReference: "",
  hexCode: "#",
  family: "",
});

export const colorSchema = z.object({
  name: requiredText(60, "Bitte einen Namen eingeben."),
  ralReference: optionalText(60),
  hexCode: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Bitte einen Farbcode wie #A1B2C3 eingeben.")
    .transform((s) => s.toUpperCase()),
  family: requiredText(40, "Bitte eine Farbfamilie eingeben."),
});
export type ColorMasterInput = z.output<typeof colorSchema>;

export const MATERIAL_FIELDS = ["code", "name"] as const;
export type MaterialValues = Record<(typeof MATERIAL_FIELDS)[number], string>;
export const emptyMaterialValues = (): MaterialValues => ({
  code: "",
  name: "",
});

export const materialSchema = z.object({
  code: requiredText(20, "Bitte ein Kürzel eingeben."),
  name: requiredText(120, "Bitte einen Namen eingeben."),
});
export type MaterialInput = z.output<typeof materialSchema>;

export const COLOR_CONFLICTS: Record<string, string> = {
  name: "Diese Farbe gibt es schon.",
};

export const MATERIAL_CONFLICTS: Record<string, string> = {
  code: "Dieses Kürzel gibt es schon.",
};
