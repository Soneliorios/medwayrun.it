"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createRawClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";

export interface BoardFilters {
  subtasks?: "all" | "hide" | "only";
  title?: string;
  taskId?: string;
  clients?: string[];
  projects?: string[];
  teams?: string[];
  assignees?: string[];
  createdBy?: string[];
  followers?: string[];
  tags?: string[];
  types?: string[];
  stages?: string[];
  priorities?: string[];
  statuses?: string[];
  areaRequesting?: string[];
  areaRequested?: string[];
  dueFrom?: string;
  dueTo?: string;
  isUrgent?: boolean;
  isOverdue?: boolean;
  isRunning?: boolean;
  hasOpenParts?: boolean;
  boardProjectIds?: string[];
}

export interface SavedFilterItem {
  id: string;
  name: string;
  filters: BoardFilters;
}

interface FilterState {
  filters: BoardFilters;
  sidebarVisible: boolean;
  savedFilters: SavedFilterItem[];
  activeSavedId: string | null;

  setFilter: <K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) => void;
  removeFilter: (key: keyof BoardFilters) => void;
  clearFilters: () => void;
  toggleSidebar: () => void;
  setSidebarVisible: (v: boolean) => void;
  applyFilters: (filters: BoardFilters) => void;

  // Saved filters — per user, available on every board (Supabase-backed)
  loadSavedFilters: () => void;
  saveCurrentFilter: (name: string) => void;
  deleteSavedFilter: (id: string) => void;
  applySavedFilter: (id: string) => void;
}

/** Human-readable label for a filter key (used in active chips). */
export const FILTER_KEY_LABELS: Record<keyof BoardFilters, string> = {
  subtasks: "Subtarefas",
  title: "Título",
  taskId: "ID",
  clients: "Cliente",
  projects: "Projeto",
  teams: "Equipe",
  assignees: "Alocados",
  createdBy: "Criada por",
  followers: "Seguidores",
  tags: "Tags",
  types: "Tipo",
  stages: "Etapa",
  priorities: "Prioridade",
  statuses: "Situação",
  areaRequesting: "Área Solicitante",
  areaRequested: "Área Solicitada",
  dueFrom: "Entrega de",
  dueTo: "Entrega até",
  isUrgent: "Urgentes",
  isOverdue: "Atrasadas",
  isRunning: "Em execução",
  hasOpenParts: "Minhas partes abertas",
  boardProjectIds: "Projeto",
};

function isEmptyValue(v: unknown): boolean {
  return (
    v === undefined ||
    v === "" ||
    v === false ||
    (Array.isArray(v) && v.length === 0)
  );
}

export const useFilterStore = create<FilterState>()(
  subscribeWithSelector((set, get) => ({
    filters: {},
    sidebarVisible: false,
    savedFilters: [],
    activeSavedId: null,

    setFilter: (key, value) =>
      set((s) => ({
        activeSavedId: null,
        // Only `undefined` / `false` remove the key. Empty string and empty
        // array are valid "enabled but not yet filled" states — stripping them
        // here would make the row's enable toggle appear to do nothing.
        filters: value === undefined || value === false
          ? (({ [key]: _omit, ...rest }) => rest)(s.filters)
          : { ...s.filters, [key]: value },
      })),

    removeFilter: (key) =>
      set((s) => ({
        activeSavedId: null,
        filters: (({ [key]: _omit, ...rest }) => rest)(s.filters),
      })),

    clearFilters: () => set({ filters: {}, activeSavedId: null }),

    toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),

    setSidebarVisible: (v) => set({ sidebarVisible: v }),

    applyFilters: (filters) => set({ filters, activeSavedId: null }),

    loadSavedFilters: async () => {
      const userId = useAuthStore.getState().profile?.id;
      if (!userId) { set({ savedFilters: [] }); return; }
      const sb = createRawClient();
      // Column is named filters_json in the existing schema.
      const { data, error } = await (sb as any)
        .from("saved_filters")
        .select("id, name, filters_json")
        .eq("user_id", userId)
        .order("created_at");
      if (error) { console.error("[filters] load error:", error); return; }
      set({
        savedFilters: ((data ?? []) as any[]).map((r) => ({
          id: r.id, name: r.name, filters: (r.filters_json ?? {}) as BoardFilters,
        })),
      });
    },

    saveCurrentFilter: async (name) => {
      const userId = useAuthStore.getState().profile?.id;
      if (!userId) return;
      const filters = { ...get().filters };
      const sb = createRawClient();
      const { data, error } = await (sb as any)
        .from("saved_filters")
        .insert({ user_id: userId, name, filters_json: filters })
        .select("id, name, filters_json")
        .single();
      if (error) { console.error("[filters] save error:", error); return; }
      set((s) => ({
        savedFilters: [...s.savedFilters, { id: data.id, name: data.name, filters: (data.filters_json ?? {}) as BoardFilters }],
        activeSavedId: data.id,
      }));
    },

    deleteSavedFilter: async (id) => {
      set((s) => ({
        savedFilters: s.savedFilters.filter((f) => f.id !== id),
        activeSavedId: s.activeSavedId === id ? null : s.activeSavedId,
      }));
      const sb = createRawClient();
      const { error } = await (sb as any).from("saved_filters").delete().eq("id", id);
      if (error) console.error("[filters] delete error:", error);
    },

    applySavedFilter: (id) => {
      const item = get().savedFilters.find((f) => f.id === id);
      if (item) set({ filters: { ...item.filters }, activeSavedId: id });
    },
  }))
);

export function useActiveFilterCount() {
  return useFilterStore((s) => {
    const f = s.filters;
    return Object.keys(f).filter((k) => {
      const v = f[k as keyof BoardFilters];
      if (k === "subtasks" && v === "all") return false;
      return !isEmptyValue(v);
    }).length;
  });
}
