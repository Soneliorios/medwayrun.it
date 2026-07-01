"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Search, Clock, FolderKanban, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockClients, type MockClient } from "@/lib/mockClients";

export default function ClientsPage() {
  const [clients, setClients] = useState<MockClient[]>([]);
  const [search, setSearch] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSector, setNewSector] = useState("");
  const [newCode, setNewCode] = useState("");

  function reload() { setClients(mockClients.list()); }
  useEffect(() => { reload(); }, []);

  function toggleStatus(c: MockClient) {
    mockClients.update(c.id, { status: c.status === "active" ? "inactive" : "active" });
    reload();
  }
  function createClient() {
    mockClients.create({ name: newName.trim(), sector: newSector, code: newCode });
    setNewClientOpen(false); setNewName(""); setNewSector(""); setNewCode("");
    reload();
  }

  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.sector.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <Building2 size={15} className="text-brand-navy shrink-0" />
        <h1 className="text-sm font-semibold text-brand-navy">Clientes</h1>
        <span className="text-xs text-neutral-400">— {clients.length} cadastrados</span>
        <div className="flex-1" />
        <div className="relative max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar clientes..."
            className="w-56 pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg outline-none focus:border-brand-teal bg-white" />
        </div>
        <button onClick={() => setNewClientOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors">
          <Plus size={13} /> Novo cliente
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {newClientOpen && (
          <div className="bg-white rounded-xl border border-brand-teal/30 p-4 mb-4 shadow-sm">
            <p className="text-sm font-semibold text-brand-navy mb-3">Novo cliente</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Nome *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do cliente" className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Código</label>
                <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Ex: CLI-005" className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Setor</label>
                <input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="Ex: Saúde" className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-brand-teal" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNewClientOpen(false)} className="px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button onClick={createClient} disabled={!newName.trim()} className="px-3 py-1.5 text-xs font-semibold bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90 disabled:opacity-40">Salvar</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead className="border-b border-neutral-100 bg-neutral-50/60">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-neutral-400">Cliente</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-24">Código</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-28">Atividade</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-24">Projetos</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-32">Horas restantes</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-neutral-400 w-20">Status</th>
                  <th className="px-3 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const remaining = c.hoursContracted > 0 ? c.hoursContracted - c.hours : null;
                  return (
                    <tr key={c.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                      <td className="px-4 py-2.5">
                        <Link href={`/company/clients/${c.id}`} className="flex items-center gap-2.5 group">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: c.color }}>{c.name.charAt(0)}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-brand-navy group-hover:text-brand-teal truncate">{c.name}</span>
                            <span className="block text-[10px] text-neutral-400 truncate">{c.sector}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-500 font-mono">{c.code}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-end gap-0.5 h-6">
                          {c.weekly.map((h, i) => (
                            <div key={i} className="w-1.5 rounded-sm" style={{ height: `${Math.max(h, 6)}%`, background: c.color, opacity: 0.6 }} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-500"><FolderKanban size={11} /> {c.projects}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {remaining !== null ? (
                          <span className={cn("inline-flex items-center gap-1 text-xs", remaining < 0 ? "text-destructive" : "text-neutral-600")}>
                            <Clock size={11} /> {remaining}h <span className="text-neutral-300">/ {c.hoursContracted}h</span>
                          </span>
                        ) : <span className="text-xs text-neutral-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleStatus(c)} className="flex items-center gap-1.5" title="Alternar status">
                          <span className={cn("w-7 h-3.5 rounded-full relative transition-all", c.status === "active" ? "bg-brand-teal" : "bg-neutral-200")}>
                            <span className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all", c.status === "active" ? "left-[15px]" : "left-0.5")} />
                          </span>
                          <span className={cn("text-[10px] font-medium", c.status === "active" ? "text-brand-teal" : "text-neutral-400")}>{c.status === "active" ? "Ativo" : "Inativo"}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/company/clients/${c.id}`} className="text-xs text-brand-teal hover:underline inline-flex items-center gap-0.5">Ver <ArrowRight size={11} /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 size={32} className="text-neutral-200 mb-3" />
              <p className="text-sm text-neutral-400">Nenhum cliente encontrado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
