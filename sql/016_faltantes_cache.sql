-- ==========================================================
-- sql/016_faltantes_cache.sql
-- Aba Faltante Aduana · cache do servidor (api/faltantes.js)
-- Rodar UMA vez no Supabase (projeto gestao-qualidade):
-- SQL Editor > New query > colar tudo > Run.
-- Só CRIA a tabela. Não apaga nada.
--
-- Os dados do painel continuam na planilha do Google Sheets. Esta tabela só guarda,
-- por alguns minutos, o resultado já calculado (para o painel abrir rápido).
-- Ninguém do app lê ou grava nela direto: só o servidor, com a chave secreta.
-- ==========================================================

create table if not exists public.faltantes_cache (
  chave  text        primary key,
  valor  text        not null,
  expira timestamptz not null
);

comment on table public.faltantes_cache is
  'Cache do painel Faltante Aduana (resultado calculado da planilha). Pode ser apagado a qualquer momento.';

alter table public.faltantes_cache enable row level security;
revoke all on public.faltantes_cache from anon, authenticated;
-- Sem nenhuma policy: só a chave secreta (service role, usada em api/faltantes.js) acessa.
