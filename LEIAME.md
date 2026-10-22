# Gestão de Processo e Qualidade — Mirassol SSP53

App web da operação DHL Supply Chain Mirassol SSP53 para registrar desvios de processo, treinamentos e planos de ação.

## Situação atual: Fase 7 — Eficácia (19/10/2026)

- **Tela de login** por e-mail e senha (Supabase). Senha errada é recusada com a mensagem "E-mail ou senha incorretos".
- O login fica lembrado no navegador até você clicar em **Sair** (ou a sessão expirar).
- Depois de entrar: cabeçalho DHL (logo, "Gestão de Processo e Qualidade", "Mirassol SSP53"), menu com as 8 abas, seu e-mail e botão **Sair**.
- **Menu:** Painel, Gemba, Torre de Aduana, Poka-Yoke, Eficácia, Cronograma, Plano de ação e Colaboradores. A aba aberta fica em vermelho e aparece no endereço (ex.: `#colaboradores`); ao recarregar, você continua nela. Sem login, o menu não aparece.
- **Aba ainda "Em construção":** Torre de Aduana (pausada até os nomes dos erros serem padronizados).

### Aba Painel — "Visão Geral" (funcionando)

O Painel só **lê** o banco (registros do Gemba, colaboradores, listas e treinamentos). Ele não grava nada. Ao abrir a aba, os dados são lidos de novo, então um registro feito agora no Gemba ou no Cronograma já aparece.

- **Início da contagem: 13/10/2026.** Registros anteriores continuam no banco, mas não entram no Painel. A data fica numa linha só, no topo de `js/painel.js` (constante `INICIO`).
- **Filtro de setor:** "Todos os setores" ou um **processo** do Gemba. O filtro vale **só para os desvios**; os treinamentos aparecem sempre (eles não têm processo).
- **4 indicadores do ano:** Registros (desvios + treinamentos realizados), Desvios, **Treinamentos** (quantidade de treinamentos com status **Realizado**, não de participantes; embaixo, quantos estão agendados) e **Processo com mais desvios**.
  - Não há indicador nem modo de Conformidade: o Gemba só registra desvio.
- **Mapa de calor do ano: um mapa só**, com desvios e treinamentos juntos. Cores de cada dia:
  - **vermelho** = dia com desvio; quanto mais escuro, mais desvios;
  - **amarelo** = dia com treinamento **Realizado**;
  - **dividido na diagonal** (metade vermelha, metade amarela) = desvio e treinamento realizado no mesmo dia;
  - **contorno amarelo** = treinamento ainda **Agendado** (dia futuro, ou dia passado que ainda não foi marcado como realizado);
  - **cinza** = sem registro; **tracejado** = dia futuro ou antes do início da contagem.
- **Resumo do dia:** passar o mouse num dia (ou tocar, no celular) mostra a data, a contagem e a lista de desvios (hora, colaborador, processo, motivo) e de treinamentos (hora, tema, nº de participantes; avisa se ainda não foi marcado como realizado).
  - Pessoas registradas juntas no Gemba aparecem **numa linha só**, com todos os nomes. Se o registro tem fotos, aparece o botão **📷 Ver fotos (N)**: mostra as miniaturas e, ao clicar numa, abre a foto grande. O resumo do mapa por colaborador também tem o botão.
- No computador, o mapa abre rolado até a semana de hoje. Quando houver mais de um ano, aparece um seletor de ano.
- **Mapa por colaborador:** escolher a pessoa (Ativos primeiro; desligados aparecem com "(desligado)"). Ficha com iniciais, nome, matrícula, setor, total de desvios, **treinamentos realizados de que participou** e o desvio que mais se repete. Abaixo, o mapa só dela, com as mesmas cores e o resumo do dia.

### Aba Gemba (funcionando)

Registro rápido de desvio em 4 passos, feito para usar também no celular.

