"use client";

import { useProjects } from "../hooks/useProjects";
import { useOrgMembers } from "@/lib/useOrgMembers";

/** Invisible component that loads projects + the org roster into global stores */
export function ProjectsBootstrap() {
  useProjects();
  // Esquenta o cache do roster já na entrada do dashboard, para que pickers de
  // usuário e "Criado por" apareçam instantâneos ao abrir tarefas/quadros.
  useOrgMembers();
  return null;
}
