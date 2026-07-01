"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Mail, Phone, Building2, Clock, FolderKanban, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockClients, type MockClient } from "@/lib/mockClients";

interface Props { params: Promise<{ id: string }>; }

export default function ClientProfilePage({ params }: Props) {
  const { id } = use(params);
  const [client, setClient] = useState<MockClient | null>(null);

  useEffect(() => { setClient(mockClients.get(id)); }, [id]);

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Building2 size={28} className="text-neutral-200" />
        <p className="text-sm text-neutral-400">Cliente não encontrado.</p>
        <Link href="/company/clients" className="text-xs text-brand-teal hover:underline">Voltar para clientes</Link>
      </div>
    );
  }

  const rate = client.tasks > 0 ? Math.round((client.delivered / client.tasks) * 100) : 0;
  const hoursPct = client.hoursContracted > 0 ? Math.min((client.hours / client.hoursContracted) * 100, 100) : 0;
  const maxWeekly = Math.max(...client.weekly, 1);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-neutral-100 bg-white shrink-0">
        <Link href="/company/clients" className="flex items-center gap-1 text-xs text-neutral-400 hover:text-brand-navy">
          <ChevronLeft size={13} /> Clientes
        </Link>
        <span className="text-xs text-neutral-300">/</span>
        <span className="text-xs text-brand-navy font-medium">{client.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl">
        {/* Identity card */}
        <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm flex items-start gap-4">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: client.color }}>{client.name.charAt(0)}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-brand-navy">{client.name}</h1>
              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", client.status === "active" ? "bg-green-50 text-green-600" : "bg-neutral-100 text-neutral-400")}>{client.status === "active" ? "Ativo" : "Inativo"}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">{client.sector} · <span className="font-mono">{client.code}</span></p>
            <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
              {client.contact && <span className="flex items-center gap-1"><Mail size={11} /> {client.contact}</span>}
              {client.phone && <span className="flex items-center gap-1"><Phone size={11} /> {client.phone}</span>}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI icon={<FolderKanban size={14} />} label="Projetos" value={client.projects} color="#00205B" />
          <KPI icon={<TrendingUp size={14} />} label="Taxa de entrega" value={`${rate}%`} color="#01CFB5" sub={`${client.delivered}/${client.tasks}`} />
          <KPI icon={<Clock size={14} />} label="Horas usadas" value={`${client.hours}h`} color="#407EC9" />
          <KPI icon={<Clock size={14} />} label="Contratadas" value={client.hoursContracted > 0 ? `${client.hoursContracted}h` : "—"} color="#FFB81C" />
        </div>

        {/* Hours investidas vs contratadas */}
        {client.hoursContracted > 0 && (
          <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-navy mb-3">Horas investidas vs. contratadas</h3>
            <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
              <div className="h-full rounded-full bg-brand-teal" style={{ width: `${hoursPct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-neutral-400">
              <span>{client.hours}h usadas</span>
              <span>{client.hoursContracted - client.hours}h restantes</span>
            </div>
          </div>
        )}

        {/* Activity history */}
        <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-brand-navy mb-4">Histórico de atividade (semanal)</h3>
          <div className="flex items-end gap-2 h-28">
            {client.weekly.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t transition-all" style={{ height: `${(h / maxWeekly) * 100}%`, minHeight: 4, background: client.color, opacity: 0.7 }} />
                <span className="text-[9px] text-neutral-400">S{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Linked projects + tasks (links to filtered views) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-navy mb-2">Projetos vinculados</h3>
            <p className="text-xs text-neutral-400 mb-3">{client.projects} projeto(s) associado(s) a este cliente.</p>
            <Link href="/company/projects" className="text-xs text-brand-teal hover:underline">Ver projetos →</Link>
          </div>
          <div className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-navy mb-2">Tarefas recentes</h3>
            <p className="text-xs text-neutral-400 mb-3">{client.tasks} tarefa(s) · {client.delivered} entregue(s).</p>
            <Link href="/company/tasks" className="text-xs text-brand-teal hover:underline">Ver tarefas →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-neutral-400 mb-1" style={{ color }}>{icon}</div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-neutral-400">{label}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}