1. **Colaborador (um ou vários):** busca por nome ou matrícula; mostra até 5 resultados, só **Ativos** e só quem ainda não foi escolhido (Enter escolhe o primeiro). Cada pessoa escolhida vira uma etiqueta com **×** para tirar. Até **30 pessoas** por registro; o processo, o motivo, a ação, a observação e as fotos valem para todas.
2. **Processo:** botões com os itens da LISTA_PROCESSOS, mais o campo **+ Adicionar**.
3. **Motivo do erro:** lista suspensa com a LISTA_MOTIVOS_<PROCESSO> do processo escolhido, mais **+ Adicionar**. Fica apagada até escolher o processo.
4. **Ação tomada:** botões da LISTA_ACOES, mais **+ Adicionar**.

- **Observação** opcional.
- **Fotos** opcionais: botão **📷 Adicionar fotos** (no celular, tirar na hora ou escolher da galeria), até **6 fotos** por registro, com miniatura e **×** antes de salvar. Cada foto é diminuída no aparelho (lado maior até 1600 px) antes de enviar.
- Botão **Salvar registro** (mostra "(N pessoas)" quando há mais de uma). Se faltar algo, aparece "Falta escolher: …".
  - **Cada pessoa vira um desvio** (uma linha no banco), todas com o mesmo **grupo** e as mesmas fotos. Por isso o Painel, a ficha de cada um e a Eficácia contam 1 desvio por pessoa.
  - Tudo ou nada: se o envio falhar no meio, nada é gravado e as fotos já enviadas são apagadas.
- Depois de salvar, o formulário limpa, mas o **processo continua marcado**.
- **Registros de hoje** (quadro amarelo): **um cartão por registro salvo**, com os nomes, hora, processo · motivo, ação, observação e miniaturas das fotos (clicar abre a foto grande). A contagem do quadro é de desvios (pessoas). A **lixeira** apaga o registro inteiro (todas as pessoas e as fotos), só para corrigir lançamento feito errado.
- **+ Adicionar** grava o item novo na lista oficial, sem duplicar. **Processo novo** cria a sua LISTA_MOTIVOS_<NOME> vazia.
- **LISTA_MOTIVOS_BK** começou vazia: os motivos reais são criados na tela.
- O registro guarda o **texto** do processo, do motivo e da ação.

### Aba Poka-Yoke (funcionando)

Base acumulada dos erros do Poka-Yoke e ranking de quem precisa de treinamento. Por enquanto o ranking mostra o **login** do usuário (ex.: `ext_mobrafae`); a ligação do login com o colaborador (matrícula e nome) virá numa alteração futura, com planilha própria.

- **4 indicadores:** Erros acumulados na base, Aguardando treinamento (usuários com "A treinar" maior que 0), Treinamentos aplicados e Erro mais pendente (tipo com mais erros ainda sem treino).
- **Ranking para treinamento** (estilo planilha), com busca pelo login:
  - colunas: caixa **treinado hoje**, posição, Usuário, **A treinar**, uma coluna por tipo de erro (erros pendentes de cada tipo), Último treino e Total histórico;
  - **cor mais forte = mais erros pendentes**; os 5 primeiros com erro pendente ficam em negrito;
  - **"A treinar"** = erros com data **depois** do último treino da pessoa (erro do mesmo dia do treino conta como tratado);
  - ordem: A treinar (maior primeiro); empate pelo total histórico. Quem está com 0 vai para o fim (o treinado mais recente por último).
