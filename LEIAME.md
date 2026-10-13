# Gestão de Processo e Qualidade — Mirassol SSP53

App web da operação DHL Supply Chain Mirassol SSP53 para registrar desvios de processo, treinamentos e planos de ação.

## Situação atual: Fase 5

- **Tela de login** por e-mail e senha (Supabase). Senha errada é recusada com a mensagem "E-mail ou senha incorretos".
- O login fica lembrado no navegador até você clicar em **Sair** (ou a sessão expirar).
- Depois de entrar: cabeçalho DHL (logo, "Gestão de Processo e Qualidade", "Mirassol SSP53"), menu com as 8 abas, seu e-mail e botão **Sair**.
- **Menu:** Painel, Gemba, Torre de Aduana, Poka-Yoke, Eficácia, Cronograma, Plano de ação e Colaboradores. A aba aberta fica em vermelho e aparece no endereço (ex.: `#colaboradores`); ao recarregar, você continua nela. Sem login, o menu não aparece.
- **Abas ainda "Em construção":** Torre de Aduana, Poka-Yoke e Eficácia ("Eficácia do Treinamento").

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
- No computador, o mapa abre rolado até a semana de hoje. Quando houver mais de um ano, aparece um seletor de ano.
- **Mapa por colaborador:** escolher a pessoa (Ativos primeiro; desligados aparecem com "(desligado)"). Ficha com iniciais, nome, matrícula, setor, total de desvios, **treinamentos realizados de que participou** e o desvio que mais se repete. Abaixo, o mapa só dela, com as mesmas cores e o resumo do dia.

### Aba Gemba (funcionando)

Registro rápido de desvio em 4 passos, feito para usar também no celular.

1. **Colaborador:** busca por nome ou matrícula; mostra até 5 resultados, só **Ativos**. Ao escolher, aparece o cartão com nome, matrícula e setor e o botão **Trocar**.
2. **Processo:** botões com os itens da LISTA_PROCESSOS, mais o campo **+ Adicionar**.
3. **Motivo do erro:** lista suspensa com a LISTA_MOTIVOS_<PROCESSO> do processo escolhido, mais **+ Adicionar**. Fica apagada até escolher o processo.
4. **Ação tomada:** botões da LISTA_ACOES, mais **+ Adicionar**.

- **Observação** opcional e botão **Salvar registro**. Se faltar algo, aparece "Falta escolher: …".
- Depois de salvar, o formulário limpa, mas o **processo continua marcado**.
- **Registros de hoje** (quadro amarelo) com **lixeira** só para corrigir lançamento feito errado.
- **+ Adicionar** grava o item novo na lista oficial, sem duplicar. **Processo novo** cria a sua LISTA_MOTIVOS_<NOME> vazia.
- **LISTA_MOTIVOS_BK** começou vazia: os motivos reais são criados na tela.
- O registro guarda o **texto** do processo, do motivo e da ação.

### Aba Cronograma (funcionando)

- Botão vermelho **+ Novo treinamento / Fechar** abre e fecha o formulário.
- **Novo treinamento:** Tema, Data, Horário (começa em 08:00) e **Carga horária** (obrigatória, começa em branco, formato horas:minutos — ex.: 00:10 ou 01:30; digitando só os números os dois-pontos entram sozinhos). Os participantes são acrescentados depois.
- **Calendário do mês** com setas de mês anterior/seguinte:
  - treino **Agendado** em amarelo, **Realizado** em preto, **Atrasado** (data passou e não foi marcado como realizado) em amarelo com faixa vermelha;
  - **sábado e domingo** com fundo amarelo bem clarinho; hoje com contorno vermelho;
  - mostra **até 4 treinos por dia**; acima disso, "+N treinamento(s)";
  - clicar num dia com treino abre o treino; num dia vazio, usa a data no formulário.
