import { createRawClient } from "@/lib/supabase/client";

export interface StageReq {
  id: string;
  field: string;
  label: string;
}

/**
 * Per-column stage requirements, backed by the `stage_requirements` table.
 * Replaces the old localStorage store. Requires the write policy in
 * supabase_stage_requirements_write.sql.
 */
export const stageReqService = {
  /** Returns a map of columnId → requirements for the given columns. */
  async listForColumns(columnIds: string[]): Promise<Record<string, StageReq[]>> {
    if (columnIds.length === 0) return {};
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("stage_requirements")
      .select("id, column_id, field_name, label")
      .in("column_id", columnIds);
    if (error) {
      console.error("[stageReqService.listForColumns]", error);
      return {};
    }
    const out: Record<string, StageReq[]> = {};
    ((data ?? []) as any[]).forEach((r) => {
      (out[r.column_id] ??= []).push({ id: r.id, field: r.field_name, label: r.label });
    });
    return out;
  },

  async add(columnId: string, field: string, label: string): Promise<StageReq | null> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("stage_requirements")
      .insert({ column_id: columnId, field_name: field, label })
      .select("id, field_name, label")
      .single();
    if (error) {
      console.error("[stageReqService.add]", error);
      return null;
    }
    return { id: data.id, field: data.field_name, label: data.label };
  },

  async remove(id: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("stage_requirements").delete().eq("id", id);
    if (error) console.error("[stageReqService.remove]", error);
  },
};
