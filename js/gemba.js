/* ==========================================================
   js/gemba.js
   Aba Gemba: registro rápido de desvio em 4 passos
   (colaboradores — opcional, numa lista que começa fechada —,
   processo, motivo, ação), observação e fotos opcionais.
   - Sem colaborador marcado: uma linha com colaborador vazio
     ("Sem colaborador").
   - Várias pessoas no mesmo registro: cada pessoa vira uma linha
     (um desvio) com o mesmo "grupo".
   - Fotos: diminuídas no navegador e guardadas na pasta privada
     "gemba" do Storage; todas as linhas do grupo têm a mesma lista.
   - "Todos os Gemba": tabela com todo o histórico (uma linha por
     registro salvo), busca, rolagem por dentro e seta para abrir/fechar.
   - Dia do Gemba: padrão hoje; dá para escolher um dia passado
     (desde 13/10/2026, nunca futuro). O dia escolhido fica marcado
     depois de salvar, com aviso quando não é hoje. A hora gravada é a
     hora em que você salva.
   - Resultado da observação: ❌ Desvio (com motivo e ação) ou
     ✅ Conforme (só processo; motivo e ação ficam vazios). Cada pessoa
     marcada vira uma linha, nos dois casos.
   Usa as listas do sistema (js/listas.js).
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const TABELA = 'registros_gemba';
  const PASTA = 'gemba';                 // pasta privada do Storage
  const CAMPOS_REG = 'id, data, grupo, fotos, resultado, processo, motivo, acao, observacao, colaborador_id, colaboradores(nome, matricula)';
  const MAX_PESSOAS = 30;
  const MAX_FOTOS = 6;
  const FOTO_LADO_MAX = 1600;            // a foto é reduzida para no máximo 1600 px no lado maior
  const FOTO_QUALIDADE = 0.82;
  const LIMITE_ARQUIVO = 10 * 1024 * 1024;

  let ativos = [];            // colaboradores Ativos (id, matricula, nome, setor)
  let listas = {};            // { LISTA_...: ['item', ...] }
  let carregadoPara = null;   // id do usuário cujos dados estão na tela
  let carregando = false;
  let salvando = false;
  let linksFotos = {};        // caminho da foto → link temporário (para as miniaturas)
  let todos = [];             // todo o histórico (uma linha por pessoa), mais recente primeiro
  let todosAberto = true;     // cartão "Todos os Gemba" aberto? (começa aberto)
  const fotosAbertas = {};    // grupos com as miniaturas abertas na tabela

  // O que está escolhido no formulário
  const sel = { resultado: 'Desvio', colabs: [], proc: null, motivo: null, acao: null };
  const ehConforme = () => sel.resultado === 'Conforme';
  const conformeDaLinha = (r) => r && r.resultado === 'Conforme';
  let fotosSel = [];          // { arquivo, previa (link local) }

  /* ---------------- Ajudantes ---------------- */

  const chave = (s) => textoSemAcento(s).replace(/\s+/g, ' ');
  const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const horaDe = (iso) => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const processos = () => listas[LISTA_PROCESSOS] || [];
  const acoes = () => listas[LISTA_ACOES] || [];
  const motivosDe = (proc) => listas[nomeListaMotivos(proc)] || [];
  const setorTxt = (c) => (c && c.setor) ? c.setor : 'Sem setor';
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const dataBr = (iso) => { const d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const MAX_NOMES_TABELA = 2;   // nomes visíveis na coluna Pessoas
  const DIA_MINIMO = '2026-10-13';   // início da contagem do Painel
  const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const isoDia = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeIso = () => isoDia(new Date());
  const agoraHora = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const diaBr = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

  function novoCodigo() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    // Navegador antigo: monta um código no mesmo formato
    const h = [];
    for (let i = 0; i < 32; i++) h.push(Math.floor(Math.random() * 16).toString(16));
    h[12] = '4';
    h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
    const s = h.join('');
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
  }

  function mostrarMsg(idCaixa, texto, ok) {
    const caixa = $(idCaixa);
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'mensagem ' + (ok ? 'mensagem-ok' : 'mensagem-erro');
    caixa.hidden = !texto;
  }

  function limparMsgs() {
    ['gemba-msg', 'gemba-msg-colab', 'gemba-msg-proc', 'gemba-msg-motivo', 'gemba-msg-acao', 'gemba-msg-fotos', 'gemba-msg-todos'].forEach((id) => mostrarMsg(id, ''));
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (m.includes('resultado') || (code === '23502' && (m.includes('motivo') || m.includes('acao')))) {
      return 'Falta atualizar o banco. Rode o arquivo sql/014_gemba_conforme.sql no Supabase (SQL Editor).';
    }
    if (code === '23514') return 'O banco recusou: no Desvio, motivo e ação são obrigatórios.';
    if (code === '42703' || (m.includes('column') && (m.includes('grupo') || m.includes('fotos')))) {
      return 'Falta atualizar o banco. Rode o arquivo sql/009_gemba_grupo_fotos.sql no Supabase (SQL Editor).';
    }
    if (m.includes('bucket not found')) {
      return 'A pasta de fotos "gemba" ainda não existe. Rode o arquivo sql/009_gemba_grupo_fotos.sql no Supabase (SQL Editor).';
    }
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Gemba ainda não existem no banco. Rode o arquivo sql/002_gemba.sql no Supabase (SQL Editor).';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se o arquivo sql/009_gemba_grupo_fotos.sql foi rodado inteiro.';
    }
    if (m.includes('mime type') || m.includes('invalid_mime_type')) return 'Tipo de arquivo não aceito. Use fotos JPEG ou PNG.';
    if (m.includes('payload too large') || m.includes('exceeded the maximum')) return 'A foto é grande demais (limite de 10 MB).';
    if (code === '23503') return 'Um dos colaboradores não está mais na base. Recarregue a página.';
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
        .select('id, matricula, nome, setor, cpf')
        .eq('status', 'Ativo')
        .order('nome', { ascending: true })
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < PAGINA) break;
    }
    return todos;
  }

  // Todo o histórico, para a tabela "Todos os Gemba"
  async function carregarTodos() {
    const linhas = [];
    const PAGINA = 1000;
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await sb.from(TABELA)
        .select(CAMPOS_REG)
        .order('data', { ascending: false })
        .order('id', { ascending: true })
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      linhas.push(...data);
      if (data.length < PAGINA) break;
    }
    todos = linhas;
  }

  // Links temporários (1 hora) para as miniaturas das fotos pedidas
  async function prepararLinks(lista) {
    const caminhos = [];
    (lista || []).forEach((c) => { if (!linksFotos[c] && !caminhos.includes(c)) caminhos.push(c); });
    if (!caminhos.length) return;
    try {
      const { data, error } = await sb.storage.from(PASTA).createSignedUrls(caminhos, 3600);
      if (error || !data) return;
      data.forEach((d) => { if (d && d.signedUrl && d.path) linksFotos[d.path] = d.signedUrl; });
    } catch (e) {
      // Sem miniatura: o cartão mostra só o número de fotos
    }
  }

  async function carregarTudo(uid) {
    if (carregando) return;
    carregando = true;
    mostrarMsg('gemba-msg', '');
    try {
      const [cols, mapa] = await Promise.all([carregarAtivos(), carregarListas()]);
      ativos = cols;
      listas = mapa;
      linksFotos = {};
      await carregarTodos();
      carregadoPara = uid;
      // Quem saiu da lista de Ativos sai da escolha; processo que sumiu também
      sel.colabs = sel.colabs.filter((c) => ativos.some((a) => a.id === c.id));
      if (sel.proc && !processos().includes(sel.proc)) { sel.proc = null; sel.motivo = null; }
      if (sel.acao && !acoes().includes(sel.acao)) sel.acao = null;
      desenharTudo();
    } catch (e) {
      carregadoPara = null;
      ativos = []; listas = {}; todos = [];
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

  // Dia do Gemba
  function desenharQuando() {
    const hoje = hojeIso();
    const dia = $('gemba-dia');
    dia.min = DIA_MINIMO;
    dia.max = hoje;
    if (!dia.value) dia.value = hoje;
    const outroDia = dia.value && dia.value !== hoje;
    const aviso = $('gemba-aviso-dia');
    aviso.hidden = !outroDia;
    if (outroDia) {
      const [a, m, d] = dia.value.split('-').map(Number);
      aviso.textContent = '📅 Registrando para ' + SEMANA[new Date(a, m - 1, d).getDay()] + ', ' + diaBr(dia.value) + ' (não é hoje)';
    }
    $('gemba-voltar-hoje').hidden = !outroDia;
  }

  function voltarParaHoje() {
    $('gemba-dia').value = hojeIso();
    mostrarMsg('gemba-msg', '');
    desenharQuando();
  }

  function desenharTudo() {
    desenharQuando();
    desenharResultado();
    desenharColab();
    desenharProcessos();
    desenharMotivos();
    desenharAcoes();
    desenharFotos();
    desenharBotaoSalvar();
    desenharTodos();
  }

  // Passo 1: lista de colaboradores (opcional), que começa fechada
  let listaAberta = false;

  function resumoEscolhidos() {
    const n = sel.colabs.length;
    if (!n) return 'Nenhum escolhido';
    const nomes = sel.colabs.map((c) => c.nome);
    if (n <= 2) return nomes.join(', ');
    return n + ' escolhidos: ' + nomes.slice(0, 2).join(', ') + ' +' + (n - 2);
  }

  function abrirFecharLista(abrir) {
    listaAberta = typeof abrir === 'boolean' ? abrir : !listaAberta;
    $('gemba-lista-corpo').hidden = !listaAberta;
    $('gemba-lista-abrir').setAttribute('aria-expanded', String(listaAberta));
    $('gemba-lista-abrir').classList.toggle('aberto', listaAberta);
    if (listaAberta) desenharLista();
  }

  function desenharColab() {
    $('gemba-lista-resumo').textContent = resumoEscolhidos();
    $('gemba-lista-abrir').classList.toggle('com-escolha', sel.colabs.length > 0);
    $('gemba-lista-limpar').disabled = salvando || !sel.colabs.length;
    if (listaAberta) desenharLista();
  }

  // Todos os Ativos com caixa de seleção; a busca filtra a lista
  function desenharLista() {
    const caixa = $('gemba-lista');
    caixa.textContent = '';
    if (!ativos.length) {
      caixa.appendChild(el('div', 'gemba-resultado-vazio', carregadoPara
        ? 'Nenhum colaborador Ativo cadastrado. Cadastre na aba Colaboradores.'
        : 'Carregando…'));
      return;
    }
    const q = chave($('gemba-busca').value);
    const qNum = String($('gemba-busca').value || '').replace(/\D/g, '');   // busca por CPF, com ou sem ponto e traço
    const achados = ativos.filter((c) => !q || chave(c.nome).includes(q) || String(c.matricula).toLowerCase().includes(q) ||
      (qNum.length >= 3 && String(c.cpf || '').includes(qNum)));
    if (!achados.length) {
      caixa.appendChild(el('div', 'gemba-resultado-vazio', 'Nenhum colaborador encontrado na base.'));
      return;
    }
    const escolhidos = sel.colabs.map((c) => c.id);
    const frag = document.createDocumentFragment();
    achados.forEach((c) => {
      const marcado = escolhidos.includes(c.id);
      const rotulo = el('label', 'gemba-lista-item' + (marcado ? ' marcado' : ''));
      const caixaSel = document.createElement('input');
      caixaSel.type = 'checkbox';
      caixaSel.checked = marcado;
      caixaSel.disabled = salvando;
      caixaSel.addEventListener('change', () => marcarColab(c, caixaSel.checked, caixaSel));
      rotulo.appendChild(caixaSel);
      rotulo.appendChild(el('span', 'gemba-resultado-nome', c.nome));
      rotulo.appendChild(el('span', 'gemba-resultado-info', c.matricula + ' · ' + setorTxt(c)));
      frag.appendChild(rotulo);
    });
    caixa.appendChild(frag);
  }

  function marcarColab(c, marcar, caixaSel) {
    if (salvando) return;
    mostrarMsg('gemba-msg-colab', '');
    if (marcar) {
      if (sel.colabs.some((p) => p.id === c.id)) return;
      if (sel.colabs.length >= MAX_PESSOAS) {
        caixaSel.checked = false;
        mostrarMsg('gemba-msg-colab', 'O limite é de ' + MAX_PESSOAS + ' pessoas por registro.', false);
        return;
      }
      sel.colabs.push(c);
    } else {
      sel.colabs = sel.colabs.filter((p) => p.id !== c.id);
    }
    caixaSel.parentNode.classList.toggle('marcado', marcar);
    mostrarMsg('gemba-msg', '');
    $('gemba-lista-resumo').textContent = resumoEscolhidos();
    $('gemba-lista-abrir').classList.toggle('com-escolha', sel.colabs.length > 0);
    $('gemba-lista-limpar').disabled = !sel.colabs.length;
    desenharBotaoSalvar();
  }

  function limparEscolha() {
    if (salvando) return;
    sel.colabs = [];
    mostrarMsg('gemba-msg-colab', '');
    desenharColab();
    desenharBotaoSalvar();
  }

  // Desvio ou Conforme: no Conforme, os passos de motivo e ação somem
  function desenharResultado() {
    const conf = ehConforme();
    [['gemba-res-desvio', !conf], ['gemba-res-conforme', conf]].forEach(([id, on]) => {
      $(id).classList.toggle('marcado', on);
      $(id).setAttribute('aria-pressed', String(on));
    });
    $('gemba-passo3').hidden = conf;
    $('gemba-passo4').hidden = conf;
    $('gemba-proc-titulo').textContent = conf ? 'Processo observado' : 'Processo onde o erro foi encontrado';
    $('aba-gemba').classList.toggle('gemba-modo-conforme', conf);
  }

  function escolherResultado(r) {
    if (salvando || sel.resultado === r) return;
    sel.resultado = r;
    mostrarMsg('gemba-msg', '');
    desenharResultado();
    desenharBotaoSalvar();
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

  // Fotos escolhidas (antes de salvar)
  function desenharFotos() {
    const caixa = $('gemba-miniaturas');
    caixa.textContent = '';
    caixa.hidden = !fotosSel.length;
    fotosSel.forEach((f, i) => {
      const m = el('div', 'gemba-miniatura');
      const img = document.createElement('img');
      img.src = f.previa;
      img.alt = 'Foto ' + (i + 1);
      m.appendChild(img);
      const x = el('button', 'gemba-miniatura-tirar', '×');
      x.type = 'button';
      x.title = 'Tirar esta foto';
      x.setAttribute('aria-label', 'Tirar a foto ' + (i + 1));
      x.disabled = salvando;
      x.addEventListener('click', () => {
        URL.revokeObjectURL(f.previa);
        fotosSel = fotosSel.filter((p) => p !== f);
        mostrarMsg('gemba-msg-fotos', '');
        desenharFotos();
      });
      m.appendChild(x);
      caixa.appendChild(m);
    });
    const cheio = fotosSel.length >= MAX_FOTOS;
    $('gemba-foto-rotulo').classList.toggle('ocupado', salvando || cheio);
    $('gemba-foto-arquivo').disabled = salvando || cheio;
    $('gemba-foto-texto').textContent = cheio
      ? 'Limite de ' + MAX_FOTOS + ' fotos'
      : (fotosSel.length ? '📷 Adicionar mais fotos' : '📷 Adicionar fotos');
    $('gemba-fotos-contagem').textContent = fotosSel.length
      ? fotosSel.length + ' de ' + MAX_FOTOS
      : 'Opcional · até ' + MAX_FOTOS;
  }

  function desenharBotaoSalvar() {
    if (salvando) return;
    const n = sel.colabs.length;
    const conf = ehConforme();
    const base = conf ? 'Salvar conforme' : 'Salvar registro';
    $('gemba-salvar').textContent = n > 1 ? base + ' (' + n + ' pessoas)' : base;
    $('gemba-salvar').classList.toggle('botao-conforme', conf);
  }

  // Junta as linhas de um mesmo salvamento (grupo)
  function agruparLinhas(lista) {
    const mapa = {};
    const ordem = [];
    lista.forEach((r) => {
      const g = r.grupo || ('linha-' + r.id);
      if (!mapa[g]) { mapa[g] = { grupo: r.grupo, linhas: [] }; ordem.push(g); }
      mapa[g].linhas.push(r);
    });
    return ordem.map((g) => mapa[g]);
  }

  const nomeDaLinha = (r) => (r.colaboradores && r.colaboradores.nome) || 'Sem colaborador';

  async function abrirFoto(caminho, idMsg) {
    // Abre a aba já no clique (senão o navegador pode bloquear) e depois coloca o endereço
    const aba = window.open('', '_blank');
    if (aba) aba.document.write('<p style="font-family:sans-serif">Abrindo foto…</p>');
    const { data, error } = await sb.storage.from(PASTA).createSignedUrl(caminho, 3600);
    if (error || !data || !data.signedUrl) {
      if (aba) aba.close();
      mostrarMsg(idMsg || 'gemba-msg-todos', 'Não foi possível abrir a foto. ' + traduzirErro(error || {}), false);
      return;
    }
    if (aba) aba.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  /* ---------------- Todos os Gemba (tabela) ---------------- */

  function abrirFecharTodos() {
    todosAberto = !todosAberto;
    $('gemba-todos-corpo').hidden = !todosAberto;
    $('gemba-todos-abrir').setAttribute('aria-expanded', String(todosAberto));
    $('gemba-todos-abrir').classList.toggle('aberto', todosAberto);
    desenharTodos();
  }

  // Texto em que a busca procura (sem acento): data, hora, nomes, matrículas, processo, motivo, ação e observação
  function textoBusca(g) {
    const r = g.linhas[0];
    const pessoas = g.linhas.map((x) => nomeDaLinha(x) + ' ' + ((x.colaboradores && x.colaboradores.matricula) || '')).join(' ');
    return chave([dataBr(r.data), horaDe(r.data), pessoas, conformeDaLinha(r) ? 'conforme' : 'desvio',
      r.processo, r.motivo || '', r.acao || '', r.observacao || ''].join(' '));
  }

  function desenharTodos() {
    const grupos = agruparLinhas(todos);
    const nConf = todos.filter(conformeDaLinha).length;
    const nDev = todos.length - nConf;
    $('gemba-todos-total').textContent = todos.length
      ? '· ' + plural(nDev, 'desvio', 'desvios') + ' · ' + plural(nConf, 'conforme', 'conformes') +
        ' em ' + plural(grupos.length, 'registro', 'registros')
      : '';
    if (!todosAberto) return;

    // Busca por palavras: "conforme ana" acha os conformes em que a Ana aparece
    const q = chave($('gemba-todos-busca').value);
    const palavras = q.split(' ').filter(Boolean);
    const achados = palavras.length ? grupos.filter((g) => { const t = textoBusca(g); return palavras.every((p) => t.includes(p)); }) : grupos;
    const caixa = $('gemba-todos-linhas');
    caixa.textContent = '';
    const vazio = $('gemba-todos-vazio');
    if (!achados.length) {
      vazio.hidden = false;
      vazio.textContent = !carregadoPara ? '—' : (grupos.length ? 'Nenhum registro encontrado para "' + $('gemba-todos-busca').value.trim() + '".' : 'Nenhum registro no Gemba ainda.');
      return;
    }
    vazio.hidden = true;
    const frag = document.createDocumentFragment();
    // Na coluna Pessoas, o nome procurado aparece primeiro (ignora as palavras "conforme"/"desvio")
    const qNome = palavras.filter((p) => p !== 'conforme' && p !== 'desvio').join(' ');
    achados.forEach((g, i) => frag.appendChild(linhaTodos(g, qNome, i)));
    caixa.appendChild(frag);
  }

  function celula(texto, classe, dica) {
    const d = el('div', classe || null, texto);
    if (dica) d.title = dica;
    return d;
  }

  function linhaTodos(g, q, i) {
    const r = g.linhas[0];
    const bloco = el('div', 'gemba-todos-bloco' + (i % 2 ? ' par' : ''));
    const linha = el('div', 'planilha-linha');

    // Pessoas: até 2 nomes; na busca, quem bate com o texto aparece primeiro
    let nomes = g.linhas.map(nomeDaLinha);
    if (q) {
      const bate = (n, idx) => chave(n + ' ' + ((g.linhas[idx].colaboradores && g.linhas[idx].colaboradores.matricula) || '')).includes(q);
      const marcados = nomes.map((n, idx) => ({ n, b: bate(n, idx) }));
      nomes = marcados.filter((x) => x.b).map((x) => x.n).concat(marcados.filter((x) => !x.b).map((x) => x.n));
    }
    const visiveis = nomes.slice(0, MAX_NOMES_TABELA).join(', ');
    const resto = nomes.length - MAX_NOMES_TABELA;
    const cPessoas = el('div', 'gemba-todos-pessoas');
    cPessoas.title = g.linhas.map(nomeDaLinha).join('\n');
    cPessoas.appendChild(el('span', 'gemba-todos-nomes', visiveis));
    if (resto > 0) cPessoas.appendChild(el('span', 'gemba-todos-mais', '+' + resto));

    linha.appendChild(celula(dataBr(r.data), 'numero'));
    linha.appendChild(celula(horaDe(r.data), 'numero'));
    linha.appendChild(cPessoas);
    const conf = conformeDaLinha(r);
    const cRes = el('div');
    cRes.appendChild(el('span', 'gemba-selo ' + (conf ? 'gemba-selo-conforme' : 'gemba-selo-desvio'), conf ? '✅ Conforme' : '❌ Desvio'));
    linha.appendChild(cRes);
    linha.appendChild(celula(r.processo, 'gemba-todos-texto', r.processo));
    linha.appendChild(celula(r.motivo || '—', 'gemba-todos-texto' + (r.motivo ? '' : ' gemba-todos-sem'), r.motivo || ''));
    linha.appendChild(celula(r.acao || '—', 'gemba-todos-texto' + (r.acao ? '' : ' gemba-todos-sem'), r.acao || ''));
    linha.appendChild(celula(r.observacao || '—', 'gemba-todos-texto' + (r.observacao ? '' : ' gemba-todos-sem'), r.observacao || ''));

    // Fotos
    const fotos = r.fotos || [];
    const chaveG = g.grupo || ('linha-' + r.id);
    const cFotos = el('div', 'centro');
    if (fotos.length) {
      const b = el('button', 'gemba-todos-fotos-botao' + (fotosAbertas[chaveG] ? ' aberto' : ''), '📷 ' + fotos.length);
      b.type = 'button';
      b.title = fotosAbertas[chaveG] ? 'Esconder as fotos' : 'Ver as fotos';
      b.setAttribute('aria-expanded', String(!!fotosAbertas[chaveG]));
      b.addEventListener('click', async () => {
        fotosAbertas[chaveG] = !fotosAbertas[chaveG];
        if (fotosAbertas[chaveG]) {
          b.disabled = true;
          await prepararLinks(fotos);
        }
        desenharTodos();
      });
      cFotos.appendChild(b);
    } else {
      cFotos.appendChild(el('span', 'gemba-todos-sem', '—'));
    }
    linha.appendChild(cFotos);

    // Lixeira
    const cLix = el('div', 'centro');
    const lix = el('button', 'botao-lixeira');
    lix.type = 'button';
    lix.title = 'Excluir (só para lançamento feito errado)';
    lix.setAttribute('aria-label', 'Excluir registro de ' + g.linhas.map(nomeDaLinha).join(', ') + ' em ' + dataBr(r.data) + ' às ' + horaDe(r.data));
    lix.innerHTML = ICONE_LIXEIRA;
    lix.addEventListener('click', () => excluir(g, lix, 'gemba-msg-todos'));
    cLix.appendChild(lix);
    linha.appendChild(cLix);
    bloco.appendChild(linha);

    // Miniaturas abertas embaixo da linha
    if (fotos.length && fotosAbertas[chaveG]) {
      const fila = el('div', 'gemba-todos-miniaturas');
      fotos.forEach((caminho, k) => {
        const b = el('button', 'gemba-registro-foto');
        b.type = 'button';
        b.title = 'Abrir foto ' + (k + 1) + ' de ' + fotos.length;
        b.setAttribute('aria-label', 'Abrir foto ' + (k + 1) + ' de ' + fotos.length);
        if (linksFotos[caminho]) {
          const img = document.createElement('img');
          img.src = linksFotos[caminho];
          img.alt = '';
          img.loading = 'lazy';
          b.appendChild(img);
        } else {
          b.textContent = '📷';
        }
        b.addEventListener('click', () => abrirFoto(caminho, 'gemba-msg-todos'));
        fila.appendChild(b);
      });
      bloco.appendChild(fila);
    }
    return bloco;
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

  /* ---------------- Fotos ---------------- */

  function escolherFotos(input) {
    const arquivos = Array.from(input.files || []);
    input.value = '';
    if (!arquivos.length || salvando) return;
    mostrarMsg('gemba-msg-fotos', '');
    const avisos = [];
    let ficaramDeFora = 0;
    arquivos.forEach((a) => {
      const nome = String(a.name || '').toLowerCase();
      const ehImagem = /^image\//.test(a.type) || /\.(jpe?g|png|heic|heif|webp)$/.test(nome);
      if (!ehImagem) { avisos.push('"' + a.name + '" não é uma foto'); return; }
      if (fotosSel.length >= MAX_FOTOS) { ficaramDeFora++; return; }
      fotosSel.push({ arquivo: a, previa: URL.createObjectURL(a) });
    });
    if (ficaramDeFora) {
      avisos.push(plural(ficaramDeFora, 'foto ficou', 'fotos ficaram') + ' de fora, porque o limite é de ' + MAX_FOTOS + ' por registro');
    }
    if (avisos.length) mostrarMsg('gemba-msg-fotos', 'Atenção: ' + avisos.join('; ') + '.', false);
    desenharFotos();
  }

  // Diminui a foto (lado maior até 1600 px) e devolve um JPEG.
  // Se o navegador não conseguir ler a imagem, devolve null.
  function reduzirFoto(arquivo) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, FOTO_LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';   // PNG com fundo transparente fica com fundo branco
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', FOTO_QUALIDADE);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // Prepara uma foto para envio: { corpo, extensao, tipoMime } ou null
  async function prepararFoto(arquivo) {
    const nome = String(arquivo.name || '').toLowerCase();
    let corpo = await reduzirFoto(arquivo);
    let extensao = 'jpg';
    let tipoMime = 'image/jpeg';
    const jpeg = arquivo.type === 'image/jpeg' || /\.jpe?g$/.test(nome);
    const png = arquivo.type === 'image/png' || /\.png$/.test(nome);
    if (!corpo) {
      // O navegador não conseguiu ler: só dá para enviar se já for JPEG ou PNG
      if (!jpeg && !png) return null;
      corpo = arquivo;
      extensao = png ? 'png' : 'jpg';
      tipoMime = png ? 'image/png' : 'image/jpeg';
    } else if (corpo.size >= arquivo.size && (jpeg || png)) {
      // A foto já era pequena e a reduzida ficou maior: envia a original
      corpo = arquivo;
      extensao = png ? 'png' : 'jpg';
      tipoMime = png ? 'image/png' : 'image/jpeg';
    }
    if (corpo.size > LIMITE_ARQUIVO) return null;
    return { corpo, extensao, tipoMime };
  }

  async function removerArquivos(caminhos) {
    if (!caminhos.length) return;
    try { await sb.storage.from(PASTA).remove(caminhos); } catch (e) { /* segue */ }
  }

  /* ---------------- Salvar e excluir ---------------- */

  function travarFormulario(travar) {
    ['gemba-busca', 'gemba-novo-proc', 'gemba-add-proc', 'gemba-motivo', 'gemba-novo-motivo', 'gemba-add-motivo',
      'gemba-nova-acao', 'gemba-add-acao', 'gemba-obs', 'gemba-lista-limpar', 'gemba-dia', 'gemba-voltar-hoje'].forEach((id) => { $(id).disabled = travar; });
    document.querySelectorAll('#aba-gemba .gemba-res, #aba-gemba .gemba-opcao, #aba-gemba .gemba-acao, #aba-gemba .gemba-lista-item input, #aba-gemba .gemba-miniatura-tirar')
      .forEach((b) => { b.disabled = travar; });
  }

  async function salvar() {
    if (salvando) return;
    if (!carregadoPara) { mostrarMsg('gemba-msg', 'O Gemba ainda não carregou. Espere um instante e tente de novo.', false); return; }
    const conf = ehConforme();
    const falta = [];
    if (!sel.proc) falta.push('processo');
    if (!conf && !sel.motivo) falta.push('motivo');
    if (!conf && !sel.acao) falta.push('ação tomada');
    const diaTxt = $('gemba-dia').value;
    const horaTxt = agoraHora();   // a hora gravada é a hora em que você salva
    if (!diaTxt) falta.push('dia do Gemba');
    if (falta.length) { mostrarMsg('gemba-msg', 'Falta escolher: ' + falta.join(', ') + '.', false); return; }
    const [da, dm, dd] = diaTxt.split('-').map(Number);
    const [hh, mi] = horaTxt.split(':').map(Number);
    const quando = new Date(da, dm - 1, dd, hh, mi, 0);
    if (isNaN(quando.getTime())) { mostrarMsg('gemba-msg', 'Dia inválido.', false); return; }
    if (diaTxt < DIA_MINIMO) { mostrarMsg('gemba-msg', 'O dia do Gemba precisa ser a partir de ' + diaBr(DIA_MINIMO) + ' (início da contagem do Painel).', false); return; }
    if (diaTxt > hojeIso()) { mostrarMsg('gemba-msg', 'O dia do Gemba não pode estar no futuro.', false); return; }
    const diaHoje = diaTxt === hojeIso();

    salvando = true;
    const botao = $('gemba-salvar');
    botao.disabled = true;
    travarFormulario(true);
    desenharFotos();
    mostrarMsg('gemba-msg', '');

    const pessoas = sel.colabs.slice();
    const grupo = novoCodigo();
    const enviados = [];
    try {
      // 1) Envia as fotos (se houver)
      for (let i = 0; i < fotosSel.length; i++) {
        botao.textContent = 'Enviando foto ' + (i + 1) + ' de ' + fotosSel.length + '…';
        const f = await prepararFoto(fotosSel[i].arquivo);
        if (!f) {
          const e = new Error('foto');
          e.fotoInvalida = i + 1;
          throw e;
        }
        const caminho = grupo + '/foto-' + (i + 1) + '-' + Date.now() + '.' + f.extensao;
        const up = await sb.storage.from(PASTA).upload(caminho, f.corpo, { contentType: f.tipoMime, upsert: false });
        if (up.error) throw up.error;
        enviados.push(caminho);
      }

      // 2) Grava uma linha por pessoa, todas de uma vez (tudo ou nada)
      botao.textContent = 'Salvando…';
      const observacao = String($('gemba-obs').value || '').trim();
      // Sem ninguém marcado: uma linha "Sem colaborador"
      const ids = pessoas.length ? pessoas.map((c) => c.id) : [null];
      const linhas = ids.map((id) => ({
        colaborador_id: id,
        grupo,
        fotos: enviados,
        data: quando.toISOString(),
        resultado: conf ? 'Conforme' : 'Desvio',
        processo: sel.proc,
        motivo: conf ? null : sel.motivo,
        acao: conf ? null : sel.acao,
        observacao
      }));
      const { data, error } = await sb.from(TABELA).insert(linhas).select(CAMPOS_REG);
      if (error) throw error;

      // O registro novo entra na tabela "Todos os Gemba", na posição do dia do Gemba
      todos = (data || []).concat(todos).sort((a, b) => (a.data > b.data ? -1 : a.data < b.data ? 1 : a.id - b.id));

      // Limpa o formulário; o processo e a escolha Desvio/Conforme continuam marcados
      fotosSel.forEach((f) => URL.revokeObjectURL(f.previa));
      fotosSel = [];
      sel.colabs = [];
      sel.motivo = null;
      sel.acao = null;
      $('gemba-obs').value = '';
      $('gemba-busca').value = '';
      ['gemba-msg-colab', 'gemba-msg-proc', 'gemba-msg-motivo', 'gemba-msg-acao', 'gemba-msg-fotos'].forEach((id) => mostrarMsg(id, ''));
      salvando = false;
      abrirFecharLista(false);
      desenharTudo();
      const quem = pessoas.length > 1 ? 'para ' + plural(pessoas.length, 'pessoa', 'pessoas')
        : (pessoas.length ? 'para ' + pessoas[0].nome : 'sem colaborador');
      mostrarMsg('gemba-msg', (conf ? '✅ Conforme salvo ' : 'Registro salvo ') + quem +
        (diaHoje ? '' : ' · dia ' + diaBr(diaTxt).slice(0, 5)) +
        (enviados.length ? ', com ' + plural(enviados.length, 'foto', 'fotos') : '') + '.', true);
    } catch (e) {
      // Nada fica pela metade: apaga as fotos que já tinham subido
      await removerArquivos(enviados);
      const texto = e && e.fotoInvalida
        ? 'Não consegui ler a foto ' + e.fotoInvalida + '. Tire essa foto da lista (×) ou escolha outra em JPEG ou PNG.'
        : traduzirErro(e);
      salvando = false;
      mostrarMsg('gemba-msg', 'Não foi possível salvar. Nada foi gravado. ' + texto, false);
    } finally {
      salvando = false;
      botao.disabled = false;
      travarFormulario(false);
      desenharFotos();
      desenharColab();
      desenharBotaoSalvar();
    }
  }

  async function excluir(g, botao, idMsg) {
    const caixaMsg = idMsg || 'gemba-msg-todos';
    const r = g.linhas[0];
    const nomes = g.linhas.map(nomeDaLinha);
    const fotos = r.fotos || [];
    const ok = window.confirm(
      'Excluir o registro de ' + dataBr(r.data) + ' às ' + horaDe(r.data) + ' (' + r.processo + ' · ' +
        (conformeDaLinha(r) ? 'Conforme' : r.motivo) + ')?\n\n' +
      (nomes.length > 1 ? 'Pessoas (' + nomes.length + '): ' : 'Pessoa: ') + nomes.join(', ') + '\n' +
      (fotos.length ? plural(fotos.length, 'foto também será apagada', 'fotos também serão apagadas') + '.\n' : '') +
      '\nUse a exclusão SÓ para corrigir lançamento feito errado.');
    if (!ok) return;
    botao.disabled = true;
    const ids = g.linhas.map((x) => x.id);
    const consulta = g.grupo
      ? sb.from(TABELA).delete().eq('grupo', g.grupo)
      : sb.from(TABELA).delete().in('id', ids);
    const { error } = await consulta;
    if (error) {
      botao.disabled = false;
      mostrarMsg(caixaMsg, 'Não foi possível excluir. ' + traduzirErro(error), false);
      return;
    }
    await removerArquivos(fotos);
    const fica = (x) => !ids.includes(x.id) && !(g.grupo && x.grupo === g.grupo);
    todos = todos.filter(fica);
    desenharTodos();
    const semNinguem = nomes.length === 1 && !(r.colaboradores && r.colaboradores.nome);
    mostrarMsg(caixaMsg, semNinguem ? 'Registro sem colaborador excluído.'
      : 'Registro de ' + (nomes.length > 1 ? plural(nomes.length, 'pessoa', 'pessoas') : nomes[0]) + ' excluído.', true);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    ativos = []; listas = {}; todos = [];
    linksFotos = {};
    Object.keys(fotosAbertas).forEach((k) => delete fotosAbertas[k]);
    $('gemba-todos-busca').value = '';
    if (!todosAberto) abrirFecharTodos();   // na próxima entrada, a tabela começa aberta
    abrirFecharLista(false);
    carregadoPara = null;
    $('gemba-dia').value = '';
    sel.resultado = 'Desvio'; sel.colabs = []; sel.proc = null; sel.motivo = null; sel.acao = null;
    fotosSel.forEach((f) => URL.revokeObjectURL(f.previa));
    fotosSel = [];
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

  $('gemba-lista-abrir').addEventListener('click', () => abrirFecharLista());
  $('gemba-busca').addEventListener('input', desenharLista);
  $('gemba-busca').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  $('gemba-lista-limpar').addEventListener('click', limparEscolha);
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
  $('gemba-foto-arquivo').addEventListener('change', (ev) => escolherFotos(ev.target));
  $('gemba-salvar').addEventListener('click', salvar);
  $('gemba-dia').addEventListener('change', () => {
    const v = $('gemba-dia').value;
    if (v && v > hojeIso()) $('gemba-dia').value = hojeIso();
    if (v && v < DIA_MINIMO) $('gemba-dia').value = DIA_MINIMO;
    mostrarMsg('gemba-msg', '');
    desenharQuando();
  });
  $('gemba-voltar-hoje').addEventListener('click', voltarParaHoje);
  $('gemba-res-desvio').addEventListener('click', () => escolherResultado('Desvio'));
  $('gemba-res-conforme').addEventListener('click', () => escolherResultado('Conforme'));
  $('gemba-todos-abrir').addEventListener('click', abrirFecharTodos);
  $('gemba-todos-busca').addEventListener('input', desenharTodos);

  // Ao abrir a aba, atualiza a lista de Ativos, as listas e a tabela
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'gemba' && carregadoPara && !salvando) carregarTudo(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
