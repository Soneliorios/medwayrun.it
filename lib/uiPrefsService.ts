import { createRawClient } from "@/lib/supabase/client";

/**
 * Per-user UI preferences (recent views, banner toggles, board list/dashboard
 * config) backed by the `user_ui_prefs` key-value table. Replaces localStorage.
 */
export const uiPrefsService = {
  async get<T>(userId: string, key: string): Promise<T | null> {
    if (!userId) return null;
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("user_ui_prefs")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error("[uiPrefsService.get]", key, error);
      return null;
    }
    return (data?.value as T) ?? null;
  },

  async set(userId: string, key: string, value: unknown): Promise<void> {
    if (!userId) return;
    const sb = createRawClient();
    const { error } = await (sb as any)
      .from("user_ui_prefs")
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
    if (error) console.error("[uiPrefsService.set]", key, error);
  },
};