- **Caixa "treinado hoje":** ao marcar, grava o treino de hoje com a quantidade de erros tratados; "A treinar" zera, a pessoa vai para o fim do ranking e o **total histórico continua**. Desmarcar (mesmo dia) serve só para corrigir marcação errada; os erros voltam para "A treinar". Usuário sem nada a treinar fica com a caixa apagada.
- **Erros por tipo:** barras com o total acumulado de cada tipo.
- **Treinamentos aplicados** (quadro amarelo): todos os treinos marcados, do mais novo para o mais antigo, com os erros tratados.
- **Base acumulada + importação** (fim da página): mostra quantos dias de dados há na base, do primeiro ao último dia, e a hora da última importação.
  - Planilha diária (.xlsx ou .csv, primeira aba), normalmente com os dados do **dia anterior**. Colunas usadas: **Data**, **User** e uma coluna por tipo de erro (Gaiola Errada, Forçou Saída, Falha PokaYoke, Problema QR, QR Sem PokaYoke). **Total Errado** e **%Bipes Corretos** são ignorados (o total é calculado somando os tipos).
  - Os nomes das colunas são comparados sem acento, espaço, hífen e maiúsculas ("Falha PokaYoke" = "Falha Poka-Yoke").
  - A planilha é **somada** à base. Cada dia + usuário + tipo entra uma vez só: importar o mesmo dia de novo **não duplica** (a mensagem mostra quantos já estavam na base). Se o mesmo usuário aparecer duas vezes no mesmo dia do mesmo arquivo, os números são somados.
  - Datas aceitas: data do Excel, 13/10/2026, 13/10/26 ou 2026-10-13 (sempre dia/mês/ano). Linha sem Data ou User válidos é ignorada; data no futuro é recusada; coluna que não é tipo da LISTA_ERROS_POKAYOKE é avisada e não entra. O login é guardado em minúsculas.
  - Erros importados não são alterados nem apagados pela tela (base acumulada).
- **Tipos de erro** = itens ativos da **LISTA_ERROS_POKAYOKE** (Gaiola Errada, Forçou Saída, Falha Poka-Yoke, Problema QR e, desde 14/10/2026, **QR Sem PokaYoke**).
- Os treinos do Poka-Yoke **não** entram no Cronograma nem no mapa de calor do Painel, mas **entram na aba Eficácia**.
- Ao abrir a aba, os dados são lidos de novo.

### Aba Eficácia — "Eficácia do Treinamento" (funcionando)

Mostra se as pessoas param de repetir o erro depois de um treino. A aba só **lê** o banco (registros do Gemba, colaboradores, treinos e erros do Poka-Yoke); não grava nada. Ao abrir a aba, os dados são lidos de novo. Usa todo o histórico (não usa a data de início do Painel).

- **O que conta como treino:**
  - **Gemba:** cada **desvio registrado** (a ação tomada no Gemba é a intervenção). O acompanhamento começa no dia do registro.
  - **Poka-Yoke:** cada marcação **"treinado hoje"**. O erro treinado são os tipos que estavam pendentes naquele dia (ex.: "Gaiola Errada (3), Forçou Saída (1)"). A pessoa aparece pelo login ext_.
  - **Torre de Aduana:** pausada; o botão mostra o aviso "ainda sem dados".
  - Os treinamentos do Cronograma **não** entram na Eficácia (eles não dizem qual erro foi treinado).
- **Regra dos 30 dias:**
  - **Reincidiu** = repetiu o **mesmo erro** em até 30 dias depois do treino. No Gemba, mesmo colaborador + mesmo processo + mesmo motivo; no Poka-Yoke, novo erro de um dos tipos que estavam pendentes. Mostra "Reincidiu após N dias".
  - **Eficaz** = passaram os 30 dias sem repetir.
  - **Em acompanhamento** = ainda dentro dos 30 dias: "Dia N de 30", com barrinha amarela.
  - Erro no **mesmo dia** do treino não conta como reincidência.
- **Filtro de origem:** Todas, Gemba, Torre de Aduana e Poka-Yoke. Vale para tudo na aba.
- **Treinos eficazes** (quadro amarelo): percentual = eficazes ÷ (eficazes + reincidiram), a frase "X de Y treinos sem repetir o erro em 30 dias", a barra Eficaz (preto) / Reincidiu (vermelho) / Em acompanhamento (amarelo claro) e a comparação do mês atual com o anterior em pontos percentuais.
- **Eficácia por mês:** os últimos 4 meses, pelo **mês em que o resultado saiu** (dia da reincidência ou fim dos 30 dias). Mês atual em vermelho; "—" = sem resultado no mês.
- **Onde o treino menos funciona:** os 4 erros com maior proporção de reincidência (Gemba: "Processo · Motivo"; Poka-Yoke: cada tipo), ex.: "1 de 2 reincidiram".
- **Acompanhamento dos treinados** (tabela estilo planilha): Colaborador, Origem, Erro treinado, Treinado em e Situação, com filtros Todos / Reincidiram / Em acompanhamento / Eficazes.
  - Ordem: Reincidiu primeiro, depois Em acompanhamento, depois Eficaz; dentro de cada grupo, o mais recente primeiro.
  - **Linha vermelha clara** = reincidiu. Desligado aparece com "(desligado)" em cinza.
  - Mostra até 500 linhas; acima disso, use os filtros.
