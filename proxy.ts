import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, loginPathFor } from "@/lib/admin/auth";
import { GENERATE_MESSAGES } from "@/lib/ai/messages";
import { knownSlugs } from "@/lib/catalog/known-slugs";
import { CATALOG_NOT_FOUND_PATH } from "@/lib/catalog/not-found-path";
import { publicEnv } from "@/lib/env/public";

const SUGGESTION_ROUTE = /^\/admin\/produkte\/\d+\/ki-vorschlag$/;

export async function proxy(request: NextRequest) {
  const [first, ...slugs] = request.nextUrl.pathname.split("/").filter(Boolean);
  // Admin is the default branch: the matcher also matches encoded variants
  // such as /produkt%65/..., which must not reach the ISR pages unchecked.
  return first === "produkte"
    ? catalogProxy(request, slugs)
    : adminProxy(request);
}

// The catalog pages are ISR: every random slug would render a 404 and write a
// cache entry to disk. Unknown slugs go to one fixed not-found path instead.
// No session client here: public pages set no cookies (SC-1).
async function catalogProxy(request: NextRequest, slugs: string[]) {
  // Only /produkte/<category> and /produkte/<category>/<product> render ISR.
  if (slugs.length < 1 || slugs.length > 2) return NextResponse.next();
  const [category, product] = decodeAll(slugs) ?? [];
  const known =
    category !== undefined && (await knownSlugs.isKnown(category, product));
  return known
    ? NextResponse.next()
    : NextResponse.rewrite(new URL(CATALOG_NOT_FOUND_PATH, request.url));
}

// Null on malformed percent-encoding, which no real slug has.
function decodeAll(segments: string[]): string[] | null {
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

// Optimistic check only (spec D2): refreshes the session cookie and sends
// visitors without a session to the login page. checkAdmin() in the admin
// layout and every action decides; RLS is the boundary.
async function adminProxy(request: NextRequest) {
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

export const config = { matcher: ["/admin/:path*", "/produkte/:path*"] };
