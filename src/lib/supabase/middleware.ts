import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth gate intentionally disabled — Mark doesn't have DNS access for
// @HDSecurity.Systems yet, so magic-link emails aren't reaching him.
// We're building the inventory features against an anonymous session
// for now. To re-enable: restore the user check + /signin redirect
// below (see git history for the original version).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session cookie if one happens to exist (won't blow up
  // if it doesn't). We don't redirect anywhere.
  await supabase.auth.getUser();

  return supabaseResponse;
}
