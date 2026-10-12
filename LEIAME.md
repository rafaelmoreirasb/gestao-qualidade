# Gestão de Processo e Qualidade — Mirassol SSP53

App web da operação DHL Supply Chain Mirassol SSP53 para registrar desvios de processo, treinamentos e planos de ação.

## Situação atual: Fase 1

- **Tela de login** por e-mail e senha (Supabase). Senha errada é recusada com a mensagem "E-mail ou senha incorretos".
- O login fica lembrado no navegador até você clicar em **Sair** (ou a sessão expirar).
- Depois de entrar: cabeçalho DHL (logo, "Gestão de Processo e Qualidade", "Mirassol SSP53"), menu com as 8 abas, seu e-mail e botão **Sair**.
- **Menu:** Painel, Gemba, Torre de Aduana, Poka-Yoke, Eficácia, Cronograma, Plano de ação e Colaboradores. A aba aberta fica em vermelho e aparece no endereço (ex.: `#colaboradores`); ao recarregar, você continua nela. Sem login, o menu não aparece.
- **Abas ainda "Em construção":** Painel (título "Visão Geral"), Gemba, Torre de Aduana, Poka-Yoke, Eficácia ("Eficácia do Treinamento"), Cronograma e Plano de ação.

### Aba Colaboradores (funcionando)

- **Título com contagem:** total, ativos e desligados.
- **Adicionar manualmente:** matrícula e nome. Matrícula repetida é recusada ("Essa matrícula já está na lista").
- **Lista estilo planilha:** #, Matrícula, Nome, Status, Treinamentos e lixeira; busca por nome, matrícula ou status.
- **Status na própria linha:** Ativo (verde) ou Desligado (vermelho, nome riscado, vai para o fim da lista).
- **Regra:** quem sai da empresa vira **Desligado** e o histórico continua. A **lixeira** é só para corrigir cadastro feito errado e pede confirmação.
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

- RLS ligado: só o usuário logado lê e grava. Visitante sem login não acessa nada.
- Os scripts `sql/` são rodados à mão no Supabase (SQL Editor → New query → colar → Run), um por vez, em ordem.

## Onde cada coisa está

| Serviço | Para que serve |
| --- | --- |
| GitHub `rafaelmoreirasb/gestao-qualidade` (privado) | Guarda o código. Ramo **main** = oficial; ramo **teste** = mudanças em teste |
| Supabase, projeto `gestao-qualidade` (São Paulo) | Login e banco de dados. Cadastro de novos usuários **desligado** |
| Vercel, projeto `gestao-qualidade` | Publica o site: **main** → link oficial; **teste** → link de teste fixo (endereço com `git-teste`) |

## Arquivos

```text
index.html            página única: cabeçalho, menu, login e uma <section> por aba
logo.png              logo DHL
css/estilo.css        cores, fontes e componentes (menu, planilha, status, importação)
js/supabase.js        conexão com o Supabase, entrar, sair (URL e chave pública no topo)
                      a URL deve terminar em .supabase.co (sem /rest/v1/)
js/menu.js            troca de abas
js/planilha.js        leitura de .xlsx e .csv no navegador, sem biblioteca
js/colaboradores.js   aba Colaboradores
sql/001_colaboradores.sql   cria a tabela colaboradores e as regras de acesso
LEIAME.md             este arquivo
CHANGELOG.md          histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- Nada do app aparece sem login. Ao clicar em Sair, a lista some da tela.
- Dados de colaboradores: só matrícula, nome, setor e status.

## Como mudar algo

1. Subir os arquivos no ramo **teste** (GitHub → Add file → Upload files, ou lápis para editar). Se houver arquivo `sql/` novo, rodar antes no Supabase.
2. Conferir no **link de teste** com o roteiro de teste.
3. Depois de aprovado: GitHub → **Pull requests** → **New pull request** (base: `main`, compare: `teste`) → **Create pull request** → **Merge pull request**. Nunca apagar o ramo teste.
4. A Vercel publica o link oficial sozinha em cerca de 1 minuto.

Atenção: o banco (Supabase) é um só para o link de teste e o oficial. Dados criados no teste aparecem também no oficial.

## Proteção da Vercel

Os links de teste podem pedir login da Vercel (use "Continue with GitHub"). Mesmo sem essa proteção, nada do app aparece sem o login do Supabase.
