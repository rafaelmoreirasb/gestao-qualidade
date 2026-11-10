/* ==========================================================
   js/colaboradores.js
   Aba Colaboradores: adicionar, listar, mudar status,
   excluir (só para corrigir cadastro errado) e importar planilha.
   Dados guardados: matrícula, nome, CPF, setor e status.
   Importar planilha = sincronizar com a lista de ATIVOS do RH:
   quem é novo entra como Ativo, quem não está na planilha vira
   Desligado, quem voltou é reativado e nome/CPF são atualizados.
   Antes de gravar, mostra um resumo e espera a confirmação.
   A coluna Treinamentos conta de quantos treinamentos do
   Cronograma a pessoa participou (só os marcados como Realizado).
   ========================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const TABELA = 'colaboradores';
  const CAMPOS = 'id, matricula, nome, cpf, setor, status';

  let lista = [];             // colaboradores carregados do banco
  let treinosPorColab = {};   // id do colaborador -> nº de treinamentos realizados
  let carregadoPara = null;   // id do usuário cujos dados estão na tela
  let carregando = false;
  let plano = null;           // resumo da planilha esperando confirmação

  /* ---------------- Ajudantes ---------------- */

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const limparNome = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const limparMatricula = (s) => String(s || '').replace(/\.0+$/, '').replace(/\s+/g, '').trim();
  const ehAtivo = (c) => (c.status || 'Ativo') === 'Ativo';
  const soNumeros = (s) => String(s || '').replace(/\D/g, '');

  // CPF guardado só com os 11 números. Devolve '' se veio vazio
  // e null se veio preenchido mas não dá para ser um CPF.
  // O Excel tira o zero da frente de número: 1234567890 vira 01234567890.
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
    if (code === '23514' && m.includes('cpf')) return 'CPF inválido: precisa ter 11 números.';
    if (code === '42703' || (m.includes('cpf') && (m.includes('column') || m.includes('schema cache')))) {
      return 'A coluna CPF ainda não existe no banco. Rode o arquivo sql/013_colaboradores_cpf.sql no Supabase (SQL Editor).';
    }
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
      !q || semAcento(c.nome).includes(q) || String(c.matricula).toLowerCase().includes(q) || semAcento(c.status).includes(q) ||
      (qNum.length >= 3 && String(c.cpf || '').includes(qNum)));

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
    linha.appendChild(celula('numero col-cpf', formatarCpf(c.cpf)));

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

    // Treinamentos realizados de que a pessoa participou (Cronograma)
    linha.appendChild(celula('direita numero', String(treinosPorColab[c.id] || 0)));

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
    const cpf = limparCpf($('colab-cpf').value);
    if (!matricula || !nome) { mostrarMsg('colab-msg-adicionar', 'Preencha matrícula e nome.', false); return; }
    if (cpf === null || (cpf && soNumeros($('colab-cpf').value).length !== 11)) { mostrarMsg('colab-msg-adicionar', 'CPF inválido: precisa ter 11 números (ou deixe em branco).', false); return; }
    if (lista.some((c) => String(c.matricula) === matricula)) { mostrarMsg('colab-msg-adicionar', 'Essa matrícula já está na lista.', false); return; }

    const botao = $('colab-adicionar');
    botao.disabled = true;
    try {
      const { data, error } = await sb.from(TABELA).insert({ matricula, nome, cpf: cpf || null, setor: '', status: 'Ativo' }).select(CAMPOS).single();
      if (error) throw error;
      lista.push(data);
      $('colab-matricula').value = '';
      $('colab-nome').value = '';
      $('colab-cpf').value = '';
      render();
      mostrarMsg('colab-msg-adicionar', nome + ' adicionado.', true);
      $('colab-matricula').focus();
    } catch (e) {
      mostrarMsg('colab-msg-adicionar', traduzirErro(e), false);
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------------- Importar planilha (sincronizar com o RH) ---------------- */

  // Acha as colunas Matrícula, Nome e CPF e devolve as linhas preenchidas
  function linhasParaColaboradores(linhas) {
    const ehMat = (c) => /matr|chapa/.test(c);
    const ehNome = (c) => /nome|colaborador|funcionario/.test(c);
    const h = linhas.findIndex((r) => r && r.some((c) => ehMat(semAcento(c))) && r.some((c) => ehNome(semAcento(c)) && !ehMat(semAcento(c))));
    if (h < 0) throw new Error('não encontrei as colunas Matrícula e Nome na primeira aba');
    const cab = linhas[h].map(semAcento);
    const iM = cab.findIndex(ehMat);
    const iN = cab.findIndex((c, i) => i !== iM && ehNome(c));
    const iC = cab.findIndex((c, i) => i !== iM && i !== iN && /cpf/.test(c));
    if (iM < 0 || iN < 0) throw new Error('não encontrei as colunas Matrícula e Nome na primeira aba');

    const saida = [];
    let incompletas = 0;
    linhas.slice(h + 1).forEach((r) => {
      if (!r) return;
      const matricula = limparMatricula(r[iM]);
      const nome = limparNome(r[iN]);
      const cpfBruto = iC >= 0 ? r[iC] : '';
      if (!matricula && !nome && !String(cpfBruto || '').trim()) return;   // linha em branco
      if (!matricula || !nome) { incompletas++; return; }
      saida.push({ matricula, nome, cpfBruto });
    });
    return { saida, incompletas, temCpf: iC >= 0 };
  }

  // Compara a planilha com a lista atual. Não grava nada.
  function montarPlano(nomeArquivo, lidas) {
    const { saida, incompletas, temCpf } = lidas;

    // Matrícula repetida dentro da própria planilha conta uma vez só
    const vistos = new Set();
    let repetidas = 0;
    const unicos = saida.filter((c) => { if (vistos.has(c.matricula)) { repetidas++; return false; } vistos.add(c.matricula); return true; });

    const porMatricula = new Map(lista.map((c) => [String(c.matricula), c]));
    const novos = [], readmitidos = [], atualizados = [];
    let semMudanca = 0, cpfInvalidos = 0;

    unicos.forEach((u) => {
      const ex = porMatricula.get(u.matricula);
      let cpf = limparCpf(u.cpfBruto);
      if (cpf === null) cpfInvalidos++;
      // CPF vazio ou inválido na planilha não apaga o CPF que já estava guardado
      if (!cpf) cpf = (ex && ex.cpf) || null;
      const item = { matricula: u.matricula, nome: u.nome, cpf };
      if (!ex) novos.push(item);
      else if (!ehAtivo(ex)) readmitidos.push({ ...item, antes: ex });
      else if (ex.nome !== u.nome || (ex.cpf || null) !== cpf) atualizados.push({ ...item, antes: ex });
      else semMudanca++;
    });

    const desligar = lista.filter((c) => ehAtivo(c) && !vistos.has(String(c.matricula)));
    const ativosAgora = lista.filter(ehAtivo).length;
    const alerta = ativosAgora > 0 && desligar.length > ativosAgora * 0.2;

    return { nomeArquivo, novos, readmitidos, atualizados, desligar, semMudanca, cpfInvalidos, repetidas, incompletas, temCpf, ativosAgora, alerta, total: unicos.length };
  }

  function fecharResumo() {
    plano = null;
    const caixa = $('colab-sinc');
    if (!caixa) return;
    caixa.hidden = true;
    $('colab-sinc-itens').textContent = '';
    $('colab-sinc-alerta').hidden = true;
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
    const LIMITE = 200;
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

  function mostrarResumo(p) {
    const caixa = $('colab-sinc');
    const itens = $('colab-sinc-itens');
    itens.textContent = '';
    $('colab-sinc-titulo').textContent = 'Resumo de "' + p.nomeArquivo + '" · ' + p.total + ' pessoa(s) na planilha';

    const ident = (x) => x.nome + ' · matrícula ' + x.matricula + (x.cpf ? ' · CPF ' + formatarCpf(x.cpf) : '');
    const mudou = (x) => {
      const partes = [];
      if (x.antes.nome !== x.nome) partes.push('nome: ' + x.antes.nome + ' → ' + x.nome);
      if ((x.antes.cpf || null) !== x.cpf) partes.push('CPF: ' + formatarCpf(x.antes.cpf) + ' → ' + formatarCpf(x.cpf));
      return x.nome + ' · matrícula ' + x.matricula + (partes.length ? ' (' + partes.join('; ') + ')' : '');
    };

    itens.appendChild(grupoResumo('sinc-novo', p.novos.length, 'novo(s) · serão cadastrados como Ativo', p.novos, ident));
    itens.appendChild(grupoResumo('sinc-deslig', p.desligar.length, 'não estão na planilha · serão marcados como Desligado', p.desligar,
      (x) => x.nome + ' · matrícula ' + x.matricula));
    itens.appendChild(grupoResumo('sinc-volta', p.readmitidos.length, 'estavam Desligados e voltaram · serão reativados', p.readmitidos, ident));
    itens.appendChild(grupoResumo('sinc-atual', p.atualizados.length, 'com nome ou CPF diferente · serão atualizados com o da planilha', p.atualizados, mudou));

    const fim = document.createElement('div');
    fim.className = 'sinc-grupo sinc-zero';
    const extras = [p.semMudanca + ' sem mudança'];
    if (p.repetidas) extras.push(p.repetidas + ' matrícula(s) repetida(s) na planilha contada(s) uma vez só');
    if (p.incompletas) extras.push(p.incompletas + ' linha(s) sem matrícula ou sem nome ignorada(s)');
    if (p.cpfInvalidos) extras.push(p.cpfInvalidos + ' CPF(s) inválido(s) na planilha ignorado(s) (o CPF guardado não muda)');
    if (!p.temCpf) extras.push('a planilha não tem coluna CPF; os CPFs guardados não mudam');
    fim.textContent = extras.join(' · ') + '.';
    itens.appendChild(fim);

    const alerta = $('colab-sinc-alerta');
    if (p.alerta) {
      const pct = Math.round((p.desligar.length / p.ativosAgora) * 100);
      alerta.textContent = 'Atenção: ' + p.desligar.length + ' de ' + p.ativosAgora + ' ativos (' + pct + '%) seriam marcados como Desligado. ' +
        'Confira se esta é a planilha completa de ativos antes de confirmar.';
      alerta.hidden = false;
    } else {
      alerta.hidden = true;
    }

    const nadaMuda = !p.novos.length && !p.desligar.length && !p.readmitidos.length && !p.atualizados.length;
    $('colab-sinc-confirmar').hidden = nadaMuda;
    $('colab-sinc-confirmar').disabled = false;
    $('colab-sinc-cancelar').textContent = nadaMuda ? 'Fechar' : 'Cancelar';
    caixa.hidden = false;
    if (nadaMuda) mostrarMsg('colab-msg-importar', 'A lista já está igual à planilha. Nada para atualizar.', true);
    else mostrarMsg('colab-msg-importar', 'Confira o resumo e clique em "Confirmar atualização". Nada foi gravado ainda.', true);
  }

  async function importar(ev) {
    const input = ev.target;
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    const rotulo = $('colab-arquivo-rotulo');
    fecharResumo();
    mostrarMsg('colab-msg-importar', '');

    if (!carregadoPara) {
      mostrarMsg('colab-msg-importar', 'A lista ainda não carregou. Espere um instante e tente de novo.', false);
      input.value = '';
      return;
    }

    rotulo.classList.add('ocupado');
    mostrarMsg('colab-msg-importar', 'Lendo "' + arquivo.name + '"…', true);
    try {
      const lidas = linhasParaColaboradores(await lerPlanilha(arquivo));
      if (!lidas.saida.length) throw new Error('nenhuma linha com matrícula e nome');
      plano = montarPlano(arquivo.name, lidas);
      mostrarResumo(plano);
    } catch (e) {
      fecharResumo();
      mostrarMsg('colab-msg-importar', 'Não consegui ler a planilha: ' + ((e && e.message) || 'erro desconhecido') + '. Nada foi alterado.', false);
    } finally {
      rotulo.classList.remove('ocupado');
      input.value = '';
    }
  }

  async function confirmarSincronizar() {
    const p = plano;
    if (!p) return;
    const botao = $('colab-sinc-confirmar');
    const rotulo = $('colab-arquivo-rotulo');
    botao.disabled = true;
    $('colab-sinc-cancelar').disabled = true;
    rotulo.classList.add('ocupado');
    mostrarMsg('colab-msg-importar', 'Gravando…', true);

    let gravados = 0, desligados = 0;
    try {
      // 1) Novos, reativados e atualizados: grava pela matrícula (status Ativo)
      const gravar = p.novos.concat(p.readmitidos, p.atualizados)
        .map((x) => ({ matricula: x.matricula, nome: x.nome, cpf: x.cpf || null, status: 'Ativo' }));
      const LOTE = 500;
      for (let i = 0; i < gravar.length; i += LOTE) {
        const { data, error } = await sb.from(TABELA)
          .upsert(gravar.slice(i, i + LOTE), { onConflict: 'matricula' })
          .select('id');
        if (error) throw error;
        gravados += (data || []).length;
      }

      // 2) Quem não está na planilha vira Desligado (ninguém é excluído)
      const ids = p.desligar.map((c) => c.id);
      const LOTE_ID = 200;
      for (let i = 0; i < ids.length; i += LOTE_ID) {
        const { data, error } = await sb.from(TABELA)
          .update({ status: 'Desligado' })
          .in('id', ids.slice(i, i + LOTE_ID))
          .select('id');
        if (error) throw error;
        desligados += (data || []).length;
      }

      fecharResumo();
      await carregar(carregadoPara);

      const partes = [];
      if (p.novos.length) partes.push(p.novos.length + ' novo(s) cadastrado(s)');
      if (desligados) partes.push(desligados + ' marcado(s) como Desligado');
      if (p.readmitidos.length) partes.push(p.readmitidos.length + ' reativado(s)');
      if (p.atualizados.length) partes.push(p.atualizados.length + ' atualizado(s)');
      mostrarMsg('colab-msg-importar', 'Lista atualizada com "' + p.nomeArquivo + '": ' + partes.join(', ') + '. Ninguém foi excluído e o histórico continua registrado. A planilha não foi guardada, só os dados.', true);
    } catch (e) {
      fecharResumo();
      await carregar(carregadoPara);
      const feito = (gravados || desligados) ? ' Parte já foi gravada (' + gravados + ' gravado(s), ' + desligados + ' desligado(s)); escolha a planilha de novo para terminar.' : ' Nada foi alterado.';
      mostrarMsg('colab-msg-importar', traduzirErro(e) + feito, false);
    } finally {
      $('colab-sinc-cancelar').disabled = false;
      rotulo.classList.remove('ocupado');
    }
  }

  /* ---------------- Login / saída ---------------- */

  function limparTela() {
    lista = [];
    treinosPorColab = {};
    carregadoPara = null;
    $('colab-linhas').textContent = '';
    $('colab-contagem').textContent = '';
    $('colab-vazio').hidden = true;
    $('colab-busca').value = '';
    $('colab-matricula').value = '';
    $('colab-nome').value = '';
    $('colab-cpf').value = '';
    fecharResumo();
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
  $('colab-sinc-confirmar').addEventListener('click', confirmarSincronizar);
  $('colab-sinc-cancelar').addEventListener('click', () => {
    const tinhaMudanca = !$('colab-sinc-confirmar').hidden;
    fecharResumo();
    mostrarMsg('colab-msg-importar', tinhaMudanca ? 'Importação cancelada. Nada foi alterado.' : '', true);
  });

  // Ao abrir a aba, atualiza a contagem de treinamentos (ex.: participante marcado agora no Cronograma)
  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'colaboradores' && carregadoPara && !carregando) carregarTreinos();
  });

  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => quandoSessaoMudar(sessao), 0);
  });
})();
