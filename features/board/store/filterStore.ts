"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

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
  board_id: string | null;
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

  // Saved filters (persisted via Supabase by the caller through these actions)
  loadSavedFilters: (boardId: string) => void;
  saveCurrentFilter: (name: string, boardId: string) => void;
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

function savedFiltersKey(boardId: string) {
  return `mwr_saved_filters_${boardId}`;
}

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
        filters: isEmptyValue(value)
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

    loadSavedFilters: (boardId) => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem(savedFiltersKey(boardId));
        set({ savedFilters: raw ? JSON.parse(raw) : [] });
      } catch {
        set({ savedFilters: [] });
      }
    },

    saveCurrentFilter: (name, boardId) => {
      const item: SavedFilterItem = {
        id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        board_id: boardId,
        name,
        filters: { ...get().filters },
      };
      set((s) => {
        const next = [...s.savedFilters, item];
        if (typeof window !== "undefined") {
          localStorage.setItem(savedFiltersKey(boardId), JSON.stringify(next));
        }
        return { savedFilters: next, activeSavedId: item.id };
      });
    },

    deleteSavedFilter: (id) => {
      set((s) => {
        const target = s.savedFilters.find((f) => f.id === id);
        const next = s.savedFilters.filter((f) => f.id !== id);
        if (typeof window !== "undefined" && target?.board_id) {
          localStorage.setItem(savedFiltersKey(target.board_id), JSON.stringify(next));
        }
        return {
          savedFilters: next,
          activeSavedId: s.activeSavedId === id ? null : s.activeSavedId,
        };
      });
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