- **Exportar PDF:** abre a janela de impressão só com o calendário do mês, em A4 deitado; escolha "Salvar como PDF" (se faltar cor, marque "Gráficos de plano de fundo").
- **Tela cheia:** o calendário ocupa a tela toda; Esc ou "Sair da tela cheia" volta. No iPhone ele só ocupa a página inteira.
- **Aguardando participantes** (quadro amarelo à direita): só treinos **Agendados** e **sem nenhum participante**, inclusive os de data já passada (com aviso "Atrasado"). O treino sai do quadro ao marcar um participante ou ao virar Realizado.
- **Todos os treinamentos:** tabela com Data, Hora, Carga, Tema, Participantes (vermelho = nenhum participante ainda), Situação, botão **Participantes** e lixeira (só para lançamento errado; apaga junto a lista de participantes).
- **Janela do treinamento** (botão Participantes, clique no calendário ou no quadro da direita):
  - **Carga horária** editável, com botão **Salvar**;
  - **Status:** "Marcar como realizado" (exige pelo menos 1 participante e data de hoje ou anterior) e "Voltar para agendado" (para corrigir engano). Um treino Realizado não pode ficar sem participantes;
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
| registros_gemba | `sql/002_gemba.sql` (Fase 2) | id, data, colaborador_id, processo, motivo, acao, observacao, criado_em |
| treinamentos | `sql/003_cronograma.sql` e `sql/004_cronograma_status_carga.sql` (Fase 4) | id, data, hora, tema, **carga_minutos** (carga horária em minutos), **status** (Agendado/Realizado), criado_em. Pode ler, criar, alterar **só** carga e status, e excluir (só lançamento errado) |
| treinamento_participantes | `sql/003_cronograma.sql` (Fase 4) | id, treinamento_id (sai junto se o treino for excluído), colaborador_id (protege o colaborador de exclusão), criado_em. A mesma pessoa não entra duas vezes no mesmo treino |
| planos_acao | `sql/005_planos_acao.sql` (Fase 5) | id, o_que, por_que, onde, quem, quando (prazo), como, quanto, origem (Gemba/Torre de Aduana/Poka-Yoke), status (Não iniciada/Em andamento/Concluída), criado_em. O quê, Quem e Quando obrigatórios. Pode ler, criar, alterar e excluir (só lançamento errado) |

- RLS ligado em todas: só o usuário logado lê e grava. Visitante sem login não acessa nada.
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
css/estilo.css        cores, fontes e componentes (menu, planilha, Gemba, Painel, Cronograma, Plano de ação e impressão do calendário)
js/supabase.js        conexão com o Supabase, entrar, sair (URL e chave pública no topo)
js/listas.js          leitura e acréscimo de itens nas LISTA_... (arquivo comum)
js/menu.js            troca de abas
js/planilha.js        leitura de .xlsx e .csv no navegador, sem biblioteca
js/painel.js          aba Painel (indicadores, mapa de calor único e mapa por colaborador)
js/gemba.js           aba Gemba
js/cronograma.js      aba Cronograma (calendário, PDF, tela cheia, participantes, carga e status)
js/planoacao.js       aba Plano de ação (5W2H, alterar, status na linha, prazo, filtros e indicadores)
js/colaboradores.js   aba Colaboradores
sql/001_colaboradores.sql          tabela colaboradores e regras de acesso
sql/002_gemba.sql                  tabelas listas e registros_gemba, itens iniciais e regras de acesso
sql/003_cronograma.sql             tabelas treinamentos e treinamento_participantes e regras de acesso
sql/004_cronograma_status_carga.sql colunas carga_minutos e status e permissão de alterá-las
sql/005_planos_acao.sql            tabela planos_acao e regras de acesso
LEIAME.md             este arquivo
CHANGELOG.md          histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- Nada do app aparece sem login. Ao clicar em Sair, as listas, o Painel, o Cronograma e o Plano de ação somem da tela.
- Dados de colaboradores: só matrícula, nome, setor e status.

## Como mudar algo

1. Subir os arquivos no ramo **teste**. O jeito mais seguro é editar pelo **lápis** (apagar tudo e colar o arquivo novo) ou criar com **Add file → Create new file**, digitando o caminho (ex.: `js/painel.js`). Se houver arquivo `sql/` novo, rodar antes no Supabase.
   - Se usar Upload files, arraste as **pastas** (`css`, `js`, `sql`), não os arquivos soltos.
2. Conferir no **link de teste** com o roteiro de teste.
3. Depois de aprovado: GitHub → **Pull requests** → **New pull request** (base: `main`, compare: `teste`) → **Create pull request** → **Merge pull request**. Nunca apagar o ramo teste.
4. A Vercel publica o link oficial sozinha em cerca de 1 minuto.

Atenção: o banco (Supabase) é um só para o link de teste e o oficial. Dados criados no teste aparecem também no oficial (treinamentos, registros e ações de teste podem ser apagados pela lixeira).

## Proteção da Vercel

Os links de teste podem pedir login da Vercel (use "Continue with GitHub"). Mesmo sem essa proteção, nada do app aparece sem o login do Supabase.
