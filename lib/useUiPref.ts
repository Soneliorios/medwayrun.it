"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { uiPrefsService } from "@/lib/uiPrefsService";

/**
 * A per-user UI preference persisted in the DB (user_ui_prefs), with the same
 * ergonomics as useState. Loads on mount / key change; saves on change.
 *
 * Correctness notes:
 * - On key change the value is reset to the default first, so one board's
 *   config never bleeds into another during the async load (or when the new
 *   key has no stored row).
 * - A user edit (set) always persists — even during the initial load — and a
 *   `dirty` guard stops the in-flight load from clobbering that edit.
 */
export function useUiPref<T>(
  key: string | null,
  defaultValue: T
): [T, (v: T | ((prev: T) => T)) => void] {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [value, setValue] = useState<T>(defaultValue);
  const valueRef = useRef<T>(value);
  valueRef.current = value;
  // Keep the latest default without making it an effect dependency (call sites
  // pass fresh literals each render, which would otherwise loop the effect).
  const defaultRef = useRef<T>(defaultValue);
  defaultRef.current = defaultValue;
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = false;
    // Start every key from its default — never inherit the previous key's value.
    setValue(defaultRef.current);
    valueRef.current = defaultRef.current;
    if (!userId || !key) return;
    let cancelled = false;
    uiPrefsService.get<T>(userId, key).then((v) => {
      if (cancelled || dirtyRef.current) return; // a user edit already won
      setValue(v != null ? v : defaultRef.current);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key]);

  const set = (v: T | ((prev: T) => T)) => {
    const next = typeof v === "function" ? (v as (prev: T) => T)(valueRef.current) : v;
    valueRef.current = next;
    dirtyRef.current = true; // user edits win over any in-flight load
    setValue(next);
    if (userId && key) uiPrefsService.set(userId, key, next);
  };

  return [value, set];
}
