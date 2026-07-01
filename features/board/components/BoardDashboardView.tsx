"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, X, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatHours } from "@/lib/utils";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types";
import { useFilteredColumns } from "../hooks/useFilteredColumns";

// ── Metric registry ────────────────────────────────────────────────────────────

type MetricKey =
  | "total" | "open_assigned" | "open_unassigned" | "overdue" | "in_progress"
  | "due_today" | "delivered_30d" | "lead_time" | "delivered" | "urgent"
  | "reopened_count" | "avg_reopen_days" | "reopened_hours";

interface Metric {
  key: MetricKey;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  trend?: { dir: "up" | "down"; pct: number };
}

const MAX_METRICS = 40;
const DEFAULT_METRICS: MetricKey[] = [
  "open_assigned", "open_unassigned", "overdue", "in_progress", "due_today", "delivered_30d", "lead_time",
  "reopened_count", "reopened_hours",
];

function cfgKey(boardId: string) { return `mwr_dashcfg_${boardId}_mock-user`; }
function loadMetricCfg(boardId: string): MetricKey[] {
  if (typeof window === "undefined") return DEFAULT_METRICS;
  try {
    const raw = localStorage.getItem(cfgKey(boardId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_METRICS;
}
function saveMetricCfg(boardId: string, keys: MetricKey[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(cfgKey(boardId), JSON.stringify(keys));
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BoardDashboardView({ boardId }: { boardId: string }) {
  // Use rawColumns so metrics always reflect the full board, regardless of active filters
  const { rawColumns } = useFilteredColumns();
  const allTasks = useMemo(() => rawColumns.flatMap((c) => c.tasks), [rawColumns]);

  const [visibleKeys, setVisibleKeys] = useState<MetricKey[]>(() => loadMetricCfg(boardId));
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragKey, setDragKey] = useState<MetricKey | null>(null);

  useEffect(() => { saveMetricCfg(boardId, visibleKeys); }, [boardId, visibleKeys]);
  useEffect(() => { setVisibleKeys(loadMetricCfg(boardId)); }, [boardId]);

  // ── Compute metrics ──────────────────────────────────────────────────────────
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Last column = "done" column — matches TaskDetail's isDelivered logic:
  // a task is only truly delivered when status="delivered" AND it's in the last column.
  const lastColId = useMemo(
    () => [...rawColumns].sort((a, b) => a.position - b.position).at(-1)?.id ?? null,
    [rawColumns]
  );
  const isDeliveredTask = (t: any) => t.status === "delivered" && t.column_id === lastColId;
  const isAssigned = (t: any) => !!(t.assignee_id || t.assignees?.length);
  const isOpen = (t: any) => !isDeliveredTask(t) && t.status !== "archived";
  // Use local midnight to avoid UTC-offset shifting the date one day back in Brazil
  const isOverdue = (t: any) =>
    t.due_date && new Date(t.due_date + "T23:59:59") < now && isOpen(t);

  const total = allTasks.length;
  const openAssigned = allTasks.filter((t) => isOpen(t) && isAssigned(t)).length;
  const openUnassigned = allTasks.filter((t) => isOpen(t) && !isAssigned(t)).length;
  const overdue = allTasks.filter(isOverdue).length;
  const inProgress = allTasks.filter((t) => (t as any).status === "in_progress").length;
  const dueToday = allTasks.filter((t) => t.due_date?.slice(0, 10) === todayStr && isOpen(t)).length;

  const thirty = new Date(now); thirty.setDate(now.getDate() - 30);
  const sixty = new Date(now); sixty.setDate(now.getDate() - 60);
  const deliveredTasks = allTasks.filter((t) => (t as any).status === "delivered");
  const delivered30 = deliveredTasks.filter((t) => {
    const d = (t as any).delivery_date ?? t.updated_at;
    return d && new Date(d) >= thirty;
  }).length;
  const deliveredPrev30 = deliveredTasks.filter((t) => {
    const d = (t as any).delivery_date ?? t.updated_at;
    return d && new Date(d) >= sixty && new Date(d) < thirty;
  }).length;
  const delivered30Trend = deliveredPrev30 > 0
    ? Math.round(((delivered30 - deliveredPrev30) / deliveredPrev30) * 100)
    : 0;

  // Lead time (creation → delivery) avg in days
  const leadTimes = deliveredTasks
    .map((t) => {
      const c = t.created_at ? new Date(t.created_at).getTime() : null;
      const d = (t as any).delivery_date ?? t.updated_at;
      const dd = d ? new Date(d).getTime() : null;
      return c && dd && dd > c ? (dd - c) / 86400000 : null;
    })
    .filter((v): v is number => v !== null);
  const avgLead = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;
  const leadDays = Math.floor(avgLead);
  const leadHours = Math.round((avgLead - leadDays) * 24);

  const delivered = deliveredTasks.length;
  const urgent = allTasks.filter((t) => t.is_urgent).length;

  // Reopen metrics
  const reopenedTasks = allTasks.filter((t) => (t as any).reopen_count > 0);
  const reopenedCount = reopenedTasks.length;
  const reopenDays = reopenedTasks.flatMap((t) =>
    ((t as any).reopen_history ?? []).map((h: any) => h.days_since_delivery)
  );
  const avgReopenDays = reopenDays.length
    ? Math.round(reopenDays.reduce((a: number, b: number) => a + b, 0) / reopenDays.length)
    : 0;
  const reopenedHours = reopenedTasks.reduce((sum, t) => sum + (t.tracked_hours ?? 0), 0);

  const METRICS: Record<MetricKey, Metric> = {
    total: { key: "total", label: "Total de tarefas", value: total, color: "#00205B", sub: "no quadro" },
    open_assigned: { key: "open_assigned", label: "Abertas atribuídas", value: openAssigned, color: "#407EC9", sub: "com responsável" },
    open_unassigned: { key: "open_unassigned", label: "Abertas não atribuídas", value: openUnassigned, color: "#FFB81C", sub: "sem responsável" },
    overdue: { key: "overdue", label: "Atrasadas", value: overdue, color: "#AC145A", sub: overdue > 0 ? "requer atenção" : "tudo em dia ✓" },
    in_progress: { key: "in_progress", label: "Em andamento", value: inProgress, color: "#01CFB5", sub: "sendo executadas" },
    due_today: { key: "due_today", label: "Entrega para hoje", value: dueToday, color: "#7C3AED", sub: "vencem hoje" },
    delivered_30d: {
      key: "delivered_30d", label: "Entregues (30d)", value: delivered30, color: "#01CFB5",
      sub: "vs. período anterior", trend: { dir: delivered30Trend < 0 ? "down" : "up", pct: Math.abs(delivered30Trend) },
    },
    lead_time: { key: "lead_time", label: "Lead time médio", value: `${leadDays}d ${leadHours}h`, color: "#00205B", sub: "criação → entrega" },
    delivered: { key: "delivered", label: "Entregues", value: delivered, color: "#01CFB5", sub: `${total ? Math.round((delivered / total) * 100) : 0}% do total` },
    urgent: { key: "urgent", label: "Urgentes", value: urgent, color: "#FFB81C", sub: "marcadas como urgentes" },
    reopened_count: {
      key: "reopened_count", label: "Tarefas reabertas", value: reopenedCount, color: "#AC145A",
      sub: reopenedCount > 0 ? `${reopenedCount} tarefa${reopenedCount !== 1 ? "s" : ""} reaber${reopenedCount !== 1 ? "tas" : "ta"}` : "nenhuma reaberta",
    },
    reopened_hours: {
      key: "reopened_hours", label: "Horas em reabertas", value: formatHours(reopenedHours), color: "#AC145A",
      sub: reopenedCount > 0 ? `em ${reopenedCount} tarefa${reopenedCount !== 1 ? "s" : ""} reaber${reopenedCount !== 1 ? "tas" : "ta"}` : "nenhuma reaberta",
    },
    avg_reopen_days: {
      key: "avg_reopen_days", label: "Dias até reabrir", value: avgReopenDays, color: "#FFB81C",
      sub: avgReopenDays > 0 ? "média após entrega" : "sem dados",
    },
  };

  const hiddenKeys = (Object.keys(METRICS) as MetricKey[]).filter((k) => !visibleKeys.includes(k));

  function removeMetric(key: MetricKey) { setVisibleKeys((v) => v.filter((k) => k !== key)); }
  function addMetric(key: MetricKey) { setVisibleKeys((v) => [...v, key]); setMenuOpen(false); }
  function handleDrop(target: MetricKey) {
    if (!dragKey || dragKey === target) return;
    setVisibleKeys((v) => {
      const arr = [...v];
      const from = arr.indexOf(dragKey);
      const to = arr.indexOf(target);
      arr.splice(from, 1);
      arr.splice(to, 0, dragKey);
      return arr;
    });
    setDragKey(null);
  }

  // ── Charts data ────────────────────────────────────────────────────────────
  // Bar: delivered by type
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    deliveredTasks.forEach((t) => {
      const name = t.task_type?.name ?? (t as any).task_type ?? "Sem tipo";
      m.set(name, (m.get(name) ?? 0) + 1);
    });
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }, [deliveredTasks]);

  // Line: created vs delivered per week (8 weeks)
  const weeks = useMemo(() => {
    const arr: { label: string; created: number; delivered: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now); start.setDate(now.getDate() - w * 7 - now.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 7);
      const created = allTasks.filter((t) => t.created_at && new Date(t.created_at) >= start && new Date(t.created_at) < end).length;
      const deliv = deliveredTasks.filter((t) => {
        const d = (t as any).delivery_date ?? t.updated_at;
        return d && new Date(d) >= start && new Date(d) < end;
      }).length;
      arr.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, created, delivered: deliv });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, deliveredTasks]);

  // Pie: distribution by assignee (top 5 + outros)
  const byAssignee = useMemo(() => {
    const m = new Map<string, number>();
    allTasks.forEach((t) => {
      const name = (t as any).assignee?.full_name ?? (t.assignees?.[0] as any)?.profile?.full_name ?? (t.assignee_id ?? "Sem responsável");
      m.set(name, (m.get(name) ?? 0) + 1);
    });
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push(["Outros", rest]);
    return top.map(([label, value]) => ({ label, value }));
  }, [allTasks]);

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header with metric counter + add */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-neutral-400">
          Métricas criadas <span className="font-semibold text-brand-navy">{visibleKeys.length}/{MAX_METRICS}</span>
        </p>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={hiddenKeys.length === 0 || visibleKeys.length >= MAX_METRICS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-neutral-200 text-neutral-600 hover:text-brand-navy hover:border-brand-navy/30 disabled:opacity-40 transition-colors"
          >
            <Plus size={13} /> Adicionar métrica
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 p-1">
              {hiddenKeys.map((k) => (
                <button
                  key={k}
                  onClick={() => addMetric(k)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 rounded text-left"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: METRICS[k].color }} />
                  {METRICS[k].label}
                </button>
              ))}
              {hiddenKeys.length === 0 && <p className="text-xs text-neutral-400 px-3 py-2">Todas as métricas já estão no painel.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Metric cards (draggable) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {visibleKeys.map((k) => {
          const m = METRICS[k];
          if (!m) return null;
          return (
            <div
              key={k}
              draggable
              onDragStart={() => setDragKey(k)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(k)}
              className={cn(
                "bg-white rounded-xl p-4 border border-neutral-100 shadow-sm relative group cursor-grab transition-all",
                dragKey === k && "opacity-50"
              )}
            >
              <button
                onClick={() => removeMetric(k)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-destructive transition-all"
              >
                <X size={12} />
              </button>
              <GripVertical size={11} className="absolute top-2 left-2 text-neutral-200 opacity-0 group-hover:opacity-100" />
              <p className="text-xs text-neutral-500 mb-1">{m.label}</p>
              <p className="text-3xl font-bold mb-0.5" style={{ color: m.color }}>{m.value}</p>
              <div className="flex items-center gap-1.5">
                {m.trend && (
                  <span className={cn("flex items-center gap-0.5 text-[10px] font-semibold", m.trend.dir === "down" ? "text-destructive" : "text-green-600")}>
                    {m.trend.dir === "down" ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                    {m.trend.pct}%
                  </span>
                )}
                <p className="text-xs text-neutral-400">{m.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Tarefas entregues por tipo">
          <BarChart data={byType} />
        </ChartCard>
        <ChartCard title="Distribuição por responsável">
          <PieChart data={byAssignee} />
        </ChartCard>
      </div>
      <ChartCard title="Criadas vs. entregues por semana (8 semanas)">
        <LineChart data={weeks} />
      </ChartCard>

      {/* Priority breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {(Object.entries(PRIORITY_LABELS) as [keyof typeof PRIORITY_LABELS, string][]).map(([key, label]) => {
          const count = allTasks.filter((t) => (t.priority ?? "medium") === key).length;
          return (
            <div key={key} className="bg-white rounded-xl p-3 border border-neutral-100 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[key] }} />
                <span className="text-xs text-neutral-500">{label}</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: PRIORITY_COLORS[key] }}>{count}</p>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Chart primitives (custom SVG, no deps) ──────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-brand-navy mb-4">{title}</h3>
      {children}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 text-xs text-neutral-600 truncate shrink-0">{d.label}</span>
          <div className="flex-1 h-5 rounded-full bg-neutral-100 overflow-hidden">
            <div className="h-full rounded-full bg-brand-teal transition-all duration-500" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-neutral-700 shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data }: { data: { label: string; created: number; delivered: number }[] }) {
  if (data.length === 0) return <Empty />;
  const W = 600, H = 160, pad = 24;
  const max = Math.max(...data.flatMap((d) => [d.created, d.delivered]), 1);
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(data.length - 1, 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const line = (key: "created" | "delivered") => data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#E5E7EB" />
        <path d={line("created")} fill="none" stroke="#407EC9" strokeWidth={2} />
        <path d={line("delivered")} fill="none" stroke="#01CFB5" strokeWidth={2} />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.created)} r={2.5} fill="#407EC9" />
            <circle cx={x(i)} cy={y(d.delivered)} r={2.5} fill="#01CFB5" />
            <text x={x(i)} y={H - pad + 12} textAnchor="middle" fontSize={8} fill="#9CA3AF">{d.label}</text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <Legend color="#407EC9" label="Criadas" />
        <Legend color="#01CFB5" label="Entregues" />
      </div>
    </div>
  );
}

const PIE_COLORS = ["#00205B", "#01CFB5", "#407EC9", "#FFB81C", "#AC145A", "#A0A4A8"];
function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty />;
  let acc = 0;
  const R = 60, C = 70;
  const segments = data.map((d, i) => {
    const start = (acc / total) * 2 * Math.PI;
    acc += d.value;
    const end = (acc / total) * 2 * Math.PI;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = C + R * Math.sin(start), y1 = C - R * Math.cos(start);
    const x2 = C + R * Math.sin(end), y2 = C - R * Math.cos(end);
    return { path: `M${C},${C} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`, color: PIE_COLORS[i % PIE_COLORS.length], ...d };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="w-32 h-32 shrink-0">
        {segments.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
      </svg>
      <div className="space-y-1 flex-1 min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-neutral-600 truncate flex-1">{s.label}</span>
            <span className="text-xs font-semibold text-neutral-700">{s.value}</span>
            <span className="text-[10px] text-neutral-400 w-9 text-right">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
      <span className="w-3 h-0.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

function Empty() {
  return <p className="text-sm text-neutral-400 text-center py-8">Sem dados suficientes ainda.</p>;
}
