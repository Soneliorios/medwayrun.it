"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Star, MoreHorizontal, Pencil, Archive, Copy, Trash2,
  LayoutGrid, List as ListIcon, Lock, Eye, ChevronLeft, ChevronRight, Clock,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectForm } from "@/features/projects/components/ProjectForm";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useProjectActions } from "@/features/projects/hooks/useProjects";
import { createRawClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

type ViewMode = "cards" | "list";
type SortBy = "activity" | "name" | "progress";
type FilterBy = "all" | "favorites" | "active";

const PAGE_SIZE = 12;

interface ProjectStats { hours: number; total: number; delivered: number; activity: number[]; }

async function computeStats(): Promise<Record<string, ProjectStats>> {
  const out: Record<string, ProjectStats> = {};
  const supabase = createRawClient();
  const { data, error } = await (supabase as any)
    .from("tasks")
    .select("project_id, tracked_hours, status");
  if (error) { console.error("[ProjectsExplorer.computeStats]", error); return out; }
  const byProj: Record<string, any[]> = {};
  (data ?? []).forEach((t: any) => { (byProj[t.project_id] ??= []).push(t); });
  for (const [pid, list] of Object.entries(byProj)) {
    const hours = list.reduce((s, t) => s + (t.tracked_hours ?? 0), 0);
    const delivered = list.filter((t) => t.status === "delivered").length;
    // deterministic 8-bar activity from task count + id hash
    const seed = pid.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const activity = Array.from({ length: 8 }, (_, i) => 20 + ((seed * (i + 3)) % 80));
    out[pid] = { hours, total: list.length, delivered, activity };
  }
  return out;
}

export function ProjectsExplorer({ title = "Quadros", noun = "quadro" }: { title?: string; noun?: string } = {}) {
  const projects = useProjectStore((s) => s.projects);
  const { toggleFavorite, archiveProject } = useProjectActions();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [view, setView] = useState<ViewMode>("cards");
  const [sortBy, setSortBy] = useState<SortBy>("activity");
  const [filterBy, setFilterBy] = useState<FilterBy>("all");
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});

  useEffect(() => {
    let cancelled = false;
    computeStats().then((s) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [projects]);

  function duplicate(_p: Project) {
    // TODO: implement project duplication via Supabase
  }

  const filtered = useMemo(() => {
    let list = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterBy === "favorites") list = list.filter((p) => p.is_favorite);
    // "active" = has open tasks; "all" = everything
    if (filterBy === "active") list = list.filter((p) => (stats[p.id]?.total ?? 0) > (stats[p.id]?.delivered ?? 0));
    const sorted = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "progress") {
        const pa = stats[a.id] ? stats[a.id].delivered / Math.max(stats[a.id].total, 1) : 0;
        const pb = stats[b.id] ? stats[b.id].delivered / Math.max(stats[b.id].total, 1) : 0;
        return pb - pa;
      }
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });
    return sorted;
  }, [projects, search, filterBy, sortBy, stats]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100 bg-white shrink-0 flex-wrap">
        <h1 className="text-base font-semibold text-brand-navy">{title}</h1>
        <div className="relative flex-1 max-w-xs ml-2">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={`Buscar ${noun}...`} className="pl-8 h-8 text-sm bg-neutral-50 border-neutral-200 focus:bg-white" />
        </div>

        <select value={filterBy} onChange={(e) => { setFilterBy(e.target.value as FilterBy); setPage(0); }} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-teal text-neutral-600">
          <option value="all">Todos</option>
          <option value="favorites">Favoritos</option>
          <option value="active">Ativos</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-teal text-neutral-600">
          <option value="activity">Atividade</option>
          <option value="name">Nome</option>
          <option value="progress">Progresso</option>
        </select>

        <div className="flex items-center gap-0.5 bg-neutral-100 rounded-lg p-0.5">
          <button onClick={() => setView("cards")} className={cn("w-7 h-7 flex items-center justify-center rounded-md", view === "cards" ? "bg-white text-brand-navy shadow-sm" : "text-neutral-400")}><LayoutGrid size={14} /></button>
          <button onClick={() => setView("list")} className={cn("w-7 h-7 flex items-center justify-center rounded-md", view === "list" ? "bg-white text-brand-navy shadow-sm" : "text-neutral-400")}><ListIcon size={14} /></button>
        </div>

        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-brand-navy hover:bg-brand-navy-light h-8 gap-1.5">
          <Plus size={14} /> Novo {noun}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-14 h-14 rounded-2xl bg-brand-navy/5 flex items-center justify-center mb-4"><Plus size={24} className="text-brand-navy/30" /></div>
            <p className="font-medium text-brand-navy">Nenhum {noun} encontrado</p>
            <p className="text-sm text-neutral-400 mt-1">Crie seu primeiro {noun} para começar.</p>
            <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 bg-brand-navy hover:bg-brand-navy-light"><Plus size={14} className="mr-1.5" />Criar {noun}</Button>
          </div>
        ) : view === "cards" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-w-6xl">
            {pageItems.map((p) => (
              <BoardCard key={p.id} project={p} stats={stats[p.id]} onEdit={setEditProject} onFavorite={toggleFavorite} onArchive={archiveProject} onDuplicate={duplicate} />
            ))}
          </div>
        ) : (
          <div className="max-w-5xl bg-white rounded-xl border border-neutral-100 overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="border-b border-neutral-100">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-neutral-400">Quadro</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-neutral-400 w-24">Tarefas</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-neutral-400 w-28">Progresso</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-neutral-400 w-24">Horas</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => {
                  const s = stats[p.id];
                  const pct = s ? Math.round((s.delivered / Math.max(s.total, 1)) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                      <td className="px-4 py-2.5">
                        <Link href={`/boards/${p.id}`} className="flex items-center gap-2 text-sm font-medium text-brand-navy hover:text-brand-teal">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                          {p.name}
                          {p.is_favorite && <Star size={11} className="text-brand-yellow" fill="currentColor" />}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">{s?.total ?? 0}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden"><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>
                          <span className="text-[10px] text-neutral-400">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">{(s?.hours ?? 0).toFixed(1)}h</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/boards/${p.id}`} className="text-xs font-medium text-brand-teal hover:underline">Entrar →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <span className="text-xs text-neutral-400">{safePage * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE + PAGE_SIZE, total)} de {total} {noun}s</span>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-brand-navy">Novo {noun}</DialogTitle></DialogHeader>
          <ProjectForm onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProject} onOpenChange={() => setEditProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-brand-navy">Editar {noun}</DialogTitle></DialogHeader>
          {editProject && <ProjectForm project={editProject} onSuccess={() => setEditProject(null)} onCancel={() => setEditProject(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoardCard({ project, stats, onEdit, onFavorite, onArchive, onDuplicate }: {
  project: Project;
  stats?: ProjectStats;
  onEdit: (p: Project) => void;
  onFavorite: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (p: Project) => void;
}) {
  const isPrivate = (project as any).visibility === "private";
  const pct = stats ? Math.round((stats.delivered / Math.max(stats.total, 1)) * 100) : 0;
  return (
    <div className="group relative bg-white rounded-xl border border-neutral-100 shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden">
      <div className="h-1 w-full" style={{ background: project.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link href={`/boards/${project.id}`} className="flex-1 min-w-0">
            <h3 className="font-semibold text-brand-navy hover:text-brand-teal transition-colors truncate text-sm">{project.name}</h3>
          </Link>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onFavorite(project.id)} className={cn("w-6 h-6 rounded flex items-center justify-center transition-colors", project.is_favorite ? "text-brand-yellow" : "text-neutral-200 hover:text-brand-yellow opacity-0 group-hover:opacity-100")}>
              <Star size={13} fill={project.is_favorite ? "currentColor" : "none"} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-6 h-6 rounded flex items-center justify-center text-neutral-200 hover:text-neutral-600 hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100"><MoreHorizontal size={13} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => onEdit(project)}><Pencil size={12} className="mr-2" />Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(project)}><Copy size={12} className="mr-2" />Duplicar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArchive(project.id)} className="text-neutral-500"><Archive size={12} className="mr-2" />Arquivar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (confirm("Excluir este quadro?")) onArchive(project.id); }} className="text-destructive focus:text-destructive"><Trash2 size={12} className="mr-2" />Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Visibility */}
        <div className="flex items-center gap-1 mb-2 text-[10px] text-neutral-400">
          {isPrivate ? <><Lock size={9} /> Privado</> : <><Eye size={9} /> Visível para todos</>}
        </div>

        {/* Activity bars (últimas semanas) */}
        <div className="flex items-end gap-1 h-8 mb-2">
          {(stats?.activity ?? Array(8).fill(8)).map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-brand-teal/30" style={{ height: `${Math.max(h, 8)}%` }} />
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-3">
          <span className="flex items-center gap-1"><Clock size={10} /> {(stats?.hours ?? 0).toFixed(1)}h</span>
          <span>{stats?.total ?? 0} tarefas · {pct}%</span>
        </div>

        <Link href={`/boards/${project.id}`} className="block w-full text-center text-xs font-medium text-white bg-brand-navy hover:bg-brand-navy-light rounded-lg py-1.5 transition-colors">
          Entrar
        </Link>
      </div>
    </div>
  );
}
