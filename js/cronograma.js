/* ==========================================================
   js/cronograma.js
   Aba Cronograma: criar treinamento (Tema, Data, Horário e
   Carga horária), calendário do mês (com Exportar PDF e Tela
   cheia), lista "Aguardando participantes", tabela com todos
   e janela do treinamento (participantes só Ativos, carga
   horária editável, status Agendado/Realizado e anexos:
   foto da turma e lista de presença).
   O mesmo treinamento pode ser lançado em vários dias de uma vez
   (cada dia vira um treinamento separado).
   Tabelas: treinamentos e treinamento_participantes.
   Arquivos: Storage do Supabase, pasta privada "treinamentos".
   Todo treinamento aparece no mapa de calor do Painel.
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const HORA_PADRAO = '08:00';
  const POR_DIA = 4;          // treinamentos mostrados em cada dia do calendário
  const MAX_DIAS = 60;        // máximo de dias num lançamento repetido
  const CAMPOS = 'id, data, hora, tema, carga_minutos, status, foto_caminho, lista_caminho';

  // Anexos (Storage)
  const PASTA = 'treinamentos';          // pasta privada no Supabase Storage
  const LIMITE_PDF = 10 * 1024 * 1024;   // 10 MB
  const FOTO_LADO_MAX = 1600;            // a foto é reduzida para no máximo 1600 px no lado maior
  const FOTO_QUALIDADE = 0.82;           // qualidade do JPEG (0 a 1)
  const ANEXOS = {
    foto: { coluna: 'foto_caminho', nome: 'foto da turma', vazio: 'Nenhuma foto anexada.' },
    lista: { coluna: 'lista_caminho', nome: 'lista de presença', vazio: 'Nenhuma lista anexada.' }
  };

  let colaboradores = [];   // todos (Ativos e Desligados), em ordem de nome
  let treinos = [];         // { id, data: 'AAAA-MM-DD', hora: 'HH:MM', tema, carga (minutos ou null), status, foto, lista }
  let participantes = {};   // id do treinamento -> Set com ids de colaboradores
  let carregadoPara = null;
  let carregando = false;

  // O formulário "Novo treinamento" começa fechado
  const est = { ano: null, mes: null, aberto: null, formAberto: false, cheia: false, imprimindo: false, busca: '' };

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
      status: t.status === 'Realizado' ? 'Realizado' : 'Agendado',
      foto: t.foto_caminho || null,
      lista: t.lista_caminho || null
    };
  }

  // Check verde do treinamento realizado
  function check() {
    const s = document.createElement('span');
    s.className = 'crono-check';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '✓';
    return s;
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
    if (code === '42703' || (m.includes('column') && (m.includes('foto_caminho') || m.includes('lista_caminho') || m.includes('carga_minutos')))) {
      return 'Faltam colunas novas no banco. Rode o arquivo sql/007_cronograma_anexos.sql no Supabase (SQL Editor).';
    }
    if (m.includes('bucket not found') || (m.includes('bucket') && m.includes('not found'))) {
      return 'A pasta de anexos ainda não existe no Supabase. Rode o arquivo sql/007_cronograma_anexos.sql (SQL Editor).';
    }
    if (m.includes('mime type') || m.includes('invalid_mime_type')) return 'Tipo de arquivo não aceito. Use JPEG ou PNG para a foto e PDF para a lista.';
    if (m.includes('payload too large') || m.includes('exceeded the maximum allowed size') || m.includes('entity too large')) return 'Arquivo grande demais. O limite é 10 MB.';
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || m.includes('could not find') || m.includes('does not exist')) {
      return 'As tabelas do Cronograma ainda não existem no banco. Rode os arquivos sql/003_cronograma.sql e sql/004_cronograma_status_carga.sql no Supabase (SQL Editor).';
    }
    if (code === '23503') return 'Esse treinamento ou colaborador não existe mais. Recarregue a página.';
    if (code === '23514') return 'O banco recusou o valor. Confira a carga horária (ex.: 00:10 ou 01:30).';
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou por falta de permissão. Confira se os arquivos sql/003, sql/004 e sql/007 foram rodados inteiros.';
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
    ajustarAlturaPendentes();
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
        if (t.status === 'Realizado') e.appendChild(check());
        e.appendChild(document.createTextNode(t.hora + ' ' + t.tema));
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

  function preencherChip(chip, t) {
    const sit = situacao(t);
    chip.className = 'crono-chip' + classeSituacao(sit);
    chip.textContent = '';
    if (sit === 'Realizado') chip.appendChild(check());
    chip.appendChild(document.createTextNode(sit));
    return chip;
  }

  const chipSituacao = (t) => preencherChip(document.createElement('span'), t);

  const ICONE_FOTO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
  const ICONE_PDF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>';

  // Ícones de foto e lista na tabela: clicar abre o arquivo
  function celulaAnexos(t) {
    const c = celula('crono-col-anexos');
    [['foto', ICONE_FOTO, 'Ver foto da turma'], ['lista', ICONE_PDF, 'Ver lista de presença']].forEach(([tipo, icone, rotulo]) => {
      if (!t[tipo]) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crono-icone-anexo';
      b.title = rotulo;
      b.setAttribute('aria-label', rotulo + ' de ' + t.tema);
      b.innerHTML = icone;
      b.addEventListener('click', () => verAnexo(t, tipo, 'crono-msg-lista'));
      c.appendChild(b);
    });
    if (!t.foto && !t.lista) {
      const v = document.createElement('span');
      v.className = 'crono-sem-anexo';
      v.textContent = '—';
      c.appendChild(v);
    }
    return c;
  }

  // Texto onde a busca procura: data, tema, participantes (nome e matrícula) e situação
  function textoDeBusca(t) {
    const s = participantes[t.id] || new Set();
    const pessoas = colaboradores.filter((c) => s.has(c.id)).map((c) => c.nome + ' ' + c.matricula).join(' ');
    return semAcento([dataCompleta(t.data), t.tema, pessoas, situacao(t)].join(' | '));
  }

  function desenharTabela() {
    const todos = ordenados().reverse(); // mais recentes primeiro
    const q = semAcento(est.busca);
    const lista = q ? todos.filter((t) => textoDeBusca(t).includes(q)) : todos;
    $('crono-total').textContent = '· ' + (q ? lista.length + ' de ' + todos.length : todos.length);

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

      linha.appendChild(celulaAnexos(t));

      const ca = celula('crono-col-acoes');
      const bp = document.createElement('button');
      bp.type = 'button';
      bp.className = 'crono-botao-part';
      bp.textContent = 'Participantes';
      bp.title = 'Participantes, carga horária, status e anexos';
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
      vazio.textContent = !carregadoPara
        ? 'Carregando treinamentos…'
        : (todos.length ? 'Nenhum treinamento encontrado para "' + est.busca.trim() + '".' : 'Nenhum treinamento cadastrado ainda. Clique em "+ Novo treinamento" para criar o primeiro.');
      vazio.hidden = false;
    } else {
      vazio.hidden = true;
    }
  }

  /* --------- Quadro "Aguardando participantes" da altura do calendário --------- */

  // Lado a lado (computador): o quadro amarelo fica com a altura do calendário e rola por dentro.
  // Um embaixo do outro (celular): vale a altura fixa do CSS.
  function ajustarAlturaPendentes() {
    const cal = $('crono-calendario');
    const lado = $('crono-proximos');
    if (!cal || !lado) return;
    const ladoALado = !est.cheia && cal.offsetHeight > 0 && Math.abs(lado.offsetTop - cal.offsetTop) < 4;
    lado.style.height = ladoALado ? cal.offsetHeight + 'px' : '';
    lado.classList.toggle('lado-a-lado', ladoALado);
  }

  /* ---------------- Repetir em vários dias ---------------- */

  const dataValida = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k || '');
  const dataDaChave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d); };

  function diasDaSemanaMarcados() {
    return [...$('crono-dias-semana').querySelectorAll('input:checked')].map((c) => Number(c.value));
  }

  // Lista de datas (AAAA-MM-DD) do lançamento: de "Data" até "Até", só nos dias da semana marcados.
  // Devolve { datas } ou { erro }
  function datasDoLancamento() {
    const inicio = $('crono-data').value;
    if (!$('crono-repetir').checked) return { datas: dataValida(inicio) ? [inicio] : [] };
    const fim = $('crono-ate').value;
    if (!dataValida(inicio) || !dataValida(fim)) return { erro: 'Preencha a data inicial (Data) e a data final (Até).' };
    if (fim < inicio) return { erro: 'A data final (Até) precisa ser igual ou depois da data inicial.' };
    const dias = diasDaSemanaMarcados();
    if (!dias.length) return { erro: 'Marque pelo menos um dia da semana.' };
    const datas = [];
    const d = dataDaChave(inicio);
    const ultimo = dataDaChave(fim);
    while (d <= ultimo) {
      if (dias.includes(d.getDay())) datas.push(chaveDia(d));
      if (datas.length > MAX_DIAS) break;
      d.setDate(d.getDate() + 1);
    }
    if (!datas.length) return { erro: 'Nenhum dia do período cai nos dias da semana marcados.' };
    if (datas.length > MAX_DIAS) return { erro: 'São mais de ' + MAX_DIAS + ' dias. Diminua o período (no máximo ' + MAX_DIAS + ' treinamentos por lançamento).' };
    return { datas };
  }

  function desenharRepetir() {
    const ligado = $('crono-repetir').checked;
    $('crono-repetir-campos').hidden = !ligado;
    $('crono-adicionar').textContent = 'Adicionar ao cronograma';
    if (!ligado) return;
    const r = datasDoLancamento();
    const resumo = $('crono-repetir-resumo');
    if (r.erro) {
      resumo.textContent = r.erro;
      resumo.className = 'crono-repetir-resumo erro';
      return;
    }
    resumo.textContent = 'Serão criados ' + plural(r.datas.length, 'treinamento', 'treinamentos') +
      ', de ' + dataCompleta(r.datas[0]) + ' a ' + dataCompleta(r.datas[r.datas.length - 1]) + '.';
    resumo.className = 'crono-repetir-resumo';
    if (r.datas.length > 1) $('crono-adicionar').textContent = 'Adicionar ' + r.datas.length + ' treinamentos';
  }

  function ligarRepetir() {
    // Ao ligar, sugere a mesma semana: até a sexta-feira seguinte à data escolhida
    if ($('crono-repetir').checked && !$('crono-ate').value && dataValida($('crono-data').value)) {
      const d = dataDaChave($('crono-data').value);
      const ateSexta = (5 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + ateSexta);
      $('crono-ate').value = chaveDia(d);
    }
    mostrarMsg('crono-msg-form', '');
    desenharRepetir();
  }

  /* ---------------- Criar treinamento ---------------- */

  async function adicionar(ev) {
    ev.preventDefault();
    if (!carregadoPara) { mostrarMsg('crono-msg-form', 'O Cronograma ainda não carregou. Espere um instante e tente de novo.', false); return; }

    const tema = limparTexto($('crono-tema').value);
    const hora = $('crono-hora').value || HORA_PADRAO;
    const carga = lerCarga($('crono-carga').value);
    const falta = [];
    if (!tema) falta.push('tema');
    if (!dataValida($('crono-data').value)) falta.push('data');
    if (!carga) falta.push('carga horária (horas:minutos, ex.: 00:10 ou 01:30)');
    if (falta.length) { mostrarMsg('crono-msg-form', 'Preencha: ' + falta.join(', ') + '.', false); return; }

    const r = datasDoLancamento();
    if (r.erro) { mostrarMsg('crono-msg-form', r.erro, false); return; }
    const datas = r.datas;
    if (datas.length > 1) {
      const ok = window.confirm('Criar ' + datas.length + ' treinamentos "' + tema + '", de ' + dataCompleta(datas[0]) +
        ' a ' + dataCompleta(datas[datas.length - 1]) + ', às ' + hora + '?\n\nCada dia vira um treinamento separado.');
      if (!ok) return;
    }

    const botao = $('crono-adicionar');
    botao.disabled = true;
    try {
      const linhas = datas.map((data) => ({ data, hora, tema, carga_minutos: carga, status: 'Agendado' }));
      const { data: novos, error } = await sb.from('treinamentos').insert(linhas).select(CAMPOS);
      if (error) throw error;
      (novos || []).forEach((novo) => {
        treinos.push(doBanco(novo));
        participantes[novo.id] = new Set();
      });

      // Mostra o mês do (primeiro) treinamento criado
      const [a, m] = datas[0].split('-').map(Number);
      est.ano = a;
      est.mes = m - 1;
      $('crono-tema').value = '';
      $('crono-carga').value = '';
      desenharTudo();
      mostrarMsg('crono-msg-form', datas.length > 1
        ? plural(datas.length, 'treinamento criado', 'treinamentos criados') + ', de ' + dataCompleta(datas[0]) + ' a ' + dataCompleta(datas[datas.length - 1]) + '. Abra cada um para acrescentar os participantes.'
        : 'Treinamento criado. Ele já aparece no mapa de calor do Painel. Abra-o para acrescentar os participantes.', true);
    } catch (e) {
      mostrarMsg('crono-msg-form', 'Não foi possível criar ' + (datas.length > 1 ? 'os treinamentos' : 'o treinamento') + '. Nada foi gravado. ' + traduzirErro(e), false);
    } finally {
      botao.disabled = false;
      desenharRepetir();
    }
  }

  /* ---------------- Excluir (só lançamento errado) ---------------- */

  async function excluir(t, botao) {
    const n = qtd(t);
    const arquivos = [t.foto, t.lista].filter(Boolean);
    const ok = window.confirm(
      'Excluir o treinamento "' + t.tema + '" de ' + dataCompleta(t.data) + ' às ' + t.hora + '?\n\n' +
      (n ? 'A lista de ' + plural(n, 'participante', 'participantes') + ' dele também será apagada.\n' : '') +
      (arquivos.length ? 'Os anexos (foto e/ou lista de presença) também serão apagados.\n' : '') +
      'Use a exclusão SÓ para corrigir lançamento feito errado.');
    if (!ok) return;
    botao.disabled = true;
    const { error } = await sb.from('treinamentos').delete().eq('id', t.id);
    if (error) {
      botao.disabled = false;
      mostrarMsg('crono-msg-lista', 'Não foi possível excluir "' + t.tema + '". ' + traduzirErro(error), false);
      return;
    }
    // Apaga os arquivos do Storage (se falhar, o treinamento já saiu; o arquivo só fica sem uso)
    if (arquivos.length) await sb.storage.from(PASTA).remove(arquivos).catch(() => {});
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
    preencherChip($('crono-janela-chip'), t);
    desenharAnexos(t);
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

  /* ---------------- Anexos: foto da turma e lista de presença ---------------- */

  let enviando = null;   // 'foto' ou 'lista' enquanto um arquivo está sendo enviado

  function desenharAnexos(t) {
    Object.keys(ANEXOS).forEach((tipo) => {
      const tem = !!t[tipo];
      const ocupado = enviando === tipo;
      $('crono-anexo-' + tipo).classList.toggle('anexado', tem);
      $('crono-anexo-' + tipo + '-situacao').textContent = ocupado
        ? 'Enviando…'
        : (tem ? 'Anexada · clique em Ver para abrir' : ANEXOS[tipo].vazio);
      $('crono-anexo-' + tipo + '-ver').hidden = !tem;
      $('crono-anexo-' + tipo + '-remover').hidden = !tem;
      $('crono-anexo-' + tipo + '-acao').textContent = tem ? 'Trocar' : 'Anexar';
      $('crono-anexo-' + tipo + '-rotulo').classList.toggle('ocupado', !!enviando);
      $('crono-anexo-' + tipo + '-arquivo').disabled = !!enviando;
    });
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

  const tamanho = (bytes) => (bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');

  async function anexar(tipo, input) {
    const t = treinos.find((x) => x.id === est.aberto);
    const arquivo = input.files && input.files[0];
    input.value = '';
    if (!t || !arquivo || enviando) return;
    mostrarMsg('crono-janela-msg', '');

    // Confere o tipo e prepara o arquivo
    let corpo;
    let extensao;
    let tipoMime;
    const nome = String(arquivo.name || '').toLowerCase();
    if (tipo === 'foto') {
      const ehImagem = /^image\/(jpeg|png)$/.test(arquivo.type) || /\.(jpe?g|png)$/.test(nome);
      if (!ehImagem) { mostrarMsg('crono-janela-msg', 'A foto precisa ser JPEG ou PNG.', false); return; }
      corpo = await reduzirFoto(arquivo);
      if (!corpo) { mostrarMsg('crono-janela-msg', 'Não consegui abrir essa imagem. Tente outra foto em JPEG ou PNG.', false); return; }
      extensao = 'jpg';
      tipoMime = 'image/jpeg';
      // Se a foto já era pequena e a reduzida ficou maior, envia a original
      if (corpo.size >= arquivo.size) {
        const png = arquivo.type === 'image/png' || /\.png$/.test(nome);
        corpo = arquivo;
        extensao = png ? 'png' : 'jpg';
        tipoMime = png ? 'image/png' : 'image/jpeg';
      }
    } else {
      const ehPdf = arquivo.type === 'application/pdf' || /\.pdf$/.test(nome);
      if (!ehPdf) { mostrarMsg('crono-janela-msg', 'A lista de presença precisa ser um arquivo PDF.', false); return; }
      if (arquivo.size > LIMITE_PDF) { mostrarMsg('crono-janela-msg', 'O PDF tem ' + tamanho(arquivo.size) + '. O limite é 10 MB.', false); return; }
      corpo = arquivo;
      extensao = 'pdf';
      tipoMime = 'application/pdf';
    }
    if (corpo.size > LIMITE_PDF) { mostrarMsg('crono-janela-msg', 'Arquivo grande demais (' + tamanho(corpo.size) + '). O limite é 10 MB.', false); return; }

    const coluna = ANEXOS[tipo].coluna;
    const antigo = t[tipo];
    // Nome novo a cada envio: pasta do treinamento / tipo-data e hora
    const caminho = t.id + '/' + tipo + '-' + Date.now() + '.' + extensao;

    enviando = tipo;
    desenharAnexos(t);
    try {
      const up = await sb.storage.from(PASTA).upload(caminho, corpo, { contentType: tipoMime, upsert: false });
      if (up.error) throw up.error;
      const { error } = await sb.from('treinamentos').update({ [coluna]: caminho }).eq('id', t.id);
      if (error) {
        await sb.storage.from(PASTA).remove([caminho]).catch(() => {});
        throw error;
      }
      t[tipo] = caminho;
      // Trocou: apaga o arquivo anterior
      if (antigo) await sb.storage.from(PASTA).remove([antigo]).catch(() => {});
      mostrarMsg('crono-janela-msg', (tipo === 'foto' ? 'Foto da turma' : 'Lista de presença') +
        (antigo ? ' trocada' : ' anexada') + ' (' + tamanho(corpo.size) + ').', true);
    } catch (e) {
      mostrarMsg('crono-janela-msg', 'Não foi possível anexar a ' + ANEXOS[tipo].nome + '. ' + traduzirErro(e), false);
    } finally {
      enviando = null;
      if (est.aberto === t.id) desenharAnexos(t);
      desenharTabela();
    }
  }

  // Abre o arquivo numa aba nova, com um link temporário (vale 1 hora)
  async function verAnexo(t, tipo, idMsg) {
    const caminho = t[tipo];
    if (!caminho) return;
    // Abre a aba já no clique (senão o navegador pode bloquear) e depois coloca o endereço
    const aba = window.open('', '_blank');
    if (aba) aba.document.write('<p style="font-family:sans-serif">Abrindo ' + ANEXOS[tipo].nome + '…</p>');
    const { data, error } = await sb.storage.from(PASTA).createSignedUrl(caminho, 3600);
    if (error || !data || !data.signedUrl) {
      if (aba) aba.close();
      mostrarMsg(idMsg, 'Não foi possível abrir a ' + ANEXOS[tipo].nome + '. ' + traduzirErro(error || {}), false);
      return;
    }
    if (aba) aba.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function removerAnexo(tipo) {
    const t = treinos.find((x) => x.id === est.aberto);
    if (!t || !t[tipo] || enviando) return;
    const ok = window.confirm('Remover a ' + ANEXOS[tipo].nome + ' do treinamento "' + t.tema + '" de ' + dataCompleta(t.data) + '?\n\nO arquivo será apagado.');
    if (!ok) return;
    const antigo = t[tipo];
    const { error } = await sb.from('treinamentos').update({ [ANEXOS[tipo].coluna]: null }).eq('id', t.id);
    if (error) {
      mostrarMsg('crono-janela-msg', 'Não foi possível remover. ' + traduzirErro(error), false);
      return;
    }
    t[tipo] = null;
    await sb.storage.from(PASTA).remove([antigo]).catch(() => {});
    desenharAnexos(t);
    desenharTabela();
    mostrarMsg('crono-janela-msg', (tipo === 'foto' ? 'Foto da turma removida.' : 'Lista de presença removida.'), true);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    colaboradores = []; treinos = []; participantes = {};
    carregadoPara = null;
    est.ano = null; est.mes = null; est.formAberto = false; est.busca = '';
    $('crono-busca').value = '';
    fecharJanela();
    if (est.cheia) sairTelaCheia();
    $('crono-tema').value = '';
    $('crono-data').value = hojeK();
    $('crono-hora').value = HORA_PADRAO;
    $('crono-carga').value = '';
    $('crono-repetir').checked = false;
    $('crono-ate').value = '';
    ['crono-msg-geral', 'crono-msg-form', 'crono-msg-lista', 'crono-janela-msg'].forEach((id) => mostrarMsg(id, ''));
    desenharRepetir();
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
  $('crono-data').addEventListener('change', () => { desenharCalendario(); desenharRepetir(); });

  // Busca em "Todos os treinamentos"
  $('crono-busca').addEventListener('input', (ev) => {
    est.busca = ev.target.value;
    document.querySelector('.crono-tabela-rolagem').scrollTop = 0;
    desenharTabela();
  });

  // Quadro amarelo acompanha a altura do calendário
  if (window.ResizeObserver) new ResizeObserver(ajustarAlturaPendentes).observe($('crono-calendario'));
  window.addEventListener('resize', ajustarAlturaPendentes);

  // Repetir em vários dias
  $('crono-repetir').addEventListener('change', ligarRepetir);
  $('crono-ate').addEventListener('change', desenharRepetir);
  $('crono-dias-semana').addEventListener('change', desenharRepetir);

  // Anexos
  Object.keys(ANEXOS).forEach((tipo) => {
    $('crono-anexo-' + tipo + '-arquivo').addEventListener('change', (ev) => anexar(tipo, ev.target));
    $('crono-anexo-' + tipo + '-ver').addEventListener('click', () => {
      const t = treinos.find((x) => x.id === est.aberto);
      if (t) verAnexo(t, tipo, 'crono-janela-msg');
    });
    $('crono-anexo-' + tipo + '-remover').addEventListener('click', () => removerAnexo(tipo));
  });
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

  desenharRepetir();
  desenharTudo();

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
