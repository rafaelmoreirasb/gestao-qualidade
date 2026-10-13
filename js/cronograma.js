/* ==========================================================
   js/cronograma.js
   Aba Cronograma: criar treinamento (Tema, Data, Horário e
   Carga horária), calendário do mês (com Exportar PDF e Tela
   cheia), lista "Aguardando participantes", tabela com todos
   e janela do treinamento (participantes só Ativos, carga
   horária editável e status Agendado/Realizado).
   Tabelas: treinamentos e treinamento_participantes.
   Todo treinamento aparece no mapa de calor do Painel.
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const HORA_PADRAO = '08:00';
  const POR_DIA = 4;          // treinamentos mostrados em cada dia do calendário
  const CAMPOS = 'id, data, hora, tema, carga_minutos, status';

  let colaboradores = [];   // todos (Ativos e Desligados), em ordem de nome
  let treinos = [];         // { id, data: 'AAAA-MM-DD', hora: 'HH:MM', tema, carga (minutos ou null), status }
  let participantes = {};   // id do treinamento -> Set com ids de colaboradores
  let carregadoPara = null;
  let carregando = false;

  const est = { ano: null, mes: null, aberto: null, formAberto: true, cheia: false, imprimindo: false };

  /* ---------------- Ajudantes ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const chaveDia = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeK = () => chaveDia(new Date());
  const horaCurta = (h) => String(h || '').slice(0, 5) || HORA_PADRAO;
  const dataCurta = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
  const dataCompleta = (k) => dataCurta(k) + '/' + k.slice(0, 4);
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const limparTexto = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const ehAtivo = (c) => (c.status || 'Ativo') === 'Ativo';

  /* --------- Carga horária: "HH:MM" <-> minutos --------- */

  // Enquanto digita: só números, e os dois-pontos entram sozinhos (0010 -> 00:10)
  function mascaraCarga(valor) {
    const d = String(valor || '').replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, d.length - 2) + ':' + d.slice(-2) : d;
  }

  // Devolve os minutos, ou null se o texto não for uma carga válida
  function lerCarga(texto) {
    const m = String(texto || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!m) return null;
    const minutos = Number(m[1]) * 60 + Number(m[2]);
    return minutos > 0 ? minutos : null;
  }

  const cargaTexto = (min) => (min ? pad(Math.floor(min / 60)) + ':' + pad(min % 60) : '—');

  /* --------- Situação de cada treino --------- */

  // Realizado = marcado por você. Agendado com data já passada = Atrasado.
  function situacao(t) {
    if (t.status === 'Realizado') return 'Realizado';
    const h = hojeK();
    if (t.data < h) return 'Atrasado';
    if (t.data === h) return 'Hoje';
    return 'Agendado';
  }

  const classeSituacao = (sit) => (sit === 'Realizado' ? ' realizado' : (sit === 'Atrasado' ? ' atrasado' : ''));

  function quando(t, comAno) {
    const dia = t.data === hojeK() ? 'Hoje' : (comAno ? dataCompleta(t.data) : dataCurta(t.data));
    return dia + ' · ' + t.hora;
  }

  function ordenados() {
    return treinos.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora) || a.id - b.id);
  }

  const qtd = (t) => (participantes[t.id] ? participantes[t.id].size : 0);

  function nomesDe(t) {
    const s = participantes[t.id];
    if (!s || !s.size) return '';
    return colaboradores.filter((c) => s.has(c.id)).map((c) => c.nome).join(', ');
  }

  function doBanco(t) {
    return {
      id: t.id,
      data: t.data,
      hora: horaCurta(t.hora),
      tema: t.tema,
      carga: t.carga_minutos || null,
      status: t.status === 'Realizado' ? 'Realizado' : 'Agendado'
    };
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
    if (code === '42703' || (m.includes('column') && (m.includes('carga_minutos') || m.includes('status')))) {
      return 'Faltam as colunas novas no banco. Rode o arquivo sql/004_cronograma_status_carga.sql no Supabase (SQL Editor).';
    }
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Cronograma ainda não existem no banco. Rode os arquivos sql/003_cronograma.sql e sql/004_cronograma_status_carga.sql no Supabase (SQL Editor).';
    }
    if (code === '23503') return 'Esse treinamento ou colaborador não existe mais. Recarregue a página.';
    if (code === '23514') return 'O banco recusou o valor. Confira a carga horária (ex.: 00:10 ou 01:30).';
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se os arquivos sql/003 e sql/004 foram rodados inteiros.';
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
    mostrarMsg('crono-msg-geral', '');
    try {
      const [cols, tres, parts] = await Promise.all([
        lerTudo(() => sb.from('colaboradores')
          .select('id, matricula, nome, status')
          .order('nome', { ascending: true })
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('treinamentos')
          .select(CAMPOS)
          .order('data', { ascending: true })
          .order('hora', { ascending: true })
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('treinamento_participantes')
          .select('treinamento_id, colaborador_id')
          .order('id', { ascending: true }))
      ]);
      colaboradores = cols;
      treinos = tres.map(doBanco);
      participantes = {};
      parts.forEach((p) => {
        (participantes[p.treinamento_id] = participantes[p.treinamento_id] || new Set()).add(p.colaborador_id);
      });
      carregadoPara = uid;
    } catch (e) {
      carregadoPara = null;
      colaboradores = []; treinos = []; participantes = {};
      mostrarMsg('crono-msg-geral', 'Não foi possível carregar o Cronograma. ' + traduzirErro(e), false);
    } finally {
      carregando = false;
      desenharTudo();
      if (est.aberto != null) desenharJanela();
    }
  }

  /* ---------------- Desenhar ---------------- */

  function desenharTudo() {
    desenharForm();
    desenharCalendario();
    desenharPendentes();
    desenharTabela();
  }

  function desenharForm() {
    $('crono-form').hidden = !est.formAberto;
    $('crono-alternar').textContent = est.formAberto ? 'Fechar' : '+ Novo treinamento';
  }

  /* --------- Calendário do mês --------- */

  function desenharCalendario() {
    if (est.ano == null) {
      const h = new Date();
      est.ano = h.getFullYear();
      est.mes = h.getMonth();
    }
    $('crono-mes-titulo').textContent = MESES[est.mes] + ' ' + est.ano;

    const porDia = {};
    ordenados().forEach((t) => { (porDia[t.data] = porDia[t.data] || []).push(t); });
    const hoje = hojeK();
    // No PDF não destaca o dia escolhido no formulário
    const escolhida = est.formAberto && !est.imprimindo ? $('crono-data').value : '';

    const grade = $('crono-grade');
    grade.textContent = '';
    const primeiro = new Date(est.ano, est.mes, 1);
    const inicio = new Date(est.ano, est.mes, 1 - primeiro.getDay());

    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      // Para quando a semana nova já começa no mês seguinte
      if (i > 0 && i % 7 === 0 && d.getMonth() !== est.mes && d > primeiro) break;
      const k = chaveDia(d);
      const evs = porDia[k] || [];

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crono-dia';
      if (d.getDay() === 0 || d.getDay() === 6) b.classList.add('fim-de-semana');
      if (d.getMonth() !== est.mes) b.classList.add('fora');
      if (k === escolhida) b.classList.add('selecionado');
      if (k === hoje) b.classList.add('hoje');

      const num = document.createElement('span');
      num.className = 'crono-dia-num';
      num.textContent = String(d.getDate());
      b.appendChild(num);

      evs.slice(0, POR_DIA).forEach((t) => {
        const e = document.createElement('span');
        e.className = 'crono-evento' + classeSituacao(situacao(t));
        e.textContent = t.hora + ' ' + t.tema;
        b.appendChild(e);
      });
      if (evs.length > POR_DIA) {
        const mais = document.createElement('span');
        mais.className = 'crono-mais';
        mais.textContent = '+' + (evs.length - POR_DIA) + ' treinamento(s)';
        b.appendChild(mais);
      }

      b.title = evs.length
        ? evs.map((t) => t.hora + ' ' + t.tema + ' · ' + situacao(t) + ' (' + (qtd(t) ? plural(qtd(t), 'pessoa', 'pessoas') : 'sem participantes') + ')').join('\n')
        : dataCompleta(k);
      b.addEventListener('click', () => {
        if (evs.length) abrirJanela(evs[0].id);
        else escolherData(k);
      });
      grade.appendChild(b);
    }
  }

  function escolherData(k) {
    if (est.cheia) sairTelaCheia();
    $('crono-data').value = k;
    est.formAberto = true;
    mostrarMsg('crono-msg-form', '');
    desenharForm();
    desenharCalendario();
    $('crono-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('crono-tema').focus({ preventScroll: true });
  }

  function mudarMes(passo) {
    let m = est.mes + passo;
    let a = est.ano;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    est.mes = m;
    est.ano = a;
    desenharCalendario();
  }

  /* --------- Tela cheia --------- */

  function entrarTelaCheia() {
    est.cheia = true;
    $('crono-calendario').classList.add('crono-cheia');
    document.body.classList.add('crono-travado');
    $('crono-tela-cheia').textContent = 'Sair da tela cheia';
    // Esconde também as barras do navegador, quando ele deixa (no iPhone não deixa;
    // lá o calendário só ocupa a página inteira)
    const raiz = document.documentElement;
    if (raiz.requestFullscreen && !document.fullscreenElement) {
      raiz.requestFullscreen().catch(() => {});
    }
  }

  function sairTelaCheia() {
    est.cheia = false;
    $('crono-calendario').classList.remove('crono-cheia');
    if (est.aberto == null) document.body.classList.remove('crono-travado');
    $('crono-tela-cheia').textContent = 'Tela cheia';
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  /* --------- Exportar PDF (janela de impressão do navegador) --------- */

  function exportarPdf() {
    const tituloAntes = document.title;
    // O título vira o nome sugerido do arquivo PDF
    document.title = 'Cronograma de treinamentos - ' + MESES[est.mes] + ' ' + est.ano;
    document.body.classList.add('crono-imprimindo');
    est.imprimindo = true;
    desenharCalendario();
    const terminar = () => {
      document.body.classList.remove('crono-imprimindo');
      document.title = tituloAntes;
      est.imprimindo = false;
      desenharCalendario();
      window.removeEventListener('afterprint', terminar);
    };
    window.addEventListener('afterprint', terminar);
    window.print();
    // Alguns navegadores não avisam quando a impressão termina
    setTimeout(() => { if (document.body.classList.contains('crono-imprimindo')) terminar(); }, 1500);
  }

  /* --------- Aguardando participantes --------- */

  // Só treinos Agendados e sem nenhum participante (inclusive os de data já passada)
  function desenharPendentes() {
    const caixa = $('crono-proximos-lista');
    caixa.textContent = '';
    const pend = ordenados().filter((t) => t.status === 'Agendado' && qtd(t) === 0);

    if (!pend.length) {
      const v = document.createElement('div');
      v.className = 'crono-proximo-vazio';
      v.textContent = 'Nenhum treinamento aguardando participantes.';
      caixa.appendChild(v);
      return;
    }

    pend.forEach((t) => {
      const atrasado = situacao(t) === 'Atrasado';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crono-proximo';

      const topo = document.createElement('span');
      topo.className = 'crono-proximo-topo';
      const tema = document.createElement('span');
      tema.className = 'crono-proximo-tema';
      tema.textContent = t.tema;
      const q = document.createElement('span');
      q.className = 'crono-proximo-quando';
      q.textContent = quando(t, false);
      topo.appendChild(tema);
      topo.appendChild(q);
      b.appendChild(topo);

      const info = document.createElement('span');
      info.className = 'crono-proximo-nomes';
      info.textContent = 'Carga horária: ' + cargaTexto(t.carga);
      b.appendChild(info);

      const cont = document.createElement('span');
      cont.className = 'crono-proximo-qtd sem';
      cont.textContent = (atrasado ? 'Atrasado · ' : '') + 'Sem participantes · clique para adicionar';
      b.appendChild(cont);

      b.addEventListener('click', () => abrirJanela(t.id));
      caixa.appendChild(b);
    });
  }

  /* --------- Tabela com todos --------- */

  const ICONE_LIXEIRA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D40511" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';

  function celula(classe, texto) {
    const d = document.createElement('div');
    if (classe) d.className = classe;
    if (texto != null) d.textContent = texto;
    return d;
  }

  function chipSituacao(t) {
    const sit = situacao(t);
    const chip = document.createElement('span');
    chip.className = 'crono-chip' + classeSituacao(sit);
    chip.textContent = sit;
    return chip;
  }

  function desenharTabela() {
    const lista = ordenados().reverse(); // mais recentes primeiro
    $('crono-total').textContent = '· ' + lista.length;

    const caixa = $('crono-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();

    lista.forEach((t) => {
      const n = qtd(t);
      const linha = document.createElement('div');
      linha.className = 'planilha-linha';

      linha.appendChild(celula('numero', dataCompleta(t.data)));
      linha.appendChild(celula('numero', t.hora));
      linha.appendChild(celula('numero', cargaTexto(t.carga)));
      linha.appendChild(celula('crono-col-tema', t.tema));
      linha.appendChild(celula('crono-col-pessoas' + (n ? '' : ' sem'), n ? nomesDe(t) : 'Nenhum participante ainda'));

      const cs = celula('');
      cs.appendChild(chipSituacao(t));
      linha.appendChild(cs);

      const ca = celula('crono-col-acoes');
      const bp = document.createElement('button');
      bp.type = 'button';
      bp.className = 'crono-botao-part';
      bp.textContent = 'Participantes';
      bp.title = 'Participantes, carga horária e status';
      bp.addEventListener('click', () => abrirJanela(t.id));
      ca.appendChild(bp);

      const lix = document.createElement('button');
      lix.type = 'button';
      lix.className = 'botao-lixeira';
      lix.setAttribute('aria-label', 'Excluir ' + t.tema);
      lix.title = 'Excluir (só para lançamento feito errado)';
      lix.innerHTML = ICONE_LIXEIRA;
      lix.addEventListener('click', () => excluir(t, lix));
      ca.appendChild(lix);
      linha.appendChild(ca);

      frag.appendChild(linha);
    });
    caixa.appendChild(frag);

    const vazio = $('crono-vazio');
    if (!lista.length) {
      vazio.textContent = carregadoPara
        ? 'Nenhum treinamento cadastrado ainda. Crie o primeiro no formulário acima.'
        : 'Carregando treinamentos…';
      vazio.hidden = false;
    } else {
      vazio.hidden = true;
    }
  }

  /* ---------------- Criar treinamento ---------------- */

  async function adicionar(ev) {
    ev.preventDefault();
    if (!carregadoPara) { mostrarMsg('crono-msg-form', 'O Cronograma ainda não carregou. Espere um instante e tente de novo.', false); return; }

    const tema = limparTexto($('crono-tema').value);
    const data = $('crono-data').value;
    const hora = $('crono-hora').value || HORA_PADRAO;
    const carga = lerCarga($('crono-carga').value);
    const falta = [];
    if (!tema) falta.push('tema');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) falta.push('data');
    if (!carga) falta.push('carga horária (horas:minutos, ex.: 00:10 ou 01:30)');
    if (falta.length) { mostrarMsg('crono-msg-form', 'Preencha: ' + falta.join(', ') + '.', false); return; }

    const botao = $('crono-adicionar');
    botao.disabled = true;
    try {
      const { data: novo, error } = await sb.from('treinamentos')
        .insert({ data, hora, tema, carga_minutos: carga, status: 'Agendado' })
        .select(CAMPOS)
        .single();
      if (error) throw error;
      treinos.push(doBanco(novo));
      participantes[novo.id] = new Set();

      // Mostra o mês do treinamento criado
      const [a, m] = novo.data.split('-').map(Number);
      est.ano = a;
      est.mes = m - 1;
      $('crono-tema').value = '';
      $('crono-carga').value = '';
      desenharTudo();
      mostrarMsg('crono-msg-form', 'Treinamento criado. Ele já aparece no mapa de calor do Painel. Abra-o para acrescentar os participantes.', true);
    } catch (e) {
      mostrarMsg('crono-msg-form', 'Não foi possível criar o treinamento. ' + traduzirErro(e), false);
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------------- Excluir (só lançamento errado) ---------------- */

  async function excluir(t, botao) {
    const n = qtd(t);
    const ok = window.confirm(
      'Excluir o treinamento "' + t.tema + '" de ' + dataCompleta(t.data) + ' às ' + t.hora + '?\n\n' +
      (n ? 'A lista de ' + plural(n, 'participante', 'participantes') + ' dele também será apagada.\n' : '') +
      'Use a exclusão SÓ para corrigir lançamento feito errado.');
    if (!ok) return;
    botao.disabled = true;
    const { error } = await sb.from('treinamentos').delete().eq('id', t.id);
    if (error) {
      botao.disabled = false;
      mostrarMsg('crono-msg-lista', 'Não foi possível excluir "' + t.tema + '". ' + traduzirErro(error), false);
      return;
    }
    treinos = treinos.filter((x) => x.id !== t.id);
    delete participantes[t.id];
    if (est.aberto === t.id) fecharJanela();
    desenharTudo();
    mostrarMsg('crono-msg-lista', 'Treinamento "' + t.tema + '" excluído.', true);
  }

  /* ---------------- Janela do treinamento ---------------- */

  function abrirJanela(id) {
    est.aberto = id;
    const t = treinos.find((x) => x.id === id);
    $('crono-janela-busca').value = '';
    $('crono-janela-carga').value = t && t.carga ? cargaTexto(t.carga) : '';
    mostrarMsg('crono-janela-msg', '');
    $('crono-janela').hidden = false;
    document.body.classList.add('crono-travado');
    $('crono-pessoas').scrollTop = 0;
    desenharJanela();
    $('crono-janela-busca').focus();
  }

  function fecharJanela() {
    est.aberto = null;
    $('crono-janela').hidden = true;
    if (!est.cheia) document.body.classList.remove('crono-travado');
  }

  function desenharJanela() {
    const t = treinos.find((x) => x.id === est.aberto);
    if (!t) { fecharJanela(); return; }
    const s = participantes[t.id] || (participantes[t.id] = new Set());
    const sit = situacao(t);

    $('crono-janela-situacao').textContent = sit;
    $('crono-janela-tema').textContent = t.tema;
    $('crono-janela-quando').textContent = quando(t, true) + ' · carga ' + cargaTexto(t.carga);
    $('crono-janela-contagem').textContent = '· ' + s.size + ' selecionado(s)';

    // Status
    const chip = $('crono-janela-chip');
    chip.className = 'crono-chip' + classeSituacao(sit);
    chip.textContent = sit;
    const botao = $('crono-janela-status');
    const dica = $('crono-janela-status-dica');
    if (t.status === 'Realizado') {
      botao.textContent = 'Voltar para agendado';
      botao.className = 'botao botao-contorno';
      botao.disabled = false;
      dica.textContent = 'Use só se marcou como realizado por engano.';
    } else {
      botao.textContent = 'Marcar como realizado';
      botao.className = 'botao crono-botao-vermelho';
      if (!s.size) {
        botao.disabled = true;
        dica.textContent = 'Marque pelo menos 1 participante para poder marcar como realizado.';
      } else if (t.data > hojeK()) {
        botao.disabled = true;
        dica.textContent = 'Só dá para marcar como realizado no dia do treinamento ou depois.';
      } else {
        botao.disabled = false;
        dica.textContent = sit === 'Atrasado' ? 'A data já passou. Se o treinamento aconteceu, marque como realizado.' : '';
      }
    }

    const q = semAcento($('crono-janela-busca').value);
    // Só Ativos; um desligado que já participou continua aparecendo, marcado
    const pessoas = colaboradores
      .filter((c) => ehAtivo(c) || s.has(c.id))
      .filter((c) => !q || semAcento(c.nome).includes(q) || String(c.matricula).toLowerCase().includes(q));

    const caixa = $('crono-pessoas');
    const rolagem = caixa.scrollTop;
    caixa.textContent = '';

    if (!pessoas.length) {
      const v = document.createElement('div');
      v.className = 'crono-pessoas-vazio';
      v.textContent = colaboradores.some(ehAtivo)
        ? 'Nenhum colaborador encontrado.'
        : 'Nenhum colaborador Ativo cadastrado. Cadastre na aba Colaboradores.';
      caixa.appendChild(v);
      return;
    }

    pessoas.forEach((c) => {
      const marcado = s.has(c.id);
      const rot = document.createElement('label');
      rot.className = 'crono-pessoa' + (marcado ? ' marcado' : '');
      const cx = document.createElement('input');
      cx.type = 'checkbox';
      cx.checked = marcado;
      cx.addEventListener('change', () => alternar(t, c, cx));
      const nome = document.createElement('span');
      nome.textContent = c.nome + ' ';
      const info = document.createElement('small');
      info.textContent = '· ' + c.matricula + (ehAtivo(c) ? '' : ' · desligado');
      nome.appendChild(info);
      rot.appendChild(cx);
      rot.appendChild(nome);
      caixa.appendChild(rot);
    });
    caixa.scrollTop = rolagem;
  }

  function redesenharDepoisDeMudar() {
    desenharJanela();
    desenharCalendario();
    desenharPendentes();
    desenharTabela();
  }

  // Cada caixa marcada ou desmarcada é gravada na hora
  async function alternar(t, c, caixa) {
    const s = participantes[t.id] || (participantes[t.id] = new Set());
    const marcar = caixa.checked;

    // Treino realizado precisa de pelo menos 1 participante
    if (!marcar && t.status === 'Realizado' && s.size <= 1) {
      caixa.checked = true;
      mostrarMsg('crono-janela-msg', 'Um treinamento realizado precisa de pelo menos 1 participante. Para retirar todos, clique antes em "Voltar para agendado".', false);
      return;
    }

    caixa.disabled = true;
    const { error } = marcar
      ? await sb.from('treinamento_participantes').insert({ treinamento_id: t.id, colaborador_id: c.id })
      : await sb.from('treinamento_participantes').delete().eq('treinamento_id', t.id).eq('colaborador_id', c.id);

    // 23505 = já estava marcado (por exemplo, em outra aba do navegador)
    if (error && !(marcar && error.code === '23505')) {
      caixa.checked = !marcar;
      caixa.disabled = false;
      mostrarMsg('crono-janela-msg', 'Não foi possível ' + (marcar ? 'incluir ' : 'retirar ') + c.nome + '. ' + traduzirErro(error), false);
      return;
    }
    if (marcar) s.add(c.id); else s.delete(c.id);
    mostrarMsg('crono-janela-msg', '');
    redesenharDepoisDeMudar();
  }

  async function salvarCarga() {
    const t = treinos.find((x) => x.id === est.aberto);
    if (!t) return;
    const carga = lerCarga($('crono-janela-carga').value);
    if (!carga) {
      mostrarMsg('crono-janela-msg', 'Escreva a carga horária como horas:minutos, ex.: 00:10 ou 01:30.', false);
      return;
    }
    const botao = $('crono-janela-salvar-carga');
    botao.disabled = true;
    const { error } = await sb.from('treinamentos').update({ carga_minutos: carga }).eq('id', t.id);
    botao.disabled = false;
    if (error) {
      mostrarMsg('crono-janela-msg', 'Não foi possível salvar a carga horária. ' + traduzirErro(error), false);
      return;
    }
    t.carga = carga;
    $('crono-janela-carga').value = cargaTexto(carga);
    redesenharDepoisDeMudar();
    mostrarMsg('crono-janela-msg', 'Carga horária salva: ' + cargaTexto(carga) + '.', true);
  }

  async function mudarStatus() {
    const t = treinos.find((x) => x.id === est.aberto);
    if (!t) return;
    const novo = t.status === 'Realizado' ? 'Agendado' : 'Realizado';
    if (novo === 'Realizado' && (!qtd(t) || t.data > hojeK())) return;
    const botao = $('crono-janela-status');
    botao.disabled = true;
    const { error } = await sb.from('treinamentos').update({ status: novo }).eq('id', t.id);
    if (error) {
      botao.disabled = false;
      mostrarMsg('crono-janela-msg', 'Não foi possível mudar o status. ' + traduzirErro(error), false);
      return;
    }
    t.status = novo;
    redesenharDepoisDeMudar();
    mostrarMsg('crono-janela-msg', novo === 'Realizado'
      ? 'Treinamento marcado como realizado. Ele passa a contar no Painel e na aba Colaboradores.'
      : 'Treinamento voltou para agendado.', true);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    colaboradores = []; treinos = []; participantes = {};
    carregadoPara = null;
    est.ano = null; est.mes = null; est.formAberto = true;
    fecharJanela();
    if (est.cheia) sairTelaCheia();
    $('crono-tema').value = '';
    $('crono-data').value = hojeK();
    $('crono-hora').value = HORA_PADRAO;
    $('crono-carga').value = '';
    ['crono-msg-geral', 'crono-msg-form', 'crono-msg-lista', 'crono-janela-msg'].forEach((id) => mostrarMsg(id, ''));
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('crono-data').value = hojeK();
  $('crono-hora').value = HORA_PADRAO;

  $('crono-alternar').addEventListener('click', () => {
    est.formAberto = !est.formAberto;
    mostrarMsg('crono-msg-form', '');
    desenharForm();
    desenharCalendario();
    if (est.formAberto) $('crono-tema').focus();
  });
  $('crono-form-novo').addEventListener('submit', adicionar);
  $('crono-data').addEventListener('change', desenharCalendario);
  $('crono-anterior').addEventListener('click', () => mudarMes(-1));
  $('crono-proximo').addEventListener('click', () => mudarMes(1));

  // Carga horária: os dois-pontos entram sozinhos enquanto digita
  ['crono-carga', 'crono-janela-carga'].forEach((id) => {
    $(id).addEventListener('input', (ev) => { ev.target.value = mascaraCarga(ev.target.value); });
  });
  $('crono-janela-carga').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); salvarCarga(); } });

  // Calendário: tela cheia e PDF
  $('crono-tela-cheia').addEventListener('click', () => { if (est.cheia) sairTelaCheia(); else entrarTelaCheia(); });
  $('crono-exportar').addEventListener('click', exportarPdf);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && est.cheia) sairTelaCheia(); });

  // Janela do treinamento
  $('crono-janela-busca').addEventListener('input', () => { $('crono-pessoas').scrollTop = 0; desenharJanela(); });
  $('crono-janela-salvar-carga').addEventListener('click', salvarCarga);
  $('crono-janela-status').addEventListener('click', mudarStatus);
  $('crono-janela-x').addEventListener('click', fecharJanela);
  $('crono-janela-concluir').addEventListener('click', fecharJanela);
  $('crono-janela').addEventListener('click', (ev) => { if (ev.target === $('crono-janela')) fecharJanela(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (est.aberto != null) fecharJanela();
    else if (est.cheia) sairTelaCheia();
  });

  // Ao abrir a aba, busca os dados mais novos (ex.: colaborador desligado agora)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'cronograma' && carregadoPara) carregar(carregadoPara);
    else if (est.cheia) sairTelaCheia();
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
