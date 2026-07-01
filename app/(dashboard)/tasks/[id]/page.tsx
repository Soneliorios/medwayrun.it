"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { useBoardStore } from "@/features/board/store/boardStore";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { IS_MOCK, mockColumns, mockTasks } from "@/lib/mockDb";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default function TaskPage({ params }: Props) {
  const { id: taskId } = use(params);
  const router = useRouter();
  const setColumns = useBoardStore((s) => s.setColumns);
  const projects = useProjectStore((s) => s.projects);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Load the board the task belongs to so Etapa/Subtarefas work in fullscreen.
  useEffect(() => {
    if (!IS_MOCK) return;
    const task = mockTasks.get(taskId);
    if (!task) return;
    setProjectId(task.project_id);
    const cols = mockColumns.listByProject(task.project_id);
    const tasks = mockTasks.listByProject(task.project_id);
    const byCol = new Map<string, TaskWithRelations[]>();
    tasks.forEach((t) => {
      const arr = byCol.get(t.column_id) ?? [];
      arr.push(t as unknown as TaskWithRelations);
      byCol.set(t.column_id, arr);
    });
    const columns: ColumnWithTasks[] = cols.map((c) => ({
      ...c,
      tasks: (byCol.get(c.id) ?? []).sort((a, b) => (a as any).position - (b as any).position),
    }));
    setColumns(columns);
  }, [taskId, setColumns]);

  const projectName = projectId ? projects.find((p) => p.id === projectId)?.name : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-neutral-100 bg-white shrink-0 text-xs text-neutral-400">
        <Link href="/boards" className="flex items-center gap-1 hover:text-brand-navy">
          <Home size={12} /> Empresa
        </Link>
        <ChevronRight size={11} />
        {projectId ? (
          <Link href={`/boards/${projectId}`} className="hover:text-brand-navy truncate max-w-[200px]">
            {projectName ?? "Quadro"}
          </Link>
        ) : (
          <span>Quadro</span>
        )}
        <ChevronRight size={11} />
        <span className="text-brand-navy font-medium">Tarefa</span>
      </div>

      {/* Fullscreen task */}
      <div className="flex-1 overflow-hidden">
        <TaskDetail taskId={taskId} variant="page" onClose={() => router.push(projectId ? `/boards/${projectId}` : "/boards")} />
      </div>
    </div>
  );
}
