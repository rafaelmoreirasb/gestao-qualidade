/* ==========================================================
   api/_lib/nucleo.js
   FALTANTE ADUANA — lógica do servidor (lê e grava a planilha do Google Sheets).
   É o antigo Painel.gs (Apps Script) passado para Node: mesma janela de 36 h a partir do sorting,
   mesma leitura só dos dias D..D+2, mesmas regras, resumo diário, responsáveis e Volumoso × Sorting.

   criarNucleo({ planilha, cache, regras, usuario })
     planilha: adaptador assíncrono (ver sheets.js): existe, ler, atualizar, anexar, limpar, criarAba, url
     cache:    { ler(chave), gravar(chave, valor, segundos) } — tabela faltantes_cache no Supabase
     regras:   texto de js/faltantes-regras.js (o MESMO arquivo que a tela usa)
     usuario:  e-mail de quem está logado (vai em "Quem classificou" / "Quem preencheu")
   ========================================================== */

const CFG = {
  JANELA_HORAS: 36,   // linha do tempo: 1º bipe do pacote no Histórico (sorting) no dia + 36 h
  DIAS_LEITURA: 3,    // lê o dia analisado e os 2 seguintes
  CACHE_SEG: 6 * 3600,      // dia antigo: guardado 6 h
  CACHE_RECENTE_SEG: 600,   // dia dos últimos 4 dias (ainda recebe bipes): 10 min
  DIAS_RECENTES: 4,
  DIAS_CACHE_SEG: 300,      // lista de dias: 5 min
  PREPARAR_DIAS: 3,         // quando a planilha avisa que recebeu dados, recalcula os 3 dias mais recentes
  PREPARAR_TEMPO_MS: 40000, // ... sem passar de 40 s (o Vercel corta em 60)
  JUNTAR_BLOCOS: 300,       // blocos de linhas do mesmo dia com menos de 300 linhas entre eles são lidos juntos
  ABA_MANUAL: 'Classificação manual',
  ABA_REGRAS: 'Regras',
  ABA_RESUMO: 'Resumo diário',
  ABA_RESPONSAVEIS: 'Responsáveis',
  ABA_ONE_BIPE: 'One Bipe',
  ABA_COLABORADORES: 'Colaboradores',
  ABA_LOG: 'Log importação',
};

/* Cada aba que entra na linha do tempo. "data" é a coluna usada para achar as linhas dos dias. */
const FONTES = {
  historico: { aba: 'Histórico', id: 'IdPacote', data: 'Data', hora: 'Horas',
    colunas: ['Data', 'Horas', 'IdPacote', 'SubStatus', 'UserID', 'Processo', 'Ext', 'Origem'],
    texto: (g) => juntar(g('Processo'), g('SubStatus'), g('Ext') || g('UserID'), g('Origem') && 'origem ' + g('Origem')) },
  carrinho: { aba: 'Auditoria de Carrinho', id: 'Shipment ID', data: 'Data', hora: 'Hora',
    colunas: ['Shipment ID', 'Data', 'Hora', 'Gaiola', 'Estado', 'Rep auditoria', 'Tipo'],
    texto: (g) => juntar(g('Gaiola') && 'gaiola ' + g('Gaiola'), g('Estado'), g('Rep auditoria')) },
  aduana: { aba: 'Aduana', id: 'Shipment ID', data: 'Data auditoria', hora: 'Hora',
    colunas: ['Shipment ID', 'Placa', 'Data auditoria', 'Hora', 'ID da rota', 'Estado', 'Rep auditoria', 'Tipo do pacote'],
    texto: (g) => juntar(g('ID da rota'), g('Estado'), g('Rep auditoria'), g('Placa') && 'placa ' + g('Placa')) },
  ps: { aba: 'Problem Solving', id: 'ID do pacote', data: 'Data', hora: 'Hora',
    colunas: ['ID do pacote', 'Problema', 'Estado', 'Problem Solver', 'Hora', 'Data', 'Resolução', 'Status de resolução',
      'Origem de dano', 'Motivo', 'Tipo de dano', 'Tipo de caso', 'Rota sugerida', 'Motivo da exclusão', 'ID do caso'],
    texto: (g) => juntar(g('Problema'), g('Estado'), g('Resolução'), g('Status de resolução'), g('Motivo'),
      g('Rota sugerida') && 'rota sugerida ' + g('Rota sugerida'), g('Problem Solver')) },
  // Desde 17/11/2026: aba "Base Inventário" (CSV importado pelo Apps Script da Base SSP53), não mais o espelho "Inventário"
  inventario: { aba: 'Base Inventário', id: 'Pacote', data: 'Data', hora: 'Hora',
    colunas: ['Pacote', 'Situação', 'Área', 'Operador', 'Comentário', 'Data', 'Hora'],
    texto: (g) => juntar(g('Situação'), g('Área'), g('Operador'), g('Comentário')) },
  torre: { aba: 'Torre Aduana', id: 'Shipment ID', data: 'Concluido em', hora: null,
    colunas: ['Shipment ID', 'Estado aduana', 'Rota', 'Gaiola (rota otim,)', 'Doca', 'Estado carrinho', 'Hora aduana', 'Auditor aduana',
      'Classificacao', 'Situacao', 'Status tratativa', 'Tratativa - responsavel/obs', 'Concluido em'],
    texto: (g) => juntar(g('Estado aduana'), g('Gaiola (rota otim,)'), g('Classificacao'), g('Status tratativa'), g('Tratativa - responsavel/obs')) },
  direcionamento: { aba: 'Direcionamento Manual', id: 'ID DO PRODUTO', data: null, hora: null, quando: 'Carimbo de data/hora',
    colunas: ['Carimbo de data/hora', 'ID DO PRODUTO', 'STATUS', 'REDIRECIONAMENTO', 'ROTA', 'CICLO'],
    texto: (g) => juntar(g('STATUS'), g('REDIRECIONAMENTO') && 'redirecionamento ' + g('REDIRECIONAMENTO'), g('ROTA')) },
};

