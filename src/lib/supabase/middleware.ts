import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin";

const PUBLIC_PATH_PREFIXES = ["/signin", "/auth", "/forgot-password"];
const PENDING_PATH = "/pending-approval";

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

  // Do not put logic between createServerClient and getUser — a session
  // refresh failure here is hard to trace if other code runs first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = PUBLIC_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  );
  const isPendingPath = path.startsWith(PENDING_PATH);

  if (!user) {
    if (isAuthPath) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  // Admin (Mark) is always allowed through. This is also a recovery
  // path: if his approval row went missing, he can still reach the
  // /admin tools to fix it.
  if (isAdminEmail(user.email)) {
    if (isPendingPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Everyone else needs a non-null approved_at on their user_approvals
  // row. The trigger inserts a pending row at signup; the admin flips
  // approved_at to a timestamp in /admin/approvals.
  const { data: approval } = await supabase
    .from("user_approvals")
    .select("approved_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const isApproved = approval?.approved_at != null;

  if (!isApproved) {
    if (isPendingPath || isAuthPath) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = PENDING_PATH;
    return NextResponse.redirect(url);
  }

  if (isPendingPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
