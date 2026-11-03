-- ==========================================================
-- sql/011_pel_login.sql
-- Calculadora PEL · login, perfis (Gestão / Analista) e dados por site
-- Rodar UMA vez no projeto do Supabase DA CALCULADORA PEL
-- (projeto separado do Gestão de Qualidade; veja o LEIAME.md):
-- SQL Editor > New query > colar tudo > Run.
-- Este script só CRIA coisas. Não apaga nenhuma tabela nem dado.
-- ==========================================================

-- ----------------------------------------------------------
-- 1) Perfis: um por conta criada na tela de login da Calculadora
--    papel: pendente  -> conta nova, ainda sem acesso
--           analista  -> preenche a calculadora do próprio site
--           gestao    -> vê todos os sites e edita indicadores e metas
--           admin     -> tudo da Gestão + libera contas e cadastra sites
--           bloqueado -> conta sem acesso
-- ----------------------------------------------------------
create table if not exists public.pel_perfis (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  email         text        not null,
  nome          text        not null default '',
  site          text        not null default '',
  papel         text        not null default 'pendente',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pel_perfis_papel_valido
    check (papel in ('pendente', 'analista', 'gestao', 'admin', 'bloqueado'))
);

comment on table public.pel_perfis is
  'Contas da Calculadora PEL. Toda conta nova nasce como pendente; só o administrador muda o papel e o site.';

-- 2) Sites (o administrador cadastra pela tela "Sites")
create table if not exists public.pel_sites (
  codigo    text        primary key,
  nome      text        not null default '',
  regional  text        not null default '',
  criado_em timestamptz not null default now(),
  constraint pel_sites_codigo_preenchido check (length(trim(codigo)) > 0)
);

-- 3) Configuração única: nomes, descrições, fórmulas, pesos, metas e trimestre
create table if not exists public.pel_config (
  id             int         primary key default 1,
  dados          jsonb       not null default '{}'::jsonb,
  atualizado_por uuid        references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  constraint pel_config_linha_unica check (id = 1)
);
insert into public.pel_config (id, dados) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

-- 4) Lançamentos: os valores de cada site em cada trimestre
create table if not exists public.pel_lancamentos (
  site           text        not null references public.pel_sites(codigo) on update cascade on delete cascade,
  periodo        text        not null,
  dados          jsonb       not null default '{}'::jsonb,
  atualizado_por uuid        references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (site, periodo)
);

-- ----------------------------------------------------------
-- 5) Funções de apoio (leem o papel e o site de quem está logado)
-- ----------------------------------------------------------
create or replace function public.pel_meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.pel_perfis where user_id = auth.uid()
$$;

create or replace function public.pel_meu_site()
returns text language sql stable security definer set search_path = public as $$
  select site from public.pel_perfis where user_id = auth.uid()
$$;

-- Toda conta nova com e-mail DHL ganha um perfil "pendente".
-- Contas de outros domínios não ganham perfil e não entram na Calculadora
-- (o cadastro em si não é bloqueado, para não afetar as outras abas do site).
create or replace function public.pel_criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) like '%@dhl.com' then
    insert into public.pel_perfis (user_id, email, nome)
    values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists pel_ao_criar_usuario on auth.users;
create trigger pel_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.pel_criar_perfil();

-- Ninguém muda o próprio papel ou site; o administrador muda o dos outros.
create or replace function public.pel_proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.pel_meu_papel() is distinct from 'admin' then
    raise exception 'Só o administrador pode alterar papel e site.';
  end if;
  if new.user_id = auth.uid() and new.papel <> 'admin' then
    raise exception 'O administrador não pode tirar o próprio acesso de administrador.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists pel_perfis_protecao on public.pel_perfis;
create trigger pel_perfis_protecao
  before update on public.pel_perfis
  for each row execute function public.pel_proteger_perfil();

-- ----------------------------------------------------------
-- 6) Segurança por linha (RLS)
-- ----------------------------------------------------------
alter table public.pel_perfis      enable row level security;
alter table public.pel_sites       enable row level security;
alter table public.pel_config      enable row level security;
alter table public.pel_lancamentos enable row level security;

revoke all on public.pel_perfis, public.pel_sites, public.pel_config, public.pel_lancamentos from anon;
grant select, update                 on public.pel_perfis      to authenticated;
grant select, insert, update, delete on public.pel_sites       to authenticated;
grant select, insert, update         on public.pel_config      to authenticated;
grant select, insert, update, delete on public.pel_lancamentos to authenticated;

