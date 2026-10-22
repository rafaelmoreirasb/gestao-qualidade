-- ==========================================================
-- sql/010_gemba_colaborador_opcional.sql
-- Gemba (alteração) · Registro sem colaborador
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só tira a obrigatoriedade do colaborador.
-- Não apaga nenhuma tabela nem dado. Os registros antigos continuam iguais.
-- Se for rodado de novo por engano, não acontece nada.
-- ==========================================================

-- O colaborador passa a ser opcional no registro do Gemba.
-- Registro sem colaborador = desvio no processo, sem pessoa ligada.
-- A ligação com o cadastro continua protegida: quem tem registro
-- no Gemba continua sem poder ser excluído (só Desligado).
alter table public.registros_gemba
  alter column colaborador_id drop not null;

comment on column public.registros_gemba.colaborador_id is
  'Colaborador do desvio. Vazio = registro sem colaborador (não entra na Eficácia).';
