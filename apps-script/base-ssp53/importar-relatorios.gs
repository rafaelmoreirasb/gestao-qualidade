// =====================================================================
//  IMPORTAR RELATÓRIOS — Aduana, Auditoria de Carrinho e Problem Solving
//  Arquivo NOVO do projeto Apps Script da planilha Base SSP53 (Extensões › Apps Script).
//  Fica ao lado do arquivo da "AUTOMAÇÃO BASE SSP53" e usa as constantes dele
//  (OP_DESTINO_ID, BINV_PASTA_ID, BINV_PROCESSADOS_ID).
//
//  Como funciona:
//   - Você joga os 4 relatórios do dia, todos juntos, na pasta "Importar Inventário" do Drive.
//   - O Inventário continua com a função importarBaseInventario (arquivo da automação).
//   - Esta função (importarRelatorios, a cada 15 min) reconhece os outros 3 PELOS CABEÇALHOS
//     (o nome do arquivo não importa), grava na aba certa SEM DUPLICAR e move para "Processados".
//     Problem Solving: um caso que mudou de estado ATUALIZA a linha.
//   - Arquivo que ninguém reconhece vai para "Não reconhecidos" e você recebe e-mail.
//   - Tudo fica na aba "Log importação".
//   - Toda madrugada (3h) as linhas com mais de 15 dias dessas 3 abas vão para a planilha
//     "Arquivo Faltantes AAAA-MM" (pasta "Faltantes – Arquivo"), para a Base SSP53 não passar
//     do limite de 10 milhões de células. Nada é apagado de vez.
//
//  Uma vez só: migrarAbasPlanilhaAntiga (traz o histórico da planilha antiga) e
//  criarGatilhosRelatorios (liga os gatilhos). Passo a passo: docs/faltante-aduana/importador.md
// =====================================================================

const REL_CONFIG = {
  PLANILHA_ANTIGA_ID: '1nDqe83XDoY-A3u6rNxaMP2RT74mZNjrYSDUY2c9dKhk', // Conteneirização de Pacotes - Base SSP53
  PASTA_ARQUIVO: 'Faltantes – Arquivo',
  NAO_RECONHECIDOS: 'Não reconhecidos', // subpasta criada dentro da pasta de entrada
  DIAS_NA_PRINCIPAL: 15,
  HORA_ARQUIVAMENTO: 3,
  ABA_LOG: 'Log importação',
  TEMPO_MAX_MS: 4.5 * 60 * 1000,
  LIMITE_CELULAS: 10000000,
};

const REL_MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

