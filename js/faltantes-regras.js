/**
 * REGRAS DE CLASSIFICAÇÃO — Painel de Faltantes SSP53
 *
 * Como as regras se dividem:
 *   • Aba "Regras" da planilha (o Rafael edita sozinho): Ordem, Código, Ligada (Sim/Não), Pergunta, Resultado,
 *     Observação, Abas usadas. Muda a ordem, liga/desliga e o texto do resultado sem mexer aqui.
 *   • ESTE arquivo: só O QUE CADA REGRA VERIFICA (objeto LOGICA, uma função por Código).
 *   • Texto em português de cada regra: regras/REGRAS.md (fonte da verdade).
 *
 * Cada pacote (p) tem:
 *   p.id                 Shipment ID
 *   p.dia                dia analisado, "dd/mm/aaaa"
 *   p.aduana             linha da aba Aduana que marcou o faltante (campos pelo nome da coluna)
 *   p.temSorting         true se o pacote teve bipe no Histórico (sorting) no dia analisado
 *   p.inicio / p.fim     começo e fim da janela (Date): 1º bipe do Histórico no dia até 48 h depois
 *   p.janelaFechada      true se as 48 h já passaram (não entra mais nada)
 *   p.eventos            linha do tempo, em ordem de horário. Cada evento:
 *        { quando: Date, fonte: 'historico'|'carrinho'|'aduana'|'ps'|'inventario'|'torre'|'direcionamento',
 *          texto: 'resumo legível', dados: { 'Nome da coluna': 'valor', ... } }
 *
 * Funções de ajuda (A.xxx) para escrever as regras: ver o objeto A abaixo.
 */
