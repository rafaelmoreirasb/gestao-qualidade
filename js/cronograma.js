/* ==========================================================
   js/cronograma.js
   Aba Cronograma: criar treinamento (só Tema, Data e Horário),
   calendário do mês, próximos treinamentos, tabela com todos
   e janela para escolher os participantes (só Ativos).
   Tabelas: treinamentos e treinamento_participantes.
   Todo treinamento aparece no mapa de calor do Painel.
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const HORA_PADRAO = '08:00';

  let colaboradores = [];   // todos (Ativos e Desligados), em ordem de nome
  let treinos = [];         // { id, data: 'AAAA-MM-DD', hora: 'HH:MM', tema }
  let participantes = {};   // id do treinamento -> Set com ids de colaboradores
  let carregadoPara = null;
  let carregando = false;

  const est = { ano: null, mes: null, aberto: null, formAberto: true };

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

  function situacao(t) {
    const h = hojeK();
    if (t.data < h) return 'Realizado';
    if (t.data === h) return 'Hoje';
    return 'Agendado';
  }

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
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Cronograma ainda não existem no banco. Rode o arquivo sql/003_cronograma.sql no Supabase (SQL Editor).';
    }
    if (code === '23503') return 'Esse treinamento ou colaborador não existe mais. Recarregue a página.';
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se o arquivo sql/003_cronograma.sql foi rodado inteiro.';
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
          .select('id, data, hora, tema')
          .order('data', { ascending: true })
          .order('hora', { ascending: true })
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('treinamento_participantes')
          .select('treinamento_id, colaborador_id')
          .order('id', { ascending: true }))
      ]);
      colaboradores = cols;
      treinos = tres.map((t) => ({ id: t.id, data: t.data, hora: horaCurta(t.hora), tema: t.tema }));
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
    desenharProximos();
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
    const escolhida = est.formAberto ? $('crono-data').value : '';

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
      if (d.getMonth() !== est.mes) b.classList.add('fora');
      if (k === escolhida) b.classList.add('selecionado');
      if (k === hoje) b.classList.add('hoje');

      const num = document.createElement('span');
      num.className = 'crono-dia-num';
      num.textContent = String(d.getDate());
      b.appendChild(num);

      evs.slice(0, 2).forEach((t) => {
        const e = document.createElement('span');
        e.className = 'crono-evento' + (t.data < hoje ? ' realizado' : '');
        e.textContent = t.hora + ' ' + t.tema;
        b.appendChild(e);
      });
      if (evs.length > 2) {
        const mais = document.createElement('span');
        mais.className = 'crono-mais';
        mais.textContent = '+' + (evs.length - 2) + ' treinamento(s)';
        b.appendChild(mais);
      }

      b.title = evs.length
        ? evs.map((t) => t.hora + ' ' + t.tema + ' (' + (qtd(t) ? plural(qtd(t), 'pessoa', 'pessoas') : 'sem participantes') + ')').join('\n')
        : dataCompleta(k);
      b.addEventListener('click', () => {
        if (evs.length) abrirJanela(evs[0].id);
        else escolherData(k);
      });
      grade.appendChild(b);
    }
  }

  function escolherData(k) {
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

  /* --------- Próximos treinamentos --------- */

  function desenharProximos() {
    const caixa = $('crono-proximos-lista');
    caixa.textContent = '';
    const hoje = hojeK();
    const prox = ordenados().filter((t) => t.data >= hoje).slice(0, 5);

    if (!prox.length) {
      const v = document.createElement('div');
      v.className = 'crono-proximo-vazio';
      v.textContent = 'Nenhum treinamento agendado.';
      caixa.appendChild(v);
      return;
    }

    prox.forEach((t) => {
      const n = qtd(t);
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

      const cont = document.createElement('span');
      cont.className = 'crono-proximo-qtd' + (n ? '' : ' sem');
      cont.textContent = n ? plural(n, 'participante', 'participantes') : 'Sem participantes · clique para adicionar';
      b.appendChild(cont);

      if (n) {
        const nomes = document.createElement('span');
        nomes.className = 'crono-proximo-nomes';
        nomes.textContent = nomesDe(t);
        b.appendChild(nomes);
      }

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

  function desenharTabela() {
    const lista = ordenados().reverse(); // mais recentes primeiro
    $('crono-total').textContent = '· ' + lista.length;

    const caixa = $('crono-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();

    lista.forEach((t) => {
      const sit = situacao(t);
      const n = qtd(t);
      const linha = document.createElement('div');
      linha.className = 'planilha-linha';

      linha.appendChild(celula('numero', dataCompleta(t.data)));
      linha.appendChild(celula('numero', t.hora));
      linha.appendChild(celula('crono-col-tema', t.tema));
      linha.appendChild(celula('crono-col-pessoas' + (n ? '' : ' sem'), n ? nomesDe(t) : 'Nenhum participante ainda'));

      const cs = celula('');
      const chip = document.createElement('span');
      chip.className = 'crono-chip' + (sit === 'Realizado' ? ' realizado' : '');
      chip.textContent = sit;
      cs.appendChild(chip);
      linha.appendChild(cs);

      const ca = celula('crono-col-acoes');
      const bp = document.createElement('button');
      bp.type = 'button';
      bp.className = 'crono-botao-part';
      bp.textContent = 'Participantes';
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
    const falta = [];
    if (!tema) falta.push('tema');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) falta.push('data');
    if (falta.length) { mostrarMsg('crono-msg-form', 'Preencha: ' + falta.join(', ') + '.', false); return; }

    const botao = $('crono-adicionar');
    botao.disabled = true;
    try {
      const { data: novo, error } = await sb.from('treinamentos')
        .insert({ data, hora, tema })
        .select('id, data, hora, tema')
        .single();
      if (error) throw error;
      treinos.push({ id: novo.id, data: novo.data, hora: horaCurta(novo.hora), tema: novo.tema });
      participantes[novo.id] = new Set();

      // Mostra o mês do treinamento criado
      const [a, m] = novo.data.split('-').map(Number);
      est.ano = a;
      est.mes = m - 1;
      $('crono-tema').value = '';
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

  /* ---------------- Janela de participantes ---------------- */

  function abrirJanela(id) {
    est.aberto = id;
    $('crono-janela-busca').value = '';
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
    document.body.classList.remove('crono-travado');
  }

  function desenharJanela() {
    const t = treinos.find((x) => x.id === est.aberto);
    if (!t) { fecharJanela(); return; }
    const s = participantes[t.id] || (participantes[t.id] = new Set());

    $('crono-janela-situacao').textContent = situacao(t);
    $('crono-janela-tema').textContent = t.tema;
    $('crono-janela-quando').textContent = quando(t, true);
    $('crono-janela-contagem').textContent = '· ' + s.size + ' selecionado(s)';

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

  // Cada caixa marcada ou desmarcada é gravada na hora
  async function alternar(t, c, caixa) {
    const s = participantes[t.id] || (participantes[t.id] = new Set());
    const marcar = caixa.checked;
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
    desenharJanela();
    desenharCalendario();
    desenharProximos();
    desenharTabela();
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    colaboradores = []; treinos = []; participantes = {};
    carregadoPara = null;
    est.ano = null; est.mes = null; est.formAberto = true;
    fecharJanela();
    $('crono-tema').value = '';
    $('crono-data').value = hojeK();
    $('crono-hora').value = HORA_PADRAO;
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

  $('crono-janela-busca').addEventListener('input', () => { $('crono-pessoas').scrollTop = 0; desenharJanela(); });
  $('crono-janela-x').addEventListener('click', fecharJanela);
  $('crono-janela-concluir').addEventListener('click', fecharJanela);
  $('crono-janela').addEventListener('click', (ev) => { if (ev.target === $('crono-janela')) fecharJanela(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && est.aberto != null) fecharJanela(); });

  // Ao abrir a aba, busca os dados mais novos (ex.: colaborador desligado agora)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'cronograma' && carregadoPara) carregar(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