// ===== OS 3 RELATÓRIOS =====
const REL_RELATORIOS = [
  {
    nome: 'Aduana',
    aba: 'Aduana',
    detectar: (t) => t.has('shipment id') && t.has('placa') && t.has('id da rota'),
    cabecalho: ['Shipment ID', 'Placa', 'Data auditoria', 'Hora', 'ID da rota', 'Estado', 'Rep auditoria', 'Tipo do pacote'],
    colData: 2,
    modo: 'linha',
    doArquivo: (g) => {
      const [data, hora] = relSepararDataHora(g('Data auditoria'));
      return [g('Shipment ID'), g('Placa'), data, hora, relRota(g('ID da rota')), g('Estado'), g('Rep auditoria'), ''];
    },
    chave: (o) => ['AD', o[0], o[2], relHhmm(o[3]), o[4], o[5]].join('|'),
  },
  {
    nome: 'Auditoria de Carrinho',
    aba: 'Auditoria de Carrinho',
    detectar: (t) => t.has('shipment id') && t.has('gaiola') && t.has('data auditoria') && !t.has('placa'),
    cabecalho: ['Shipment ID', 'Data', 'Hora', 'Gaiola', 'Estado', 'Rep auditoria', 'Tipo'],
    colData: 1,
    modo: 'linha',
    doArquivo: (g) => {
      const [data, hora] = relSepararDataHora(g('Data auditoria'));
      return [g('Shipment ID'), data, hora, g('Gaiola'), g('Estado'), g('Rep auditoria'), ''];
    },
    chave: (o) => ['CA', o[0], o[1], relHhmm(o[2]), o[3], o[4]].join('|'),
  },
  {
    nome: 'Problem Solving',
    aba: 'Problem Solving',
    detectar: (t) => t.has('id do pacote') && t.has('problema') && t.has('data de criacao'),
    cabecalho: ['ID do pacote', 'Problema', 'Estado', 'Problem Solver', 'Hora', 'Data', 'Service Center', 'Resolução',
      'Status de resolução', 'Analisado por', 'Data de análise', 'Tempo de resolução em minutos', 'Origem de dano',
      'Motivo', 'Tipo de dano', 'Tipo de caso', 'Rota sugerida', 'Motivo da exclusão', 'Link detalhe do caso',
      'ID do caso', 'Data de fechamento'],
    colData: 5,
    modo: 'caso', // um caso que muda de estado ATUALIZA a linha existente
    doArquivo: (g, hoje) => {
      const [data, hora] = relDataHoraPS(g('Data de criação'), hoje);
      const link = g('Link detalhe do caso');
      return [g('ID do pacote'), g('Problema'), g('Estado'), g('Problem Solver'), hora, data, g('Service Center'),
        g('Resolução'), g('Status de resolução'), g('Analisado por'), relDataHoraPSTexto(g('Data de análise'), hoje),
        g('Tempo de resolução em minutos'), g('Origem de dano'), g('Motivo'), g('Tipo de dano'), g('Tipo de caso'),
        g('Rota sugerida'), g('Motivo da exclusão'), link, relCasoDoLink(link),
        relDataHoraPSTexto(g('Data de fechamento'), hoje)];
    },
    chave: (o) => o[19] ? 'PS|' + o[19] : ['PS', o[0], o[1], o[5], o[4]].join('|'),
  },
];

/** Cabeçalho do CSV do Inventário: esses arquivos ficam para a função importarBaseInventario. */
function relEhInventario(cabecalho) {
  const t = new Set(cabecalho.map(relNorm));
  return t.has('pacote') && t.has('data de escaneamento') && t.has('situacao');
}

// ===== ROTINA PRINCIPAL (gatilho a cada 15 min) =====
function importarRelatorios() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4 * 60 * 1000)) return; // espera a outra importação (Histórico, Inventário...) terminar
  const inicio = Date.now();
  const erros = [];
  try {
    const ss = SpreadsheetApp.openById(OP_DESTINO_ID);
    const entrada = DriveApp.getFolderById(BINV_PASTA_ID);
    const processados = DriveApp.getFolderById(BINV_PROCESSADOS_ID);
    const arquivos = [];
    const it = entrada.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (Date.now() - f.getLastUpdated().getTime() < 3 * 60 * 1000) continue; // ainda sincronizando: pega na próxima
      arquivos.push(f);
    }
    arquivos.sort((a, b) => a.getDateCreated() - b.getDateCreated()); // mais antigo primeiro
    let feitos = 0;

    for (const arq of arquivos) {
      if (Date.now() - inicio > REL_CONFIG.TEMPO_MAX_MS) { console.log('Tempo quase no limite: o resto vai na próxima execução'); break; }
      const nome = arq.getName();
      try {
        const tabela = relLerArquivo(arq);
        if (!tabela) {
          relRegistrar(ss, nome, '-', 0, 0, 0, 0, 'Ignorado: não é .csv, .xlsx nem planilha Google');
          relMoverPara(arq, entrada, REL_CONFIG.NAO_RECONHECIDOS);
          continue;
        }
        if (!tabela.length) continue;
        if (relEhInventario(tabela[0])) continue; // é do Inventário: a função importarBaseInventario cuida dele
        const rel = relDetectar(tabela[0]);
        if (!rel) {
          relMoverPara(arq, entrada, REL_CONFIG.NAO_RECONHECIDOS);
          throw new Error('Não reconheci o relatório (foi para "' + REL_CONFIG.NAO_RECONHECIDOS + '"). Cabeçalhos: ' + tabela[0].join(' | '));
        }
        const r = relImportarTabela(ss, rel, tabela, new Date());
        relRegistrar(ss, nome, rel.nome, r.lidas, r.novas, r.atualizadas, r.iguais, 'OK');
        arq.moveTo(processados);
        feitos++;
        console.log(nome + ' → ' + rel.aba + ': ' + r.novas + ' novas, ' + r.atualizadas + ' atualizadas, ' + r.iguais + ' já existiam');
      } catch (e) {
        erros.push(nome + ': ' + e.message);
        relRegistrar(ss, nome, '-', 0, 0, 0, 0, 'ERRO: ' + e.message);
      }
    }
    if (!feitos && !erros.length) console.log('Relatórios: nenhum arquivo novo (Aduana, Carrinho, Problem Solving)');
  } catch (e) {
    erros.push(e.message);
  } finally {
    lock.releaseLock();
    if (erros.length) relAvisarErro('Importação de relatórios', erros);
  }
}

