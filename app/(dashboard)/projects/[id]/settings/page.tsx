"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useProjectActions } from "@/features/projects/hooks/useProjects";
import { ArrowLeft, Archive, Loader2 } from "lucide-react";
import Link from "next/link";

const PRESET_COLORS = [
  "#00205B", "#01CFB5", "#407EC9", "#AC145A",
  "#3B3FB6", "#FFB81C", "#00EFC8", "#52575C",
];

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectSettingsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === projectId);
  const { updateProject, archiveProject } = useProjectActions();
  const router = useRouter();

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#00205B");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !project) return;
    setSaving(true);
    await updateProject(project.id, { name, description, color });
    setSaving(false);
  }

  async function handleArchive() {
    if (!project) return;
    if (!confirm(`Arquivar "${project.name}"? O projeto ficará oculto.`)) return;
    setArchiving(true);
    await archiveProject(project.id);
    router.push("/projects");
  }

  if (!project) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Configurações do projeto">
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-navy transition-colors px-2 py-1 rounded-md hover:bg-neutral-100"
        >
          <ArrowLeft size={13} />
          Voltar ao board
        </Link>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-8">
          <form onSubmit={handleSave} className="space-y-5">
            <h2 className="text-base font-semibold text-brand-navy">
              Informações gerais
            </h2>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="h-10 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
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
                    className={`w-7 h-7 rounded-lg transition-transform ${
                      color === c ? "scale-110 ring-2 ring-offset-2 ring-brand-navy" : "hover:scale-105"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="bg-brand-navy hover:bg-brand-navy-light"
            >
              {saving ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Salvando...</>
              ) : "Salvar alterações"}
            </Button>
          </form>

          <Separator />

          <div className="space-y-3">
            <h2 className="text-base font-semibold text-brand-navy">
              Zona de perigo
            </h2>
            <p className="text-sm text-neutral-500">
              Arquivar o projeto o remove da listagem principal. Pode ser
              desfeito posteriormente.
            </p>
            <Button
              variant="outline"
              onClick={handleArchive}
              disabled={archiving}
              className="border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              {archiving ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Arquivando...</>
              ) : (
                <><Archive size={14} className="mr-2" />Arquivar projeto</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
