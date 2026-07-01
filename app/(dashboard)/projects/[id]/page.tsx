"use client";

import { useState, use } from "react";
import { Header } from "@/components/shared/Header";
import { KanbanBoard } from "@/features/board/components/KanbanBoard";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { TaskForm } from "@/features/tasks/components/TaskForm";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useBoardRealtime } from "@/features/board/hooks/useBoardRealtime";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectBoardPage({ params }: Props) {
  const { id: projectId } = use(params);
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === projectId);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [addTaskColumnId, setAddTaskColumnId] = useState<string | null>(null);

  // Enable realtime for this board
  useBoardRealtime(projectId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={project?.name ?? "Projeto"}>
        <Link
          href={`/projects/${projectId}/settings`}
          className="ml-auto mr-2 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-navy transition-colors px-2 py-1 rounded-md hover:bg-neutral-100"
        >
          <Settings size={13} />
          Configurações
        </Link>
      </Header>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          projectId={projectId}
          onTaskOpen={setOpenTaskId}
          onAddTask={setAddTaskColumnId}
        />
      </div>

      {/* Task detail sheet */}
      {openTaskId && (
        <TaskDetail
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}

      {/* Add task dialog */}
      <Dialog open={!!addTaskColumnId} onOpenChange={() => setAddTaskColumnId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Nova tarefa</DialogTitle>
          </DialogHeader>
          {addTaskColumnId && (
            <TaskForm
              projectId={projectId}
              columnId={addTaskColumnId}
              onSuccess={() => setAddTaskColumnId(null)}
              onCancel={() => setAddTaskColumnId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
