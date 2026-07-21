"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useFilteredColumns } from "../hooks/useFilteredColumns";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { fetchBoardSubprojects } from "../store/boardProjectStore";
import { areasService } from "@/lib/areasService";
import { boardFieldService, type BoardCustomField } from "../services/boardFieldService";
import { buildCsv, downloadCsv } from "@/lib/csvExport";
import { PRIORITY_LABELS } from "@/types";

/**
 * Exporta as tarefas do quadro (respeitando os filtros ativos) para CSV.
 * Uma coluna por campo nativo + uma por campo customizado do quadro.
 * As tabelas de apoio (campos custom, áreas, projetos) são buscadas NO CLIQUE,
 * para o CSV nunca sair incompleto por corrida de carregamento.
 */
const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  delivered: "Entregue",
  done: "Concluída",
  archived: "Arquivada",
};

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return fmtDate(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function ExportBoardButton({ boardId }: { boardId: string }) {
  const { columns } = useFilteredColumns();
  const members = useOrgMembers();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === boardId));
  const [busy, setBusy] = useState(false);

  const total = columns.reduce((n, c) => n + c.tasks.length, 0);

  function memberName(id?: string | null): string {
    if (!id) return "";
    return members.find((m) => m.id === id)?.full_name ?? "";
  }

  function responsibles(task: any): string {
    const seq = Array.isArray(task.sequence) ? task.sequence : [];
    if (seq.length) return seq.map((s: any) => memberName(s.user_id)).filter(Boolean).join(", ");
    if (task.assignee?.full_name) return task.assignee.full_name;
    return memberName(task.assignee_id);
  }

  function fmtCustom(f: BoardCustomField, v: unknown): string {
    if (v == null) return "";
    switch (f.type) {
      case "checkbox": return v === true ? "Sim" : v === false ? "Não" : "";
      case "multiselect": return Array.isArray(v) ? v.join(" | ") : String(v);
      case "user": return memberName(String(v));
      case "date": return fmtDate(String(v));
      default: return String(v);
    }
  }

  async function handleExport() {
    if (busy || total === 0) return;
    setBusy(true);
    try {
      // Busca fresca das tabelas de apoio — garante CSV completo (sem corrida).
      const [customFields, areas, subprojects] = await Promise.all([
        boardFieldService.listCustom(boardId),
        areasService.list(),
        fetchBoardSubprojects(boardId),
      ]);

      const nativeHeaders = [
        "Título", "Etapa", "Projeto", "Tipo", "Prioridade", "Status", "Urgente",
        "Responsáveis", "Área solicitante", "Entrega desejada", "Início desejado", "Início real",
        "Horas estimadas", "Horas registradas", "Tags", "Descrição", "Criado em", "Atualizado em",
      ];
      const header = [...nativeHeaders, ...customFields.map((f) => f.label)];
      const rows: (string | number | null | undefined)[][] = [header];

      for (const col of columns) {
        for (const t of col.tasks as any[]) {
          const cf = (t.custom_fields ?? {}) as Record<string, unknown>;
          const priority = t.priority as string | undefined;
          const typeName = typeof t.task_type === "string" ? t.task_type : t.task_type?.name ?? "";
          rows.push([
            t.title ?? "",
            col.name ?? "",
            subprojects.find((p) => p.id === t.board_subproject_id)?.name ?? "",
            typeName,
            (priority && PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS]) || priority || "",
            STATUS_LABELS[t.status as string] ?? t.status ?? "",
            t.is_urgent ? "Sim" : "Não",
            responsibles(t),
            areas.find((a) => a.id === t.requesting_area_id)?.name ?? "",
            fmtDate(t.due_date),
            fmtDate(t.desired_start_date),
            fmtDate(t.start_date),
            t.estimated_hours ?? "",
            t.tracked_hours != null ? Math.round(Number(t.tracked_hours) * 100) / 100 : "",
            (t.labels ?? []).map((l: any) => l.name).join(", "),
            stripHtml(t.description),
            fmtDateTime(t.created_at),
            fmtDateTime(t.updated_at),
            ...customFields.map((f) => fmtCustom(f, cf[f.id])),
          ]);
        }
      }

      const csv = buildCsv(rows);
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const safeName = (project?.name ?? "quadro").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
      downloadCsv(`${safeName}_tarefas_${stamp}.csv`, csv);
    } catch (e) {
      console.error("[ExportBoardButton]", e);
      alert("Não foi possível gerar o arquivo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy || total === 0}
      title={total === 0 ? "Nenhuma tarefa para exportar" : `Exportar ${total} tarefa(s) — respeita os filtros — em CSV`}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-neutral-500 hover:text-brand-navy hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      <span className="hidden sm:inline">Exportar</span>
    </button>
  );
}
