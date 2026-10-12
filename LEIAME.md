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
| Vercel | Publica o site: **main** → link oficial; **teste** → link de teste |

## Arquivos

```text
index.html        página única: cabeçalho, login e conteúdo
logo.png          logo DHL
css/estilo.css    cores, fontes e componentes
js/supabase.js    conexão com o Supabase, entrar, sair (URL e chave pública no topo)
LEIAME.md         este arquivo
CHANGELOG.md      histórico de mudanças
```

## Segurança

- Só a **chave pública** do Supabase fica no código (`js/supabase.js`). A chave secreta nunca entra no código.
- Só existe um usuário, criado manualmente no Supabase. Ninguém consegue se cadastrar sozinho.
- Nada do app aparece sem login.

## Como mudar algo

Sempre uma mudança por vez: primeiro no ramo **teste**, conferir no link de teste, e só depois levar para o **main**.
