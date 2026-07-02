"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

export async function signUpAction(
  fullName: string,
  email: string,
  password: string
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("user already registered")) {
      return "Este email já possui uma conta. Faça login.";
    }
    if (msg.includes("rate limit") || msg.includes("email rate limit")) {
      return "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.";
    }
    if (msg.includes("invalid email")) {
      return "Email inválido.";
    }
    if (msg.includes("password") && msg.includes("weak")) {
      return "Senha muito fraca. Use pelo menos 8 caracteres com letras e números.";
    }
    return error.message;
  }

  // Auto-add new user to the org members table (requires service role to bypass RLS)
  if (data.user?.id) {
    const admin = createAdminClient();
    await admin.from("members").insert({
      org_id: ORG_ID,
      user_id: data.user.id,
      role: "member",
    });
  }

  redirect("/login?registered=1");
}
