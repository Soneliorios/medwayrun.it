"use client";
// v2

import { useMemo } from "react";
import { FolderKanban, ArrowRight, Clock, CheckCircle2, Settings } from "lucide-react";
import { useBoardProjectStore } from "@/features/board/store/boardProjectStore";
import { useFilterStore } from "@/features/board/store/filterStore";
import { useFilteredColumns } from "@/features/board/hooks/useFilteredColumns";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Props {
  boardId: string;
  onTaskOpen: (taskId: string) => void;
}

export function BoardProjectsView({ boardId, onTaskOpen }: Props) {
  const { projects } = useBoardProjectStore();
  const { columns } = useFilteredColumns();
  const applyFilters = useFilterStore((s) => s.applyFilters);

  const allTasks = useMemo(
    () => columns.flatMap((c) => c.tasks.map((t) => ({ ...t, _columnName: c.name, _columnColor: c.color ?? "#A0A4A8" }))),
    [columns]
  );

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns]
  );
  const lastCol = sortedColumns[sortedColumns.length - 1];

  const projectStats = useMemo(() => {
    return projects.map((bp) => {
      const tasks = allTasks.filter((t) => (t as any).board_project_id === bp.id);
      const total = tasks.length;
      const delivered = tasks.filter((t) => t.status === "delivered" || t.column_id === lastCol?.id).length;
      const trackedHours = tasks.reduce((sum, t) => sum + (t.tracked_hours ?? 0), 0);
      const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

      const byStage = sortedColumns.map((col) => ({
        id: col.id,
        name: col.name,
        color: col.color ?? "#A0A4A8",
        count: tasks.filter((t) => t.column_id === col.id).length,
      }));

      return { bp, tasks, total, delivered, trackedHours, pct, byStage };
    });
  }, [projects, allTasks, sortedColumns, lastCol]);

  const unassigned = useMemo(() => allTasks.filter((t) => !(t as any).board_project_id), [allTasks]);

  if (projects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <FolderKanban size={48} className="text-neutral-200" />
        <div>
          <p className="text-sm font-semibold text-neutral-500">Nenhum projeto criado ainda</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
            Crie projetos internos nas configurações do quadro para organizar e filtrar suas tarefas.
          </p>
        </div>
        <Link
          href={`/boards/${boardId}/settings?tab=projects`}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
        >
          <Settings size={14} /> Configurar projetos
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 bg-neutral-50/50">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-brand-navy">Projetos</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {projects.length} projeto{projects.length !== 1 ? "s" : ""} · {allTasks.length} tarefas no quadro
            </p>
          </div>
          <Link
            href={`/boards/${boardId}/settings?tab=projects`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:text-brand-navy hover:bg-white border border-neutral-200 transition-colors"
          >
            <Settings size={12} /> Gerenciar
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {projectStats.map(({ bp, total, delivered, trackedHours, pct, byStage }) => (
            <div
              key={bp.id}
              className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Color header bar */}
              <div className="h-1.5 w-full" style={{ background: bp.color }} />

              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: bp.color }} />
                    <span className="text-sm font-semibold text-brand-navy truncate">{bp.name}</span>
                  </div>
                  <button
                    onClick={() => applyFilters({ boardProjectIds: [bp.id] })}
                    className="shrink-0 flex items-center gap-1 text-[11px] text-neutral-400 hover:text-brand-teal transition-colors ml-2"
                    title="Filtrar por este projeto"
                  >
                    Filtrar <ArrowRight size={10} />
                  </button>
                </div>

                {bp.description && (
                  <p className="text-xs text-neutral-400 mb-3 line-clamp-2">{bp.description}</p>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <CheckCircle2 size={11} className="text-brand-teal" />
                    <span>{delivered}/{total} entregues</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <Clock size={11} className="text-neutral-400" />
                    <span>{trackedHours.toFixed(1)}h</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                    <span>Concluído</span>
                    <span className="font-semibold" style={{ color: pct >= 100 ? "#01CFB5" : pct >= 70 ? "#FFB81C" : "#00205B" }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 100 ? "#01CFB5" : pct >= 70 ? "#FFB81C" : bp.color,
                      }}
                    />
                  </div>
                </div>

                {/* Stage breakdown */}
                {total > 0 && (
                  <div className="space-y-1">
                    {byStage.filter((s) => s.count > 0).map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: s.color }}
                        />
                        <span className="text-[10px] text-neutral-500 flex-1 truncate">{s.name}</span>
                        <span className="text-[10px] font-semibold text-neutral-600">{s.count}</span>
                        <div className="w-16 h-1 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {total === 0 && (
                  <p className="text-xs text-neutral-300 text-center py-1">Nenhuma tarefa neste projeto</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Unassigned card */}
        {unassigned.length > 0 && (
          <div className="bg-white rounded-xl border border-dashed border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-neutral-300" />
                <span className="text-sm font-medium text-neutral-500">Sem projeto</span>
                <span className="text-xs bg-neutral-100 text-neutral-400 rounded-full px-2 py-0.5">{unassigned.length}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unassigned.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTaskOpen(t.id)}
                  className="text-[11px] px-2 py-1 rounded-md bg-neutral-50 border border-neutral-100 text-neutral-600 hover:border-brand-teal/40 hover:text-brand-navy transition-colors max-w-[180px] truncate"
                  title={t.title}
                >
                  {t.title}
                </button>
              ))}
              {unassigned.length > 8 && (
                <span className="text-[11px] text-neutral-400 px-2 py-1">+{unassigned.length - 8} mais</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
