"use client";

import { useState } from "react";
import { taskService } from "../services/taskService";
import { useBoardStore } from "@/features/board/store/boardStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PRIORITY_LABELS } from "@/types";
import type { TaskWithRelations } from "@/types";

interface Props {
  projectId: string;
  columnId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TaskForm({ projectId, columnId, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskWithRelations["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const store = useBoardStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setLoading(true);

    // Calculate position (end of column)
    const column = store.columns.find((c) => c.id === columnId);
    const lastPosition = column?.tasks.length
      ? column.tasks[column.tasks.length - 1].position + 1000
      : 1000;

    try {
      const task = await taskService.create({
        project_id: projectId,
        column_id: columnId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_date: dueDate || undefined,
        position: lastPosition,
      });

      // Optimistic add to store
      store.addTask(columnId, task);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tarefa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-title" className="text-sm font-medium">Título</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Descreva a tarefa..."
          required
          autoFocus
          maxLength={200}
          className="h-10 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-desc" className="text-sm font-medium">
          Descrição <span className="text-neutral-400 font-normal">(opcional)</span>
        </Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhes adicionais..."
          rows={3}
          className="resize-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Prioridade</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as TaskWithRelations["priority"])}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-due" className="text-sm font-medium">
            Data limite
          </Label>
          <Input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-10 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading || !title.trim()}
          className="flex-1 bg-brand-navy hover:bg-brand-navy-light"
        >
          {loading ? (
            <><Loader2 size={14} className="mr-2 animate-spin" /> Criando...</>
          ) : (
            "Criar tarefa"
          )}
        </Button>
      </div>
    </form>
  );
}
