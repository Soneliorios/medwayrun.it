"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { IS_MOCK, mockSavedFilters } from "@/lib/mockDb";

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

  // Saved filters (persisted via mockDb / supabase by the caller through these actions)
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
      if (IS_MOCK) {
        const items: SavedFilterItem[] = mockSavedFilters.listByBoard(boardId).map((f) => ({
          id: f.id,
          board_id: f.board_id,
          name: f.name,
          filters: f.filters as BoardFilters,
        }));
        set({ savedFilters: items });
      }
    },

    saveCurrentFilter: (name, boardId) => {
      const { filters } = get();
      if (IS_MOCK) {
        const created = mockSavedFilters.create(boardId, name, filters as Record<string, unknown>);
        const item: SavedFilterItem = {
          id: created.id,
          board_id: created.board_id,
          name: created.name,
          filters: created.filters as BoardFilters,
        };
        set((s) => ({ savedFilters: [...s.savedFilters, item], activeSavedId: item.id }));
      }
    },

    deleteSavedFilter: (id) => {
      if (IS_MOCK) mockSavedFilters.delete(id);
      set((s) => ({
        savedFilters: s.savedFilters.filter((f) => f.id !== id),
        activeSavedId: s.activeSavedId === id ? null : s.activeSavedId,
      }));
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
