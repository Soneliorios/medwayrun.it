"use client";

import { useEffect, useState } from "react";
import { createRawClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useRole } from "@/features/auth/hooks/useRole";

export interface BoardAccess {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
}

const FULL: BoardAccess = { canView: true, canCreate: true, canEdit: true };
const NONE: BoardAccess = { canView: false, canCreate: false, canEdit: false };

export function computeBoardAccess(o: {
  isPrivate: boolean;
  allView: boolean;
  allCreate: boolean;
  allEdit: boolean;
  myRole: "admin" | "member" | "viewer" | null;
  isOrgAdmin: boolean;
}): BoardAccess {
  // Public boards + org admins/owners always have full access.
  if (!o.isPrivate || o.isOrgAdmin) return FULL;
  const canEdit = o.allEdit || o.myRole === "admin";
  const canCreate = canEdit || o.allCreate || o.myRole === "member";
  const canView = canCreate || o.allView || o.myRole === "viewer";
  return { canView, canCreate, canEdit };
}

interface ProjectAccessRow {
  id: string;
  is_private: boolean;
  access_all_view: boolean;
  access_all_create: boolean;
  access_all_edit: boolean;
}

/** Access map for every board the current user could touch. */
export function useBoardAccessMap(): { map: Record<string, BoardAccess>; loading: boolean } {
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const { isAdmin } = useRole(); // owner/admin
  const [map, setMap] = useState<Record<string, BoardAccess>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = createRawClient();
      const [{ data: projects }, { data: myMemberships }] = await Promise.all([
        (sb as any).from("projects").select("id, is_private, access_all_view, access_all_create, access_all_edit"),
        userId
          ? (sb as any).from("project_members").select("project_id, role").eq("user_id", userId)
          : Promise.resolve({ data: [] }),
      ]);
      const roleByProject = new Map<string, "admin" | "member" | "viewer">(
        ((myMemberships ?? []) as any[]).map((m) => [m.project_id, m.role])
      );
      const next: Record<string, BoardAccess> = {};
      ((projects ?? []) as ProjectAccessRow[]).forEach((p) => {
        next[p.id] = computeBoardAccess({
          isPrivate: p.is_private ?? false,
          allView: p.access_all_view ?? false,
          allCreate: p.access_all_create ?? false,
          allEdit: p.access_all_edit ?? false,
          myRole: roleByProject.get(p.id) ?? null,
          isOrgAdmin: isAdmin,
        });
      });
      if (!cancelled) { setMap(next); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, isAdmin]);

  return { map, loading };
}

/** Access for a single board. */
export function useBoardAccess(boardId: string): { access: BoardAccess; loading: boolean } {
  const userId = useAuthStore((s) => s.profile?.id ?? null);
  const { isAdmin } = useRole();
  const [access, setAccess] = useState<BoardAccess>(FULL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = createRawClient();
      const { data: proj } = await (sb as any)
        .from("projects")
        .select("is_private, access_all_view, access_all_create, access_all_edit")
        .eq("id", boardId)
        .maybeSingle();
      if (!proj) { if (!cancelled) { setAccess(NONE); setLoading(false); } return; }
      let myRole: "admin" | "member" | "viewer" | null = null;
      if (userId && proj.is_private) {
        const { data: pm } = await (sb as any)
          .from("project_members")
          .select("role")
          .eq("project_id", boardId)
          .eq("user_id", userId)
          .maybeSingle();
        myRole = pm?.role ?? null;
      }
      const a = computeBoardAccess({
        isPrivate: proj.is_private ?? false,
        allView: proj.access_all_view ?? false,
        allCreate: proj.access_all_create ?? false,
        allEdit: proj.access_all_edit ?? false,
        myRole,
        isOrgAdmin: isAdmin,
      });
      if (!cancelled) { setAccess(a); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [boardId, userId, isAdmin]);

  return { access, loading };
}