/** Trata a tabela lida do arquivo e grava na aba do relatório. Devolve as contagens. */
function relImportarTabela(ss, rel, tabela, agora) {
  const aba = relPrepararAba(ss, rel);
  const g0 = relLeitor(tabela[0]);
  const quando = relFormatarAgora(agora);
  const linhas = [];
  for (const linha of tabela.slice(1)) {
    if (linha.every((c) => String(c).trim() === '')) continue;
    const o = rel.doArquivo(g0(linha), agora).map((v) => String(v == null ? '' : v).trim());
    linhas.push([...o, quando, relChaveCurta(rel.chave(o))]);
  }
  const r = relGravar(aba, rel, linhas);
  r.lidas = linhas.length;
  return r;
}

// ===== GRAVAÇÃO SEM DUPLICAR =====
// modo 'linha': só acrescenta o que é novo.  modo 'caso': atualiza se a chave já existe e mudou.
function relGravar(aba, rel, linhas) {
  const nCols = rel.cabecalho.length + 2;
  const ultima = aba.getLastRow();
  const res = { novas: 0, atualizadas: 0, iguais: 0 };
  const novas = [];

  if (rel.modo === 'caso') {
    const atuais = ultima > 1 ? aba.getRange(2, 1, ultima - 1, nCols).getDisplayValues() : [];
    const pos = new Map();
    atuais.forEach((l, i) => pos.set(l[nCols - 1], i));
    let mudou = false;
    for (const l of linhas) {
      const k = l[nCols - 1];
      if (pos.has(k)) {
        const i = pos.get(k);
        if (i >= atuais.length) { res.iguais++; continue; } // repetido no mesmo arquivo
        const antes = atuais[i];
        if (rel.cabecalho.some((_, c) => String(antes[c]) !== String(l[c]) && !(l[c] === '' && antes[c] !== ''))) {
          // atualiza, mas não apaga informação que só existia na linha antiga
          atuais[i] = l.map((v, c) => (v === '' && c < rel.cabecalho.length ? antes[c] : v));
          res.atualizadas++; mudou = true;
        } else res.iguais++;
      } else {
        pos.set(k, atuais.length + novas.length);
        novas.push(l); res.novas++;
      }
    }
    if (mudou) relEscreverTexto(aba, 2, atuais);
  } else {
    const existentes = new Set(ultima > 1 ? aba.getRange(2, nCols, ultima - 1, 1).getDisplayValues().flat() : []);
    for (const l of linhas) {
      const k = l[nCols - 1];
      if (existentes.has(k)) { res.iguais++; continue; }
      existentes.add(k); novas.push(l); res.novas++;
    }
  }
  if (novas.length) relEscreverTexto(aba, aba.getLastRow() + 1, novas);
  return res;
}