const CAB_REGRAS = ['Ordem', 'Código', 'Ligada', 'Pergunta (se SIM, o pacote para aqui)', 'Resultado', 'Observação', 'Abas usadas'];
const CAB_MANUAL = ['Data', 'Shipment ID', 'Classificação', 'Raciocínio', 'Quem classificou', 'Regra conferida'];
const CAB_RESUMO = ['Dia', 'Shipment ID', 'Rota', 'Ilha', 'Rep aduana', 'Resultado da regra', 'Código da regra', 'Teve sorting', 'Atualizado em'];
const CAB_RESP = ['Data', 'Ilha', 'Responsável', 'Quem preencheu', 'Atualizado em'];
const REGRAS_INICIAIS = [
  ['1', 'R01', 'Sim', 'Bipado no Histórico e encontrado na Torre A MAIS em outra rota?', 'Erro de Conteinerização', '', 'Histórico, Torre Aduana, Aduana'],
  ['2', 'R02', 'Sim', 'Bipado no Histórico e bipado no Direcionamento Manual (qualquer resultado na auditoria de carrinho, torre ou aduana)?', '(coluna STATUS do Direcionamento Manual)', 'O resultado mostrado é o STATUS do Direcionamento', 'Histórico, Direcionamento Manual'],
  ['3', 'R03', 'Sim', 'Bipado no Histórico, faltante na Aduana e na Torre, e logo depois Verificado no Inventário?', 'Erro de Conteinerização', '', 'Histórico, Aduana, Torre Aduana, Inventário'],
  ['4', 'R04', 'Sim', 'Bipado no Histórico, faltante na Aduana e na Torre, e depois Problem Solving: pacote avariado / não reparado?', 'Pacote Avariado', 'Com ou sem auditoria de carrinho', 'Histórico, Aduana, Torre Aduana, Problem Solving'],
  ['5', 'R05', 'Sim', 'Bipado no Histórico, Pendente/Faltante ou não bipado na auditoria de carrinho, Faltante na Aduana na rota de origem e A MAIS na Aduana em outra rota?', 'Erro de Conteinerização', '', 'Histórico, Auditoria de Carrinho, Aduana'],
  ['6', 'R06', 'Sim', 'Bipado no Histórico, Pendente/Faltante ou não bipado na auditoria de carrinho, Faltante na Aduana e logo em seguida Verificado no Inventário (com ou sem Faltante na Torre)?', 'Erro de Conteinerização', '', 'Histórico, Auditoria de Carrinho, Aduana, Torre Aduana, Inventário'],
];

