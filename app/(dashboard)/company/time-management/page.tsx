"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Users, ListTodo, Loader2, Lock, Download, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCsv, downloadCsv } from "@/lib/csvExport";

// ── Tipos do payload da rota /api/company/time-management ─────────────────────
interface TMRecord {
  userId: string;
  taskId: string | null;
  taskTitle: string;
  taskType: string;
  projectId: string | null;
  projectName: string;
  date: string; // YYYY-MM-DD
  minutes: number;
}
interface TMMember { id: string; full_name: string; avatar_url: string | null; weeklyHours: number | null }
interface TMData { records: TMRecord[]; members: TMMember[]; teams: { id: string; name: string }[]; scopeTeamIds: string[] }

const PALETTE = ["#00205B", "#01CFB5", "#407EC9", "#FFB81C", "#AC145A", "#3B3FB6", "#00EFC8", "#52575C", "#EA580C", "#16A34A"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtHm(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}
function daysInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}
// Dias úteis (seg–sex) no intervalo — base da capacidade prorrateada.
function businessDaysInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  let count = 0, guard = 0;
  const cur = new Date(a);
  while (cur <= b && guard < 4000) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return count;
}
function fmtDateBR(d: string) {
  const [y, m, dd] = d.split("-");
  return dd && m ? `${dd}/${m}` : d;
}

type Preset = "7d" | "month" | "30d" | "lastMonth" | "custom";
function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  const t = ymd(today);
  if (p === "7d") { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: ymd(f), to: t }; }
  if (p === "30d") { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: ymd(f), to: t }; }
  if (p === "month") { return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: t }; }
  if (p === "lastMonth") {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const l = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: ymd(f), to: ymd(l) };
  }
  return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: t };
}

