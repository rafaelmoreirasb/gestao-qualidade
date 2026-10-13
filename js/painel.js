/* ==========================================================
   js/painel.js
   Aba Painel (Visão Geral): filtro por processo do Gemba,
   4 indicadores, mapa de calor do ano e mapa por colaborador.
   Só LÊ o banco (registros_gemba, colaboradores, listas,
   treinamentos e treinamento_participantes).
   O filtro de processo vale só para os desvios: os treinamentos
   aparecem sempre (eles não têm processo).
   ========================================================== */

(function () {
  /* ---- Data em que a contagem começa (ano, mês, dia) ----
     Para mudar, troque só esta linha. Atenção: o mês do
     JavaScript começa em 0 (janeiro = 0, outubro = 9). */
  const INICIO = new Date(2026, 9, 13);

  const $ = (id) => document.getElementById(id);
  const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Cores do mapa: vermelho pelos desvios (mais escuro = mais desvios),
  // amarelo pelo treinamento. Dia com os dois = quadradinho dividido na diagonal.
  const PALETA_DEV = ['#F9DADB', '#F0A8AC', '#E56971', '#D40511', '#A0040D'];
  const COR_TREINO = '#FFCC00';
  const COR_SEM_REGISTRO = '#E6E6E6';

  let registros = [];        // desvios do Gemba desde INICIO
  let colaboradores = [];    // todos (Ativos e Desligados)
  let processosLista = [];   // LISTA_PROCESSOS
  let treinos = [];          // treinamentos do Cronograma desde INICIO: { id, data, hora, tema, pessoas: [ids] }
  let carregadoPara = null;
  let carregando = false;

  const est = { setor: '', ano: null, dia: null, pessoa: null, diaPessoa: null };
  const rolado = {};         // mapa já rolado até hoje (por ano)

  /* ---------------- Ajudantes de data ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const chaveDia = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const semHora = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hojeSemHora = () => semHora(new Date());
  const dataLonga = (d) => SEMANA[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  const dataCurta = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  const horaDe = (iso) => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const horaCurta = (h) => String(h || '').slice(0, 5) || '08:00';

  function diaDe(iso) { return chaveDia(new Date(iso)); }

  function situacaoDia(d) {
    if (d < INICIO) return 'antes';
    if (d > hojeSemHora()) return 'futuro';
    return 'ativo';
  }

  // Treinamento já aconteceu (ou é hoje)?
  const treinoRealizado = (t) => semHora(new Date(t.data)) <= hojeSemHora();

  // Texto de um treinamento no resumo e nas dicas
  function textoTreino(t) {
    const n = t.pessoas.length;
    return t.hora + ' · Treinamento — ' + t.tema + ' (' + (n ? plural(n, 'participante', 'participantes') : 'sem participantes') + ')';
  }

  /* ---------------- Mensagens ---------------- */

  function mostrarMsg(texto) {
    const caixa = $('painel-msg');
    caixa.textContent = texto || '';
    caixa.className = 'mensagem mensagem-erro';
    caixa.hidden = !texto;
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'Faltam tabelas no banco. Confira se os arquivos sql/001, sql/002 e sql/003 foram rodados no Supabase.';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão.';
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
    mostrarMsg('');
    try {
      const [regs, cols, listas, tres] = await Promise.all([
        lerTudo(() => sb.from('registros_gemba')
          .select('id, data, colaborador_id, processo, motivo, acao')
          .gte('data', INICIO.toISOString())
          .order('data', { ascending: true })
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('colaboradores')
          .select('id, matricula, nome, setor, status')
          .order('nome', { ascending: true })
          .order('id', { ascending: true })),
        carregarListas(),
        lerTudo(() => sb.from('treinamentos')
          .select('id, data, hora, tema, treinamento_participantes(colaborador_id)')
          .gte('data', chaveDia(INICIO))
          .order('data', { ascending: true })
          .order('hora', { ascending: true })
          .order('id', { ascending: true }))
      ]);
      registros = regs;
      colaboradores = cols;
      processosLista = listas[LISTA_PROCESSOS] || [];
      // A data do treino vira "AAAA-MM-DDTHH:MM:00" (hora local), para cair no dia certo do mapa
      treinos = tres.map((t) => {
        const hora = horaCurta(t.hora);
        return {
          id: t.id,
          data: t.data + 'T' + hora + ':00',
          hora,
          tema: t.tema,
          pessoas: (t.treinamento_participantes || []).map((p) => p.colaborador_id)
        };
      });
      carregadoPara = uid;
      desenharTudo();
    } catch (e) {
      carregadoPara = null;
      registros = []; colaboradores = []; processosLista = []; treinos = [];
      desenharTudo();
      mostrarMsg('Não foi possível carregar o Painel. ' + traduzirErro(e));
    } finally {
      carregando = false;
    }
  }

  /* ---------------- Dados filtrados ---------------- */

  const colabPorId = () => {
    const m = {};
    colaboradores.forEach((c) => { m[c.id] = c; });
    return m;
  };

  function anoAtual() {
    const anos = anosDisponiveis();
    if (est.ano == null || !anos.includes(est.ano)) est.ano = anos[anos.length - 1];
    return est.ano;
  }

  function anosDisponiveis() {
    const anos = [];
    const ultimo = Math.max(hojeSemHora().getFullYear(), INICIO.getFullYear());
    for (let a = INICIO.getFullYear(); a <= ultimo; a++) anos.push(a);
    return anos;
  }

  // Desvios do ano escolhido, já com o filtro de processo
  function registrosFiltrados() {
    const ano = anoAtual();
    return registros.filter((r) => {
      if (est.setor && r.processo !== est.setor) return false;
      return new Date(r.data).getFullYear() === ano;
    });
  }

  // Treinamentos do ano escolhido (o filtro de processo não vale para eles)
  function treinosDoAno() {
    const ano = anoAtual();
    return treinos.filter((t) => new Date(t.data).getFullYear() === ano);
  }

  function agruparPorDia(lista) {
    const m = {};
    lista.forEach((r) => { (m[diaDe(r.data)] = m[diaDe(r.data)] || []).push(r); });
    return m;
  }

  /* ---------------- Desenhar ---------------- */

  function desenharTudo() {
    desenharFiltro();
    desenharAnos();
    const lista = registrosFiltrados();
    desenharKpis(lista);
    desenharMapaGeral(lista);
    desenharPessoa(lista);
  }

  function desenharFiltro() {
    const s = $('painel-setor');
    const nomes = processosLista.slice();
    registros.forEach((r) => { if (!nomes.includes(r.processo)) nomes.push(r.processo); });
    if (est.setor && !nomes.includes(est.setor)) est.setor = '';
    s.textContent = '';
    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = 'Todos os setores';
    s.appendChild(todos);
    nomes.forEach((p) => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      s.appendChild(o);
    });
    s.value = est.setor;
  }

  function desenharAnos() {
    const anos = anosDisponiveis();
    const ano = anoAtual();
    const s = $('painel-ano');
    s.textContent = '';
    anos.forEach((a) => {
      const o = document.createElement('option');
      o.value = String(a);
      o.textContent = String(a);
      s.appendChild(o);
    });
    s.value = String(ano);
    s.hidden = anos.length < 2;
    $('painel-ano-titulo').textContent = String(ano);
  }

  function kpi(rotulo, valor, sub, cor, pequeno) {
    const c = document.createElement('div');
    c.className = 'kpi';
    const r = document.createElement('div');
    r.className = 'kpi-rotulo';
    r.textContent = rotulo;
    const v = document.createElement('div');
    v.className = 'kpi-valor' + (pequeno ? ' kpi-valor-texto' : '');
    v.style.color = cor;
    v.textContent = valor;
    c.appendChild(r);
    c.appendChild(v);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'kpi-sub';
      s.textContent = sub;
      c.appendChild(s);
    }
    return c;
  }

  function desenharKpis(lista) {
    const ano = anoAtual();
    const desde = ano === INICIO.getFullYear() ? 'desde ' + dataCurta(INICIO) : '';
    const porProc = {};
    lista.forEach((r) => { porProc[r.processo] = (porProc[r.processo] || 0) + 1; });
    let topo = null;
    Object.keys(porProc).forEach((p) => { if (!topo || porProc[p] > porProc[topo]) topo = p; });

    // Treinamentos: conta cada treinamento realizado (até hoje), não cada participante
    const doAno = treinosDoAno();
    const realizados = doAno.filter(treinoRealizado).length;
    const agendados = doAno.length - realizados;
    const subTreino = [desde, agendados ? plural(agendados, 'agendado', 'agendados') : ''].filter(Boolean).join(' · ');

    const caixa = $('painel-kpis');
    caixa.textContent = '';
    const registrosAno = lista.length + realizados;
    caixa.appendChild(kpi('Registros em ' + ano, String(registrosAno), desde, '#D40511'));
    caixa.appendChild(kpi('Desvios em ' + ano, String(lista.length), desde, '#D40511'));
    caixa.appendChild(kpi('Treinamentos em ' + ano, String(realizados), subTreino, '#1A1A1A'));
    caixa.appendChild(topo
      ? kpi('Processo com mais desvios', topo, plural(porProc[topo], 'desvio', 'desvios'), '#1A1A1A', true)
      : kpi('Processo com mais desvios', '—', 'nenhum desvio ainda', '#1A1A1A', true));
  }

  /* --------- Mapa de calor (usado no geral e no colaborador) --------- */

  // Monta a grade do ano: uma coluna por semana (domingo a sábado)
  function montarMapa(caixa, ano, celula, chaveSel, aoEscolher) {
    const rolagemAntes = caixa.scrollLeft;
    caixa.textContent = '';
    const grade = document.createElement('div');
    grade.className = 'mapa-grade';

    const rotulos = document.createElement('div');
    rotulos.className = 'mapa-dias';
    DIAS_CURTOS.forEach((t) => {
      const d = document.createElement('div');
      d.textContent = t;
      rotulos.appendChild(d);
    });
    grade.appendChild(rotulos);

    const semanas = document.createElement('div');
    semanas.className = 'mapa-semanas';
    const d = new Date(ano, 0, 1);
    d.setDate(d.getDate() - d.getDay());
    const fim = new Date(ano, 11, 31);
    let colunaHoje = -1;
    let col = 0;
    const hojeK = chaveDia(hojeSemHora());

    while (d <= fim) {
      const sem = document.createElement('div');
      sem.className = 'mapa-semana';
      const mes = document.createElement('div');
      mes.className = 'mapa-mes';
      sem.appendChild(mes);
      for (let i = 0; i < 7; i++) {
        const dia = new Date(d);
        const cel = document.createElement('div');
        cel.className = 'mapa-celula';
        if (dia.getFullYear() !== ano) {
          cel.classList.add('fora');
        } else {
          if (dia.getDate() === 1) mes.textContent = MESES[dia.getMonth()];
          const k = chaveDia(dia);
          if (k === hojeK) colunaHoje = col;
          const info = celula(dia, k);
          cel.dataset.k = k;
          cel.title = info.dica;
          cel.style.background = info.bg;
          cel.style.border = info.borda;
          if (k === chaveSel) cel.classList.add('selecionada');
        }
        sem.appendChild(cel);
        d.setDate(d.getDate() + 1);
      }
      semanas.appendChild(sem);
      col++;
    }
    grade.appendChild(semanas);
    caixa.appendChild(grade);

    // Passar o mouse (computador) ou tocar (celular) mostra o resumo do dia
    const escolher = (ev) => {
      const k = ev.target && ev.target.dataset ? ev.target.dataset.k : null;
      if (!k) return;
      caixa.querySelectorAll('.mapa-celula.selecionada').forEach((c) => c.classList.remove('selecionada'));
      ev.target.classList.add('selecionada');
      aoEscolher(k);
    };
    semanas.addEventListener('mouseover', escolher);
    semanas.addEventListener('click', escolher);

    // Na primeira vez (com a aba visível), rola o mapa até a semana de hoje.
    // Nas outras vezes, mantém a posição em que você deixou.
    const chaveRolar = caixa.id + ano;
    if (colunaHoje >= 0 && !rolado[chaveRolar] && caixa.clientWidth > 0) {
      rolado[chaveRolar] = true;
      caixa.scrollLeft = Math.max(0, 40 + colunaHoje * 22 - caixa.clientWidth + 120);
    } else {
      caixa.scrollLeft = rolagemAntes;
    }
  }

  function nivel(v) {
    if (v <= 0) return -1;
    return Math.min(v, 5) - 1;
  }

  function estiloTracejado() {
    return { bg: '#FFFFFF', borda: '1px dashed #CCCCCC' };
  }

  // Treinamento agendado num dia futuro: contorno amarelo
  function estiloAgendado() {
    return { bg: '#FFFFFF', borda: '2px solid ' + COR_TREINO };
  }

  // Cor de um dia com desvios e/ou treinamentos (um mapa só)
  function corDoDia(corDesvio, nTreinos) {
    if (corDesvio && nTreinos) {
      return { bg: 'linear-gradient(135deg, ' + corDesvio + ' 50%, ' + COR_TREINO + ' 50%)', borda: '1px solid transparent' };
    }
    if (corDesvio) return { bg: corDesvio, borda: '1px solid ' + corDesvio };
    if (nTreinos) return { bg: COR_TREINO, borda: '1px solid ' + COR_TREINO };
    return { bg: COR_SEM_REGISTRO, borda: '1px solid ' + COR_SEM_REGISTRO };
  }

  function dicaForaDaContagem(dia, sit) {
    return dataCurta(dia) + (sit === 'antes' ? ' · antes do início da contagem' : ' · dia futuro');
  }

  /* ---------------- Mapa geral ---------------- */

  function desenharMapaGeral(lista) {
    const ano = anoAtual();
    const porDia = agruparPorDia(lista);
    const treinosPorDia = agruparPorDia(treinosDoAno());
    const nomes = colabPorId();

    const leg = $('painel-legenda-cores');
    leg.textContent = '';
    PALETA_DEV.forEach((c) => {
      const q = document.createElement('div');
      q.className = 'legenda-quadro';
      q.style.background = c;
      leg.appendChild(q);
    });

    // Dia escolhido: começa em hoje (se for do ano mostrado)
    if (!est.dia || Number(est.dia.slice(0, 4)) !== ano) {
      const h = hojeSemHora();
      est.dia = h.getFullYear() === ano ? chaveDia(h) : null;
    }

    montarMapa($('painel-mapa'), ano, (dia, k) => {
      const sit = situacaoDia(dia);
      const tre = treinosPorDia[k] || [];
      if (sit === 'futuro' && tre.length) {
        return Object.assign(estiloAgendado(), { dica: dataCurta(dia) + ' · ' + plural(tre.length, 'treinamento agendado', 'treinamentos agendados') + '\n\n' + tre.map((t) => '• ' + textoTreino(t)).join('\n') });
      }
      if (sit !== 'ativo') return Object.assign(estiloTracejado(), { dica: dicaForaDaContagem(dia, sit) });
      const itens = porDia[k] || [];
      const lv = nivel(itens.length);
      const estilo = corDoDia(lv < 0 ? null : PALETA_DEV[lv], tre.length);
      let dica = dataLonga(dia) + '\n' + plural(itens.length, 'desvio', 'desvios') + ' · ' + plural(tre.length, 'treinamento', 'treinamentos');
      const linhas = itens.map((r) => '• ' + ((nomes[r.colaborador_id] || {}).nome || 'Colaborador') + ' — ' + r.processo)
        .concat(tre.map((t) => '• ' + textoTreino(t)));
      if (linhas.length) dica += '\n\n' + linhas.join('\n');
      return Object.assign(estilo, { dica });
    }, est.dia, (k) => { est.dia = k; desenharResumoGeral(porDia, treinosPorDia, nomes); });

    desenharResumoGeral(porDia, treinosPorDia, nomes);
  }

  function dataDaChave(k) {
    const [a, m, d] = k.split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  function linhaResumo(caixa, texto, classe) {
    const l = document.createElement('div');
    if (classe) l.className = classe;
    l.textContent = texto;
    caixa.appendChild(l);
  }

  function listaResumo(caixa, textos) {
    const ul = document.createElement('ul');
    ul.className = 'mapa-resumo-lista';
    textos.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    caixa.appendChild(ul);
  }

  function desenharResumoGeral(porDia, treinosPorDia, nomes) {
    const caixa = $('painel-dia');
    caixa.textContent = '';
    if (!est.dia) {
      linhaResumo(caixa, 'Passe o mouse ou toque num dia para ver o resumo.', 'mapa-resumo-vazio');
      return;
    }
    const dia = dataDaChave(est.dia);
    const sit = situacaoDia(dia);
    const tre = treinosPorDia[est.dia] || [];
    linhaResumo(caixa, dataLonga(dia), 'mapa-resumo-titulo');
    if (sit === 'antes') {
      linhaResumo(caixa, 'Antes do início da contagem (' + dataCurta(INICIO) + ').', 'mapa-resumo-vazio');
      return;
    }
    if (sit === 'futuro') {
      if (!tre.length) { linhaResumo(caixa, 'Dia futuro.', 'mapa-resumo-vazio'); return; }
      linhaResumo(caixa, plural(tre.length, 'treinamento agendado', 'treinamentos agendados'), 'mapa-resumo-contagem');
      listaResumo(caixa, tre.map(textoTreino));
      return;
    }
    const itens = porDia[est.dia] || [];
    linhaResumo(caixa, plural(itens.length, 'desvio', 'desvios') + ' · ' + plural(tre.length, 'treinamento', 'treinamentos') + (est.setor ? ' · ' + est.setor : ''), 'mapa-resumo-contagem');
    if (!itens.length && !tre.length) {
      linhaResumo(caixa, 'Nenhum desvio nem treinamento registrado neste dia.', 'mapa-resumo-vazio');
      return;
    }
    const textos = itens.map((r) => {
      const c = nomes[r.colaborador_id] || {};
      return horaDe(r.data) + ' · ' + (c.nome || 'Colaborador') + ' — ' + r.processo + ': ' + r.motivo;
    }).concat(tre.map(textoTreino));
    listaResumo(caixa, textos);
  }

  /* ---------------- Mapa por colaborador ---------------- */

  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '—';
    const a = p[0][0];
    const b = p.length > 1 ? p[p.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  function desenharPessoa(lista) {
    const s = $('painel-pessoa');
    const ordenados = colaboradores.filter((c) => c.status === 'Ativo')
      .concat(colaboradores.filter((c) => c.status !== 'Ativo'));
    s.textContent = '';
    if (!ordenados.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'Nenhum colaborador cadastrado';
      s.appendChild(o);
      s.disabled = true;
    } else {
      s.disabled = false;
      ordenados.forEach((c) => {
        const o = document.createElement('option');
        o.value = String(c.id);
        o.textContent = c.nome + ' · ' + c.matricula + (c.status === 'Ativo' ? '' : ' (desligado)');
        s.appendChild(o);
      });
    }
    if (!ordenados.some((c) => c.id === est.pessoa)) est.pessoa = ordenados.length ? ordenados[0].id : null;
    s.value = est.pessoa == null ? '' : String(est.pessoa);

    const p = ordenados.find((c) => c.id === est.pessoa) || null;
    const meus = p ? lista.filter((r) => r.colaborador_id === p.id) : [];
    const porDia = agruparPorDia(meus);
    // Treinamentos de que a pessoa participou
    const meusTreinos = p ? treinosDoAno().filter((t) => t.pessoas.includes(p.id)) : [];
    const treinosPessoaPorDia = agruparPorDia(meusTreinos);

    // Ficha
    $('painel-ficha-ini').textContent = p ? iniciais(p.nome) : '—';
    $('painel-ficha-nome').textContent = p ? p.nome : '—';
    $('painel-ficha-info').textContent = p
      ? 'Matrícula ' + p.matricula + ' · ' + (p.setor || 'Sem setor') + (p.status === 'Ativo' ? '' : ' · Desligado')
      : '';
    $('painel-ficha-dev').textContent = String(meus.length);
    $('painel-ficha-tre').textContent = String(meusTreinos.filter(treinoRealizado).length);
    const cont = {};
    meus.forEach((r) => { const k = r.processo + ' — ' + r.motivo; cont[k] = (cont[k] || 0) + 1; });
    let top = null;
    Object.keys(cont).forEach((k) => { if (!top || cont[k] > cont[top]) top = k; });
    $('painel-ficha-top').textContent = top ? top + ' (' + cont[top] + '×)' : 'Nenhum desvio';

    // Mapa da pessoa
    const ano = anoAtual();
    if (!est.diaPessoa || Number(est.diaPessoa.slice(0, 4)) !== ano) est.diaPessoa = null;
    montarMapa($('painel-pessoa-mapa'), ano, (dia, k) => {
      const sit = situacaoDia(dia);
      const tre = treinosPessoaPorDia[k] || [];
      if (sit === 'futuro' && tre.length) return Object.assign(estiloAgendado(), { dica: dataCurta(dia) + ' · treinamento agendado\n' + tre.map((t) => '• ' + t.hora + ' — ' + t.tema).join('\n') });
      if (sit !== 'ativo') return Object.assign(estiloTracejado(), { dica: dicaForaDaContagem(dia, sit) });
      const itens = porDia[k] || [];
      if (!itens.length && !tre.length) return Object.assign(corDoDia(null, 0), { dica: dataCurta(dia) + ' · sem registro' });
      const corDesvio = itens.length ? (itens.length > 1 ? '#A0040D' : '#D40511') : null;
      const linhas = itens.map((r) => '• Desvio — ' + r.processo + ': ' + r.motivo)
        .concat(tre.map((t) => '• Treinamento — ' + t.hora + ' ' + t.tema));
      return Object.assign(corDoDia(corDesvio, tre.length), { dica: dataLonga(dia) + '\n' + linhas.join('\n') });
    }, est.diaPessoa, (k) => { est.diaPessoa = k; desenharResumoPessoa(porDia, treinosPessoaPorDia); });

    desenharResumoPessoa(porDia, treinosPessoaPorDia);
  }

  function desenharResumoPessoa(porDia, treinosPessoaPorDia) {
    const caixa = $('painel-pessoa-dia');
    caixa.textContent = '';
    if (!est.diaPessoa) {
      linhaResumo(caixa, 'Passe o mouse ou toque num dia para ver o que foi registrado.', 'mapa-resumo-vazio');
      return;
    }
    const dia = dataDaChave(est.diaPessoa);
    const sit = situacaoDia(dia);
    const tre = treinosPessoaPorDia[est.diaPessoa] || [];
    linhaResumo(caixa, dataLonga(dia), 'mapa-resumo-titulo');
    if (sit === 'antes') {
      linhaResumo(caixa, 'Antes do início da contagem (' + dataCurta(INICIO) + ').', 'mapa-resumo-vazio');
      return;
    }
    if (sit === 'futuro') {
      if (!tre.length) { linhaResumo(caixa, 'Dia futuro.', 'mapa-resumo-vazio'); return; }
      listaResumo(caixa, tre.map((t) => t.hora + ' · Treinamento agendado — ' + t.tema));
      return;
    }
    const itens = porDia[est.diaPessoa] || [];
    if (!itens.length && !tre.length) {
      linhaResumo(caixa, 'Sem registro neste dia.', 'mapa-resumo-vazio');
      return;
    }
    const textos = itens.map((r) => horaDe(r.data) + ' · ' + r.processo + ': ' + r.motivo + ' · Ação: ' + r.acao)
      .concat(tre.map((t) => t.hora + ' · Treinamento — ' + t.tema));
    listaResumo(caixa, textos);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    registros = []; colaboradores = []; processosLista = []; treinos = [];
    carregadoPara = null;
    est.setor = ''; est.ano = null; est.dia = null; est.pessoa = null; est.diaPessoa = null;
    Object.keys(rolado).forEach((k) => delete rolado[k]);
    mostrarMsg('');
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('painel-setor').addEventListener('change', (ev) => { est.setor = ev.target.value; desenharTudo(); });
  $('painel-ano').addEventListener('change', (ev) => { est.ano = Number(ev.target.value); desenharTudo(); });
  $('painel-pessoa').addEventListener('change', (ev) => {
    est.pessoa = Number(ev.target.value);
    est.diaPessoa = null;
    desenharPessoa(registrosFiltrados());
  });

  // Ao abrir a aba, busca os dados mais novos (ex.: registro feito agora no Gemba
  // ou treinamento criado agora no Cronograma)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'painel' && carregadoPara) carregar(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
