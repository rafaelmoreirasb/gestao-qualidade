# Importador dos relatórios diários (Base SSP53) — passo a passo

> Desde 17/11/2026 os **4 relatórios do dia** (Inventário, Aduana, Auditoria de Carrinho e Problem Solving) entram **pela mesma
> pasta** do Google Drive e são gravados na planilha **Base SSP53**, que a aba Faltante Aduana lê.
> Código: pasta [`apps-script/base-ssp53/`](../../apps-script/base-ssp53/) deste repositório. Ele roda no projeto Apps Script
> da própria planilha (Extensões › Apps Script), com a sua conta pessoal.

## O que acontece
Todo dia você joga os 4 arquivos exportados, **todos juntos**, na pasta **Importar Inventário** do Drive.
Pode ser pelo computador ou pelo app do Drive no celular. O Inventário entra a cada 15 minutos e os outros 3 a cada 5 minutos
(um arquivo grande pode levar 2 ou 3 rodadas, porque o script do Histórico também grava na planilha e o Google limita cada
execução a 6 minutos):

| Arquivo (reconhecido pelos cabeçalhos; o nome não importa) | Aba da Base SSP53 | Quem importa |
|---|---|---|
| Inventário: `Pacote, Data de Escaneamento, Situação, Área…` | **Base Inventário** | `importarBaseInventario` (arquivo `automacao-base-ssp53.gs`) |
| `audited_shipments…` com coluna **Placa** | **Aduana** | `importarRelatorios` (arquivo `importar-relatorios.gs`) |
| `audited_shipments…` com coluna **Gaiola** | **Auditoria de Carrinho** | `importarRelatorios` |
| `report_logistics_problem_solving…` | **Problem Solving** (caso que mudou de estado **atualiza** a linha) | `importarRelatorios` |

- Nada é duplicado: mandar o mesmo arquivo duas vezes não muda nada.
- Depois de importado, o arquivo vai para **Importar Inventário › Processados**.
- Arquivo que ninguém reconhece vai para **Importar Inventário › Não reconhecidos** e você recebe um **e-mail**.
- Os 3 relatórios ficam registrados na aba **Log importação**.
- Arquivo que acabou de chegar (menos de 3 min) espera a próxima rodada, para o Drive terminar de sincronizar.
- Toda madrugada (3h) as linhas com mais de **15 dias** das abas Aduana, Auditoria de Carrinho e Problem Solving vão para a
  planilha **Arquivo Faltantes AAAA-MM** (pasta **Faltantes – Arquivo**). Nada é apagado de vez: isso evita estourar o limite
  de 10 milhões de células do Google.
- O app lê a planilha sozinho (a aba Faltante Aduana se atualiza a cada 5 min). Não precisa fazer mais nada.

## Instalação (uma vez só)
O Apps Script pode estar em inglês: os botões estão em inglês com a tradução entre parênteses.

1. Abra a planilha **Base SSP53** › **Extensões › Apps Script**.
2. **Troque o arquivo da automação** pela versão nova:
   1. Clique no arquivo que tem o código "AUTOMAÇÃO BASE SSP53".
   2. Selecione tudo (Ctrl + A), apague e cole todo o conteúdo de `apps-script/base-ssp53/automacao-base-ssp53.gs`.
   3. O que mudou nele: o Inventário passa a **pular os arquivos que não são de inventário** (antes ele gravaria uma planilha da
      Aduana na Base Inventário) e o `criarTodosGatilhos` também recria os gatilhos novos.
3. **Crie o arquivo novo**: ao lado de **Files** (Arquivos), clique em **+** › **Script**, dê o nome `importar-relatorios` e cole
   todo o conteúdo de `apps-script/base-ssp53/importar-relatorios.gs`. Clique no disquete (**Save**).
   **Não cole por cima do arquivo da automação** (normalmente o `Código.gs`): no fim, o projeto tem **2 arquivos**, o da
   automação e o `importar-relatorios`. O importador tem os próprios IDs e funciona sozinho.
