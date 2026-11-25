-- ==========================================================
-- sql/020_faltantes_foto.sql  (25/11/2026)
-- Aba Faltante Aduana · "FOTO DO DIA"
-- Rodar UMA vez no Supabase (projeto gestao-qualidade):
-- SQL Editor > New query > colar tudo > Run.
-- Só CRIA uma tabela nova. Não apaga nem altera nada que já existe.
--
-- Para que serve: a planilha Base SSP53 guarda só 15 dias (o resto vai para os
-- arquivos do Drive, por causa do limite de células do Google). Quando um dia
-- termina (passou a janela de 48 h de todos os pacotes), o servidor guarda aqui
-- uma FOTO do dia já calculado (pacotes, linha do tempo, auditoria de carrinho,
-- Volumoso × Sorting). Assim o painel continua mostrando o dia para sempre,
-- mesmo depois que a planilha foi arquivada (fechamento mensal, trimestral...).
-- As classificações manuais NÃO ficam aqui: continuam na aba "Classificação
-- manual" da planilha (que não é arquivada).
--
-- Ninguém do app lê ou grava nesta tabela direto: só o servidor (api/faltantes.js),
-- com a chave secreta (service role).
-- ==========================================================

create table if not exists public.faltantes_foto (
  dia        text        primary key,          -- 'DD/MM/AAAA'
  data       date        not null,             -- o mesmo dia, para ordenar
  n          integer     not null default 0,   -- quantos faltantes no dia
  valor      text        not null,             -- o dia calculado (JSON)
  origem     text        not null default '',  -- 'automática' ou 'recuperada dos arquivos'
  gerado_em  timestamptz not null default now()
);

comment on table public.faltantes_foto is
  'Foto de cada dia do painel Faltante Aduana (dados calculados), guardada para sempre. Não apagar.';

alter table public.faltantes_foto enable row level security;
revoke all on public.faltantes_foto from anon, authenticated;
-- Sem nenhuma policy: só a chave secreta (service role, usada em api/faltantes.js) acessa.

-- Conferência
select count(*) as fotos_guardadas from public.faltantes_foto;
