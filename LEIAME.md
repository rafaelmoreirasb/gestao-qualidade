# Gestão de Processo e Qualidade — Mirassol SSP53

App web da operação DHL Supply Chain Mirassol SSP53 para registrar desvios de processo, treinamentos e planos de ação.

## Situação atual: Fase 3

- **Tela de login** por e-mail e senha (Supabase). Senha errada é recusada com a mensagem "E-mail ou senha incorretos".
- O login fica lembrado no navegador até você clicar em **Sair** (ou a sessão expirar).
- Depois de entrar: cabeçalho DHL (logo, "Gestão de Processo e Qualidade", "Mirassol SSP53"), menu com as 8 abas, seu e-mail e botão **Sair**.
- **Menu:** Painel, Gemba, Torre de Aduana, Poka-Yoke, Eficácia, Cronograma, Plano de ação e Colaboradores. A aba aberta fica em vermelho e aparece no endereço (ex.: `#colaboradores`); ao recarregar, você continua nela. Sem login, o menu não aparece.
- **Abas ainda "Em construção":** Torre de Aduana, Poka-Yoke, Eficácia ("Eficácia do Treinamento"), Cronograma e Plano de ação.

### Aba Painel — "Visão Geral" (funcionando)

O Painel só **lê** o banco (registros do Gemba, colaboradores e listas). Ele não grava nada. Ao abrir a aba, os dados são lidos de novo, então um registro feito agora no Gemba já aparece.

- **Início da contagem: 13/10/2026.** Registros anteriores (testes de 12/10) continuam no banco, mas não entram no Painel. A data fica numa linha só, no topo de `js/painel.js` (constante `INICIO`).
- **Filtro de setor:** "Todos os setores" ou um **processo** do Gemba (os da LISTA_PROCESSOS e os que aparecem nos registros). O campo setor dos colaboradores está vazio por enquanto. O filtro vale para o Painel inteiro.
- **4 indicadores do ano:** Registros, Desvios, Treinamentos (0 com o aviso "passa a contar na Fase 4") e **Processo com mais desvios** (nome e quantidade).
  - Não há indicador nem modo de Conformidade: o Gemba só registra desvio (decisão da Fase 3).
- **Mapa de calor do ano: um mapa só**, com desvios e treinamentos juntos (decisão de 13/10/2026; não há botões para trocar de modo). Uma coluna por semana, de domingo a sábado. Cores de cada dia:
  - **vermelho** = dia com desvio; quanto mais escuro, mais desvios;
  - **amarelo** = dia só com treinamento;
  - **dividido na diagonal** (metade vermelha, metade amarela) = desvio e treinamento no mesmo dia;
  - **contorno amarelo** = treinamento agendado num dia futuro;
  - **cinza** = sem registro; **tracejado** = dia futuro ou antes do início da contagem.
  - Os treinamentos só aparecem quando o Cronograma existir (Fase 4); a legenda avisa isso.
- **Resumo do dia:** passar o mouse num dia (ou tocar, no celular) mostra abaixo do mapa a data, a contagem de desvios e treinamentos e a lista: hora, colaborador, processo e motivo.
- No computador, o mapa abre rolado até a semana de hoje. Quando houver mais de um ano, aparece um seletor de ano.
- **Mapa por colaborador:** escolher a pessoa (Ativos primeiro; desligados aparecem com "(desligado)"). Ficha com iniciais, nome, matrícula, setor ("Sem setor" por enquanto), total de desvios, treinamentos (0 até a Fase 4) e o **desvio que mais se repete** (processo — motivo). Abaixo, o mapa de calor só dela, com as mesmas regras de cor (vermelho escuro = mais de um desvio no dia) e o resumo do dia com hora, processo, motivo e ação.

### Aba Gemba (funcionando)

Registro rápido de desvio em 4 passos, feito para usar também no celular.

1. **Colaborador:** busca por nome ou matrícula; mostra até 5 resultados, só **Ativos**. Ao escolher, aparece o cartão com nome, matrícula e setor ("Sem setor" por enquanto) e o botão **Trocar**.
2. **Processo:** botões com os itens da LISTA_PROCESSOS, mais o campo **+ Adicionar**.
3. **Motivo do erro:** lista suspensa com a LISTA_MOTIVOS_<PROCESSO> do processo escolhido, mais **+ Adicionar**. Fica apagada até escolher o processo.
4. **Ação tomada:** botões da LISTA_ACOES, mais **+ Adicionar**.

- **Observação** opcional e botão **Salvar registro**. Se faltar algo, aparece "Falta escolher: …".
- Depois de salvar, o formulário limpa, mas o **processo continua marcado**, para agilizar vários registros no mesmo posto.
- **Registros de hoje** (quadro amarelo): data, contagem e os registros do dia, com nome, hora, processo · motivo, ação e observação. No celular, o quadro fica embaixo do formulário.
- **Lixeira** em cada registro de hoje: pede confirmação e serve **só para corrigir lançamento feito errado**.
- **+ Adicionar** grava o item novo no banco, na lista oficial. Item que já existe (mesmo com maiúscula ou acento diferente) não é duplicado; o sistema só seleciona o que já existe.
- **Processo novo** cria a sua lista de motivos, vazia: LISTA_MOTIVOS_ + nome em maiúsculas, sem acento, com _ no lugar de espaço (ex.: "Expedição" → LISTA_MOTIVOS_EXPEDICAO).
- **LISTA_MOTIVOS_BK** começou vazia: os motivos reais são criados na tela, pelo + Adicionar.
- O registro guarda o **texto** do processo, do motivo e da ação. Se um nome de lista mudar no futuro, os registros antigos continuam com o nome antigo.

