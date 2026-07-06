"use client";

import { useMemo, useState } from "react";
import { X, ChevronDown, ChevronRight, Search, Bookmark, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFilterStore,
  useActiveFilterCount,
  FILTER_KEY_LABELS,
  type BoardFilters,
} from "../store/filterStore";
import type { BoardFilterOptions, FilterOption } from "@/lib/filterUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onClose: () => void;
  boardId: string;
  options: BoardFilterOptions & {
    clients?: FilterOption[];
    projects?: FilterOption[];
    teams?: FilterOption[];
    boardProjects?: FilterOption[];
  };
}

// Which advanced filters are multi-select option lists.
const MULTI_ROWS: { key: keyof BoardFilters; optionKey: keyof Props["options"] }[] = [
  { key: "boardProjectIds", optionKey: "boardProjects" },
  { key: "clients", optionKey: "clients" },
  { key: "projects", optionKey: "projects" },
  { key: "teams", optionKey: "teams" },
  { key: "types", optionKey: "types" },
  { key: "tags", optionKey: "tags" },
  { key: "stages", optionKey: "stages" },
  { key: "assignees", optionKey: "assignees" },
  { key: "createdBy", optionKey: "creators" },
  { key: "followers", optionKey: "assignees" },
  { key: "areaRequesting", optionKey: "areas" },
  { key: "areaRequested", optionKey: "areas" },
];