/** Escreve como TEXTO (assim o Sheets não transforma IDs em número nem datas em outra coisa). Em blocos. */
function relEscreverTexto(aba, linhaInicial, valores) {
  if (!valores.length) return;
  const precisa = linhaInicial + valores.length - 1;
  if (precisa > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), precisa - aba.getMaxRows());
  const BLOCO = 20000;
  for (let i = 0; i < valores.length; i += BLOCO) {
    const parte = valores.slice(i, i + BLOCO);
    const r = aba.getRange(linhaInicial + i, 1, parte.length, parte[0].length);
    r.setNumberFormat('@');
    r.setValues(parte);
  }
}

// ===== PREPARAÇÃO DA ABA =====
function relPrepararAba(ss, rel) {
  const cab = [...rel.cabecalho, 'Importado em', 'Chave'];
  let aba = ss.getSheetByName(rel.aba);
  if (!aba) {
    aba = ss.insertSheet(rel.aba);
    relAjustarColunas(aba, cab.length);
    if (aba.getMaxRows() > 100) aba.deleteRows(101, aba.getMaxRows() - 100); // economiza células
    relEscreverTexto(aba, 1, [cab]);
    aba.setFrozenRows(1);
    return aba;
  }
  const atual = aba.getLastRow() ? aba.getRange(1, 1, 1, aba.getLastColumn()).getDisplayValues()[0] : [];
  const pronto = atual.length >= cab.length && cab.every((c, i) => String(atual[i]).trim() === c);
  if (pronto) return aba;
  if (aba.getLastRow() <= 1) { // aba vazia: só coloca o cabeçalho
    aba.clear();
    relAjustarColunas(aba, cab.length);
    relEscreverTexto(aba, 1, [cab]);
    aba.setFrozenRows(1);
    return aba;
  }
  throw new Error('A aba "' + rel.aba + '" tem dados, mas o cabeçalho é diferente do esperado (' + cab.join(' | ') +
    '). Nada foi gravado. Confira se a aba foi copiada inteira da planilha antiga.');
}

function relAjustarColunas(aba, n) {
  const max = aba.getMaxColumns();
  if (max > n) aba.deleteColumns(n + 1, max - n);
  else if (max < n) aba.insertColumnsAfter(max, n - max);
}

// ===== ARQUIVAMENTO (gatilho diário de madrugada) =====
function arquivarRelatoriosAntigos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4 * 60 * 1000)) return;
  const erros = [];
  try {
    const ss = SpreadsheetApp.openById(OP_DESTINO_ID);
    const limite = new Date();
    limite.setHours(0, 0, 0, 0);
    limite.setDate(limite.getDate() - REL_CONFIG.DIAS_NA_PRINCIPAL);
    for (const rel of REL_RELATORIOS) {
      try {
        const aba = ss.getSheetByName(rel.aba);
        if (!aba || aba.getLastRow() < 2) continue;
        const cab = [...rel.cabecalho, 'Importado em', 'Chave'];
        const atual = aba.getRange(1, 1, 1, cab.length).getDisplayValues()[0];
        if (!cab.every((c, i) => atual[i] === c)) continue;
        const dados = aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).getDisplayValues();
        const { ficam, porMes } = relSepararPorIdade(dados, rel.colData, limite);
        if (!porMes.size) continue;
        for (const [mes, linhas] of porMes) {
          const arq = relPlanilhaNaPasta('Arquivo Faltantes ' + mes, relPasta(REL_CONFIG.PASTA_ARQUIVO));
          let abaArq = arq.getSheetByName(rel.aba);
          if (!abaArq) {
            abaArq = arq.insertSheet(rel.aba);
            relAjustarColunas(abaArq, cab.length);
            relEscreverTexto(abaArq, 1, [cab]);
            abaArq.setFrozenRows(1);
            relLimparAbaPadrao(arq);
          }
          relGravar(abaArq, rel, linhas); // sem duplicar: pode rodar de novo sem problema
        }
        // reescreve a principal só com as linhas recentes e libera as linhas vazias
        aba.getRange(2, 1, dados.length, cab.length).clearContent();
        relEscreverTexto(aba, 2, ficam);
        const sobram = aba.getMaxRows() - (ficam.length + 1);
        if (sobram > 100) aba.deleteRows(ficam.length + 2, sobram - 100);
        const n = dados.length - ficam.length;
        relRegistrar(ss, '(arquivamento)', rel.nome, dados.length, 0, 0, 0,
          n + ' linhas com mais de ' + REL_CONFIG.DIAS_NA_PRINCIPAL + ' dias foram para o arquivo mensal');
      } catch (e) {
        erros.push(rel.aba + ': ' + e.message);
      }
    }
  } finally {
    lock.releaseLock();
    if (erros.length) relAvisarErro('Arquivamento mensal', erros);
  }
}