### Aba Colaboradores (funcionando)

- **Título com contagem:** total, ativos e desligados.
- **Adicionar manualmente:** matrícula e nome. Matrícula repetida é recusada ("Essa matrícula já está na lista").
- **Lista estilo planilha:** #, Matrícula, Nome, Status, Treinamentos e lixeira; busca por nome, matrícula ou status.
- **Status na própria linha:** Ativo (verde) ou Desligado (vermelho, nome riscado, vai para o fim da lista).
- **Regra:** quem sai da empresa vira **Desligado** e o histórico continua. A **lixeira** é só para corrigir cadastro feito errado e pede confirmação. Quem já tem registro no Gemba **não pode ser excluído**: o banco recusa e a tela pede para marcar como Desligado.
- **Treinamentos:** mostra 0 por enquanto; passa a contar na Fase 4 (Cronograma).
- **Importar planilha** (.xlsx ou .csv, primeira aba) com as colunas **Nome** e **Matrícula**:
  - só cadastra as matrículas que ainda **não estão na lista**, como Ativo;
  - quem já está na lista não muda; importar a mesma planilha de novo não duplica;
  - matrícula repetida na planilha conta uma vez; linha sem nome ou sem matrícula é ignorada;
  - a planilha é lida no navegador e não é guardada, só os dados.

## Banco de dados (Supabase)

| Tabela | Criada em | Campos |
| --- | --- | --- |
| colaboradores | `sql/001_colaboradores.sql` (Fase 1) | id, matricula (única, texto), nome, setor (vazio por enquanto), status (Ativo/Desligado), criado_em |
| listas | `sql/002_gemba.sql` (Fase 2) | id, lista (ex.: LISTA_ACOES), item, ordem, ativo, criado_em. Item único por lista. Pode ler, acrescentar e desativar; **não pode apagar** (item removido fica com ativo = falso) |
| registros_gemba | `sql/002_gemba.sql` (Fase 2) | id, data (data e hora), colaborador_id, processo, motivo, acao, observacao, criado_em. Pode ler, cadastrar e excluir (só lançamento errado) |

- A Fase 3 (Painel) **não criou tabelas**: só lê as que já existem.
- RLS ligado: só o usuário logado lê e grava. Visitante sem login não acessa nada.
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
css/estilo.css        cores, fontes e componentes (menu, planilha, status, importação, Gemba, Painel)
js/supabase.js        conexão com o Supabase, entrar, sair (URL e chave pública no topo)
                      a URL deve terminar em .supabase.co (sem /rest/v1/)
js/listas.js          leitura e acréscimo de itens nas LISTA_... (arquivo comum)
js/menu.js            troca de abas
js/planilha.js        leitura de .xlsx e .csv no navegador, sem biblioteca
js/painel.js          aba Painel (indicadores, mapa de calor único e mapa por colaborador)
js/gemba.js           aba Gemba
js/colaboradores.js   aba Colaboradores
sql/001_colaboradores.sql   cria a tabela colaboradores e as regras de acesso
sql/002_gemba.sql     cria as tabelas listas e registros_gemba, os itens iniciais das listas e as regras de acesso
LEIAME.md             este arquivo
CHANGELOG.md          histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- Nada do app aparece sem login. Ao clicar em Sair, as listas e o Painel somem da tela.
- Dados de colaboradores: só matrícula, nome, setor e status.

## Como mudar algo

1. Subir os arquivos no ramo **teste**. O jeito mais seguro é editar pelo **lápis** (apagar tudo e colar o arquivo novo) ou criar com **Add file → Create new file**, digitando o caminho (ex.: `js/painel.js`). Se houver arquivo `sql/` novo, rodar antes no Supabase.
   - Se usar Upload files, arraste as **pastas** (`css`, `js`, `sql`), não os arquivos soltos; senão eles caem na raiz e o app não os encontra.
2. Conferir no **link de teste** com o roteiro de teste.
3. Depois de aprovado: GitHub → **Pull requests** → **New pull request** (base: `main`, compare: `teste`) → **Create pull request** → **Merge pull request**. Nunca apagar o ramo teste.
4. A Vercel publica o link oficial sozinha em cerca de 1 minuto.

Atenção: o banco (Supabase) é um só para o link de teste e o oficial. Dados criados no teste aparecem também no oficial, inclusive itens novos de listas e registros do Gemba (estes podem ser apagados pela lixeira).

## Proteção da Vercel

Os links de teste podem pedir login da Vercel (use "Continue with GitHub"). Mesmo sem essa proteção, nada do app aparece sem o login do Supabase.
