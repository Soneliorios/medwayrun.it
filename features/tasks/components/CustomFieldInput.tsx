"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardCustomField } from "@/features/board/services/boardFieldService";

interface Member {
  id: string;
  full_name: string;
}

/**
 * Renderiza o CONTROLE de um campo customizado (sem o rótulo — quem chama
 * envolve num <MetaField>). Persiste via onChange:
 *   text/textarea/url/select/user → string | null
 *   number                        → number | null
 *   date                          → string (YYYY-MM-DD) | null
 *   checkbox                      → boolean
 *   multiselect                   → string[]
 */
export function CustomFieldInput({
  field,
  value,
  onChange,
  members = [],
  disabled = false,
}: {
  field: BoardCustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  members?: Member[];
  disabled?: boolean;
}) {
  const inputCls =
    "w-full text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-teal bg-white disabled:opacity-60 disabled:cursor-not-allowed";

  // ── text / textarea / number / url: buffer local, persiste no blur ──────────
  if (field.type === "text" || field.type === "textarea" || field.type === "number" || field.type === "url") {
    return (
      <TextLike field={field} value={value} onChange={onChange} disabled={disabled} inputCls={inputCls} />
    );
  }

  // ── date ────────────────────────────────────────────────────────────────────
  if (field.type === "date") {
    return (
      <input
        type="date"
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
      />
    );
  }

  // ── checkbox (sim/não) ────────────────────────────────────────────────────────
  if (field.type === "checkbox") {
    const on = value === true;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-60",
          on ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
        )}
      >
        {on && <Check size={12} />} {on ? "Sim" : "Não"}
      </button>
    );
  }

  // ── select (única) ────────────────────────────────────────────────────────────
  if (field.type === "select") {
    return (
      <select
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
      >
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  // ── user (membro da org) ───────────────────────────────────────────────────────
  if (field.type === "user") {
    return (
      <select
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
      >
        <option value="">—</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.full_name}</option>
        ))}
      </select>
    );
  }

  // ── multiselect (chips) ─────────────────────────────────────────────────────────
  if (field.type === "multiselect") {
    // Só considera valores que ainda existem nas opções do campo — assim uma opção
    // removida pela config não fica "presa" (invisível mas re-salva a cada toggle).
    const raw = Array.isArray(value) ? (value as string[]) : [];
    const selected = raw.filter((o) => field.options.includes(o));
    const toggle = (o: string) => {
      if (disabled) return;
      const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
      onChange(next);
    };
    return (
      <div className="flex flex-wrap gap-1.5">
        {field.options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-60",
                on ? "bg-brand-navy text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              )}
            >
              {o}
            </button>
          );
        })}
        {field.options.length === 0 && <span className="text-xs text-neutral-400">Sem opções</span>}
      </div>
    );
  }

  return null;
}

// Buffer local para inputs de texto/número/url — persiste no blur ou Enter.
function TextLike({
  field,
  value,
  onChange,
  disabled,
  inputCls,
}: {
  field: BoardCustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  inputCls: string;
}) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (field.type === "number") {
      if (trimmed === "") { onChange(null); return; }
      const n = Number(trimmed);
      onChange(Number.isFinite(n) ? n : null);
      return;
    }
    onChange(trimmed === "" ? null : trimmed);
  };

  if (field.type === "textarea") {
    return (
      <textarea
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        className={cn(inputCls, "resize-y")}
      />
    );
  }

  const urlValue = typeof value === "string" ? value.trim() : "";
  const showLink = field.type === "url" && urlValue !== "";
  // Só prefixa https:// quando NÃO há esquema (mailto:, ftp://, HTTP:// etc. ficam intactos).
  const href = /^[a-z][a-z0-9+.-]*:/i.test(urlValue) ? urlValue : `https://${urlValue}`;
  return (
    <div className="space-y-1">
      <input
        type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" && field.type !== "textarea") (e.target as HTMLInputElement).blur(); }}
        placeholder={field.type === "url" ? "https://…" : ""}
        className={inputCls}
      />
      {showLink && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-teal hover:underline"
        >
          <Link2 size={11} /> Abrir link
        </a>
      )}
    </div>
  );
}
