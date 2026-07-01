"use client";

import { useProjects } from "../hooks/useProjects";

/** Invisible component that loads projects into the global store */
export function ProjectsBootstrap() {
  useProjects();
  return null;
}