- O prazo de 30 dias fica numa linha só, no topo de `js/eficacia.js` (constante `DIAS_ACOMPANHAMENTO`).

### Aba Cronograma (funcionando)

- Botão vermelho **+ Novo treinamento / Fechar** abre e fecha o formulário. Ao abrir a aba, o formulário fica **fechado**.
- **Novo treinamento:** Tema, Data, Horário (começa em 08:00) e **Carga horária** (obrigatória, começa em branco, formato horas:minutos — ex.: 00:10 ou 01:30; digitando só os números os dois-pontos entram sozinhos). Os participantes são acrescentados depois.
- **Repetir em vários dias:** marcando essa opção aparecem **Até** (data final) e os dias da semana (Seg a Sex já vêm marcados; ao ligar, "Até" sugere a sexta seguinte). O app mostra quantos serão criados, pede confirmação e cria **um treinamento separado para cada dia** (cada um com participantes, status e anexos próprios). Máximo de 60 por lançamento; se algo falhar, nada é gravado.
- **Calendário do mês** com setas de mês anterior/seguinte:
  - treino **Agendado** em amarelo, **Realizado** em preto com **✓ verde**, **Atrasado** (data passou e não foi marcado como realizado) em amarelo com faixa vermelha;
  - **sábado e domingo** com fundo amarelo bem clarinho; hoje com contorno vermelho;
  - mostra **até 4 treinos por dia**; acima disso, "+N treinamento(s)";
  - clicar num dia com treino abre o treino; num dia vazio, abre o formulário com aquela data.
- **Exportar PDF:** abre a janela de impressão só com o calendário do mês, em A4 deitado; escolha "Salvar como PDF" (se faltar cor, marque "Gráficos de plano de fundo").
- **Tela cheia:** o calendário ocupa a tela toda; Esc ou "Sair da tela cheia" volta. No iPhone ele só ocupa a página inteira.
- **Aguardando participantes** (quadro amarelo à direita, **da altura do calendário**, rola por dentro): só treinos **Agendados** e **sem nenhum participante**, inclusive os de data já passada (com aviso "Atrasado"). O treino sai do quadro ao marcar um participante ou ao virar Realizado. No celular o quadro fica embaixo do calendário, com altura fixa e rolagem.
- **Todos os treinamentos:** tabela com Data, Hora, Carga, Tema, Participantes (vermelho = nenhum participante ainda), Situação (Realizado com ✓ verde), **Anexos** (ícones verdes de foto e lista; clicar abre o arquivo), botão **Participantes** e lixeira (só para lançamento errado; apaga junto a lista de participantes e os anexos).
  - Mostra cerca de **10 linhas**; o resto rola dentro da tabela (cabeçalho fixo). Datas mais recentes primeiro.
  - **Busca** no topo: data (ex.: "15/10" ou "/10"), tema, participante (nome ou matrícula) e situação (agendado, hoje, atrasado, realizado), sem diferenciar acento ou maiúscula. O título mostra "· N de M" quando filtra.
- **Janela do treinamento** (botão Participantes, clique no calendário ou no quadro da direita):
  - **Carga horária** editável, com botão **Salvar**;
  - **Status:** "Marcar como realizado" (exige pelo menos 1 participante e data de hoje ou anterior) e "Voltar para agendado" (para corrigir engano). Um treino Realizado não pode ficar sem participantes;
  - **Anexos:** **Foto da turma** (JPEG ou PNG) e **Lista de presença** (PDF, até 10 MB), 1 de cada por treino, com **Anexar / Ver / Trocar / 🗑**. A foto é diminuída no navegador antes de enviar (lado maior até 1600 px). **Ver** abre o arquivo numa aba nova (link temporário de 1 hora). Trocar ou remover apaga o arquivo anterior;
  - **Participantes:** caixas de seleção com busca por nome ou matrícula; só **Ativos** (um desligado que já participou continua aparecendo, marcado "desligado"). Cada caixa é gravada na hora; **Concluir** só fecha.
