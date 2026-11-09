-- ==========================================================
-- sql/012_pel_site_no_cadastro.sql
-- Alteração PEL 1 (09/11/2026)
-- 1) No "Criar minha conta" a pessoa informa Site, Cidade e Regional.
--    O banco cadastra o site (se ainda não existir) e liga a conta a ele.
--    Se o site já existe, a conta entra nele e valem a Cidade e a
--    Regional do primeiro cadastro.
-- 2) Só o Administrador edita indicadores, pesos, metas e trimestre
--    (antes a Gestão também podia).
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Não apaga nenhuma tabela nem dado. A Cidade fica na coluna "nome"
-- de pel_sites (que já existe).
-- ==========================================================

-- 1) Conta nova: perfil Pendente + site informado no cadastro
create or replace function public.pel_criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_site     text := left(upper(trim(coalesce(new.raw_user_meta_data ->> 'site', ''))), 20);
  v_cidade   text := left(trim(coalesce(new.raw_user_meta_data ->> 'cidade', '')), 60);
  v_regional text := left(trim(coalesce(new.raw_user_meta_data ->> 'regional', '')), 30);
begin
  if lower(new.email) like '%@dhl.com' then
    if v_site <> '' then
      insert into public.pel_sites (codigo, nome, regional)
      values (v_site, v_cidade, v_regional)
      on conflict (codigo) do nothing;
    end if;
    insert into public.pel_perfis (user_id, email, nome, site)
    values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'nome', ''), v_site)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
-- (o gatilho pel_ao_criar_usuario criado no 011 já usa esta função)

-- 2) Configuração da calculadora: só o Administrador grava
drop policy if exists "pel_config_gravar"  on public.pel_config;
drop policy if exists "pel_config_alterar" on public.pel_config;
create policy "pel_config_gravar" on public.pel_config for insert to authenticated
  with check (public.pel_meu_papel() = 'admin');
create policy "pel_config_alterar" on public.pel_config for update to authenticated
  using (public.pel_meu_papel() = 'admin')
  with check (public.pel_meu_papel() = 'admin');

-- ==========================================================
-- Pronto. Para desfazer este script, rode de novo o 011_pel_login.sql
-- inteiro: ele volta a função e as regras como eram, sem apagar dados
-- (a sua conta continua Administrador).
-- ==========================================================
