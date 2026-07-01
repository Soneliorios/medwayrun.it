"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInAction(
  email: string,
  password: string
): Promise<string | null> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message === "Invalid login credentials"
      ? "Email ou senha incorretos."
      : error.message;
  }

  redirect("/boards");
}
