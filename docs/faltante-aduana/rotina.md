# Rotina diária — aba Faltante Aduana

Quase tudo roda sozinho. A parte do Rafael: **exportar, olhar o painel e decidir o que a regra não decide.**

## Todo dia
1. **Exportar os 3 relatórios** (~5 min): Aduana (tem "Placa"), Auditoria de Carrinho (tem "Gaiola") e Problem Solving.
   De tarde (~15h, quando ficam disponíveis) e, se der, **de novo de manhã antes da reunião** (pega o que aconteceu à noite).
   Pode repetir dias — nada duplica.
2. **Jogar na pasta do Drive "Faltantes – Entrada"** (computador ou app do Drive no celular). O nome do arquivo não importa.
   **Atalho:** com o Google Drive para computador, o navegador salva o relatório direto nessa pasta e este passo some (ver [`automatizar.md`](automatizar.md)).
3. **Esperar até 15 min**: os arquivos somem da pasta (vão para "Processados") = entraram na planilha. Na aba,
   **Atualizar agora** relê a planilha na hora (~10 s); sem clicar, o painel atualiza sozinho em até 10 min.
4. **Abrir o app** Gestão de Processo e Qualidade (login de Administrador) › aba **Faltante Aduana**.
   Escolher o dia. Conferir no topo "Dados preparados às HH:MM".
5. **Preencher os responsáveis do dia** (1–2 min): dentro da aba Faltante Aduana, sub-aba **Responsáveis por ilha**. Clicar em "Copiar do dia anterior" e trocar só quem mudou; ilha que faltar → digitar a
   letra numa linha em branco (ou "+ Acrescentar ilha") e escolher o nome.
6. **Revisar, nesta ordem** (10–20 min):
   1. **Para decidir** → "Mostrar só os conflitos" → *Manter a minha* ou *Usar a regra*.
   2. **Regra em aberto** (barra cinza) → ler a linha do tempo → preencher *Sua classificação* e *Raciocínio* (salva sozinho).
   3. **Bipes novos** (amarelo) → ver se mudam alguma conclusão.
   4. **Sem sorting no dia** → conferir esses pacotes.
7. **Na reunião**: painel aberto; clicar nas barras de "Resultado de cada faltante" para mostrar cada grupo; busca por
   shipment/rota/rep. Atualiza sozinho a cada 5 min.

## Indicador semanal / mensal
- Segunda-feira: Período = **Semana** (a anterior) → ver "Erros de conteinerização por responsável" e "por ilha" para a cobrança.
- Fim do mês: Período = **Mês**. Para comparar dias soltos: **Escolher dias**.

## Uma vez por semana (2 min)
- Aba **Log importação** da planilha: linhas com "OK".
- E-mail "Painel de Faltantes: erro em…" → abrir o log e mandar print ao Claude.
- Arquivamento (> 15 dias → arquivo mensal) e cache são automáticos.

## Se algo der errado
| O que aparece | O que fazer |
|---|---|
| Arquivo parado em "Faltantes – Entrada" há mais de 30 min | Apps Script › **Triggers**: tem `importarRelatorios`? Se não, rodar `criarGatilhoRelatorios` |
| Arquivo foi para "Não reconhecidos" | O formato do relatório mudou → mandar o arquivo ao Claude |
| Subi arquivos e o dia novo não aparece no seletor | Conferir se o arquivo saiu da pasta de entrada (importou) e clicar em **Atualizar agora** |
| "Falta configurar no Vercel…" ou "Sem acesso à planilha" | Ver o LEIAME do app, seção "Fase 10 · Aba Faltante Aduana" › Como ligar |
| "Entre no app de novo" | O login venceu: Sair e entrar de novo |
| A aba Faltante Aduana não aparece no menu | Só o Administrador vê a aba |
| Muitos pacotes em aberto em dias recentes | Conferir se a aba Torre Aduana da planilha está atualizada |
| Linha do tempo estranha | **Atualizar agora**; se continuar, mandar shipment + dia ao Claude |

## Quando quiser mudar algo
1. Pedir na conversa do assunto ("Faltantes · Regras", "Faltantes · Painel"…), em português normal.
2. O Claude altera e sobe no ramo **teste** do app → conferir no link de teste → Pull request para o `main` (como as outras fases).
3. Se houver arquivo `sql/` novo, rodar antes no Supabase.
4. **Ordem, liga/desliga e texto das regras** → direto na aba **Regras** da planilha.
