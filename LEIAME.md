# Gestão de Processo e Qualidade — Mirassol SSP53

App web da operação DHL Supply Chain Mirassol SSP53 para registrar desvios de processo, treinamentos e planos de ação.

## Situação atual: Fase 0

- **Tela de login** por e-mail e senha (Supabase). Senha errada é recusada com a mensagem "E-mail ou senha incorretos".
- Depois de entrar: cabeçalho DHL (logo, "Gestão de Processo e Qualidade", "Mirassol SSP53"), seu e-mail, botão **Sair** e a mensagem **"Em construção"**.
- O login fica lembrado no navegador até você clicar em **Sair** (ou a sessão expirar).
- Nenhuma aba funciona ainda e não há tabelas no banco.

## Onde cada coisa está

| Serviço | Para que serve |
| --- | --- |
| GitHub `rafaelmoreirasb/gestao-qualidade` (privado) | Guarda o código. Ramo **main** = oficial; ramo **teste** = mudanças em teste |
| Supabase, projeto `gestao-qualidade` (São Paulo) | Login e, nas próximas fases, o banco de dados. Cadastro de novos usuários **desligado** |
| Vercel, projeto `gestao-qualidade` | Publica o site: **main** → link oficial; **teste** → link de teste fixo (endereço com `git-teste`) |

## Arquivos

```text
index.html        página única: cabeçalho, login e conteúdo
logo.png          logo DHL
css/estilo.css    cores, fontes e componentes
js/supabase.js    conexão com o Supabase, entrar, sair (URL e chave pública no topo)
                  a URL deve terminar em .supabase.co (sem /rest/v1/)
LEIAME.md         este arquivo
CHANGELOG.md      histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- Nada do app aparece sem login.

## Como mudar algo

1. Subir os arquivos no ramo **teste** (GitHub → Add file → Upload files, ou lápis para editar).
2. Conferir no **link de teste** com o roteiro de teste.
3. Depois de aprovado: GitHub → **Pull requests** → **New pull request** (base: `main`, compare: `teste`) → **Create pull request** → **Merge pull request**. Nunca apagar o ramo teste.
4. A Vercel publica o link oficial sozinha em cerca de 1 minuto.

## Proteção da Vercel

Os links de teste podem pedir login da Vercel (use "Continue with GitHub"). Mesmo sem essa proteção, nada do app aparece sem o login do Supabase.
