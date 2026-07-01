import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

async function getCallerRole() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", ORG_ID)
    .single();
  return member?.role ?? null;
}

export async function GET() {
  const callerRole = await getCallerRole();
  if (!callerRole || !["owner", "admin"].includes(callerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: membersData }, { data: { users } }] = await Promise.all([
    admin.from("members").select("user_id, role, joined_at").eq("org_id", ORG_ID),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const memberMap = new Map((membersData ?? []).map((m) => [m.user_id, m]));

  const result = users
    .filter((u) => memberMap.has(u.id))
    .map((u) => {
      const m = memberMap.get(u.id)!;
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: (u.user_metadata?.full_name as string | undefined)
          ?? u.email?.split("@")[0]
          ?? "Sem nome",
        role: m.role as string,
        joined_at: m.joined_at as string,
      };
    })
    .sort((a, b) => {
      const order = { owner: 0, admin: 1, member: 2, viewer: 3 };
      return (order[a.role as keyof typeof order] ?? 9) - (order[b.role as keyof typeof order] ?? 9);
    });

  return NextResponse.json(result);
}
