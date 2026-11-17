/* ==========================================================
   js/faltantes.js
   Aba "Faltante Aduana": abre o painel (faltantes.html) numa moldura na 1ª vez que a aba é aberta.
   O painel lê e grava a planilha do Google Sheets pelo servidor api/faltantes.js (Vercel).
   ========================================================== */
(function () {
  const quadro = document.getElementById('faltantes-quadro');
  if (!quadro) return;
  const abrir = () => { if (!quadro.getAttribute('src')) quadro.setAttribute('src', 'faltantes.html'); };
  document.addEventListener('gq:aba', (ev) => { if (ev.detail && ev.detail.aba === 'faltantes') abrir(); });
  const sec = document.getElementById('aba-faltantes');
  if (sec && !sec.hidden) abrir(); // a página já abriu nesta aba
})();
