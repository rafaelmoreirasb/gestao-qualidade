/* ==========================================================
   js/colaboradores.js
   Aba Colaboradores: adicionar, listar, mudar status,
   excluir (só para corrigir cadastro errado) e atualizar
   sozinha com a Base SSP53.
   Dados guardados: nome, User ext, CPF, tipo, setor, status
   (e a matrícula antiga, de quem já estava cadastrado).

   Base SSP53 (alteração 21/11/2026): ao abrir a aba, quem tem
   Editar na aba lê a aba "Colaboradores" da planilha Base SSP53
   (pela função api/colaboradores.js) e a lista fica igual a ela:
     - quem é novo entra como Ativo;
     - quem não está na base vira Desligado (ninguém é excluído);
     - quem estava Desligado e voltou é reativado;
     - Nome, User ext, CPF e Tipo são atualizados.
   A pessoa é reconhecida pelo CPF; sem CPF, pelo User ext;
   sem os dois, pelo nome. Assim o cadastro (e todo o histórico
   do Gemba, Cronograma, Painel e Eficácia) continua o mesmo.
   Segurança: se a base vier vazia ou se mais de 20% dos ativos
   fossem virar Desligado, NADA é gravado sozinho: aparece o
   resumo e o botão "Aplicar mesmo assim".
   A coluna Treinamentos conta de quantos treinamentos do
   Cronograma a pessoa participou (só os marcados como Realizado).
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const TABELA = 'colaboradores';
  const CAMPOS = 'id, matricula, user_ext, nome, cpf, tipo, setor, status';
  const TIPOS = ['DHL', 'Full', 'Diaristas'];
  const INTERVALO_SINC = 10 * 60 * 1000;   // confere a Base SSP53 no máximo a cada 10 minutos
  const LIMITE_DESLIGAR = 0.2;             // mais de 20% dos ativos virando Desligado: pede confirmação

  let lista = [];             // colaboradores carregados do banco
  let treinosPorColab = {};   // id do colaborador -> nº de treinamentos realizados
  let carregadoPara = null;   // id do usuário cujos dados estão na tela
  let carregando = false;
  let sincronizando = false;
  let ultimaSinc = 0;         // quando a Base SSP53 foi conferida pela última vez
  let plano = null;           // mudanças esperando "Aplicar mesmo assim"

  /* ---------------- Ajudantes ---------------- */

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const limparNome = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const limparExt = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const ehAtivo = (c) => (c.status || 'Ativo') === 'Ativo';
  const soNumeros = (s) => String(s || '').replace(/\D/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const horaAgora = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  // Tipo com a grafia oficial (DHL, Full, Diaristas); outro valor da base fica como veio
  function limparTipo(t) {
    const s = limparNome(t);
    if (!s) return '';
    const achado = TIPOS.find((x) => semAcento(x) === semAcento(s));
    return achado || s;
  }

  // CPF guardado só com os 11 números. Devolve '' se veio vazio
  // e null se veio preenchido mas não dá para ser um CPF.
  // Planilha às vezes tira o zero da frente: 1234567890 vira 01234567890.
  function limparCpf(v) {
    let s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toFixed(0);   // 1.2345678901E10
    s = s.replace(/\.0+$/, '');
    const n = soNumeros(s);
    if (!n) return null;
    if (n.length < 9 || n.length > 11) return null;
    return n.padStart(11, '0');
  }

  const formatarCpf = (c) => (c && /^\d{11}$/.test(c)) ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '—';

  // Como a pessoa é identificada nas mensagens
  function identificar(c) {
    const partes = [c.nome];
    if (c.user_ext) partes.push('User ext ' + c.user_ext);
    else if (c.matricula) partes.push('matrícula ' + c.matricula);
    if (c.cpf) partes.push('CPF ' + formatarCpf(c.cpf));
    if (c.tipo) partes.push(c.tipo);
    return partes.join(' · ');
  }

  function mostrarMsg(idCaixa, texto, ok) {
    const caixa = $(idCaixa);
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'mensagem ' + (ok ? 'mensagem-ok' : 'mensagem-erro');
    caixa.hidden = !texto;
  }

  function limparMsgs() {
    ['colab-msg-adicionar', 'colab-msg-lista', 'colab-msg-base'].forEach((id) => mostrarMsg(id, ''));
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (code === '23505') return 'Esse cadastro já está na lista.';
    if (code === '23514' && m.includes('cpf')) return 'CPF inválido: precisa ter 11 números.';
    if (code === '23502' && m.includes('matricula')) {
      return 'O banco ainda exige matrícula. Rode o arquivo sql/018_colaboradores_base_ssp53.sql no Supabase (SQL Editor).';
    }
    if (code === 'PGRST202' || m.includes('colaboradores_atualizar_lote')) {
      return 'Falta a função de atualização no banco. Rode o arquivo sql/018_colaboradores_base_ssp53.sql no Supabase (SQL Editor).';
    }
    if (code === '42703' || code === 'PGRST204' || ((m.includes('user_ext') || m.includes('tipo')) && (m.includes('column') || m.includes('schema cache')))) {
      return 'As colunas User ext e Tipo ainda não existem no banco. Rode o arquivo sql/018_colaboradores_base_ssp53.sql no Supabase (SQL Editor).';
    }
    if (code === '42P01' || code === 'PGRST205' || m.includes('could not find the table') || m.includes('does not exist')) {
      return 'A tabela de colaboradores ainda não existe no banco. Rode o arquivo sql/001_colaboradores.sql no Supabase (SQL Editor).';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou a gravação por falta de permissão. Sua conta precisa de Editar na aba Colaboradores.';
    }
    if (m.includes('jwt')) return 'Sua sessão expirou. Clique em Sair e entre de novo.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Não foi possível conectar. Confira a internet e tente de novo.';
    return 'Algo deu errado: ' + ((e && e.message) || 'erro desconhecido') + '.';
  }

  /* ---------------- Ler do banco ---------------- */

  async function carregar(uid) {
    if (carregando) return;
    carregando = true;
    $('colab-linhas').textContent = '';
    $('colab-vazio').textContent = 'Carregando colaboradores…';
    $('colab-vazio').hidden = false;
    try {
      const todos = [];
      const PAGINA = 1000;
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await sb.from(TABELA).select(CAMPOS).order('id', { ascending: true }).range(de, de + PAGINA - 1);
        if (error) throw error;
        todos.push(...data);
        if (data.length < PAGINA) break;
      }
      lista = todos;
      carregadoPara = uid;
      render();
      await carregarTreinos();
    } catch (e) {
      carregadoPara = null;
      lista = [];
      $('colab-contagem').textContent = '';
      $('colab-vazio').textContent = 'Não foi possível carregar a lista. ' + traduzirErro(e);
      $('colab-vazio').hidden = false;
    } finally {
      carregando = false;
    }
  }

  // Conta os treinamentos marcados como Realizado de cada colaborador.
  // Se der erro (ex.: tabelas do Cronograma ainda não criadas), a coluna mostra 0
  // e o resto da aba continua funcionando normalmente.
  async function carregarTreinos() {
    const cont = {};
    try {
      const PAGINA = 1000;
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await sb.from('treinamento_participantes')
          .select('colaborador_id, treinamentos(status)')
          .order('id', { ascending: true })
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        data.forEach((p) => {
          if (p.treinamentos && p.treinamentos.status === 'Realizado') cont[p.colaborador_id] = (cont[p.colaborador_id] || 0) + 1;
        });
        if (data.length < PAGINA) break;
      }
    } catch (e) {
      // Sem a contagem, a coluna fica com 0
    }
    treinosPorColab = cont;
    if (carregadoPara) render();
  }

  /* ---------------- Desenhar a lista ---------------- */

  const ICONE_LIXEIRA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D40511" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';

  function celula(classe, texto) {
    const d = document.createElement('div');
    if (classe) d.className = classe;
    if (texto != null) d.textContent = texto;
    return d;
  }

  function render() {
    const ativos = lista.filter(ehAtivo);
    const deslig = lista.filter((c) => !ehAtivo(c));

    // Título com contagem
    const cont = $('colab-contagem');
    cont.textContent = '· ' + lista.length + ' ';
    const pequeno = document.createElement('small');
    pequeno.textContent = '(' + ativos.length + ' ativo(s) · ' + deslig.length + ' desligado(s))';
    cont.appendChild(pequeno);

    // Ativos primeiro, desligados no fim
    const q = semAcento($('colab-busca').value);
    const qNum = soNumeros($('colab-busca').value);
    const visiveis = ativos.concat(deslig).filter((c) =>
      !q || semAcento(c.nome).includes(q) || semAcento(c.user_ext).includes(q) || semAcento(c.matricula).includes(q) ||
      semAcento(c.tipo).includes(q) || semAcento(c.status).includes(q) ||
      (qNum.length >= 3 && String(c.cpf || '').includes(qNum)));

    const caixa = $('colab-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();
    visiveis.forEach((c, i) => frag.appendChild(linhaDe(c, i + 1)));
    caixa.appendChild(frag);

    const vazio = $('colab-vazio');
    if (!lista.length) { vazio.textContent = 'Nenhum colaborador cadastrado ainda. Adicione acima ou aguarde a atualização com a Base SSP53.'; vazio.hidden = false; }
    else if (!visiveis.length) { vazio.textContent = 'Nenhum colaborador encontrado.'; vazio.hidden = false; }
    else vazio.hidden = true;
  }

  function linhaDe(c, n) {
    const ativo = ehAtivo(c);
    const linha = document.createElement('div');
    linha.className = 'planilha-linha' + (ativo ? '' : ' desligado');

    linha.appendChild(celula('direita numero col-num', String(n)));
    const nome = celula('col-nome', c.nome);
    nome.title = c.nome + (c.matricula ? ' · matrícula antiga ' + c.matricula : '');
    linha.appendChild(nome);
    const ext = celula('numero col-ext', c.user_ext || '—');
    if (c.user_ext) ext.title = c.user_ext;
    linha.appendChild(ext);
    linha.appendChild(celula('numero col-cpf', formatarCpf(c.cpf)));
    linha.appendChild(celula('col-tipo', c.tipo || '—'));

    // Status editável na linha
    const cs = celula('col-status');
    const sel = document.createElement('select');
    sel.className = 'status-select ' + (ativo ? 'ativo' : 'desligado');
    sel.setAttribute('aria-label', 'Status de ' + c.nome);
    ['Ativo', 'Desligado'].forEach((v) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    sel.value = ativo ? 'Ativo' : 'Desligado';
    sel.disabled = !gqPodeEditar('colaboradores'); // modo Ver: só olhar (Fase 11)
    sel.addEventListener('change', () => mudarStatus(c, sel));
    cs.appendChild(sel);
    linha.appendChild(cs);

    // Treinamentos realizados de que a pessoa participou (Cronograma)
    linha.appendChild(celula('direita numero', String(treinosPorColab[c.id] || 0)));

    // Lixeira: só para corrigir cadastro errado
    const cl = celula('centro');
    const lix = document.createElement('button');
    lix.type = 'button';
    lix.dataset.editar = '';
    lix.className = 'botao-lixeira';
    lix.setAttribute('aria-label', 'Excluir ' + c.nome);
    lix.title = 'Excluir (só para cadastro feito errado)';
    lix.innerHTML = ICONE_LIXEIRA;
    lix.addEventListener('click', () => excluir(c, lix));
    cl.appendChild(lix);
    linha.appendChild(cl);

    return linha;
  }

  /* ---------------- Ações da lista ---------------- */

  async function mudarStatus(c, sel) {
    const novo = sel.value;
    sel.disabled = true;
    const { error } = await sb.from(TABELA).update({ status: novo }).eq('id', c.id);
    if (error) {
      mostrarMsg('colab-msg-lista', 'Não foi possível mudar o status de ' + c.nome + '. ' + traduzirErro(error), false);
      render();
      return;
    }
    c.status = novo;
    render();
    mostrarMsg('colab-msg-lista', novo === 'Desligado'
      ? c.nome + ' marcado como Desligado e movido para o fim da lista. O histórico continua registrado.'
      : c.nome + ' reativado. Se não estiver na Base SSP53, volta a Desligado na próxima atualização automática.', true);
  }

  async function excluir(c, botao) {
    const ok = window.confirm(
      'Excluir ' + identificar(c) + '?\n\n' +
      'Use a exclusão SÓ para corrigir cadastro feito errado.\n' +
      'Se a pessoa saiu da empresa, cancele e marque como Desligado para manter o histórico.');
    if (!ok) return;
    botao.disabled = true;
    const { error } = await sb.from(TABELA).delete().eq('id', c.id);
    if (error) {
      botao.disabled = false;
      const texto = error.code === '23503'
        ? c.nome + ' já tem histórico registrado e não pode ser excluído. Marque como Desligado.'
        : 'Não foi possível excluir ' + c.nome + '. ' + traduzirErro(error);
      mostrarMsg('colab-msg-lista', texto, false);
      return;
    }
    lista = lista.filter((x) => x.id !== c.id);
    render();
    mostrarMsg('colab-msg-lista', c.nome + ' excluído da lista.', true);
  }

  /* ---------------- Adicionar manualmente ---------------- */

  async function adicionar(ev) {
    ev.preventDefault();
    if (!carregadoPara) { mostrarMsg('colab-msg-adicionar', 'A lista ainda não carregou. Espere um instante e tente de novo.', false); return; }
    const nome = limparNome($('colab-nome').value);
    const ext = limparExt($('colab-ext').value);
    const cpfDigitado = $('colab-cpf').value;
    const cpf = limparCpf(cpfDigitado);
    const tipo = limparTipo($('colab-tipo').value);
    if (!nome) { mostrarMsg('colab-msg-adicionar', 'Preencha o nome.', false); return; }
    if (cpf === null || (cpf && soNumeros(cpfDigitado).length !== 11)) { mostrarMsg('colab-msg-adicionar', 'CPF inválido: precisa ter 11 números (ou deixe em branco).', false); return; }
    const mesmoCpf = cpf && lista.find((c) => c.cpf === cpf);
    if (mesmoCpf) { mostrarMsg('colab-msg-adicionar', 'Esse CPF já está na lista: ' + identificar(mesmoCpf) + (ehAtivo(mesmoCpf) ? '.' : ' (Desligado; para trazer de volta, mude o Status para Ativo).'), false); return; }
    const mesmoExt = ext && lista.find((c) => semAcento(c.user_ext) === semAcento(ext));
    if (mesmoExt) { mostrarMsg('colab-msg-adicionar', 'Esse User ext já está na lista: ' + identificar(mesmoExt) + '.', false); return; }

    const botao = $('colab-adicionar');
    botao.disabled = true;
    try {
      const { data, error } = await sb.from(TABELA)
        .insert({ nome, user_ext: ext || null, cpf: cpf || null, tipo: tipo || null, setor: '', status: 'Ativo' })
        .select(CAMPOS).single();
      if (error) throw error;
      lista.push(data);
      $('colab-nome').value = '';
      $('colab-ext').value = '';
      $('colab-cpf').value = '';
      render();
      mostrarMsg('colab-msg-adicionar', nome + ' adicionado.', true);
      $('colab-nome').focus();
    } catch (e) {
      mostrarMsg('colab-msg-adicionar', traduzirErro(e), false);
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------------- Base SSP53 (atualização automática) ---------------- */

  // Pede ao servidor as linhas da aba Colaboradores da Base SSP53
  async function lerBase() {
    const { data } = await sb.auth.getSession();
    const sessao = data && data.session;
    if (!sessao) throw new Error('jwt: sessão expirada');
    const r = await fetch('/api/colaboradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
      body: '{}',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || ('o servidor respondeu ' + r.status));
    if (!j.r || !j.r.ok) throw new Error((j.r && j.r.motivo) || 'resposta vazia');
    return j.r.linhas || [];
  }

  // Compara a Base SSP53 com a lista atual. Não grava nada.
  function montarPlano(linhasBase) {
    // 1) Limpa a base e conta cada pessoa uma vez só
    const base = [];
    const vistos = new Set();
    let repetidas = 0, cpfInvalidos = 0;
    linhasBase.forEach((l) => {
      const nome = limparNome(l.nome);
      if (!nome) return;
      let cpf = limparCpf(l.cpf);
      if (cpf === null) { cpfInvalidos++; cpf = ''; }
      const ext = limparExt(l.ext);
      const tipo = limparTipo(l.tipo);
      const chave = cpf ? 'cpf:' + cpf : ext ? 'ext:' + semAcento(ext) : 'nome:' + semAcento(nome);
      if (vistos.has(chave)) { repetidas++; return; }
      vistos.add(chave);
      base.push({ nome, cpf, ext, tipo });
    });

    // 2) Índices da lista atual
    const indice = () => new Map();
    const porCpf = indice(), porExt = indice(), porNome = indice();
    const guardar = (m, k, c) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(c); };
    lista.forEach((c) => {
      guardar(porCpf, c.cpf || '', c);
      guardar(porExt, semAcento(c.user_ext), c);
      guardar(porNome, semAcento(limparNome(c.nome)), c);
    });
    const usados = new Set();
    // Entre vários candidatos, prefere quem está Ativo e o cadastro mais antigo
    const escolher = (arr, aceita) => {
      if (!arr) return null;
      const livres = arr.filter((c) => !usados.has(c.id) && (!aceita || aceita(c)));
      livres.sort((a, b) => (ehAtivo(b) ? 1 : 0) - (ehAtivo(a) ? 1 : 0) || a.id - b.id);
      return livres[0] || null;
    };

    // 3) Reconhece cada pessoa da base: CPF, depois User ext, depois nome
    const novos = [], readmitidos = [], atualizados = [];
    let semMudanca = 0, porNomeQtd = 0;
    base.forEach((b) => {
      // CPF diferente dos dois lados = pessoas diferentes
      const cpfNaoBriga = (c) => !b.cpf || !c.cpf || c.cpf === b.cpf;
      let ex = b.cpf ? escolher(porCpf.get(b.cpf)) : null;
      if (!ex && b.ext) ex = escolher(porExt.get(semAcento(b.ext)), cpfNaoBriga);
      if (!ex) {
        ex = escolher(porNome.get(semAcento(b.nome)), cpfNaoBriga);
        if (ex) porNomeQtd++;
      }
      if (!ex) { novos.push(b); return; }
      usados.add(ex.id);

      // Vazio na base não apaga o que já estava guardado
      const depois = {
        nome: b.nome,
        cpf: b.cpf || ex.cpf || null,
        user_ext: b.ext || ex.user_ext || null,
        tipo: b.tipo || ex.tipo || null,
      };
      const mudou = [];
      if (ex.nome !== depois.nome) mudou.push('nome: ' + ex.nome + ' → ' + depois.nome);
      if ((ex.cpf || null) !== depois.cpf) mudou.push('CPF: ' + formatarCpf(ex.cpf) + ' → ' + formatarCpf(depois.cpf));
      if ((ex.user_ext || null) !== depois.user_ext) mudou.push('User ext: ' + (ex.user_ext || '—') + ' → ' + depois.user_ext);
      if ((ex.tipo || null) !== depois.tipo) mudou.push('Tipo: ' + (ex.tipo || '—') + ' → ' + depois.tipo);
      const item = { antes: ex, depois, mudou };
      if (!ehAtivo(ex)) readmitidos.push(item);
      else if (mudou.length) atualizados.push(item);
      else semMudanca++;
    });

    // 4) Ativos que não estão na base viram Desligado
    const desligar = lista.filter((c) => ehAtivo(c) && !usados.has(c.id));
    const ativosAgora = lista.filter(ehAtivo).length;
    const baseVazia = !base.length;
    const muitos = ativosAgora > 0 && desligar.length > ativosAgora * LIMITE_DESLIGAR;

    return {
      total: base.length, novos, readmitidos, atualizados, desligar, semMudanca, porNomeQtd,
      repetidas, cpfInvalidos, ativosAgora, baseVazia, alerta: baseVazia || muitos,
      nadaMuda: !novos.length && !desligar.length && !readmitidos.length && !atualizados.length,
    };
  }

  // Um grupo do resumo: número + explicação, com a lista de nomes para abrir
  function grupoResumo(classe, qtd, texto, pessoas, mostrar) {
    if (!qtd) {
      const p = document.createElement('div');
      p.className = 'sinc-grupo sinc-zero';
      p.textContent = '0 ' + texto;
      return p;
    }
    const d = document.createElement('details');
    d.className = 'sinc-grupo ' + classe;
    const s = document.createElement('summary');
    const n = document.createElement('strong');
    n.textContent = String(qtd);
    s.appendChild(n);
    s.appendChild(document.createTextNode(' ' + texto));
    d.appendChild(s);
    const ul = document.createElement('ul');
    const LIMITE = 300;
    pessoas.slice(0, LIMITE).forEach((p) => {
      const li = document.createElement('li');
      li.textContent = mostrar(p);
      ul.appendChild(li);
    });
    if (pessoas.length > LIMITE) {
      const li = document.createElement('li');
      li.textContent = '… e mais ' + (pessoas.length - LIMITE) + '.';
      ul.appendChild(li);
    }
    d.appendChild(ul);
    return d;
  }

  function fecharResumo() {
    plano = null;
    $('colab-sinc').hidden = true;
    $('colab-sinc-itens').textContent = '';
    $('colab-sinc-alerta').hidden = true;
    $('colab-sinc-botoes').hidden = true;
  }

  // pendente = true: ainda não gravou (esperando "Aplicar mesmo assim")
  function mostrarResumo(p, pendente) {
    const itens = $('colab-sinc-itens');
    itens.textContent = '';
    $('colab-sinc-titulo').textContent = (pendente ? 'O que vai mudar' : 'O que mudou na atualização das ' + horaAgora()) +
      ' · ' + p.total + ' pessoa(s) na Base SSP53';

    const novoTxt = (b) => identificar({ nome: b.nome, user_ext: b.ext, cpf: b.cpf, tipo: b.tipo });
    const mudouTxt = (x) => x.depois.nome + (x.mudou.length ? ' (' + x.mudou.join('; ') + ')' : '');
    const vbNovo = pendente ? 'serão cadastrados' : 'cadastrados';
    const vbDeslig = pendente ? 'serão marcados' : 'marcados';
    const vbVolta = pendente ? 'serão reativados' : 'reativados';
    const vbAtual = pendente ? 'serão atualizados' : 'atualizados';

    itens.appendChild(grupoResumo('sinc-novo', p.novos.length, 'novo(s) · ' + vbNovo + ' como Ativo', p.novos, novoTxt));
    itens.appendChild(grupoResumo('sinc-deslig', p.desligar.length, 'não estão na Base SSP53 · ' + vbDeslig + ' como Desligado', p.desligar, identificar));
    itens.appendChild(grupoResumo('sinc-volta', p.readmitidos.length, 'estavam Desligados e voltaram · ' + vbVolta, p.readmitidos, mudouTxt));
    itens.appendChild(grupoResumo('sinc-atual', p.atualizados.length, 'com Nome, User ext, CPF ou Tipo diferente · ' + vbAtual + ' com os da base', p.atualizados, mudouTxt));

    const fim = document.createElement('div');
    fim.className = 'sinc-grupo sinc-zero';
    const extras = [p.semMudanca + ' sem mudança'];
    if (p.porNomeQtd) extras.push(p.porNomeQtd + ' reconhecido(s) pelo nome (sem CPF e User ext iguais)');
    if (p.repetidas) extras.push(p.repetidas + ' linha(s) repetida(s) na base contada(s) uma vez só');
    if (p.cpfInvalidos) extras.push(p.cpfInvalidos + ' CPF(s) inválido(s) na base ignorado(s) (o CPF guardado não muda)');
    fim.textContent = extras.join(' · ') + '.';
    itens.appendChild(fim);

    const alerta = $('colab-sinc-alerta');
    if (pendente && p.alerta) {
      if (p.baseVazia) {
        alerta.textContent = 'A aba Colaboradores da Base SSP53 veio vazia. Para não desligar todo mundo, nada foi gravado. Confira a planilha.';
      } else {
        const pct = Math.round((p.desligar.length / p.ativosAgora) * 100);
        alerta.textContent = 'Atualização automática pausada: ' + p.desligar.length + ' de ' + p.ativosAgora + ' ativos (' + pct + '%) ' +
          'seriam marcados como Desligado. Confira o resumo. Se estiver certo, clique em "Aplicar mesmo assim".';
      }
      alerta.hidden = false;
    } else {
      alerta.hidden = true;
    }
    $('colab-sinc-botoes').hidden = !pendente;
    $('colab-sinc-confirmar').hidden = !!p.baseVazia;
    $('colab-sinc-confirmar').disabled = false;
    $('colab-sinc-cancelar').disabled = false;
    $('colab-sinc').hidden = false;
  }

  // Grava as mudanças. Devolve um texto com o que foi feito.
  async function aplicar(p) {
    let gravados = 0, desligados = 0;
    try {
      // 1) Novos: entram como Ativo (sem matrícula)
      const novos = p.novos.map((b) => ({ nome: b.nome, cpf: b.cpf || null, user_ext: b.ext || null, tipo: b.tipo || null, setor: '', status: 'Ativo' }));
      const LOTE = 500;
      for (let i = 0; i < novos.length; i += LOTE) {
        const { data, error } = await sb.from(TABELA).insert(novos.slice(i, i + LOTE)).select('id');
        if (error) throw error;
        gravados += (data || []).length;
      }

      // 2) Reativados e atualizados: o MESMO cadastro (mesmo id), para o histórico continuar
      //    (função colaboradores_atualizar_lote do sql/018: um pedido por lote)
      const mudar = p.readmitidos.concat(p.atualizados).map((x) => ({
        id: x.antes.id, nome: x.depois.nome, cpf: x.depois.cpf || '', user_ext: x.depois.user_ext || '', tipo: x.depois.tipo || '',
      }));
      for (let i = 0; i < mudar.length; i += LOTE) {
        const { data, error } = await sb.rpc('colaboradores_atualizar_lote', { itens: mudar.slice(i, i + LOTE) });
        if (error) throw error;
        gravados += Number(data) || 0;
      }

      // 3) Quem não está na base vira Desligado (ninguém é excluído)
      const ids = p.desligar.map((c) => c.id);
      const LOTE_ID = 200;
      for (let i = 0; i < ids.length; i += LOTE_ID) {
        const { data, error } = await sb.from(TABELA).update({ status: 'Desligado' }).in('id', ids.slice(i, i + LOTE_ID)).select('id');
        if (error) throw error;
        desligados += (data || []).length;
      }
    } catch (e) {
      const parte = (gravados || desligados) ? ' Parte já foi gravada (' + gravados + ' gravado(s), ' + desligados + ' desligado(s)); clique em "Atualizar agora" para terminar.' : ' Nada foi alterado.';
      throw new Error(traduzirErro(e) + parte);
    }
    const partes = [];
    if (p.novos.length) partes.push(p.novos.length + ' novo(s)');
    if (desligados) partes.push(desligados + ' marcado(s) como Desligado');
    if (p.readmitidos.length) partes.push(p.readmitidos.length + ' reativado(s)');
    if (p.atualizados.length) partes.push(p.atualizados.length + ' atualizado(s)');
    return partes.join(', ');
  }

  // forcado = botão "Atualizar agora" (não espera os 10 minutos)
  async function sincronizar(forcado) {
    if (sincronizando || carregando || !carregadoPara) return;
    if (typeof gqPodeEditar !== 'function' || !gqPodeEditar('colaboradores')) return;   // modo Ver não atualiza
    if (!forcado && (plano || Date.now() - ultimaSinc < INTERVALO_SINC)) return;
    sincronizando = true;
    const botao = $('colab-atualizar');
    botao.disabled = true;
    fecharResumo();
    mostrarMsg('colab-msg-base', 'Conferindo a Base SSP53…', true);
    try {
      const linhas = await lerBase();
      ultimaSinc = Date.now();
      const p = montarPlano(linhas);
      if (p.nadaMuda) {
        mostrarMsg('colab-msg-base', 'A lista já está igual à Base SSP53 (' + p.total + ' pessoa(s), conferido às ' + horaAgora() + ').', true);
      } else if (p.alerta) {
        plano = p;
        mostrarResumo(p, true);
        mostrarMsg('colab-msg-base', 'Nada foi gravado ainda.', false);
      } else {
        const feito = await aplicar(p);
        await carregar(carregadoPara);
        mostrarResumo(p, false);
        mostrarMsg('colab-msg-base', 'Atualizado com a Base SSP53 às ' + horaAgora() + ': ' + feito + '. Ninguém foi excluído e o histórico continua.', true);
      }
    } catch (e) {
      const m = String((e && e.message) || '');
      mostrarMsg('colab-msg-base', /parte já foi gravada|nada foi alterado/i.test(m)
        ? m
        : 'Não consegui ler a Base SSP53: ' + (m.includes('jwt') || m.includes('fetch') ? traduzirErro(e) : m) + ' A lista não mudou.', false);
      if (/parte já foi gravada/i.test(m)) await carregar(carregadoPara);
    } finally {
      sincronizando = false;
      botao.disabled = false;
    }
  }

  async function aplicarMesmoAssim() {
    const p = plano;
    if (!p || sincronizando) return;
    sincronizando = true;
    $('colab-sinc-confirmar').disabled = true;
    $('colab-sinc-cancelar').disabled = true;
    $('colab-atualizar').disabled = true;
    mostrarMsg('colab-msg-base', 'Gravando…', true);
    try {
      const feito = await aplicar(p);
      plano = null;
      await carregar(carregadoPara);
      mostrarResumo(p, false);
      mostrarMsg('colab-msg-base', 'Atualizado com a Base SSP53 às ' + horaAgora() + ': ' + feito + '. Ninguém foi excluído e o histórico continua.', true);
    } catch (e) {
      fecharResumo();
      await carregar(carregadoPara);
      mostrarMsg('colab-msg-base', String((e && e.message) || e), false);
    } finally {
      sincronizando = false;
      $('colab-atualizar').disabled = false;
    }
  }

  // Confere sozinho quando a aba Colaboradores está aberta
  function talvezSincronizar() {
    const aba = $('aba-colaboradores');
    if (!aba || aba.hidden) return;
    sincronizar(false);
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    lista = [];
    treinosPorColab = {};
    carregadoPara = null;
    ultimaSinc = 0;
    $('colab-linhas').textContent = '';
    $('colab-contagem').textContent = '';
    $('colab-vazio').hidden = true;
    $('colab-busca').value = '';
    $('colab-nome').value = '';
    $('colab-ext').value = '';
    $('colab-cpf').value = '';
    fecharResumo();
    limparMsgs();
  }

  async function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) {
      await carregar(uid);
      talvezSincronizar();
    }
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('colab-form').addEventListener('submit', adicionar);
  $('colab-busca').addEventListener('input', render);
  $('colab-atualizar').addEventListener('click', () => sincronizar(true));
  $('colab-sinc-confirmar').addEventListener('click', aplicarMesmoAssim);
  $('colab-sinc-cancelar').addEventListener('click', () => {
    fecharResumo();
    mostrarMsg('colab-msg-base', 'Atualização não aplicada. A lista não mudou. Clique em "Atualizar agora" quando quiser conferir de novo.', true);
  });

  // Ao abrir a aba: atualiza a contagem de treinamentos e confere a Base SSP53
  document.addEventListener('gq:aba', (ev) => {
    if (!(ev.detail && ev.detail.aba === 'colaboradores') || !carregadoPara || carregando) return;
    carregarTreinos();
    sincronizar(false);
  });
  // Quando o perfil (permissões) termina de carregar, confere se a aba já está aberta
  document.addEventListener('gq:perfil', () => setTimeout(talvezSincronizar, 0));

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
