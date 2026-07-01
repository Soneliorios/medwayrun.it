"use client";

import { create } from "zustand";
import { boardProjectDb, type MockBoardProject } from "@/lib/mockDb";

interface BoardProjectState {
  projects: MockBoardProject[];
  boardId: string | null;
  load: (boardId: string) => void;
  create: (boardId: string, name: string, color: string, description?: string) => MockBoardProject;
  update: (id: string, updates: Partial<Pick<MockBoardProject, "name" | "color" | "description">>) => void;
  delete: (id: string) => void;
}

export const useBoardProjectStore = create<BoardProjectState>((set, get) => ({
  projects: [],
  boardId: null,

  load(boardId) {
    set({ boardId, projects: boardProjectDb.listByBoard(boardId) });
  },

  create(boardId, name, color, description) {
    const project = boardProjectDb.create({ board_id: boardId, name, color, description });
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  update(id, updates) {
    const { boardId, projects } = get();
    if (!boardId) return;
    boardProjectDb.update(boardId, id, updates);
    set({ projects: projects.map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  },

  delete(id) {
    const { boardId, projects } = get();
    if (!boardId) return;
    boardProjectDb.delete(boardId, id);
    set({ projects: projects.filter((p) => p.id !== id) });
  },
}));
