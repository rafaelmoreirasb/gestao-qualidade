// =====================================================================
//  AUTOMAÇÃO BASE SSP53 (conta pessoal) - tudo grava nesta planilha
//  Histórico, Direcionamento Manual e Base Inventário: só linhas novas a cada 15 minutos
//  Torre Aduana e One Bipe: espelho a cada 1 hora
//  (o espelho do Inventário foi desligado em 17/11/2026: o painel usa a aba Base Inventário)
//  Aduana, Auditoria de Carrinho e Problem Solving: arquivo importar-relatorios.gs (mesma pasta do Inventário)
// =====================================================================
const OP_DESTINO_ID = '1m2rcujuC2w5qIsrm81nBdTgJxZv3HuukhMTtQBmIH8E'; // Base SSP53
const OP_MIRASSOL   = '1qArFIEGsFJhxCKYjkJnbKiQZCcfFuY5O91FZQQmzO2k'; // Base Mirassol Oficial - SSP53

const OP_ESPELHOS = {
  torre:      { origemGid: 456294767,  destinoGid: 1744108768, nome: 'Torre Aduana' },
  // inventario: { origemGid: 1547186020, destinoGid: 393712910, nome: 'Inventário' }, // desligado em 17/11/2026
  oneBipe:    { origemGid: 1654222074, destinoGid: 801707561,  nome: 'One Bipe' },
};

const DIR_ORIGEM_ID   = '1No0tZ8yI7HJpKV2V2_PgKqIBpHXVlbTKsdy-lhBzkYk';
const DIR_ORIGEM_GID  = 1903954199;
const DIR_DESTINO_GID = 530519580;       // aba "Direcionamento Manual" na Base SSP53
const DIR_COLUNA_IDS  = 'ID do produto'; // coluna com vários IDs separados por quebra de linha
const DIR_LOTE_MAX    = 30000;

const OP_BLOCO       = 25000;            // linhas gravadas por vez nos espelhos
const OP_TEMPO_MAX   = 5 * 60 * 1000;    // margem antes do limite de 6 minutos

// ---------- Funções chamadas pelos gatilhos ----------
function atualizarTorreAduana() { opEspelhar(OP_ESPELHOS.torre); }
// Espelho do Inventário DESLIGADO em 17/11/2026 (a aba "Inventário" ocupava 2,7 milhões de células e o painel usa a
// Base Inventário). A função ficou só para um gatilho antigo que sobrar não dar erro: ela não faz nada.
function atualizarInventario()  { console.log('Espelho do Inventário desligado (17/11/2026). Apague este gatilho em Acionadores.'); }
function atualizarOneBipe()     { opEspelhar(OP_ESPELHOS.oneBipe); }

// Rode UMA vez para ativar tudo (apaga e recria todos os gatilhos deste projeto)
function criarTodosGatilhos() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ['importarNovasLinhas', 'importarDirecionamento', 'importarBaseInventario', 'importarRelatorios']
    .forEach(f => ScriptApp.newTrigger(f).timeBased().everyMinutes(15).create());
  ['atualizarTorreAduana', 'atualizarOneBipe']
    .forEach(f => ScriptApp.newTrigger(f).timeBased().everyHours(1).create());
  ScriptApp.newTrigger('arquivarRelatoriosAntigos').timeBased().everyDays(1).atHour(3).create(); // importar-relatorios.gs
  console.log('Gatilhos criados: Histórico, Direcionamento, Base Inventário e Relatórios a cada 15 min, 2 espelhos (Torre e One Bipe) a cada hora, arquivamento às 3h');
}