function relSepararPorIdade(dados, colData, limite) {
  const ficam = [];
  const porMes = new Map();
  for (const l of dados) {
    const d = relLerData(l[colData]);
    if (!d || d >= limite) { ficam.push(l); continue; }
    const mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(l);
  }
  return { ficam, porMes };
}

// ===== MIGRAÇÃO (rode UMA vez) =====
// Traz da planilha antiga (Conteneirização) as abas que a Base SSP53 ainda não tem.
// Pula a aba que já tem dados na Base SSP53. Se o tempo acabar, rode de novo: continua de onde parou.
// Antes de copiar, confere o limite de 10 milhões de células da planilha.
const REL_ABAS_MIGRAR = ['Aduana', 'Auditoria de Carrinho', 'Problem Solving', 'Regras', 'Classificação manual',
  'Responsáveis', 'Resumo diário'];

function migrarAbasPlanilhaAntiga() {
  const inicio = Date.now();
  const antiga = SpreadsheetApp.openById(REL_CONFIG.PLANILHA_ANTIGA_ID);
  const ss = SpreadsheetApp.openById(OP_DESTINO_ID);
  for (const nome of REL_ABAS_MIGRAR) {
    if (Date.now() - inicio > REL_CONFIG.TEMPO_MAX_MS) {
      console.log('Tempo quase no limite. Rode migrarAbasPlanilhaAntiga de novo para continuar.');
      return;
    }
    const temp = ss.getSheetByName(nome + ' (migrando)');
    if (temp) ss.deleteSheet(temp); // sobra de uma tentativa interrompida
    const atual = ss.getSheetByName(nome);
    if (atual && atual.getLastRow() > 1) { console.log(nome + ': já tem dados na Base SSP53, não copiei.'); continue; }
    const origem = antiga.getSheetByName(nome);
    if (!origem || origem.getLastRow() < 1) { console.log(nome + ': não existe (ou está vazia) na planilha antiga.'); continue; }

    const nLin = origem.getLastRow(), nCol = origem.getLastColumn();
    const usadas = relCelulasUsadas(ss) - (atual ? atual.getMaxRows() * atual.getMaxColumns() : 0);
    if (usadas + nLin * nCol > REL_CONFIG.LIMITE_CELULAS * 0.97) {
      throw new Error(nome + ': não cabe. A Base SSP53 já usa ' + usadas.toLocaleString('pt-BR') + ' células e esta aba precisa de ' +
        (nLin * nCol).toLocaleString('pt-BR') + ' (limite do Google: 10.000.000). Libere espaço antes (ver importador.md).');
    }
    const valores = origem.getRange(1, 1, nLin, nCol).getDisplayValues();
    const nova = ss.insertSheet(nome + ' (migrando)');
    relAjustarColunas(nova, nCol);
    if (nova.getMaxRows() > nLin) nova.deleteRows(nLin + 1, nova.getMaxRows() - nLin);
    relEscreverTexto(nova, 1, valores);
    nova.setFrozenRows(1);
    if (atual) ss.deleteSheet(atual); // só tinha o cabeçalho
    nova.setName(nome);
    SpreadsheetApp.flush();
    console.log(nome + ': ' + (nLin - 1) + ' linhas copiadas da planilha antiga.');
  }
  console.log('Migração concluída. Células usadas agora na Base SSP53: ' + relCelulasUsadas(ss).toLocaleString('pt-BR'));
}