/* ---------- ajudantes ---------- */
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function juntar(...p) { return p.filter((x) => x && String(x).trim() && String(x).trim() !== '-').join(' · '); }
const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
const somaDias = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
const letra = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }; // 0 → A

/** "05/11/2026" (+ "7:33:31") → Date (horário de Brasília: o servidor roda com TZ=America/Sao_Paulo). */
function lerDataHora(data, hora) {
  const m = String(data || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  let h = m[4], mi = m[5], s = m[6];
  const t = String(hora || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (t) { h = t[1]; mi = t[2]; s = t[3]; }
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(ano, Number(m[2]) - 1, Number(m[1]), Number(h || 0), Number(mi || 0), Number(s || 0));
}
function diaDe(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return '';
  return pad(m[1]) + '/' + pad(m[2]) + '/' + (m[3].length === 2 ? '20' + m[3] : m[3]);
}
function ilhaDe(rota) { const m = String(rota || '').trim().toUpperCase().match(/^([A-Z]+)\d/); return m ? m[1] : ''; }
const agoraTxt = () => dmy(new Date()) + ' ' + new Date().toTimeString().slice(0, 8);
const cel = (v) => (v == null ? '' : String(v));

function criarNucleo({ planilha, cache, regras: codigoRegras, usuario }) {
  const P = planilha;
  const quem = usuario || '(painel)';
  const memo = {}; // dentro de uma mesma chamada, não lê a mesma coisa duas vezes

  /* ---------- leitura ---------- */
  async function cabecalho(aba) {
    return ((await P.ler(aba, '1:1'))[0] || []).map((c) => cel(c).trim());
  }
  /** Linhas a partir da 2ª, nCols colunas (A..), com células vazias preenchidas com ''. */
  async function lerTudo(aba, nCols) {
    const v = await P.ler(aba, 'A2:' + letra(nCols - 1));
    return v.map((r) => Array.from({ length: nCols }, (_, j) => cel(r[j])));
  }

  /** Lê uma aba devolvendo só as colunas pedidas (pelo nome do cabeçalho) e, se der, só as linhas dos dias pedidos. */
  async function lerAba(fonte, dias) {
    const f = FONTES[fonte];
    if (!(await P.existe(f.aba))) return { linhas: [], aviso: 'Aba "' + f.aba + '" não existe.' };
    const cab = await cabecalho(f.aba);
    const idx = {};
    cab.forEach((c, i) => { const k = norm(c); if (c && !(k in idx)) idx[k] = i; });
    if (!(norm(f.id) in idx)) return { linhas: [], aviso: 'Aba "' + f.aba + '": não achei a coluna "' + f.id + '".' };
    const usar = f.colunas.filter((c) => norm(c) in idx);
    const menor = Math.min(...usar.map((c) => idx[norm(c)])), maior = Math.max(...usar.map((c) => idx[norm(c)]));
    const C1 = letra(menor), C2 = letra(maior);
    const paraObj = (r) => { const o = {}; usar.forEach((c) => { o[c] = cel(r[idx[norm(c)] - menor]).trim(); }); return o; };

    // Sem filtro de dia: lê a aba inteira (só as colunas usadas)
    if (!(f.data && dias && norm(f.data) in idx)) return { linhas: (await P.ler(f.aba, C1 + '2:' + C2)).map(paraObj) };

    // Com filtro: lê só a coluna de data e depois SÓ os blocos de linhas desses dias. As linhas da planilha não estão
    // em ordem de data (cada importação vai para o fim), então o mesmo dia pode estar em vários pedaços da aba.
    const alvo = new Set(dias.map(dmy));
    const L = letra(idx[norm(f.data)]);
    const col = await P.ler(f.aba, L + '2:' + L);
    const blocos = []; // [linhaInicial, linhaFinal] da planilha
    for (let i = 0; i < col.length; i++) {
      if (!alvo.has(diaDe((col[i] || [])[0]))) continue;
      const lin = i + 2, ult = blocos[blocos.length - 1];
      if (ult && lin - ult[1] <= CFG.JUNTAR_BLOCOS) ult[1] = lin; else blocos.push([lin, lin]);
    }
    if (!blocos.length) return { linhas: [] };
    const faixas = blocos.map(([a, b]) => C1 + a + ':' + C2 + b);
    const tabelas = P.lerVarios ? await P.lerVarios(f.aba, faixas) : await Promise.all(faixas.map((x) => P.ler(f.aba, x)));
    const linhas = [];
    tabelas.forEach((t) => t.forEach((r) => linhas.push(paraObj(r))));
    return { linhas };
  }

  /* ---------- listas e dados do dia ---------- */
  async function listarDias(forcar) {
    if (!forcar) { const c = await cache.ler('dias'); if (c) return c; }
    const { linhas } = await lerAba('aduana', null);
    const cont = {};
    for (const o of linhas) if (norm(o['Estado']) === 'faltante') { const d = diaDe(o['Data auditoria']); if (d) cont[d] = (cont[d] || 0) + 1; }
    const dias = Object.keys(cont).map((d) => ({ dia: d, n: cont[d], t: lerDataHora(d).getTime() })).sort((a, b) => b.t - a.t);
    await cache.gravar('dias', dias, CFG.DIAS_CACHE_SEG);
    return dias;
  }

  async function dadosDoDia(dia, forcar) {
    const D = lerDataHora(dia);
    if (!D) throw new Error('Dia inválido: ' + dia);
    const chave = 'dia:' + dia;
    if (!forcar) { const c = await cache.ler(chave); if (c) return c; }
    const inicioProc = Date.now();
    const dias = Array.from({ length: CFG.DIAS_LEITURA }, (_, i) => somaDias(D, i));

    // 1) faltantes do dia na Aduana
    const ad = await lerAba('aduana', dias);
    const falt = new Map();
    for (const o of ad.linhas) {
      if (norm(o['Estado']) !== 'faltante' || diaDe(o['Data auditoria']) !== dia) continue;
      const id = String(o['Shipment ID']).trim();
      if (!id) continue;
      if (!falt.has(id)) falt.set(id, { aduana: o, vezes: 0 });
      falt.get(id).vezes++;
    }

    // 2) registros desses pacotes em todas as abas (as abas são lidas ao mesmo tempo)
    const avisos = [];
    const eventos = new Map([...falt.keys()].map((id) => [id, []]));
    const nomes = Object.keys(FONTES);
    const lidas = await Promise.all(nomes.map((fonte) => (fonte === 'aduana' ? ad : lerAba(fonte, FONTES[fonte].data ? dias : null))));
    nomes.forEach((fonte, k) => {
      const f = FONTES[fonte], r = lidas[k];
      if (r.aviso) avisos.push(r.aviso);
      for (const o of r.linhas) {
        const id = String(o[f.id] || '').trim();
        if (!eventos.has(id)) continue;
        const g = (x) => String(o[x] == null ? '' : o[x]).trim();
        const quando = f.quando ? lerDataHora(g(f.quando)) : lerDataHora(g(f.data), f.hora ? g(f.hora) : '');
        if (!quando) continue;
        const texto = f.texto(g);
        eventos.get(id).push({ t: quando.getTime(), fonte, texto, dados: o, chave: fonte + '|' + quando.getTime() + '|' + texto });
      }
    });

    // 3) janela: começa no sorting — 1º bipe do pacote no dia no Histórico (qualquer processo) + 36 h
    const pacotes = [];
    for (const [id, x] of falt) {
      const vistos = {};
      const todos = eventos.get(id).sort((a, b) => a.t - b.t).filter((e) => (vistos[e.chave] ? false : (vistos[e.chave] = true)));
      const sort = todos.find((e) => e.fonte === 'historico' && dmy(new Date(e.t)) === dia);
      const inicio = sort ? sort.t : D.getTime();
      const fim = inicio + CFG.JANELA_HORAS * 3600 * 1000;
      pacotes.push({
        id, dia, aduana: x.aduana, vezesFaltante: x.vezes, temSorting: !!sort, ancora: sort ? sort.chave : null,
        inicio, fim, janelaFechada: Date.now() > fim, eventos: todos.filter((e) => e.t >= inicio && e.t <= fim),
        rota: x.aduana['ID da rota'] || '', horaAduana: x.aduana['Hora'] || '', rep: x.aduana['Rep auditoria'] || '',
      });
    }
    const out = { dia, geradoEm: Date.now(), segundos: Math.round((Date.now() - inicioProc) / 100) / 10, pacotes, avisos };
    const recente = Date.now() - D.getTime() < CFG.DIAS_RECENTES * 86400000;
    await cache.gravar(chave, out, recente ? CFG.CACHE_RECENTE_SEG : CFG.CACHE_SEG);
    // Resumo diário (base de semana/mês): regravado sempre que o dia é recalculado
    try { await gravarResumoDias({ [dia]: await linhasResumo(dia, out) }); } catch (e) { out.avisos.push('Resumo diário não foi atualizado: ' + e.message); }
    return out;
  }

  /* ---------- a planilha avisou que recebeu dados novos ---------- */
  /** Recalcula a lista de dias e os dias mais recentes (enquanto houver tempo) e grava a "versão" que a tela confere. */
  async function prepararRecentes(origem) {
    const t0 = Date.now();
    const dias = await listarDias(true);
    const feitos = [];
    for (const d of dias.slice(0, CFG.PREPARAR_DIAS)) {
      if (feitos.length && Date.now() - t0 > CFG.PREPARAR_TEMPO_MS) break;
      await dadosDoDia(d.dia, true);
      feitos.push(d.dia);
    }
    const versao = { geradoEm: Date.now(), dias: feitos, origem: String(origem || ''), segundos: Math.round((Date.now() - t0) / 100) / 10 };
    await cache.gravar('versao', versao, 7 * 86400);
    return versao;
  }

  /* ---------- aba Regras ---------- */
  async function lerRegras() {
    if (memo.regras !== undefined) return memo.regras;
    if (!(await P.existe(CFG.ABA_REGRAS))) return (memo.regras = null);
    const v = await P.ler(CFG.ABA_REGRAS, 'A1:Z');
    if (v.length < 2) return (memo.regras = []);
    const idx = {};
    (v[0] || []).forEach((c, i) => { const k = norm(c).split(' (')[0]; if (k && !(k in idx)) idx[k] = i; });
    const g = (r, nome) => (norm(nome) in idx ? cel(r[idx[norm(nome)]]).trim() : '');
    return (memo.regras = v.slice(1).map((r, i) => ({
      linha: i + 2, ordem: Number(String(g(r, 'Ordem')).replace(',', '.')) || 0, codigo: g(r, 'Código').toUpperCase(),
      ligada: !/^(n|nao|não|0|false|desligada)$/i.test(g(r, 'Ligada')), pergunta: g(r, 'Pergunta'), resultado: g(r, 'Resultado'),
      observacao: g(r, 'Observação'), abas: g(r, 'Abas usadas'),
    })).filter((r) => r.codigo).sort((a, b) => a.ordem - b.ordem || a.linha - b.linha));
  }
  async function criarAbaRegras() {
    if (await P.existe(CFG.ABA_REGRAS)) {
      const v = await P.ler(CFG.ABA_REGRAS, 'A2:A');
      if (v.length) return 'A aba "' + CFG.ABA_REGRAS + '" já tem regras — nada foi alterado.';
    } else await P.criarAba(CFG.ABA_REGRAS, CAB_REGRAS);
    await P.atualizar(CFG.ABA_REGRAS, 'A1', [CAB_REGRAS].concat(REGRAS_INICIAIS));
    return 'Aba "' + CFG.ABA_REGRAS + '" pronta com ' + REGRAS_INICIAIS.length + ' regras.';
  }

  /* ---------- classificação manual ---------- */
  async function lerManual() {
    if (!(await P.existe(CFG.ABA_MANUAL))) return {};
    const v = await lerTudo(CFG.ABA_MANUAL, 6);
    const m = {};
    for (const r of v) {
      const id = r[1].trim(), cl = r[2].trim();
      if (!id || !cl) continue;
      m[(diaDe(r[0]) || '*') + '|' + id] = { classificacao: cl, raciocinio: r[3].trim(), quem: r[4].trim(), regraConferida: r[5].trim() };
    }
    return m;
  }
  async function salvarClassificacao(dia, id, classificacao, raciocinio, regraConferida) {
    if (!diaDe(dia) || !/^\d+$/.test(String(id))) throw new Error('Dia ou shipment inválido.');
    if (!(await P.existe(CFG.ABA_MANUAL))) await P.criarAba(CFG.ABA_MANUAL, CAB_MANUAL);
    else if (cel(((await P.ler(CFG.ABA_MANUAL, 'F1'))[0] || [])[0]).trim() !== CAB_MANUAL[5]) await P.atualizar(CFG.ABA_MANUAL, 'F1', [[CAB_MANUAL[5]]]);
    const linha = [diaDe(dia), String(id), String(classificacao || '').trim(), String(raciocinio || '').trim(), quem, ''];
    const v = await lerTudo(CFG.ABA_MANUAL, 6);
    let alvo = 0, antes = null;
    for (let i = v.length - 1; i >= 0; i--) if (diaDe(v[i][0]) === linha[0] && v[i][1].trim() === linha[1]) { alvo = i + 2; antes = v[i]; break; }
    if (regraConferida !== undefined && regraConferida !== null) linha[5] = String(regraConferida).trim();
    else if (antes && antes[2].trim() === linha[2]) linha[5] = antes[5].trim();
    if (alvo) await P.atualizar(CFG.ABA_MANUAL, 'A' + alvo, [linha]);
    else await P.anexar(CFG.ABA_MANUAL, [linha]);
    return { ok: true, quem: linha[4], regraConferida: linha[5] };
  }

  /* ---------- regras rodando no servidor (mesmo arquivo da tela) ---------- */
  let _motor = null;
  function motorRegras() {
    if (_motor) return _motor;
    const win = {};
    new Function('window', 'console', codigoRegras)(win, console);
    if (!win.REGRAS) throw new Error('Não consegui carregar as regras (js/faltantes-regras.js).');
    return (_motor = win.REGRAS);
  }
  async function classificarDia(dados) {
    const R = motorRegras();
    const regras = R.montar(await lerRegras());
    return dados.pacotes.map((p0) => {
      const p = JSON.parse(JSON.stringify(p0));
      p.inicio = new Date(p.inicio); p.fim = new Date(p.fim);
      p.eventos.forEach((e) => { e.quando = new Date(e.t); });
      p.ancora = p.eventos.find((e) => e.chave === p.ancora) || null;
      try { return R.classificar(p, regras); } catch (e) { return { resultado: 'Regra em aberto', codigo: '' }; }
    });
  }

  /* ---------- Resumo diário ---------- */
  async function linhasResumo(dia, dados) {
    const res = await classificarDia(dados);
    const quando = agoraTxt();
    return dados.pacotes.map((p, i) => [dia, String(p.id), p.rota || '', ilhaDe(p.rota), p.rep || '', res[i].resultado || '', res[i].codigo || '', p.temSorting ? 'Sim' : 'Não', quando]);
  }
  async function gravarResumoDias(mapa) {
    const dias = Object.keys(mapa);
    if (!dias.length) return 0;
    if (!(await P.existe(CFG.ABA_RESUMO))) await P.criarAba(CFG.ABA_RESUMO, CAB_RESUMO);
    const atuais = await lerTudo(CFG.ABA_RESUMO, CAB_RESUMO.length);
    const outras = atuais.filter((r) => !(diaDe(r[0]) in mapa) && r[1].trim());
    const novas = [].concat(...dias.map((d) => mapa[d]));
    const todas = outras.concat(novas).sort((a, b) => lerDataHora(a[0]) - lerDataHora(b[0]) || String(a[2]).localeCompare(String(b[2])));
    if (todas.length) await P.atualizar(CFG.ABA_RESUMO, 'A2', todas);
    if (atuais.length > todas.length) await P.limpar(CFG.ABA_RESUMO, 'A' + (todas.length + 2) + ':' + letra(CAB_RESUMO.length - 1) + (atuais.length + 1));
    return novas.length;
  }
  async function diasNoResumo() {
    if (!(await P.existe(CFG.ABA_RESUMO))) return {};
    const c = {};
    (await P.ler(CFG.ABA_RESUMO, 'A2:A')).forEach((r) => { const d = diaDe((r || [])[0]); if (d) c[d] = (c[d] || 0) + 1; });
    return c;
  }
  /** Preenche no Resumo os dias que estão na planilha e ainda não estão lá (até `segundos`). */
  async function preencherResumo(segundos) {
    const inicio = Date.now();
    const ja = await diasNoResumo();
    const feitos = [];
    const faltam = (await listarDias(false)).filter((d) => !ja[d.dia]);
    for (const d of faltam) {
      if (Date.now() - inicio > (segundos || 40) * 1000) break;
      await dadosDoDia(d.dia, true); // grava o resumo do dia
      feitos.push(d.dia);
    }
    return { dias: feitos, faltam: faltam.length - feitos.length, segundos: Math.round((Date.now() - inicio) / 100) / 10 };
  }

  /* ---------- responsáveis por ilha ---------- */
  async function mapaResponsaveis() {
    const c = await cache.ler('resp:mapa');
    if (c) return c;
    const m = {};
    if (await P.existe(CFG.ABA_RESPONSAVEIS)) {
      for (const r of await lerTudo(CFG.ABA_RESPONSAVEIS, CAB_RESP.length)) {
        const d = diaDe(r[0]), il = r[1].trim().toUpperCase(), nome = r[2].trim();
        if (!d || !il) continue;
        (m[d] = m[d] || {})[il] = nome;
      }
    }
    await cache.gravar('resp:mapa', m, 600);
    return m;
  }
  async function responsaveis(dia) {
    if (!diaDe(dia)) throw new Error('Dia inválido.');
    const [mapa, colab] = await Promise.all([mapaResponsaveis(), colaboradores()]);
    const anteriores = Object.keys(mapa).filter((d) => lerDataHora(d) < lerDataHora(dia)).sort((a, b) => lerDataHora(b) - lerDataHora(a));
    const anterior = anteriores.length ? { dia: anteriores[0], mapa: mapa[anteriores[0]] } : null;
    return { dia, ilhas: Object.keys(mapa[dia] || {}).sort(), mapa: mapa[dia] || {}, anterior, colaboradores: colab };
  }
  async function salvarResponsavel(dia, ilha, nome) {
    dia = diaDe(dia); ilha = String(ilha || '').trim().toUpperCase();
    if (!dia || !/^[A-Z]+$/.test(ilha)) throw new Error('Dia ou ilha inválidos.');
    if (!(await P.existe(CFG.ABA_RESPONSAVEIS))) await P.criarAba(CFG.ABA_RESPONSAVEIS, CAB_RESP);
    const linha = [dia, ilha, String(nome || '').trim(), quem, agoraTxt()];
    const v = await lerTudo(CFG.ABA_RESPONSAVEIS, 2);
    let alvo = 0;
    for (let i = v.length - 1; i >= 0; i--) if (diaDe(v[i][0]) === dia && v[i][1].trim().toUpperCase() === ilha) { alvo = i + 2; break; }
    if (alvo) await P.atualizar(CFG.ABA_RESPONSAVEIS, 'A' + alvo, [linha]);
    else await P.anexar(CFG.ABA_RESPONSAVEIS, [linha]);
    const m = await cache.ler('resp:mapa');
    if (m) { (m[dia] = m[dia] || {})[ilha] = linha[2]; await cache.gravar('resp:mapa', m, 600); }
    return { ok: true };
  }
  async function colaboradores() {
    const c = await cache.ler('colab');
    if (c) return c;
    if (!(await P.existe(CFG.ABA_COLABORADORES))) return [];
    const v = await P.ler(CFG.ABA_COLABORADORES, 'A1:Z');
    if (v.length < 2) return [];
    let col = (v[0] || []).findIndex((x) => /nome/i.test(cel(x)));
    if (col < 0) col = 0;
    const nomes = {};
    v.slice(1).forEach((r) => { const n = cel((r || [])[col]).trim(); if (n) nomes[n] = 1; }); // só a coluna Nome (não lê CPF)
    const lista = Object.keys(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    await cache.gravar('colab', lista, 600);
    return lista;
  }

  /* ---------- Volumoso × Sorting (aba One Bipe) ---------- */
  async function idsOneBipe() {
    const c = await cache.ler('onebipe');
    if (c) return c.existe ? new Set(c.ids) : null;
    if (!(await P.existe(CFG.ABA_ONE_BIPE))) { await cache.gravar('onebipe', { existe: false }, 600); return null; }
    const cab = await cabecalho(CFG.ABA_ONE_BIPE);
    let col = cab.findIndex((x) => /shipment/i.test(x));
    if (col < 0) col = Math.min(1, Math.max(0, cab.length - 1));
    const ids = {};
    (await P.ler(CFG.ABA_ONE_BIPE, letra(col) + '2:' + letra(col))).forEach((r) => { const v = cel((r || [])[0]).trim(); if (v) ids[v] = 1; });
    const lista = Object.keys(ids);
    await cache.gravar('onebipe', { existe: true, ids: lista }, 600);
    return new Set(lista);
  }
  const tipoDe = (ids, id) => (ids ? (ids.has(String(id).trim()) ? 'Volumoso' : 'Sorting') : '');
  async function marcarTipos(dados) {
    let ids = null;
    try { ids = await idsOneBipe(); } catch (e) { console.warn('One Bipe: ' + e.message); }
    (dados && dados.pacotes || []).forEach((p) => { p.tipo = tipoDe(ids, p.id); });
    return dados;
  }

  /* ---------- período (semana/mês) ---------- */
  async function resumoPeriodo(ini, fim) {
    const a = lerDataHora(ini), b = lerDataHora(fim);
    if (!a || !b) throw new Error('Período inválido.');
    // dias do período que ainda não estão no Resumo: calcula agora (até ~35 s; o resto na próxima vez)
    let preenchidos = { dias: [], faltam: 0 };
    try {
      const ja = await diasNoResumo();
      const faltando = (await listarDias(false)).filter((d) => !ja[d.dia] && d.t >= a.getTime() && d.t <= b.getTime());
      const t0 = Date.now();
      for (const d of faltando) { if (Date.now() - t0 > 35000) { preenchidos.faltam++; continue; } await dadosDoDia(d.dia, true); preenchidos.dias.push(d.dia); }
    } catch (e) { /* segue com o que já existe */ }
    const [manual, resp, ids, existe] = await Promise.all([lerManual(), mapaResponsaveis(), idsOneBipe().catch(() => null), P.existe(CFG.ABA_RESUMO)]);
    const linhas = [];
    const todas = existe ? await lerTudo(CFG.ABA_RESUMO, CAB_RESUMO.length) : [];
    const contagem = {};
    for (const r of todas) {
      const dia = diaDe(r[0]); if (dia) contagem[dia] = (contagem[dia] || 0) + 1;
      const d = lerDataHora(dia);
      if (!d || d < a || d > b) continue;
      const id = r[1].trim();
      const m = manual[dia + '|' + id] || manual['*|' + id];
      const ilha = r[3].trim() || ilhaDe(r[2]);
      linhas.push({ dia, id, rota: r[2], ilha, rep: r[4], regra: r[5], codigo: r[6], sorting: r[7] === 'Sim',
        manual: m && m.classificacao ? m.classificacao : '', resultado: m && m.classificacao ? m.classificacao : r[5],
        responsavel: (resp[dia] || {})[ilha] || '', tipo: tipoDe(ids, id) });
    }
    return { ini: diaDe(ini), fim: diaDe(fim), linhas, diasNoResumo: contagem, faltamNoResumo: preenchidos.faltam };
  }

  /* ---------- funções chamadas pela tela (mesmos nomes do antigo Apps Script) ---------- */
  return {
    painelListarDias: (forcar) => listarDias(!!forcar),
    /** Barato: só lê no cache quando foi a última preparação (a tela confere a cada 1 min). */
    painelVersao: async () => (await cache.ler('versao')) || { geradoEm: 0, dias: [] },
    prepararRecentes,
    painelDadosDoDia: async (dia, forcar) => {
      const d = await marcarTipos(await dadosDoDia(dia, !!forcar));
      const [manual, regras] = await Promise.all([lerManual(), lerRegras()]);
      return JSON.stringify({ servidor: 5, dados: d, manual, regras, url: P.url });
    },
    painelSalvarClassificacao: salvarClassificacao,
    painelResumoPeriodo: async (ini, fim) => JSON.stringify(await resumoPeriodo(ini, fim)),
    painelResponsaveis: async (dia) => JSON.stringify(await responsaveis(dia)),
    painelSalvarResponsavel: salvarResponsavel,
    painelPreencherResumo: () => preencherResumo(45),
    painelCriarAbaRegras: criarAbaRegras,
    // para os testes
    _interno: { lerAba, dadosDoDia, listarDias, classificarDia, diasNoResumo },
  };
}

module.exports = { criarNucleo, CFG, FONTES, letra, diaDe, lerDataHora };
