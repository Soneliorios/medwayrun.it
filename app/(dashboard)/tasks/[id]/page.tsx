"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { useProjectStore } from "@/features/projects/store/projectStore";

interface Props {
  params: Promise<{ id: string }>;
}

export default function TaskPage({ params }: Props) {
  const { id: taskId } = use(params);
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-neutral-100 bg-white shrink-0 text-xs text-neutral-400">
        <Link href="/boards" className="flex items-center gap-1 hover:text-brand-navy">
          <Home size={12} /> Empresa
        </Link>
        <ChevronRight size={11} />
        <span className="text-brand-navy font-medium">Tarefa</span>
      </div>

      {/* Fullscreen task */}
      <div className="flex-1 overflow-hidden">
        <TaskDetail taskId={taskId} variant="page" onClose={() => router.push("/boards")} />
      </div>
    </div>
  );
}
