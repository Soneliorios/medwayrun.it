"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Mail, RefreshCw, CheckCircle2 } from "lucide-react";
import { getPendingReg, completePendingReg, setMockSession, setPendingReg, mockHash } from "@/lib/mockUsers";

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const showCode = params.get("showCode"); // present when no email service

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) router.replace("/register");
  }, [email, router]);

  // Focus first empty input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleDigit(idx: number, val: string) {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (d && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (next.every((c) => c)) {
      verifyCode(next.join(""));
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      verifyCode(text);
    }
  }

  async function verifyCode(code: string) {
    setError(null);
    setLoading(true);

    const pending = getPendingReg(email);
    if (!pending) {
      setError("Código expirado. Volte e tente novamente.");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setLoading(false);
      return;
    }

    if (pending.code !== code) {
      setError("Código incorreto. Verifique e tente de novo.");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setLoading(false);
      return;
    }

    // Complete registration
    const newUser = completePendingReg(email);
    if (!newUser) {
      setError("Erro ao criar conta. Tente novamente.");
      setLoading(false);
      return;
    }

    setMockSession(newUser.id);
    setDone(true);
    setLoading(false);

    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  async function handleResend() {
    setResendMsg(null);
    setResending(true);

    const pending = getPendingReg(email);
    if (!pending) {
      setResendMsg("Sessão expirada. Volte e preencha os dados novamente.");
      setResending(false);
      return;
    }

    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    setPendingReg({
      ...pending,
      code: newCode,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    let emailSent = false;
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: newCode }),
      });
      emailSent = (await res.json()).emailSent === true;
    } catch {}

    setResending(false);
    if (emailSent) {
      setResendMsg("Novo código enviado para seu email.");
    } else {
      setResendMsg(`Código: ${newCode}`);
    }
    setDigits(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-brand-navy">Conta criada!</h2>
        <p className="text-sm text-neutral-500">Redirecionando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Verificar email
        </h2>
        <p className="text-sm text-neutral-500">
          {showCode
            ? "Sem serviço de email configurado. Use o código abaixo:"
            : (
              <>
                Enviamos um código de 6 dígitos para{" "}
                <strong className="text-neutral-700">{email}</strong>.
              </>
            )}
        </p>
      </div>

      {showCode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-xs text-amber-700 mb-1 font-medium">Código de verificação (modo demo)</p>
          <p className="text-3xl font-bold tracking-widest text-amber-800">{showCode}</p>
        </div>
      )}

      {!showCode && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <Mail size={16} className="text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700">
            Verifique sua caixa de entrada e a pasta de spam.
          </p>
        </div>
      )}

      {/* 6-digit input */}
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={loading}
            className={cn(
              "w-12 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all",
              "focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20",
              d ? "border-brand-teal bg-brand-teal/5" : "border-neutral-200 bg-white",
              error && "border-destructive bg-destructive/5"
            )}
          />
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
          <Loader2 size={14} className="animate-spin" />
          Verificando...
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-md text-center">
          {error}
        </p>
      )}

      {resendMsg && (
        <p className="text-sm text-neutral-600 bg-neutral-100 px-3 py-2 rounded-md text-center">
          {resendMsg}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={resending}
          className="w-full text-neutral-500 hover:text-neutral-700"
        >
          {resending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-1.5" />
          )}
          Reenviar código
        </Button>

        <p className="text-center text-sm text-neutral-400">
          <Link href="/register" className="hover:text-neutral-600 transition-colors">
            ← Voltar
          </Link>
        </p>
      </div>
    </div>
  );
}
