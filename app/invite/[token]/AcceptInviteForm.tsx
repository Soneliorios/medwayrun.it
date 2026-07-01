"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Props {
  token: string;
  invitationId: string;
}

export function AcceptInviteForm({ token, invitationId }: Props) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Update user's password via the recovery token (Supabase magic link flow)
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Delete invitation after use
    await supabase.from("invitations").delete().eq("id", invitationId);

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nome completo
        </Label>
        <Input
          id="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Seu nome"
          required
          className={cn(
            "h-11 border-neutral-200",
            "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Criar senha
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          required
          minLength={8}
          className={cn(
            "h-11 border-neutral-200",
            "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
          )}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-11 font-semibold bg-brand-navy hover:bg-brand-navy-light"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" />
            Criando conta...
          </>
        ) : (
          "Entrar na plataforma"
        )}
      </Button>
    </form>
  );
}
