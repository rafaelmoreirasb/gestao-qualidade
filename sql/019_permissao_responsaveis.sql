-- ==========================================================
-- sql/019_permissao_responsaveis.sql  (25/11/2026)
-- Faltante Aduana passa a ter DUAS permissões na aba Permissões:
--   "faltantes"     = sub-aba Faltantes            (já existia)
--   "responsaveis"  = sub-aba Responsáveis por ilha (nova)
-- Este arquivo só COPIA, para cada conta, o nível que ela já tem em
-- "faltantes" (Ver ou Editar) para "responsaveis". Assim ninguém perde
-- nem ganha acesso no dia da mudança; depois o Administrador ajusta
-- cada pessoa na aba Permissões.
-- Não apaga nada. Pode rodar mais de uma vez (quem já tem
-- "responsaveis" não é mexido).
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- ==========================================================

-- A proteção "só o Administrador altera perfis" (sql/011) não reconhece o SQL Editor,
-- então ela é desligada só durante a cópia e religada logo em seguida (tudo numa transação).
begin;
alter table public.pel_perfis disable trigger pel_perfis_protecao;

update public.pel_perfis
   set abas = abas || jsonb_build_object('responsaveis', abas -> 'faltantes')
 where abas ? 'faltantes'
   and not (abas ? 'responsaveis');

alter table public.pel_perfis enable trigger pel_perfis_protecao;
commit;

-- Conferência: contas com cada parte liberada
select count(*) filter (where abas ? 'faltantes')    as com_faltantes,
       count(*) filter (where abas ? 'responsaveis') as com_responsaveis
  from public.pel_perfis;
