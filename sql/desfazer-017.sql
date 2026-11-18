-- ==========================================================
-- sql/desfazer-017.sql
-- Desfaz o sql/017_permissoes_por_aba.sql: volta a regra antiga
-- "só o Administrador mexe nas abas do app" (gq_so_administrador do 011).
-- Rodar só se precisar voltar atrás: SQL Editor > New query > colar tudo > Run.
-- Não apaga dados: o campo "abas" e o mapa gq_tabela_abas ficam guardados
-- (sem efeito), para não perder o que foi marcado.
-- Contas com papel "usuario" ficam sem acesso a nada até voltarem a ter
-- outro papel (o papel continua aceito pelo banco).
-- ==========================================================

do $$
declare t record;
begin
  for t in
    select c.relname as tabela
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'pel\_%'
  loop
    execute format('drop policy if exists "gq_aba_ler" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_inserir" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_alterar" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_excluir" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_so_administrador" on public.%I', t.tabela);
    execute format('create policy "gq_so_administrador" on public.%I as restrictive for all to authenticated using (public.gq_acesso_total()) with check (public.gq_acesso_total())', t.tabela);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "gq_aba_ler" on storage.objects';
    execute 'drop policy if exists "gq_aba_inserir" on storage.objects';
    execute 'drop policy if exists "gq_aba_alterar" on storage.objects';
    execute 'drop policy if exists "gq_aba_excluir" on storage.objects';
    execute 'drop policy if exists "gq_so_administrador" on storage.objects';
    execute 'create policy "gq_so_administrador" on storage.objects as restrictive for all to authenticated using (public.gq_acesso_total()) with check (public.gq_acesso_total())';
  end if;
end $$;
