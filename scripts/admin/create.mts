// Creates or updates an admin user (spec D4).
// Usage: read -s PW && printf '%s' "$PW" | pnpm admin:create --email <address>
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseRemoveEnv } from "../import/env.mts";

export type AdminCreateIo = {
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
  readPassword: () => Promise<string>;
};

const USAGE =
  "usage: printf '%s' \"$PW\" | pnpm admin:create --email <address>";
const MIN_PASSWORD = 12;

export async function runAdminCreate(
  argv: readonly string[],
  io: AdminCreateIo
): Promise<number> {
  let email: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      options: { email: { type: "string" } },
      strict: true,
    });
    email = values.email;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
  }
  if (email === undefined) {
    io.error(USAGE);
    return 2;
  }
  const parsedEmail = z.email().safeParse(email.trim());
  if (!parsedEmail.success) {
    io.error("--email must be a valid e-mail address");
    return 2;
  }
  const password = (await io.readPassword()).replace(/\r?\n$/, "");
  if (password.length < MIN_PASSWORD) {
    io.error(`password on stdin must have at least ${MIN_PASSWORD} characters`);
    return 2;
  }
  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }

  const supabase = createClient(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const target = parsedEmail.data.toLowerCase();

  // Few users exist (single admin role); page through all of them.
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      io.error(`listing users failed: ${error.message}`);
      return 1;
    }
    const existing = data.users.find((u) => u.email?.toLowerCase() === target);
    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          app_metadata: { ...existing.app_metadata, role: "admin" },
        }
      );
      if (updateError) {
        io.error(`updating the admin failed: ${updateError.message}`);
        return 1;
      }
      io.log(`admin updated: ${target}`);
      return 0;
    }
    if (data.users.length < 200) break;
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email: target,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (createError) {
    io.error(`creating the admin failed: ${createError.message}`);
    return 1;
  }
  io.log(`admin created: ${target}`);
  return 0;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const code = await runAdminCreate(process.argv.slice(2), {
      env: process.env,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
      readPassword: readStdin,
    });
    process.exit(code);
  } catch (error: unknown) {
    console.error(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
