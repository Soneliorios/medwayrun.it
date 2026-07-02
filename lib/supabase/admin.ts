import { createClient } from "@supabase/supabase-js";

/** Server-only admin client — uses service role key to bypass RLS.
 *  Never import this in client components or expose to the browser. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}