// ---------- Espelho (a aba de destino fica igual à de origem) ----------
// Grava por cima em blocos, sem apagar antes: a aba nunca fica vazia nem pela metade.
function opEspelhar(cfg) {
  const inicioExec = Date.now();
  const origem = opAbaPorGid(SpreadsheetApp.openById(OP_MIRASSOL), cfg.origemGid);
  const valores = origem.getDataRange().getValues();

  const temDados = valores.slice(1).some(l => l.some(c => c !== ''));
  if (!temDados) { console.log(cfg.nome + ': origem vazia, destino mantido'); return; }

  const nLin = valores.length;
  const nCol = valores[0].length;
  const formatos = origem.getRange(2, 1, 1, nCol).getNumberFormats()[0];
  const destino = opAbaPorGid(SpreadsheetApp.openById(OP_DESTINO_ID), cfg.destinoGid);

  if (destino.getMaxRows() < nLin) destino.insertRowsAfter(destino.getMaxRows(), nLin - destino.getMaxRows());
  if (destino.getMaxColumns() < nCol) destino.insertColumnsAfter(destino.getMaxColumns(), nCol - destino.getMaxColumns());
  formatos.forEach((f, c) => destino.getRange(2, c + 1, nLin - 1, 1).setNumberFormat(f));

  for (let i = 0; i < nLin; i += OP_BLOCO) {
    if (Date.now() - inicioExec > OP_TEMPO_MAX) {
      throw new Error(cfg.nome + ': tempo esgotado na linha ' + i + '. A próxima execução refaz a cópia.');
    }
    const parte = valores.slice(i, i + OP_BLOCO);
    destino.getRange(i + 1, 1, parte.length, nCol).setValues(parte);
    SpreadsheetApp.flush();
  }

  // Só no fim remove o que sobrou (linhas e colunas a mais de cópias anteriores)
  if (destino.getMaxRows() > nLin) destino.deleteRows(nLin + 1, destino.getMaxRows() - nLin);
  if (destino.getMaxColumns() > nCol) destino.deleteColumns(nCol + 1, destino.getMaxColumns() - nCol);
  destino.setFrozenRows(1);
  console.log(cfg.nome + ': ' + (nLin - 1) + ' linhas copiadas');
}

// ---------- Direcionamento Manual (só linhas novas, um ID por linha) ----------
function importarDirecionamento() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4 * 60 * 1000)) return; // espera a outra importação terminar

  try {
    const origem = opAbaPorGid(SpreadsheetApp.openById(DIR_ORIGEM_ID), DIR_ORIGEM_GID);
    const dados = origem.getDataRange().getDisplayValues();
    if (dados.length < 2) { console.log('Direcionamento: origem vazia'); return; }

    const cab = dados[0];
    const colIds = dirAcharColuna(cab, DIR_COLUNA_IDS);
    const destino = opAbaPorGid(SpreadsheetApp.openById(OP_DESTINO_ID), DIR_DESTINO_GID);

    if (destino.getLastRow() === 0) destino.appendRow([...cab, 'Importado em', 'Chave']);

    const colChave = cab.length + 2;
    const ultima = destino.getLastRow();
    const existentes = {};
    if (ultima > 1) {
      destino.getRange(2, colChave, ultima - 1, 1).getValues().flat()
        .forEach(k => existentes[k] = (existentes[k] || 0) + 1);
    }

    const agora = new Date();
    const vistos = {};
    const novas = [];
    let restantes = 0;
    for (const linha of dados.slice(1)) {
      if (linha.every(c => c === '')) continue;
      const base = dirHash(linha);
      const ids = String(linha[colIds]).split(/\r\n|\r|\n/).map(s => s.trim()).filter(s => s !== '');
      (ids.length ? ids : ['']).forEach((id, i) => {
        const k = base + ':' + (i + 1);
        vistos[k] = (vistos[k] || 0) + 1;
        if (vistos[k] <= (existentes[k] || 0)) return; // já importada
        if (novas.length >= DIR_LOTE_MAX) { restantes++; return; }
        const nova = linha.slice();
        nova[colIds] = id;
        novas.push([...nova, agora, k]);
      });
    }

    if (novas.length) {
      const inicio = destino.getLastRow() + 1;
      const faltam = inicio + novas.length - 1 - destino.getMaxRows();
      if (faltam > 0) destino.insertRowsAfter(destino.getMaxRows(), faltam);
      destino.getRange(inicio, 1, novas.length, novas[0].length).setValues(novas);
    }
    console.log('Direcionamento: ' + novas.length + ' linhas novas' + (restantes ? ' (faltam ' + restantes + ')' : ''));
  } finally {
    lock.releaseLock();
  }
}

