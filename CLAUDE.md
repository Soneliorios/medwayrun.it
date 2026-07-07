@AGENTS.md

# MedwayRun — Gestão de tarefas / Kanban (Medway)

App interno de gestão de tarefas estilo Kanban + projetos, timer, aprovações, automações e mural.
Deploy na Vercel. **Single-org** (não é SaaS multi-tenant genérico) — há um `ORG_ID` fixo.

## Stack
- **Next.js 16.2.6** (App Router) + **React 19** — ⚠️ ver `AGENTS.md`: esta é uma versão com breaking changes; consultar `node_modules/next/dist/docs/` antes de escrever código de Next.
- **Supabase** (`@supabase/ssr`) — Postgres + Auth + Storage + Realtime + RLS.
- **Tailwind 4** + **shadcn** + **Base UI** (`@base-ui/react`) para componentes.
- **Zustand** (estado), **Zod** (validação), **dnd-kit** (drag&drop), **Tiptap** (editor rich text), **Recharts** (gráficos), **date-fns** (com locale `ptBR`).
- Node >= 22. Scripts: `npm run dev` | `build` | `start`.

## Variáveis de ambiente (`.env.local`, NÃO commitado)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # secreta, ignora RLS — usada só em rotas server (app/api/*, auth/callback)
NEXT_PUBLIC_ORG_ID=               # UUID da org; default hardcoded 00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_APP_URL=              # ex http://localhost:3000
```
Se faltarem URL/anon key, o `proxy.ts` entra em **DEV_PREVIEW** (auth via cookie `mwr_session`).

## Estrutura
- `app/` — rotas. Grupos: `(auth)` (login/register/forgot), `(dashboard)` (boards, projects, tasks, company, admin, me, settings). `app/api/*` = rotas server (usam service_role). `app/forms/[slug]` = formulários públicos.
- `features/<domínio>/` — organização por feature, cada uma com `components/`, `hooks/`, `store/` (Zustand), `services/` (acesso Supabase). Domínios: `auth`, `board`, `tasks`, `projects`, `timer`, `notifications`, `dashboard`.
- `lib/` — `supabase/{client,server,admin}.ts`, `roles.ts`, `boardAccess.ts`, `utils.ts` (helpers de data/formatação PT-BR + `getPositionBetween` p/ reordenação float). Vários `mock*.ts` p/ o modo preview.
- `components/` — `ui/` (shadcn) e `shared/`.
- `types/database.ts` — tipos das tabelas do Supabase (Database generics).

## Banco de dados (Supabase)
⚠️ **O schema real evoluiu ALÉM das migrations numeradas.** A fonte de verdade é:
`supabase/migrations/001_initial_schema.sql` + `002_v2_schema.sql` **MAIS** os patches soltos na raiz `supabase_*.sql`. Ao mexer no banco, revisar TODOS eles.

Tabelas principais: `organizations`, `members` (role: owner/admin/member/viewer), `profiles`, `projects` (=boards), `columns`, `tasks`, `labels`/`task_labels`, `comments`, `checklist_items`.
V2 e patches: `task_types`, `areas`, `task_assignees`, `task_sequences` (fila sequencial de responsáveis — patch `sequence_parts` adiciona `part_start_hours`/`hours_spent`/`delivered_at`/`delivery_note`/`delivery_link`), `time_entries`, `active_timers`, `saved_filters`, `automations`, `notifications`, `mural_channels`/`mural_posts`, `task_approvals` (patch privacy), `project_members` + `projects.is_private`/`access_all_*` (patch board_access), `task_attachments` + bucket `task-files` (patch files), `task_activity` + `task_followers` + trigger `log_task_activity` (patch history_followers).
Funções: `get_user_orgs()`, `is_org_admin(org_id)`, `generate_recurring_tasks()` (pg_cron diário).

**RLS:** todas as tabelas têm RLS; padrão `org_id = ANY(get_user_orgs())`. Por isso o front injeta `org_id: ORG_ID` em todo insert.

## Padrões de código (seguir ao fazer ajustes)
- **Acesso a dados** só via `features/*/services/*.ts`. Padrão: `createClient()` (tipado) para **leituras** com joins; `createRawClient()` (não-tipado) para **inserts/updates** (evita problemas de inferência TS). Todo insert injeta `org_id: ORG_ID`.
- **Estado do board:** `boardStore` (Zustand, `subscribeWithSelector`) com atualização **otimista**. `useBoardData` carrega colunas+tasks+sequences no nível da página. `useBoardRealtime` assina `postgres_changes` no canal `board:${projectId}` e deconflita por `updated_at` (só aplica se server >= local).
- **Reordenação (drag):** posições são floats via `getPositionBetween()` — O(1), sem cascata.
- **Papéis:** `lib/roles.ts` mapeia `members.role` → AppRole (`superadmin`/`admin`/`user`) com matriz de permissões e `can(role, perm)`. Hook `useRole`.
- **Acesso a board:** `lib/boardAccess.ts` → `computeBoardAccess(...)` combina board privado + `project_members` + flags `access_all_*` + org admin.
- **Timer:** `timerService` — 1 timer ativo por usuário (`active_timers`); `stop()` calcula duração, grava `time_entry` e acumula em `task.tracked_hours`.
- **Fila de responsáveis:** `sequenceService.syncHeadAndAssignee()` e `advance()` gerenciam quem é o responsável ativo e o delta de horas por parte. `task.assignee_id` sempre reflete a cabeça da fila.
- **i18n:** UI em **português (pt-BR)**. Datas via helpers de `lib/utils.ts`.

## Convenções gerais
- App Router: Server Components por padrão; `"use client"` onde houver estado/efeitos.
- `proxy.ts` = camada de auth/redirect (equivalente a middleware). Rotas públicas: login, forgot-password, invite, register, auth/callback.
- `next.config.ts`: imagens permitidas de `*.supabase.co/storage` e `avatars.githubusercontent.com`; headers de segurança (nosniff, frame DENY).

## Antes de mexer / depois de mexer
- `npx tsc --noEmit` para checar tipos (estado base tem que passar).
- Se a mudança tocar o banco: escrever um novo `supabase_*.sql` idempotente (seguindo o padrão dos patches existentes) e aplicá-lo no Supabase — não editar migrations antigas.
- Verificar em runtime com `npm run dev` sempre que a mudança for observável no browser.