4. *(Só se for usar `.xlsx`)* **Services** (Serviços) › **+** › **Drive API** › **Add**. Para `.csv` não precisa.
5. **Traga o histórico da planilha antiga**: no topo, escolha a função **migrarAbasPlanilhaAntiga** e clique em **Run**
   (Executar). Na primeira vez o Google pede permissão: **Review permissions** › sua conta › **Advanced** (Avançado) ›
   **Go to … (unsafe)** › **Allow** (Permitir).
   - Ela copia Aduana, Auditoria de Carrinho, Problem Solving, Regras, Classificação manual, Responsáveis e Resumo diário.
   - Pula a aba que já tem dados na Base SSP53. Se o tempo acabar, rode de novo: continua de onde parou.
   - **Antes de copiar, confere o limite de 10 milhões de células.** Se não couber, para com a mensagem "não cabe" e não
     copia nada daquela aba. A função **verCelulasDaPlanilha** mostra quanto cada aba ocupa.
6. **Ligue os gatilhos**: escolha **criarGatilhosRelatorios** e clique em **Run**. Ela cria `importarRelatorios` (a cada
   5 min) e `arquivarRelatoriosAntigos` (todo dia às 3h) e **não mexe** nos outros gatilhos.
7. **Aviso para o app** (para a tela atualizar sozinha): no Apps Script, ⚙️ **Project Settings** (Configurações do projeto) ›
   **Script Properties** (Propriedades do script) › **Add script property** (Adicionar propriedade), duas vezes:
   - `APP_URL` = o endereço do app (o link de teste enquanto a Fase 10 não estiver no main; depois, o link oficial). Para
     avisar os dois, separe por vírgula.
   - `FALTANTES_SEGREDO` = a mesma senha da variável `FALTANTES_SEGREDO` do Vercel.
   - *(Só se o Vercel pedir login no link de teste)* `VERCEL_BYPASS` = Vercel › Settings › Deployment Protection ›
     **Protection Bypass for Automation**.

   Depois rode a função **testarAvisoApp**: no registro deve aparecer `Aviso ao app (...): {"r":{"geradoEm":...`.
8. Teste: jogue os 4 arquivos de hoje na pasta **Importar Inventário**. Depois de 15 a 20 minutos, eles estão em
   **Processados**, as abas têm as linhas novas e a aba **Log importação** mostra o resultado.
9. Quando tudo estiver certo, **desligue o importador antigo** (projeto "Importar Relatórios" da planilha Conteneirização):
   **Triggers** (Acionadores) › apague `importarRelatorios` e `arquivarAntigos`.

## Quando algo der errado
| Sinal | O que fazer |
|---|---|
| Arquivo foi para **Não reconhecidos** | O cabeçalho do relatório mudou. Mande o arquivo para o Claude ajustar o script. |
| E-mail "Faltante Aduana: erro em Importação de relatórios" | Veja a aba **Log importação**: a mensagem diz o arquivo e o motivo. |
| Arquivos parados na pasta há mais de 30 min | Apps Script › **Triggers**: confira se `importarRelatorios` e `importarBaseInventario` estão lá. |
| `Aviso ao app ... respondeu 401` | A senha `FALTANTES_SEGREDO` do Apps Script é diferente da do Vercel (ou falta o Redeploy). Se a resposta for uma página de login da Vercel, configure `VERCEL_BYPASS`. |
| Erro "cells beyond the limit" / "não cabe" | A planilha chegou perto de 10 milhões de células. Rode `verCelulasDaPlanilha` e libere espaço. |

## Observações
- **Tipo do pacote** (Aduana) e **Tipo** (Auditoria de Carrinho) ficam em branco. Volumoso × Sorting vem da aba One Bipe.
- O app lê o inventário da aba **Base Inventário** (colunas Pacote, Situação, Área, Operador, Comentário, Data e Hora).
- **Espelho do Inventário desligado em 17/11/2026:** a aba **Inventário** (espelho da Base Mirassol Oficial, 2,7 milhões de
  células) não é mais usada pelo painel. A função `atualizarInventario` não faz mais nada e saiu do `criarTodosGatilhos`.
  Depois de colar a automação nova: apague o gatilho `atualizarInventario` em **Triggers** e apague a aba **Inventário** da
  Base SSP53 (os dados continuam na Base Mirassol Oficial).
- Se você rodar `criarTodosGatilhos` (arquivo da automação), ele apaga e recria **todos** os gatilhos, já incluindo os dois
  novos.