export default function TimeManagementPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const initial = presetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [teamId, setTeamId] = useState<string>("all");

  const [data, setData] = useState<TMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros no cliente (não refazem a busca).
  const [personFilter, setPersonFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetch("/api/company/time-management", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, teamId: teamId === "all" ? undefined : teamId }),
    })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401 || r.status === 403) { setForbidden(true); setData(null); setLoading(false); return; }
        if (!r.ok) { setError("Não foi possível carregar os dados."); setLoading(false); return; }
        const json = (await r.json()) as TMData;
        setForbidden(false);
        setData(json);
        setLoading(false);
      })
      .catch(() => { if (alive) { setError("Erro de rede."); setLoading(false); } });
    return () => { alive = false; };
  }, [from, to, teamId]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") { const r = presetRange(p); setFrom(r.from); setTo(r.to); }
  }

  const records = data?.records ?? [];
  const members = data?.members ?? [];
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);

  const allTypes = useMemo(() => [...new Set(records.map((r) => r.taskType))].sort(), [records]);

  const filtered = useMemo(
    () => records.filter((r) =>
      (personFilter.size === 0 || personFilter.has(r.userId)) &&
      (typeFilter.size === 0 || typeFilter.has(r.taskType))
    ),
    [records, personFilter, typeFilter]
  );

  const totalMinutes = useMemo(() => filtered.reduce((s, r) => s + r.minutes, 0), [filtered]);

  const byPerson = useMemo(() => {
    const m = new Map<string, { minutes: number; tasks: Set<string> }>();
    for (const r of filtered) {
      const e = m.get(r.userId) ?? { minutes: 0, tasks: new Set() };
      e.minutes += r.minutes;
      if (r.taskId) e.tasks.add(r.taskId);
      m.set(r.userId, e);
    }
    return m;
  }, [filtered]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.taskType, (m.get(r.taskType) ?? 0) + r.minutes);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.date, (m.get(r.date) ?? 0) + r.minutes);
    // Semeia TODOS os dias do intervalo (dias sem registro = 0) → eixo de tempo real.
    const out: { date: string; minutes: number }[] = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    let guard = 0;
    while (cur <= end && guard < 1000) {
      const d = ymd(cur);
      out.push({ date: d, minutes: m.get(d) ?? 0 });
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return out;
  }, [filtered, from, to]);

  const byTask = useMemo(() => {
    const m = new Map<string, { title: string; type: string; project: string; minutes: number; users: Set<string> }>();
    for (const r of filtered) {
      const k = r.taskId ?? `sem:${r.taskTitle}`;
      const e = m.get(k) ?? { title: r.taskTitle, type: r.taskType, project: r.projectName, minutes: 0, users: new Set() };
      e.minutes += r.minutes;
      e.users.add(r.userId);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [filtered]);

  // Membros visíveis (respeita o filtro de pessoa) — mostra também quem tem 0h.
  const visibleMembers = useMemo(
    () => members.filter((m) => personFilter.size === 0 || personFilter.has(m.id)),
    [members, personFilter]
  );

  const rangeDays = daysInclusive(from, to);
  const bizDays = useMemo(() => businessDaysInclusive(from, to), [from, to]);
  // Com filtro de tipo ativo, a utilização vs. meta não faz sentido (a meta é de
  // TODO o trabalho, não de um tipo) — então é ocultada.
  const typeScoped = typeFilter.size > 0;

  const perPersonRows = useMemo(() => {
    return visibleMembers
      .map((m) => {
        const agg = byPerson.get(m.id);
        const minutes = agg?.minutes ?? 0;
        const tasks = agg?.tasks.size ?? 0;
        // Capacidade prorrateada por DIAS ÚTEIS: semanal ÷ 5 × dias úteis do período.
        const expected = m.weeklyHours != null ? (m.weeklyHours * bizDays) / 5 : null;
        const util = !typeScoped && expected && expected > 0 ? (minutes / 60 / expected) * 100 : null;
        return { ...m, minutes, tasks, expected, util };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [visibleMembers, byPerson, bizDays, typeScoped]);

  const activePeople = perPersonRows.filter((p) => p.minutes > 0).length;
  const distinctTasks = useMemo(() => new Set(filtered.map((r) => r.taskId).filter(Boolean)).size, [filtered]);
  const maxPerson = Math.max(...perPersonRows.map((p) => p.minutes), 1);

  function exportCsv() {
    const header = ["Pessoa", "Tarefa", "Tipo", "Quadro", "Data", "Horas"];
    const rows: (string | number)[][] = [header];
    for (const r of [...filtered].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([memberName.get(r.userId) ?? r.userId, r.taskTitle, r.taskType, r.projectName, fmtDateBR(r.date), (r.minutes / 60).toFixed(2)]);
    }
    downloadCsv(`gestao-de-tempo_${from}_a_${to}.csv`, buildCsv(rows));
  }

  function togglePerson(id: string) {
    setPersonFilter((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleType(t: string) {
    setTypeFilter((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <Lock size={36} className="text-neutral-300" />
        <div>
          <p className="text-base font-semibold text-brand-navy">Acesso restrito</p>
          <p className="text-sm text-neutral-400 mt-1">A Gestão de tempo é exclusiva para líderes de time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-50/40">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-brand-navy flex items-center gap-2">
              <Clock size={20} className="text-brand-teal" /> Gestão de tempo
            </h1>
            <p className="text-sm text-neutral-400 mt-0.5">
              Quanto tempo seu time investe — por pessoa, por tipo de tarefa e por período.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 text-neutral-600 hover:bg-white hover:text-brand-navy transition-colors disabled:opacity-40"
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>

        {/* Filtros de período + time */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-3 flex items-center gap-2 flex-wrap">
          {(data?.teams.length ?? 0) > 1 && (
            <div className="relative">
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="appearance-none text-sm border border-neutral-200 rounded-lg pl-3 pr-8 py-1.5 bg-white outline-none focus:border-brand-teal"
              >
                <option value="all">Todos os times</option>
                {data?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
          )}
          <div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
            {([["7d", "7 dias"], ["month", "Este mês"], ["30d", "30 dias"], ["lastMonth", "Mês passado"], ["custom", "Personalizado"]] as [Preset, string][]).map(([p, label]) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors", preset === p ? "bg-white text-brand-navy shadow-sm" : "text-neutral-500 hover:text-brand-navy")}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand-teal" />
              <span className="text-neutral-400 text-xs">até</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 outline-none focus:border-brand-teal" />
            </div>
          )}
          <span className="text-xs text-neutral-400 ml-auto">{fmtDateBR(from)} – {fmtDateBR(to)} · {rangeDays} dias</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-16 justify-center">
            <Loader2 size={16} className="animate-spin" /> Carregando…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive bg-destructive/5 rounded-lg p-4">{error}</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={<Clock size={15} />} label="Total no período" value={fmtHm(totalMinutes)} />
              <Kpi icon={<Users size={15} />} label="Pessoas ativas" value={`${activePeople}/${visibleMembers.length}`} />
              <Kpi icon={<Clock size={15} />} label="Média por pessoa" value={fmtHm(visibleMembers.length ? totalMinutes / visibleMembers.length : 0)} />
              <Kpi icon={<ListTodo size={15} />} label="Tarefas trabalhadas" value={String(distinctTasks)} />
            </div>

            {/* Filtros por pessoa / tipo (afetam tudo abaixo) */}
            {(members.length > 0 || allTypes.length > 0) && (
              <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mr-1">Pessoa</span>
                  {members.map((m) => (
                    <button key={m.id} onClick={() => togglePerson(m.id)}
                      className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", personFilter.has(m.id) ? "bg-brand-navy text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200")}>
                      {m.full_name}
                    </button>
                  ))}
                </div>
                {allTypes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mr-1">Tipo</span>
                    {allTypes.map((t) => (
                      <button key={t} onClick={() => toggleType(t)}
                        className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", typeFilter.has(t) ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200")}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {(personFilter.size > 0 || typeFilter.size > 0) && (
                  <button onClick={() => { setPersonFilter(new Set()); setTypeFilter(new Set()); }} className="text-[11px] text-brand-teal hover:underline">Limpar filtros</button>
                )}
              </div>
            )}

            {/* Por pessoa (capacidade/utilização) */}
            <Section title="Tempo por pessoa">
              {perPersonRows.length === 0 ? <Empty /> : (
                <div className="space-y-2.5">
                  {perPersonRows.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 text-sm text-neutral-700 truncate" title={p.full_name}>{p.full_name}</span>
                      <div className="flex-1 h-6 rounded-lg bg-neutral-100 overflow-hidden relative">
                        <div className="h-full rounded-lg bg-brand-teal transition-all duration-500" style={{ width: `${(p.minutes / maxPerson) * 100}%` }} />
                        {!typeScoped && p.expected != null && (
                          <div className="absolute top-0 bottom-0 w-px bg-brand-navy/50" style={{ left: `${Math.min((p.expected * 60 / maxPerson) * 100, 100)}%` }} title={`Meta no período: ${p.expected.toFixed(0)}h`} />
                        )}
                      </div>
                      <span className="w-16 text-right text-xs font-semibold text-neutral-700 shrink-0">{fmtHm(p.minutes)}</span>
                      <span className="w-14 text-right text-xs shrink-0" title="Tarefas">{p.tasks} tar.</span>
                      <span className={cn("w-14 text-right text-xs font-medium shrink-0", p.util == null ? "text-neutral-300" : p.util > 100 ? "text-destructive" : p.util >= 70 ? "text-brand-teal" : "text-neutral-500")}>
                        {p.util == null ? "—" : `${Math.round(p.util)}%`}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-neutral-400 pt-1">
                    {typeScoped
                      ? "Utilização/meta ocultas enquanto há filtro de tipo (a meta considera todo o trabalho, não um tipo)."
                      : "A linha vertical marca a meta de horas no período (capacidade semanal ÷ 5 × dias úteis). % = utilização vs. meta."}
                  </p>
                </div>
              )}
            </Section>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Por tipo */}
              <Section title="Tempo por tipo de tarefa">
                {byType.length === 0 ? <Empty /> : (
                  <div className="space-y-2">
                    {byType.map((d, i) => (
                      <div key={d.label} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-xs text-neutral-600 truncate" title={d.label}>{d.label}</span>
                        <div className="flex-1 h-5 rounded-full bg-neutral-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(d.value / (byType[0]?.value || 1)) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                        </div>
                        <span className="w-16 text-right text-xs font-semibold text-neutral-700 shrink-0">{fmtHm(d.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Por dia */}
              <Section title="Tempo ao longo do período">
                {byDay.length === 0 ? <Empty /> : <DayChart data={byDay} />}
              </Section>
            </div>

            {/* Detalhe por tarefa */}
            <Section title={`Detalhe por tarefa (${byTask.length})`}>
              {byTask.length === 0 ? <Empty /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
                        <th className="text-left font-semibold py-2 pr-3">Tarefa</th>
                        <th className="text-left font-semibold py-2 pr-3">Tipo</th>
                        <th className="text-left font-semibold py-2 pr-3">Quadro</th>
                        <th className="text-left font-semibold py-2 pr-3">Pessoas</th>
                        <th className="text-right font-semibold py-2">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTask.slice(0, 200).map((t, i) => (
                        <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                          <td className="py-2 pr-3 text-neutral-700 max-w-[280px] break-words">{t.title}</td>
                          <td className="py-2 pr-3"><span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{t.type}</span></td>
                          <td className="py-2 pr-3 text-neutral-500 text-xs">{t.project}</td>
                          <td className="py-2 pr-3 text-neutral-500 text-xs">{[...t.users].map((u) => memberName.get(u) ?? "?").join(", ")}</td>
                          <td className="py-2 text-right font-semibold text-neutral-700 whitespace-nowrap">{fmtHm(t.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {byTask.length > 200 && <p className="text-[11px] text-neutral-400 pt-2">Mostrando as 200 tarefas com mais tempo. Use os filtros ou exporte o CSV para ver todas.</p>}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ── Componentes ───────────────────────────────────────────────────────────────
function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-3.5">
      <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-semibold uppercase tracking-wide">{icon}{label}</div>
      <p className="text-2xl font-bold text-brand-navy mt-1">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-brand-navy mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-neutral-400 py-6 text-center">Nenhum registro de tempo no período.</p>;
}

function DayChart({ data }: { data: { date: string; minutes: number }[] }) {
  const W = 560, H = 160, pad = 26;
  const max = Math.max(...data.map((d) => d.minutes), 1);
  const n = data.length;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(n - 1, 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.minutes)}`).join(" ");
  const area = `${path} L${x(n - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  const step = Math.ceil(n / 8);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 420 }}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#E5E7EB" />
        <path d={area} fill="#01CFB5" opacity={0.12} />
        <path d={path} fill="none" stroke="#01CFB5" strokeWidth={2} />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.minutes)} r={2.5} fill="#01CFB5">
              <title>{`${fmtDateBR(d.date)}: ${fmtHm(d.minutes)}`}</title>
            </circle>
            {i % step === 0 && <text x={x(i)} y={H - pad + 12} textAnchor="middle" fontSize={8} fill="#9CA3AF">{fmtDateBR(d.date)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
