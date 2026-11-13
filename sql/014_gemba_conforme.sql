-- ==========================================================
-- sql/014_gemba_conforme.sql
-- Gemba (alteração) · Registrar também quando está CONFORME
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA um campo e ajusta regras.
-- Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Resultado da observação: Desvio (erro) ou Conforme (fazendo certo).
--    Todos os registros que já existem ficam como Desvio (eram isso mesmo).
alter table public.registros_gemba
  add column if not exists resultado text not null default 'Desvio';

alter table public.registros_gemba
  drop constraint if exists registros_gemba_resultado_valido;
alter table public.registros_gemba
  add constraint registros_gemba_resultado_valido
  check (resultado in ('Desvio', 'Conforme'));

comment on column public.registros_gemba.resultado is
  'Desvio = erro encontrado; Conforme = pessoa/processo observado fazendo certo. Uma linha por pessoa observada.';

-- 2) Motivo e ação: obrigatórios só no Desvio.
--    No Conforme ficam vazios (não há erro nem ação).
alter table public.registros_gemba alter column motivo drop not null;
alter table public.registros_gemba alter column acao   drop not null;

alter table public.registros_gemba
  drop constraint if exists registros_gemba_desvio_completo;
alter table public.registros_gemba
  add constraint registros_gemba_desvio_completo
  check (resultado = 'Conforme' or (motivo is not null and acao is not null));

create index if not exists registros_gemba_resultado_idx on public.registros_gemba (resultado);
