import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AcceptInviteForm } from "./AcceptInviteForm";
import type { Invitation } from "@/types";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !invitation) return notFound();
  const inv = invitation as unknown as Invitation;

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-neutral-100 p-8 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="MedwayFlow" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg text-brand-navy">MedwayFlow</span>
        </div>

        <div>
          <h1 className="text-xl font-bold text-brand-navy">
            Você foi convidado!
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Crie sua senha para entrar na plataforma Medway.
          </p>
          <p className="text-sm font-medium text-brand-navy mt-3">
            {inv.email}
          </p>
        </div>

        <AcceptInviteForm token={token} invitationId={inv.id} />
      </div>
    </div>
  );
}
