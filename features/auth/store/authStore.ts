"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile, Member } from "@/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  member: Member | null;
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setMember: (member: Member | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set) => ({
    user: null,
    session: null,
    profile: null,
    member: null,
    isLoading: true,

    setUser: (user) => set({ user }),
    setSession: (session) => set({ session }),
    setProfile: (profile) => set({ profile }),
    setMember: (member) => set({ member }),
    setLoading: (isLoading) => set({ isLoading }),
    reset: () =>
      set({ user: null, session: null, profile: null, member: null }),
  }))
);
