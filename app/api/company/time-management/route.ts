import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "00000000-0000-0000-0000-000000000001";

/**
 * Gestão de tempo (só para líderes de time / admins).
 *
 * Retorna registros de tempo GRANULARES por (pessoa, tarefa, dia) para os membros
 * dos times que o solicitante lidera (ou todos, se admin), num intervalo de datas.
 * Usa service role porque um líder precisa ler o tempo dos OUTROS (RLS bloquearia).
 * A soma por dia replica a lógica canônica do timesheet de /me (cronômetro +
 * entregas em fila + entregas single/paralelo, sem dupla contagem).
 *
 * POST body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", teamId?: string }
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { from?: string; to?: string; teamId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const from = String(body.from ?? "").slice(0, 10);
  const to = String(body.to ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Solicitante precisa ser membro aprovado da org.
  const { data: caller } = await admin
    .from("members").select("user_id, role, approved").eq("org_id", ORG_ID).eq("user_id", user.id).maybeSingle();
  if (!caller || (caller as { approved?: boolean }).approved === false) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const callerRole = (caller as { role?: string }).role ?? "member";
  const isAdmin = callerRole === "owner" || callerRole === "admin";

  // Times: os que o solicitante lidera (ou todos, se admin).
  const { data: teamsData } = await admin
    .from("teams").select("id, name, leader_ids, member_ids, member_hours").eq("org_id", ORG_ID).order("name");
  const teams = ((teamsData ?? []) as any[]).map((t) => ({
    id: t.id, name: t.name,
    leader_ids: (t.leader_ids ?? []) as string[],
    member_ids: (t.member_ids ?? []) as string[],
    member_hours: (t.member_hours ?? {}) as Record<string, number>,
  }));
  const ledTeams = teams.filter((t) => t.leader_ids.includes(user.id));
  if (!isAdmin && ledTeams.length === 0) {
    return NextResponse.json({ error: "not_a_leader" }, { status: 403 });
  }

  const selectableTeams = isAdmin ? teams : ledTeams;
  // Escopo: um time específico (validado) ou todos os selecionáveis.
  let scopeTeams = selectableTeams;
  if (body.teamId) {
    const t = selectableTeams.find((x) => x.id === body.teamId);
    if (!t) return NextResponse.json({ error: "forbidden_team" }, { status: 403 });
    scopeTeams = [t];
  }

  // Membros no escopo (união) + capacidade semanal (member_hours) de cada um.
  const memberIds = [...new Set(scopeTeams.flatMap((t) => t.member_ids))].filter(Boolean);
  const weeklyHoursByUser: Record<string, number> = {};
  for (const t of scopeTeams) {
    for (const uid of t.member_ids) {
      const h = t.member_hours?.[uid];
      if (typeof h === "number" && weeklyHoursByUser[uid] == null) weeklyHoursByUser[uid] = h;
    }
  }

  if (memberIds.length === 0) {
    return NextResponse.json({
      records: [], members: [],
      teams: selectableTeams.map((t) => ({ id: t.id, name: t.name })),
      scopeTeamIds: scopeTeams.map((t) => t.id),
    });
  }

  // Fontes de tempo. Busca SEM filtro de data no banco e recorta a janela por DIA
  // em JS (igual ao /me). Isso: (a) evita perder entregas do último dia — delivered_at
  // e delivery_date são timestamptz e um filtro por "YYYY-MM-DD" cortaria após 00:00Z;
  // (b) deduplica com o total ALL-TIME de tracked_hours (senão horas de timer fora da
  // janela seriam recontadas como "resto" da entrega).
  const [{ data: entries }, { data: seqDeliveries }, { data: allSeq }, { data: deliveredTasks }] = await Promise.all([
    admin.from("time_entries").select("task_id, user_id, started_at, duration_minutes").in("user_id", memberIds),
    admin.from("task_sequences").select("task_id, user_id, delivered_at, hours_spent").in("user_id", memberIds).not("delivered_at", "is", null),
    admin.from("task_sequences").select("task_id, user_id").in("user_id", memberIds),
    admin.from("tasks").select("id, assignee_id, delivery_date, tracked_hours, status")
      .in("assignee_id", memberIds).eq("status", "delivered").not("delivery_date", "is", null).gt("tracked_hours", 0),
  ]);

  const inRange = (d: string) => d >= from && d <= to; // YYYY-MM-DD, inclusivo

  type Rec = { userId: string; taskId: string | null; date: string; minutes: number };
  const records: Rec[] = [];
  const key = (u: string, t: string) => `${u}|${t}`;

  // 1) Cronômetro/manual. De-dup usa TODAS as entries (all-time); registros só na janela.
  const timerHoursByUserTask: Record<string, number> = {};
  ((entries ?? []) as any[]).forEach((e) => {
    const mins = e.duration_minutes ?? 0;
    if (e.task_id) timerHoursByUserTask[key(e.user_id, e.task_id)] = (timerHoursByUserTask[key(e.user_id, e.task_id)] ?? 0) + mins / 60;
    const date = String(e.started_at).slice(0, 10);
    if (mins > 0 && inRange(date)) records.push({ userId: e.user_id, taskId: e.task_id ?? null, date, minutes: mins });
  });
  // 2) Entregas em fila: horas da parte no dia da entrega.
  ((seqDeliveries ?? []) as any[]).forEach((d) => {
    const date = String(d.delivered_at).slice(0, 10);
    const mins = Math.round((d.hours_spent ?? 0) * 60);
    if (mins > 0 && inRange(date)) records.push({ userId: d.user_id, taskId: d.task_id ?? null, date, minutes: mins });
  });
  // 3) Entregas single/paralelo (tracked_hours no delivery_date), menos o timer já
  //    contado (all-time); pula tarefas em que o usuário está numa fila (contadas em 2).
  const queued = new Set(((allSeq ?? []) as any[]).map((s) => key(s.user_id, s.task_id)));
  ((deliveredTasks ?? []) as any[]).forEach((t) => {
    const date = String(t.delivery_date).slice(0, 10);
    if (!inRange(date)) return;
    const k = key(t.assignee_id, t.id);
    if (queued.has(k)) return;
    const extraH = Math.max(0, (t.tracked_hours ?? 0) - (timerHoursByUserTask[k] ?? 0));
    const mins = Math.round(extraH * 60);
    if (mins > 0) records.push({ userId: t.assignee_id, taskId: t.id, date, minutes: mins });
  });

  // Metadados das tarefas envolvidas (título, tipo, quadro).
  const taskIds = [...new Set(records.map((r) => r.taskId).filter(Boolean) as string[])];
  const taskMeta = new Map<string, { title: string; type: string; projectId: string | null }>();
  const projectIds = new Set<string>();
  if (taskIds.length) {
    const { data: tks } = await admin.from("tasks").select("id, title, task_type, project_id").in("id", taskIds);
    ((tks ?? []) as any[]).forEach((t) => {
      taskMeta.set(t.id, {
        title: t.title ?? "(sem título)",
        type: typeof t.task_type === "string" && t.task_type ? t.task_type : "Sem tipo",
        projectId: t.project_id ?? null,
      });
      if (t.project_id) projectIds.add(t.project_id);
    });
  }
  // Nomes dos quadros + ACESSO do solicitante. Conteúdo de quadro privado que o
  // líder não pode ver é redigido (mantém as horas, esconde título/quadro/tipo).
  const projectName = new Map<string, string>();
  const accessibleProjects = new Set<string>();
  if (projectIds.size) {
    const [{ data: prj }, { data: myPm }] = await Promise.all([
      admin.from("projects").select("id, name, is_private, access_all_view, access_all_create, access_all_edit").in("id", [...projectIds]),
      admin.from("project_members").select("project_id").eq("user_id", user.id).in("project_id", [...projectIds]),
    ]);
    const myProjectSet = new Set(((myPm ?? []) as any[]).map((m) => m.project_id));
    ((prj ?? []) as any[]).forEach((p) => {
      projectName.set(p.id, p.name ?? "Quadro");
      const canView = isAdmin || !p.is_private || p.access_all_view === true || p.access_all_create === true || p.access_all_edit === true || myProjectSet.has(p.id);
      if (canView) accessibleProjects.add(p.id);
    });
  }

  // Membros (nomes/avatares) — inclui quem não registrou nada no período.
  const [{ data: profilesData }, authList] = await Promise.all([
    admin.from("profiles").select("id, full_name, avatar_url").in("id", memberIds),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]));
  const authMap = new Map((authList?.data?.users ?? []).map((u: any) => [u.id, u]));
  const members = memberIds.map((id) => {
    const p = profileMap.get(id); const au = authMap.get(id);
    const full_name = (p?.full_name as string) || (au?.user_metadata?.full_name as string) || au?.email?.split("@")[0] || "Sem nome";
    return { id, full_name, avatar_url: (p?.avatar_url as string | null) ?? null, weeklyHours: weeklyHoursByUser[id] ?? null };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const enriched = records.map((r) => {
    const meta = r.taskId ? taskMeta.get(r.taskId) : undefined;
    const projId = meta?.projectId ?? null;
    const restricted = !!projId && !accessibleProjects.has(projId);
    return {
      userId: r.userId,
      taskId: r.taskId,
      taskTitle: restricted ? "Tarefa restrita" : (meta?.title ?? "(sem tarefa)"),
      taskType: restricted ? "Restrito" : (meta?.type ?? "Sem tipo"),
      projectId: projId,
      projectName: !projId ? "—" : (restricted ? "Quadro restrito" : (projectName.get(projId) ?? "Quadro")),
      date: r.date,
      minutes: r.minutes,
    };
  });

  return NextResponse.json({
    records: enriched,
    members,
    teams: selectableTeams.map((t) => ({ id: t.id, name: t.name })),
    scopeTeamIds: scopeTeams.map((t) => t.id),
  });
}
