"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { IS_MOCK } from "@/lib/mockDb";
import { checkMockCredentials, setMockSession } from "@/lib/mockUsers";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (IS_MOCK) {
      const user = checkMockCredentials(email, password);
      if (!user) {
        setError("Email ou senha incorretos.");
        setLoading(false);
        return;
      }
      setMockSession(user.id);
      router.push("/");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@medway.com.br"
          required
          autoComplete="email"
          className={cn(
            "h-11 border-neutral-200 bg-white transition-colors",
            "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20",
            "placeholder:text-neutral-400"
          )}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
            Senha
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs text-brand-teal hover:text-brand-teal-dark transition-colors"
          >
            Esqueceu a senha?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className={cn(
              "h-11 border-neutral-200 bg-white pr-10 transition-colors",
              "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className={cn(
          "w-full h-11 font-semibold text-sm",
          "bg-brand-navy hover:bg-brand-navy-light",
          "transition-all duration-150"
        )}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
