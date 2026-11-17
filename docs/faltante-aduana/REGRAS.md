# Regras de classificação — Faltante Aduana (SSP53)

Fonte da verdade das regras (em português). Cada regra vive em 3 lugares, cada um com um papel:

| Onde | O que fica lá | Quem muda |
|---|---|---|
| **Aba `Regras`** da planilha principal | Ordem, Código, Ligada (Sim/Não), Pergunta, Resultado, Observação, Abas usadas | **o Rafael, sozinho** |
| `js/faltantes-regras.js` (objeto `LOGICA`) neste app | o que cada regra verifica na linha do tempo, pelo Código (o mesmo arquivo roda na tela e no servidor) | o Claude |
| este arquivo | a explicação de cada regra, para consulta | o Claude, a cada regra nova/alterada |

**Sem mexer em código o Rafael pode:** mudar a ordem (a primeira regra que bater classifica o pacote), desligar uma
regra (Ligada = Não), mudar o texto do Resultado e a Observação. O painel mostra a lista em **"Regras em uso"**, com
quantos pacotes do dia caíram em cada uma. Mudança na aba vale no próximo **Atualizar agora**.
**Mudar o que a regra verifica** (a pergunta em si) ou criar regra nova: pedir ao Claude. Regra que está na aba mas
ainda não tem lógica no código aparece como "sem lógica ainda — pedir ao Claude" e é pulada.

**Como o painel monta cada pacote:** faltante = linha da aba **Aduana** com Estado "Faltante" no dia analisado.
Tudo começa no **sorting**: a linha do tempo começa no **primeiro bipe do pacote no dia na aba Histórico** (qualquer
processo — sorting ou conteinerização) e vai até **48 h depois** (era 36 h até 17/11/2026), juntando Histórico, Auditoria de Carrinho, Aduana,
Problem Solving, Inventário, Torre Aduana e Direcionamento Manual. Passadas as 48 h, não entra mais nada daquele pacote.
Sem bipe no Histórico no dia: a linha do tempo começa à 00:00 e o pacote ganha a etiqueta "sem sorting no dia".
As regras olham essa linha do tempo. A mesma regra vale para separáveis e volumosos.

O que nenhuma regra cobrir fica **Regra em aberto** e o Rafael classifica no painel (aba `Classificação manual`),
que sempre vence a regra.

### Classificação manual × regra
A manual vence. Se depois uma regra passar a dar outro resultado, o painel mostra o conflito e pergunta qual manter
("Manter a minha" grava a coluna F "Regra conferida"; "Usar a regra" apaga a manual). Se a regra mudar de novo, pergunta de novo.

### Como mandar uma regra nova (modelo)
- **Pergunta** (se SIM, o pacote para aqui): ex. "Depois do sorting, o próximo bipe foi avaria com dano Produto e Não reparado?"
- **Resultado**: ex. "PRODUTO AVARIADO"
- **Onde olhar**: abas e colunas (ex. Problem Solving › Problema = "Pacote avariado", Resolução = "Não reparado")
- **Exemplo**: um Shipment ID e o dia em que isso aconteceu (para testar)
- **Ordem**: antes/depois de qual regra

## Regras vigentes

Regras iniciais mandadas pelo Rafael em 08/11/2026. Todas exigem que o pacote tenha sido **bipado no Histórico no dia**
e olham só a janela de 48 h. "Faltante na aduana" é verdade para todo pacote do painel. Ordem = a que o Rafael mandou
(muda na aba `Regras`).

| Ordem | Código | Pergunta (se SIM, o pacote para aqui) | Resultado | Abas usadas |
|---|---|---|---|---|
| 1 | R01 | Bipado no Histórico e encontrado na Torre **A mais em outra rota**? | Erro de Conteinerização | Histórico, Torre Aduana, Aduana |
| 2 | R02 | Bipado no Histórico e bipado no **Direcionamento Manual**? Vale com qualquer resultado na auditoria de carrinho (faltante, pendente ou correto) e mesmo se deu faltante na torre e na aduana. | o conteúdo da **coluna 3 (STATUS)** do Direcionamento Manual (ex.: SEM ROTAS) | Histórico, Direcionamento Manual |
| 3 | R03 | Bipado no Histórico, faltante na Aduana e na Torre, e **logo depois Verificado no Inventário**? | Erro de Conteinerização | Histórico, Aduana, Torre Aduana, Inventário |
| 4 | R04 | Bipado no Histórico, faltante na Aduana e na Torre (bipado ou não na auditoria de carrinho) e depois **Problem Solving: Problema = pacote avariado e Resolução = não reparado**? | Pacote Avariado | Histórico, Aduana, Torre Aduana, Problem Solving |
| 5 | R05 | Bipado no Histórico, depois **Pendente, Faltante ou não bipado na auditoria de carrinho**, **Faltante na Aduana na rota de origem** e **A mais na Aduana em outra rota**? (09/11) | Erro de Conteinerização | Histórico, Auditoria de Carrinho, Aduana |
| 6 | R06 | Bipado no Histórico, depois **Pendente, Faltante ou não bipado na auditoria de carrinho**, **Faltante na Aduana** e **logo em seguida Verificado no Inventário** (com ou sem Faltante na Torre)? (11/11) | Erro de Conteinerização | Histórico, Auditoria de Carrinho, Aduana, Torre Aduana, Inventário |
| 7 | R07 | Bipado no Histórico, **bipado ou não na auditoria de carrinho** (qualquer resultado), **Faltante na Aduana** e **logo depois bipado no Histórico**? (17/11) | Erro de Conteinerização | Histórico, Auditoria de Carrinho, Aduana |
| 8 | R08 | Bipado no Histórico, **A mais na Auditoria de Carrinho** (achado no carrinho de outra vaga) e **Faltante na Aduana**? (17/11) | Erro de Conteinerização + Erro de Auditoria de Carrinho | Histórico, Auditoria de Carrinho, Aduana |

