"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "../store/authStore";
import { ORG_ID } from "@/lib/utils";

export function useAuthListener() {
  const { setUser, setSession, setProfile, setMember, setLoading, reset } =
    useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id, true); // carga inicial: pode segurar isLoading
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT" || !session?.user) {
        reset();
        setLoading(false);
        return;
      }
      // Refresh de token (dispara ao FOCAR a aba), SIGNED_IN, USER_UPDATED etc.:
      // atualiza perfil/member em segundo plano SEM alternar isLoading. Alternar
      // isLoading aqui faria o ApprovalGate (`if (isLoading) return null`) desmontar
      // e remontar TODA a árvore do dashboard ao voltar para a aba, fechando modais
      // abertos (ex.: criação de tarefa) e perdendo o que já foi digitado.
      fetchUserData(session.user.id, false);
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchUserData(userId: string, gate: boolean) {
    if (gate) setLoading(true);
    const [{ data: profile }, { data: member }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("members")
        .select("*")
        .eq("user_id", userId)
        .eq("org_id", ORG_ID)
        .single(),
    ]);
    setProfile(profile ?? null);
    setMember(member ?? null);
    if (gate) setLoading(false);
  }
}

export function useSignOut() {
  const router = useRouter();
  const supabase = createClient();

  return async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };
}
