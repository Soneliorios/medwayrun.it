"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { mockHash, setPendingReg, getAllMockUsers } from "@/lib/mockUsers";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.toLowerCase().endsWith("@medway.com.br")) {
      setError("Apenas emails @medway.com.br podem criar conta.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    // Check if email already registered
    const existing = getAllMockUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing && existing.role !== "revoked") {
      setError("Este email já possui uma conta. Faça login.");
      return;
    }

    setLoading(true);

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Store pending registration
    setPendingReg({
      email,
      full_name: fullName.trim(),
      _ph: mockHash(password),
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Try to send email (fire-and-forget)
    let emailSent = false;
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      emailSent = data.emailSent === true;
    } catch {}

    setLoading(false);

    // Navigate to verify page; pass emailSent so it knows whether to show the code
    const params = new URLSearchParams({ email });
    if (!emailSent) params.set("showCode", code);
    router.push(`/register/verify?${params}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Criar conta
        </h2>
        <p className="text-sm text-neutral-500">
          Apenas emails <strong>@medway.com.br</strong> são aceitos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-sm font-medium text-neutral-700">
            Nome completo
          </Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Seu nome"
            required
            className={cn(
              "h-11 border-neutral-200 bg-white transition-colors",
              "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20",
              "placeholder:text-neutral-400"
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Email corporativo
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
          <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              autoComplete="new-password"
              className={cn(
                "h-11 border-neutral-200 bg-white pr-10 transition-colors",
                "focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
              )}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-sm font-medium text-neutral-700">
            Confirmar senha
          </Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className={cn(
              "h-11 border-neutral-200 bg-white transition-colors",
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
          className={cn(
            "w-full h-11 font-semibold text-sm",
            "bg-brand-navy hover:bg-brand-navy-light",
            "transition-all duration-150"
          )}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Enviando código...
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        Já tem conta?{" "}
        <Link href="/login" className="text-brand-teal font-medium hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
