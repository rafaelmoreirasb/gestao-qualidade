-- ==========================================================
-- sql/006_pokayoke.sql
-- Fase 6 · Poka-Yoke: base acumulada de erros e "treinado hoje"
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só CRIA coisas. Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Lista dos tipos de erro do Poka-Yoke (colunas do ranking)
--    Itens 1 a 4 iguais à página "Listas do Sistema".
--    Item 5 "QR Sem PokaYoke" acrescentado em 14/10/2026 (autorizado).
insert into public.listas (lista, item, ordem) values
  ('LISTA_ERROS_POKAYOKE', 'Gaiola Errada', 1),
  ('LISTA_ERROS_POKAYOKE', 'Forçou Saída', 2),
  ('LISTA_ERROS_POKAYOKE', 'Falha Poka-Yoke', 3),
  ('LISTA_ERROS_POKAYOKE', 'Problema QR', 4),
  ('LISTA_ERROS_POKAYOKE', 'QR Sem PokaYoke', 5)
on conflict (lista, item) do nothing;

-- 2) Base acumulada de erros
--    Uma linha por dia + usuário (ext_...) + tipo de erro, com a quantidade.
--    chave_linha = "AAAA-MM-DD|usuario|tipo" e é ÚNICA:
--    importar a mesma planilha de novo não duplica nada.
create table if not exists public.pokayoke_erros (
  id           bigint generated always as identity primary key,
  data         date        not null,
  usuario      text        not null,
  tipo_erro    text        not null,
  quantidade   integer     not null,
  chave_linha  text        not null,
  importado_em timestamptz not null default now(),
  constraint pokayoke_erros_chave_unica unique (chave_linha),
  constraint pokayoke_erros_usuario_preenchido check (length(trim(usuario)) > 0),
  constraint pokayoke_erros_tipo_preenchido check (length(trim(tipo_erro)) > 0),
  constraint pokayoke_erros_quantidade_valida check (quantidade > 0)
);

comment on table public.pokayoke_erros is
  'Erros do Poka-Yoke importados da planilha diária. Base acumulada: nada é apagado.';

create index if not exists pokayoke_erros_usuario_idx on public.pokayoke_erros (usuario);
create index if not exists pokayoke_erros_data_idx on public.pokayoke_erros (data);

-- 3) Treinos do Poka-Yoke (caixa "treinado hoje")
--    Um treino por usuário por dia. erros_tratados = "A treinar" na hora do treino.
create table if not exists public.pokayoke_treinos (
  id              bigint generated always as identity primary key,
  usuario         text        not null,
  data            date        not null,
  erros_tratados  integer     not null default 0,
  criado_em       timestamptz not null default now(),
  constraint pokayoke_treinos_um_por_dia unique (usuario, data),
  constraint pokayoke_treinos_usuario_preenchido check (length(trim(usuario)) > 0)
);

comment on table public.pokayoke_treinos is
  'Treinos marcados no ranking do Poka-Yoke. Desmarcar só para corrigir marcação errada.';

-- 4) Resumos calculados no banco (assim a tela não precisa baixar a base inteira)
--    security_invoker = true: o resumo respeita as mesmas regras de login das tabelas.
create or replace view public.pokayoke_ranking
  with (security_invoker = true) as
select
  e.usuario,
  e.tipo_erro,
  sum(e.quantidade)::integer as total,
  sum(case when t.ultimo is null or e.data > t.ultimo then e.quantidade else 0 end)::integer as pendente
from public.pokayoke_erros e
left join (
  select usuario, max(data) as ultimo
  from public.pokayoke_treinos
  group by usuario
) t on t.usuario = e.usuario
group by e.usuario, e.tipo_erro;

create or replace view public.pokayoke_base
  with (security_invoker = true) as
select
  count(distinct data)::integer as dias,
  min(data) as primeiro_dia,
  max(data) as ultimo_dia,
  max(importado_em) as ultima_importacao,
  coalesce(sum(quantidade), 0)::integer as erros
from public.pokayoke_erros;

-- 5) Segurança por linha (RLS): só o usuário logado lê e grava
alter table public.pokayoke_erros enable row level security;
alter table public.pokayoke_treinos enable row level security;

-- Visitante sem login (anon) não tem acesso nenhum
revoke all on public.pokayoke_erros from anon;
revoke all on public.pokayoke_treinos from anon;
revoke all on public.pokayoke_ranking from anon;
revoke all on public.pokayoke_base from anon;

-- Erros: ler e importar. Nunca alterar nem apagar (base acumulada).
grant select, insert on public.pokayoke_erros to authenticated;

-- Treinos: ler, marcar e desmarcar (desmarcar só para corrigir)
grant select, insert, delete on public.pokayoke_treinos to authenticated;

-- Resumos: só leitura
grant select on public.pokayoke_ranking to authenticated;
grant select on public.pokayoke_base to authenticated;

-- As linhas abaixo só recriam as REGRAS de acesso (não mexem em dados)
drop policy if exists "pokayoke_erros_ler"      on public.pokayoke_erros;
drop policy if exists "pokayoke_erros_importar" on public.pokayoke_erros;

create policy "pokayoke_erros_ler"
  on public.pokayoke_erros for select to authenticated using (true);

create policy "pokayoke_erros_importar"
  on public.pokayoke_erros for insert to authenticated with check (true);

drop policy if exists "pokayoke_treinos_ler"       on public.pokayoke_treinos;
drop policy if exists "pokayoke_treinos_marcar"    on public.pokayoke_treinos;
drop policy if exists "pokayoke_treinos_desmarcar" on public.pokayoke_treinos;

create policy "pokayoke_treinos_ler"
  on public.pokayoke_treinos for select to authenticated using (true);

create policy "pokayoke_treinos_marcar"
  on public.pokayoke_treinos for insert to authenticated with check (true);

create policy "pokayoke_treinos_desmarcar"
  on public.pokayoke_treinos for delete to authenticated using (true);
