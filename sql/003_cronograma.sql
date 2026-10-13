-- ==========================================================
-- sql/003_cronograma.sql
-- Fase 4 · Cronograma de treinamentos e participantes
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só CRIA coisas. Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Tabela dos treinamentos (Tema, Data e Horário)
create table if not exists public.treinamentos (
  id         bigint generated always as identity primary key,
  data       date        not null,
  hora       time        not null default '08:00',
  tema       text        not null,
  criado_em  timestamptz not null default now(),
  constraint treinamentos_tema_preenchido check (length(trim(tema)) > 0)
);

comment on table public.treinamentos is
  'Treinamentos do Cronograma. Participantes ficam em treinamento_participantes. Exclusão só para corrigir lançamento feito errado.';

create index if not exists treinamentos_data_idx on public.treinamentos (data);

-- 2) Quem participou de cada treinamento
--    - Se um treinamento lançado errado for excluído, a lista de
--      participantes dele sai junto (on delete cascade).
--    - O colaborador que participou fica protegido: não pode ser
--      excluído (só marcado como Desligado), igual ao Gemba.
--    - A mesma pessoa não entra duas vezes no mesmo treinamento.
create table if not exists public.treinamento_participantes (
  id              bigint generated always as identity primary key,
  treinamento_id  bigint      not null references public.treinamentos (id) on delete cascade,
  colaborador_id  bigint      not null references public.colaboradores (id) on delete restrict,
  criado_em       timestamptz not null default now(),
  constraint treinamento_participantes_unico unique (treinamento_id, colaborador_id)
);

comment on table public.treinamento_participantes is
  'Participantes de cada treinamento do Cronograma.';

create index if not exists treinamento_participantes_colaborador_idx
  on public.treinamento_participantes (colaborador_id);

-- 3) Segurança por linha (RLS): só o usuário logado lê e grava
alter table public.treinamentos enable row level security;
alter table public.treinamento_participantes enable row level security;

-- Visitante sem login (anon) não tem acesso nenhum
revoke all on public.treinamentos from anon;
revoke all on public.treinamento_participantes from anon;

-- Treinamentos: ler, criar e excluir (lixeira só para lançamento errado)
grant select, insert, delete on public.treinamentos to authenticated;

-- Participantes: ler, marcar (incluir) e desmarcar (retirar)
grant select, insert, delete on public.treinamento_participantes to authenticated;

-- As linhas abaixo só recriam as REGRAS de acesso (não mexem em dados)
drop policy if exists "treinamentos_ler"       on public.treinamentos;
drop policy if exists "treinamentos_cadastrar" on public.treinamentos;
drop policy if exists "treinamentos_excluir"   on public.treinamentos;

create policy "treinamentos_ler"
  on public.treinamentos for select to authenticated using (true);

create policy "treinamentos_cadastrar"
  on public.treinamentos for insert to authenticated with check (true);

create policy "treinamentos_excluir"
  on public.treinamentos for delete to authenticated using (true);

drop policy if exists "treinamento_participantes_ler"       on public.treinamento_participantes;
drop policy if exists "treinamento_participantes_cadastrar" on public.treinamento_participantes;
drop policy if exists "treinamento_participantes_excluir"   on public.treinamento_participantes;

create policy "treinamento_participantes_ler"
  on public.treinamento_participantes for select to authenticated using (true);

create policy "treinamento_participantes_cadastrar"
  on public.treinamento_participantes for insert to authenticated with check (true);

create policy "treinamento_participantes_excluir"
  on public.treinamento_participantes for delete to authenticated using (true);
