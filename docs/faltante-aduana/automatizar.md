# Parar de exportar os relatórios à mão

Hoje o Rafael exporta todo dia **3 relatórios** do portal da operação (Aduana, Auditoria de Carrinho e Problem Solving) e
joga na pasta do Drive **"Faltantes – Entrada"**. O importador (Apps Script, a cada 15 min) pega os arquivos dali e grava
na planilha.

O portal **não tem envio agendado** e o Rafael **não tem acesso a query**. O Claude também **não consegue entrar no portal**:
ele é interno da DHL e não deve ser acessado com o login de outra pessoa. Por isso há três caminhos, do mais rápido ao
definitivo.

---

## 1. Já: o arquivo cai direto no Drive (sem pedir nada a ninguém)

Isto tira o passo "arrastar para o Drive". Você clica em **Exportar** no portal e pronto.

1. Instale o **Google Drive para computador** (drive.google.com/drive/download) e entre com a conta que tem a pasta
   "Faltantes – Entrada". Se o computador da DHL não deixar instalar, peça à TI. É um programa comum do Google.
2. Abra o Explorador de Arquivos. Aparece a unidade **Google Drive (G:)**. Entre em **Meu Drive › Faltantes – Entrada**.
3. No navegador do trabalho, mude a pasta de downloads para essa pasta:
   - **Chrome**: Configurações › Downloads › Local › **Alterar** › escolha `G:\Meu Drive\Faltantes – Entrada`.
   - **Edge**: Configurações › Downloads › Local › **Alterar** › a mesma pasta.
   - Se você baixa outras coisas nesse navegador, ligue **"Perguntar onde salvar cada arquivo"** e escolha a pasta só para
     os 3 relatórios.
4. **Favoritos**: abra cada relatório no portal já com os filtros certos e salve como favorito ("Aduana", "Carrinho",
   "Problem Solving"). No dia a dia: favorito › Exportar, três vezes.
5. Confira: em até 15 min os arquivos somem da pasta, porque vão para "Processados". Isso quer dizer que entraram na planilha.

O nome do arquivo não importa: o importador reconhece cada relatório pelas colunas.

---

## 2. O caminho definitivo: pedir à TI

Copie, ajuste o que precisar e mande para a TI ou para o gestor. Peça **uma** das opções, na ordem de preferência.

> **Assunto:** Acesso automático a 3 relatórios do portal da operação (SSP53 Mirassol)
>
> Olá, sou o Rafael Moreira, analista da operação SSP53 Mirassol.
>
> Todos os dias exporto manualmente 3 relatórios do portal da operação para acompanhar os pacotes faltantes na aduana:
> **Aduana** (pacotes auditados na aduana: Shipment ID, placa, data/hora, rota, estado, rep), **Auditoria de Carrinho**
> (Shipment ID, data/hora, gaiola, estado, rep) e **Problem Solving** (ID do pacote, problema, estado, resolução, datas, ID
> do caso). Os dados vão para uma planilha Google da minha conta DHL, compartilhada só com o domínio dhl.com, e alimentam o
> painel da reunião diária.
>
> Gostaria de automatizar essa coleta. Qualquer uma destas opções resolve, em ordem de preferência:
> 1. **Acesso de leitura (query) às tabelas** que geram esses 3 relatórios, como já temos para o Sorting e o Histórico, com
>    atualização automática numa planilha;
> 2. **Acesso à API** do portal para esses 3 relatórios;
> 3. **Envio automático diário** dos 3 arquivos (por e-mail ou para uma pasta do Google Drive);
> 4. Se nenhuma for possível: autorização para usar o **Power Automate Desktop** no meu computador do trabalho, para exportar
>    os 3 relatórios num horário agendado e salvar na pasta do Drive.
>
> Volume aproximado: 25 mil linhas por dia no total. Frequência ideal: a cada hora, ou pelo menos 2 vezes por dia (manhã e
> tarde). Os dados continuam dentro do ambiente DHL.
>
> Obrigado!

Quando a opção 1, 2 ou 3 sair, avise o Claude. Ele liga a nova fonte e desliga a pasta de entrada e o gatilho
`importarRelatorios`, como já estava previsto.

---

## 3. Robô no computador do trabalho (só com o ok da TI)

O **Power Automate Desktop** é da Microsoft e normalmente já vem no Windows corporativo. Ele grava os seus cliques e repete
sozinho num horário:

1. abre o navegador no portal, com a sessão já logada;
2. abre cada um dos 3 relatórios e clica em Exportar;
3. salva o arquivo na pasta `G:\Meu Drive\Faltantes – Entrada`.

O resto segue igual: o importador pega o arquivo e o painel mostra.

**Cuidados**
- Ele usa o **seu login**. Por isso precisa da autorização da TI.
- O computador precisa estar **ligado e com a sessão aberta** no horário.
- Se o portal mudar de tela, o fluxo precisa ser ajustado.

Se a TI aprovar, peça ao Claude o passo a passo do fluxo, com os nomes exatos dos botões do portal (mande prints das telas).
