"use client";

import { useState, useMemo, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/features/projects/store/projectStore";
import { useProjectActions } from "@/features/projects/hooks/useProjects";
import { useBoardStore } from "@/features/board/store/boardStore";
import { useBoardProjectStore } from "@/features/board/store/boardProjectStore";
import {
  ArrowLeft, Archive, Loader2, Settings, Tag, Users, Layers,
  LayoutList, Plus, Trash2, ChevronDown, Check, GripVertical, FolderKanban,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#00205B", "#01CFB5", "#407EC9", "#AC145A",
  "#3B3FB6", "#FFB81C", "#00EFC8", "#52575C",
];

const TYPE_COLORS = [
  "#407EC9", "#01CFB5", "#AC145A", "#FFB81C", "#3B3FB6", "#00205B", "#52575C",
];

type SettingsTab = "general" | "types" | "members" | "stages" | "fields" | "projects";

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "Geral", icon: Settings },
  { id: "types", label: "Tipos de tarefa", icon: Tag },
  { id: "members", label: "Membros", icon: Users },
  { id: "stages", label: "Req. por etapa", icon: Layers },
  { id: "fields", label: "Campos extras", icon: LayoutList },
  { id: "projects", label: "Projetos", icon: FolderKanban },
];

interface TaskType { id: string; name: string; color: string; default_hours: number }
interface Member { id: string; name: string; email: string; role: "admin" | "editor" | "viewer" }
interface StageReq { id: string; field: string; label: string }
interface CustomField { id: string; name: string; type: "text" | "number" | "date" | "select"; required: boolean }

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectSettingsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === projectId);
  const allColumns = useBoardStore((s) => s.columns);
  const columns = useMemo(() => allColumns.filter((c) => c.project_id === projectId), [allColumns, projectId]);
  const { updateProject, archiveProject } = useProjectActions();
  const router = useRouter();
  const boardProjectStore = useBoardProjectStore();
  useEffect(() => { boardProjectStore.load(projectId); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Board projects form state
  const [bpName, setBpName] = useState("");
  const [bpColor, setBpColor] = useState("#01CFB5");
  const [bpDesc, setBpDesc] = useState("");
  const [bpEditId, setBpEditId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#00205B");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Task types — persisted to localStorage
  const TYPES_KEY = `mwr_task_types_${projectId}`;
  const DEFAULT_TYPES: TaskType[] = [
    { id: "type-padrao",  name: "Padrão",  color: "#407EC9", default_hours: 2 },
    { id: "type-bug",     name: "Bug",     color: "#AC145A", default_hours: 1 },
    { id: "type-feature", name: "Feature", color: "#3B3FB6", default_hours: 4 },
    { id: "type-reuniao", name: "Reunião", color: "#01CFB5", default_hours: 1 },
  ];
  const [taskTypes, setTaskTypesRaw] = useState<TaskType[]>(() => {
    if (typeof window === "undefined") return DEFAULT_TYPES;
    try {
      const raw = localStorage.getItem(TYPES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const d = DEFAULT_TYPES;
    localStorage.setItem(TYPES_KEY, JSON.stringify(d));
    return d;
  });

  function setTaskTypes(fn: TaskType[] | ((prev: TaskType[]) => TaskType[])) {
    setTaskTypesRaw((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      if (typeof window !== "undefined") localStorage.setItem(TYPES_KEY, JSON.stringify(next));
      return next;
    });
  }

  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeHours, setNewTypeHours] = useState(2);
  const [newTypeColor, setNewTypeColor] = useState(TYPE_COLORS[0]);

  // Members
  const [members, setMembers] = useState<Member[]>([
    { id: "1", name: "Você (demo)", email: "demo@medwayrun.it", role: "admin" },
    { id: "2", name: "Ana Silva", email: "ana@medway.com.br", role: "editor" },
    { id: "3", name: "Bruno Costa", email: "bruno@medway.com.br", role: "viewer" },
  ]);
  const [inviteEmail, setInviteEmail] = useState("");

  // Stage requirements (per column)
  const [selectedColumn, setSelectedColumn] = useState<string>(columns[0]?.id ?? "");
  const [stageReqs, setStageReqs] = useState<Record<string, StageReq[]>>({});
  const [newReqLabel, setNewReqLabel] = useState("");

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([
    { id: "1", name: "Cliente", type: "text", required: false },
    { id: "2", name: "Sprint", type: "number", required: false },
  ]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomField["type"]>("text");

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
    router.push("/boards");
  }

  if (!project) return null;

  const currentReqs = stageReqs[selectedColumn] ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <Link
          href={`/boards/${projectId}`}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-navy transition-colors px-2 py-1 rounded-md hover:bg-neutral-100"
        >
          <ArrowLeft size={13} />
          Voltar ao quadro
        </Link>
        <div className="w-px h-4 bg-neutral-200" />
        <Settings size={14} className="text-brand-navy" />
        <span className="text-sm font-semibold text-brand-navy">
          Configurações — {project.name}
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left nav */}
        <nav className="w-44 shrink-0 border-r border-neutral-100 bg-white p-2 space-y-0.5">
          {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                activeTab === id
                  ? "bg-brand-navy/5 text-brand-navy font-medium"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-brand-navy"
              )}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg space-y-6">

            {/* GENERAL */}
            {activeTab === "general" && (
              <>
                <form onSubmit={handleSave} className="space-y-5">
                  <h2 className="text-base font-semibold text-brand-navy">Informações gerais</h2>

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
                          className={cn(
                            "w-7 h-7 rounded-lg transition-transform",
                            color === c ? "scale-110 ring-2 ring-offset-2 ring-brand-navy" : "hover:scale-105"
                          )}
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
                  <h2 className="text-base font-semibold text-brand-navy">Zona de perigo</h2>
                  <p className="text-sm text-neutral-500">
                    Arquivar o projeto o remove da listagem principal.
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
              </>
            )}

            {/* TASK TYPES */}
            {activeTab === "types" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-brand-navy">Tipos de tarefa</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Defina tipos com tempo estimado padrão para este quadro.
                  </p>
                </div>

                <div className="space-y-2">
                  {taskTypes.map((type) => (
                    <div key={type.id} className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 p-3">
                        <GripVertical size={14} className="text-neutral-300" />
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: type.color }} />
                        <span className="text-sm font-medium text-neutral-700 flex-1">{type.name}</span>
                        <span className="text-xs text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-full">
                          {type.default_hours}h estimadas
                        </span>
                        <button
                          onClick={() => setTaskTypes((prev) => prev.filter((t) => t.id !== type.id))}
                          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new type */}
                <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Novo tipo</p>
                  <div className="flex gap-2">
                    <input
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      placeholder="Nome do tipo"
                      className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                    />
                    <div className="flex items-center gap-1 border border-neutral-200 rounded-lg px-2 bg-white">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={newTypeHours}
                        onChange={(e) => setNewTypeHours(parseFloat(e.target.value) || 1)}
                        className="w-12 text-sm outline-none text-center"
                      />
                      <span className="text-xs text-neutral-400">h</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {TYPE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTypeColor(c)}
                        className={cn(
                          "w-5 h-5 rounded-full transition-transform",
                          newTypeColor === c ? "scale-125 ring-2 ring-offset-1 ring-neutral-400" : "hover:scale-110"
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <button
                    disabled={!newTypeName.trim()}
                    onClick={() => {
                      if (!newTypeName.trim()) return;
                      setTaskTypes((prev) => [
                        ...prev,
                        { id: Date.now().toString(), name: newTypeName.trim(), color: newTypeColor, default_hours: newTypeHours },
                      ]);
                      setNewTypeName("");
                      setNewTypeHours(2);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={11} />
                    Adicionar tipo
                  </button>
                </div>
              </div>
            )}

            {/* MEMBERS */}
            {activeTab === "members" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-brand-navy">Membros do quadro</h2>
                  <p className="text-sm text-neutral-400 mt-1">Gerencie quem tem acesso e com qual permissão.</p>
                </div>

                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center text-xs font-bold text-brand-navy shrink-0">
                        {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-700 truncate">{member.name}</p>
                        <p className="text-xs text-neutral-400 truncate">{member.email}</p>
                      </div>
                      <select
                        value={member.role}
                        onChange={(e) => setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, role: e.target.value as Member["role"] } : m))}
                        className="text-xs border border-neutral-200 rounded-lg px-2 py-1 outline-none focus:border-brand-teal bg-white"
                        disabled={member.id === "1"}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                      {member.id !== "1" && (
                        <button
                          onClick={() => setMembers((prev) => prev.filter((m) => m.id !== member.id))}
                          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Invite */}
                <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Convidar membro</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@empresa.com.br"
                      className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                    />
                    <button
                      disabled={!inviteEmail.includes("@")}
                      onClick={() => { alert(`Convite enviado para ${inviteEmail}! (modo demo)`); setInviteEmail(""); }}
                      className="px-4 py-2 text-xs font-semibold bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
                    >
                      Convidar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE REQUIREMENTS */}
            {activeTab === "stages" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-brand-navy">Requisitos por etapa</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Defina o que é obrigatório preencher para mover uma tarefa para cada etapa.
                  </p>
                </div>

                {/* Column selector */}
                <div className="flex gap-1.5 flex-wrap">
                  {columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => setSelectedColumn(col.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                        selectedColumn === col.id
                          ? "bg-brand-navy text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      )}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                        style={{ background: col.color ?? "#A0A4A8" }}
                      />
                      {col.name}
                    </button>
                  ))}
                  {columns.length === 0 && (
                    <p className="text-sm text-neutral-400">Nenhuma etapa encontrada. Abra o quadro primeiro.</p>
                  )}
                </div>

                {selectedColumn && (
                  <>
                    <div className="space-y-2">
                      {currentReqs.length === 0 ? (
                        <p className="text-sm text-neutral-400 py-2">Nenhum requisito definido para esta etapa.</p>
                      ) : (
                        currentReqs.map((req) => (
                          <div key={req.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 shadow-sm">
                            <Check size={13} className="text-brand-teal shrink-0" />
                            <span className="text-sm text-neutral-700 flex-1">{req.label}</span>
                            <button
                              onClick={() => setStageReqs((prev) => ({
                                ...prev,
                                [selectedColumn]: (prev[selectedColumn] ?? []).filter((r) => r.id !== req.id),
                              }))}
                              className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={newReqLabel}
                        onChange={(e) => setNewReqLabel(e.target.value)}
                        placeholder="Ex: Data de entrega definida"
                        className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newReqLabel.trim()) {
                            e.preventDefault();
                            setStageReqs((prev) => ({
                              ...prev,
                              [selectedColumn]: [
                                ...(prev[selectedColumn] ?? []),
                                { id: Date.now().toString(), field: "custom", label: newReqLabel.trim() },
                              ],
                            }));
                            setNewReqLabel("");
                          }
                        }}
                      />
                      <button
                        disabled={!newReqLabel.trim()}
                        onClick={() => {
                          if (!newReqLabel.trim()) return;
                          setStageReqs((prev) => ({
                            ...prev,
                            [selectedColumn]: [
                              ...(prev[selectedColumn] ?? []),
                              { id: Date.now().toString(), field: "custom", label: newReqLabel.trim() },
                            ],
                          }));
                          setNewReqLabel("");
                        }}
                        className="px-3 py-2 text-xs font-semibold bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CUSTOM FIELDS */}
            {activeTab === "fields" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-brand-navy">Campos customizados</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Adicione campos extras específicos deste quadro.
                  </p>
                </div>

                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div key={field.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 shadow-sm">
                      <GripVertical size={14} className="text-neutral-300" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-700">{field.name}</p>
                        <p className="text-xs text-neutral-400">
                          Tipo: {field.type === "text" ? "Texto" : field.type === "number" ? "Número" : field.type === "date" ? "Data" : "Seleção"}
                          {field.required && " · Obrigatório"}
                        </p>
                      </div>
                      <button
                        onClick={() => setCustomFields((prev) => prev.filter((f) => f.id !== field.id))}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Novo campo</p>
                  <div className="flex gap-2">
                    <input
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Nome do campo"
                      className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                    />
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as CustomField["type"])}
                      className="text-sm border border-neutral-200 rounded-lg px-2 py-2 outline-none focus:border-brand-teal bg-white"
                    >
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="date">Data</option>
                      <option value="select">Seleção</option>
                    </select>
                  </div>
                  <button
                    disabled={!newFieldName.trim()}
                    onClick={() => {
                      if (!newFieldName.trim()) return;
                      setCustomFields((prev) => [
                        ...prev,
                        { id: Date.now().toString(), name: newFieldName.trim(), type: newFieldType, required: false },
                      ]);
                      setNewFieldName("");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={11} />
                    Adicionar campo
                  </button>
                </div>
              </div>
            )}

            {/* PROJECTS */}
            {activeTab === "projects" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-brand-navy">Projetos internos</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Agrupe tarefas deste quadro em projetos para organizar e filtrar.
                  </p>
                </div>

                {/* List */}
                {boardProjectStore.projects.length > 0 ? (
                  <div className="space-y-2">
                    {boardProjectStore.projects.map((bp) => (
                      bpEditId === bp.id ? (
                        <div key={bp.id} className="p-3 bg-neutral-50 rounded-xl border border-brand-teal/30 space-y-2">
                          <input
                            value={bpName}
                            onChange={(e) => setBpName(e.target.value)}
                            placeholder="Nome do projeto"
                            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal bg-white"
                          />
                          <input
                            value={bpDesc}
                            onChange={(e) => setBpDesc(e.target.value)}
                            placeholder="Descrição (opcional)"
                            className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-teal bg-white"
                          />
                          <div className="flex gap-1.5 flex-wrap">
                            {PRESET_COLORS.map((c) => (
                              <button key={c} type="button" onClick={() => setBpColor(c)}
                                className={cn("w-5 h-5 rounded-full transition-transform", bpColor === c ? "scale-125 ring-2 ring-offset-1 ring-neutral-400" : "hover:scale-110")}
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={!bpName.trim()}
                              onClick={() => {
                                if (!bpName.trim()) return;
                                boardProjectStore.update(bp.id, { name: bpName.trim(), color: bpColor, description: bpDesc || undefined });
                                setBpEditId(null); setBpName(""); setBpDesc(""); setBpColor("#01CFB5");
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90 disabled:opacity-40"
                            >Salvar</button>
                            <button onClick={() => { setBpEditId(null); setBpName(""); setBpDesc(""); }} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div key={bp.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100 shadow-sm group">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: bp.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-700">{bp.name}</p>
                            {bp.description && <p className="text-xs text-neutral-400 truncate">{bp.description}</p>}
                          </div>
                          <button
                            onClick={() => { setBpEditId(bp.id); setBpName(bp.name); setBpColor(bp.color); setBpDesc(bp.description ?? ""); }}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-neutral-400 hover:text-brand-navy hover:bg-neutral-100 transition-colors"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Excluir "${bp.name}"?`)) boardProjectStore.delete(bp.id); }}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-neutral-300 hover:text-destructive hover:bg-destructive/5 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 py-2">Nenhum projeto criado ainda.</p>
                )}

                {/* Add form */}
                {bpEditId === null && (
                  <div className="bg-neutral-50 rounded-xl p-4 space-y-3 border border-neutral-100">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Novo projeto</p>
                    <input
                      value={bpName}
                      onChange={(e) => setBpName(e.target.value)}
                      placeholder="Nome do projeto"
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                    />
                    <input
                      value={bpDesc}
                      onChange={(e) => setBpDesc(e.target.value)}
                      placeholder="Descrição (opcional)"
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal bg-white"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setBpColor(c)}
                          className={cn("w-5 h-5 rounded-full transition-transform", bpColor === c ? "scale-125 ring-2 ring-offset-1 ring-neutral-400" : "hover:scale-110")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <button
                      disabled={!bpName.trim()}
                      onClick={() => {
                        if (!bpName.trim()) return;
                        boardProjectStore.create(projectId, bpName.trim(), bpColor, bpDesc || undefined);
                        setBpName(""); setBpDesc(""); setBpColor("#01CFB5");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-40 transition-colors"
                    >
                      <Plus size={11} /> Adicionar projeto
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
