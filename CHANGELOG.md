Histórico de mudanças
Data	Fase / alteração	O que mudou
12/10/2026	Fase 0	Estrutura criada: GitHub (ramos main e teste), Supabase (cadastro público desligado, usuário único) e Vercel. Tela de login, cabeçalho DHL, botão Sair e tela "Em construção".
12/10/2026	Fase 0 (correção)	URL do Supabase corrigida em js/supabase.js (removido /rest/v1/ do final).
12/10/2026	Fase 0 aprovada	Testada no link de teste e levada para o main (link oficial).
12/10/2026	Fase 1	Menu com as 8 abas (7 "Em construção") e aba Colaboradores completa: adicionar, lista com busca, status Ativo/Desligado na linha, lixeira só para cadastro errado e importação de .xlsx/.csv (Nome e Matrícula; só cadastra matrículas novas). Tabela colaboradores criada (sql/001_colaboradores.sql). Arquivos novos: js/menu.js, js/planilha.js, js/colaboradores.js. Alterados: index.html, css/estilo.css.
12/10/2026	Fase 1 aprovada	Testada no link de teste e levada para o main (link oficial).
12/10/2026	Fase 2	Aba Gemba funcionando: registro em 4 passos (colaborador Ativo, processo, motivo, ação), observação, "+ Adicionar" em processo, motivo e ação, e "Registros de hoje" com lixeira só para lançamento errado. Tabelas listas (com os itens das Listas do Sistema) e registros_gemba criadas (sql/002_gemba.sql). LISTA_MOTIVOS_BK começa vazia. Colaborador com registro no Gemba não pode ser excluído. Arquivos novos: js/listas.js, js/gemba.js. Alterados: index.html, css/estilo.css.
13/10/2026	Fase 2 (correção)	Arquivos que tinham caído na raiz do ramo teste movidos para js/, sql/ e css/. Nenhuma mudança de código.
13/10/2026	Fase 2 aprovada	Testada no link de teste e levada para o main (link oficial).
