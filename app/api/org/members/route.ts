import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

/**
 * Org member list for pickers (assignees, approvers, followers).
 * Accessible to ANY authenticated member of the org — unlike /api/admin/users
 * which is owner/admin only. Uses the service role so it isn't blocked by
 * profiles RLS (which typically only lets a user read their own profile).
 */
export async function GET() {
  const cookieStore = await cookies();
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Caller must belong to the org AND be approved (contas "em análise" não veem
  // o roster — essa rota usa service role e não passa pelo RLS).
  const { data: caller } = await admin
    .from("members")
    .select("user_id, approved")
    .eq("org_id", ORG_ID)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!caller || (caller as { approved?: boolean }).approved === false) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: membersData }, { data: profilesData }, { data: authData }] = await Promise.all([
    admin.from("members").select("user_id, role, joined_at").eq("org_id", ORG_ID),
    admin.from("profiles").select("id, full_name, avatar_url"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
  const authMap = new Map((authData?.users ?? []).map((u) => [u.id, u]));

  const result = (membersData ?? []).map((m) => {
    const p = profileMap.get(m.user_id);
    const au = authMap.get(m.user_id);
    const full_name =
      (p?.full_name as string | null) ||
      (au?.user_metadata?.full_name as string | undefined) ||
      au?.email?.split("@")[0] ||
      "Sem nome";
    return {
      id: m.user_id,
      full_name,
      avatar_url: (p?.avatar_url as string | null) ?? null,
      role: m.role as string,
    };
  });

  result.sort((a, b) => a.full_name.localeCompare(b.full_name));

  return NextResponse.json(result);
}
