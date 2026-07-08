"use client";

import { create } from "zustand";
import { useAuthStore } from "@/features/auth/store/authStore";
import { uiPrefsService } from "@/lib/uiPrefsService";

const KEY = "favorite_boards";

interface FavoriteState {
  ids: string[];
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

/**
 * Per-user favorite boards, persisted in user_ui_prefs. Favoriting is a
 * personal preference — it only affects the current user, and anyone can do it.
 */
export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  ids: [],
  loaded: false,
  load: async () => {
    const uid = useAuthStore.getState().user?.id;
    if (!uid) return;
    const ids = await uiPrefsService.get<string[]>(uid, KEY);
    set({ ids: ids ?? [], loaded: true });
  },
  toggle: (id) => {
    const uid = useAuthStore.getState().user?.id;
    const cur = get().ids;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ ids: next });
    if (uid) uiPrefsService.set(uid, KEY, next);
  },
  isFavorite: (id) => get().ids.includes(id),
}));