/** Mostra no registro de execução quantas células cada aba ocupa (para acompanhar o limite de 10 milhões). */
function verCelulasDaPlanilha() {
  const ss = SpreadsheetApp.openById(OP_DESTINO_ID);
  ss.getSheets().forEach((a) => console.log(a.getName() + ': ' + (a.getMaxRows() * a.getMaxColumns()).toLocaleString('pt-BR')));
  console.log('TOTAL: ' + relCelulasUsadas(ss).toLocaleString('pt-BR') + ' de 10.000.000');
}

function relCelulasUsadas(ss) {
  return ss.getSheets().reduce((t, a) => t + a.getMaxRows() * a.getMaxColumns(), 0);
}

// ===== LEITURA DOS ARQUIVOS =====
function relLerArquivo(arq) {
  const nome = arq.getName().toLowerCase();
  const tipo = arq.getMimeType();
  if (nome.endsWith('.csv') || tipo === MimeType.CSV) {
    const blob = arq.getBlob();
    let texto = blob.getDataAsString('UTF-8');
    if (texto.includes(String.fromCharCode(0xFFFD))) texto = blob.getDataAsString('windows-1252'); // salvo pelo Excel
    texto = texto.replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '');
    const primeira = texto.split(/\r?\n/, 1)[0];
    const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
    return Utilities.parseCsv(texto, sep);
  }
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || tipo === MimeType.MICROSOFT_EXCEL) {
    if (typeof Drive === 'undefined') throw new Error('Para ler .xlsx, ative o serviço "Drive API" no Apps Script (Serviços › Drive API). Ou exporte em .csv.');
    const temp = Drive.Files.create({ name: 'temp-importador-' + arq.getName(), mimeType: MimeType.GOOGLE_SHEETS }, arq.getBlob());
    try {
      return SpreadsheetApp.openById(temp.id).getSheets()[0].getDataRange().getDisplayValues();
    } finally {
      DriveApp.getFileById(temp.id).setTrashed(true);
    }
  }
  if (tipo === MimeType.GOOGLE_SHEETS) {
    return SpreadsheetApp.openById(arq.getId()).getSheets()[0].getDataRange().getDisplayValues();
  }
  return null;
}

function relDetectar(cabecalho) {
  const t = new Set(cabecalho.map(relNorm));
  return REL_RELATORIOS.find((r) => r.detectar(t)) || null;
}

/** Devolve uma função que, dada uma linha, devolve g(nomeDaColuna). */
function relLeitor(cabecalho) {
  const idx = new Map();
  cabecalho.forEach((c, i) => { const k = relNorm(c); if (!idx.has(k)) idx.set(k, i); });
  return (linha) => (nomeCol) => {
    const i = idx.get(relNorm(nomeCol));
    if (i === undefined) {
      if (nomeCol === '') return '';
      throw new Error('Coluna "' + nomeCol + '" não encontrada. Cabeçalhos: ' + cabecalho.join(' | '));
    }
    return linha[i] == null ? '' : String(linha[i]).trim();
  };
}

// ===== DATAS E TEXTOS =====
function relNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function relPad(n) { return String(n).padStart(2, '0'); }

/** "06/11/2026 07:33:31" → ["06/11/2026", "07:33:31"] */
function relSepararDataHora(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!m) return [relNormData(s), ''];
  return [relNormData(m[1] + '/' + m[2] + '/' + m[3]), m[4].length === 4 ? '0' + m[4] : m[4]];
}

/** "05/11/26" ou "5/11/2026" → "05/11/2026" */
function relNormData(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return String(s || '').trim();
  const ano = m[3].length === 2 ? '20' + m[3] : m[3];
  return relPad(m[1]) + '/' + relPad(m[2]) + '/' + ano;
}

/** "07:33:31" → "07:33" (usado na chave) */
function relHhmm(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
  return m ? relPad(m[1]) + ':' + m[2] : '';
}

/** "A1_AM1 | 468263706" → "A1_AM1" */
function relRota(s) { return String(s || '').split('|')[0].trim(); }