**Complemento de auditoria (17/11):** quando o pacote cai na **R01, R03 ou R07** e a Auditoria de Carrinho deu **A mais** (achado no carrinho de outra vaga), o resultado passa a ser **Erro de Conteinerização + Erro de Auditoria de Carrinho** (o código da regra continua R01/R03/R07). A R08 pega o mesmo caso quando nenhuma regra antes se aplicou.

Regra nova que entra no código e ainda não está na aba `Regras` passa a valer sozinha, **no fim da lista**. Para mudar a
ordem ou desligar, ponha/edite a linha dela na aba.

**Como o painel verifica (detalhe técnico):**
- *Torre*: coluna `Estado aduana` ("A mais" / "Faltante"); rota = `Gaiola (rota otim,)`, comparada com `ID da rota` da Aduana
  (mesmo formato, ex. A1_AM1). Horário do evento = `Concluido em`.
- *R01*: algum registro da Torre "A mais" com rota diferente da rota em que faltou.
- *R02*: primeiro registro do pacote no Direcionamento Manual dentro da janela; o resultado é o `STATUS`.
  Linhas do Direcionamento **sem Carimbo de data/hora** não entram na linha do tempo, então a R02 não as vê.
- *R03*: tem "Faltante" na Torre e o **primeiro** registro do Inventário depois disso tem `Situação` = Verificados.
- *R04*: tem "Faltante" na Torre e algum registro do Problem Solving com `Problema` contendo "avaria" e `Resolução`
  contendo "não reparado" (sem diferenciar maiúscula/acento).
- *R05*: na Auditoria de Carrinho, nenhum registro na janela **ou** só "Pendente"/"Faltante" (se tiver "Correto" ou
  "A mais", não vale); e na aba Aduana algum registro "A mais" com `ID da rota` diferente da rota em que faltou.
  É o mesmo caso da R01 visto pela Aduana em vez da Torre; como a R01 vem antes, quando os dois batem aparece R01.
- *R06*: carrinho como na R05 (nenhum registro ou só Pendente/Faltante); o **primeiro** registro do Inventário depois do
  Faltante na Aduana tem `Situação` = Verificados. A Torre não é exigida (só aparece no detalhe). Parecida com a R03
  (que exige Faltante na Torre e não olha o carrinho); como a R03 vem antes, quando as duas batem aparece R03.
- *R07*: depois do registro "Faltante" na Aduana, o **próximo** registro da linha do tempo é um bipe no Histórico (qualquer
  processo). Para achar o "próximo", **não contam** a Torre Aduana nem outros registros da própria Aduana (são a mesma
  conferência). Se antes do bipe aparecer Inventário, Problem Solving, Direcionamento ou Auditoria de Carrinho, **não vale**.
  O carrinho pode ter qualquer resultado (ou nenhum) e só aparece no detalhe. Fica por último: as regras mais específicas
  (R01 a R06) decidem antes.
- *Carrinho A mais* (complemento da R01/R03/R07 e R08): algum registro da Auditoria de Carrinho com `Estado` = A mais,
  em qualquer vaga (`Gaiola`), antes ou depois do faltante na Aduana, dentro da janela. O detalhe mostra a vaga.

---

## Anexo — regras antigas (NÃO usadas)
Regras do fluxograma "Regras do Faltante Volumoso" (artefato no claude.ai, 14 regras, até 07/11/2026).
O Rafael decidiu em 07/11 trocar por regras novas; ficam aqui só como referência.