-- Perfis: cada um vê o seu; Gestão e admin veem todos; só admin altera
drop policy if exists "pel_perfis_ler"     on public.pel_perfis;
drop policy if exists "pel_perfis_alterar" on public.pel_perfis;
create policy "pel_perfis_ler" on public.pel_perfis for select to authenticated
  using (user_id = auth.uid() or public.pel_meu_papel() in ('gestao', 'admin'));
create policy "pel_perfis_alterar" on public.pel_perfis for update to authenticated
  using (public.pel_meu_papel() = 'admin') with check (public.pel_meu_papel() = 'admin');

-- Sites: quem tem acesso lê; só admin cadastra, altera e exclui
drop policy if exists "pel_sites_ler"      on public.pel_sites;
drop policy if exists "pel_sites_gravar"   on public.pel_sites;
drop policy if exists "pel_sites_alterar"  on public.pel_sites;
drop policy if exists "pel_sites_excluir"  on public.pel_sites;
create policy "pel_sites_ler" on public.pel_sites for select to authenticated
  using (public.pel_meu_papel() in ('analista', 'gestao', 'admin'));
create policy "pel_sites_gravar" on public.pel_sites for insert to authenticated
  with check (public.pel_meu_papel() = 'admin');
create policy "pel_sites_alterar" on public.pel_sites for update to authenticated
  using (public.pel_meu_papel() = 'admin') with check (public.pel_meu_papel() = 'admin');
create policy "pel_sites_excluir" on public.pel_sites for delete to authenticated
  using (public.pel_meu_papel() = 'admin');

-- Configuração: quem tem acesso lê; Gestão e admin editam
drop policy if exists "pel_config_ler"     on public.pel_config;
drop policy if exists "pel_config_gravar"  on public.pel_config;
drop policy if exists "pel_config_alterar" on public.pel_config;
create policy "pel_config_ler" on public.pel_config for select to authenticated
  using (public.pel_meu_papel() in ('analista', 'gestao', 'admin'));
create policy "pel_config_gravar" on public.pel_config for insert to authenticated
  with check (public.pel_meu_papel() in ('gestao', 'admin'));
create policy "pel_config_alterar" on public.pel_config for update to authenticated
  using (public.pel_meu_papel() in ('gestao', 'admin'))
  with check (public.pel_meu_papel() in ('gestao', 'admin'));

-- Lançamentos: analista lê e grava só o próprio site;
-- Gestão lê todos (sem alterar); admin lê e grava todos
drop policy if exists "pel_lanc_ler"     on public.pel_lancamentos;
drop policy if exists "pel_lanc_gravar"  on public.pel_lancamentos;
drop policy if exists "pel_lanc_alterar" on public.pel_lancamentos;
drop policy if exists "pel_lanc_excluir" on public.pel_lancamentos;
create policy "pel_lanc_ler" on public.pel_lancamentos for select to authenticated
  using (public.pel_meu_papel() in ('gestao', 'admin')
         or (public.pel_meu_papel() = 'analista' and site = public.pel_meu_site()));
create policy "pel_lanc_gravar" on public.pel_lancamentos for insert to authenticated
  with check (public.pel_meu_papel() = 'admin'
              or (public.pel_meu_papel() = 'analista' and site = public.pel_meu_site()));
create policy "pel_lanc_alterar" on public.pel_lancamentos for update to authenticated
  using (public.pel_meu_papel() = 'admin'
         or (public.pel_meu_papel() = 'analista' and site = public.pel_meu_site()))
  with check (public.pel_meu_papel() = 'admin'
              or (public.pel_meu_papel() = 'analista' and site = public.pel_meu_site()));
create policy "pel_lanc_excluir" on public.pel_lancamentos for delete to authenticated
  using (public.pel_meu_papel() = 'admin');

-- ----------------------------------------------------------
-- 7) Contas que já existiam antes deste script e usam e-mail DHL
--    ganham um perfil pendente (para aparecerem na tela Usuários)
-- ----------------------------------------------------------
insert into public.pel_perfis (user_id, email, nome)
select id, lower(email), coalesce(raw_user_meta_data ->> 'nome', '')
from auth.users
where lower(email) like '%@dhl.com'
on conflict (user_id) do nothing;

-- ==========================================================
-- 8) PASSO FINAL — tornar você o administrador
--    Depois de criar a sua conta na tela da Calculadora e confirmar o
--    e-mail, troque o endereço abaixo pelo seu, tire os dois traços (--)
--    do começo das três linhas e rode SÓ elas numa nova query:
--
-- alter table public.pel_perfis disable trigger pel_perfis_protecao;
-- update public.pel_perfis set papel = 'admin' where email = 'seu.nome@dhl.com';
-- alter table public.pel_perfis enable trigger pel_perfis_protecao;
-- ==========================================================