// Rode UMA vez: traz o que já existe na aba antiga, para não perder o histórico
function migrarDirecionamentoAntigo() {
  const antiga = SpreadsheetApp.openById('1nDqe83XDoY-A3u6rNxaMP2RT74mZNjrYSDUY2c9dKhk').getSheetByName('Direcionamento Manual');
  const destino = opAbaPorGid(SpreadsheetApp.openById(OP_DESTINO_ID), DIR_DESTINO_GID);
  if (destino.getLastRow() > 0) throw new Error('A aba Direcionamento Manual da Base SSP53 já tem dados. Nada foi copiado.');
  const valores = antiga.getRange(1, 1, antiga.getLastRow(), antiga.getLastColumn()).getValues();
  if (destino.getMaxRows() < valores.length) destino.insertRowsAfter(destino.getMaxRows(), valores.length - destino.getMaxRows());
  destino.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
  destino.setFrozenRows(1);
  console.log('Direcionamento: ' + (valores.length - 1) + ' linhas trazidas da planilha antiga');
}

// ---------- Auxiliares ----------
function opAbaPorGid(planilha, gid) {
  const aba = planilha.getSheets().find(s => s.getSheetId() === gid);
  if (!aba) throw new Error('Aba com gid=' + gid + ' não encontrada em "' + planilha.getName() + '".');
  return aba;
}

function dirAcharColuna(cab, nome) {
  const norm = s => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const alvo = norm(nome);
  let i = cab.findIndex(c => norm(c) === alvo);
  if (i === -1) i = cab.findIndex(c => norm(c).includes(alvo));
  if (i === -1) throw new Error('Coluna "' + nome + '" não encontrada. Cabeçalhos da origem: ' + cab.join(' | '));
  return i;
}

function dirHash(linha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, linha.join(String.fromCharCode(31)));
  return Utilities.base64Encode(bytes);
}

// ---------- Histórico (Labor, só linhas novas) ----------
const ORIGEM_ID       = '1O4clXDtcty6TiCVsBXFu0I45Hv9LSysBoI70M4Kd6qc'; // planilha do Labor
const ORIGEM_GID      = 0;
const DESTINO_PLAN_ID = OP_DESTINO_ID;
const DESTINO_ABA     = 'Histórico';
const TEM_CABECALHO   = true;

function importarNovasLinhas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4 * 60 * 1000)) return; // espera a outra importação terminar

  try {
    const planOrigem = SpreadsheetApp.openById(ORIGEM_ID);
    const origem = planOrigem.getSheets().find(s => s.getSheetId() === ORIGEM_GID);
    if (!origem) throw new Error('Aba com gid=' + ORIGEM_GID + ' não encontrada na planilha original.');

    const dados = origem.getDataRange().getDisplayValues();
    const inicio = TEM_CABECALHO ? 1 : 0;
    if (dados.length <= inicio) return; // origem zerada: nada a fazer

    const ss = SpreadsheetApp.openById(DESTINO_PLAN_ID);
    const destino = ss.getSheetByName(DESTINO_ABA) || ss.insertSheet(DESTINO_ABA);
    const nCols = dados[0].length;

    if (destino.getLastRow() === 0) {
      const cab = TEM_CABECALHO ? dados[0] : dados[0].map((_, i) => 'Coluna ' + (i + 1));
      destino.appendRow([...cab, 'Importado em', 'Chave']);
    }

    // Lê as chaves que já estão no histórico
    const colChave = nCols + 2;
    const ultima = destino.getLastRow();
    const existentes = {};
    if (ultima > 1) {
      destino.getRange(2, colChave, ultima - 1, 1).getValues().flat()
        .forEach(k => existentes[k] = (existentes[k] || 0) + 1);
    }

    // Seleciona só as linhas novas
    const agora = new Date();
    const vistos = {};
    const novas = [];
    for (const linha of dados.slice(inicio)) {
      if (linha.every(c => c === '')) continue; // ignora linhas vazias
      const k = chave(linha);
      vistos[k] = (vistos[k] || 0) + 1;
      if (vistos[k] > (existentes[k] || 0)) novas.push([...linha, agora, k]);
    }

    if (novas.length) {
      const inicioGrav = destino.getLastRow() + 1;
      const faltam = inicioGrav + novas.length - 1 - destino.getMaxRows();
      if (faltam > 0) destino.insertRowsAfter(destino.getMaxRows(), faltam);
      destino.getRange(inicioGrav, 1, novas.length, novas[0].length).setValues(novas);
    }
    console.log(novas.length + ' linhas novas importadas');
  } finally {
    lock.releaseLock();
  }
}