### Separação inicial
1. **Saiu A MAIS em outra vaga?** (Torre de Aduana) → Sim: Regra 1
2. **Bipado no sorting no dia?** → Não: Regra 2 · Sim: Regra 3

### Regra 1 — saiu a mais em outra vaga (vale com ou sem bipe no sorting)
| # | Código | Pergunta | Resultado | Tipo |
|---|---|---|---|---|
| r01 | P01 caso 2 | Vários pacotes da mesma rota a mais na torre? | ERRO NA PUXADA | erro |
| r02 | P01 caso 1 | (senão) | ERRO DE CONTEINERIZAÇÃO | erro |

### Regra 2 — sem bipe no sorting
| # | Código | Pergunta | Resultado | Tipo | Observação |
|---|---|---|---|---|---|
| r03 | P02 sem sorting | Avaria: dano Produto e Não reparado? | PRODUTO AVARIADO | avariado | Produto danificado, não volta para a operação |
| r04 | P05 / P06 | Está na aba Tratativa? | PACOTE PERDIDO + coluna S | perdido | **Provisória**: você vai procurar onde foram bipados |
| r05 | P07 | (senão) | REGRA EM ABERTO | aberto | Caso: 48364043262 |

### Regra 3 — com bipe no sorting (ordem de avaliação)
| Ordem | # | Código | Pergunta | Resultado | Tipo | Observação |
|---|---|---|---|---|---|---|
| 5.4 | r14 | Etiqueta blanca | Próximo bipe: Etiqueta blanca na Solução de problemas e bipado no sorting no mesmo dia ou no seguinte? | ERRO DE PUXADA, ETIQUETA BLANCA | erro | Não deu rota, mas o produto deveria ir para a vaga para ser bipado na aduana |
| 5.5 | r13 | Solução | Próximo bipe foi em Solução de problemas? | Coluna B + coluna K (ex.: Pacote desconteinerizado, Não cabe no veículo) | análise | Vale com ou sem auditoria de carrinho; avaria com dano Produto/Não reparado continua Produto avariado |
| 6 | r06 | — | Bipado na auditoria de carrinho (Correto/A mais)? | Não se aplica → segue | — | Pendente ou Faltante na auditoria conta como NÃO bipado. Se **não** bipado → Regra 4 |
| 7 | r07 | P02 | Próximo bipe: avaria, dano Produto, Não reparado? | PRODUTO AVARIADO | avariado | |
| 8 | r08 | Deslocado | Deslocado/Verificado em Problem Solving e sorting no dia seguinte? | PACOTE NO INVENTÁRIO - DESLOCADO - OK | ok | Sem bipe no dia seguinte: mostra só área e situação |
| 11 | r11 | P04 | Só Pendente no inventário e está na Tratativa? | PACOTE PERDIDO + coluna S | perdido | Significado dos status do inventário a confirmar |
| 12 | r12 | — | Depois do sorting, só aparece na Tratativa? | PACOTE PERDIDO + coluna S | perdido | |
| — | — | — | (senão) | REGRA EM ABERTO | aberto | |

### Regra 4 — com sorting, NÃO bipado na auditoria de carrinho (ramo de r06)
| # | Código | Pergunta | Resultado | Tipo | Observação |
|---|---|---|---|---|---|
| r09 | P03 regra 1 | Próximo bipe foi no Sorting? | ERRO DE CONTEINERIZAÇÃO + erro na auditoria | erro | Regra 2 do P03 (cobertura da auditoria por rota, separável × volumoso) ainda a verificar |
| r10 | P03 sub-regra | Próximo bipe: inventário e logo depois sorting? | ERRO DE CONTEINERIZAÇÃO + erro na auditoria | erro | |
| — | — | (senão) | REGRA EM ABERTO | aberto | |

### Resultados conhecidos (lista do painel)
- Erros de processo: Erro de conteinerização · Erro de conteinerização + erro na auditoria · Erro na puxada · Erro de puxada, etiqueta blanca · Erro de aduana
- Perdido: Pacote perdido · Pacote Perdido Risco de Allowance
- Outros: Produto avariado · Abertura de Caso PS/Avaria Após Iniciar Aduana · Pacote no inventário - deslocado - ok

### Pendências (da versão antiga)
- Histórico de sorting de 29/10 com exatamente 25.000 linhas: confirmar com quem alimenta a planilha de Conteneirização.
- Regra 2 do P03: precisa da base com o tipo (separável × volumoso) de todos os pacotes da rota.
- Ponte: Aduana importa só A:N e Tratativa só A:T — decidir se volta para A:Z e A:AI.
- P05/P06 sem bipe no sorting: regra provisória.
- P07 (48364043262): regra em aberto.
- Regras para **separáveis** ainda não estão documentadas aqui (estavam só no código do painel antigo).
