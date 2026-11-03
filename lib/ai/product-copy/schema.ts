import { z } from "zod";

// Shape of a model answer (D3). Length and content rules live in checks.ts.
// No `@/` alias, no `server-only`: scripts/ai/try.mts imports this file under
// Node's type stripping.
export const copySchema = z.object({
  description: z.string().trim().min(1),
  seoTitle: z.string().trim().min(1),
  seoDescription: z.string().trim().min(1),
});

export type CopyDraft = z.infer<typeof copySchema>;
