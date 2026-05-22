import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for privileged admin operations (deleting users,
// etc). Reads SUPABASE_SERVICE_ROLE_KEY which must NEVER be exposed to
// the browser — the `import "server-only"` line at the top of this file
// makes Next.js refuse to bundle this module into client code.
//
// Anything that uses this client MUST verify the calling user is admin
// (via createClient() + auth.getUser() + isAdminEmail) before doing
// the privileged operation. The service-role key bypasses RLS.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — set it in .env.local " +
        "(local dev) and Vercel project env vars (production).",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
