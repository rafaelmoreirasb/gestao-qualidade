# Faltante Aduana — contexto geral (Fase 10)

Tudo o que é preciso saber sobre a aba **Faltante Aduana** do app. A instalação passo a passo está no
[`LEIAME.md`](../../LEIAME.md), na seção "Fase 10 · Aba Faltante Aduana". Situação em 17/11/2026.

Documentos desta pasta:
- [`REGRAS.md`](REGRAS.md): as regras de classificação;
- [`rotina.md`](rotina.md): a rotina diária;
- [`decisoes.md`](decisoes.md): o histórico de decisões;
- [`importador.md`](importador.md): o importador dos CSV, que continua no Google.

---

## 1. Para que serve
- Para a **reunião diária** da operação SSP53. O painel mostra cada pacote que deu **Faltante na aduana** (aba Aduana da
  planilha, `Estado = Faltante`) num dia.
- Cada pacote tem a **linha do tempo**:
  - começa no **sorting** (o 1º bipe do pacote no dia na aba Histórico, qualquer processo) e vai até **48 h depois** (era 36 h até 17/11/2026);
  - junta Histórico, Auditoria de Carrinho, Aduana, Problem Solving, Inventário, Torre Aduana e Direcionamento Manual;
  - depois das 48 h não entra mais nada;
  - sem bipe no Histórico no dia, a linha do tempo começa à 00:00 e o pacote ganha a etiqueta "sem sorting no dia".
- **Classifica** cada pacote pelas regras R01–R06 ([`REGRAS.md`](REGRAS.md)). O que nenhuma cobre fica **"Regra em aberto"** e é
  classificado à mão. A classificação manual sempre vence a regra; se as duas discordarem, o painel pergunta qual manter.
- Também traz:
  - **semana, mês e dias escolhidos**;
  - **responsável por ilha** em cada dia, para "cobrar" o erro de conteinerização;
  - **Volumoso × Sorting**.
- **Atualiza sozinho**: um bipe que entra à noite aparece na reunião do dia seguinte.

## 2. Como funciona no app

```
4 relatórios do dia (CSV) ─► pasta do Drive "Importar Inventário" ─(Apps Script da Base SSP53, 15 min)─┐
   (Inventário, Aduana, Auditoria de Carrinho, Problem Solving)                                       │
Planilha do Labor ─(script do Histórico, 15 min)──────────────────────────────────────────────────────┤
Planilha do Direcionamento ─(script, 15 min)──────────────────────────────────────────────────────────┼─► BASE SSP53
Torre Aduana, One Bipe (espelho da Base Mirassol Oficial, 1 h; o espelho do Inventário foi desligado em 17/11) ───────────────────────────────────────┘   (Google Sheets)
                                                                                                          ▲ lê e grava
                                     app no Vercel: api/faltantes.js (Google Sheets API, conta de serviço) ┘
                                                    ▲ pedido com o login do app (só Administrador)
                                     aba Faltante Aduana: faltantes.html (numa moldura) + js/faltantes-regras.js
```

- **Os dados ficam na planilha.** O app só lê e apresenta. A classificação manual, os responsáveis e o Resumo diário são
  gravados na planilha.
- O que continua no Google: a planilha e os scripts que a **alimentam** (importador, Histórico, Direcionamento, Torre).
- O que saiu do Google: o painel. Antes ele era um Web App do Apps Script, com o gatilho `painelPreparar`; isso é desligado na
  Fase 10.
- **Cache** (tabela `faltantes_cache` do Supabase, que só o servidor acessa):
  - dia dos últimos 4 dias: 10 min;
  - dia antigo: 6 h;
  - lista de dias: 5 min;
  - nomes, responsáveis e One Bipe: 10 min.
  
  O botão **Atualizar agora** força a releitura.
- **Resumo diário**: sempre que o servidor recalcula um dia, ele regrava as linhas desse dia na aba `Resumo diário`, que é a base
  de semana e mês. Na visão de período, os dias que ainda não estão no resumo são calculados na hora.

## 3. Arquivos (neste repositório)