(function () {
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const A = {
    norm,
    /** Todos os eventos de uma aba (fonte). */
    eventosDe: (p, fonte) => p.eventos.filter((e) => e.fonte === fonte),
    /** Próximo evento depois de outro (opcionalmente só de uma fonte). */
    depois: (p, ev, fonte) => p.eventos.find((e) => e.quando > ev.quando && (!fonte || e.fonte === fonte)) || null,
    /** O bipe de sorting que abriu a linha do tempo (ou null). */
    primeiroSorting: (p) => p.ancora || null,
    /** Próximo bipe depois do sorting inicial, ignorando outros bipes do próprio Histórico se pularHistorico. */
    proximoBipe: (p, pularHistorico) => {
      const ini = p.ancora; if (!ini) return null;
      return p.eventos.find((e) => e.quando >= ini.quando && e !== ini && (!pularHistorico || e.fonte !== 'historico')) || null;
    },
    /** Tem algum evento da aba com as colunas iguais ao filtro? Ex.: A.temNaAba(p, 'ps', { 'Problema': 'Pacote avariado' }) */
    temNaAba: (p, fonte, filtro) => p.eventos.some((e) => e.fonte === fonte &&
      Object.keys(filtro || {}).every((k) => norm(e.dados[k]) === norm(filtro[k]))),
    /** Rota em que o pacote deu faltante na Aduana (ex.: "A1_AM1"). */
    rotaFaltante: (p) => String((p.aduana && p.aduana['ID da rota']) || '').trim(),
    /** Eventos da Torre Aduana com o Estado aduana pedido ("faltante", "a mais"). */
    torre: (p, estado) => p.eventos.filter((e) => e.fonte === 'torre' && norm(e.dados['Estado aduana']) === norm(estado)),
    /** Rota da Torre: Gaiola (rota otim,) ou, se vazia, a parte antes do "|" da coluna Rota. */
    rotaTorre: (e) => String(e.dados['Gaiola (rota otim,)'] || String(e.dados['Rota'] || '').split('|')[0]).trim(),
    /** Auditoria de Carrinho: registro "A mais" (o pacote foi achado no carrinho de outra vaga), em qualquer vaga. */
    carrinhoAMais: (p) => p.eventos.find((e) => e.fonte === 'carrinho' && norm(e.dados['Estado']) === 'a mais') || null,
  };

  const ERRO_AUDITORIA = 'Erro de Conteinerização + Erro de Auditoria de Carrinho';
  /** R01, R03 e R07 ganham o complemento quando o carrinho deu "A mais" (17/11). */
  const comAuditoria = (p, detalhe) => {
    if (!detalhe) return detalhe;
    const c = A.carrinhoAMais(p);
    if (!c) return detalhe;
    return { resultado: ERRO_AUDITORIA, detalhe: String(detalhe).replace(/ · carrinho: [^·]*$/, '') + ' · carrinho: A mais na vaga ' + (c.dados['Gaiola'] || '?') + ' (faltou na Aduana na ' + (A.rotaFaltante(p) || '?') + ')' };
  };

  /*
   * LÓGICA DE CADA REGRA (pelo Código da aba Regras). Devolve:
   *   false/null  → a regra não vale, passa para a próxima;
   *   true        → vale (resultado = coluna Resultado da aba);
   *   'texto'     → vale, e o texto aparece como detalhe embaixo do resultado;
   *   { resultado, detalhe } → vale e troca o resultado (ex.: R02 mostra o STATUS do Direcionamento).
   * Todas exigem bipe no Histórico (sorting) no dia. Explicação de cada uma: regras/REGRAS.md.
   */
  const LOGICA = {
    // R01 — Torre: A MAIS em outra rota → Erro de Conteinerização
    'R01': (p) => {
      if (!p.temSorting) return false;
      const rf = norm(A.rotaFaltante(p));
      const e = A.torre(p, 'a mais').find((x) => A.rotaTorre(x) && norm(A.rotaTorre(x)) !== rf);
      return comAuditoria(p, e ? 'A mais na Torre na rota ' + A.rotaTorre(e) + ' (faltou na ' + (A.rotaFaltante(p) || '?') + ')' : false);
    },
    // R02 — bipado no Direcionamento Manual → resultado = coluna 3 (STATUS) do Direcionamento
    'R02': (p) => {
      if (!p.temSorting) return false;
      const e = A.eventosDe(p, 'direcionamento')[0];
      if (!e) return false;
      const st = String(e.dados['STATUS'] || '').trim();
      return { resultado: st || 'Direcionamento manual (STATUS em branco)', detalhe: 'Direcionamento manual · ' + (e.texto || '') };
    },
    // R03 — faltante na Torre e, logo depois, Verificado no Inventário → Erro de Conteinerização
    'R03': (p) => {
      if (!p.temSorting) return false;
      const f = A.torre(p, 'faltante')[0];
      if (!f) return false;
      const inv = p.eventos.find((e) => e.fonte === 'inventario' && e.quando >= f.quando);
      return comAuditoria(p, inv && norm(inv.dados['Situação']).startsWith('verificad') ? 'Verificado no inventário em ' + ((inv.dados['Área'] || inv.dados['Ârea']) || 'área não informada') : false);
    },
    // R04 — faltante na Torre e Problem Solving: pacote avariado / não reparado → Pacote Avariado
    'R04': (p) => {
      if (!p.temSorting || !A.torre(p, 'faltante').length) return false;
      const e = p.eventos.find((x) => x.fonte === 'ps' && norm(x.dados['Problema']).includes('avaria') &&
        norm(x.dados['Resolução']).includes('nao reparado'));
      return e ? 'Problem Solving: ' + e.dados['Problema'] + ' · ' + e.dados['Resolução'] : false;
    },
    // R05 — carrinho Pendente/Faltante/não auditado, Faltante na Aduana na rota de origem e A MAIS na Aduana em outra rota
    //       → Erro de Conteinerização (a R01 é o mesmo caso visto pela Torre)
    'R05': (p) => {
      if (!p.temSorting) return false;
      const car = A.eventosDe(p, 'carrinho');
      if (car.some((e) => !['pendente', 'faltante'].includes(norm(e.dados['Estado'])))) return false; // Correto / A mais no carrinho
      const rf = norm(A.rotaFaltante(p));
      const e = A.eventosDe(p, 'aduana').find((x) => norm(x.dados['Estado']) === 'a mais' &&
        String(x.dados['ID da rota'] || '').trim() && norm(x.dados['ID da rota']) !== rf);
      if (!e) return false;
      const carTxt = car.length ? [...new Set(car.map((x) => x.dados['Estado']))].join('/') : 'não auditado';
      return 'A mais na Aduana na rota ' + e.dados['ID da rota'] + ' (faltou na ' + (A.rotaFaltante(p) || '?') + ') · carrinho: ' + carTxt;
    },
    // R06 — carrinho Pendente/Faltante/não auditado, Faltante na Aduana e logo em seguida Verificado no Inventário
    //       (com ou sem Faltante na Torre) → Erro de Conteinerização (a R03 é o caso com Torre, sem olhar o carrinho)
    'R06': (p) => {
      if (!p.temSorting) return false;
      const car = A.eventosDe(p, 'carrinho');
      if (car.some((e) => !['pendente', 'faltante'].includes(norm(e.dados['Estado'])))) return false; // Correto / A mais no carrinho
      const f = A.eventosDe(p, 'aduana').find((x) => norm(x.dados['Estado']) === 'faltante');
      if (!f) return false;
      const inv = p.eventos.find((e) => e.fonte === 'inventario' && e.quando >= f.quando); // 1º inventário depois do faltante
      if (!inv || !norm(inv.dados['Situação']).startsWith('verificad')) return false;
      const carTxt = car.length ? [...new Set(car.map((x) => x.dados['Estado']))].join('/') : 'não auditado';
      return 'Verificado no inventário em ' + ((inv.dados['Área'] || inv.dados['Ârea']) || 'área não informada') + ' depois do faltante na Aduana' +
        (A.torre(p, 'faltante').length ? ' (faltante também na Torre)' : '') + ' · carrinho: ' + carTxt;
    },
    // R07 — qualquer resultado na auditoria de carrinho, Faltante na Aduana e o PRÓXIMO registro é um bipe no Histórico
    //       → Erro de Conteinerização. "Próximo" ignora Torre e outros registros da Aduana (mesma conferência). (17/11)
    'R07': (p) => {
      if (!p.temSorting) return false;
      const i = p.eventos.findIndex((x) => x.fonte === 'aduana' && norm(x.dados['Estado']) === 'faltante');
      if (i < 0) return false;
      const prox = p.eventos.slice(i + 1).find((e) => e.fonte !== 'torre' && e.fonte !== 'aduana');
      if (!prox || prox.fonte !== 'historico') return false;
      const car = A.eventosDe(p, 'carrinho');
      const carTxt = car.length ? [...new Set(car.map((x) => x.dados['Estado']))].join('/') : 'não auditado';
      const hora = prox.quando instanceof Date ? String(prox.quando.getHours()).padStart(2, '0') + ':' + String(prox.quando.getMinutes()).padStart(2, '0') : '';
      return comAuditoria(p, 'Bipado no Histórico' + (hora ? ' às ' + hora : '') + (prox.dados['Processo'] ? ' (' + prox.dados['Processo'] + ')' : '') +
        ' logo depois do faltante na Aduana · carrinho: ' + carTxt);
    },
    // R09 — bipado no sorting, Faltante na Aduana e o ÚLTIMO registro do Inventário (depois do faltante, dentro das 48 h)
    //       é "Pendente": o pacote continuava sem ser achado → Risco de Allowance. Verificado depois = não entra. (18/11)
    'R09': (p) => {
      if (!p.temSorting) return false;
      const i = p.eventos.findIndex((x) => x.fonte === 'aduana' && norm(x.dados['Estado']) === 'faltante');
      if (i < 0) return false;
      const inv = p.eventos.slice(i + 1).filter((e) => e.fonte === 'inventario');
      const ult = inv[inv.length - 1];
      if (!ult || !norm(ult.dados['Situação']).startsWith('pendente')) return false;
      const q = ult.quando instanceof Date ? String(ult.quando.getDate()).padStart(2, '0') + '/' + String(ult.quando.getMonth() + 1).padStart(2, '0') + ' ' +
        String(ult.quando.getHours()).padStart(2, '0') + ':' + String(ult.quando.getMinutes()).padStart(2, '0') : '';
      return 'Último registro no inventário: Pendente' + (q ? ' em ' + q : '') + ((ult.dados['Área'] || ult.dados['Ârea']) ? ' (' + (ult.dados['Área'] || ult.dados['Ârea']) + ')' : '') +
        (inv.length > 1 ? ' · ' + inv.length + ' registros no inventário' : '');
    },
    // R08 — "A mais" na Auditoria de Carrinho (achado no carrinho de outra vaga) e Faltante na Aduana (sem cair numa regra antes)
    //       → Erro de Conteinerização + Erro de Auditoria de Carrinho. (17/11)
    'R08': (p) => {
      if (!p.temSorting) return false;
      const c = A.carrinhoAMais(p);
      return c ? 'Carrinho: A mais na vaga ' + (c.dados['Gaiola'] || '?') + ' · Faltante na Aduana na ' + (A.rotaFaltante(p) || '?') : false;
    },
  };

  /* Regras iniciais, usadas enquanto a aba "Regras" não existe ou está vazia (mesmos campos da aba).
     Mesma lista de REGRAS_INICIAIS em Painel.gs (que grava na aba). */
  const PADRAO = [
    { ordem: 1, codigo: 'R01', ligada: true, resultado: 'Erro de Conteinerização', pergunta: 'Bipado no Histórico e encontrado na Torre A MAIS em outra rota?', observacao: '', abas: 'Histórico, Torre Aduana, Aduana' },
    { ordem: 2, codigo: 'R02', ligada: true, resultado: '(coluna STATUS do Direcionamento Manual)', pergunta: 'Bipado no Histórico e bipado no Direcionamento Manual (qualquer resultado na auditoria de carrinho, torre ou aduana)?', observacao: 'O resultado mostrado é o STATUS do Direcionamento', abas: 'Histórico, Direcionamento Manual' },
    { ordem: 3, codigo: 'R03', ligada: true, resultado: 'Erro de Conteinerização', pergunta: 'Bipado no Histórico, faltante na Aduana e na Torre, e logo depois Verificado no Inventário?', observacao: '', abas: 'Histórico, Aduana, Torre Aduana, Inventário' },
    { ordem: 4, codigo: 'R04', ligada: true, resultado: 'Pacote Avariado', pergunta: 'Bipado no Histórico, faltante na Aduana e na Torre, e depois Problem Solving: pacote avariado / não reparado?', observacao: 'Com ou sem auditoria de carrinho', abas: 'Histórico, Aduana, Torre Aduana, Problem Solving' },
    { ordem: 5, codigo: 'R05', ligada: true, resultado: 'Erro de Conteinerização', pergunta: 'Bipado no Histórico, Pendente/Faltante ou não bipado na auditoria de carrinho, Faltante na Aduana na rota de origem e A MAIS na Aduana em outra rota?', observacao: '', abas: 'Histórico, Auditoria de Carrinho, Aduana' },
    { ordem: 6, codigo: 'R06', ligada: true, resultado: 'Erro de Conteinerização', pergunta: 'Bipado no Histórico, Pendente/Faltante ou não bipado na auditoria de carrinho, Faltante na Aduana e logo em seguida Verificado no Inventário (com ou sem Faltante na Torre)?', observacao: '', abas: 'Histórico, Auditoria de Carrinho, Aduana, Torre Aduana, Inventário' },
    { ordem: 7, codigo: 'R07', ligada: true, resultado: 'Erro de Conteinerização', pergunta: 'Bipado no Histórico, bipado ou não na auditoria de carrinho, Faltante na Aduana e logo depois bipado no Histórico?', observacao: '"Logo depois" = o próximo registro depois do faltante (Torre e outros registros da Aduana não contam)', abas: 'Histórico, Auditoria de Carrinho, Aduana' },
    { ordem: 8, codigo: 'R08', ligada: true, resultado: 'Erro de Conteinerização + Erro de Auditoria de Carrinho', pergunta: 'Bipado no Histórico, A mais na Auditoria de Carrinho (achado em outra vaga) e Faltante na Aduana?', observacao: 'R01, R03 e R07 também mostram este resultado quando o carrinho deu A mais', abas: 'Histórico, Auditoria de Carrinho, Aduana' },
    { ordem: 9, codigo: 'R09', ligada: true, resultado: 'Risco de Allowance', pergunta: 'Bipado no sorting, Faltante na Aduana e o último registro no Inventário (dentro das 48 h) é Pendente?', observacao: 'Se depois foi Verificado no inventário, não entra', abas: 'Histórico, Aduana, Inventário' },
  ];

  /** Junta a aba Regras com a LOGICA: cada linha ganha temLogica.
      Regra que existe no código mas ainda não está na aba entra no fim (marcada novaForaDaAba) — para regra nova
      funcionar sem ninguém mexer na planilha. Para desligar, ponha a regra na aba com Ligada = Não. */
  function montar(regrasDaAba) {
    const daAba = Array.isArray(regrasDaAba) && regrasDaAba.length;
    const lista = daAba ? regrasDaAba.slice() : PADRAO;
    if (daAba) {
      const tem = new Set(lista.map((r) => String(r.codigo || '').toUpperCase()));
      PADRAO.filter((r) => !tem.has(r.codigo)).forEach((r) => lista.push(Object.assign({}, r, { novaForaDaAba: true })));
    }
    return lista.map((r) => Object.assign({}, r, { codigo: String(r.codigo || '').toUpperCase(), temLogica: typeof LOGICA[String(r.codigo || '').toUpperCase()] === 'function' }));
  }

  window.REGRAS = {
    versao: Object.keys(LOGICA).length ? Object.keys(LOGICA).length + ' com lógica no código' : 'aguardando regras novas',
    ajuda: A,
    montar,
    /** Devolve { resultado, codigo, regra, detalhe }. O que nenhuma regra cobrir: "Regra em aberto". */
    classificar(p, regras) {
      for (const r of regras) {
        if (!r.ligada || !r.temLogica) continue;
        try {
          const v = LOGICA[r.codigo](p, A);
          if (!v) continue;
          const obj = typeof v === 'object' ? v : {};
          return { resultado: obj.resultado || r.resultado || r.codigo, codigo: r.codigo, regra: r.codigo + (r.pergunta ? ' · ' + r.pergunta : ''),
            detalhe: typeof v === 'string' ? v : (obj.detalhe || r.observacao || '') };
        } catch (e) {
          console.error('Regra ' + r.codigo + ' falhou no pacote ' + p.id, e);
        }
      }
      const ativas = regras.filter((r) => r.ligada && r.temLogica).length;
      return { resultado: 'Regra em aberto', codigo: '', regra: '', detalhe: ativas ? 'Nenhuma regra se aplicou.' : 'Nenhuma regra ligada ainda.' };
    },
  };
})();
