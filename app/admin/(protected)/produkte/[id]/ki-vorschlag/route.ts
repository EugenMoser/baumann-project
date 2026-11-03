import { checkAdmin } from "@/lib/admin/auth";
import { generateCopy, type GenerateError } from "@/lib/ai/generate";
import { GENERATE_MESSAGES } from "@/lib/ai/messages";
import { generationDeps } from "@/lib/ai/server";
import { publicEnv } from "@/lib/env/public";
import { createSessionSupabase } from "@/lib/supabase/session";

// AI suggestions for the product editor (D1). A Route Handler, not a Server
// Action, so a long generation does not hold back "Speichern". The origin and
// content-type checks stand in for the CSRF protection of Server Actions.

const STATUS: Record<GenerateError, number> = {
  not_found: 404,
  monthly_cap: 429,
  hourly_limit: 429,
  not_set_up: 409,
  draft_needs_fallback: 409,
  failed: 502,
  db_error: 500,
};

const LOOPBACK = ["localhost", "127.0.0.1"];

// Exactly the site origin. With a loopback site URL any loopback origin also
// passes: E2E serves on 127.0.0.1:<port> while CI builds for localhost:3000.
function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const site = new URL(publicEnv.NEXT_PUBLIC_SITE_URL);
  if (origin === site.origin) return true;
  if (!LOOPBACK.includes(site.hostname)) return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === "http:" &&
      LOOPBACK.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const fail = (key: keyof typeof GENERATE_MESSAGES, status: number) =>
  Response.json({ error: GENERATE_MESSAGES[key] }, { status });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  // Request checks first: a cross-site call never touches the session.
  if (!originAllowed(request.headers.get("origin")))
    return fail("bad_request", 403);
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    return fail("bad_request", 415);

  const client = await createSessionSupabase();
  const auth = await checkAdmin(client);
  if (auth.kind === "anonymous") return fail("unauthorized", 401);
  if (auth.kind === "forbidden") return fail("forbidden", 403);

  // The body ({}) carries nothing: generation uses the saved product (D2).
  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return fail("bad_request", 400);

  try {
    const result = await generateCopy(generationDeps(client), Number(id));
    if (result.ok) return Response.json(result.value);
    console.error("[ai] generate failed:", result.error);
    return fail(result.error, STATUS[result.error]);
  } catch {
    // Unexpected throw: the editor still gets JSON; nothing of it is logged.
    console.error("[ai] generate failed:", "unexpected");
    return fail("db_error", 500);
  }
}