export function FilterSidebar({ onClose, boardId, options }: Props) {
  const {
    filters,
    setFilter,
    removeFilter,
    clearFilters,
    savedFilters,
    activeSavedId,
    saveCurrentFilter,
    deleteSavedFilter,
    applySavedFilter,
  } = useFilterStore();
  const activeCount = useActiveFilterCount();
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [savingName, setSavingName] = useState<string | null>(null);

  // Build a value→label resolver across all option lists.
  const labelFor = useMemo(() => {
    const map = new Map<string, string>();
    const lists: (FilterOption[] | undefined)[] = [
      options.stages, options.types, options.tags, options.assignees,
      options.creators, options.areas, options.priorities, options.statuses,
      options.clients, options.projects, options.teams, options.boardProjects,
    ];
    lists.forEach((l) => l?.forEach((o) => map.set(o.value, o.label)));
    return (v: string) => map.get(v) ?? v;
  }, [options]);

  // Active filter chips (one per scalar, one per array value).
  const chips: { key: keyof BoardFilters; valueId?: string; label: string }[] = [];
  (Object.keys(filters) as (keyof BoardFilters)[]).forEach((key) => {
    const v = filters[key];
    if (v === undefined || v === "" || v === false) return;
    if (key === "subtasks" && v === "all") return;
    const keyLabel = FILTER_KEY_LABELS[key];
    if (Array.isArray(v)) {
      v.forEach((val) => chips.push({ key, valueId: val, label: `${keyLabel}: ${labelFor(val)}` }));
    } else if (typeof v === "boolean") {
      chips.push({ key, label: keyLabel });
    } else {
      chips.push({ key, label: `${keyLabel}: ${v}` });
    }
  });

  function removeChip(key: keyof BoardFilters, valueId?: string) {
    if (valueId !== undefined) {
      const cur = (filters[key] as string[] | undefined) ?? [];
      setFilter(key, cur.filter((x) => x !== valueId) as any);
    } else {
      removeFilter(key);
    }
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-full bg-white border-r border-neutral-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-50 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Filtros {activeCount > 0 && <span className="text-brand-teal">({activeCount})</span>}
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Subtasks */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Subtarefas
          </Label>
          <select
            value={filters.subtasks ?? "all"}
            onChange={(e) => setFilter("subtasks", e.target.value as any)}
            className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1.5 bg-white text-neutral-700 outline-none focus:border-brand-teal"
          >
            <option value="all">Mostrar todas</option>
            <option value="hide">Ocultar subtarefas</option>
            <option value="only">Apenas subtarefas</option>
          </select>
        </div>

        {/* Saved filters */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1">
            <Bookmark size={11} /> Filtros salvos
          </Label>
          {savedFilters.length > 0 ? (
            <div className="space-y-1">
              {savedFilters.map((sf) => (
                <div
                  key={sf.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-colors",
                    activeSavedId === sf.id
                      ? "border-brand-teal/40 bg-brand-teal/5 text-brand-navy"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  )}
                  onClick={() => applySavedFilter(sf.id)}
                >
                  <span className="flex-1 truncate">{sf.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSavedFilter(sf.id); }}
                    className="text-neutral-300 hover:text-destructive"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-300">Nenhum filtro salvo ainda.</p>
          )}
        </div>

        {/* Active filters */}
        {chips.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 flex items-center gap-1.5">
              Ativos
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold flex items-center justify-center">
                {chips.length}
              </span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span
                  key={`${c.key}-${c.valueId ?? i}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-navy/5 text-brand-navy text-[11px] font-medium max-w-full"
                >
                  <span className="truncate">{c.label}</span>
                  <button onClick={() => removeChip(c.key, c.valueId)} className="hover:text-destructive shrink-0">
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Advanced filters */}
        <Collapsible
          label="Filtros avançados"
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((v) => !v)}
        >
          <div className="space-y-1 pt-1">
            {/* Título */}
            <AdvancedRow
              label="Título"
              enabled={filters.title !== undefined}
              onToggle={(on) => setFilter("title", on ? "" : undefined)}
            >
              <Input
                value={filters.title ?? ""}
                onChange={(e) => setFilter("title", e.target.value)}
                placeholder="Buscar por título..."
                className="h-7 text-xs"
                autoFocus
              />
            </AdvancedRow>

            {/* Tarefa (ID) */}
            <AdvancedRow
              label="Tarefa (ID)"
              enabled={filters.taskId !== undefined}
              onToggle={(on) => setFilter("taskId", on ? "" : undefined)}
            >
              <Input
                value={filters.taskId ?? ""}
                onChange={(e) => setFilter("taskId", e.target.value)}
                placeholder="Nº ou ID da tarefa..."
                className="h-7 text-xs"
              />
            </AdvancedRow>

            {/* Multi-select rows — only show rows that actually have options,
                so the panel never shows dead "no options" filters. */}
            {MULTI_ROWS.map(({ key, optionKey }) => {
              const opts = (options[optionKey] as FilterOption[] | undefined) ?? [];
              const selected = (filters[key] as string[] | undefined) ?? [];
              // Hide the row entirely when there's nothing to pick and nothing is
              // already selected (keeps an active filter visible so it can be cleared).
              if (opts.length === 0 && selected.length === 0) return null;
              return (
                <AdvancedRow
                  key={key}
                  label={FILTER_KEY_LABELS[key]}
                  enabled={filters[key] !== undefined}
                  onToggle={(on) => setFilter(key, on ? ([] as any) : undefined)}
                >
                  <MultiCheckList
                    options={opts}
                    selected={selected}
                    onChange={(vals) => setFilter(key, vals as any)}
                  />
                </AdvancedRow>
              );
            })}

            {/* Prioridade — checkbox group */}
            <AdvancedRow
              label="Prioridade"
              enabled={filters.priorities !== undefined}
              onToggle={(on) => setFilter("priorities", on ? ([] as any) : undefined)}
            >
              <div className="space-y-1">
                {options.priorities.map((p) => {
                  const selected = filters.priorities ?? [];
                  const checked = selected.includes(p.value);
                  return (
                    <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setFilter(
                            "priorities",
                            (checked ? selected.filter((x) => x !== p.value) : [...selected, p.value]) as any
                          )
                        }
                        className="w-3 h-3 accent-brand-teal"
                      />
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-xs text-neutral-600">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </AdvancedRow>

            {/* Situação */}
            <AdvancedRow
              label="Situação"
              enabled={filters.statuses !== undefined}
              onToggle={(on) => setFilter("statuses", on ? ([] as any) : undefined)}
            >
              <MultiCheckList
                options={options.statuses}
                selected={filters.statuses ?? []}
                onChange={(vals) => setFilter("statuses", vals as any)}
                searchable={false}
              />
            </AdvancedRow>

            {/* Data de entrega */}
            <AdvancedRow
              label="Data de entrega"
              enabled={filters.dueFrom !== undefined || filters.dueTo !== undefined}
              onToggle={(on) => {
                if (!on) { removeFilter("dueFrom"); removeFilter("dueTo"); }
                else setFilter("dueFrom", "");
              }}
            >
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="date"
                  value={filters.dueFrom ?? ""}
                  onChange={(e) => setFilter("dueFrom", e.target.value || undefined)}
                  className="text-xs border border-neutral-200 rounded px-2 py-1 w-full outline-none focus:border-brand-teal"
                />
                <input
                  type="date"
                  value={filters.dueTo ?? ""}
                  onChange={(e) => setFilter("dueTo", e.target.value || undefined)}
                  className="text-xs border border-neutral-200 rounded px-2 py-1 w-full outline-none focus:border-brand-teal"
                />
              </div>
            </AdvancedRow>

            {/* Boolean toggles */}
            <div className="space-y-1">
              <FilterCheckbox label="Urgentes" checked={filters.isUrgent ?? false}
                onChange={(v) => setFilter("isUrgent", v || undefined)} />
              <FilterCheckbox label="Atrasadas" checked={filters.isOverdue ?? false}
                onChange={(v) => setFilter("isOverdue", v || undefined)} />
              <FilterCheckbox label="Em execução" checked={filters.isRunning ?? false}
                onChange={(v) => setFilter("isRunning", v || undefined)} />
              <FilterCheckbox label="Criadas por mim" checked={filters.createdByMe ?? false}
                onChange={(v) => setFilter("createdByMe", v || undefined)} />
              <FilterCheckbox label="Minhas partes abertas" checked={filters.hasOpenParts ?? false}
                onChange={(v) => setFilter("hasOpenParts", v || undefined)} />
            </div>
          </div>
        </Collapsible>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-100 shrink-0">
        {savingName !== null && (
          <div className="flex items-center gap-1.5 px-3 pt-3">
            <Input
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder="Nome do filtro..."
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && savingName.trim()) {
                  saveCurrentFilter(savingName.trim(), boardId);
                  setSavingName(null);
                }
                if (e.key === "Escape") setSavingName(null);
              }}
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs bg-brand-teal hover:opacity-90 text-white"
              disabled={!savingName.trim()}
              onClick={() => { saveCurrentFilter(savingName.trim(), boardId); setSavingName(null); }}
            >
              OK
            </Button>
          </div>
        )}
        <div className="flex gap-2 p-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs gap-1"
            onClick={() => setSavingName(savingName === null ? "" : null)}
            disabled={activeCount === 0}
          >
            <Save size={12} /> Salvar filtro
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={clearFilters}
            disabled={activeCount === 0}
          >
            Limpar
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MultiCheckList({
  options,
  selected,
  onChange,
  searchable = true,
}: {
  options: FilterOption[];
  selected: string[];
  onChange: (vals: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  if (options.length === 0) {
    return <p className="text-[11px] text-neutral-300 py-1">Nenhuma opção disponível.</p>;
  }

  return (
    <div className="space-y-1">
      {searchable && options.length > 6 && (
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full text-xs border border-neutral-200 rounded pl-6 pr-2 py-1 outline-none focus:border-brand-teal"
          />
        </div>
      )}
      <div className="max-h-36 overflow-y-auto space-y-0.5">
        {filtered.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(o.value)}
                className="w-3 h-3 accent-brand-teal shrink-0"
              />
              {o.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />}
              <span className="text-xs text-neutral-600 truncate">{o.label}</span>
            </label>
          );
        })}
        {filtered.length === 0 && <p className="text-[11px] text-neutral-300 py-0.5">Sem resultados.</p>}
      </div>
    </div>
  );
}

function AdvancedRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-50 pb-1.5">
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-3.5 h-3.5 accent-brand-navy"
        />
        <span className={cn("text-xs font-medium", enabled ? "text-brand-navy" : "text-neutral-500")}>
          {label}
        </span>
      </label>
      {enabled && <div className="pl-5 pt-0.5">{children}</div>}
    </div>
  );
}

function Collapsible({
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string;
  badge?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
      >
        <span className="flex items-center gap-1.5">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="min-w-[16px] h-4 px-1 rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-bold flex items-center justify-center">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && children}
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-b border-neutral-50 pb-1.5">
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-3.5 h-3.5 accent-brand-navy"
        />
        <span className={cn("text-xs font-medium", checked ? "text-brand-navy" : "text-neutral-500")}>
          {label}
        </span>
      </label>
    </div>
  );
}
