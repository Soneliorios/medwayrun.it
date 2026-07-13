"use client";

import { useState, useEffect } from "react";
import { BarChart2, ListTodo, FolderKanban, Users, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createRawClient } from "@/lib/supabase/client";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/types";

interface OrgStats {
  totalTasks: number;
  deliveredTasks: number;
  overdueTasks: number;
  urgentTasks: number;
  totalProjects: number;
  activeProjects: number;
  tasksByPriority: Record<string, number>;
  tasksByProject: { name: string; color: string; count: number; delivered: number }[];
}

export default function CompanyDashboardPage() {
  const projects = useProjectStore((s) => s.projects);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createRawClient();
        const { data } = await supabase
          .from("tasks")
          .select("id, status, priority, is_urgent, due_date, project_id")
          .is("deleted_at", null);
        const tasks: any[] = data ?? [];
        const now = new Date();

        const tasksByProject: OrgStats["tasksByProject"] = projects
          .filter((p) => !p.is_archived)
          .map((p) => {
            const pt = tasks.filter((t: any) => t.project_id === p.id);
            return {
              name: p.name,
              color: p.color ?? "#407EC9",
              count: pt.length,
              delivered: pt.filter((t: any) => t.status === "delivered").length,
            };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        const tasksByPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
        tasks.forEach((t: any) => {
          if (t.priority in tasksByPriority) {
            tasksByPriority[t.priority as keyof typeof tasksByPriority]++;
          }
        });

        setStats({
          totalTasks: tasks.length,
          deliveredTasks: tasks.filter((t: any) => t.status === "delivered").length,
          overdueTasks: tasks.filter(
            (t: any) =>
              t.due_date &&
              new Date(t.due_date) < now &&
              t.status !== "delivered"
          ).length,
          urgentTasks: tasks.filter((t: any) => t.is_urgent).length,
          totalProjects: projects.length,
          activeProjects: projects.filter((p) => !p.is_archived).length,
          tasksByPriority,
          tasksByProject,
        });
      } catch {
        // Show empty state if DB not connected
        setStats({
          totalTasks: 0, deliveredTasks: 0, overdueTasks: 0, urgentTasks: 0,
          totalProjects: projects.length, activeProjects: projects.filter((p) => !p.is_archived).length,
          tasksByPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
          tasksByProject: [],
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [projects]);

  const deliveryRate =
    stats && stats.totalTasks > 0
      ? Math.round((stats.deliveredTasks / stats.totalTasks) * 100)
      : 0;

  const maxProjectTasks = Math.max(
    ...(stats?.tasksByProject.map((p) => p.count) ?? [1]),
    1
  );

  const kpis = stats
    ? [
        {
          label: "Total de tarefas",
          value: stats.totalTasks,
          icon: ListTodo,
          color: "#00205B",
          sub: "em todos os quadros",
        },
        {
          label: "Taxa de entrega",
          value: `${deliveryRate}%`,
          icon: TrendingUp,
          color: "#01CFB5",
          sub: `${stats.deliveredTasks} entregues`,
        },
        {
          label: "Em atraso",
          value: stats.overdueTasks,
          icon: AlertTriangle,
          color: stats.overdueTasks > 0 ? "#AC145A" : "#01CFB5",
          sub: stats.overdueTasks > 0 ? "requer atenção" : "tudo em dia ✓",
        },
        {
          label: "Urgentes",
          value: stats.urgentTasks,
          icon: Clock,
          color: "#FFB81C",
          sub: "marcadas como urgentes",
        },
        {
          label: "Quadros ativos",
          value: stats.activeProjects,
          icon: FolderKanban,
          color: "#407EC9",
          sub: `de ${stats.totalProjects} total`,
        },
        {
          label: "Concluídas",
          value: stats.deliveredTasks,
          icon: CheckCircle2,
          color: "#01CFB5",
          sub: `${deliveryRate}% do total`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <BarChart2 size={15} className="text-brand-navy shrink-0" />
        <h1 className="text-sm font-semibold text-brand-navy">Dashboard da empresa</h1>
        <span className="text-xs text-neutral-400">— visão geral</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {kpis.map(({ label, value, icon: Icon, color, sub }) => (
                <div key={label} className="bg-white rounded-xl p-4 border border-neutral-100 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-neutral-500">{label}</p>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: `${color}15` }}
                    >
                      <Icon size={14} style={{ color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color }}>
                    {value}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tasks by project */}
              <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-brand-navy mb-4">
                  Tarefas por quadro
                </h3>
                {stats?.tasksByProject.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-4">Sem dados disponíveis</p>
                ) : (
                  <div className="space-y-3">
                    {stats?.tasksByProject.map((proj) => (
                      <div key={proj.name} className="flex items-center gap-3">
                        <div className="w-28 shrink-0">
                          <span className="text-xs text-neutral-700 truncate block">{proj.name}</span>
                        </div>
                        <div className="flex-1 h-5 rounded-full bg-neutral-100 overflow-hidden relative">
                          {/* Total bar */}
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.max((proj.count / maxProjectTasks) * 100, proj.count > 0 ? 2 : 0)}%`,
                              background: proj.color,
                              opacity: 0.35,
                            }}
                          />
                          {/* Delivered bar */}
                          <div
                            className="h-full rounded-full transition-all duration-700 absolute top-0 left-0"
                            style={{
                              width: `${Math.max((proj.delivered / maxProjectTasks) * 100, proj.delivered > 0 ? 2 : 0)}%`,
                              background: proj.color,
                            }}
                          />
                        </div>
                        <div className="w-16 text-right shrink-0">
                          <span className="text-xs font-semibold text-neutral-700">{proj.count}</span>
                          {proj.delivered > 0 && (
                            <span className="text-xs text-neutral-400 ml-1">({proj.delivered}✓)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks by priority */}
              <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-brand-navy mb-4">
                  Distribuição por prioridade
                </h3>
                <div className="space-y-3">
                  {(["urgent", "high", "medium", "low"] as const).map((prio) => {
                    const count = stats?.tasksByPriority[prio] ?? 0;
                    const pct =
                      stats && stats.totalTasks > 0
                        ? (count / stats.totalTasks) * 100
                        : 0;
                    return (
                      <div key={prio} className="flex items-center gap-3">
                        <div className="w-16 shrink-0 flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: PRIORITY_COLORS[prio] }}
                          />
                          <span className="text-xs text-neutral-600">
                            {PRIORITY_LABELS[prio]}
                          </span>
                        </div>
                        <div className="flex-1 h-4 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.max(pct, count > 0 ? 2 : 0)}%`,
                              background: PRIORITY_COLORS[prio],
                            }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-semibold text-neutral-700">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Delivery rate ring */}
                <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="#01CFB5"
                        strokeWidth="3"
                        strokeDasharray={`${deliveryRate} ${100 - deliveryRate}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-brand-navy">{deliveryRate}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">Taxa de entrega</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {stats?.deliveredTasks ?? 0} de {stats?.totalTasks ?? 0} tarefas entregues
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
