"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O link de recuperação já estabeleceu uma sessão (via /auth/callback). Se não
  // houver sessão, o link é inválido/expirou.
  const [validLink, setValidLink] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setValidLink(!!data.user));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    // Já autenticado com a nova senha — segue pro app.
    setTimeout(() => { router.push("/"); router.refresh(); }, 1500);
  }

  if (validLink === false) {
    return (
      <div className="text-center space-y-4">
        <p className="font-semibold text-brand-navy">Link inválido ou expirado</p>
        <p className="text-sm text-neutral-500">
          Este link de recuperação não é mais válido. Solicite um novo.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-1.5 text-sm text-brand-teal hover:text-brand-teal-dark transition-colors"
        >
          <ArrowLeft size={14} />
          Solicitar novo link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 size={48} className="text-brand-teal" />
        </div>
        <div>
          <p className="font-semibold text-brand-navy">Senha redefinida!</p>
          <p className="text-sm text-neutral-500 mt-1">Entrando na plataforma...</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Nova senha
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          required
          minLength={8}
          className={cn("h-11 border-neutral-200 bg-white", "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-sm font-medium text-neutral-700">
          Confirmar nova senha
        </Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repita a senha"
          required
          minLength={8}
          className={cn("h-11 border-neutral-200 bg-white", "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20")}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md">{error}</p>
      )}

      <Button
        type="submit"
        disabled={loading || validLink === null}
        className="w-full h-11 font-semibold text-sm bg-brand-navy hover:bg-brand-navy-light"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          "Redefinir senha"
        )}
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-neutral-500 hover:text-brand-navy transition-colors"
      >
        <ArrowLeft size={14} />
        Voltar ao login
      </Link>
    </form>
  );
}
