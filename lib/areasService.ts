import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface Area {
  id: string;
  name: string;
}

export const areasService = {
  async list(): Promise<Area[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("areas")
      .select("id, name")
      .eq("org_id", ORG_ID)
      .order("name");
    if (error) { console.error("[areasService.list]", error); return []; }
    return (data ?? []) as Area[];
  },

  async create(name: string): Promise<Area | null> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("areas")
      .insert({ org_id: ORG_ID, name: name.trim() })
      .select("id, name")
      .single();
    if (error) { console.error("[areasService.create]", error); return null; }
    return data as Area;
  },

  async rename(id: string, name: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("areas").update({ name: name.trim() }).eq("id", id);
    if (error) { console.error("[areasService.rename]", error); return false; }
    return true;
  },

  async remove(id: string): Promise<boolean> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("areas").delete().eq("id", id);
    if (error) { console.error("[areasService.remove]", error); return false; }
    return true;
  },
};
