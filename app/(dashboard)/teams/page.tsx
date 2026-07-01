"use client";

import { useState } from "react";
import { Users2, Plus, Mail, Shield, MoreHorizontal, Search } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MOCK_TEAMS = [
  {
    id: "team-1",
    name: "Produto & Tecnologia",
    description: "Desenvolvimento de produto e infraestrutura",
    members: [
      { id: "u1", name: "Ana Silva", role: "líder", email: "ana@medway.com" },
      { id: "u2", name: "Bruno Costa", role: "membro", email: "bruno@medway.com" },
      { id: "u3", name: "Carla Mendes", role: "membro", email: "carla@medway.com" },
    ],
    color: "#407EC9",
  },
  {
    id: "team-2",
    name: "Marketing",
    description: "Comunicação, conteúdo e campanhas",
    members: [
      { id: "u4", name: "Diego Ferreira", role: "líder", email: "diego@medway.com" },
      { id: "u5", name: "Elena Souza", role: "membro", email: "elena@medway.com" },
    ],
    color: "#01CFB5",
  },
  {
    id: "team-3",
    name: "Comercial",
    description: "Vendas e relacionamento com clientes",
    members: [
      { id: "u6", name: "Felipe Lima", role: "líder", email: "felipe@medway.com" },
      { id: "u7", name: "Gabriela Reis", role: "membro", email: "gabriela@medway.com" },
      { id: "u8", name: "Henrique Nunes", role: "membro", email: "henrique@medway.com" },
      { id: "u9", name: "Isabel Torres", role: "membro", email: "isabel@medway.com" },
    ],
    color: "#FFB81C",
  },
];

export default function TeamsPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const filtered = MOCK_TEAMS.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100 bg-white shrink-0">
        <Users2 size={18} className="text-brand-navy" />
        <h1 className="text-base font-semibold text-brand-navy">Equipes</h1>
        <div className="relative flex-1 max-w-xs ml-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar equipe..." className="pl-8 h-8 text-sm" />
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}
          className="ml-auto bg-brand-navy hover:bg-brand-navy-light h-8 gap-1.5">
          <Plus size={14} /> Nova equipe
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {filtered.map(team => (
            <div key={team.id}
              className="bg-white rounded-xl border border-neutral-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="h-1" style={{ background: team.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-brand-navy text-sm">{team.name}</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">{team.description}</p>
                  </div>
                  <button className="p-1 rounded text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-1 mt-3 mb-2">
                  <div className="flex -space-x-1.5">
                    {team.members.slice(0, 4).map(m => (
                      <Avatar key={m.id} className="w-7 h-7 border-2 border-white">
                        <AvatarFallback className="text-[10px] font-semibold"
                          style={{ background: team.color + "20", color: team.color }}>
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-neutral-400 ml-1">
                    {team.members.length} membro{team.members.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-1.5 mt-3 pt-3 border-t border-neutral-50">
                  {team.members.slice(0, 3).map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Avatar className="w-5 h-5">
                        <AvatarFallback className="text-[9px]"
                          style={{ background: team.color + "20", color: team.color }}>
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-neutral-700 flex-1 truncate">{m.name}</span>
                      {m.role === "líder" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: team.color + "15", color: team.color }}>
                          LÍDER
                        </span>
                      )}
                    </div>
                  ))}
                  {team.members.length > 3 && (
                    <p className="text-[10px] text-neutral-400 pl-7">
                      +{team.members.length - 3} outros
                    </p>
                  )}
                </div>

                <button className="mt-3 w-full text-xs font-medium text-brand-teal hover:text-brand-teal-dark flex items-center gap-1 justify-center py-1.5 rounded-lg hover:bg-brand-teal/5 transition-colors border border-brand-teal/20">
                  <Plus size={11} /> Convidar membro
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-neutral-400">
              <Users2 size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma equipe encontrada.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Nova equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
              placeholder="Nome da equipe" className="focus:border-brand-teal" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setShowCreate(false)}
                className="bg-brand-navy hover:bg-brand-navy-light">
                Criar equipe
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
