import "server-only";
import { parseServerEnv, type ServerEnv } from "./schema";

export const serverEnv: ServerEnv = parseServerEnv({
  SOURCE_COMMIT: process.env.SOURCE_COMMIT,
});
