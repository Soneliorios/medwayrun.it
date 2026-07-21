// ════════════════════════════════════════════════════════════════════════════
// Geração de CSV amigável ao Excel pt-BR:
//   • BOM UTF-8  → acentos corretos ao abrir no Excel
//   • delimitador ';' → colunas separam certo no Excel em português
//   • quebras CRLF + aspas escapadas conforme RFC 4180
// ════════════════════════════════════════════════════════════════════════════

type Cell = string | number | null | undefined;

export function buildCsv(rows: Cell[][], delimiter = ";"): string {
  const esc = (v: Cell): string => {
    const s = v == null ? "" : String(v);
    if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return rows.map((r) => r.map(esc).join(delimiter)).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // ﻿ = BOM: sem ele o Excel abre acentos quebrados.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
