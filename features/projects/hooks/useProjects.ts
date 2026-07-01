"use client";

import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { projectService } from "../services/projectService";

export function useProjects() {
  const { projects, setProjects } = useProjectStore();

  useEffect(() => {
    if (projects.length > 0) return; // already loaded
    projectService.list().then(setProjects).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return projects;
}

export function useProjectActions() {
  const store = useProjectStore();

  async function createProject(data: {
    name: string;
    description?: string;
    color: string;
  }) {
    const project = await projectService.create(data);
    store.addProject(project);
    return project;
  }

  async function updateProject(id: string, updates: { name?: string; description?: string; color?: string }) {
    store.updateProject(id, updates); // optimistic
    await projectService.update(id, updates).catch(() => {
      // revert on error — reload list
      projectService.list().then(store.setProjects);
    });
  }

  async function archiveProject(id: string) {
    store.removeProject(id); // optimistic
    await projectService.archive(id).catch(() => {
      projectService.list().then(store.setProjects);
    });
  }

  async function toggleFavorite(id: string) {
    const project = store.projects.find((p) => p.id === id);
    if (!project) return;
    store.toggleFavorite(id); // optimistic
    await projectService.toggleFavorite(id, project.is_favorite).catch(() => {
      store.toggleFavorite(id); // revert
    });
  }

  return { createProject, updateProject, archiveProject, toggleFavorite };
}
