"use client";

import { Globe, Plus, Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MOCK_PORTALS = [
  {
    id: "p1",
    name: "Portal Medway Educação",
    slug: "medway-educacao",
    client: "Medway Educação",
    active: true,
    forms: 2,
    submissions: 23,
    lastAccess: "2026-05-30",
  },
  {
    id: "p2",
    name: "Portal Sírio-Libanês",
    slug: "sirio-libanes",
    client: "Hospital Sírio-Libanês",
    active: true,
    forms: 1,
    submissions: 8,
    lastAccess: "2026-05-28",
  },
  {
    id: "p3",
    name: "Portal Revalida",
    slug: "revalida-brasil",
    client: "Revalida Brasil",
    active: false,
    forms: 1,
    submissions: 5,
    lastAccess: "2026-04-15",
  },
];

export default function PortalsPage() {
  const [portals, setPortals] = useState(MOCK_PORTALS);

  function toggleActive(id: string) {
    setPortals((prev) => prev.map((p) => p.id === id ? { ...p, active: !p.active } : p));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-neutral-50">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-100 bg-white shrink-0">
        <Globe size={15} className="text-brand-navy shrink-0" />
        <h1 className="text-sm font-semibold text-brand-navy">Portais de Clientes</h1>
        <span className="text-xs text-neutral-400">— acesso externo para clientes</span>
        <div className="flex-1" />
        <button
          onClick={() => alert("Criar portal — Em breve")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
        >
          <Plus size={13} />
          Novo portal
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 max-w-3xl">
          {portals.map((portal) => (
            <div key={portal.id} className="bg-white rounded-xl border border-neutral-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-brand-navy">{portal.name}</h3>
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                      portal.active ? "bg-green-50 text-green-600" : "bg-neutral-100 text-neutral-400"
                    )}>
                      {portal.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mb-2">Cliente: {portal.client}</p>
                  <div className="flex items-center gap-1.5 bg-neutral-50 rounded-lg px-2.5 py-1.5 w-fit">
                    <Globe size={11} className="text-neutral-400" />
                    <span className="text-xs text-neutral-500 font-mono">
                      medwayrun.it/portal/{portal.slug}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(`https://medwayrun.it/portal/${portal.slug}`)}
                      className="text-neutral-400 hover:text-brand-teal transition-colors ml-1"
                    >
                      <Copy size={11} />
                    </button>
                    <a href="#" className="text-neutral-400 hover:text-brand-teal transition-colors">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  <div className="flex items-center gap-4 mt-2.5 text-xs text-neutral-500">
                    <span>{portal.forms} formulário{portal.forms !== 1 ? "s" : ""}</span>
                    <span>{portal.submissions} submissões</span>
                    <span>Último acesso: {new Date(portal.lastAccess).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(portal.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                    portal.active
                      ? "bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500"
                      : "bg-neutral-100 text-neutral-500 hover:bg-green-50 hover:text-green-600"
                  )}
                >
                  {portal.active ? <Eye size={12} /> : <EyeOff size={12} />}
                  {portal.active ? "Publicado" : "Rascunho"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
