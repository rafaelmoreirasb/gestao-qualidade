/* ==========================================================
   js/pokayoke.js
   Aba Poka-Yoke: base acumulada de erros e ranking para treinamento.
   - Importa a planilha diária (.xlsx ou .csv) com as colunas
     Data, User, Gaiola Errada, Forçou Saída, Falha PokaYoke,
     Problema QR, QR Sem PokaYoke (Total Errado e %Bipes Corretos
     são ignorados). Soma à base sem duplicar linhas.
   - Ranking por usuário (ext_...): "A treinar" = erros com data
     depois do último treino. Caixa "treinado hoje" manda a pessoa
     para o fim do ranking; o total histórico continua.
   - Tipos de erro = itens ativos da LISTA_ERROS_POKAYOKE.
   Tabelas: pokayoke_erros, pokayoke_treinos.
   Resumos (views): pokayoke_ranking, pokayoke_base.
   ========================================================== */

const LISTA_ERROS_POKAYOKE = 'LISTA_ERROS_POKAYOKE';

/* ---------- Leitura da planilha (funções sem tela) ---------- */

// Deixa só letras e números, sem acento e em minúsculas.
// "Falha PokaYoke" e "Falha Poka-Yoke" viram "falhapokayoke".
function pyNormalizar(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Converte o valor da coluna Data em 'AAAA-MM-DD' (ou null se não der).
// Aceita: número do Excel (ex.: 46308), 13/10/2026, 13/10/26, 2026-10-13.
function pyData(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let a, m, d;
  let r;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    a = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    a = Number(r[1]); m = Number(r[2]); d = Number(r[3]);
  } else if ((r = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) {
    d = Number(r[1]); m = Number(r[2]); a = Number(r[3]);
    if (a < 100) a += 2000;
  } else {
    return null;
  }
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// Quantidade de uma célula (vazio, traço ou texto = 0)
function pyQtd(v) {
  const s = String(v == null ? '' : v).trim().replace(',', '.');
  if (!s || s === '-') return 0;
  const n = Number(s);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

// Transforma as linhas lidas da planilha nos registros da base.
//   linhas: resultado de lerPlanilha()
//   tipos:  itens da LISTA_ERROS_POKAYOKE
//   hoje:   'AAAA-MM-DD' (datas depois de hoje são recusadas)
// Devolve { registros, lidas, ignoradas, futuras, colunasIgnoradas, tiposUsados }
function pyInterpretarPlanilha(linhas, tipos, hoje) {
  const IGNORAR = ['totalerrado', 'total', 'bipescorretos', 'percentualbipescorretos'];
  const iCab = linhas.findIndex((l) => {
    const n = (l || []).map(pyNormalizar);
    return n.includes('data') && (n.includes('user') || n.includes('usuario'));
  });
  if (iCab < 0) throw new Error('não encontrei as colunas Data e User no cabeçalho');

  const cab = linhas[iCab].map((c) => String(c == null ? '' : c).trim());
  const cabN = cab.map(pyNormalizar);
  const iData = cabN.indexOf('data');
  const iUser = cabN.indexOf('user') >= 0 ? cabN.indexOf('user') : cabN.indexOf('usuario');

  const porNome = {};
  tipos.forEach((t) => { porNome[pyNormalizar(t)] = t; });

  const colunasTipo = [];       // [índice da coluna, tipo da lista]
  const colunasIgnoradas = [];  // colunas que não são tipo da lista
  cabN.forEach((n, i) => {
    if (i === iData || i === iUser || !n || IGNORAR.includes(n)) return;
    if (porNome[n]) colunasTipo.push([i, porNome[n]]);
    else colunasIgnoradas.push(cab[i]);
  });
  if (!colunasTipo.length) throw new Error('nenhuma coluna de tipo de erro bate com a LISTA_ERROS_POKAYOKE');

  const somas = {};   // chave_linha → registro (mesmo dia + usuário + tipo no arquivo: soma)
  let lidas = 0, ignoradas = 0, futuras = 0;
  linhas.slice(iCab + 1).forEach((l) => {
    if (!l || !l.some((c) => String(c == null ? '' : c).trim())) return;  // linha em branco
    lidas++;
    const data = pyData(l[iData]);
    const usuario = String(l[iUser] == null ? '' : l[iUser]).trim().toLowerCase();
    if (!data || !usuario) { ignoradas++; return; }
    if (hoje && data > hoje) { futuras++; return; }
    colunasTipo.forEach(([i, tipo]) => {
      const q = pyQtd(l[i]);
      if (!q) return;
      const chave = data + '|' + usuario + '|' + tipo;
      if (somas[chave]) somas[chave].quantidade += q;
      else somas[chave] = { data, usuario, tipo_erro: tipo, quantidade: q, chave_linha: chave };
    });
  });

  return {
    registros: Object.values(somas),
    lidas, ignoradas, futuras,
    colunasIgnoradas,
    tiposUsados: colunasTipo.map((c) => c[1])
  };
}

/* ---------------------- Tela ---------------------- */

(function () {
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  if (!$('aba-pokayoke')) return;

  let tipos = [];          // tipos de erro (colunas do ranking)
  let ranking = [];        // linhas da view pokayoke_ranking
  let treinos = [];        // { id, usuario, data, erros_tratados }
  let base = null;         // linha da view pokayoke_base
  let carregadoPara = null;
  let carregando = false;
  const est = { busca: '' };

  /* ---------------- Ajudantes ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const hojeK = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dataBr = (k) => (k ? k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4) : '—');
  const dataCurta = (k) => (k ? k.slice(8, 10) + '/' + k.slice(5, 7) : '—');
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');

  function dataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function mostrarMsg(idCaixa, texto, ok) {
    const caixa = $(idCaixa);
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'mensagem ' + (ok ? 'mensagem-ok' : 'mensagem-erro');
    caixa.hidden = !texto;
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (code === '42P01' || code === 'PGRST205' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Poka-Yoke ainda não existem no banco. Rode o arquivo sql/006_pokayoke.sql no Supabase (SQL Editor).';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se o arquivo sql/006_pokayoke.sql foi rodado inteiro.';
    }
    if (m.includes('jwt')) return 'Sua sessão expirou. Clique em Sair e entre de novo.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Não foi possível conectar. Confira a internet e tente de novo.';
    return 'Algo deu errado: ' + ((e && e.message) || 'erro desconhecido') + '.';
  }

  /* ---------------- Ler do banco ---------------- */

  async function lerTudo(montar) {
    const todos = [];
    const PAGINA = 1000;
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await montar().range(de, de + PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < PAGINA) break;
    }
    return todos;
  }

  async function carregar(uid) {
    if (carregando) return;
    carregando = true;
    mostrarMsg('py-msg-geral', '');
    try {
      const [mapa, rk, tr, bs] = await Promise.all([
        carregarListas(),
        lerTudo(() => sb.from('pokayoke_ranking').select('usuario, tipo_erro, total, pendente').order('usuario', { ascending: true }).order('tipo_erro', { ascending: true })),
        lerTudo(() => sb.from('pokayoke_treinos').select('id, usuario, data, erros_tratados').order('data', { ascending: false }).order('id', { ascending: false })),
        sb.from('pokayoke_base').select('dias, primeiro_dia, ultimo_dia, ultima_importacao, erros').maybeSingle()
      ]);
      if (bs.error) throw bs.error;
      ranking = rk;
      treinos = tr;
      base = bs.data;
      // Colunas: itens ativos da lista + tipos antigos que ainda estejam na base
      tipos = (mapa[LISTA_ERROS_POKAYOKE] || []).slice();
      ranking.forEach((r) => { if (!tipos.includes(r.tipo_erro)) tipos.push(r.tipo_erro); });
      carregadoPara = uid;
      if (!(mapa[LISTA_ERROS_POKAYOKE] || []).length) {
        mostrarMsg('py-msg-geral', 'A LISTA_ERROS_POKAYOKE está vazia. Rode o arquivo sql/006_pokayoke.sql no Supabase (SQL Editor).', false);
      }
    } catch (e) {
      carregadoPara = null;
      ranking = []; treinos = []; base = null;
      mostrarMsg('py-msg-geral', 'Não foi possível carregar o Poka-Yoke. ' + traduzirErro(e), false);
    } finally {
      carregando = false;
      desenharTudo();
    }
  }

  /* ---------------- Montar o ranking ---------------- */

  function pessoas() {
    const hoje = hojeK();
    const ultimo = {};      // usuário → data do último treino
    const treinoHoje = {};  // usuário → treino de hoje
    treinos.forEach((t) => {
      if (!ultimo[t.usuario] || t.data > ultimo[t.usuario]) ultimo[t.usuario] = t.data;
      if (t.data === hoje) treinoHoje[t.usuario] = t;
    });
    const mapa = {};
    ranking.forEach((r) => {
      const p = mapa[r.usuario] || (mapa[r.usuario] = { usuario: r.usuario, total: 0, pendente: 0, porTipo: {} });
      p.total += r.total;
      p.pendente += r.pendente;
      p.porTipo[r.tipo_erro] = (p.porTipo[r.tipo_erro] || 0) + r.pendente;
    });
    const lista = Object.values(mapa).map((p) => Object.assign(p, {
      ultimo: ultimo[p.usuario] || null,
      hoje: treinoHoje[p.usuario] || null
    }));
    // A treinar (maior primeiro); empate pelo total histórico.
    // Quem está com 0: treinado mais recente vai para o fim.
    lista.sort((a, b) => {
      if (a.pendente !== b.pendente) return b.pendente - a.pendente;
      if (a.pendente === 0) return String(a.ultimo || '').localeCompare(String(b.ultimo || '')) || a.usuario.localeCompare(b.usuario);
      return (b.total - a.total) || a.usuario.localeCompare(b.usuario);
    });
    return lista;
  }

  // Cor da célula: mais forte = mais erros
  function calor(v, max) {
    if (!v) return '';
    const r = v / Math.max(1, max);
    if (r > 0.66) return ' calor-3';
    if (r > 0.33) return ' calor-2';
    return ' calor-1';
  }

  /* ---------------- Desenhar ---------------- */

  function desenharTudo() {
    const lista = pessoas();
    desenharKpis(lista);
    desenharRanking(lista);
    desenharTipos();
    desenharTreinos();
    desenharBase();
  }

  function desenharKpis(lista) {
    const totalErros = base ? base.erros : 0;
    const aguardando = lista.filter((p) => p.pendente > 0).length;
    const pendTipo = {};
    ranking.forEach((r) => { pendTipo[r.tipo_erro] = (pendTipo[r.tipo_erro] || 0) + r.pendente; });
    let topo = null;
    Object.keys(pendTipo).forEach((t) => { if (pendTipo[t] > 0 && (!topo || pendTipo[t] > pendTipo[topo])) topo = t; });

    const kpis = [
      { rotulo: 'Erros acumulados na base', valor: num(totalErros), cor: 'var(--vermelho)' },
      { rotulo: 'Aguardando treinamento', valor: num(aguardando), cor: 'var(--vermelho)' },
      { rotulo: 'Treinamentos aplicados', valor: num(treinos.length), cor: 'var(--preto)' },
      { rotulo: 'Erro mais pendente', valor: topo || 'Nenhum', texto: true, cor: topo ? 'var(--vermelho)' : 'var(--preto)',
        sub: topo ? num(pendTipo[topo]) + ' erros ainda sem treino' : 'Nenhum erro aguardando treino' }
    ];
    const caixa = $('py-kpis');
    caixa.textContent = '';
    kpis.forEach((k) => {
      const d = document.createElement('div');
      d.className = 'kpi';
      const r = document.createElement('div');
      r.className = 'kpi-rotulo';
      r.textContent = k.rotulo;
      const v = document.createElement('div');
      v.className = 'kpi-valor' + (k.texto ? ' kpi-valor-texto' : '');
      v.style.color = k.cor;
      v.textContent = k.valor;
      d.appendChild(r);
      d.appendChild(v);
      if (k.sub) {
        const s = document.createElement('div');
        s.className = 'kpi-sub';
        s.textContent = k.sub;
        d.appendChild(s);
      }
      caixa.appendChild(d);
    });
  }

  function colunas() {
    return '40px 44px minmax(170px, 1.4fr) 92px repeat(' + Math.max(1, tipos.length) + ', minmax(96px, 1fr)) 104px 80px';
  }

  function celula(classe, texto) {
    const d = document.createElement('div');
    if (classe) d.className = classe;
    if (texto != null) d.textContent = texto;
    return d;
  }

  function desenharCabecalho() {
    const cab = $('py-cabecalho');
    cab.textContent = '';
    cab.style.gridTemplateColumns = colunas();
    const ok = celula('centro');
    ok.title = 'Treinado hoje';
    ok.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-label="Treinado hoje"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    cab.appendChild(ok);
    cab.appendChild(celula('direita', '#'));
    cab.appendChild(celula('', 'Usuário'));
    cab.appendChild(celula('direita py-cab-treinar', 'A treinar'));
    tipos.forEach((t) => { const c = celula('direita py-cab-tipo', t); c.title = t; cab.appendChild(c); });
    cab.appendChild(celula('', 'Último treino'));
    cab.appendChild(celula('direita', 'Total'));
    $('py-planilha').style.minWidth = (40 + 44 + 170 + 92 + 96 * Math.max(1, tipos.length) + 104 + 80) + 'px';
  }

  function desenharRanking(lista) {
    desenharCabecalho();
    const q = est.busca.trim().toLowerCase();
    const comPosicao = lista.map((p, i) => ({ p, pos: i + 1 }));
    const vis = comPosicao.filter(({ p }) => !q || p.usuario.includes(q));
    const maxP = Math.max(1, ...lista.map((p) => p.pendente));
    const maxC = Math.max(1, ...lista.map((p) => Math.max(0, ...tipos.map((t) => p.porTipo[t] || 0))));

    const caixa = $('py-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();
    vis.forEach(({ p, pos }) => {
      const linha = document.createElement('div');
      linha.className = 'planilha-linha' + (p.hoje ? ' py-treinado' : '');
      linha.style.gridTemplateColumns = colunas();

      const cx = celula('centro');
      const ch = document.createElement('input');
      ch.type = 'checkbox';
      ch.className = 'py-caixa';
      ch.checked = !!p.hoje;
      ch.disabled = !p.hoje && p.pendente === 0;
      ch.setAttribute('aria-label', 'Treinado hoje: ' + p.usuario);
      ch.title = p.hoje ? 'Treinado hoje (clique para desmarcar se marcou errado)' : (p.pendente ? 'Marcar como treinado hoje' : 'Nada a treinar');
      ch.addEventListener('change', () => alternarTreino(p, ch));
      cx.appendChild(ch);
      linha.appendChild(cx);

      linha.appendChild(celula('direita numero py-col-pos', String(pos)));
      linha.appendChild(celula('py-col-usuario' + (pos <= 5 && p.pendente > 0 ? ' prioridade' : ''), p.usuario));
      linha.appendChild(celula('direita numero py-col-treinar' + (p.pendente ? calor(p.pendente, maxP) : ' zero'), String(p.pendente)));
      tipos.forEach((t) => {
        const v = p.porTipo[t] || 0;
        linha.appendChild(celula('direita numero py-col-tipo' + (v ? calor(v, maxC) : ' vazio'), v ? String(v) : '·'));
      });
      linha.appendChild(celula('numero py-col-ultimo', p.hoje ? 'Hoje' : (p.ultimo ? dataCurta(p.ultimo) + '/' + p.ultimo.slice(0, 4) : '—')));
      linha.appendChild(celula('direita numero py-col-total', num(p.total)));
      frag.appendChild(linha);
    });
    caixa.appendChild(frag);

    const vazio = $('py-vazio');
    if (!vis.length) {
      if (!carregadoPara) vazio.textContent = 'Carregando ranking…';
      else if (!lista.length) vazio.textContent = 'A base ainda está vazia. Importe a planilha do Poka-Yoke no fim da página.';
      else vazio.textContent = 'Nenhum usuário encontrado nessa busca.';
      vazio.hidden = false;
    } else {
      vazio.hidden = true;
    }

    const hojeN = lista.filter((p) => p.hoje).length;
    $('py-rodape').textContent = 'Mostrando ' + vis.length + ' de ' + lista.length + ' usuários · ' + hojeN + ' treinado(s) hoje';
  }

  function desenharTipos() {
    const tot = {};
    ranking.forEach((r) => { tot[r.tipo_erro] = (tot[r.tipo_erro] || 0) + r.total; });
    const barras = tipos.map((t) => ({ t, n: tot[t] || 0 })).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...barras.map((b) => b.n));
    const caixa = $('py-tipos');
    caixa.textContent = '';
    barras.forEach((b) => {
      const item = document.createElement('div');
      item.className = 'py-barra';
      const topo = document.createElement('div');
      topo.className = 'py-barra-topo';
      const nome = document.createElement('span');
      nome.className = 'py-barra-nome';
      nome.textContent = b.t;
      const val = document.createElement('span');
      val.className = 'py-barra-valor';
      val.textContent = num(b.n);
      topo.appendChild(nome);
      topo.appendChild(val);
      const trilho = document.createElement('div');
      trilho.className = 'py-barra-trilho';
      const cheio = document.createElement('div');
      cheio.className = 'py-barra-cheio';
      cheio.style.width = Math.round(b.n / max * 100) + '%';
      trilho.appendChild(cheio);
      item.appendChild(topo);
      item.appendChild(trilho);
      caixa.appendChild(item);
    });
    if (!barras.length) {
      const v = document.createElement('div');
      v.className = 'py-vazio-texto';
      v.textContent = 'Sem tipos de erro na lista.';
      caixa.appendChild(v);
    }
  }

  function desenharTreinos() {
    const caixa = $('py-treinos');
    caixa.textContent = '';
    const hoje = hojeK();
    treinos.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'py-treino';
      const esq = document.createElement('div');
      const nome = document.createElement('div');
      nome.className = 'py-treino-nome';
      nome.textContent = t.usuario;
      const det = document.createElement('div');
      det.className = 'py-treino-det';
      det.textContent = num(t.erros_tratados) + ' erros tratados no treino';
      esq.appendChild(nome);
      esq.appendChild(det);
      const dt = document.createElement('div');
      dt.className = 'py-treino-data';
      dt.textContent = t.data === hoje ? 'Hoje' : dataBr(t.data);
      item.appendChild(esq);
      item.appendChild(dt);
      caixa.appendChild(item);
    });
    if (!treinos.length) {
      const v = document.createElement('div');
      v.className = 'py-treino py-vazio-texto';
      v.textContent = 'Nenhum treinamento marcado ainda.';
      caixa.appendChild(v);
    }
  }

  function desenharBase() {
    if (!base || !base.dias) {
      $('py-base-titulo').textContent = 'Base acumulada · vazia';
      $('py-base-info').textContent = 'Nenhuma planilha importada ainda. Hoje: ' + dataBr(hojeK());
      return;
    }
    $('py-base-titulo').textContent = 'Base acumulada · ' + base.dias + ' dia(s) de dados';
    $('py-base-info').textContent = 'De ' + dataBr(base.primeiro_dia) + ' a ' + dataBr(base.ultimo_dia)
      + ' · última importação: ' + dataHora(base.ultima_importacao) + ' · hoje: ' + dataBr(hojeK());
  }

  /* ---------------- Treinado hoje ---------------- */

  async function alternarTreino(p, caixa) {
    const hoje = hojeK();
    caixa.disabled = true;
    try {
      if (p.hoje) {
        const { error } = await sb.from('pokayoke_treinos').delete().eq('usuario', p.usuario).eq('data', hoje);
        if (error) throw error;
        mostrarMsg('py-msg-ranking', p.usuario + ': treino de hoje desmarcado. Os erros voltaram para "A treinar".', true);
      } else {
        const { error } = await sb.from('pokayoke_treinos').insert({ usuario: p.usuario, data: hoje, erros_tratados: p.pendente });
        if (error && error.code !== '23505') throw error;
        mostrarMsg('py-msg-ranking', p.usuario + ' treinado hoje (' + num(p.pendente) + ' erros tratados). Foi para o fim do ranking; o total histórico continua.', true);
      }
    } catch (e) {
      mostrarMsg('py-msg-ranking', 'Não foi possível gravar o treino de ' + p.usuario + '. ' + traduzirErro(e), false);
    }
    await recarregar();
  }

  async function recarregar() {
    if (carregadoPara) await carregar(carregadoPara);
  }

  /* ---------------- Importar planilha ---------------- */

  async function importar(ev) {
    const arquivo = ev.target.files && ev.target.files[0];
    if (!arquivo) return;
    const rotulo = $('py-arquivo-rotulo');
    mostrarMsg('py-msg-importar', '');
    if (!carregadoPara) {
      mostrarMsg('py-msg-importar', 'O Poka-Yoke ainda não carregou. Espere um instante e tente de novo.', false);
      ev.target.value = '';
      return;
    }
    rotulo.classList.add('ocupado');
    try {
      const lista = (await carregarListas())[LISTA_ERROS_POKAYOKE] || [];
      if (!lista.length) throw new Error('a LISTA_ERROS_POKAYOKE está vazia (rode o sql/006_pokayoke.sql)');
      const res = pyInterpretarPlanilha(await lerPlanilha(arquivo), lista, hojeK());

      let novos = 0, errosNovos = 0;
      const LOTE = 500;
      for (let i = 0; i < res.registros.length; i += LOTE) {
        const parte = res.registros.slice(i, i + LOTE);
        const { data, error } = await sb.from('pokayoke_erros')
          .upsert(parte, { onConflict: 'chave_linha', ignoreDuplicates: true })
          .select('chave_linha, quantidade');
        if (error) throw error;
        novos += data.length;
        data.forEach((r) => { errosNovos += r.quantidade; });
      }
      const repetidos = res.registros.length - novos;

      const partes = [
        '"' + arquivo.name + '": ' + res.lidas + ' linha(s) lida(s).',
        num(errosNovos) + ' erro(s) novo(s) somado(s) à base' + (novos ? ' (' + novos + ' registro(s))' : '') + '.',
        repetidos ? repetidos + ' registro(s) já estavam na base e foram ignorados (não duplica).' : ''
      ];
      if (res.ignoradas) partes.push(res.ignoradas + ' linha(s) sem Data ou User válidos foram ignoradas.');
      if (res.futuras) partes.push(res.futuras + ' linha(s) com data no futuro foram ignoradas (confira o formato dia/mês/ano).');
      if (res.colunasIgnoradas.length) partes.push('Colunas que não são tipo da LISTA_ERROS_POKAYOKE e não foram importadas: ' + res.colunasIgnoradas.join(', ') + '.');
      const aviso = res.ignoradas || res.futuras || res.colunasIgnoradas.length;
      mostrarMsg('py-msg-importar', partes.filter(Boolean).join(' '), !aviso || errosNovos > 0);
      await recarregar();
    } catch (e) {
      const m = e && e.code ? traduzirErro(e) : ('Não consegui ler a planilha: ' + ((e && e.message) || 'erro desconhecido') + '.');
      mostrarMsg('py-msg-importar', m + ' Pode importar de novo sem medo: o que já tiver entrado na base não duplica.', false);
    } finally {
      rotulo.classList.remove('ocupado');
      ev.target.value = '';
    }
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    tipos = []; ranking = []; treinos = []; base = null;
    carregadoPara = null;
    est.busca = '';
    $('py-busca').value = '';
    ['py-msg-geral', 'py-msg-ranking', 'py-msg-importar'].forEach((id) => mostrarMsg(id, ''));
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('py-busca').addEventListener('input', (ev) => {
    est.busca = ev.target.value;
    desenharRanking(pessoas());
  });
  $('py-arquivo').addEventListener('change', importar);

  // Ao abrir a aba, busca os dados mais novos (ex.: virou o dia)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'pokayoke' && carregadoPara) carregar(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
