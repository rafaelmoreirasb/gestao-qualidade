-- ==========================================================
-- sql/007_cronograma_anexos.sql
-- Cronograma (alteração) · Foto da turma e lista de presença
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA colunas, uma pasta de arquivos e permissões.
-- Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Onde está guardado cada anexo do treinamento
--    (o "caminho" do arquivo dentro da pasta "treinamentos" do Storage).
--    Vazio = ainda sem anexo.
alter table public.treinamentos
  add column if not exists foto_caminho  text,
  add column if not exists lista_caminho text;

comment on column public.treinamentos.foto_caminho  is 'Foto da turma (JPEG), guardada no Storage, pasta treinamentos.';
comment on column public.treinamentos.lista_caminho is 'Lista de presença (PDF), guardada no Storage, pasta treinamentos.';

-- Permissão para alterar também estas duas colunas
-- (continua sem poder alterar tema, data e horário)
grant update (foto_caminho, lista_caminho) on public.treinamentos to authenticated;

-- 2) Pasta de arquivos "treinamentos" no Storage
--    PRIVADA: só abre com login (a lista de presença tem nomes de pessoas).
--    Aceita só JPEG, PNG e PDF, até 10 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('treinamentos', 'treinamentos', false, 10485760,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Regras de acesso aos arquivos: só o usuário logado, só nesta pasta
--    (as linhas abaixo só recriam as REGRAS; não mexem em arquivos)
drop policy if exists "treinamentos_arquivos_ler"     on storage.objects;
drop policy if exists "treinamentos_arquivos_enviar"  on storage.objects;
drop policy if exists "treinamentos_arquivos_trocar"  on storage.objects;
drop policy if exists "treinamentos_arquivos_remover" on storage.objects;

create policy "treinamentos_arquivos_ler"
  on storage.objects for select to authenticated
  using (bucket_id = 'treinamentos');

create policy "treinamentos_arquivos_enviar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'treinamentos');

create policy "treinamentos_arquivos_trocar"
  on storage.objects for update to authenticated
  using (bucket_id = 'treinamentos') with check (bucket_id = 'treinamentos');

-- Remover arquivo: usado só ao trocar/remover um anexo
-- ou ao excluir um treinamento lançado errado
create policy "treinamentos_arquivos_remover"
  on storage.objects for delete to authenticated
  using (bucket_id = 'treinamentos');
