/* ==========================================================
   js/listas.js
   Leitura e acréscimo de itens nas listas do sistema (LISTA_...).
   Os nomes oficiais estão na página "Listas do Sistema".
   Item removido fica com ativo = falso (nada é apagado).
   Uso:
     const mapa = await carregarListas();   → { LISTA_ACOES: ['...', ...], ... }
     await adicionarItemLista('LISTA_ACOES', 'Novo item', 6);
     nomeListaMotivos('Indução')            → 'LISTA_MOTIVOS_INDUCAO'
   ========================================================== */

const LISTA_PROCESSOS = 'LISTA_PROCESSOS';
const LISTA_ACOES = 'LISTA_ACOES';

// Tira acentos e deixa em minúsculas (usado para comparar textos)
function textoSemAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Nome da lista de motivos de um processo: LISTA_MOTIVOS_<PROCESSO>
// (maiúsculas, sem acento, _ no lugar de espaço)
function nomeListaMotivos(processo) {
  const base = textoSemAcento(processo).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base ? 'LISTA_MOTIVOS_' + base : '';
}

// Lê todos os itens ativos, na ordem de cada lista
async function carregarListas() {
  const mapa = {};
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb.from('listas')
      .select('id, lista, item, ordem')
      .eq('ativo', true)
      .order('lista', { ascending: true })
      .order('ordem', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    data.forEach((r) => { (mapa[r.lista] = mapa[r.lista] || []).push(r.item); });
    if (data.length < PAGINA) break;
  }
  return mapa;
}

// Acrescenta um item numa lista. Se o item já existia e estava
// desativado, ele volta a ficar ativo.
async function adicionarItemLista(lista, item, ordem) {
  const { error } = await sb.from('listas').insert({ lista, item, ordem: ordem || 0 });
  if (!error) return;
  if (error.code === '23505') {
    const r = await sb.from('listas').update({ ativo: true }).eq('lista', lista).eq('item', item);
    if (r.error) throw r.error;
    return;
  }
  throw error;
}