function chave(linha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, linha.join('\u241F'));
  return Utilities.base64Encode(bytes);
}

// ---------- Correção das datas do Histórico (em partes, continua sozinha) ----------
const COR_ABA        = 'Histórico';
const COR_COL_DATA   = 1;     // A: Data
const COR_COL_IMPORT = 10;    // J: Importado em
const COR_BLOCO      = 40000; // linhas por vez
const COR_FUSO_H     = -3;    // horário de Brasília

// Datas com dia até 12 foram gravadas com dia e mês trocados (01/11 virou 11 de janeiro).
// Para cada linha, fica a versão (normal ou trocada) mais próxima da data em "Importado em".
function corrigirDatasHistorico() {
  const inicioExec = Date.now();
  const props = PropertiesService.getScriptProperties();
  corApagarGatilho();

  const aba = SpreadsheetApp.openById(OP_DESTINO_ID).getSheetByName(COR_ABA);
  const ultima = aba.getLastRow();
  let linha = Number(props.getProperty('corProximaLinha') || 2);
  let trocadas = Number(props.getProperty('corTrocadas') || 0);

  if (linha === 2) {
    aba.getRange(2, COR_COL_DATA, ultima - 1, 1).setNumberFormat('dd/MM/yyyy');
    aba.getRange(2, COR_COL_IMPORT, ultima - 1, 1).setNumberFormat('dd/MM/yyyy');
  }

  while (linha <= ultima) {
    if (Date.now() - inicioExec > 4.5 * 60 * 1000) {
      props.setProperty('corProximaLinha', String(linha));
      props.setProperty('corTrocadas', String(trocadas));
      ScriptApp.newTrigger('corrigirDatasHistorico').timeBased().after(60 * 1000).create();
      console.log('Pausado na linha ' + linha + ' de ' + ultima + '. Continua sozinho em 1 minuto.');
      return;
    }
    const qtd = Math.min(COR_BLOCO, ultima - linha + 1);
    const datas = aba.getRange(linha, COR_COL_DATA, qtd, 1).getValues();
    const importacoes = aba.getRange(linha, COR_COL_IMPORT, qtd, 1).getValues();

    const saida = datas.map((l, i) => {
      const d = corPartes(l[0]);
      const ref = corPartes(importacoes[i][0]);
      if (!d) return [l[0]];
      let escolhida = d;
      if (ref && d.dia <= 12 && d.dia !== d.mes) {
        const trocada = { ano: d.ano, mes: d.dia, dia: d.mes };
        if (Math.abs(corDias(trocada) - corDias(ref)) < Math.abs(corDias(d) - corDias(ref))) {
          escolhida = trocada;
          trocadas++;
        }
      }
      return [String(escolhida.dia).padStart(2, '0') + '/' + String(escolhida.mes).padStart(2, '0') + '/' + escolhida.ano];
    });

    aba.getRange(linha, COR_COL_DATA, qtd, 1).setValues(saida);
    SpreadsheetApp.flush();
    linha += qtd;
    console.log('Conferidas até a linha ' + (linha - 1) + ' de ' + ultima);
  }

  props.deleteProperty('corProximaLinha');
  props.deleteProperty('corTrocadas');
  console.log('Concluído: ' + (ultima - 1) + ' linhas conferidas, ' + trocadas + ' datas corrigidas.');
}

function corApagarGatilho() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'corrigirDatasHistorico')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// Lê dia, mês e ano no horário de Brasília (rápido, sem Utilities.formatDate)
function corPartes(v) {
  if (v instanceof Date) {
    const local = new Date(v.getTime() + COR_FUSO_H * 3600000);
    return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() + 1, dia: local.getUTCDate() };
  }
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? { dia: Number(m[1]), mes: Number(m[2]), ano: Number(m[3]) } : null;
}

