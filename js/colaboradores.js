/* ==========================================================
   js/colaboradores.js
   Aba Colaboradores: adicionar, listar, mudar status,
   excluir (só para corrigir cadastro errado) e importar planilha.
   Dados guardados: só matrícula, nome, setor e status.
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const TABELA = 'colaboradores';
  const CAMPOS = 'id, matricula, nome, setor, status';

  let lista = [];             // colaboradores carregados do banco
  let carregadoPara = null;   // id do usuário cujos dados estão na tela
  let carregando = false;

  /* ---------------- Ajudantes ---------------- */

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const limparNome = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const limparMatricula = (s) => String(s || '').replace(/\.0+$/, '').replace(/\s+/g, '').trim();
  const ehAtivo = (c) => (c.status || 'Ativo') === 'Ativo';

  function mostrarMsg(idCaixa, texto, ok) {
    const caixa = $(idCaixa);
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.className = 'mensagem ' + (ok ? 'mensagem-ok' : 'mensagem-erro');
    caixa.hidden = !texto;
  }

  function limparMsgs() {
    ['colab-msg-adicionar', 'colab-msg-lista', 'colab-msg-importar'].forEach((id) => mostrarMsg(id, ''));
  }

  function traduzirErro(e) {
    const m = String((e && e.message) || '').toLowerCase();
    const code = e && e.code;
    if (code === '23505') return 'Essa matrícula já está na lista.';
    if (code === '42P01' || code === 'PGRST205' || m.includes('could not find the table') || m.includes('does not exist')) {
      return 'A tabela de colaboradores ainda não existe no banco. Rode o arquivo sql/001_colaboradores.sql no Supabase (SQL Editor).';
    }
    if (code === '42501' || m.includes('permission denied') || m.includes('row-level security')) {
      return 'O banco recusou a gravação por falta de permissão. Confira se o arquivo sql/001_colaboradores.sql foi rodado inteiro.';
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
    const visiveis = ativos.concat(deslig).filter((c) =>
      !q || semAcento(c.nome).includes(q) || String(c.matricula).toLowerCase().includes(q) || semAcento(c.status).includes(q));

    const caixa = $('colab-linhas');
    caixa.textContent = '';
    const frag = document.createDocumentFragment();
    visiveis.forEach((c, i) => frag.appendChild(linhaDe(c, i + 1)));
    caixa.appendChild(frag);

    const vazio = $('colab-vazio');
    if (!lista.length) { vazio.textContent = 'Nenhum colaborador cadastrado ainda. Adicione acima ou importe uma planilha.'; vazio.hidden = false; }
    else if (!visiveis.length) { vazio.textContent = 'Nenhum colaborador encontrado.'; vazio.hidden = false; }
    else vazio.hidden = true;
  }

  function linhaDe(c, n) {
    const ativo = ehAtivo(c);
    const linha = document.createElement('div');
    linha.className = 'planilha-linha' + (ativo ? '' : ' desligado');

    linha.appendChild(celula('direita numero col-num', String(n)));
    linha.appendChild(celula('numero col-mat', c.matricula));
    const nome = celula('col-nome', c.nome);
    nome.title = c.nome;
    linha.appendChild(nome);

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
    sel.addEventListener('change', () => mudarStatus(c, sel));
    cs.appendChild(sel);
    linha.appendChild(cs);

    // Treinamentos: passa a contar na Fase 4 (Cronograma)
    linha.appendChild(celula('direita numero', '0'));

    // Lixeira: só para corrigir cadastro errado
    const cl = celula('centro');
    const lix = document.createElement('button');
    lix.type = 'button';
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
      : c.nome + ' reativado.', true);
  }

  async function excluir(c, botao) {
    const ok = window.confirm(
      'Excluir ' + c.nome + ' (matrícula ' + c.matricula + ')?\n\n' +
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
    const matricula = limparMatricula($('colab-matricula').value);
    const nome = limparNome($('colab-nome').value);
    if (!matricula || !nome) { mostrarMsg('colab-msg-adicionar', 'Preencha matrícula e nome.', false); return; }
    if (lista.some((c) => String(c.matricula) === matricula)) { mostrarMsg('colab-msg-adicionar', 'Essa matrícula já está na lista.', false); return; }

    const botao = $('colab-adicionar');
    botao.disabled = true;
    try {
      const { data, error } = await sb.from(TABELA).insert({ matricula, nome, setor: '', status: 'Ativo' }).select(CAMPOS).single();
      if (error) throw error;
      lista.push(data);
      $('colab-matricula').value = '';
      $('colab-nome').value = '';
      render();
      mostrarMsg('colab-msg-adicionar', nome + ' adicionado.', true);
      $('colab-matricula').focus();
    } catch (e) {
      mostrarMsg('colab-msg-adicionar', traduzirErro(e), false);
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------------- Importar planilha ---------------- */

  // Acha as colunas Nome e Matrícula e devolve as linhas preenchidas
  function linhasParaColaboradores(linhas) {
    const h = linhas.findIndex((r) => r && r.some((c) => /matr|chapa/.test(semAcento(c))) && r.some((c) => /nome|colaborador|funcionario/.test(semAcento(c))));
    if (h < 0) throw new Error('não encontrei as colunas Nome e Matrícula na primeira aba');
    const cab = linhas[h].map(semAcento);
    const iM = cab.findIndex((c) => /matr|chapa/.test(c));
    const iN = cab.findIndex((c) => /nome|colaborador|funcionario/.test(c));
    if (iM < 0 || iN < 0) throw new Error('não encontrei as colunas Nome e Matrícula na primeira aba');

    const saida = [];
    let incompletas = 0;
    linhas.slice(h + 1).forEach((r) => {
      if (!r) return;
      const matricula = limparMatricula(r[iM]);
      const nome = limparNome(r[iN]);
      if (!matricula && !nome) return;              // linha em branco
      if (!matricula || !nome) { incompletas++; return; }
      saida.push({ matricula, nome });
    });
    return { saida, incompletas };
  }

  async function importar(ev) {
    const input = ev.target;
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    const rotulo = $('colab-arquivo-rotulo');
    mostrarMsg('colab-msg-importar', '');

    if (!carregadoPara) {
      mostrarMsg('colab-msg-importar', 'A lista ainda não carregou. Espere um instante e tente de novo.', false);
      input.value = '';
      return;
    }

    rotulo.classList.add('ocupado');
    mostrarMsg('colab-msg-importar', 'Lendo "' + arquivo.name + '"…', true);
    try {
      const { saida, incompletas } = linhasParaColaboradores(await lerPlanilha(arquivo));
      if (!saida.length) throw new Error('nenhuma linha com matrícula e nome');

      // Matrícula repetida dentro da própria planilha conta uma vez só
      const vistos = new Set();
      let repetidas = 0;
      const unicos = saida.filter((c) => { if (vistos.has(c.matricula)) { repetidas++; return false; } vistos.add(c.matricula); return true; });

      // Só cadastra quem ainda não está na lista
      const existentes = new Set(lista.map((c) => String(c.matricula)));
      const novos = unicos.filter((c) => !existentes.has(c.matricula)).map((c) => ({ ...c, setor: '', status: 'Ativo' }));
      const jaExistiam = unicos.length - novos.length;

      let cadastrados = 0;
      const LOTE = 500;
      for (let i = 0; i < novos.length; i += LOTE) {
        const { data, error } = await sb.from(TABELA)
          .upsert(novos.slice(i, i + LOTE), { onConflict: 'matricula', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        cadastrados += (data || []).length;
      }

      await carregar(carregadoPara);

      let texto = cadastrados
        ? cadastrados + ' colaborador(es) novo(s) cadastrado(s) de "' + arquivo.name + '".'
        : 'Nenhum colaborador novo em "' + arquivo.name + '".';
      if (jaExistiam) texto += ' ' + jaExistiam + ' já estava(m) na lista e não foi(ram) alterado(s).';
      if (repetidas) texto += ' ' + repetidas + ' matrícula(s) repetida(s) na planilha contada(s) uma vez só.';
      if (incompletas) texto += ' ' + incompletas + ' linha(s) sem matrícula ou sem nome ignorada(s).';
      texto += ' A planilha não foi guardada, só os dados.';
      mostrarMsg('colab-msg-importar', texto, true);
    } catch (e) {
      const texto = (e && (e.code || /supabase|fetch|jwt/i.test(e.message || '')))
        ? traduzirErro(e)
        : 'Não consegui ler a planilha: ' + ((e && e.message) || 'erro desconhecido') + '.';
      mostrarMsg('colab-msg-importar', texto, false);
    } finally {
      rotulo.classList.remove('ocupado');
      input.value = '';
    }
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    lista = [];
    carregadoPara = null;
    $('colab-linhas').textContent = '';
    $('colab-contagem').textContent = '';
    $('colab-vazio').hidden = true;
    $('colab-busca').value = '';
    $('colab-matricula').value = '';
    $('colab-nome').value = '';
    limparMsgs();
  }

  function quandoSessaoMudar(sessao) {
    const uid = sessao && sessao.user ? sessao.user.id : null;
    if (!uid) { limparTela(); return; }
    if (carregadoPara !== uid) carregar(uid);
  }

  /* ---------------- Início ---------------- */

  if (typeof sb === 'undefined' || !sb) return;

  $('colab-form').addEventListener('submit', adicionar);
  $('colab-busca').addEventListener('input', render);
  $('colab-arquivo').addEventListener('change', importar);

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
