"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/services/supabase/client";
import { useAuthStore } from "../store/authStore";
import { ORG_ID } from "@/lib/utils";
import { IS_MOCK } from "@/lib/mockDb";

export function useAuthListener() {
  const { setUser, setSession, setProfile, setMember, setLoading, reset } =
    useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    // Inject mock user when running without Supabase
    if (IS_MOCK) {
      const mockUser = {
        id: "mock-user",
        email: "demo@medwayrun.it",
        created_at: new Date().toISOString(),
      } as any;
      const mockProfile = {
        id: "mock-user",
        full_name: "Você (demo)",
        avatar_url: null,
        email: "demo@medwayrun.it",
      } as any;
      setUser(mockUser);
      setProfile(mockProfile);
      setLoading(false);
      return; // skip the real Supabase auth
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        reset();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchUserData(userId: string) {
    setLoading(true);
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
    setLoading(false);
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
