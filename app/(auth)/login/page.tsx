import Link from "next/link";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { CheckCircle2 } from "lucide-react";

interface Props {
  searchParams: Promise<{ registered?: string; pending?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { registered, pending } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Bem-vindo de volta
        </h2>
        <p className="text-sm text-neutral-500">
          Entre com suas credenciais para acessar a plataforma.
        </p>
      </div>

      {pending && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-amber-600" />
          <span>
            Conta criada e <strong>em análise</strong>. Fale com <strong>Sonelio Rios</strong> para
            aprovar seu acesso — depois é só entrar normalmente.
          </span>
        </div>
      )}
      {registered && !pending && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md">
          <CheckCircle2 size={15} className="shrink-0" />
          Conta criada! Verifique seu email e faça login.
        </div>
      )}

      <LoginForm />

      <p className="text-center text-sm text-neutral-500">
        Primeira vez aqui?{" "}
        <Link href="/register" className="text-brand-teal font-medium hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
