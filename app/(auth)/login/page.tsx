import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
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

      <LoginForm />
    </div>
  );
}
