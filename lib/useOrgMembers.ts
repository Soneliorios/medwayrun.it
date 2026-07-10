"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface OrgMemberLite {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

async function fetchMembers(): Promise<OrgMemberLite[]> {
  // Primário: endpoint com service role (retorna todos, ignora RLS de profiles).
  try {
    const res = await fetch("/api/org/members");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return data.map((m: any) => ({
          id: m.id,
          full_name: m.full_name ?? m.id,
          avatar_url: m.avatar_url ?? null,
          role: m.role ?? "member",
        }));
      }
    }
  } catch { /* cai no fallback */ }
  // Fallback: query direta (RLS pode limitar, mas é melhor que lista vazia).
  try {
    const sb = createClient();
    const { data } = await (sb as any)
      .from("members")
      .select("user_id, role, profiles!inner(id, full_name, avatar_url)")
      .eq("org_id", ORG_ID);
    return ((data ?? []) as any[]).map((m) => ({
      id: m.profiles.id,
      full_name: m.profiles.full_name ?? m.profiles.id,
      avatar_url: m.profiles.avatar_url ?? null,
      role: m.role ?? "member",
    }));
  } catch { return []; }
}

interface OrgMembersState {
  members: OrgMemberLite[];
  status: "idle" | "loading" | "loaded";
  inflight: Promise<void> | null;
  load: (force?: boolean) => Promise<void>;
}

/**
 * Cache global (por sessão) do roster da org. Antes cada componente que precisava
 * da lista de usuários — inclusive CADA TaskCard do quadro — fazia seu próprio
 * fetch de `/api/org/members` (endpoint pesado: 3 queries + auth.listUsers),
 * sem cache e partindo de lista vazia. Resultado: a lista "aparecia devagar" em
 * todo lugar (pickers de aprovador/responsável, "Criado por", etc.).
 *
 * Agora o fetch é ÚNICO e compartilhado (com dedup de chamadas concorrentes):
 * o primeiro consumidor dispara, os demais recebem a lista já pronta na hora.
 */
export const useOrgMembersStore = create<OrgMembersState>((set, get) => ({
  members: [],
  status: "idle",
  inflight: null,
  load: async (force = false) => {
    const s = get();
    if (s.inflight) return s.inflight; // dedup: já tem um fetch em andamento
    if (!force && s.status === "loaded") return; // já em cache
    const p = (async () => {
      set({ status: "loading" });
      const members = await fetchMembers();
      set({ members, status: "loaded", inflight: null });
    })();
    set({ inflight: p });
    return p;
  },
}));

/** Esquenta o cache uma vez (usado no bootstrap do dashboard). */
export function preloadOrgMembers() { void useOrgMembersStore.getState().load(); }

/** Força uma nova busca (ex.: após aprovar/adicionar um membro). */
export function refreshOrgMembers() { void useOrgMembersStore.getState().load(true); }

/**
 * Lista de membros da org para pickers (responsáveis, aprovadores, seguidores…).
 * Reativo e instantâneo quando o cache já está quente.
 */
export function useOrgMembers(): OrgMemberLite[] {
  const members = useOrgMembersStore((s) => s.members);
  useEffect(() => { void useOrgMembersStore.getState().load(); }, []);
  return members;
}