- Situação mostrada: **Realizado** (marcado por você), **Atrasado**, **Hoje** ou **Agendado**.

### Aba Plano de ação (funcionando)

Ações no formato **5W2H**, com Origem e Status.

- Botão vermelho **+ Nova ação / Fechar** abre e fecha o formulário.
- **Formulário 5W2H:** O quê (WHAT), Por quê (WHY), Onde (WHERE), Quem (WHO), Quando (WHEN, o prazo), Como (HOW) e Quanto custa (HOW MUCH), mais **Origem do problema** (Gemba, Torre de Aduana ou Poka-Yoke).
  - **O quê, Quem e Quando são obrigatórios.** Se faltar algum, aparece "Preencha: …".
  - **Onde** é uma lista com os processos da **LISTA_PROCESSOS** (os mesmos do Gemba, inclusive os criados lá). Não há "+ Adicionar" nesta aba: processo novo é criado só no Gemba.
  - **Quem** e **Quanto** são texto livre (ex.: "Sem custo / R$ 250,00").
  - Toda ação nova entra como **Não iniciada**.
- **Alterar uma ação:** o **lápis** na linha abre o mesmo formulário já preenchido ("Alterar ação nº X"), com **Salvar alterações** e **Cancelar**. O Status não fica no formulário; ele muda na própria linha.
- **4 indicadores:** Ações abertas, Em andamento, Atrasadas (vermelho) e Concluídas. Contam todas as ações, sem filtro.
- **Filtros:** Abertas (o padrão), Atrasadas, Concluídas e Todas, mais a lista de Origem.
- **Tabela estilo planilha:** Nº, O quê, Por quê, Onde, Quem, Quando, Como, Quanto, Origem, Status, lápis e lixeira.
  - **Nº** é o número fixo da ação no banco (não muda quando outra é excluída).
  - **Status na própria linha** (Não iniciada, Em andamento em amarelo, Concluída em cinza), gravado na hora.
  - **Contagem de prazo** embaixo da data: "Faltam Nd", "Vence hoje" ou "Atrasada Nd" (usa a data do dia no aparelho).
  - **Linha vermelha clara** = prazo vencido e ação não concluída. **Linha cinza com O quê riscado** = concluída.
  - Ordem: abertas primeiro, pelo prazo mais próximo; concluídas no fim.
- **Lixeira** só para corrigir lançamento feito errado. Para encerrar uma ação, mude o Status para Concluída.
- Ao abrir a aba, os dados são lidos de novo (assim um processo criado agora no Gemba já aparece em Onde).

### Aba Colaboradores (funcionando)

- **Título com contagem:** total, ativos e desligados.
- **Adicionar manualmente:** matrícula e nome. Matrícula repetida é recusada.
- **Lista estilo planilha:** #, Matrícula, Nome, Status, Treinamentos e lixeira; busca por nome, matrícula ou status.
- **Status na própria linha:** Ativo (verde) ou Desligado (vermelho, nome riscado, vai para o fim da lista).
- **Treinamentos:** quantos treinamentos com status **Realizado** a pessoa participou (atualiza ao abrir a aba).
- **Regra:** quem sai da empresa vira **Desligado** e o histórico continua. A **lixeira** é só para corrigir cadastro errado. Quem tem registro no Gemba ou participou de treinamento **não pode ser excluído**.
- **Importar planilha** (.xlsx ou .csv, primeira aba) com as colunas **Nome** e **Matrícula**: só cadastra matrículas novas, como Ativo; não duplica; a planilha não é guardada, só os dados.

## Banco de dados (Supabase)

