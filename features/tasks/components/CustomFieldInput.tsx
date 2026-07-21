"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, ChevronDown } from "lucide-react";
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

  // ── multiselect (dropdown com checkboxes) ──────────────────────────────────────
  if (field.type === "multiselect") {
    return <MultiSelectField field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  return null;
}

// Seleção múltipla em dropdown (não solta todas as opções na tela).
// O painel é renderizado em portal com position:fixed — assim não é cortado
// pelos containers roláveis (sidebar do detalhe / corpo do modal de criação).
function MultiSelectField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: BoardCustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number; width: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Preserva valores fora das opções atuais (não apaga dado ao editar o campo);
  // mas só mostra/marca as opções que ainda existem na config.
  const raw = Array.isArray(value) ? (value as string[]) : [];
  const selectedValid = raw.filter((o) => field.options.includes(o));
  const toggle = (o: string) => {
    if (disabled) return;
    const next = raw.includes(o) ? raw.filter((x) => x !== o) : [...raw, o];
    onChange(next);
  };
  const summary =
    selectedValid.length === 0 ? "Selecionar…" : selectedValid.length <= 2 ? selectedValid.join(", ") : `${selectedValid.length} selecionados`;

  function openMenu() {
    if (disabled) return;
    const b = btnRef.current?.getBoundingClientRect();
    if (b) {
      const PANEL_MAX = 260;
      const spaceBelow = window.innerHeight - b.bottom;
      const openUp = spaceBelow < PANEL_MAX && b.top > spaceBelow;
      setRect({ top: b.top, bottom: b.bottom, left: b.left, width: b.width, openUp });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Rolar DENTRO do painel (para ver mais opções) é ok; só fecha se a rolagem
    // vier de fora (aí a posição fixed ficaria dessincronizada).
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && panelRef.current && (panelRef.current === t || panelRef.current.contains(t))) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="w-full flex items-center justify-between gap-2 text-sm border border-neutral-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-teal bg-white disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className={cn("truncate", selectedValid.length === 0 && "text-neutral-400")}>{summary}</span>
        <ChevronDown size={14} className="shrink-0 text-neutral-400" />
      </button>
      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: rect.openUp ? undefined : rect.bottom + 4,
              bottom: rect.openUp ? window.innerHeight - rect.top + 4 : undefined,
              left: rect.left,
              width: rect.width,
              zIndex: 200,
            }}
            className="bg-white rounded-lg border border-neutral-200 shadow-lg max-h-60 overflow-y-auto p-1"
          >
            {field.options.length === 0 && <p className="text-xs text-neutral-400 px-2 py-1.5">Sem opções</p>}
            {field.options.map((o) => (
              <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={raw.includes(o)}
                  onChange={() => toggle(o)}
                  className="w-3.5 h-3.5 accent-brand-teal"
                />
                <span className="text-sm text-neutral-700">{o}</span>
              </label>
            ))}
          </div>,
          document.body
        )}
    </>
  );
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
