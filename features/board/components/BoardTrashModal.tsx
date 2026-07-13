"use client";

import { useEffect, useState } from "react";
import { X, Trash2, RotateCcw, Clock } from "lucide-react";
import { taskService } from "@/features/tasks/services/taskService";
import { formatDate } from "@/lib/utils";
import type { TaskWithRelations } from "@/types";

/**
 * Lixeira do quadro: tarefas apagadas (soft delete) nos últimos 7 dias.
 * Qualquer pessoa com acesso ao quadro pode restaurar ou excluir de vez.
 */
export function BoardTrashModal({
  boardId,
  open,
  onClose,
  onChanged,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    taskService.listDeleted(boardId).then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [open, boardId]);

  async function restore(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await taskService.restore(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  async function purge(id: string, title: string) {
    if (busyId) return;
    if (!confirm(`Excluir "${title}" PERMANENTEMENTE? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    try {
      await taskService.purge(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 shrink-0">
          <Trash2 size={16} className="text-neutral-400" />
          <h3 className="text-sm font-semibold text-brand-navy flex-1">Lixeira do quadro</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={16} /></button>
        </div>
        <p className="px-5 pt-2.5 text-[11px] text-neutral-400">
          Tarefas apagadas nos últimos 7 dias. Depois disso são removidas de vez.
        </p>

        <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-1.5">
          {loading && <p className="text-sm text-neutral-400 py-8 text-center">Carregando...</p>}
          {!loading && items.length === 0 && (
            <div className="text-center py-12 text-neutral-400">
              <Trash2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">A lixeira está vazia.</p>
            </div>
          )}
          {!loading && items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-white px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-700 truncate">{t.title}</p>
                <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                  <Clock size={10} /> Apagada {formatDate((t as any).deleted_at)}
                </p>
              </div>
              <button
                onClick={() => restore(t.id)}
                disabled={busyId === t.id}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-brand-teal/40 text-brand-teal font-medium hover:bg-brand-teal/5 disabled:opacity-50 shrink-0"
              >
                <RotateCcw size={12} /> Restaurar
              </button>
              <button
                onClick={() => purge(t.id, t.title)}
                disabled={busyId === t.id}
                title="Excluir permanentemente"
                className="text-neutral-300 hover:text-destructive disabled:opacity-50 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
