"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Project } from "@/types";

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;

  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  toggleFavorite: (id: string) => void;
  selectProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set) => ({
    projects: [],
    selectedProjectId: null,

    setProjects: (projects) => set({ projects }),

    addProject: (project) =>
      set((s) => ({ projects: [project, ...s.projects] })),

    updateProject: (id, updates) =>
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      })),

    removeProject: (id) =>
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

    toggleFavorite: (id) =>
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, is_favorite: !p.is_favorite } : p
        ),
      })),

    selectProject: (id) => set({ selectedProjectId: id }),
  }))
);
