"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  CheckCheck,
  ArrowRight,
  Users,
  Tag,
  Layers,
  Trash2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useSelectionStore } from "../store/selectionStore";
import { useBoardStore } from "../store/boardStore";
import { createRawClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function BatchActionBar() {
  const { selectedIds, clearSelection } = useSelectionStore();
  const store = useBoardStore();
  const count = selectedIds.size;
  const [loading, setLoading] = useState<string | null>(null);
  const [moveColumnOpen, setMoveColumnOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveColumnOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleDeliver() {
    if (!confirm(`Marcar ${count} tarefa(s) como entregue?`)) return;
    setLoading("deliver");
    try {
      const supabase = createRawClient();
      const ids = [...selectedIds];
      const { error } = await supabase
        .from("tasks")
        .update({ status: "delivered" } as any)
        .in("id", ids);
      if (error) { console.error("[BatchActionBar.deliver] error:", error); return; }
      ids.forEach((id) =>
        store.updateTask(id, { status: "delivered" } as any)
      );
      clearSelection();
    } finally {
      setLoading(null);
    }
  }

  async function handleMoveToColumn(columnId: string) {
    setMoveColumnOpen(false);
    setLoading("move");
    try {
      const supabase = createRawClient();
      const ids = [...selectedIds];
      const { error } = await supabase
        .from("tasks")
        .update({ column_id: columnId } as any)
        .in("id", ids);
      if (error) { console.error("[BatchActionBar.move] error:", error); return; }
      ids.forEach((id, i) => {
        const task = store.columns.flatMap((c) => c.tasks).find((t) => t.id === id);
        if (task) {
          store.moveTask(id, columnId, (i + 1) * 1000);
        }
      });
      clearSelection();
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir ${count} tarefa(s)? Esta ação não pode ser desfeita.`)) return;
    setLoading("delete");
    try {
      const supabase = createRawClient();
      const ids = [...selectedIds];
      const { error } = await supabase.from("tasks").delete().in("id", ids);
      if (error) { console.error("[BatchActionBar.delete] error:", error); return; }
      ids.forEach((id) => store.removeTask(id));
      clearSelection();
    } finally {
      setLoading(null);
    }
  }

  const isLoading = (key: string) => loading === key;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 px-6 h-14 bg-brand-navy text-white shadow-2xl border-t border-white/10">
      {/* Count badge */}
      <div className="flex items-center gap-1.5 mr-3 shrink-0">
        <span className="w-6 h-6 rounded-full bg-brand-teal text-white text-xs font-bold flex items-center justify-center">
          {count}
        </span>
        <span className="text-sm font-medium text-white/90">
          {count === 1 ? "tarefa selecionada" : "tarefas selecionadas"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Entregar */}
        <BatchBtn
          icon={
            isLoading("deliver") ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCheck size={13} />
            )
          }
          label="Entregar"
          onClick={handleDeliver}
          disabled={!!loading}
        />

        {/* Alterar etapa */}
        <div ref={moveRef} className="relative">
          <BatchBtn
            icon={
              isLoading("move") ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ArrowRight size={13} />
              )
            }
            label="Alterar etapa"
            onClick={() => setMoveColumnOpen((v) => !v)}
            disabled={!!loading}
            chevron
          />
          {moveColumnOpen && (
            <div className="absolute bottom-full mb-1 left-0 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 py-1 z-10 max-h-52 overflow-y-auto">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide px-3 py-1">
                Mover para etapa
              </p>
              {store.columns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => handleMoveToColumn(col.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-50 hover:text-brand-navy transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: col.color ?? "#A0A4A8" }}
                  />
                  <span className="truncate">{col.name}</span>
                  <span className="ml-auto text-xs text-neutral-400">
                    {col.tasks.length}
                  </span>
                </button>
              ))}
              {store.columns.length === 0 && (
                <p className="px-3 py-2 text-xs text-neutral-400">
                  Nenhuma coluna disponível
                </p>
              )}
            </div>
          )}
        </div>

        {/* Alocados (placeholder — would open assignee multi-select) */}
        <BatchBtn
          icon={<Users size={13} />}
          label="Alocados"
          onClick={() => {}}
          disabled={!!loading}
          title="Em breve"
        />

        {/* Tags (placeholder) */}
        <BatchBtn
          icon={<Tag size={13} />}
          label="Tags"
          onClick={() => {}}
          disabled={!!loading}
          title="Em breve"
        />

        {/* Tipo (placeholder) */}
        <BatchBtn
          icon={<Layers size={13} />}
          label="Tipo"
          onClick={() => {}}
          disabled={!!loading}
          title="Em breve"
        />
      </div>

      <div className="flex-1" />

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={!!loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
      >
        {isLoading("delete") ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Trash2 size={13} />
        )}
        <span className="hidden sm:inline">Apagar</span>
      </button>

      {/* Dismiss */}
      <button
        onClick={clearSelection}
        className="w-8 h-8 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        title="Descartar seleção"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function BatchBtn({
  icon,
  label,
  onClick,
  disabled,
  chevron,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  chevron?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {chevron && <ChevronDown size={10} className="opacity-60" />}
    </button>
  );
}
