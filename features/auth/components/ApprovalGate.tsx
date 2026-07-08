"use client";

import { Clock, LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useSignOut } from "../hooks/useAuth";

/**
 * Bloqueia o dashboard para usuários logados cuja conta ainda não foi aprovada
 * pelo superadmin. O RLS já impede o acesso aos dados (get_user_orgs só retorna
 * orgs de membros aprovados) — esta tela dá a explicação em vez de um app vazio.
 */
export function ApprovalGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const member = useAuthStore((s) => s.member);
  const isLoading = useAuthStore((s) => s.isLoading);
  const signOut = useSignOut();

  // Enquanto carrega a sessão/member, não decide nada (evita flash).
  if (isLoading) return null;

  // Sem usuário: o proxy já redireciona para /login; nada a fazer aqui.
  if (!user) return <>{children}</>;

  // Só bloqueia quando approved é explicitamente false. Se a coluna ainda não
  // existir (migração não aplicada) approved vem undefined → NÃO bloqueia,
  // evitando trancar todos caso o código suba antes do SQL.
  const blocked = (member as { approved?: boolean } | null)?.approved === false;
  if (!blocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-neutral-100 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Clock size={26} className="text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-brand-navy">Conta em análise</h1>
        <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
          Seu cadastro foi recebido e está <strong>aguardando aprovação</strong>.
          Fale com <strong>Sonelio Rios</strong> para liberar seu acesso.
        </p>
        <p className="text-xs text-neutral-400 mt-2">
          Assim que sua conta for aprovada, é só recarregar a página ou entrar novamente.
        </p>
        <button
          onClick={signOut}
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-lg px-4 py-2 hover:bg-neutral-50 transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  );
}
