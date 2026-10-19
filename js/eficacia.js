/* ==========================================================
   js/eficacia.js
   Aba Eficácia do Treinamento.
   Só LÊ o banco. Não grava nada.

   Regras (decididas na Fase 7):
   - Gemba: cada desvio registrado é um treino a acompanhar
     (a ação tomada no Gemba é a intervenção). O acompanhamento
     começa no dia do registro.
   - Poka-Yoke: cada marcação "treinado hoje" é um treino. O erro
     treinado são os tipos que estavam pendentes naquele dia.
   - Reincidência = repetir o MESMO erro (Gemba: mesmo processo e
     motivo; Poka-Yoke: mesmo tipo que estava pendente) em até 30
     dias depois do treino. Erro no mesmo dia do treino não conta.
   - Passou dos 30 dias sem repetir = Eficaz. Antes disso = Em
     acompanhamento. Percentual = eficazes ÷ (eficazes + reincidiram).
   - Torre de Aduana: pausada (ainda sem dados).
   Tabelas lidas: registros_gemba, colaboradores,
   pokayoke_treinos, pokayoke_erros.
   ========================================================== */

(function () {
  if (typeof document === 'undefined') return;
  const $ = (id) => document.getElementById(id);
  if (!$('aba-eficacia')) return;

  const DIAS_ACOMPANHAMENTO = 30;
  const MAX_LINHAS = 500;
  const ORIGENS = ['Todas', 'Gemba', 'Torre de Aduana', 'Poka-Yoke'];
  const FILTROS = [['todos', 'Todos'], ['bad', 'Reincidiram'], ['watch', 'Em acompanhamento'], ['ok', 'Eficazes']];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  let treinos = [];        // todos os treinos acompanhados (Gemba + Poka-Yoke)
  let carregadoPara = null;
  let carregando = false;
  const est = { origem: 'Todas', filtro: 'todos' };

  /* ---------------- Ajudantes de data ---------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const chaveLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeK = () => chaveLocal(new Date());
  // Data/hora do banco (timestamptz) → dia no fuso do navegador
  const diaDe = (iso) => chaveLocal(new Date(iso));
  const dataBr = (k) => (k ? k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4) : '—');
  const utc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
  function somarDias(k, n) {
    const d = new Date(utc(k) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');

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
    if (code === '42703' || code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'Faltam tabelas no banco. Confira se os arquivos sql/001, sql/002 e sql/006 foram rodados no Supabase.';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão.';
    }
    if (m.includes('jwt')) return 'Sua sessão expirou. Clique em Sair e entre de novo.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Não foi possível conectar. Confira a internet e tente de novo.';
    return 'Algo deu errado: ' + ((e && e.message) || 'erro desconhecido') + '.';
  }

  /* ---------------- Ler do banco (em blocos) ---------------- */

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

  // Erros do Poka-Yoke só das pessoas que já foram treinadas (lê em grupos de 50)
  async function lerErrosPoka(usuarios) {
    const todos = [];
    for (let i = 0; i < usuarios.length; i += 50) {
      const grupo = usuarios.slice(i, i + 50);
      const parte = await lerTudo(() => sb.from('pokayoke_erros')
        .select('id, usuario, data, tipo_erro, quantidade')
        .in('usuario', grupo)
        .order('id', { ascending: true }));
      todos.push(...parte);
    }
    return todos;
  }

  async function carregar(uid) {
    if (carregando) return;
    carregando = true;
    mostrarMsg('ef-msg-geral', '');
    try {
      const [regs, cols, ptr] = await Promise.all([
        lerTudo(() => sb.from('registros_gemba')
          .select('id, data, colaborador_id, processo, motivo')
          .order('data', { ascending: true })
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('colaboradores')
          .select('id, matricula, nome, status')
          .order('id', { ascending: true })),
        lerTudo(() => sb.from('pokayoke_treinos')
          .select('id, usuario, data, erros_tratados')
          .order('data', { ascending: true })
          .order('id', { ascending: true }))
      ]);
      const usuarios = Array.from(new Set(ptr.map((t) => t.usuario)));
      const perr = usuarios.length ? await lerErrosPoka(usuarios) : [];
      treinos = montarGemba(regs, cols).concat(montarPoka(ptr, perr));
      carregadoPara = uid;
    } catch (e) {
      carregadoPara = null;
      treinos = [];
      mostrarMsg('ef-msg-geral', 'Não foi possível carregar a Eficácia. ' + traduzirErro(e), false);
    } finally {
      carregando = false;
      desenharTudo();
    }
  }

  /* ---------------- Situação de cada treino ---------------- */

  // dia: dia do treino; reincidiuEm: dia da 1ª repetição do erro (ou null)
  function situacao(dia, reincidiuEm, hoje) {
    const passados = diasEntre(dia, hoje);
    if (reincidiuEm) {
      const apos = diasEntre(dia, reincidiuEm);
      return { st: 'bad', apos, decidido: reincidiuEm, passados };
    }
    if (passados > DIAS_ACOMPANHAMENTO) {
      return { st: 'ok', decidido: somarDias(dia, DIAS_ACOMPANHAMENTO + 1), passados };
    }
    return { st: 'watch', passados: Math.max(0, passados) };
  }

  // Gemba: cada desvio é um treino; reincidiu = mesmo colaborador, mesmo
  // processo e motivo, em dia posterior, em até 30 dias.
  function montarGemba(regs, cols) {
    const hoje = hojeK();
    const porId = {};
    cols.forEach((c) => { porId[c.id] = c; });
    const grupos = {};   // colaborador|processo|motivo → [dias em ordem]
    const lista = regs.map((r) => {
      const dia = diaDe(r.data);
      const chave = r.colaborador_id + '|' + r.processo + '|' + r.motivo;
      (grupos[chave] = grupos[chave] || []).push(dia);
      return { r, dia, chave };
    });
    return lista.map(({ r, dia, chave }) => {
      const limite = somarDias(dia, DIAS_ACOMPANHAMENTO);
      const rep = grupos[chave].find((d) => d > dia && d <= limite) || null;
      const c = porId[r.colaborador_id];
      const nome = c ? c.nome : 'Colaborador #' + r.colaborador_id;
      const desligado = c && c.status !== 'Ativo';
      const erro = r.processo + ' · ' + r.motivo;
      return Object.assign({
        origem: 'Gemba',
        nome: nome + (desligado ? ' (desligado)' : ''),
        desligado: !!desligado,
        erro,
        tiposPiores: [{ rotulo: erro, reincidiu: !!rep }],
        dia,
        ordem: 'g' + r.id
      }, situacao(dia, rep, hoje));
    });
  }

  // Poka-Yoke: cada treino marcado; erros treinados = tipos pendentes no dia
  // (erros com data depois do treino anterior e até o dia do treino).
  // Reincidiu = novo erro de um desses tipos em dia posterior, em até 30 dias.
  function montarPoka(ptr, perr) {
    const hoje = hojeK();
    const errosDe = {};
    perr.forEach((e) => { (errosDe[e.usuario] = errosDe[e.usuario] || []).push(e); });
    const anterior = {};   // usuário → dia do treino anterior
    return ptr.map((t) => {
      const ant = anterior[t.usuario] || null;
      anterior[t.usuario] = t.data;
      const erros = errosDe[t.usuario] || [];
      const pend = {};
      erros.forEach((e) => {
        if (e.data <= t.data && (!ant || e.data > ant)) pend[e.tipo_erro] = (pend[e.tipo_erro] || 0) + e.quantidade;
      });
      const tipos = Object.keys(pend).sort((a, b) => pend[b] - pend[a] || a.localeCompare(b));
      const limite = somarDias(t.data, DIAS_ACOMPANHAMENTO);
      // Sem tipo pendente registrado: qualquer erro novo conta como repetição
      const conta = (e) => e.data > t.data && e.data <= limite && (!tipos.length || pend[e.tipo_erro]);
      let rep = null;
      const tiposRep = {};
      erros.forEach((e) => {
        if (!conta(e)) return;
        tiposRep[e.tipo_erro] = true;
        if (!rep || e.data < rep) rep = e.data;
      });
      const erro = tipos.length
        ? tipos.map((x) => x + ' (' + num(pend[x]) + ')').join(', ')
        : 'Sem erro pendente registrado';
      return Object.assign({
        origem: 'Poka-Yoke',
        nome: t.usuario,
        desligado: false,
        erro,
        tiposPiores: tipos.map((x) => ({ rotulo: 'Poka-Yoke · ' + x, reincidiu: !!tiposRep[x] })),
        dia: t.data,
        ordem: 'p' + t.id
      }, situacao(t.data, rep, hoje));
    });
  }

  /* ---------------- Desenhar ---------------- */

  function botoes(caixa, defs, atual, aoEscolher) {
    caixa.textContent = '';
    defs.forEach(([id, rotulo]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ef-opcao' + (id === atual ? ' marcado' : '');
      b.setAttribute('aria-pressed', String(id === atual));
      b.textContent = rotulo;
      b.addEventListener('click', () => aoEscolher(id));
      caixa.appendChild(b);
    });
  }

  function visiveis() {
    return est.origem === 'Todas' ? treinos : treinos.filter((t) => t.origem === est.origem);
  }

  function desenharTudo() {
    botoes($('ef-origens'), ORIGENS.map((o) => [o, o]), est.origem, (o) => { est.origem = o; desenharTudo(); });

    if (est.origem === 'Torre de Aduana') {
      mostrarMsg('ef-aviso', 'Torre de Aduana pausada: ainda sem dados. Ela entra aqui quando a aba for liberada.', true);
    } else {
      mostrarMsg('ef-aviso', '');
    }

    const lista = visiveis();
    desenharResumo(lista);
    desenharMeses(lista);
    desenharPiores(lista);
    desenharTabela(lista);
  }

  function desenharResumo(lista) {
    const nOk = lista.filter((t) => t.st === 'ok').length;
    const nBad = lista.filter((t) => t.st === 'bad').length;
    const nW = lista.filter((t) => t.st === 'watch').length;
    const fechados = nOk + nBad;
    const total = Math.max(1, lista.length);
    $('ef-pct').textContent = fechados ? Math.round(nOk / fechados * 100) + '%' : '—';
    $('ef-frase').textContent = fechados
      ? num(nOk) + ' de ' + num(fechados) + ' treinos sem repetir o erro em 30 dias'
      : (lista.length ? 'Nenhum treino terminou os 30 dias de acompanhamento ainda.' : 'Nenhum treino para acompanhar ainda.');
    $('ef-barra-ok').style.width = (nOk / total * 100) + '%';
    $('ef-barra-bad').style.width = (nBad / total * 100) + '%';
    $('ef-barra-watch').style.width = (nW / total * 100) + '%';
    $('ef-leg-ok').textContent = 'Eficaz ' + num(nOk);
    $('ef-leg-bad').textContent = 'Reincidiu ' + num(nBad);
    $('ef-leg-watch').textContent = 'Em acompanhamento ' + num(nW);
  }

  // Últimos 4 meses, pelo mês em que o resultado saiu
  // (dia da reincidência, ou o dia em que completou os 30 dias)
  function meses(lista) {
    const hoje = new Date();
    const out = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      out.push({ chave: d.getFullYear() + '-' + pad(d.getMonth() + 1), rotulo: MESES[d.getMonth()], ok: 0, bad: 0 });
    }
    lista.forEach((t) => {
      if (t.st === 'watch') return;
      const m = out.find((x) => x.chave === t.decidido.slice(0, 7));
      if (m) m[t.st]++;
    });
    out.forEach((m) => { m.pct = (m.ok + m.bad) ? Math.round(m.ok / (m.ok + m.bad) * 100) : null; });
    return out;
  }

  function desenharMeses(lista) {
    const ms = meses(lista);
    const caixa = $('ef-meses');
    caixa.textContent = '';
    ms.forEach((m, i) => {
      const col = document.createElement('div');
      col.className = 'ef-mes';
      col.title = m.pct == null ? 'Sem resultado neste mês' : num(m.ok) + ' eficaz(es) · ' + num(m.bad) + ' reincidiu(ram)';
      const v = document.createElement('div');
      v.className = 'ef-mes-valor';
      v.textContent = m.pct == null ? '—' : m.pct + '%';
      const barra = document.createElement('div');
      barra.className = 'ef-mes-barra' + (i === ms.length - 1 ? ' atual' : '');
      barra.style.height = (m.pct == null ? 0 : Math.max(2, m.pct) * 0.8) + 'px';  // 100% = 80px
      const r = document.createElement('div');
      r.className = 'ef-mes-rotulo';
      r.textContent = m.rotulo;
      col.appendChild(v);
      col.appendChild(barra);
      col.appendChild(r);
      caixa.appendChild(col);
    });

    // Comparação do mês atual com o anterior
    const atual = ms[ms.length - 1], ant = ms[ms.length - 2];
    const delta = $('ef-delta');
    if (atual.pct != null && ant.pct != null) {
      const dif = atual.pct - ant.pct;
      delta.textContent = (dif >= 0 ? '▲ +' : '▼ ') + dif + ' p.p. em ' + atual.rotulo + ' vs. ' + ant.rotulo;
    } else {
      delta.textContent = '';
    }
  }

  function desenharPiores(lista) {
    const mapa = {};
    lista.forEach((t) => {
      if (t.st === 'watch') return;
      t.tiposPiores.forEach((x) => {
        const m = mapa[x.rotulo] || (mapa[x.rotulo] = { rotulo: x.rotulo, bad: 0, total: 0 });
        m.total++;
        if (x.reincidiu) m.bad++;
      });
    });
    const piores = Object.values(mapa).filter((m) => m.bad > 0)
      .sort((a, b) => (b.bad / b.total - a.bad / a.total) || (b.bad - a.bad) || a.rotulo.localeCompare(b.rotulo))
      .slice(0, 4);
    const caixa = $('ef-piores');
    caixa.textContent = '';
    if (!piores.length) {
      const v = document.createElement('div');
      v.className = 'ef-vazio-texto';
      v.textContent = 'Nenhuma reincidência até agora.';
      caixa.appendChild(v);
      return;
    }
    piores.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'ef-pior';
      const topo = document.createElement('div');
      topo.className = 'ef-pior-topo';
      const nome = document.createElement('span');
      nome.className = 'ef-pior-nome';
      nome.textContent = m.rotulo;
      const v = document.createElement('span');
      v.className = 'ef-pior-valor';
      v.textContent = num(m.bad) + ' de ' + num(m.total) + ' reincidiram';
      topo.appendChild(nome);
      topo.appendChild(v);
      const trilho = document.createElement('div');
      trilho.className = 'ef-pior-trilho';
      const barra = document.createElement('div');
      barra.className = 'ef-pior-barra';
      barra.style.width = Math.round(m.bad / m.total * 100) + '%';
      trilho.appendChild(barra);
      item.appendChild(topo);
      item.appendChild(trilho);
      caixa.appendChild(item);
    });
  }

  function desenharTabela(lista) {
    botoes($('ef-filtros'), FILTROS, est.filtro, (f) => { est.filtro = f; desenharTabela(visiveis()); });
    const PESO = { bad: 0, watch: 1, ok: 2 };
    const linhas = lista.filter((t) => est.filtro === 'todos' || t.st === est.filtro)
      .slice()
      .sort((a, b) => (PESO[a.st] - PESO[b.st]) || b.dia.localeCompare(a.dia) || b.ordem.localeCompare(a.ordem));
    const caixa = $('ef-linhas');
    caixa.textContent = '';
    linhas.slice(0, MAX_LINHAS).forEach((t) => {
      const ln = document.createElement('div');
      ln.className = 'planilha-linha' + (t.st === 'bad' ? ' ef-linha-bad' : '');

      const cNome = document.createElement('div');
      cNome.className = 'ef-col-nome' + (t.desligado ? ' desligado' : '');
      cNome.textContent = t.nome;
      cNome.title = t.nome;
      const cOrig = document.createElement('div');
      cOrig.textContent = t.origem;
      const cErro = document.createElement('div');
      cErro.className = 'ef-col-erro';
      cErro.textContent = t.erro;
      cErro.title = t.erro;
      const cData = document.createElement('div');
      cData.className = 'numero';
      cData.textContent = dataBr(t.dia);

      const cSit = document.createElement('div');
      cSit.className = 'ef-col-situacao';
      const chip = document.createElement('span');
      chip.className = 'ef-chip ef-chip-' + t.st;
      chip.textContent = t.st === 'bad'
        ? 'Reincidiu após ' + t.apos + (t.apos === 1 ? ' dia' : ' dias')
        : (t.st === 'ok' ? 'Eficaz' : 'Dia ' + t.passados + ' de ' + DIAS_ACOMPANHAMENTO);
      cSit.appendChild(chip);
      if (t.st === 'watch') {
        const trilho = document.createElement('div');
        trilho.className = 'ef-progresso';
        const barra = document.createElement('div');
        barra.style.width = Math.round(t.passados / DIAS_ACOMPANHAMENTO * 100) + '%';
        trilho.appendChild(barra);
        cSit.appendChild(trilho);
      }

      [cNome, cOrig, cErro, cData, cSit].forEach((c) => ln.appendChild(c));
      caixa.appendChild(ln);
    });

    const vazio = $('ef-vazio');
    vazio.hidden = linhas.length > 0;
    vazio.textContent = carregadoPara ? 'Nenhum treino neste filtro.' : 'Carregando…';
    $('ef-rodape').textContent = linhas.length > MAX_LINHAS
      ? 'Mostrando os ' + num(MAX_LINHAS) + ' primeiros de ' + num(linhas.length) + ' treinos. Use os filtros para ver os outros.'
      : num(linhas.length) + ' treino(s) neste filtro · Linha vermelha clara = reincidiu';
  }

  function limparTela() {
    treinos = [];
    carregadoPara = null;
    ['ef-msg-geral', 'ef-aviso'].forEach((id) => mostrarMsg(id, ''));
    desenharTudo();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  // Ao abrir a aba, busca os dados mais novos (ex.: novo registro no Gemba)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'eficacia' && carregadoPara) carregar(carregadoPara);
  });

  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
