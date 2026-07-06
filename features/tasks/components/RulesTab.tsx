"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Search, AlertCircle, CheckCircle2, ArrowRight, Layers } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { createRawClient } from "@/lib/supabase/client";
import { useOrgMembers } from "@/lib/useOrgMembers";
import { useBoardStore } from "@/features/board/store/boardStore";

interface MockTaskSequence {
  id: string; task_id: string; user_id: string; name: string;
  order_position: number; status: "pending" | "active" | "done";
}
interface MockTaskDependency {
  id: string; task_id: string; dependency_task_id: string;
  dependency_task_title: string | null; dependency_board_id: string | null;
  dependency_board_name: string | null; type: "prerequisite" | "subsequent";
}

interface AvailableTask {
  id: string;
  title: string;
  status: string;
  columnName: string;
  boardId: string | null;
  boardName: string | null;
}

interface Props {
  taskId: string;
}

export function RulesTab({ taskId }: Props) {
  const columns = useBoardStore((s) => s.columns);

  // Current-board tasks
  const boardTasks: AvailableTask[] = useMemo(
    () =>
      columns.flatMap((c) =>
        c.tasks
          .filter((t) => t.id !== taskId)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: (t as any).status ?? "open",
            columnName: c.name,
            boardId: null,
            boardName: null,
          }))
      ),
    [columns, taskId]
  );

  // All-boards tasks (cross-board search pending — fall back to current board)
  const allBoardTasks: AvailableTask[] = useMemo(() => boardTasks, [boardTasks]);

  const orgMembers = useOrgMembers();
  const [sequence, setSequence] = useState<MockTaskSequence[]>([]);
  const [deps, setDeps] = useState<MockTaskDependency[]>([]);

  const titleOf = (id: string) => columns.flatMap((c) => c.tasks).find((t) => t.id === id)?.title ?? "Tarefa";

  async function reload() {
    const sb = createRawClient();
    const [{ data: depRows }, { data: seqRows }] = await Promise.all([
      (sb as any).from("task_dependencies").select("task_id, depends_on_task_id, dependency_type").eq("task_id", taskId),
      (sb as any).from("task_sequences").select("*").eq("task_id", taskId).order("order_position"),
    ]);
    setDeps(((depRows ?? []) as any[]).map((d) => ({
      id: `${d.depends_on_task_id}:${d.dependency_type}`,
      task_id: d.task_id,
      dependency_task_id: d.depends_on_task_id,
      dependency_task_title: titleOf(d.depends_on_task_id),
      dependency_board_id: null,
      dependency_board_name: null,
      type: d.dependency_type,
    })));
    setSequence(((seqRows ?? []) as any[]).map((s) => ({
      id: s.id, task_id: s.task_id, user_id: s.user_id,
      name: orgMembers.find((m) => m.id === s.user_id)?.full_name ?? s.user_id.slice(0, 8),
      order_position: s.order_position, status: s.status,
    })));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, orgMembers]);

  const prerequisites = deps.filter((d) => d.type === "prerequisite");
  const subsequents = deps.filter((d) => d.type === "subsequent");

  // ── Sequence handlers ──────────────────────────────────────────────────────
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [seqSearch, setSeqSearch] = useState("");

  async function addToSequence(member: { id: string; name: string }) {
    setMemberPickerOpen(false);
    const sb = createRawClient();
    const nextPos = sequence.length > 0 ? Math.max(...sequence.map((s) => s.order_position)) + 1 : 0;
    const { error } = await (sb as any).from("task_sequences").insert({ task_id: taskId, user_id: member.id, order_position: nextPos, status: "pending" });
    if (error) { console.error("[sequence] add error:", error); return; }
    reload();
  }
  async function removeFromSequence(id: string) {
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_sequences").delete().eq("id", id);
    if (error) { console.error("[sequence] remove error:", error); return; }
    setSequence((prev) => prev.filter((s) => s.id !== id));
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  async function handleDrop(targetIndex: number) {
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === targetIndex) return;
    const reordered = [...sequence];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIndex, 0, moved);
    setSequence(reordered.map((s, i) => ({ ...s, order_position: i })));
    const sb = createRawClient();
    await Promise.all(reordered.map((s, i) => (sb as any).from("task_sequences").update({ order_position: i }).eq("id", s.id)));
  }

  // ── Dependency handlers ────────────────────────────────────────────────────
  async function addDependency(task: AvailableTask, type: "prerequisite" | "subsequent") {
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_dependencies").insert({ task_id: taskId, depends_on_task_id: task.id, dependency_type: type });
    if (error) { console.error("[deps] add error:", error); return; }
    setDeps((prev) => [...prev, {
      id: `${task.id}:${type}`, task_id: taskId, dependency_task_id: task.id,
      dependency_task_title: task.title, dependency_board_id: null, dependency_board_name: null, type,
    }]);
  }
  async function removeDependency(id: string) {
    const [depId, type] = id.split(":");
    const sb = createRawClient();
    const { error } = await (sb as any).from("task_dependencies").delete()
      .eq("task_id", taskId).eq("depends_on_task_id", depId).eq("dependency_type", type);
    if (error) { console.error("[deps] remove error:", error); return; }
    setDeps((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* ── Sequência de responsáveis ──────────────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Sequência de responsáveis
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            Ao entregar uma parte, a tarefa passa automaticamente para o próximo responsável da fila.
          </p>
        </div>

        <div className="space-y-1.5">
          {sequence.length === 0 && (
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 text-center">
              <p className="text-xs text-neutral-400">Nenhum responsável na sequência.</p>
            </div>
          )}
          {sequence.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md border bg-white group transition-colors",
                s.status === "active" ? "border-brand-teal/40 bg-brand-teal/5" : "border-neutral-100",
                dragIndex === i && "opacity-50"
              )}
            >
              <GripVertical size={13} className="text-neutral-300 cursor-grab shrink-0" />
              <span className="w-5 h-5 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <Avatar className="w-5 h-5 shrink-0">
                <AvatarFallback className="text-[8px] bg-brand-teal/20 text-brand-teal">
                  {getInitials(s.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-neutral-600 flex-1 truncate">{s.name}</span>
              {s.status === "active" && (
                <span className="text-[9px] text-brand-teal font-semibold uppercase">Atual</span>
              )}
              {s.status === "done" && (
                <CheckCircle2 size={12} className="text-green-500 shrink-0" />
              )}
              <button
                onClick={() => removeFromSequence(s.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-300 hover:text-destructive transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>

        {memberPickerOpen ? (
          <div className="rounded-lg border border-brand-teal/30 bg-white p-2 space-y-0.5">
            <div className="relative mb-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input autoFocus value={seqSearch} onChange={(e) => setSeqSearch(e.target.value)}
                placeholder="Buscar membro..." className="w-full text-xs border border-neutral-200 rounded pl-6 pr-2 py-1 outline-none focus:border-brand-teal" />
            </div>
            {orgMembers
              .map((m) => ({ id: m.id, name: m.full_name }))
              .filter((m) => !sequence.some((s) => s.user_id === m.id))
              .filter((m) => m.name.toLowerCase().includes(seqSearch.toLowerCase()))
              .map((m) => (
              <button
                key={m.id}
                onClick={() => addToSequence(m)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 transition-colors text-left"
              >
                <Avatar className="w-5 h-5">
                  <AvatarFallback className="text-[8px] bg-brand-navy/10 text-brand-navy">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-neutral-600">{m.name}</span>
              </button>
            ))}
            <button
              onClick={() => setMemberPickerOpen(false)}
              className="w-full text-[11px] text-neutral-400 hover:text-neutral-600 py-1"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setMemberPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark"
          >
            <Plus size={12} /> Adicionar responsável à sequência
          </button>
        )}
      </section>

      <Separator />

      {/* ── Pré-requisitos ─────────────────────────────────────────────────── */}
      <DependencySection
        title="Tarefas pré-requisito"
        description="Devem ser entregues antes desta tarefa poder ser iniciada/entregue."
        deps={prerequisites}
        boardTasks={boardTasks}
        allBoardTasks={allBoardTasks}
        excludeIds={deps.map((d) => d.dependency_task_id)}
        onAdd={(t) => addDependency(t, "prerequisite")}
        onRemove={removeDependency}
        emptyText="Nenhuma tarefa pré-requisito."
        addLabel="Buscar tarefa pré-requisito"
      />

      <Separator />

      {/* ── Subsequentes ───────────────────────────────────────────────────── */}
      <DependencySection
        title="Tarefas subsequentes"
        description="Serão desbloqueadas/notificadas quando esta tarefa for entregue."
        deps={subsequents}
        boardTasks={boardTasks}
        allBoardTasks={allBoardTasks}
        excludeIds={deps.map((d) => d.dependency_task_id)}
        onAdd={(t) => addDependency(t, "subsequent")}
        onRemove={removeDependency}
        emptyText="Nenhuma tarefa subsequente."
        addLabel="Buscar tarefa subsequente"
      />
    </div>
  );
}

// ── Dependency section ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  delivered: "Entregue",
  archived: "Arquivada",
};

function DependencySection({
  title,
  description,
  deps,
  boardTasks,
  allBoardTasks,
  excludeIds,
  onAdd,
  onRemove,
  emptyText,
  addLabel,
}: {
  title: string;
  description: string;
  deps: MockTaskDependency[];
  boardTasks: AvailableTask[];
  allBoardTasks: AvailableTask[];
  excludeIds: string[];
  onAdd: (task: AvailableTask) => void;
  onRemove: (id: string) => void;
  emptyText: string;
  addLabel: string;
}) {
  const [searching, setSearching] = useState(false);
  const [scope, setScope] = useState<"board" | "all">("board");
  const [query, setQuery] = useState("");

  const pool = scope === "all" ? allBoardTasks : boardTasks;

  const results = useMemo(() => {
    const filtered = pool.filter((t) => !excludeIds.includes(t.id));
    if (!query) return filtered.slice(0, 8);
    return filtered
      .filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.id.toLowerCase().startsWith(query.toLowerCase().replace(/#/g, ""))
      )
      .slice(0, 8);
  }, [pool, excludeIds, query]);

  // Resolve linked task metadata — fall back to stored title/board
  function resolveTask(d: MockTaskDependency): { title: string; boardName: string | null; status: string | null } {
    return {
      title: d.dependency_task_title ?? "Tarefa removida",
      boardName: d.dependency_board_name ?? null,
      status: null,
    };
  }

  return (
    <section className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
        <p className="text-xs text-neutral-400 mt-0.5">{description}</p>
      </div>

      {deps.length === 0 ? (
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 text-center">
          <p className="text-xs text-neutral-400">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {deps.map((d) => {
            const { title: depTitle, boardName, status } = resolveTask(d);
            const done = status === "delivered";
            const isCrossBoard = !!d.dependency_board_id;
            return (
              <div
                key={d.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border bg-white group",
                  isCrossBoard ? "border-violet-100 bg-violet-50/30" : "border-neutral-100"
                )}
              >
                {done ? (
                  <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                ) : (
                  <AlertCircle size={13} className="text-amber-400 shrink-0" />
                )}
                <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                  #{d.dependency_task_id.slice(0, 6).toUpperCase()}
                </span>
                <span className="text-xs text-neutral-700 flex-1 truncate">{depTitle}</span>
                {isCrossBoard && boardName && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0">
                    <Layers size={9} />
                    {boardName}
                  </span>
                )}
                {!isCrossBoard && status && (
                  <span className="text-[10px] text-neutral-400 shrink-0 hidden sm:inline">
                    {STATUS_LABELS[status] ?? status}
                  </span>
                )}
                <button
                  onClick={() => onRemove(d.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-300 hover:text-destructive transition-all shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {searching ? (
        <div className="rounded-lg border border-brand-teal/30 bg-white p-2 space-y-1.5">
          {/* Scope toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-md w-fit">
            <button
              onClick={() => { setScope("board"); setQuery(""); }}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded transition-colors",
                scope === "board" ? "bg-white text-brand-navy font-medium shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              )}
            >
              Este quadro
            </button>
            <button
              onClick={() => { setScope("all"); setQuery(""); }}
              className={cn(
                "flex items-center gap-1 text-[11px] px-2.5 py-1 rounded transition-colors",
                scope === "all" ? "bg-white text-violet-700 font-medium shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              )}
            >
              <Layers size={10} /> Todos os quadros
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={scope === "all" ? "Buscar por título ou ID..." : "Buscar tarefa por título..."}
              className="w-full text-xs border border-neutral-200 rounded pl-7 pr-2 py-1.5 outline-none focus:border-brand-teal"
            />
          </div>

          {/* Results */}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {results.map((t) => (
              <button
                key={t.id}
                onClick={() => { onAdd(t); setQuery(""); setSearching(false); setScope("board"); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 transition-colors text-left"
              >
                <ArrowRight size={11} className="text-neutral-300 shrink-0" />
                <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                  #{t.id.slice(0, 6).toUpperCase()}
                </span>
                <span className="text-xs text-neutral-600 flex-1 truncate">{t.title}</span>
                {t.boardName && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0">
                    <Layers size={9} />
                    {t.boardName}
                  </span>
                )}
                {!t.boardName && t.columnName && (
                  <span className="text-[10px] text-neutral-400 shrink-0">{t.columnName}</span>
                )}
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-[11px] text-neutral-300 px-2 py-1.5">
                {query ? "Nenhuma tarefa encontrada." : "Nenhuma tarefa disponível."}
              </p>
            )}
          </div>

          <button
            onClick={() => { setSearching(false); setQuery(""); setScope("board"); }}
            className="w-full text-[11px] text-neutral-400 hover:text-neutral-600 py-0.5"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSearching(true)}
          className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal-dark"
        >
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </section>
  );
}
