import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import type { Project } from "@/types";

export const projectService = {
  async list(): Promise<Project[]> {
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
    const supabase = createRawClient();
    const { error } = await supabase.from("projects").update(updates).eq("id", id);
    if (error) throw error;
  },

  async archive(id: string): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase
      .from("projects")
      .update({ is_archived: true })
      .eq("id", id);
    if (error) throw error;
  },

  async toggleFavorite(id: string, current: boolean): Promise<void> {
    const supabase = createRawClient();
    const { error } = await supabase
      .from("projects")
      .update({ is_favorite: !current })
      .eq("id", id);
    if (error) throw error;
  },
};
