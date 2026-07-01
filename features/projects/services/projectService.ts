import { createClient, createRawClient } from "@/services/supabase/client";
import { ORG_ID } from "@/lib/utils";
import { IS_MOCK, mockProjects } from "@/lib/mockDb";
import type { Project } from "@/types";

export const projectService = {
  async list(): Promise<Project[]> {
    if (IS_MOCK) return mockProjects.list() as unknown as Project[];

    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("org_id", ORG_ID)
      .eq("is_archived", false)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as Project[];
  },

  async get(id: string): Promise<Project> {
    if (IS_MOCK) {
      const all = mockProjects.list() as unknown as Project[];
      const p = all.find((p) => p.id === id);
      if (!p) throw new Error("Project not found");
      return p;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Project;
  },

  async create(input: {
    name: string;
    description?: string;
    color?: string;
  }): Promise<Project> {
    if (IS_MOCK) return mockProjects.create(input) as unknown as Project;

    const supabase = createRawClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...input, org_id: ORG_ID })
      .select()
      .single();

    if (error) throw error;
    return data as Project;
  },

  async update(
    id: string,
    updates: { name?: string; description?: string | null; color?: string }
  ): Promise<void> {
    if (IS_MOCK) { mockProjects.update(id, updates as any); return; }

    const supabase = createRawClient();
    const { error } = await supabase.from("projects").update(updates).eq("id", id);
    if (error) throw error;
  },

  async archive(id: string): Promise<void> {
    if (IS_MOCK) { mockProjects.archive(id); return; }

    const supabase = createRawClient();
    const { error } = await supabase
      .from("projects")
      .update({ is_archived: true })
      .eq("id", id);
    if (error) throw error;
  },

  async toggleFavorite(id: string, current: boolean): Promise<void> {
    if (IS_MOCK) { mockProjects.toggleFavorite(id); return; }

    const supabase = createRawClient();
    const { error } = await supabase
      .from("projects")
      .update({ is_favorite: !current })
      .eq("id", id);
    if (error) throw error;
  },
};
