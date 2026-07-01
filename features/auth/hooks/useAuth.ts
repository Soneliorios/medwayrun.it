"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "../store/authStore";
import { ORG_ID } from "@/lib/utils";
import { IS_MOCK } from "@/lib/mockDb";
import { readMockSessionCookie, getMockUser, clearMockSession } from "@/lib/mockUsers";

export function useAuthListener() {
  const { setUser, setSession, setProfile, setMember, setLoading, reset } =
    useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    if (IS_MOCK) {
      const userId = readMockSessionCookie();
      const mockUser = userId ? getMockUser(userId) : null;
      if (mockUser) {
        setUser({ id: mockUser.id, email: mockUser.email, created_at: new Date().toISOString() } as any);
        setProfile({ id: mockUser.id, full_name: mockUser.full_name, avatar_url: mockUser.avatar_url, email: mockUser.email, role: mockUser.role } as any);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
      return;
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
    if (IS_MOCK) {
      clearMockSession();
      router.push("/login");
      router.refresh();
      return;
    }
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };
}