function corDias(p) {
  return Date.UTC(p.ano, p.mes - 1, p.dia) / 86400000;
}

// Rode UMA vez: corrige o "Carimbo de data/hora" das linhas trazidas da planilha antiga
// (lá o padrão americano trocou dia e mês). A data certa é lida de novo do formulário.
function corrigirDatasDirecionamento() {
  const origem = opAbaPorGid(SpreadsheetApp.openById(DIR_ORIGEM_ID), DIR_ORIGEM_GID);
  const mapa = {};
  origem.getDataRange().getDisplayValues().slice(1).forEach(l => { mapa[dirHash(l)] = l[0]; });

  const destino = opAbaPorGid(SpreadsheetApp.openById(OP_DESTINO_ID), DIR_DESTINO_GID);
  const cab = destino.getRange(1, 1, 1, destino.getLastColumn()).getValues()[0];
  const colChave = cab.indexOf('Chave') + 1;
  if (!colChave) throw new Error('Coluna "Chave" não encontrada na aba Direcionamento Manual.');

  const n = destino.getLastRow() - 1;
  const chaves = destino.getRange(2, colChave, n, 1).getValues();
  const atuais = destino.getRange(2, 1, n, 1).getValues();
  let corrigidas = 0;
  const saida = chaves.map((k, i) => {
    const base = String(k[0]).split(':')[0];
    if (base in mapa) { corrigidas++; return [mapa[base]]; }
    return [atuais[i][0]]; // resposta não existe mais no formulário: mantém como está
  });

  destino.getRange(2, 1, n, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  destino.getRange(2, 1, n, 1).setValues(saida);
  console.log(n + ' linhas conferidas: ' + corrigidas + ' datas regravadas a partir do formulário, ' + (n - corrigidas) + ' sem correspondência.');
}

// ---------- Base Inventário (CSV exportado do sistema, todo dia) ----------
const BINV_PASTA_ID       = '1DwoP6MnKzcNyncIdXN99dTGnK6OiyZOG'; // pasta "Importar Inventário"
const BINV_PROCESSADOS_ID = '1did_nU3myYJkPGvUf0i8GXO3BMrBAOBg'; // subpasta "Processados"
const BINV_ABA_GID        = 1988849431;                          // aba "Base Inventário"
const BINV_CABECALHO      = ['Pacote', 'Data de Escaneamento', 'Situação', 'Área', 'Operador', 'Comentário',
                             'Data', 'Hora', 'Arquivo', 'Importado em', 'Chave'];
const BINV_MESES          = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

// Importa todos os CSV da pasta (do mais antigo ao mais novo) e move cada um para "Processados"
function importarBaseInventario() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4 * 60 * 1000)) return; // espera a outra importação terminar

  try {
    const pasta = DriveApp.getFolderById(BINV_PASTA_ID);
    const processados = DriveApp.getFolderById(BINV_PROCESSADOS_ID);
    const arquivos = [];
    const it = pasta.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (!/\.csv$/i.test(f.getName()) && f.getMimeType() !== MimeType.CSV) continue;
      if (Date.now() - f.getLastUpdated().getTime() < 3 * 60 * 1000) continue; // ainda sincronizando: pega na próxima
      arquivos.push(f);
    }
    if (!arquivos.length) { console.log('Base Inventário: nenhum arquivo pronto na pasta'); return; }
    // (arquivos que não são de inventário são pulados abaixo e ficam para importarRelatorios)
    arquivos.sort((a, b) => a.getDateCreated() - b.getDateCreated());

    const destino = opAbaPorGid(SpreadsheetApp.openById(OP_DESTINO_ID), BINV_ABA_GID);
    if (destino.getLastRow() === 0) destino.appendRow(BINV_CABECALHO);

    // Chaves já gravadas (evita duplicar se o mesmo arquivo for enviado duas vezes)
    const colChave = BINV_CABECALHO.length;
    const ultima = destino.getLastRow();
    const existentes = {};
    if (ultima > 1) {
      destino.getRange(2, colChave, ultima - 1, 1).getValues().flat()
        .forEach(k => existentes[k] = (existentes[k] || 0) + 1);
    }

    const agora = new Date();
    let total = 0;
    for (const arquivo of arquivos) {
      let conteudo;
      try {
        conteudo = binvLerCsv(arquivo);
      } catch (e) {
        console.log('Base Inventário: não consegui ler ' + arquivo.getName() + ' agora (' + e.message + '). Tento de novo na próxima execução.');
        continue;
      }
      // A pasta também recebe Aduana, Carrinho e Problem Solving (importar-relatorios.gs): só pega o que é Inventário
      if (!binvEhInventario(conteudo[0] || [])) continue;
      const linhas = conteudo.slice(1).filter(l => l.some(c => String(c).trim() !== ''));
      const vistos = {};
      const novas = [];
      for (const l of linhas) {
        const orig = l.slice(0, 6).concat(Array(Math.max(0, 6 - l.length)).fill(''));
        const k = dirHash(orig);
        vistos[k] = (vistos[k] || 0) + 1;
        if (vistos[k] <= (existentes[k] || 0)) continue; // já importada
        const { data, hora } = binvDataHora(orig[1], arquivo.getDateCreated());
        novas.push([...orig, data, hora, arquivo.getName(), agora, k]);
      }
      if (novas.length) {
        const inicio = destino.getLastRow() + 1;
        const faltam = inicio + novas.length - 1 - destino.getMaxRows();
        if (faltam > 0) destino.insertRowsAfter(destino.getMaxRows(), faltam);
        destino.getRange(inicio, 1, novas.length, BINV_CABECALHO.length).setValues(novas);
        Object.keys(vistos).forEach(k => existentes[k] = Math.max(existentes[k] || 0, vistos[k]));
      }
      arquivo.moveTo(processados);
      total += novas.length;
      console.log('Base Inventário: ' + arquivo.getName() + ' -> ' + novas.length + ' linhas novas de ' + linhas.length);
    }
    console.log('Base Inventário: ' + total + ' linhas importadas');
  } finally {
    lock.releaseLock();
  }
}

