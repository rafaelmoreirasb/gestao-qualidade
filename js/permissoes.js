/* ==========================================================
   js/permissoes.js
   Aba Permissões (Fase 11) · só o Administrador vê.
   Uma linha por conta (tabela pel_perfis) e uma coluna por aba do app.
   - Papel: Pendente, Usuário, Analista, Gestão, Administrador, Bloqueado.
   - Em cada aba: — (sem acesso), Ver (só consulta) ou Editar.
   Tudo salva na hora. O banco confere as mesmas regras (sql/017).
   A PEL continua decidida pelo papel (Analista e Gestão entram nela).
   ========================================================== */

(function () {
  const sb = window.gqSb;

  const PAPEIS = { pendente: 'Pendente', usuario: 'Usuário', analista: 'Analista', gestao: 'Gestão', admin: 'Administrador', bloqueado: 'Bloqueado' };
  const ABAS = [
    ['painel', 'Painel'], ['gemba', 'Gemba'], ['faltantes', 'Faltantes'], ['responsaveis', 'Responsáveis por ilha'], ['pokayoke', 'Poka-Yoke'],
    ['eficacia', 'Eficácia'], ['cronograma', 'Cronograma'], ['planoacao', 'Plano de ação'], ['colaboradores', 'Colaboradores'],
  ];
  const NIVEIS = [['', '—'], ['ver', 'Ver'], ['editar', 'Editar']];

  let perfis = [];
  let sites = [];
  let filtro = '';
  let busca = '';
  let euId = null;
  let carregou = false;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const abasDe = (p) => (p && p.abas && typeof p.abas === 'object' ? p.abas : {});

  function dataCurta(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
  }

  function mensagem(txt, erro) {
    const el = $('perm-msg');
    if (!txt) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = txt;
    el.className = 'mensagem ' + (erro ? 'mensagem-erro' : 'mensagem-ok');
  }

  function siteTexto(codigo) {
    if (!codigo) return '<span class="perm-apagado">Sem site</span>';
    const s = sites.find((x) => x.codigo === codigo);
    return '<b>' + esc(codigo) + '</b>' + (s && s.nome ? '<small>' + esc(s.nome) + '</small>' : '');
  }

  function desenharCabecalho() {
    $('perm-cabecalho').innerHTML =
      '<tr><th class="perm-col-nome">Nome / e-mail</th><th>Site</th><th>Criada em</th><th class="perm-col-papel">Papel</th>' +
      ABAS.map(([, n]) => '<th class="perm-col-aba">' + esc(n) + '</th>').join('') +
      '<th class="perm-col-aba">PEL</th></tr>';
  }

  function celulaAba(p, aba) {
    if (p.papel === 'admin') return '<td class="perm-aba perm-todas">Editar</td>';
    const v = abasDe(p)[aba];
    const nivel = v === 'ver' || v === 'editar' ? v : '';
    const travado = p.papel === 'bloqueado';
    return '<td class="perm-aba"><select class="perm-nivel perm-' + (nivel || 'sem') + '" data-aba="' + aba + '" aria-label="' +
      esc(ABAS.find((a) => a[0] === aba)[1]) + ' de ' + esc(p.email) + '"' + (travado ? ' disabled' : '') + '>' +
      NIVEIS.map(([k, r]) => '<option value="' + k + '"' + (k === nivel ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td>';
  }

  function celulaPel(p) {
    const entra = p.papel === 'admin' || p.papel === 'analista' || p.papel === 'gestao';
    return '<td class="perm-aba ' + (entra ? 'perm-todas' : 'perm-apagado') + '" title="A PEL é decidida pelo papel">' + (entra ? 'Pelo papel' : '—') + '</td>';
  }

  function desenhar() {
    const q = semAcento(busca).trim();
    const lista = perfis.filter((p) => (!filtro || p.papel === filtro) &&
      (!q || semAcento((p.nome || '') + ' ' + (p.email || '')).includes(q)));

    const nPend = perfis.filter((p) => p.papel === 'pendente').length;
    $('perm-n-pendente').textContent = nPend ? nPend : '';
    $('perm-contagem').textContent = perfis.length ? perfis.length + (perfis.length === 1 ? ' conta' : ' contas') : '';

    if (!lista.length) {
      $('perm-linhas').innerHTML = '<tr><td colspan="' + (ABAS.length + 5) + '" class="perm-vazio">Nenhuma conta ' +
        (filtro || q ? 'com este filtro.' : 'ainda.') + '</td></tr>';
      return;
    }
    $('perm-linhas').innerHTML = lista.map((p) => {
      const eu = p.user_id === euId;
      const classes = ['perm-linha', 'perm-papel-' + p.papel];
      return '<tr class="' + classes.join(' ') + '" data-id="' + esc(p.user_id) + '">' +
        '<td class="perm-col-nome"><b>' + esc(p.nome || '—') + '</b>' + (eu ? ' <span class="perm-apagado">(você)</span>' : '') +
        '<small>' + esc(p.email) + '</small></td>' +
        '<td class="perm-site">' + siteTexto(p.site) + '</td>' +
        '<td class="perm-data">' + dataCurta(p.criado_em) + '</td>' +
        '<td class="perm-col-papel"><select class="perm-papel perm-papel-sel-' + p.papel + '" aria-label="Papel de ' + esc(p.email) + '"' + (eu ? ' disabled title="Você não pode mudar o próprio papel"' : '') + '>' +
        Object.keys(PAPEIS).map((k) => '<option value="' + k + '"' + (k === p.papel ? ' selected' : '') + '>' + PAPEIS[k] + '</option>').join('') +
        '</select></td>' +
        ABAS.map(([k]) => celulaAba(p, k)).join('') +
        celulaPel(p) +
        '</tr>';
    }).join('');
  }

  async function carregar() {
    $('perm-linhas').innerHTML = '<tr><td colspan="' + (ABAS.length + 5) + '" class="perm-vazio">Carregando…</td></tr>';
    mensagem('');
    const [rp, rs] = await Promise.all([
      sb.from('pel_perfis').select('*').order('criado_em', { ascending: false }),
      sb.from('pel_sites').select('codigo,nome,regional'),
    ]);
    if (rp.error) {
      $('perm-linhas').innerHTML = '<tr><td colspan="' + (ABAS.length + 5) + '" class="perm-vazio">Não foi possível carregar as contas.</td></tr>';
      return;
    }
    perfis = rp.data || [];
    sites = (rs && rs.data) || [];
    carregou = true;
    desenhar();
  }

  function nomeDe(p) { return p.nome || p.email; }

  async function salvarPapel(p, valor, sel) {
    const antes = p.papel;
    sel.disabled = true;
    mensagem('Salvando…');
    const { error } = await sb.from('pel_perfis').update({ papel: valor }).eq('user_id', p.user_id);
    if (error) {
      mensagem('Não foi possível salvar o papel. ' + (error.message || ''), true);
      p.papel = antes;
      desenhar();
      return;
    }
    p.papel = valor;
    let txt = nomeDe(p) + ': papel ' + PAPEIS[valor] + ' salvo.';
    if (valor === 'analista' && !p.site) txt += ' Atenção: esta conta não tem site, então o Analista ainda não consegue entrar.';
    if (valor === 'usuario' && !Object.keys(abasDe(p)).length) txt += ' Agora escolha, nas colunas das abas, o que essa conta pode ver ou editar.';
    if (valor === 'bloqueado') txt += ' A conta não entra mais no app (as abas marcadas ficam guardadas).';
    mensagem(txt);
    desenhar();
  }

  async function salvarAba(p, aba, valor, sel) {
    const novo = Object.assign({}, abasDe(p));
    if (valor) novo[aba] = valor; else delete novo[aba];
    sel.disabled = true;
    mensagem('Salvando…');
    const { error } = await sb.from('pel_perfis').update({ abas: novo }).eq('user_id', p.user_id);
    if (error) {
      const m = String(error.message || '');
      mensagem(/abas/.test(m) ? 'Falta atualizar o banco: rode o arquivo sql/017_permissoes_por_aba.sql no Supabase.' : 'Não foi possível salvar. ' + m, true);
      desenhar();
      return;
    }
    p.abas = novo;
    const nomeAba = ABAS.find((a) => a[0] === aba)[1];
    let txt = nomeDe(p) + ': ' + nomeAba + ' = ' + (valor === 'editar' ? 'Editar' : valor === 'ver' ? 'Ver' : 'sem acesso') + '. Vale quando a pessoa recarregar a página.';
    if (p.papel === 'pendente') txt += ' Atenção: o papel ainda é Pendente; troque para Usuário (ou Analista/Gestão) para a pessoa entrar.';
    mensagem(txt);
    desenhar();
  }

  // ---------- Eventos ----------
  $('perm-filtros').addEventListener('click', (e) => {
    const b = e.target.closest('.perm-chip');
    if (!b) return;
    filtro = b.dataset.f;
    document.querySelectorAll('#perm-filtros .perm-chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    desenhar();
  });

  $('perm-busca').addEventListener('input', (e) => { busca = e.target.value; desenhar(); });

  $('perm-linhas').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const p = perfis.find((x) => x.user_id === tr.dataset.id);
    if (!p) return;
    if (e.target.classList.contains('perm-papel')) salvarPapel(p, e.target.value, e.target);
    else if (e.target.classList.contains('perm-nivel')) salvarAba(p, e.target.dataset.aba, e.target.value, e.target);
  });

  desenharCabecalho();

  document.addEventListener('gq:perfil', (ev) => {
    const d = ev.detail || {};
    euId = d.usuario ? d.usuario.id : null;
    if (!d.perfil) { perfis = []; carregou = false; $('perm-linhas').innerHTML = ''; }
  });

  document.addEventListener('gq:aba', (ev) => {
    if (ev.detail && ev.detail.aba === 'permissoes') carregar();
  });

  // Se a página abriu direto em #permissoes antes deste arquivo carregar
  if (location.hash === '#permissoes' && !carregou && typeof window.gqNivelAba === 'function' && window.gqNivelAba('permissoes')) carregar();
})();
