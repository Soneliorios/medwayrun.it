"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient, createRawClient } from "@/lib/supabase/client";
import { ORG_ID, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { UserPlus, Mail, Loader2, Shield, Eye, Pen, Crown } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  member: "Membro",
  viewer: "Visitante",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown size={11} />,
  admin: <Shield size={11} />,
  member: <Pen size={11} />,
  viewer: <Eye size={11} />,
};

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const { member: currentMember } = useAuthStore();

  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("*, profiles(full_name, avatar_url)")
      .eq("org_id", ORG_ID)
      .order("joined_at", { ascending: true });
    setMembers((data ?? []) as MemberRow[]);
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);

    const supabase = createRawClient();
    await supabase.from("invitations").insert({
      org_id: ORG_ID,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: currentMember?.user_id,
    });

    setInviteSuccess(true);
    setInviting(false);
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    const supabase = createRawClient();
    await supabase.from("members").update({ role: newRole }).eq("id", memberId);
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Equipe">
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => { setShowInvite(true); setInviteSuccess(false); }}
            className="ml-auto bg-brand-navy hover:bg-brand-navy-light h-8 gap-1.5"
          >
            <UserPlus size={14} />
            Convidar membro
          </Button>
        )}
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              {members.length} {members.length === 1 ? "membro" : "membros"}
            </h2>
            <div className="bg-white rounded-xl border border-neutral-100 shadow-sm divide-y divide-neutral-50">
              {loading ? (
                <div className="p-8 text-center text-sm text-neutral-400">
                  Carregando membros...
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-4"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={member.profiles?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-brand-navy/10 text-brand-navy text-xs font-semibold">
                        {getInitials(member.profiles?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-navy truncate">
                        {member.profiles?.full_name ?? "—"}
                      </p>
                    </div>

                    {isAdmin && member.role !== "owner" ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => v && handleRoleChange(member.id, v)}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs border-neutral-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS)
                            .filter(([r]) => r !== "owner")
                            .map(([r, l]) => (
                              <SelectItem key={r} value={r} className="text-xs">
                                {l}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[11px] gap-1 border-neutral-200 text-neutral-500"
                      >
                        {ROLE_ICONS[member.role]}
                        {ROLE_LABELS[member.role] ?? member.role}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">Convidar membro</DialogTitle>
          </DialogHeader>

          {inviteSuccess ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-brand-teal/10 flex items-center justify-center mx-auto">
                <Mail size={22} className="text-brand-teal" />
              </div>
              <p className="font-semibold text-brand-navy">Convite enviado!</p>
              <p className="text-sm text-neutral-500">
                O link de acesso foi gerado. Compartilhe com o novo membro.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInvite(false)}
              >
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colaborador@medway.com.br"
                  required
                  className="h-10 focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Função</Label>
                <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="viewer">Visitante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="w-full bg-brand-navy hover:bg-brand-navy-light"
              >
                {inviting ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" />Convidando...</>
                ) : "Enviar convite"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
