-- ==========================================================
-- sql/002_gemba.sql
-- Fase 2 · Listas do sistema e registros do Gemba
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só CRIA coisas. Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Tabela das listas (todas as LISTA_...)
create table if not exists public.listas (
  id         bigint generated always as identity primary key,
  lista      text        not null,
  item       text        not null,
  ordem      integer     not null default 0,
  ativo      boolean     not null default true,
  criado_em  timestamptz not null default now(),
  constraint listas_item_unico unique (lista, item),
  constraint listas_nome_valido check (lista ~ '^LISTA_[A-Z0-9_]+$'),
  constraint listas_item_preenchido check (length(trim(item)) > 0)
);

comment on table public.listas is
  'Itens das listas do sistema (LISTA_...). Item removido fica com ativo = falso; nada é apagado.';

-- 2) Itens iniciais, iguais à página "Listas do Sistema"
--    LISTA_MOTIVOS_BK começa vazia (decisão da Fase 2: motivos reais
--    serão criados na tela, pelo "+ Adicionar").
insert into public.listas (lista, item, ordem) values
  ('LISTA_PROCESSOS', 'Etiquetagem', 1),
  ('LISTA_PROCESSOS', 'Indução', 2),
  ('LISTA_PROCESSOS', 'Sorting', 3),
  ('LISTA_PROCESSOS', 'Aduana', 4),
  ('LISTA_PROCESSOS', 'BK', 5),
  ('LISTA_PROCESSOS', 'Volumoso', 6),

  ('LISTA_MOTIVOS_ETIQUETAGEM', 'Etiqueta no lado errado', 1),
  ('LISTA_MOTIVOS_ETIQUETAGEM', 'Etiqueta ilegível ou amassada', 2),
  ('LISTA_MOTIVOS_ETIQUETAGEM', 'Etiqueta trocada', 3),
  ('LISTA_MOTIVOS_ETIQUETAGEM', 'Volume sem etiqueta', 4),

  ('LISTA_MOTIVOS_INDUCAO', 'Volume induzido fora do padrão', 1),
  ('LISTA_MOTIVOS_INDUCAO', 'Induzido sem leitura', 2),
  ('LISTA_MOTIVOS_INDUCAO', 'Espaçamento incorreto na esteira', 3),

  ('LISTA_MOTIVOS_SORTING', 'Volume na saída errada', 1),
  ('LISTA_MOTIVOS_SORTING', 'Leitura não conferida', 2),
  ('LISTA_MOTIVOS_SORTING', 'Mistura de destinos', 3),

  ('LISTA_MOTIVOS_ADUANA', 'Documentação ausente', 1),
  ('LISTA_MOTIVOS_ADUANA', 'Conferência não realizada', 2),
  ('LISTA_MOTIVOS_ADUANA', 'Volume sem identificação', 3),

  ('LISTA_MOTIVOS_VOLUMOSO', 'Manuseio inadequado', 1),
  ('LISTA_MOTIVOS_VOLUMOSO', 'Empilhamento fora do padrão', 2),
  ('LISTA_MOTIVOS_VOLUMOSO', 'Volume fora da área designada', 3),

  ('LISTA_ACOES', 'Orientação no local', 1),
  ('LISTA_ACOES', 'Treinamento reaplicado', 2),
  ('LISTA_ACOES', 'Feedback formal', 3),
  ('LISTA_ACOES', 'Acompanhar no próximo turno', 4),
  ('LISTA_ACOES', 'Escalado ao líder', 5)
on conflict (lista, item) do nothing;

-- 3) Tabela dos registros do Gemba
--    Processo, motivo e ação são guardados como TEXTO: se um nome de
--    lista mudar no futuro, os registros antigos continuam com o nome antigo.
--    O colaborador com registro fica protegido: não pode ser excluído
--    (só marcado como Desligado).
create table if not exists public.registros_gemba (
  id              bigint generated always as identity primary key,
  data            timestamptz not null default now(),
  colaborador_id  bigint      not null references public.colaboradores (id) on delete restrict,
  processo        text        not null,
  motivo          text        not null,
  acao            text        not null,
  observacao      text        not null default '',
  criado_em       timestamptz not null default now(),
  constraint registros_gemba_processo_preenchido check (length(trim(processo)) > 0),
  constraint registros_gemba_motivo_preenchido check (length(trim(motivo)) > 0),
  constraint registros_gemba_acao_preenchida check (length(trim(acao)) > 0)
);

comment on table public.registros_gemba is
  'Desvios registrados no Gemba. Exclusão só para corrigir lançamento feito errado.';

create index if not exists registros_gemba_data_idx on public.registros_gemba (data);
create index if not exists registros_gemba_colaborador_idx on public.registros_gemba (colaborador_id);

-- 4) Segurança por linha (RLS): só o usuário logado lê e grava
alter table public.listas enable row level security;
alter table public.registros_gemba enable row level security;

-- Visitante sem login (anon) não tem acesso nenhum
revoke all on public.listas from anon;
revoke all on public.registros_gemba from anon;

-- Listas: ler, acrescentar e alterar (desativar). Nunca apagar.
grant select, insert, update on public.listas to authenticated;

-- Registros: ler, cadastrar e excluir (lixeira só para lançamento errado)
grant select, insert, delete on public.registros_gemba to authenticated;

-- As linhas abaixo só recriam as REGRAS de acesso (não mexem em dados)
drop policy if exists "listas_ler"       on public.listas;
drop policy if exists "listas_cadastrar" on public.listas;
drop policy if exists "listas_alterar"   on public.listas;

create policy "listas_ler"
  on public.listas for select to authenticated using (true);

create policy "listas_cadastrar"
  on public.listas for insert to authenticated with check (true);

create policy "listas_alterar"
  on public.listas for update to authenticated using (true) with check (true);

drop policy if exists "registros_gemba_ler"       on public.registros_gemba;
drop policy if exists "registros_gemba_cadastrar" on public.registros_gemba;
drop policy if exists "registros_gemba_excluir"   on public.registros_gemba;

create policy "registros_gemba_ler"
  on public.registros_gemba for select to authenticated using (true);

create policy "registros_gemba_cadastrar"
  on public.registros_gemba for insert to authenticated with check (true);

create policy "registros_gemba_excluir"
  on public.registros_gemba for delete to authenticated using (true);
