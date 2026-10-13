/* ==========================================================
   js/planoacao.js
   Aba Plano de ação: ações no formato 5W2H (O quê, Por quê,
   Onde, Quem, Quando, Como, Quanto) + Origem e Status.
   - Criar ação (O quê, Quem e Quando obrigatórios).
   - Alterar ação depois (lápis na linha abre o formulário).
   - Status editável na linha (grava na hora).
   - Indicadores, filtros, contagem de prazo e linha vermelha
     quando atrasada.
   - Lixeira só para corrigir lançamento feito errado.
   "Onde" usa a LISTA_PROCESSOS (mesma do Gemba).
   Tabela: planos_acao.
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const CAMPOS = 'id, o_que, por_que, onde, quem, quando, como, quanto, origem, status';
  const ORIGENS = ['Gemba', 'Torre de Aduana', 'Poka-Yoke'];
  const STATUS = ['Não iniciada', 'Em andamento', 'Concluída'];
  const FILTROS = [['abertas', 'Abertas'], ['atrasadas', 'Atrasadas'], ['concluidas', 'Concluídas'], ['todas', 'Todas']];

  let acoes = [];        // { id, oque, porque, onde, quem, quando: 'AAAA-MM-DD', como, quanto, origem, status }
  let processos = [];    // itens ativos da LISTA_PROCESSOS
  let carregadoPara = null;
  let carregando = false;

  const est = { filtro: 'abertas', origem: '', formAberto: false, editando: null };

  /* ---------------- Ajudantes ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const chaveDia = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeK = () => chaveDia(new Date());
  const dataCurta = (k) => (k ? k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4) : '—');
  const limparTexto = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const limparBloco = (s) => String(s || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const ouTraco = (s) => (s && String(s).trim() ? s : '—');

  // Dias entre hoje e o prazo (negativo = já passou). Conta só datas, sem horário.
  function diasAte(k) {
    const [a, m, d] = k.split('-').map(Number);
    const [ha, hm, hd] = hojeK().split('-').map(Number);
    return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86400000);
  }

  function doBanco(r) {
    return {
      id: r.id,
      oque: r.o_que || '',
      porque: r.por_que || '',
      onde: r.onde || '',
      quem: r.quem || '',
      quando: r.quando || '',
      como: r.como || '',
      quanto: r.quanto || '',
      origem: ORIGENS.includes(r.origem) ? r.origem : 'Gemba',
      status: STATUS.includes(r.status) ? r.status : 'Não iniciada'
    };
  }

  // Situação de cada ação, usada nos indicadores, filtros e cores
  function info(a) {
    const concluida = a.status === 'Concluída';
    const dias = a.quando ? diasAte(a.quando) : null;
    const atrasada = !concluida && dias != null && dias < 0;
    return { concluida, dias, atrasada };
  }

  function textoPrazo(a, s) {
    if (s.concluida) return 'Concluída';
    if (s.dias == null) return '';
    if (s.dias < 0) return 'Atrasada ' + (-s.dias) + 'd';
    if (s.dias === 0) return 'Vence hoje';
    return 'Faltam ' + s.dias + 'd';
  }

  /* ---------------- Mensagens ---------------- */

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
      return 'A tabela do Plano de ação ainda não existe no banco. Rode o arquivo sql/005_planos_acao.sql no Supabase (SQL Editor).';
    }
    if (code === '23514' || code === '23502') return 'O banco recusou um valor. Confira se O quê, Quem e Quando estão preenchidos.';
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se o arquivo sql/005_planos_acao.sql foi rodado inteiro.';
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
    mostrarMsg('plano-msg-geral', '');
    try {
      const [linhas, mapa] = await Promise.all([
        lerTudo(() => sb.from('planos_acao')
          .select(CAMPOS)
          .order('id', { ascending: true })),
        carregarListas()
      ]);
      acoes = linhas.map(doBanco);
      processos = mapa[LISTA_PROCESSOS] || [];
      carregadoPara = uid;
    } catch (e) {
      carregadoPara = null;
      acoes = [];
      mostrarMsg('plano-msg-geral', 'Não foi possível carregar o Plano de ação. ' + traduzirErro(e), false);
    } finally {
      carregando = false;
      desenharTudo();
    }
  }

  /* ---------------- Desenhar ---------------- */

  function desenharTudo() {
    desenharForm();
    desenharKpis();
    desenharFiltros();
    desenharTabela();
  }

  /* --------- Formulário (nova ação ou alteração) --------- */

  function preencherOnde(valor) {
    const sel = $('plano-onde');
    const atual = valor != null ? valor : sel.value;
    sel.textContent = '';
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Escolha o processo';
    sel.appendChild(vazio);
    const itens = processos.slice();
    // Ação antiga com processo que saiu da lista: continua aparecendo
    if (atual && !itens.includes(atual)) itens.push(atual);
    itens.forEach((p) => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
    sel.value = atual || '';
  }

  function desenharForm() {
    const editando = est.editando != null;
    $('plano-form').hidden = !est.formAberto;
    $('plano-alternar').textContent = est.formAberto ? 'Fechar' : '+ Nova ação';
    $('plano-form-titulo').textContent = editando ? 'Alterar ação nº ' + est.editando + ' · 5W2H' : 'Nova ação · 5W2H';
    $('plano-form').classList.toggle('editando', editando);
    $('plano-salvar').textContent = editando ? 'Salvar alterações' : 'Adicionar ao plano';
    $('plano-cancelar').hidden = !editando;
    preencherOnde();
  }

  function limparForm() {
    ['plano-oque', 'plano-porque', 'plano-quem', 'plano-quando', 'plano-como', 'plano-quanto'].forEach((id) => { $(id).value = ''; });
    preencherOnde('');
    // Origem continua a última escolhida (ajuda quando lança várias da mesma origem)
    if (!ORIGENS.includes($('plano-origem').value)) $('plano-origem').value = 'Gemba';
  }

  function abrirNova() {
    est.formAberto = true;
    est.editando = null;
    limparForm();
    mostrarMsg('plano-msg-form', '');
    desenharForm();
    $('plano-oque').focus();
  }

  function fecharForm() {
    est.formAberto = false;
    est.editando = null;
    limparForm();
    mostrarMsg('plano-msg-form', '');
    desenharForm();
    desenharTabela();
  }

  function abrirEdicao(a) {
    est.formAberto = true;
    est.editando = a.id;
    $('plano-oque').value = a.oque;
    $('plano-porque').value = a.porque;
    $('plano-quem').value = a.quem;
    $('plano-quando').value = a.quando;
    $('plano-como').value = a.como;
    $('plano-quanto').value = a.quanto;
    $('plano-origem').value = a.origem;
    preencherOnde(a.onde);
    mostrarMsg('plano-msg-form', '');
    desenharForm();
    desenharTabela();
    $('plano-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('plano-oque').focus({ preventScroll: true });
  }

  /* --------- Indicadores --------- */

  function desenharKpis() {
    let abertas = 0, andamento = 0, atrasadas = 0, concluidas = 0;
    acoes.forEach((a) => {
      const s = info(a);
      if (s.concluida) concluidas++; else abertas++;
      if (a.status === 'Em andamento') andamento++;
      if (s.atrasada) atrasadas++;
    });
    const kpis = [
      ['Ações abertas', abertas, ''],
      ['Em andamento', andamento, ''],
      ['Atrasadas', atrasadas, ' vermelho'],
      ['Concluídas', concluidas, ' cinza']
    ];
    const caixa = $('plano-kpis');
    caixa.textContent = '';
    kpis.forEach(([rotulo, valor, cor]) => {
      const k = document.createElement('div');
      k.className = 'plano-kpi' + cor;
      const r = document.createElement('div');
      r.className = 'plano-kpi-rotulo';
      r.textContent = rotulo;
      const v = document.createElement('div');
      v.className = 'plano-kpi-valor';
      v.textContent = String(valor);
      k.appendChild(r);
      k.appendChild(v);
      caixa.appendChild(k);
    });
  }

  /* --------- Filtros --------- */

  function desenharFiltros() {
    const caixa = $('plano-filtros');
    caixa.textContent = '';
    FILTROS.forEach(([id, rotulo]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plano-filtro' + (est.filtro === id ? ' marcado' : '');
      b.setAttribute('aria-pressed', String(est.filtro === id));
      b.textContent = rotulo;
      b.addEventListener('click', () => {
        est.filtro = id;
        desenharFiltros();
        desenharTabela();
      });
      caixa.appendChild(b);
    });
    $('plano-origem-filtro').value = est.origem;
  }

  /* --------- Tabela --------- */

  const ICONE_LIXEIRA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D40511" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  const ICONE_LAPIS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

  function celula(classe, texto) {
    const d = document.createElement('div');
    if (classe) d.className = classe;
    if (texto != null) d.textContent = texto;
    return d;
  }

  const classeStatus = (st) => (st === 'Em andamento' ? ' andamento' : (st === 'Concluída' ? ' concluida' : ''));

  function visiveis() {
    return acoes
      .map((a) => ({ a, s: info(a) }))
      .filter(({ a, s }) => {
        if (est.origem && a.origem !== est.origem) return false;
        if (est.filtro === 'abertas') return !s.concluida;
        if (est.filtro === 'atrasadas') return s.atrasada;
        if (est.filtro === 'concluidas') return s.concluida;
        return true;
      })
      // Abertas primeiro, pelo prazo mais próximo; concluídas no fim
      .sort((p, q) => (Number(p.s.concluida) - Number(q.s.concluida))
        || ((p.s.dias == null ? 99999 : p.s.dias) - (q.s.dias == null ? 99999 : q.s.dias))
        || (p.a.id - q.a.id));
  }

  function desenharTabela() {
    const lista = visiveis();
    const caixa = $('plano-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();

    lista.forEach(({ a, s }) => {
      const linha = document.createElement('div');
      linha.className = 'planilha-linha'
        + (s.atrasada ? ' atrasada' : '')
        + (s.concluida ? ' concluida' : '')
        + (est.editando === a.id ? ' em-edicao' : '');

      linha.appendChild(celula('numero direita plano-col-num', String(a.id)));
      linha.appendChild(celula('plano-col-oque', a.oque));
      linha.appendChild(celula('plano-col-texto', ouTraco(a.porque)));
      linha.appendChild(celula('plano-col-texto', ouTraco(a.onde)));
      linha.appendChild(celula('plano-col-texto', ouTraco(a.quem)));

      const cq = celula('plano-col-prazo');
      const dq = document.createElement('span');
      dq.className = 'numero plano-prazo-data';
      dq.textContent = dataCurta(a.quando);
      const cp = document.createElement('span');
      cp.className = 'plano-prazo-conta' + (s.atrasada ? ' atrasada' : '');
      cp.textContent = textoPrazo(a, s);
      cq.appendChild(dq);
      cq.appendChild(cp);
      linha.appendChild(cq);

      linha.appendChild(celula('plano-col-texto plano-col-como', ouTraco(a.como)));
      linha.appendChild(celula('numero plano-col-quanto', ouTraco(a.quanto)));
      linha.appendChild(celula('plano-col-texto', a.origem));

      const cs = celula('plano-col-status');
      const sel = document.createElement('select');
      sel.className = 'plano-status' + classeStatus(a.status);
      sel.setAttribute('aria-label', 'Status da ação ' + a.id);
      STATUS.forEach((st) => {
        const o = document.createElement('option');
        o.value = st;
        o.textContent = st;
        sel.appendChild(o);
      });
      sel.value = a.status;
      sel.addEventListener('change', () => mudarStatus(a, sel));
      cs.appendChild(sel);
      linha.appendChild(cs);

      const ca = celula('plano-col-botoes');
      const ed = document.createElement('button');
      ed.type = 'button';
      ed.className = 'botao-lixeira plano-botao-editar';
      ed.setAttribute('aria-label', 'Alterar a ação ' + a.id);
      ed.title = 'Alterar a ação';
      ed.innerHTML = ICONE_LAPIS;
      ed.addEventListener('click', () => abrirEdicao(a));
      ca.appendChild(ed);

      const lix = document.createElement('button');
      lix.type = 'button';
      lix.className = 'botao-lixeira';
      lix.setAttribute('aria-label', 'Excluir a ação ' + a.id);
      lix.title = 'Excluir (só para lançamento feito errado)';
      lix.innerHTML = ICONE_LIXEIRA;
      lix.addEventListener('click', () => excluir(a, lix));
      ca.appendChild(lix);
      linha.appendChild(ca);

      frag.appendChild(linha);
    });
    caixa.appendChild(frag);

    const vazio = $('plano-vazio');
    if (!lista.length) {
      if (!carregadoPara) vazio.textContent = 'Carregando ações…';
      else if (!acoes.length) vazio.textContent = 'Nenhuma ação cadastrada ainda. Clique em "+ Nova ação" para criar a primeira.';
      else vazio.textContent = 'Nenhuma ação neste filtro.';
      vazio.hidden = false;
    } else {
      vazio.hidden = true;
    }
  }

  /* ---------------- Criar ou alterar ---------------- */

  function lerForm() {
    return {
      o_que: limparTexto($('plano-oque').value),
      por_que: limparTexto($('plano-porque').value) || null,
      onde: $('plano-onde').value || null,
      quem: limparTexto($('plano-quem').value),
      quando: $('plano-quando').value,
      como: limparBloco($('plano-como').value) || null,
      quanto: limparTexto($('plano-quanto').value) || null,
      origem: ORIGENS.includes($('plano-origem').value) ? $('plano-origem').value : 'Gemba'
    };
  }

  async function salvar(ev) {
    ev.preventDefault();
    if (!carregadoPara) { mostrarMsg('plano-msg-form', 'O Plano de ação ainda não carregou. Espere um instante e tente de novo.', false); return; }

    const d = lerForm();
    const falta = [];
    if (!d.o_que) falta.push('O quê');
    if (!d.quem) falta.push('Quem');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.quando)) falta.push('Quando');
    if (falta.length) { mostrarMsg('plano-msg-form', 'Preencha: ' + falta.join(', ') + '.', false); return; }

    const botao = $('plano-salvar');
    botao.disabled = true;
    try {
      if (est.editando != null) {
        const id = est.editando;
        const { data: r, error } = await sb.from('planos_acao').update(d).eq('id', id).select(CAMPOS).single();
        if (error) throw error;
        acoes = acoes.map((x) => (x.id === id ? doBanco(r) : x));
        est.editando = null;
        est.formAberto = false;
        limparForm();
        desenharTudo();
        mostrarMsg('plano-msg-lista', 'Ação nº ' + id + ' alterada.', true);
        mostrarMsg('plano-msg-form', '');
      } else {
        const { data: r, error } = await sb.from('planos_acao')
          .insert(Object.assign({}, d, { status: 'Não iniciada' }))
          .select(CAMPOS)
          .single();
        if (error) throw error;
        acoes.push(doBanco(r));
        est.filtro = 'abertas';
        limparForm();
        desenharTudo();
        mostrarMsg('plano-msg-form', 'Ação nº ' + r.id + ' adicionada ao plano.', true);
        $('plano-oque').focus();
      }
    } catch (e) {
      mostrarMsg('plano-msg-form', 'Não foi possível salvar a ação. ' + traduzirErro(e), false);
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------------- Status na linha ---------------- */

  async function mudarStatus(a, sel) {
    const novo = sel.value;
    const antes = a.status;
    if (novo === antes) return;
    sel.disabled = true;
    const { error } = await sb.from('planos_acao').update({ status: novo }).eq('id', a.id);
    if (error) {
      sel.value = antes;
      sel.disabled = false;
      mostrarMsg('plano-msg-lista', 'Não foi possível mudar o status da ação nº ' + a.id + '. ' + traduzirErro(error), false);
      return;
    }
    a.status = novo;
    desenharKpis();
    desenharTabela();
    mostrarMsg('plano-msg-lista', 'Ação nº ' + a.id + ': status mudou para ' + novo + '.', true);
  }

  /* ---------------- Excluir (só lançamento errado) ---------------- */

  async function excluir(a, botao) {
    const ok = window.confirm(
      'Excluir a ação nº ' + a.id + ' "' + a.oque + '"?\n\n' +
      'Use a exclusão SÓ para corrigir lançamento feito errado. ' +
      'Para encerrar uma ação, mude o Status para Concluída.');
    if (!ok) return;
    botao.disabled = true;
    const { error } = await sb.from('planos_acao').delete().eq('id', a.id);
    if (error) {
      botao.disabled = false;
      mostrarMsg('plano-msg-lista', 'Não foi possível excluir a ação nº ' + a.id + '. ' + traduzirErro(error), false);
      return;
    }
    acoes = acoes.filter((x) => x.id !== a.id);
    if (est.editando === a.id) { est.editando = null; est.formAberto = false; limparForm(); }
    desenharTudo();
    mostrarMsg('plano-msg-lista', 'Ação nº ' + a.id + ' excluída.', true);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    acoes = []; processos = [];
    carregadoPara = null;
    est.filtro = 'abertas'; est.origem = ''; est.formAberto = false; est.editando = null;
    limparForm();
    $('plano-origem').value = 'Gemba';
    ['plano-msg-geral', 'plano-msg-form', 'plano-msg-lista'].forEach((id) => mostrarMsg(id, ''));
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('plano-alternar').addEventListener('click', () => {
    if (est.formAberto) fecharForm(); else abrirNova();
  });
  $('plano-cancelar').addEventListener('click', fecharForm);
  $('plano-form-campos').addEventListener('submit', salvar);
  $('plano-origem-filtro').addEventListener('change', (ev) => {
    est.origem = ev.target.value;
    desenharTabela();
  });

  // Ao abrir a aba, busca os dados mais novos (ex.: processo criado agora no Gemba)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'planoacao' && carregadoPara) carregar(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
