-- ==========================================================
-- sql/015_gemba_editar.sql
-- Gemba (alteração) · Editar um registro em "Todos os Gemba"
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Este script só ACRESCENTA um campo, uma permissão e uma função.
-- Não apaga nenhuma tabela nem dado.
-- Se for rodado de novo por engano, nada é duplicado.
-- ==========================================================

-- 1) Quando o registro foi corrigido pela última vez (vazio = nunca)
alter table public.registros_gemba
  add column if not exists editado_em timestamptz;

comment on column public.registros_gemba.editado_em is
  'Última vez que o registro foi alterado pelo lápis em "Todos os Gemba". Vazio = nunca editado.';

-- 2) Permissão para ALTERAR registros do Gemba (antes: só ler, cadastrar e excluir).
--    A regra restritiva "gq_so_administrador" (sql/011) continua valendo:
--    só a conta Administrador mexe no Gemba.
grant update on public.registros_gemba to authenticated;

drop policy if exists "registros_gemba_alterar" on public.registros_gemba;
create policy "registros_gemba_alterar"
  on public.registros_gemba for update to authenticated
  using (true) with check (true);

-- 3) Função que grava a edição de um registro (grupo) de uma vez só:
--    - tira do registro quem foi desmarcado;
--    - atualiza dia, resultado, processo, motivo, ação, observação e fotos de quem ficou;
--    - acrescenta quem foi marcado.
--    Lista de pessoas vazia = registro "Sem colaborador" (uma linha sem pessoa).
--    Tudo ou nada: se algo falhar, nada muda.
--    Roda com as permissões de quem chama (security invoker), então as regras
--    de acesso da tabela continuam valendo.
create or replace function public.gemba_editar_registro(
  p_grupo          uuid,
  p_data           timestamptz,
  p_resultado      text,
  p_processo       text,
  p_motivo         text,
  p_acao           text,
  p_observacao     text,
  p_fotos          text[],
  p_colaboradores  bigint[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids bigint[] := coalesce(p_colaboradores, '{}');
begin
  if not exists (select 1 from public.registros_gemba where grupo = p_grupo) then
    raise exception 'Registro não encontrado (pode ter sido excluído).';
  end if;

  -- Quem saiu do registro
  if cardinality(v_ids) = 0 then
    delete from public.registros_gemba
     where grupo = p_grupo and colaborador_id is not null;
  else
    delete from public.registros_gemba
     where grupo = p_grupo
       and (colaborador_id is null or not (colaborador_id = any (v_ids)));
  end if;

  -- Quem ficou: dados novos
  update public.registros_gemba
     set data       = p_data,
         resultado  = p_resultado,
         processo   = p_processo,
         motivo     = p_motivo,
         acao       = p_acao,
         observacao = coalesce(p_observacao, ''),
         fotos      = coalesce(p_fotos, '{}'),
         editado_em = now()
   where grupo = p_grupo;

  -- Quem entrou
  if cardinality(v_ids) = 0 then
    if not exists (select 1 from public.registros_gemba where grupo = p_grupo) then
      insert into public.registros_gemba
        (colaborador_id, grupo, data, resultado, processo, motivo, acao, observacao, fotos, editado_em)
      values
        (null, p_grupo, p_data, p_resultado, p_processo, p_motivo, p_acao, coalesce(p_observacao, ''), coalesce(p_fotos, '{}'), now());
    end if;
  else
    insert into public.registros_gemba
      (colaborador_id, grupo, data, resultado, processo, motivo, acao, observacao, fotos, editado_em)
    select x, p_grupo, p_data, p_resultado, p_processo, p_motivo, p_acao, coalesce(p_observacao, ''), coalesce(p_fotos, '{}'), now()
      from (select distinct unnest(v_ids) as x) novos
     where not exists (
       select 1 from public.registros_gemba r
        where r.grupo = p_grupo and r.colaborador_id = novos.x
     );
  end if;
end;
$$;

revoke all on function public.gemba_editar_registro(uuid, timestamptz, text, text, text, text, text, text[], bigint[]) from public, anon;
grant execute on function public.gemba_editar_registro(uuid, timestamptz, text, text, text, text, text, text[], bigint[]) to authenticated;
