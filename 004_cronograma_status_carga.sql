-- ==========================================================
-- sql/004_cronograma_status_carga.sql
-- Fase 4 (ajustes) · Status manual e carga horária dos treinamentos
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA colunas e permissões.
-- Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada muda.
-- ==========================================================

-- 1) Carga horária, guardada em MINUTOS (ex.: 00:10 = 10, 01:30 = 90).
--    Pode ficar vazia só nos treinamentos criados antes deste ajuste;
--    os novos são criados sempre com carga (o app exige).
alter table public.treinamentos
  add column if not exists carga_minutos integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'treinamentos_carga_valida'
  ) then
    alter table public.treinamentos
      add constraint treinamentos_carga_valida
      check (carga_minutos is null or (carga_minutos > 0 and carga_minutos <= 5999));
  end if;
end $$;

-- 2) Status escolhido por você: Agendado ou Realizado.
--    Na primeira vez que este script roda, os treinamentos que já existiam
--    com data passada E com participantes viram "Realizado" (era assim que o
--    app mostrava antes). Todos os outros ficam "Agendado".
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treinamentos' and column_name = 'status'
  ) then
    alter table public.treinamentos
      add column status text not null default 'Agendado';

    alter table public.treinamentos
      add constraint treinamentos_status_valido check (status in ('Agendado', 'Realizado'));

    update public.treinamentos t
       set status = 'Realizado'
     where t.data < current_date
       and exists (select 1 from public.treinamento_participantes p where p.treinamento_id = t.id);
  end if;
end $$;

-- 3) Permissão para ALTERAR só a carga horária e o status
--    (tema, data e horário continuam sem edição)
grant update (carga_minutos, status) on public.treinamentos to authenticated;

-- A linha abaixo só recria a REGRA de acesso (não mexe em dados)
drop policy if exists "treinamentos_alterar" on public.treinamentos;

create policy "treinamentos_alterar"
  on public.treinamentos for update to authenticated using (true) with check (true);
