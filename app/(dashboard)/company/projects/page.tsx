"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  Plus,
  Search,
  Star,
  MoreHorizontal,
  Archive,
  Settings,
  ExternalLink,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useProjectActions } from "@/features/projects/hooks/useProjects";
import { ProjectForm } from "@/features/projects/components/ProjectForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Project } from "@/types";

type ViewMode = "grid" | "list";

export default function CompanyProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const { toggleFavorite, archiveProject } = useProjectActions();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const filtered = projects.filter((p) => {
    if (!showArchived && p.is_archived) return false;
    if (showArchived && !p.is_archived) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const favorites = filtered.filter((p) => p.is_favorite);
  const regular = filtered.filter((p) => !p.is_favorite);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <FolderKanban size={15} className="text-brand-navy shrink-0" />
        <h1 className="text-sm font-semibold text-brand-navy">Projetos e Quadros</h1>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projetos..."
            className="pl-7 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none focus:border-brand-teal transition-colors w-44"
          />
        </div>

        {/* View mode */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-neutral-100">
          {([["grid", LayoutGrid], ["list", List]] as [ViewMode, React.ElementType][]).map(([mode, Icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded-md transition-colors",
                viewMode === mode ? "bg-white shadow-sm text-brand-navy" : "text-neutral-400 hover:text-neutral-600"
              )}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>

        {/* Archived toggle */}
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={cn(
            "text-xs px-2.5 py-1.5 rounded-lg transition-colors",
            showArchived ? "bg-neutral-200 text-neutral-700" : "text-neutral-500 hover:bg-neutral-100"
          )}
        >
          {showArchived ? "Arquivados" : "Ativos"}
        </button>

        {/* New project */}
        <button
          onClick={() => setNewProjectOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors"
        >
          <Plus size={13} />
          Novo projeto
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <FolderKanban size={32} className="text-neutral-200" />
            <p className="text-sm text-neutral-400">
              {search ? "Nenhum projeto encontrado" : showArchived ? "Nenhum projeto arquivado" : "Nenhum projeto ainda"}
            </p>
            {!showArchived && !search && (
              <button
                onClick={() => setNewProjectOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-teal hover:underline"
              >
                <Plus size={12} /> Criar primeiro projeto
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Favorites section */}
            {favorites.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Star size={11} className="text-amber-400 fill-current" />
                  Favoritos
                </h2>
                <ProjectGrid
                  projects={favorites}
                  viewMode={viewMode}
                  onEdit={setEditProject}
                  onToggleFavorite={toggleFavorite}
                  onArchive={archiveProject}
                />
              </section>
            )}

            {/* Regular section */}
            {regular.length > 0 && (
              <section>
                {favorites.length > 0 && (
                  <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
                    Todos os projetos
                  </h2>
                )}
                <ProjectGrid
                  projects={regular}
                  viewMode={viewMode}
                  onEdit={setEditProject}
                  onToggleFavorite={toggleFavorite}
                  onArchive={archiveProject}
                />
              </section>
            )}
          </div>
        )}
      </div>

      {/* New project dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Novo projeto</DialogTitle>
          </DialogHeader>
          <ProjectForm onSuccess={() => setNewProjectOpen(false)} onCancel={() => setNewProjectOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={!!editProject} onOpenChange={() => setEditProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Editar projeto</DialogTitle>
          </DialogHeader>
          {editProject && (
            <ProjectForm
              project={editProject}
              onSuccess={() => setEditProject(null)}
              onCancel={() => setEditProject(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Project Grid / List ───────────────────────────────────────────────────────

function ProjectGrid({
  projects,
  viewMode,
  onEdit,
  onToggleFavorite,
  onArchive,
}: {
  projects: Project[];
  viewMode: ViewMode;
  onEdit: (p: Project) => void;
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  if (viewMode === "list") {
    return (
      <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden">
        {projects.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors group",
              i > 0 && "border-t border-neutral-50"
            )}
          >
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color ?? "#407EC9" }} />
            <div className="flex-1 min-w-0">
              <Link
                href={`/boards/${p.id}`}
                className="text-sm font-medium text-neutral-800 hover:text-brand-navy transition-colors"
              >
                {p.name}
              </Link>
              {p.description && (
                <p className="text-xs text-neutral-400 truncate mt-0.5">{p.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onToggleFavorite(p.id)}
                className={cn(
                  "w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-amber-400 transition-colors",
                  p.is_favorite && "text-amber-400"
                )}
              >
                <Star size={12} fill={p.is_favorite ? "currentColor" : "none"} />
              </button>
              <Link
                href={`/boards/${p.id}`}
                className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-teal transition-colors"
              >
                <ExternalLink size={12} />
              </Link>
              <button
                onClick={() => onEdit(p)}
                className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-brand-navy transition-colors"
              >
                <Settings size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {projects.map((p) => (
        <ProjectGridCard
          key={p.id}
          project={p}
          onEdit={onEdit}
          onToggleFavorite={onToggleFavorite}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}

function ProjectGridCard({
  project: p,
  onEdit,
  onToggleFavorite,
  onArchive,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative bg-white rounded-xl border border-neutral-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Color bar */}
      <div className="h-1.5" style={{ background: p.color ?? "#407EC9" }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href={`/boards/${p.id}`}
            className="flex-1 min-w-0"
          >
            <h3 className="text-sm font-semibold text-brand-navy hover:text-brand-teal transition-colors truncate">
              {p.name}
            </h3>
          </Link>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggleFavorite(p.id)}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded transition-colors",
                p.is_favorite
                  ? "text-amber-400"
                  : "text-neutral-200 hover:text-amber-400 opacity-0 group-hover:opacity-100"
              )}
            >
              <Star size={12} fill={p.is_favorite ? "currentColor" : "none"} />
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal size={13} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <Link
                    href={`/boards/${p.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Abrir quadro
                  </Link>
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(p); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                  >
                    <Settings size={12} />
                    Configurações
                  </button>
                  <hr className="border-neutral-100 my-0.5" />
                  <button
                    onClick={() => { setMenuOpen(false); onArchive(p.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 transition-colors text-left"
                  >
                    <Archive size={12} />
                    Arquivar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {p.description && (
          <p className="text-xs text-neutral-400 line-clamp-2 mb-3">{p.description}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-50">
          <span className="text-xs text-neutral-400">
            {new Date(p.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit", month: "short", year: "numeric",
            })}
          </span>
          <Link
            href={`/boards/${p.id}`}
            className="text-xs font-medium text-brand-teal hover:underline"
          >
            Abrir →
          </Link>
        </div>
      </div>
    </div>
  );
}
