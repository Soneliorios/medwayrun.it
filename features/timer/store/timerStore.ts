"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { timerService } from "../services/timerService";
import { formatElapsed } from "@/types";

interface TimerState {
  activeTaskId: string | null;
  startedAt: Date | null;
  elapsed: number; // seconds
  isRunning: boolean;

  // Actions
  setActive: (taskId: string, startedAt: Date) => void;
  clearActive: () => void;
  tick: () => void;
  startTimer: (userId: string, taskId: string) => Promise<void>;
  stopTimer: (userId: string) => Promise<void>;
  loadActiveTimer: (userId: string) => Promise<void>;

  // Derived
  getElapsedForTask: (taskId: string) => number;
  getFormattedElapsed: () => string;
}

export const useTimerStore = create<TimerState>()(
  subscribeWithSelector((set, get) => ({
    activeTaskId: null,
    startedAt: null,
    elapsed: 0,
    isRunning: false,

    setActive: (taskId, startedAt) => {
      const nowSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      set({
        activeTaskId: taskId,
        startedAt,
        elapsed: nowSeconds,
        isRunning: true,
      });
    },

    clearActive: () =>
      set({ activeTaskId: null, startedAt: null, elapsed: 0, isRunning: false }),

    tick: () =>
      set((s) => s.isRunning ? { elapsed: s.elapsed + 1 } : s),

    startTimer: async (userId, taskId) => {
      const { started_at } = await timerService.start(userId, taskId);
      get().setActive(taskId, new Date(started_at));
    },

    stopTimer: async (userId) => {
      const { activeTaskId } = get();
      const durationMinutes = await timerService.stop(userId);
      get().clearActive();
    },

    loadActiveTimer: async (userId) => {
      const active = await timerService.getActive(userId);
      if (active) {
        get().setActive(active.task_id, new Date(active.started_at));
      }
    },

    getElapsedForTask: (taskId) => {
      const s = get();
      return s.activeTaskId === taskId ? s.elapsed : 0;
    },

    getFormattedElapsed: () => formatElapsed(get().elapsed),
  }))
);
