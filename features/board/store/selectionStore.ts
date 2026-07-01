"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface SelectionState {
  selectedIds: Set<string>;

  toggleTask: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionState>()(
  subscribeWithSelector((set, get) => ({
    selectedIds: new Set<string>(),

    toggleTask: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedIds: next };
      }),

    selectAll: (ids) => set({ selectedIds: new Set(ids) }),

    clearSelection: () => set({ selectedIds: new Set() }),

    isSelected: (id) => get().selectedIds.has(id),
  }))
);
