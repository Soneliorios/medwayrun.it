"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUpAction(
  fullName: string,
  email: string,
  password: string
): Promise<string | null> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
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

  redirect("/login?registered=1");
}
