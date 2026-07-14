import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-brand-navy tracking-tight">
          Definir nova senha
        </h2>
        <p className="text-sm text-neutral-500">
          Escolha uma nova senha para a sua conta.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
