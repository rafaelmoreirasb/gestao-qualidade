-- ==========================================================
-- sql/009_gemba_grupo_fotos.sql
-- Gemba (alteração) · Várias pessoas no mesmo registro e fotos
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA colunas, uma pasta de arquivos e permissões.
-- Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- (O número 008 fica reservado para a Torre de Aduana.)
-- ==========================================================

-- 1) Código do grupo: as pessoas salvas juntas no mesmo registro
--    do Gemba têm o mesmo código. Cada pessoa continua sendo uma
--    linha (um desvio). Os registros antigos ganham, cada um,
--    um código próprio (viram "grupos de 1 pessoa").
alter table public.registros_gemba
  add column if not exists grupo uuid not null default gen_random_uuid();

-- 2) Fotos do registro: lista de "caminhos" dos arquivos na pasta
--    "gemba" do Storage. Todas as pessoas do grupo têm a mesma lista.
--    Vazio = sem fotos (é o caso dos registros antigos).
alter table public.registros_gemba
  add column if not exists fotos text[] not null default '{}';

comment on column public.registros_gemba.grupo is 'Pessoas registradas juntas no mesmo salvamento do Gemba têm o mesmo grupo.';
comment on column public.registros_gemba.fotos is 'Fotos do registro (JPEG/PNG), guardadas no Storage, pasta gemba.';

create index if not exists registros_gemba_grupo_idx on public.registros_gemba (grupo);

-- 3) Pasta de arquivos "gemba" no Storage
--    PRIVADA: só abre com login (as fotos podem mostrar pessoas).
--    Aceita só JPEG e PNG, até 10 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gemba', 'gemba', false, 10485760,
        array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 4) Regras de acesso aos arquivos: só o usuário logado, só nesta pasta
--    (as linhas abaixo só recriam as REGRAS; não mexem em arquivos)
drop policy if exists "gemba_fotos_ler"     on storage.objects;
drop policy if exists "gemba_fotos_enviar"  on storage.objects;
drop policy if exists "gemba_fotos_remover" on storage.objects;

create policy "gemba_fotos_ler"
  on storage.objects for select to authenticated
  using (bucket_id = 'gemba');

create policy "gemba_fotos_enviar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gemba');

-- Remover foto: usado só quando o salvamento falha no meio
-- ou ao excluir um registro lançado errado (lixeira)
create policy "gemba_fotos_remover"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gemba');
