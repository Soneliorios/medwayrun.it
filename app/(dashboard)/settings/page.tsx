"use client";

import { useState } from "react";
import { Header } from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createRawClient } from "@/services/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getInitials } from "@/lib/utils";
import { Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { profile, setProfile } = useAuthStore();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createRawClient();
    await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile?.id ?? "");

    if (profile) setProfile({ ...profile, full_name: fullName });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Configurações" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-8">
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-brand-navy">Perfil</h2>

            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-brand-navy text-white text-lg font-semibold">
                  {getInitials(profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-brand-navy">
                  {profile?.full_name ?? "—"}
                </p>
                <p className="text-xs text-neutral-500">Medway</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nome completo</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                  className="h-10 max-w-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal/20"
                />
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-brand-navy hover:bg-brand-navy-light"
                size="sm"
              >
                {saving ? (
                  <><Loader2 size={13} className="mr-2 animate-spin" />Salvando...</>
                ) : saved ? (
                  "Salvo!"
                ) : (
                  <><Save size={13} className="mr-2" />Salvar</>
                )}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
