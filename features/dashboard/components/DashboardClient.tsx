"use client";

import Link from "next/link";
import { formatDate, isOverdue, timeAgo } from "@/lib/utils";
import { PRIORITY_COLORS } from "@/types";
import { CheckCircle2, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
}

interface Props {
  stats: Stats;
  myTasks: any[];
  recentActivities: any[];
}

const KPICard = ({
  icon,
  label,
  value,
  color,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  trend?: string;
}) => (
  <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      {trend && (
        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
          {trend}
        </span>
      )}
    </div>
    <p className="text-3xl font-bold text-brand-navy" style={{ fontFamily: "var(--font-montserrat)" }}>
      {value}
    </p>
    <p className="text-sm text-neutral-500 mt-0.5">{label}</p>
  </div>
);

export function DashboardClient({ stats, myTasks, recentActivities }: Props) {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto w-full">
      {/* KPI Cards */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">
          Visão geral
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={<TrendingUp size={18} />}
            label="Tarefas abertas"
            value={stats.openTasks}
            color="#407EC9"
          />
          <KPICard
            icon={<AlertTriangle size={18} />}
            label="Atrasadas"
            value={stats.overdueTasks}
            color="#AC145A"
          />
          <KPICard
            icon={<CheckCircle2 size={18} />}
            label="Concluídas"
            value={stats.completedTasks}
            color="#01CFB5"
          />
          <KPICard
            icon={<Clock size={18} />}
            label="Em andamento"
            value={Math.max(0, stats.openTasks - stats.overdueTasks)}
            color="#FFB81C"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Tasks */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-50">
            <h2 className="text-sm font-semibold text-brand-navy">
              Tarefas próximas
            </h2>
            <Link
              href="/projects"
              className="text-xs text-brand-teal hover:text-brand-teal-dark transition-colors"
            >
              Ver todas
            </Link>
          </div>
          <div className="divide-y divide-neutral-50">
            {myTasks.length === 0 ? (
              <p className="px-5 py-8 text-sm text-neutral-400 text-center">
                Nenhuma tarefa pendente
              </p>
            ) : (
              myTasks.slice(0, 8).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50/60 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background:
                        PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? "#A0A4A8",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-navy truncate">{task.title}</p>
                    <p className="text-xs text-neutral-400">
                      {(task as any).projects?.name}
                    </p>
                  </div>
                  {task.due_date && (
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                        isOverdue(task.due_date)
                          ? "bg-red-50 text-red-500"
                          : "bg-neutral-100 text-neutral-500"
                      )}
                    >
                      {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm">
          <div className="px-5 py-4 border-b border-neutral-50">
            <h2 className="text-sm font-semibold text-brand-navy">
              Atividade recente
            </h2>
          </div>
          <div className="divide-y divide-neutral-50">
            {recentActivities.length === 0 ? (
              <p className="px-5 py-8 text-sm text-neutral-400 text-center">
                Nenhuma atividade ainda
              </p>
            ) : (
              recentActivities.slice(0, 8).map((activity) => (
                <div key={activity.id} className="px-5 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-brand-navy/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-brand-navy">
                        {(activity as any).profiles?.full_name
                          ?.charAt(0)
                          .toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-600">
                        <span className="font-medium text-brand-navy">
                          {(activity as any).profiles?.full_name ?? "Alguém"}
                        </span>{" "}
                        {activity.action}{" "}
                        <span className="font-medium text-brand-navy truncate">
                          {(activity as any).tasks?.title}
                        </span>
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {timeAgo(activity.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
