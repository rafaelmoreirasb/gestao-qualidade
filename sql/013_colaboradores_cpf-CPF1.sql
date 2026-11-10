-- ==========================================================
-- sql/013_colaboradores_cpf.sql
-- Colaboradores · guardar o CPF
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA a coluna CPF. Não apaga nenhuma tabela nem dado.
-- Pode rodar de novo sem problema (não duplica nada).
-- ==========================================================

-- 1) Nova coluna (vazia para quem já está cadastrado; a planilha preenche)
alter table public.colaboradores
  add column if not exists cpf text;

-- 2) O CPF é guardado só com os 11 números (sem ponto e traço)
alter table public.colaboradores
  drop constraint if exists colaboradores_cpf_valido;
alter table public.colaboradores
  add constraint colaboradores_cpf_valido check (cpf is null or cpf ~ '^[0-9]{11}$');

-- 3) Índice para a busca por CPF ficar rápida
--    (não é "único": a mesma pessoa pode voltar com outra matrícula)
create index if not exists colaboradores_cpf_idx on public.colaboradores (cpf);

comment on column public.colaboradores.cpf is
  'CPF só com os 11 números. Vem da planilha de ativos do RH. Só o Administrador lê esta tabela.';

comment on table public.colaboradores is
  'Base de pessoas. Matrícula, nome, CPF, setor e status. Quem sai da empresa vira Desligado; excluir só para corrigir cadastro errado.';
