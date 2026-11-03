import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, loginPathFor } from "@/lib/admin/auth";
import { GENERATE_MESSAGES } from "@/lib/ai/messages";
import { publicEnv } from "@/lib/env/public";

const SUGGESTION_ROUTE = /^\/admin\/produkte\/\d+\/ki-vorschlag$/;

// Optimistic check only (spec D2): refreshes the session cookie and sends
// visitors without a session to the login page. checkAdmin() in the admin
// layout and every action decides; RLS is the boundary.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list)
            response.cookies.set(name, value, options);
          cacheHeaders = headers ?? {};
          for (const [key, value] of Object.entries(cacheHeaders))
            response.headers.set(key, value);
        },
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && path !== LOGIN_PATH) {
    // The editor's fetch needs JSON it can show, not the login page.
    const answer = SUGGESTION_ROUTE.test(path)
      ? NextResponse.json(
          { error: GENERATE_MESSAGES.unauthorized },
          { status: 401 }
        )
      : NextResponse.redirect(
          new URL(loginPathFor(path + request.nextUrl.search), request.url)
        );
    // Carry refreshed or cleared auth cookies (and their no-cache headers)
    // over to the answer, or the browser keeps a stale session cookie.
    for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);
    for (const [key, value] of Object.entries(cacheHeaders))
      answer.headers.set(key, value);
    return answer;
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
