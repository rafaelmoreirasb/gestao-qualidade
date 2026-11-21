// =====================================================================
//  COLABORADORES — copia a base de usuários para a aba "Colaboradores" da Base SSP53
//  Arquivo do projeto Labor_Sorting (Base SSP53 › Extensões › Apps Script), ao lado do
//  Código.gs e do importar-relatorios.gs. Roda sozinho a cada 1 hora (gatilho atualizarColaboradores).
//
//  Origem: planilha "Base de usuários - SSP53 OFICIAL"
//    - aba "Base de Usuários Fixos (LMS)"  → Tipo DHL
//    - aba "Base de usuários Full"         → Tipo FULL
//    - aba "Base usuários Diaristas"       → Tipo Diaristas
//  Copia SÓ Nome, CPF e User ext (nenhuma outra coluna, nem senha).
//  As colunas são achadas pelo NOME do cabeçalho (NOME, CPF, USER EXT), então inserir uma coluna na origem
//  não quebra nada. Se uma aba não for encontrada, NADA é gravado (a aba Colaboradores fica como estava)
//  e você recebe um e-mail.
//
//  Destino: aba "Colaboradores" da Base SSP53, com as colunas Nome | CPF | User ext | Tipo.
//  O painel Faltante Aduana usa a coluna Nome (lista de nomes em "Responsáveis por ilha").
// =====================================================================

const COL_CONFIG = {
  ORIGEM_ID: '1hKt0GF23F9yFu8rv179RV0l2XJtrd1B0_fOyi7YFWeY',  // Base de usuários - SSP53 OFICIAL
  DESTINO_ID: '1m2rcujuC2w5qIsrm81nBdTgJxZv3HuukhMTtQBmIH8E', // Base SSP53
  ABA_DESTINO: 'Colaboradores',
  CABECALHO: ['Nome', 'CPF', 'User ext', 'Tipo'],
  ABAS: [
    { aba: 'Base de Usuários Fixos (LMS)', tipo: 'DHL' },
    { aba: 'Base de usuários Full', tipo: 'FULL' },
    { aba: 'Base usuários Diaristas', tipo: 'Diaristas' },
  ],
};

// ---------- Função chamada pelo gatilho (a cada 1 hora) ----------
function atualizarColaboradores() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) { console.log('Colaboradores: outro script está gravando. Tento na próxima hora.'); return; }
  try {
    const origem = SpreadsheetApp.openById(COL_CONFIG.ORIGEM_ID);
    const linhas = [];
    const resumo = [];
    for (const cfg of COL_CONFIG.ABAS) {
      const aba = colAcharAba(origem, cfg.aba);
      if (!aba) throw new Error('Aba "' + cfg.aba + '" não encontrada na planilha "' + origem.getName() + '". Abas que existem: ' +
        origem.getSheets().map((s) => s.getName()).join(' | '));
      const lidas = colLerAba(aba, cfg.tipo);
      resumo.push(cfg.tipo + ': ' + lidas.length);
      lidas.forEach((l) => linhas.push(l));
    }
    if (!linhas.length) throw new Error('Nenhum colaborador encontrado nas 3 abas. Nada foi gravado.');
    colGravar(linhas);
    console.log('Colaboradores: ' + linhas.length + ' gravados (' + resumo.join(', ') + ')');
  } catch (e) {
    console.error('Colaboradores: ' + e.message);
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '⚠️ Base SSP53: erro ao atualizar Colaboradores',
        e.message + '\n\nA aba Colaboradores ficou como estava.');
    } catch (e2) { console.error('Não consegui enviar e-mail: ' + e2.message); }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Lê uma aba da origem: acha a linha do cabeçalho (a que tem NOME, CPF e USER EXT) e devolve [Nome, CPF, User ext, Tipo]. */
function colLerAba(aba, tipo) {
  const valores = aba.getDataRange().getDisplayValues();
  let lin = -1, cNome = -1, cCpf = -1, cExt = -1;
  for (let i = 0; i < Math.min(15, valores.length) && lin < 0; i++) {
    const n = valores[i].map(colNorm);
    const a = n.indexOf('nome'), b = n.indexOf('cpf'), c = n.indexOf('user ext');
    if (a >= 0 && b >= 0 && c >= 0) { lin = i; cNome = a; cCpf = b; cExt = c; }
  }
  if (lin < 0) throw new Error('Na aba "' + aba.getName() + '" não achei o cabeçalho com NOME, CPF e USER EXT nas 15 primeiras linhas.');
  const saida = [];
  for (const r of valores.slice(lin + 1)) {
    const nome = String(r[cNome] || '').trim();
    if (!nome || colNorm(nome) === 'nome') continue; // linha vazia ou cabeçalho repetido
    saida.push([nome, String(r[cCpf] || '').trim(), String(r[cExt] || '').trim(), tipo]);
  }
  return saida;
}

/** Grava na aba Colaboradores da Base SSP53 (como texto). Escreve por cima e só depois apaga o que sobrou. */
function colGravar(linhas) {
  const ss = SpreadsheetApp.openById(COL_CONFIG.DESTINO_ID);
  let aba = ss.getSheetByName(COL_CONFIG.ABA_DESTINO) || ss.insertSheet(COL_CONFIG.ABA_DESTINO);
  const dados = [COL_CONFIG.CABECALHO].concat(linhas);
  const nCol = COL_CONFIG.CABECALHO.length;
  if (aba.getMaxRows() < dados.length) aba.insertRowsAfter(aba.getMaxRows(), dados.length - aba.getMaxRows());
  if (aba.getMaxColumns() < nCol) aba.insertColumnsAfter(aba.getMaxColumns(), nCol - aba.getMaxColumns());
  const faixa = aba.getRange(1, 1, dados.length, nCol);
  faixa.setNumberFormat('@');
  faixa.setValues(dados);
  // apaga o que sobrou de antes (linhas abaixo e colunas à direita, ex.: a antiga coluna Matrícula)
  const ultLin = aba.getLastRow(), ultCol = aba.getLastColumn();
  if (ultLin > dados.length) aba.getRange(dados.length + 1, 1, ultLin - dados.length, Math.max(ultCol, nCol)).clearContent();
  if (ultCol > nCol) aba.getRange(1, nCol + 1, Math.max(ultLin, dados.length), ultCol - nCol).clearContent();
  aba.setFrozenRows(1);
}

/** Acha a aba pelo nome sem ligar para maiúsculas, acentos e espaços sobrando. */
function colAcharAba(planilha, nome) {
  const alvo = colNorm(nome);
  return planilha.getSheets().find((s) => colNorm(s.getName()) === alvo) || null;
}

function colNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ---------- Rode UMA vez para ligar a atualização a cada 1 hora (não mexe nos outros gatilhos) ----------
function criarGatilhoColaboradores() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'atualizarColaboradores')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('atualizarColaboradores').timeBased().everyHours(1).create();
  console.log('Gatilho criado: Colaboradores a cada 1 hora');
}