| Arquivo | O que é |
|---|---|
| `faltantes.html` | A tela do painel (abre numa moldura dentro da aba; aberta sozinha, volta para o app) |
| `js/faltantes.js` | Abre a moldura na 1ª vez que a aba é aberta |
| `js/faltantes-regras.js` | **Motor de regras** (`window.REGRAS`, objeto `LOGICA`): roda na tela e também no servidor |
| `api/faltantes.js` | Função do Vercel: confere o login e o papel e chama o núcleo |
| `api/_lib/nucleo.js` | Lógica: lê só os dias D..D+2, monta a linha do tempo, regras, resumo, responsáveis, One Bipe |
| `api/_lib/sheets.js` | Google Sheets API com a conta de serviço (lê o texto que aparece na planilha e grava como texto) |
| `api/_lib/supabase.js` | Confere o token do login e guarda o cache |
| `sql/016_faltantes_cache.sql` | Tabela do cache |
| `vercel.json` | Tempo máximo da função (60 s) e o arquivo de regras junto da função |

**Variáveis no Vercel**: `GOOGLE_SA_JSON`, `PLANILHA_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`. A chave do Google e a chave
secreta do Supabase **nunca** entram no código.

## 4. Planilhas e abas

| Planilha | ID |
|---|---|
| **Base SSP53** (principal, desde 17/11/2026) | `1m2rcujuC2w5qIsrm81nBdTgJxZv3HuukhMTtQBmIH8E` |
| Conteneirização de Pacotes - Base SSP53 (a principal até 17/11/2026; o importador ainda grava nela) | `1nDqe83XDoY-A3u6rNxaMP2RT74mZNjrYSDUY2c9dKhk` |
| Origem do Histórico (Labor), gid=0 | `1O4clXDtcty6TiCVsBXFu0I45Hv9LSysBoI70M4Kd6qc` |
| Origem do Direcionamento Manual, gid=1903954199 | `1No0tZ8yI7HJpKV2V2_PgKqIBpHXVlbTKsdy-lhBzkYk` |

**Abas da planilha principal (Base SSP53).** O painel acha as colunas pelo **nome do cabeçalho**, então não mude os nomes.

> **Situação em 17/11/2026:** a Base SSP53 já tem Histórico, Torre Aduana, Inventário, One Bipe, Direcionamento Manual e
> Colaboradores. **Faltam Aduana, Auditoria de Carrinho e Problem Solving** (o importador ainda grava na planilha antiga) e
> Regras, Classificação manual, Resumo diário, Responsáveis e Log importação (o app cria as quatro primeiras sozinho; copie da
> planilha antiga para não perder o que já foi classificado). Sem a aba Aduana, o painel não acha nenhum faltante.

| Aba | Colunas usadas | Quem alimenta |
|---|---|---|
| Histórico | Data, Horas, IdPacote, SubStatus, UserID, Processo, Ext, Origem | script do Histórico |
| Aduana | Shipment ID, Placa, Data auditoria, Hora, ID da rota, Estado, Rep auditoria | importador (`importarRelatorios`) |
| Auditoria de Carrinho | Shipment ID, Data, Hora, Gaiola, Estado, Rep auditoria | importador (`importarRelatorios`) |
| Problem Solving | ID do pacote, Problema, Estado, Problem Solver, Hora, Data, Resolução, Status de resolução, Motivo, Rota sugerida… | importador (atualiza pelo ID do caso) |
| Base Inventário | Pacote, Situação, Área, Operador, Comentário, Data, Hora | importador (`importarBaseInventario`). Desde 17/11/2026 o painel lê esta aba, não mais o espelho "Inventário" |
| Torre Aduana | Shipment ID, Estado aduana, Gaiola (rota otim,), Classificacao, Status tratativa, Concluido em… | script do Rafael (lê outra planilha) |
| Direcionamento Manual | Carimbo de data/hora, ID DO PRODUTO, STATUS, REDIRECIONAMENTO, ROTA, CICLO | script do Direcionamento |
| One Bipe | DATA , Shipment ID | já chega na planilha; define **Volumoso** |
| Regras | Ordem, Código, Ligada, Pergunta, Resultado, Observação, Abas usadas | o Rafael edita |
| Classificação manual | Data, Shipment ID, Classificação, Raciocínio, Quem classificou, Regra conferida | o app (ou o Rafael direto) |
| Resumo diário | Dia, Shipment ID, Rota, Ilha, Rep aduana, Resultado da regra, Código da regra, Teve sorting, Atualizado em | o app |
| Responsáveis | Data, Ilha, Responsável, Quem preencheu, Atualizado em | o app (sub-aba Responsáveis por ilha) |
| Colaboradores | coluna com "Nome" no cabeçalho (o painel **não lê** o CPF) | o Rafael |
| Log importação | registro do importador | importador |

