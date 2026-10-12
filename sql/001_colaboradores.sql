-- ==========================================================
-- sql/001_colaboradores.sql
-- Fase 1 · Tabela de colaboradores
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só CRIA coisas. Não apaga nenhuma tabela nem dado.
-- ==========================================================

-- 1) Tabela
create table if not exists public.colaboradores (
  id         bigint generated always as identity primary key,
  matricula  text        not null,
  nome       text        not null,
  setor      text        not null default '',
  status     text        not null default 'Ativo',
  criado_em  timestamptz not null default now(),
  constraint colaboradores_matricula_unica unique (matricula),
  constraint colaboradores_status_valido check (status in ('Ativo', 'Desligado')),
  constraint colaboradores_matricula_preenchida check (length(trim(matricula)) > 0),
  constraint colaboradores_nome_preenchido check (length(trim(nome)) > 0)
);

comment on table public.colaboradores is
  'Base de pessoas. Só matrícula, nome, setor e status. Quem sai da empresa vira Desligado; excluir só para corrigir cadastro errado.';

-- 2) Segurança por linha (RLS): só o usuário logado lê e grava
alter table public.colaboradores enable row level security;

-- Visitante sem login (anon) não tem acesso nenhum
revoke all on public.colaboradores from anon;

-- Usuário logado pode ler, cadastrar, alterar e excluir
grant select, insert, update, delete on public.colaboradores to authenticated;

-- As linhas abaixo só recriam as REGRAS de acesso (não mexem em dados)
drop policy if exists "colaboradores_ler"      on public.colaboradores;
drop policy if exists "colaboradores_cadastrar" on public.colaboradores;
drop policy if exists "colaboradores_alterar"  on public.colaboradores;
drop policy if exists "colaboradores_excluir"  on public.colaboradores;

create policy "colaboradores_ler"
  on public.colaboradores for select to authenticated using (true);

create policy "colaboradores_cadastrar"
  on public.colaboradores for insert to authenticated with check (true);

create policy "colaboradores_alterar"
  on public.colaboradores for update to authenticated using (true) with check (true);

-- Exclusão existe só para corrigir cadastro feito errado.
-- Nas próximas fases, quem tiver histórico (Gemba, treinamentos...) ficará
-- protegido pelo próprio banco e só poderá ser marcado como Desligado.
create policy "colaboradores_excluir"
  on public.colaboradores for delete to authenticated using (true);
