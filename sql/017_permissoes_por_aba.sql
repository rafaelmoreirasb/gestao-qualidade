-- ==========================================================
-- sql/017_permissoes_por_aba.sql
-- Fase 11 · Permissões por pessoa (18/11/2026)
--
-- O que muda:
-- 1) Papel novo "usuario" (Usuário): não entra na PEL, vê só as abas
--    que o Administrador marcar.
-- 2) Cada conta ganha a lista das suas abas (campo "abas"):
--    {"gemba":"editar","painel":"ver", ...}. Vazio = nenhuma aba extra.
-- 3) A tranca "só o Administrador mexe nas abas" (gq_so_administrador,
--    criada no 011) é trocada por regras por aba:
--    - para LER uma tabela, a conta precisa de Ver (ou Editar) numa aba
--      que usa essa tabela;
--    - para GRAVAR, precisa de Editar na aba dona da tabela.
--    O Administrador continua com acesso total.
--
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Não apaga nenhuma tabela nem dado. Pode ser rodado de novo sem duplicar.
-- Para desfazer: sql/desfazer-017.sql (volta a regra "só Administrador").
-- ==========================================================

-- 1) Abas de cada conta
alter table public.pel_perfis
  add column if not exists abas jsonb not null default '{}'::jsonb;

comment on column public.pel_perfis.abas is
  'Abas liberadas para a conta: {"aba":"ver"|"editar"}. Só o Administrador altera. O Administrador vê tudo sem precisar marcar.';

-- 2) Papel novo "usuario"
alter table public.pel_perfis drop constraint if exists pel_perfis_papel_valido;
alter table public.pel_perfis add constraint pel_perfis_papel_valido
  check (papel in ('pendente', 'usuario', 'analista', 'gestao', 'admin', 'bloqueado'));

-- 3) Qual aba usa qual tabela (e se a aba grava nela)
--    "storage:<pasta>" = pasta de arquivos do Storage.
create table if not exists public.gq_tabela_abas (
  tabela text    not null,
  aba    text    not null,
  grava  boolean not null default false,
  primary key (tabela, aba)
);

comment on table public.gq_tabela_abas is
  'Mapa usado pelas regras de acesso (sql/017): quais abas leem cada tabela e qual aba grava nela.';

alter table public.gq_tabela_abas enable row level security;
revoke all on public.gq_tabela_abas from anon, authenticated;

insert into public.gq_tabela_abas (tabela, aba, grava) values
  -- Colaboradores
  ('colaboradores',             'colaboradores', true),
  ('colaboradores',             'painel',        false),
  ('colaboradores',             'gemba',         false),
  ('colaboradores',             'eficacia',      false),
  ('colaboradores',             'cronograma',    false),
  -- Listas (LISTA_...): o Gemba cria itens com "+ Adicionar"
  ('listas',                    'gemba',         true),
  ('listas',                    'painel',        false),
  ('listas',                    'pokayoke',      false),
  ('listas',                    'planoacao',     false),
  -- Gemba
  ('registros_gemba',           'gemba',         true),
  ('registros_gemba',           'painel',        false),
  ('registros_gemba',           'eficacia',      false),
  ('storage:gemba',             'gemba',         true),
  ('storage:gemba',             'painel',        false),
  -- Cronograma
  ('treinamentos',              'cronograma',    true),
  ('treinamentos',              'painel',        false),
  ('treinamentos',              'colaboradores', false),
  ('treinamento_participantes', 'cronograma',    true),
  ('treinamento_participantes', 'painel',        false),
  ('treinamento_participantes', 'colaboradores', false),
  ('storage:treinamentos',      'cronograma',    true),
  -- Plano de ação
  ('planos_acao',               'planoacao',     true),
  -- Poka-Yoke
  ('pokayoke_erros',            'pokayoke',      true),
  ('pokayoke_erros',            'eficacia',      false),
  ('pokayoke_treinos',          'pokayoke',      true),
  ('pokayoke_treinos',          'eficacia',      false)
on conflict (tabela, aba) do update set grava = excluded.grava;
-- Tabela que não está no mapa (ex.: as da Torre de Aduana, se existirem)
-- continua só do Administrador.

-- 4) A conta logada pode ler (p_editar = false) ou gravar (true) nesta tabela?
create or replace function public.gq_pode(p_tabela text, p_editar boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p.papel = 'admin' then true
    when p.papel in ('usuario', 'analista', 'gestao') then exists (
      select 1 from public.gq_tabela_abas m
      where m.tabela = p_tabela
        and case when p_editar then m.grava and (p.abas ->> m.aba) = 'editar'
                 else (p.abas ->> m.aba) in ('ver', 'editar') end)
    else false
  end
  from (select 1) x
  left join public.pel_perfis p on p.user_id = auth.uid()
$$;
revoke all on function public.gq_pode(text, boolean) from public, anon;
grant execute on function public.gq_pode(text, boolean) to authenticated;

-- 5) Troca a tranca "só Administrador" pelas regras por aba
--    Regras "restritivas": somam-se às regras que cada tabela já tem.
do $$
declare t record;
begin
  for t in
    select c.relname as tabela
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'pel\_%'
  loop
    execute format('alter table public.%I enable row level security', t.tabela);
    execute format('drop policy if exists "gq_so_administrador" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_ler" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_inserir" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_alterar" on public.%I', t.tabela);
    execute format('drop policy if exists "gq_aba_excluir" on public.%I', t.tabela);
    execute format('create policy "gq_aba_ler" on public.%I as restrictive for select to authenticated using (public.gq_pode(%L, false))', t.tabela, t.tabela);
    execute format('create policy "gq_aba_inserir" on public.%I as restrictive for insert to authenticated with check (public.gq_pode(%L, true))', t.tabela, t.tabela);
    execute format('create policy "gq_aba_alterar" on public.%I as restrictive for update to authenticated using (public.gq_pode(%L, true)) with check (public.gq_pode(%L, true))', t.tabela, t.tabela, t.tabela);
    execute format('create policy "gq_aba_excluir" on public.%I as restrictive for delete to authenticated using (public.gq_pode(%L, true))', t.tabela, t.tabela);
  end loop;
end $$;

-- Fotos do Gemba e anexos do Cronograma (Storage)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "gq_so_administrador" on storage.objects';
    execute 'drop policy if exists "gq_aba_ler" on storage.objects';
    execute 'drop policy if exists "gq_aba_inserir" on storage.objects';
    execute 'drop policy if exists "gq_aba_alterar" on storage.objects';
    execute 'drop policy if exists "gq_aba_excluir" on storage.objects';
    execute $p$create policy "gq_aba_ler" on storage.objects as restrictive for select to authenticated using (public.gq_pode('storage:' || bucket_id, false))$p$;
    execute $p$create policy "gq_aba_inserir" on storage.objects as restrictive for insert to authenticated with check (public.gq_pode('storage:' || bucket_id, true))$p$;
    execute $p$create policy "gq_aba_alterar" on storage.objects as restrictive for update to authenticated using (public.gq_pode('storage:' || bucket_id, true)) with check (public.gq_pode('storage:' || bucket_id, true))$p$;
    execute $p$create policy "gq_aba_excluir" on storage.objects as restrictive for delete to authenticated using (public.gq_pode('storage:' || bucket_id, true))$p$;
  end if;
end $$;

-- ==========================================================
-- Pronto. As contas que já existem não mudam: Analista e Gestão continuam
-- vendo só a PEL até o Administrador marcar outras abas (subaba Usuários >
-- botão "Abas"). O Administrador continua com tudo.
-- ==========================================================
