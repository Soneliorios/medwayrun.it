"use client";

import { useEffect, useState } from "react";

export interface OrgMemberLite {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Loads the org's members for pickers (assignees, approvers, followers, …).
 * Backed by /api/org/members (service role), so it returns everyone regardless
 * of profiles RLS and never shows demo/mock users.
 */
export function useOrgMembers(): OrgMemberLite[] {
  const [members, setMembers] = useState<OrgMemberLite[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/members");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setMembers(
            data.map((m: any) => ({
              id: m.id,
              full_name: m.full_name ?? m.id,
              avatar_url: m.avatar_url ?? null,
            }))
          );
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return members;
}