/** Problem Solving: "07:50pm | 06/nov" → ["06/11/2026", "19:50"]. O ano não vem no arquivo: é deduzido. */
function relDataHoraPS(s, hoje) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*\|\s*(\d{1,2})\/([a-zç]{3})/i);
  if (!m) return [relNormData(s), ''];
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  const mes = REL_MESES[m[5].toLowerCase()];
  if (!mes) return [String(s).trim(), ''];
  const ref = hoje || new Date();
  let ano = ref.getFullYear();
  if (new Date(ano, mes - 1, Number(m[4])) > new Date(ref.getTime() + 2 * 86400000)) ano--; // ex.: "30/dez" lido em janeiro
  return [relPad(m[4]) + '/' + relPad(mes) + '/' + ano, relPad(h) + ':' + m[2]];
}
function relDataHoraPSTexto(s, hoje) {
  if (!String(s || '').trim()) return '';
  const [d, h] = relDataHoraPS(s, hoje);
  return h ? d + ' ' + h : d;
}

/** ".../problem-solving/detail/170089648" → "170089648" */
function relCasoDoLink(link) {
  const m = String(link || '').match(/detail\/(\d+)/);
  return m ? m[1] : '';
}

/** "dd/mm/aaaa" → Date (ou null) */
function relLerData(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  return new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]));
}

function relFormatarAgora(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}

function relChaveCurta(texto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto));
}

// ===== DRIVE, LOG E AVISOS =====
function relPasta(nome) {
  const it = DriveApp.getFoldersByName(nome);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nome);
}

function relMoverPara(arq, entrada, subpasta) {
  const it = entrada.getFoldersByName(subpasta);
  arq.moveTo(it.hasNext() ? it.next() : entrada.createFolder(subpasta));
}

function relPlanilhaNaPasta(nome, pastaDestino) {
  const it = pastaDestino.getFilesByName(nome);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  const nova = SpreadsheetApp.create(nome);
  DriveApp.getFileById(nova.getId()).moveTo(pastaDestino);
  return nova;
}

/** Remove a "Página1"/"Sheet1" vazia que o Google cria junto com uma planilha nova. */
function relLimparAbaPadrao(planilha) {
  const abas = planilha.getSheets();
  if (abas.length < 2) return;
  for (const a of abas) {
    if (/^(Sheet1|Página1|Planilha1)$/.test(a.getName()) && a.getLastRow() === 0) planilha.deleteSheet(a);
  }
}

function relRegistrar(ss, arquivo, relatorio, lidas, novas, atualizadas, iguais, resultado) {
  let log = ss.getSheetByName(REL_CONFIG.ABA_LOG);
  if (!log) {
    log = ss.insertSheet(REL_CONFIG.ABA_LOG);
    relAjustarColunas(log, 8);
    if (log.getMaxRows() > 100) log.deleteRows(101, log.getMaxRows() - 100);
    log.appendRow(['Quando', 'Arquivo', 'Relatório', 'Linhas no arquivo', 'Novas', 'Atualizadas', 'Já existiam', 'Resultado']);
    log.setFrozenRows(1);
  }
  log.appendRow([relFormatarAgora(new Date()), arquivo, relatorio, lidas, novas, atualizadas, iguais, resultado]);
}

function relAvisarErro(titulo, erros) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '⚠️ Faltante Aduana: erro em ' + titulo,
      'Aconteceu um problema:\n\n' + erros.join('\n') + '\n\nVeja a aba "' + REL_CONFIG.ABA_LOG + '" da planilha Base SSP53.');
  } catch (e) {
    console.error('Não consegui enviar e-mail: ' + e.message);
  }
  console.error(erros.join('\n'));
}

// ===== GATILHOS: rode UMA vez (não mexe nos outros gatilhos) =====
function criarGatilhosRelatorios() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ['importarRelatorios', 'arquivarRelatoriosAntigos'].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importarRelatorios').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('arquivarRelatoriosAntigos').timeBased().everyDays(1).atHour(REL_CONFIG.HORA_ARQUIVAMENTO).create();
  console.log('Gatilhos criados: relatórios a cada 15 min e arquivamento diário às ' + REL_CONFIG.HORA_ARQUIVAMENTO + 'h.');
}
