import { z } from "zod";

export const LOGIN_FAILED = "E-Mail oder Passwort ist falsch.";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
