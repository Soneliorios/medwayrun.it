import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";
import type { CustomFieldType } from "@/lib/boardFields";

/**
 * Layout da task por quadro (ver supabase_board_task_layout.sql):
 *   • getBuiltinLayout/setBuiltinLayout → projects.task_layout { hidden, required }
 *   • listCustom/createCustom/updateCustom/removeCustom → board_custom_fields
 * Valores dos campos custom vivem em tasks.custom_fields (tratados no detalhe/criação).
 */
export interface BoardCustomField {
  id: string;
  project_id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  position: number;
}

export interface BuiltinLayout {
  /** keys de campos nativos escondidos neste quadro. */
  hidden: string[];
  /** keys de campos nativos obrigatórios na criação neste quadro. */
  required: string[];
}

function normalizeCustom(d: any): BoardCustomField {
  return {
    id: d.id,
    project_id: d.project_id,
    label: d.label ?? "",
    type: (d.type ?? "text") as CustomFieldType,
    options: Array.isArray(d.options) ? d.options : [],
    required: !!d.required,
    position: typeof d.position === "number" ? d.position : 0,
  };
}

const CUSTOM_COLS = "id, project_id, label, type, options, required, position";

export const boardFieldService = {
  async listCustom(projectId: string): Promise<BoardCustomField[]> {
    const sb = createClient();
    const { data, error } = await (sb as any)
      .from("board_custom_fields")
      .select(CUSTOM_COLS)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[boardFieldService.listCustom]", error);
      return [];
    }
    return (data ?? []).map(normalizeCustom);
  },

  async createCustom(
    projectId: string,
    input: { label: string; type: CustomFieldType; options?: string[]; required?: boolean; position?: number }
  ): Promise<BoardCustomField | null> {
    const sb = createRawClient();
    const { data, error } = await sb
      .from("board_custom_fields")
      .insert({
        org_id: ORG_ID,
        project_id: projectId,
        label: input.label,
        type: input.type,
        options: input.options ?? [],
        required: input.required ?? false,
        position: input.position ?? 0,
      })
      .select(CUSTOM_COLS)
      .single();
    if (error) {
      console.error("[boardFieldService.createCustom]", error);
      return null;
    }
    return normalizeCustom(data);
  },

  async updateCustom(
    id: string,
    patch: Partial<{ label: string; type: CustomFieldType; options: string[]; required: boolean; position: number }>
  ): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await sb.from("board_custom_fields").update(patch).eq("id", id);
    if (error) {
      console.error("[boardFieldService.updateCustom]", error);
      return false;
    }
    return true;
  },

  async removeCustom(id: string): Promise<boolean> {
    const sb = createRawClient();
    const { data, error } = await sb.from("board_custom_fields").delete().eq("id", id).select("id");
    if (error) {
      console.error("[boardFieldService.removeCustom]", error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  },

  async getBuiltinLayout(projectId: string): Promise<BuiltinLayout> {
    const sb = createClient();
    const { data, error } = await (sb as any)
      .from("projects")
      .select("task_layout")
      .eq("id", projectId)
      .maybeSingle();
    if (error) {
      console.error("[boardFieldService.getBuiltinLayout]", error);
      return { hidden: [], required: [] };
    }
    const cfg = (data?.task_layout ?? {}) as { hidden?: unknown; required?: unknown };
    return {
      hidden: Array.isArray(cfg.hidden) ? (cfg.hidden as string[]) : [],
      required: Array.isArray(cfg.required) ? (cfg.required as string[]) : [],
    };
  },

  async setBuiltinLayout(projectId: string, layout: BuiltinLayout): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await sb
      .from("projects")
      .update({ task_layout: { hidden: layout.hidden, required: layout.required } })
      .eq("id", projectId);
    if (error) {
      console.error("[boardFieldService.setBuiltinLayout]", error);
      return false;
    }
    return true;
  },
};