| Tabela | Criada em | Campos |
| --- | --- | --- |
| colaboradores | `sql/001_colaboradores.sql` (Fase 1) | id, matricula (única), nome, setor (vazio por enquanto), status (Ativo/Desligado), criado_em |
| listas | `sql/002_gemba.sql` (Fase 2) | id, lista, item, ordem, ativo, criado_em. Não pode apagar (item removido fica com ativo = falso) |
| registros_gemba | `sql/002_gemba.sql` (Fase 2) e `sql/009_gemba_grupo_fotos.sql` | id, data, colaborador_id, processo, motivo, acao, observacao, criado_em, **grupo** (pessoas salvas juntas têm o mesmo; registros antigos têm um próprio) e **fotos** (lista de caminhos na pasta "gemba"). Uma linha por pessoa |
| treinamentos | `sql/003_cronograma.sql` e `sql/004_cronograma_status_carga.sql` (Fase 4) | id, data, hora, tema, **carga_minutos** (carga horária em minutos), **status** (Agendado/Realizado), **foto_caminho** e **lista_caminho** (onde estão os anexos; colunas do `sql/007_cronograma_anexos.sql`), criado_em. Pode ler, criar, alterar **só** carga, status e anexos, e excluir (só lançamento errado) |
| treinamento_participantes | `sql/003_cronograma.sql` (Fase 4) | id, treinamento_id (sai junto se o treino for excluído), colaborador_id (protege o colaborador de exclusão), criado_em. A mesma pessoa não entra duas vezes no mesmo treino |
| planos_acao | `sql/005_planos_acao.sql` (Fase 5) | id, o_que, por_que, onde, quem, quando (prazo), como, quanto, origem (Gemba/Torre de Aduana/Poka-Yoke), status (Não iniciada/Em andamento/Concluída), criado_em. O quê, Quem e Quando obrigatórios. Pode ler, criar, alterar e excluir (só lançamento errado) |
| pokayoke_erros | `sql/006_pokayoke.sql` (Fase 6) | id, data, usuario (login ext_...), tipo_erro, quantidade, chave_linha (data\|usuario\|tipo, única: impede duplicar), importado_em. Pode só ler e importar |
| pokayoke_treinos | `sql/006_pokayoke.sql` (Fase 6) | id, usuario, data, erros_tratados, criado_em. Um treino por usuário por dia. Pode ler, marcar e desmarcar |
| pokayoke_ranking e pokayoke_base (resumos) | `sql/006_pokayoke.sql` (Fase 6) | Cálculos prontos no banco (total e pendente por usuário e tipo; dias, datas e total da base), só leitura, com as mesmas regras de login |

- **LISTA_ERROS_POKAYOKE** fica na tabela listas (itens criados pelo `sql/006_pokayoke.sql`).
- RLS ligado em todas: só o usuário logado lê e grava. Visitante sem login não acessa nada.
- **Arquivos (Supabase Storage):** pasta **privada** `treinamentos` (criada pelo `sql/007_cronograma_anexos.sql`), só JPEG, PNG e PDF, até 10 MB. Cada treino tem sua subpasta (o número do treino). Só o usuário logado lê, envia e apaga. O plano gratuito do Supabase guarda 1 GB.
- Pasta **privada** `gemba` (criada pelo `sql/009_gemba_grupo_fotos.sql`), só JPEG e PNG, até 10 MB: fotos do Gemba, uma subpasta por grupo. Só o usuário logado lê, envia e apaga.
- Os scripts `sql/` são rodados à mão no Supabase (SQL Editor → New query → colar → Run), um por vez, em ordem.

## Onde cada coisa está

| Serviço | Para que serve |
| --- | --- |
| GitHub `rafaelmoreirasb/gestao-qualidade` (hoje **público**; pode virar privado em Settings → Change visibility) | Guarda o código. Ramo **main** = oficial; ramo **teste** = mudanças em teste |
| Supabase, projeto `gestao-qualidade` (São Paulo) | Login e banco de dados. Cadastro de novos usuários **desligado** |
| Vercel, projeto `gestao-qualidade` | Publica o site: **main** → link oficial; **teste** → link de teste fixo (endereço com `git-teste`) |

