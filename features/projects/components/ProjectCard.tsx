"use client";

import Link from "next/link";
import { Star, MoreHorizontal, Archive, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectActions } from "../hooks/useProjects";
import { useFavoriteStore } from "../store/favoriteStore";
import { useEffect } from "react";

interface Props {
  project: Project;
  onEdit: (project: Project) => void;
}

export function ProjectCard({ project, onEdit }: Props) {
  const { archiveProject } = useProjectActions();
  const isFavorite = useFavoriteStore((s) => s.ids.includes(project.id));
  const toggleFavorite = useFavoriteStore((s) => s.toggle);
  const loadFavorites = useFavoriteStore((s) => s.load);
  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  return (
    <div className="group relative bg-white rounded-xl border border-neutral-100 shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden">
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ background: project.color }} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <Link
            href={`/projects/${project.id}`}
            className="flex-1 min-w-0 group/link"
          >
            <h3 className="font-semibold text-brand-navy group-hover/link:text-brand-teal transition-colors truncate">
              {project.name}
            </h3>
          </Link>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => toggleFavorite(project.id)}
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                isFavorite
                  ? "text-brand-yellow"
                  : "text-neutral-300 hover:text-brand-yellow opacity-0 group-hover:opacity-100"
              )}
            >
              <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100">
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(project)}>
                  <Pencil size={13} className="mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => archiveProject(project.id)}
                  className="text-neutral-500"
                >
                  <Archive size={13} className="mr-2" />
                  Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-neutral-500 line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center text-xs font-medium text-brand-teal hover:text-brand-teal-dark transition-colors"
        >
          Abrir projeto →
        </Link>
      </div>
    </div>
  );
}
