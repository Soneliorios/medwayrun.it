// ════════════════════════════════════════════════════════════════════════════
// Catálogo de campos da task usados pelo "Layout da task" por quadro.
//   • BUILTIN_TASK_FIELDS: campos nativos que o quadro pode esconder / obrigar.
//     (título, quadro e etapa são estruturais e sempre aparecem — não listados.)
//   • CustomFieldType / CUSTOM_FIELD_TYPES: tipos de campo customizado.
// Compartilhado entre o editor (settings), o detalhe da task e a criação.
// ════════════════════════════════════════════════════════════════════════════

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "user"
  | "url";

export const CUSTOM_FIELD_TYPES: {
  value: CustomFieldType;
  label: string;
  hasOptions?: boolean;
}[] = [
  { value: "text",        label: "Texto curto" },
  { value: "textarea",    label: "Texto longo" },
  { value: "number",      label: "Número" },
  { value: "date",        label: "Data" },
  { value: "select",      label: "Seleção (única)",   hasOptions: true },
  { value: "multiselect", label: "Seleção (múltipla)", hasOptions: true },
  { value: "checkbox",    label: "Checkbox (sim/não)" },
  { value: "user",        label: "Usuário" },
  { value: "url",         label: "Link (URL)" },
];

export function customFieldTypeLabel(type: CustomFieldType): string {
  return CUSTOM_FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function customFieldHasOptions(type: CustomFieldType): boolean {
  return type === "select" || type === "multiselect";
}

export interface BuiltinField {
  /** Chave estável usada no config do quadro e no render do detalhe da task. */
  key: string;
  label: string;
  /** Se pode ser marcado como "obrigatório na criação". */
  requirable: boolean;
}

/**
 * Campos nativos configuráveis. A ordem segue a exibição no detalhe da task.
 * NÃO inclui título/quadro/etapa (estruturais, sempre visíveis).
 */
export const BUILTIN_TASK_FIELDS: BuiltinField[] = [
  { key: "description",         label: "Descrição",        requirable: true  },
  // type_id sempre nasce "Padrão" no modal de criação → obrigar não teria efeito.
  { key: "type_id",             label: "Tipo de tarefa",   requirable: false },
  { key: "priority",            label: "Prioridade",       requirable: true  },
  { key: "due_date",            label: "Entrega desejada", requirable: true  },
  { key: "desired_start_date",  label: "Início desejado",  requirable: true  },
  { key: "estimated_hours",     label: "Tempo estimado",   requirable: true  },
  { key: "assignee",            label: "Responsáveis",     requirable: true  },
  { key: "board_subproject_id", label: "Projeto",          requirable: true  },
  // area_id não é coletável no modal de criação → só pode ser escondido, não obrigado.
  { key: "area_id",             label: "Área solicitante", requirable: false },
  { key: "labels",              label: "Tags",             requirable: false },
  { key: "checklist",           label: "Checklist",        requirable: false },
  { key: "followers",           label: "Seguidores",       requirable: false },
  { key: "recurrence",          label: "Repetição",        requirable: false },
];

export function builtinFieldLabel(key: string): string {
  return BUILTIN_TASK_FIELDS.find((f) => f.key === key)?.label ?? key;
}
