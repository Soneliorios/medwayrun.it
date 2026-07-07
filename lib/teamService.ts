import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface Team {
  id: string;
  name: string;
  leader_ids: string[];
  member_ids: string[];
  member_hours: Record<string, number>;
}

/**
 * Teams backed by the `teams` table (see supabase_teams.sql). Replaces the old
 * localStorage-only model so teams sync across devices/origins and users.
 */
export const teamService = {
  async list(): Promise<Team[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("teams")
      .select("id, name, leader_ids, member_ids, member_hours")
      .eq("org_id", ORG_ID)
      .order("name", { ascending: true });
    if (error) {
      console.error("[teamService.list]", error);
      return [];
    }
    return ((data ?? []) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      leader_ids: t.leader_ids ?? [],
      member_ids: t.member_ids ?? [],
      member_hours: t.member_hours ?? {},
    }));
  },

  async upsert(team: Team): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("teams").upsert({
      id: team.id,
      org_id: ORG_ID,
      name: team.name,
      leader_ids: team.leader_ids,
      member_ids: team.member_ids,
      member_hours: team.member_hours,
    });
    if (error) console.error("[teamService.upsert]", error);
  },

  /** Persist a whole set of teams (used by the admin CRUD which works on the array). */
  async upsertMany(teams: Team[]): Promise<void> {
    await Promise.all(teams.map((t) => this.upsert(t)));
  },

  async remove(id: string): Promise<void> {
    const sb = createRawClient();
    const { error } = await (sb as any).from("teams").delete().eq("id", id);
    if (error) console.error("[teamService.remove]", error);
  },

  /** Union of all team leaders — used to prioritize approvers. */
  async leaderIds(): Promise<Set<string>> {
    const teams = await this.list();
    return new Set(teams.flatMap((t) => t.leader_ids));
  },
};