## Arquivos

```text
index.html            página única: cabeçalho, menu, login e uma <section> por aba
logo.png              logo DHL
css/estilo.css        cores, fontes e componentes (menu, planilha, Gemba, Painel, Cronograma, Plano de ação, Poka-Yoke, Eficácia e impressão do calendário)
js/supabase.js        conexão com o Supabase, entrar, sair (URL e chave pública no topo)
js/listas.js          leitura e acréscimo de itens nas LISTA_... (arquivo comum)
js/menu.js            troca de abas
js/planilha.js        leitura de .xlsx e .csv no navegador, sem biblioteca
js/painel.js          aba Painel (indicadores, mapa de calor único e mapa por colaborador)
js/gemba.js           aba Gemba (várias pessoas por registro e fotos)
js/cronograma.js      aba Cronograma (calendário, PDF, tela cheia, vários dias, busca, participantes, carga, status e anexos)
js/planoacao.js       aba Plano de ação (5W2H, alterar, status na linha, prazo, filtros e indicadores)
js/pokayoke.js        aba Poka-Yoke (importação acumulada, ranking, treinado hoje)
js/eficacia.js        aba Eficácia (acompanhamento de 30 dias dos treinos do Gemba e do Poka-Yoke; só lê o banco)
js/colaboradores.js   aba Colaboradores
sql/001_colaboradores.sql          tabela colaboradores e regras de acesso
sql/002_gemba.sql                  tabelas listas e registros_gemba, itens iniciais e regras de acesso
sql/003_cronograma.sql             tabelas treinamentos e treinamento_participantes e regras de acesso
sql/004_cronograma_status_carga.sql colunas carga_minutos e status e permissão de alterá-las
sql/005_planos_acao.sql            tabela planos_acao e regras de acesso
sql/006_pokayoke.sql               LISTA_ERROS_POKAYOKE, tabelas pokayoke_erros e pokayoke_treinos, resumos e regras de acesso
sql/007_cronograma_anexos.sql      colunas de anexos em treinamentos, pasta privada "treinamentos" no Storage e regras de acesso
sql/009_gemba_grupo_fotos.sql      colunas grupo e fotos em registros_gemba, pasta privada "gemba" no Storage e regras de acesso (o 008 fica reservado para a Torre de Aduana)
LEIAME.md             este arquivo
CHANGELOG.md          histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- A foto da turma e a lista de presença ficam numa pasta **privada**: só abrem com login, por um link que vale 1 hora.
- Nada do app aparece sem login. Ao clicar em Sair, as listas, o Painel, o Cronograma, o Plano de ação, o Poka-Yoke e a Eficácia somem da tela.
- Dados de colaboradores: só matrícula, nome, setor e status.

## Como mudar algo

1. Subir os arquivos no ramo **teste**. O jeito mais seguro é editar pelo **lápis** (apagar tudo e colar o arquivo novo) ou criar com **Add file → Create new file**, digitando o caminho (ex.: `js/painel.js`). Se houver arquivo `sql/` novo, rodar antes no Supabase.
   - Se usar Upload files, arraste as **pastas** (`css`, `js`, `sql`), não os arquivos soltos.
2. Conferir no **link de teste** com o roteiro de teste.
3. Depois de aprovado: GitHub → **Pull requests** → **New pull request** (base: `main`, compare: `teste`) → **Create pull request** → **Merge pull request**. Nunca apagar o ramo teste.
4. A Vercel publica o link oficial sozinha em cerca de 1 minuto.

Atenção: o banco (Supabase) é um só para o link de teste e o oficial. Dados criados no teste aparecem também no oficial (treinamentos, registros e ações de teste podem ser apagados pela lixeira; dados de teste do Poka-Yoke só pelo SQL Editor do Supabase).

## Proteção da Vercel

Os links de teste podem pedir login da Vercel (use "Continue with GitHub"). Mesmo sem essa proteção, nada do app aparece sem o login do Supabase.
