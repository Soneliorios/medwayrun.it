"use client";

import { create } from "zustand";
import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

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
  load: (boardId: string) => Promise<void>;
  create: (boardId: string, name: string, color: string, description?: string) => Promise<BoardProject | null>;
  update: (id: string, updates: Partial<Pick<BoardProject, "name" | "color" | "description">>) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

function mapRow(r: any): BoardProject {
  return { id: r.id, board_id: r.project_id, name: r.name, color: r.color, description: r.description ?? undefined };
}

/**
 * Busca os sub-projetos de UM quadro sem tocar no store global. Use quando
 * precisar da lista de outro quadro (ex.: o modal de criar tarefa) sem
 * contaminar o `boardProjectStore` que a view do quadro atual consome — senão
 * os projetos "vazam" entre quadros.
 */
export async function fetchBoardSubprojects(boardId: string): Promise<BoardProject[]> {
  if (!boardId) return [];
  const sb = createClient();
  const { data, error } = await (sb as any)
    .from("board_subprojects")
    .select("id, project_id, name, color, description")
    .eq("project_id", boardId)
    .order("name");
  if (error) { console.error("[fetchBoardSubprojects]", error); return []; }
  return ((data ?? []) as any[]).map(mapRow);
}

/**
 * Board sub-projects, backed by the `board_subprojects` table. This is the
 * single source of truth shared by the board "Projetos" view, the board
 * settings, the task-create picker and the filters — so they always agree.
 */
export const useBoardProjectStore = create<BoardProjectState>((set, get) => ({
  projects: [],
  boardId: null,

  async load(boardId) {
    set({ boardId, projects: [] });
    const sb = createClient();
    const { data, error } = await (sb as any)
      .from("board_subprojects")
      .select("id, project_id, name, color, description")
      .eq("project_id", boardId)
      .order("name");
    if (error) { console.error("[boardProjectStore.load]", error); return; }
    if (get().boardId !== boardId) return; // a newer load won
    set({ projects: ((data ?? []) as any[]).map(mapRow) });
  },

  async create(boardId, name, color, description) {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("board_subprojects")
      .insert({ project_id: boardId, org_id: ORG_ID, name, color, description: description || null })
      .select("id, project_id, name, color, description")
      .single();
    if (error) { console.error("[boardProjectStore.create]", error); return null; }
    const project = mapRow(data);
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  async update(id, updates) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
    const sb = createRawClient();
    const { error } = await (sb as any).from("board_subprojects").update(updates).eq("id", id);
    if (error) console.error("[boardProjectStore.update]", error);
  },

  async delete(id) {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
    const sb = createRawClient();
    const { error } = await (sb as any).from("board_subprojects").delete().eq("id", id);
    if (error) console.error("[boardProjectStore.delete]", error);
  },
}));
