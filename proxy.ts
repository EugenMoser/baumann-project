import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, loginPathFor } from "@/lib/admin/auth";
import { publicEnv } from "@/lib/env/public";

// Optimistic check only (spec D2): refreshes the session cookie and sends
// visitors without a session to the login page. checkAdmin() in the admin
// layout and every action decides; RLS is the boundary.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
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
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && path !== LOGIN_PATH) {
    const target = new URL(
      loginPathFor(path + request.nextUrl.search),
      request.url
    );
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