// Cabeçalho do CSV do Inventário: "Pacote","Data de Escaneamento","Situação","Área","Operador","Comentário"
function binvEhInventario(cab) {
  const n = cab.map(c => String(c).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());
  return n.includes('pacote') && n.includes('data de escaneamento') && n.includes('situacao');
}

// Lê o CSV em UTF-8 (ou no formato do Excel em português, se tiver sido salvo pelo Excel)
function binvLerCsv(arquivo) {
  const blob = arquivo.getBlob();
  let texto = blob.getDataAsString('UTF-8');
  if (texto.includes(String.fromCharCode(0xFFFD))) texto = blob.getDataAsString('windows-1252');
  texto = texto.replace(new RegExp('^' + String.fromCharCode(0xFEFF)), ''); // remove a marca BOM
  const primeira = texto.split(/\r?\n/)[0];
  const separador = primeira.split(';').length > primeira.split(',').length ? ';' : ',';
  return Utilities.parseCsv(texto, separador);
}

// "09:37pm | 16/nov" -> data "16/11/2026" e hora "21:37"
function binvDataHora(texto, dataArquivo) {
  const m = String(texto).toLowerCase().match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*\|\s*(\d{1,2})\/([a-zç]{3})/);
  if (!m) return { data: '', hora: '' };
  let h = Number(m[1]) % 12;
  if (m[3] === 'pm') h += 12;
  const dia = Number(m[4]);
  const mes = BINV_MESES[m[5]];
  if (!mes) return { data: '', hora: '' };
  // O arquivo não traz o ano: usa o ano do envio (dezembro enviado em janeiro fica no ano anterior)
  let ano = dataArquivo.getFullYear();
  if (mes > dataArquivo.getMonth() + 1) ano--;
  return {
    data: String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + ano,
    hora: String(h).padStart(2, '0') + ':' + m[2]
  };
}

// Rode UMA vez para ativar a importação automática a cada 15 minutos (não mexe nos outros gatilhos)
function criarGatilhoBaseInventario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'importarBaseInventario')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importarBaseInventario').timeBased().everyMinutes(15).create();
  console.log('Gatilho da Base Inventário criado (a cada 15 minutos)');
}