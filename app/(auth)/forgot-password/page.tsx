import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Recuperar senha
        </h2>
        <p className="text-sm text-neutral-500">
          Informe seu email e enviaremos um link para criar uma nova senha.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
