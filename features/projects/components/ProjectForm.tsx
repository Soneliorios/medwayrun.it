"use client";

import { useState } from "react";
import { useProjectActions } from "../hooks/useProjects";
import { projectService } from "../services/projectService";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { Project } from "@/types";

const PRESET_COLORS = [
  "#00205B", "#01CFB5", "#407EC9", "#AC145A",
  "#3B3FB6", "#FFB81C", "#00EFC8", "#52575C",
];

interface Props {
  project?: Project;
  onSuccess?: (project: Project) => void;
  onCancel?: () => void;
}

export function ProjectForm({ project, onSuccess, onCancel }: Props) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#00205B");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createProject, updateProject } = useProjectActions();
  const store = useProjectStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);

    try {
      if (project) {
        await updateProject(project.id, { name: name.trim(), description: description.trim() || undefined, color });
        const updated = store.projects.find((p) => p.id === project.id);
        onSuccess?.(updated ?? project);
      } else {
        const newProject = await createProject({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        });
        onSuccess?.(newProject);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar projeto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="proj-name" className="text-sm font-medium">Nome</Label>
        <Input
          id="proj-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do projeto"
          required
          maxLength={80}
          className="h-10 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proj-desc" className="text-sm font-medium">
          Descrição <span className="text-neutral-400 font-normal">(opcional)</span>
        </Label>
        <Textarea
          id="proj-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o objetivo do projeto..."
          rows={3}
          maxLength={300}
          className="resize-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Cor</Label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-lg transition-transform ${color === c ? "scale-110 ring-2 ring-offset-2 ring-brand-navy" : "hover:scale-105"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading || !name.trim()}
          className="flex-1 bg-brand-navy hover:bg-brand-navy-light"
        >
          {loading ? (
            <><Loader2 size={14} className="mr-2 animate-spin" /> Salvando...</>
          ) : project ? (
            "Salvar alterações"
          ) : (
            "Criar projeto"
          )}
        </Button>
      </div>
    </form>
  );
}
