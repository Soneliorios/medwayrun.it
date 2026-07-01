import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acesso | MedwayRun",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Left panel — brand visual ─────────────────────────── */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #00205B 0%, #334C7C 100%)" }}
      >
        {/* Decorative orbs */}
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #01CFB5 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #01CFB5 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
              style={{ background: "#01CFB5" }}
            >
              M
            </div>
            <span
              className="text-white font-bold text-xl tracking-tight"
              style={{ fontFamily: "var(--font-montserrat)" }}
            >
              medwayrun
            </span>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 space-y-4">
          <h1
            className="text-4xl font-bold text-white leading-tight"
            style={{ fontFamily: "var(--font-montserrat)" }}
          >
            Gestão de projetos
            <br />
            <span style={{ color: "#01CFB5" }}>ágil e colaborativa</span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            Organize tarefas, acompanhe o progresso da equipe e entregue
            resultados com velocidade e clareza.
          </p>
        </div>

        {/* Badges */}
        <div className="relative z-10 flex gap-3 flex-wrap">
          {["Kanban fluido", "Realtime", "Time tracking", "Drag & drop premium"].map(
            (tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium text-white/80 border border-white/20 backdrop-blur-sm"
              >
                {tag}
              </span>
            )
          )}
        </div>
      </div>

      {/* ── Right panel — form ───────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 bg-neutral-50">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ background: "#01CFB5" }}
          >
            M
          </div>
          <span className="font-bold text-xl text-brand-navy tracking-tight">
            medwayrun
          </span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
