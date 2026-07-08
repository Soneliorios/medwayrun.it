import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

async function getCallerInfo() {
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
  return { userId: user.id, role: member?.role ?? null };
}

// PATCH /api/admin/users/[id] — change role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await getCallerInfo();
  // Gerenciar membros/papéis e aprovar contas é exclusivo do superadmin (owner),
  // coerente com a matriz de permissões e a UI (aba Usuários é superadmin-only).
  if (!caller || caller.role !== "owner") {
    return NextResponse.json({ error: "Only owner can manage members" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json() as { role?: string; approved?: boolean };

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updates: Record<string, unknown> = {};

  // Aprovar / reprovar conta (aprovação de novos cadastros).
  if (typeof body.approved === "boolean") {
    // Não deixar o owner reprovar a si mesmo (evita se trancar para fora).
    if (body.approved === false && id === caller.userId) {
      return NextResponse.json({ error: "Cannot unapprove yourself" }, { status: 400 });
    }
    updates.approved = body.approved;
  }

  // Alterar papel.
  if (body.role !== undefined) {
    if (!["member", "admin", "owner"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin
    .from("members")
    .update(updates)
    .eq("user_id", id)
    .eq("org_id", ORG_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id] — remove from org
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await getCallerInfo();
  if (!caller || caller.role !== "owner") {
    return NextResponse.json({ error: "Only owner can remove users" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent self-removal
  if (id === caller.userId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await admin
    .from("members")
    .delete()
    .eq("user_id", id)
    .eq("org_id", ORG_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
