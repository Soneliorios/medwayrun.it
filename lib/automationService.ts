import { createClient, createRawClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";

export interface AutomationTrigger {
  event: string;
  config: Record<string, unknown>;
}
export interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

/** trigger_config jsonb: { logic, triggers: [...] } — supports AND/OR of many. */
export interface AutomationTriggerConfig {
  logic?: "AND" | "OR";
  triggers?: AutomationTrigger[];
  [k: string]: unknown;
}
/** action_config jsonb: { actions: [...] } — sequential list. */
export interface AutomationActionConfig {
  actions?: AutomationAction[];
  [k: string]: unknown;
}

export interface AutomationRow {
  id: string;
  board_id: string;
  name: string;
  trigger_event: string;
  trigger_config: AutomationTriggerConfig;
  action_type: string;
  action_config: AutomationActionConfig;
  is_active: boolean;
  execution_count: number;
}

const COLS =
  "id, board_id, name, trigger_event, trigger_config, action_type, action_config, is_active, execution_count";

export const automationService = {
  async list(): Promise<AutomationRow[]> {
    const sb = createClient();
    const { data, error } = await (sb as any)
      .from("automations")
      .select(COLS)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[automationService.list]", error);
      return [];
    }
    return (data ?? []) as AutomationRow[];
  },

  async create(input: {
    board_id: string;
    name: string;
    logic: "AND" | "OR";
    triggers: AutomationTrigger[];
    actions: AutomationAction[];
  }): Promise<AutomationRow | null> {
    const sb = createRawClient();
    const created_by = useAuthStore.getState().user?.id ?? null;
    // The table stores a single trigger_event/action_type column, so we keep a
    // human-readable summary there and the full multi-trigger / sequential-action
    // structure in the jsonb configs (ready for the future execution engine).
    const row = {
      board_id: input.board_id,
      name: input.name,
      trigger_event: input.triggers.length === 1 ? input.triggers[0].event : "multi",
      trigger_config: { logic: input.logic, triggers: input.triggers } as AutomationTriggerConfig,
      action_type: input.actions.length === 1 ? input.actions[0].type : "multi",
      action_config: { actions: input.actions } as AutomationActionConfig,
      created_by,
    };
    const { data, error } = await (sb as any).from("automations").insert(row).select(COLS).single();
    if (error) {
      console.error("[automationService.create]", error);
      return null;
    }
    return data as AutomationRow;
  },

  async setActive(id: string, is_active: boolean): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("automations").update({ is_active }).eq("id", id);
    if (error) console.error("[automationService.setActive]", error);
  },

  async rename(id: string, name: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("automations").update({ name }).eq("id", id);
    if (error) console.error("[automationService.rename]", error);
  },

  async remove(id: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("automations").delete().eq("id", id);
    if (error) console.error("[automationService.remove]", error);
  },
};
