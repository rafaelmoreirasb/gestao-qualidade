-- ==========================================================
-- sql/018_colaboradores_base_ssp53.sql
-- Colaboradores · base nova (Base SSP53: Nome, CPF, User ext e Tipo)
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA colunas e uma função, e deixa a matrícula opcional.
-- Não apaga nenhuma tabela, coluna nem dado. Pode rodar de novo sem problema.
-- ==========================================================

-- 1) Colunas novas (vazias para quem já está cadastrado; a Base SSP53 preenche)
alter table public.colaboradores
  add column if not exists user_ext text;

alter table public.colaboradores
  add column if not exists tipo text;

-- 2) A base nova não tem matrícula: a matrícula passa a ser opcional.
--    As matrículas antigas continuam guardadas e continuam únicas.
alter table public.colaboradores
  alter column matricula drop not null;

-- 3) Índice para a busca por User ext ficar rápida
create index if not exists colaboradores_user_ext_idx on public.colaboradores (user_ext);

-- 4) Atualização em lote (usada pela atualização automática com a Base SSP53):
--    muda Nome, CPF, User ext e Tipo e deixa Ativo, mantendo o MESMO cadastro (mesmo id),
--    para todo o histórico (Gemba, Cronograma, Painel, Eficácia) continuar ligado à pessoa.
--    Roda com o login de quem usa (security invoker): as regras de acesso (RLS) continuam valendo.
create or replace function public.colaboradores_atualizar_lote(itens jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with dados as (
    select (x->>'id')::bigint            as id,
           x->>'nome'                    as nome,
           nullif(x->>'cpf', '')         as cpf,
           nullif(x->>'user_ext', '')    as user_ext,
           nullif(x->>'tipo', '')        as tipo
      from jsonb_array_elements(itens) as x
  ), feito as (
    update public.colaboradores c
       set nome = d.nome, cpf = d.cpf, user_ext = d.user_ext, tipo = d.tipo, status = 'Ativo'
      from dados d
     where c.id = d.id
    returning c.id
  )
  select count(*)::integer from feito;
$$;

revoke all on function public.colaboradores_atualizar_lote(jsonb) from public;
revoke all on function public.colaboradores_atualizar_lote(jsonb) from anon;
grant execute on function public.colaboradores_atualizar_lote(jsonb) to authenticated;

comment on column public.colaboradores.user_ext is
  'User ext da Base SSP53 (aba Colaboradores). Identificação que aparece no app no lugar da matrícula.';
comment on column public.colaboradores.tipo is
  'Tipo da Base SSP53: DHL, Full ou Diaristas.';
comment on column public.colaboradores.matricula is
  'Matrícula antiga (base do RH). Opcional desde o sql/018: quem entrou pela Base SSP53 não tem.';

comment on table public.colaboradores is
  'Base de pessoas. Nome, User ext, CPF, Tipo, status (e matrícula antiga). Atualizada pela Base SSP53; quem sai vira Desligado; excluir só para corrigir cadastro errado.';
