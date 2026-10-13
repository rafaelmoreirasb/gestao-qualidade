# Histórico de mudanças

| Data | Fase / alteração | O que mudou |
| --- | --- | --- |
| 12/10/2026 | Fase 0 | Estrutura criada: GitHub (ramos main e teste), Supabase (cadastro público desligado, usuário único) e Vercel. Tela de login, cabeçalho DHL, botão Sair e tela "Em construção". |
| 12/10/2026 | Fase 0 (correção) | URL do Supabase corrigida em js/supabase.js (removido /rest/v1/ do final). |
| 12/10/2026 | Fase 0 aprovada | Testada no link de teste e levada para o main (link oficial). |
| 12/10/2026 | Fase 1 | Menu com as 8 abas (7 "Em construção") e aba Colaboradores completa: adicionar, lista com busca, status Ativo/Desligado na linha, lixeira só para cadastro errado e importação de .xlsx/.csv (Nome e Matrícula; só cadastra matrículas novas). Tabela colaboradores criada (sql/001_colaboradores.sql). Arquivos novos: js/menu.js, js/planilha.js, js/colaboradores.js. Alterados: index.html, css/estilo.css. |
| 12/10/2026 | Fase 1 aprovada | Testada no link de teste e levada para o main (link oficial). |
| 12/10/2026 | Fase 2 | Aba Gemba funcionando: registro em 4 passos (colaborador Ativo, processo, motivo, ação), observação, "+ Adicionar" em processo, motivo e ação, e "Registros de hoje" com lixeira só para lançamento errado. Tabelas listas (com os itens das Listas do Sistema) e registros_gemba criadas (sql/002_gemba.sql). LISTA_MOTIVOS_BK começa vazia. Colaborador com registro no Gemba não pode ser excluído. Arquivos novos: js/listas.js, js/gemba.js. Alterados: index.html, css/estilo.css. |
| 13/10/2026 | Fase 2 (correção) | Arquivos que tinham caído na raiz do ramo teste movidos para js/, sql/ e css/. Nenhuma mudança de código. |
| 13/10/2026 | Fase 2 aprovada | Testada no link de teste e levada para o main (link oficial). |
| 13/10/2026 | Fase 3 | Aba Painel ("Visão Geral") funcionando: filtro de setor pelos processos do Gemba; 4 indicadores (Registros, Desvios, Treinamentos = 0 até a Fase 4, Processo com mais desvios); mapa de calor do ano com resumo do dia ao passar o mouse ou tocar; mapa por colaborador com ficha e desvio mais repetido. Contagem começa em 13/10/2026. Sem Conformidade (o Gemba só registra desvio). Sem SQL novo: o Painel só lê o banco. Arquivo novo: js/painel.js. Alterados: index.html, css/estilo.css. |
| 13/10/2026 | Fase 3 (alteração) | Mapa de calor único: saem os botões Desvios/Treinamentos; o mesmo mapa mostra os dois (vermelho = desvio, amarelo = treinamento, dividido na diagonal = os dois no mesmo dia, contorno amarelo = treinamento agendado). Mesma regra no mapa por colaborador. Muda o documento mestre, que previa modos separados. |
| 13/10/2026 | Fase 3 aprovada | Testada no link de teste e levada para o main (link oficial). |