**Formato**:
- Tudo é gravado como texto: datas `dd/mm/aaaa` e horas 24h.
- O importador usa as colunas `Importado em` e `Chave` para não duplicar.
- **Retenção**: a planilha guarda só os últimos **15 dias** de Aduana, Carrinho e Problem Solving. Toda madrugada (3h) o resto vai
  para `Arquivo Faltantes AAAA-MM` (pasta "Faltantes – Arquivo"), por causa do limite de 10 milhões de células do Google. Por
  isso semana e mês usam o Resumo diário.

## 5. Scripts que continuam no Google Apps Script

| Projeto | Gatilho | Frequência | O que faz |
|---|---|---|---|
| Labor_Sorting | `importarNovasLinhas` | 15 min | copia o Histórico da planilha do Labor |
| (Direcionamento) | `importarDirecionamento` | 15 min | copia o Direcionamento Manual |
| Importar Relatórios | `importarRelatorios` / `arquivarAntigos` | 15 min / diário 3h | importa os CSV ([`importador.md`](importador.md)) e arquiva o que tem mais de 15 dias |
| (script do Rafael) | — | — | alimenta a Torre Aduana (**não está em nenhum repositório**) |

O código desses scripts está no repositório `rafaelmoreirasb/painel-faltantes`, pasta `apps-script/`.

## 6. Volumoso × Sorting e responsáveis
- **Volumoso**: o Shipment ID aparece em qualquer linha da aba **One Bipe**, de qualquer data. Se não aparece, é **Sorting**.
  - Cada pacote tem uma etiqueta, e os botões Tipo: Todos · Volumoso · Sorting filtram o dia e o período.
- **Ilha** = letra(s) do começo da rota: A1_AM1 → A.
  - Há um responsável por ilha por dia, preenchido na sub-aba **Responsáveis por ilha**: 6 linhas em branco por dia,
    "+ Acrescentar ilha" e "Copiar do dia anterior".
  - O "cobrar: Nome" e os rankings de erro de conteinerização por responsável e por ilha contam **só Volumoso**.

## 7. Cuidado com os dados
- A planilha e os dados (IDs de pacotes, rotas, nomes de reps e de colaboradores) são **da DHL**. O uso do app e do banco para
  esses dados foi aprovado pelo gestor/TI (17/11/2026).
- A aba só abre para **Administrador** logado. O servidor confere o login e o papel em toda chamada.
- O Supabase guarda só o **cache**, apagável. Os dados mesmo ficam na planilha.
- A chave da conta de serviço do Google fica só no Vercel. Se ela vazar: no Google Cloud, apague a chave e crie outra.

## 8. Pendências conhecidas
- **Torre Aduana** parou em 06/11. Sem ela, R01, R03 e R04 não pegam e os pacotes ficam "em aberto". O script da Torre é do
  Rafael e não está em nenhum repositório.
- A aba **One Bipe** começa em 04/11, então os faltantes de 03/11 aparecem quase todos como Sorting.
- **Permissão** para o assistente preencher só os Responsáveis: ainda não existe. Daria para fazer com um papel novo.
- Não há gatilho preparando os dados de 5 em 5 min, como havia no Apps Script. A 1ª pessoa que abre um dia espera alguns segundos;
  depois vem do cache.
