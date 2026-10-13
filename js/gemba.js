/* ==========================================================
   js/gemba.js
   Aba Gemba: registro rápido de desvio em 4 passos
   (colaborador, processo, motivo, ação), observação opcional
   e "Registros de hoje" com lixeira para lançamento errado.
   Usa as listas do sistema (js/listas.js).
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const TABELA = 'registros_gemba';
  const CAMPOS_REG = 'id, data, processo, motivo, acao, observacao, colaborador_id, colaboradores(nome, matricula)';
  const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  let ativos = [];            // colaboradores Ativos (id, matricula, nome, setor)
  let listas = {};            // { LISTA_...: ['item', ...] }
  let hoje = [];              // registros de hoje, mais recente primeiro
  let diaCarregado = '';      // dia (AAAA-MM-DD) dos registros na tela
  let carregadoPara = null;   // id do usuário cujos dados estão na tela
  let carregando = false;
  let salvando = false;

  // O que está escolhido no formulário
  const sel = { colab: null, proc: null, motivo: null, acao: null };

  /* ---------------- Ajudantes ---------------- */

  const chave = (s) => textoSemAcento(s).replace(/\s+/g, ' ');
  const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const diaDe = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const horaDe = (iso) => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const processos = () => listas[LISTA_PROCESSOS] || [];
  const acoes = () => listas[LISTA_ACOES] || [];
  const motivosDe = (proc) => listas[nomeListaMotivos(proc)] || [];
  const setorTxt = (c) => (c && c.setor) ? c.setor : 'Sem setor';

  function mostrarMsg(idCaixa, texto, ok) {
    const caixa = $(idCaixa);
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'mensagem ' + (ok ? 'mensagem-ok' : 'mensagem-erro');
    caixa.hidden = !texto;
  }

  function limparMsgs() {
    ['gemba-msg', 'gemba-msg-proc', 'gemba-msg-motivo', 'gemba-msg-acao', 'gemba-msg-hoje'].forEach((id) => mostrarMsg(id, ''));
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Gemba ainda não existem no banco. Rode o arquivo sql/002_gemba.sql no Supabase (SQL Editor).';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se o arquivo sql/002_gemba.sql foi rodado inteiro.';
    }
    if (code === '23503') return 'Esse colaborador não está mais na base. Recarregue a página.';
    if (m.includes('jwt')) return 'Sua sessão expirou. Clique em Sair e entre de novo.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Não foi possível conectar. Confira a internet e tente de novo.';
    return 'Algo deu errado: ' + ((e && e.message) || 'erro desconhecido') + '.';
  }

  /* ---------------- Ler do banco ---------------- */

  async function carregarAtivos() {
    const todos = [];
    const PAGINA = 1000;
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await sb.from('colaboradores')
        .select('id, matricula, nome, setor')
        .eq('status', 'Ativo')
        .order('nome', { ascending: true })
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < PAGINA) break;
    }
    return todos;
  }

  async function carregarHoje() {
    const ini = new Date();
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini);
    fim.setDate(fim.getDate() + 1);
    const { data, error } = await sb.from(TABELA)
      .select(CAMPOS_REG)
      .gte('data', ini.toISOString())
      .lt('data', fim.toISOString())
      .order('data', { ascending: false })
      .limit(1000);
    if (error) throw error;
    hoje = data || [];
    diaCarregado = diaDe(ini);
  }

  async function carregarTudo(uid) {
    if (carregando) return;
    carregando = true;
    mostrarMsg('gemba-msg', '');
    $('gemba-resultados').textContent = '';
    const aviso = document.createElement('div');
    aviso.className = 'gemba-resultado-vazio';
    aviso.textContent = 'Carregando…';
    $('gemba-resultados').appendChild(aviso);
    try {
      const [cols, mapa] = await Promise.all([carregarAtivos(), carregarListas()]);
      ativos = cols;
      listas = mapa;
      await carregarHoje();
      carregadoPara = uid;
      // Se o escolhido saiu da lista de Ativos ou o processo sumiu, limpa a escolha
      if (sel.colab && !ativos.some((c) => c.id === sel.colab.id)) sel.colab = null;
      if (sel.proc && !processos().includes(sel.proc)) { sel.proc = null; sel.motivo = null; }
      if (sel.acao && !acoes().includes(sel.acao)) sel.acao = null;
      desenharTudo();
    } catch (e) {
      carregadoPara = null;
      ativos = []; listas = {}; hoje = [];
      desenharTudo();
      mostrarMsg('gemba-msg', 'Não foi possível carregar o Gemba. ' + traduzirErro(e), false);
    } finally {
      carregando = false;
    }
  }

  /* ---------------- Desenhar a tela ---------------- */

  const ICONE_LIXEIRA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D40511" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';

  function el(tag, classe, texto) {
    const d = document.createElement(tag);
    if (classe) d.className = classe;
    if (texto != null) d.textContent = texto;
    return d;
  }

  function desenharTudo() {
    desenharColab();
    desenharProcessos();
    desenharMotivos();
    desenharAcoes();
    desenharHoje();
  }

  // Passo 1
  function desenharColab() {
    const escolhido = !!sel.colab;
    $('gemba-colab-escolhido').hidden = !escolhido;
    $('gemba-colab-busca').hidden = escolhido;
    if (escolhido) {
      $('gemba-colab-nome').textContent = sel.colab.nome;
      $('gemba-colab-info').textContent = 'Matrícula ' + sel.colab.matricula + ' · ' + setorTxt(sel.colab);
    } else {
      desenharResultados();
    }
  }

  function desenharResultados() {
    const caixa = $('gemba-resultados');
    caixa.textContent = '';
    const q = chave($('gemba-busca').value);
    const achados = ativos.filter((c) =>
      !q || chave(c.nome).includes(q) || String(c.matricula).toLowerCase().includes(q)).slice(0, 5);
    if (!achados.length) {
      caixa.appendChild(el('div', 'gemba-resultado-vazio', ativos.length
        ? 'Nenhum colaborador encontrado na base.'
        : 'Nenhum colaborador Ativo cadastrado. Cadastre na aba Colaboradores.'));
      return;
    }
    achados.forEach((c) => {
      const b = el('button', 'gemba-resultado');
      b.type = 'button';
      b.appendChild(el('span', 'gemba-resultado-nome', c.nome));
      b.appendChild(el('span', 'gemba-resultado-info', c.matricula + ' · ' + setorTxt(c)));
      b.addEventListener('click', () => {
        sel.colab = c;
        $('gemba-busca').value = '';
        mostrarMsg('gemba-msg', '');
        desenharColab();
      });
      caixa.appendChild(b);
    });
  }

  // Passo 2
  function desenharProcessos() {
    const caixa = $('gemba-processos');
    caixa.textContent = '';
    processos().forEach((p) => {
      const marcado = sel.proc === p;
      const b = el('button', 'gemba-opcao' + (marcado ? ' marcado' : ''), p);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(marcado));
      b.addEventListener('click', () => escolherProc(p));
      caixa.appendChild(b);
    });
    if (!processos().length) caixa.appendChild(el('div', 'gemba-aviso', 'Nenhum processo cadastrado ainda. Crie abaixo.'));
  }

  function escolherProc(p) {
    if (sel.proc !== p) sel.motivo = null;
    sel.proc = p;
    mostrarMsg('gemba-msg', '');
    mostrarMsg('gemba-msg-motivo', '');
    desenharProcessos();
    desenharMotivos();
  }

  // Passo 3
  function desenharMotivos() {
    const temProc = !!sel.proc;
    $('gemba-passo3').classList.toggle('apagado', !temProc);
    $('gemba-proc-rotulo').textContent = temProc ? '· ' + sel.proc : '';
    $('gemba-sem-proc').hidden = temProc;
    $('gemba-com-proc').hidden = !temProc;
    if (!temProc) return;

    const lista = motivosDe(sel.proc);
    const s = $('gemba-motivo');
    s.textContent = '';
    const primeira = el('option', null, lista.length ? 'Selecione o motivo do erro…' : 'Nenhum motivo ainda · crie abaixo');
    primeira.value = '';
    s.appendChild(primeira);
    lista.forEach((m) => {
      const o = el('option', null, m);
      o.value = m;
      s.appendChild(o);
    });
    s.value = sel.motivo && lista.includes(sel.motivo) ? sel.motivo : '';
    if (!s.value) sel.motivo = null;
    s.classList.toggle('escolhido', !!sel.motivo);
    $('gemba-novo-motivo').placeholder = 'Criar novo motivo para ' + sel.proc;
  }

  // Passo 4
  function desenharAcoes() {
    const caixa = $('gemba-acoes');
    caixa.textContent = '';
    acoes().forEach((a) => {
      const marcado = sel.acao === a;
      const b = el('button', 'gemba-acao' + (marcado ? ' marcado' : ''), a);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(marcado));
      b.addEventListener('click', () => {
        sel.acao = a;
        mostrarMsg('gemba-msg', '');
        desenharAcoes();
      });
      caixa.appendChild(b);
    });
  }

  // Registros de hoje
  function desenharHoje() {
    const d = new Date();
    $('gemba-hoje-data').textContent = SEMANA[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    $('gemba-hoje-contagem').textContent = '· ' + hoje.length;

    const caixa = $('gemba-hoje-lista');
    caixa.textContent = '';
    if (!hoje.length) {
      caixa.appendChild(el('div', 'gemba-hoje-vazio', carregadoPara ? 'Nenhum registro hoje ainda.' : '—'));
      return;
    }
    const frag = document.createDocumentFragment();
    hoje.forEach((r) => frag.appendChild(cartaoRegistro(r)));
    caixa.appendChild(frag);
  }

  function nomeDoRegistro(r) {
    return (r.colaboradores && r.colaboradores.nome) || 'Colaborador';
  }

  function cartaoRegistro(r) {
    const c = el('div', 'gemba-registro');
    const topo = el('div', 'gemba-registro-topo');
    topo.appendChild(el('span', 'gemba-registro-nome', nomeDoRegistro(r)));
    const dir = el('div', 'gemba-registro-direita');
    dir.appendChild(el('span', 'gemba-registro-hora', horaDe(r.data)));
    const lix = el('button', 'botao-lixeira');
    lix.type = 'button';
    lix.title = 'Excluir (só para lançamento feito errado)';
    lix.setAttribute('aria-label', 'Excluir registro de ' + nomeDoRegistro(r) + ' às ' + horaDe(r.data));
    lix.innerHTML = ICONE_LIXEIRA;
    lix.addEventListener('click', () => excluir(r, lix));
    dir.appendChild(lix);
    topo.appendChild(dir);
    c.appendChild(topo);
    c.appendChild(el('div', 'gemba-registro-motivo', r.processo + ' · ' + r.motivo));
    c.appendChild(el('div', 'gemba-registro-acao', 'Ação: ' + r.acao));
    if (r.observacao) c.appendChild(el('div', 'gemba-registro-obs', r.observacao));
    return c;
  }

  /* ---------------- "+ Adicionar" ---------------- */

  async function comBotao(idBotao, tarefa) {
    const b = $(idBotao);
    b.disabled = true;
    try { await tarefa(); } finally { b.disabled = false; }
  }

  async function addProcesso() {
    const caixaMsg = 'gemba-msg-proc';
    mostrarMsg(caixaMsg, '');
    if (!carregadoPara) { mostrarMsg(caixaMsg, 'O Gemba ainda não carregou. Espere um instante e tente de novo.', false); return; }
    const t = limpar($('gemba-novo-proc').value);
    if (!t) { mostrarMsg(caixaMsg, 'Digite o nome do novo processo.', false); return; }
    const novaLista = nomeListaMotivos(t);
    if (!novaLista) { mostrarMsg(caixaMsg, 'Use letras ou números no nome do processo.', false); return; }

    // Já existe (mesmo com maiúscula, acento ou símbolo diferente)? Só seleciona.
    const existente = processos().find((p) => chave(p) === chave(t) || nomeListaMotivos(p) === novaLista);
    if (existente) {
      $('gemba-novo-proc').value = '';
      escolherProc(existente);
      mostrarMsg(caixaMsg, '"' + existente + '" já existe e foi selecionado.', true);
      return;
    }

    await comBotao('gemba-add-proc', async () => {
      try {
        await adicionarItemLista(LISTA_PROCESSOS, t, processos().length + 1);
        listas[LISTA_PROCESSOS] = processos().concat(t);
        $('gemba-novo-proc').value = '';
        escolherProc(t);
        mostrarMsg(caixaMsg, 'Processo "' + t + '" criado. A lista de motivos dele (' + novaLista + ') começa vazia.', true);
      } catch (e) {
        mostrarMsg(caixaMsg, 'Não foi possível criar o processo. ' + traduzirErro(e), false);
      }
    });
  }

  async function addMotivo() {
    const caixaMsg = 'gemba-msg-motivo';
    mostrarMsg(caixaMsg, '');
    if (!sel.proc) return;
    const t = limpar($('gemba-novo-motivo').value);
    if (!t) { mostrarMsg(caixaMsg, 'Digite o novo motivo.', false); return; }
    const nomeLista = nomeListaMotivos(sel.proc);
    const lista = motivosDe(sel.proc);

    const existente = lista.find((m) => chave(m) === chave(t));
    if (existente) {
      sel.motivo = existente;
      $('gemba-novo-motivo').value = '';
      desenharMotivos();
      mostrarMsg(caixaMsg, '"' + existente + '" já existe e foi selecionado.', true);
      return;
    }

    const proc = sel.proc;
    await comBotao('gemba-add-motivo', async () => {
      try {
        await adicionarItemLista(nomeLista, t, lista.length + 1);
        listas[nomeLista] = lista.concat(t);
        $('gemba-novo-motivo').value = '';
        if (sel.proc === proc) sel.motivo = t;
        desenharMotivos();
        mostrarMsg(caixaMsg, 'Motivo "' + t + '" criado na ' + nomeLista + '.', true);
      } catch (e) {
        mostrarMsg(caixaMsg, 'Não foi possível criar o motivo. ' + traduzirErro(e), false);
      }
    });
  }

  async function addAcao() {
    const caixaMsg = 'gemba-msg-acao';
    mostrarMsg(caixaMsg, '');
    if (!carregadoPara) { mostrarMsg(caixaMsg, 'O Gemba ainda não carregou. Espere um instante e tente de novo.', false); return; }
    const t = limpar($('gemba-nova-acao').value);
    if (!t) { mostrarMsg(caixaMsg, 'Digite a nova ação.', false); return; }

    const existente = acoes().find((a) => chave(a) === chave(t));
    if (existente) {
      sel.acao = existente;
      $('gemba-nova-acao').value = '';
      desenharAcoes();
      mostrarMsg(caixaMsg, '"' + existente + '" já existe e foi selecionada.', true);
      return;
    }

    await comBotao('gemba-add-acao', async () => {
      try {
        await adicionarItemLista(LISTA_ACOES, t, acoes().length + 1);
        listas[LISTA_ACOES] = acoes().concat(t);
        $('gemba-nova-acao').value = '';
        sel.acao = t;
        desenharAcoes();
        mostrarMsg(caixaMsg, 'Ação "' + t + '" criada na ' + LISTA_ACOES + '.', true);
      } catch (e) {
        mostrarMsg(caixaMsg, 'Não foi possível criar a ação. ' + traduzirErro(e), false);
      }
    });
  }

  /* ---------------- Salvar e excluir ---------------- */

  async function salvar() {
    if (salvando) return;
    if (!carregadoPara) { mostrarMsg('gemba-msg', 'O Gemba ainda não carregou. Espere um instante e tente de novo.', false); return; }
    const falta = [];
    if (!sel.colab) falta.push('colaborador');
    if (!sel.proc) falta.push('processo');
    if (!sel.motivo) falta.push('motivo');
    if (!sel.acao) falta.push('ação tomada');
    if (falta.length) { mostrarMsg('gemba-msg', 'Falta escolher: ' + falta.join(', ') + '.', false); return; }

    salvando = true;
    const botao = $('gemba-salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    const nome = sel.colab.nome;
    try {
      const { data, error } = await sb.from(TABELA).insert({
        colaborador_id: sel.colab.id,
        processo: sel.proc,
        motivo: sel.motivo,
        acao: sel.acao,
        observacao: String($('gemba-obs').value || '').trim()
      }).select(CAMPOS_REG).single();
      if (error) throw error;

      if (diaCarregado !== diaDe(new Date())) await carregarHoje();
      else hoje.unshift(data);

      // Limpa o formulário; o processo continua marcado
      sel.colab = null;
      sel.motivo = null;
      sel.acao = null;
      $('gemba-obs').value = '';
      $('gemba-busca').value = '';
      ['gemba-msg-proc', 'gemba-msg-motivo', 'gemba-msg-acao'].forEach((id) => mostrarMsg(id, ''));
      desenharTudo();
      mostrarMsg('gemba-msg', 'Registro salvo para ' + nome + '.', true);
    } catch (e) {
      mostrarMsg('gemba-msg', 'Não foi possível salvar. ' + traduzirErro(e), false);
    } finally {
      salvando = false;
      botao.disabled = false;
      botao.textContent = 'Salvar registro';
    }
  }

  async function excluir(r, botao) {
    const nome = nomeDoRegistro(r);
    const ok = window.confirm(
      'Excluir o registro de ' + nome + ' (' + horaDe(r.data) + ' · ' + r.processo + ' · ' + r.motivo + ')?\n\n' +
      'Use a exclusão SÓ para corrigir lançamento feito errado.');
    if (!ok) return;
    botao.disabled = true;
    const { error } = await sb.from(TABELA).delete().eq('id', r.id);
    if (error) {
      botao.disabled = false;
      mostrarMsg('gemba-msg-hoje', 'Não foi possível excluir. ' + traduzirErro(error), false);
      return;
    }
    hoje = hoje.filter((x) => x.id !== r.id);
    desenharHoje();
    mostrarMsg('gemba-msg-hoje', 'Registro de ' + nome + ' excluído.', true);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    ativos = []; listas = {}; hoje = [];
    diaCarregado = '';
    carregadoPara = null;
    sel.colab = null; sel.proc = null; sel.motivo = null; sel.acao = null;
    ['gemba-busca', 'gemba-novo-proc', 'gemba-novo-motivo', 'gemba-nova-acao', 'gemba-obs'].forEach((id) => { $(id).value = ''; });
    limparMsgs();
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregarTudo(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('gemba-busca').addEventListener('input', desenharResultados);
  $('gemba-trocar').addEventListener('click', () => {
    sel.colab = null;
    desenharColab();
    $('gemba-busca').focus();
  });
  $('gemba-motivo').addEventListener('change', (ev) => {
    sel.motivo = ev.target.value || null;
    ev.target.classList.toggle('escolhido', !!sel.motivo);
    mostrarMsg('gemba-msg', '');
  });
  $('gemba-add-proc').addEventListener('click', addProcesso);
  $('gemba-add-motivo').addEventListener('click', addMotivo);
  $('gemba-add-acao').addEventListener('click', addAcao);
  [['gemba-novo-proc', addProcesso], ['gemba-novo-motivo', addMotivo], ['gemba-nova-acao', addAcao]].forEach(([id, fn]) => {
    $(id).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); fn(); } });
  });
  $('gemba-salvar').addEventListener('click', salvar);

  // Ao abrir a aba, atualiza a lista de Ativos, as listas e os registros de hoje
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'gemba' && carregadoPara) carregarTudo(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
