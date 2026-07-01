"use client";

import { create } from "zustand";

export interface BoardProject {
  id: string;
  board_id: string;
  name: string;
  color: string;
  description?: string;
}

interface BoardProjectState {
  projects: BoardProject[];
  boardId: string | null;
  load: (boardId: string) => void;
  create: (boardId: string, name: string, color: string, description?: string) => BoardProject;
  update: (id: string, updates: Partial<Pick<BoardProject, "name" | "color" | "description">>) => void;
  delete: (id: string) => void;
}

export const useBoardProjectStore = create<BoardProjectState>((set, get) => ({
  projects: [],
  boardId: null,

  load(boardId) {
    set({ boardId, projects: [] });
    // Supabase path: caller should fetch from supabase and call set({ projects })
  },

  create(boardId, name, color, description) {
    // Supabase path: caller is responsible for persisting; this is an optimistic stub
    const project: BoardProject = {
      id: crypto.randomUUID(),
      board_id: boardId,
      name,
      color,
      description,
    };
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  update(id, updates) {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    // Supabase path: caller is responsible for persisting the update
  },

  delete(id) {
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
    }));
    // Supabase path: caller is responsible for persisting the deletion
  },
}));
