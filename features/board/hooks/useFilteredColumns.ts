"use client";

import { useMemo } from "react";
import { useBoardStore } from "../store/boardStore";
import { useFilterStore } from "../store/filterStore";
import { useTimerStore } from "@/features/timer/store/timerStore";
import { applyBoardFilters, extractFilterOptions } from "@/lib/filterUtils";
import type { ColumnWithTasks } from "@/types";

/**
 * Returns the board columns with the active filters applied to each column's
 * task list, plus the available filter options derived from the (unfiltered)
 * data. Used by every board view so filtering stays consistent.
 */
export function useFilteredColumns(): {
  columns: ColumnWithTasks[];
  rawColumns: ColumnWithTasks[];
  options: ReturnType<typeof extractFilterOptions>;
} {
  const rawColumns = useBoardStore((s) => s.columns);
  const filters = useFilterStore((s) => s.filters);
  const activeTimerTaskId = useTimerStore((s) => s.activeTaskId);

  const columns = useMemo(
    () => applyBoardFilters(rawColumns, filters, { activeTimerTaskId, currentUserId: "mock-user" }),
    [rawColumns, filters, activeTimerTaskId]
  );

  const options = useMemo(() => extractFilterOptions(rawColumns), [rawColumns]);

  return { columns, rawColumns, options };
}
