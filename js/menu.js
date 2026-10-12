/* ==========================================================
   js/menu.js
   Troca de abas. A aba escolhida fica no endereço (#colaboradores),
   assim ao recarregar a página você continua na mesma aba.
   ========================================================== */

(function () {
  const ABAS = ['painel', 'gemba', 'torre', 'pokayoke', 'eficacia', 'cronograma', 'planoacao', 'colaboradores'];
  const PADRAO = 'painel';
  const TITULO_SITE = 'Gestão de Processo e Qualidade · Mirassol SSP53';

  const menu = document.getElementById('menu');

  function abaDoEndereco() {
    const h = (location.hash || '').replace('#', '').toLowerCase();
    return ABAS.includes(h) ? h : PADRAO;
  }

  function mostrarAba(nome) {
    ABAS.forEach((a) => {
      const sec = document.getElementById('aba-' + a);
      if (sec) sec.hidden = a !== nome;
    });
    menu.querySelectorAll('a[data-aba]').forEach((link) => {
      if (link.dataset.aba === nome) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const sec = document.getElementById('aba-' + nome);
    document.title = (sec && sec.dataset.titulo ? sec.dataset.titulo + ' · ' : '') + TITULO_SITE;
    // Avisa as abas (ex.: colaboradores.js) que a aba foi aberta
    document.dispatchEvent(new CustomEvent('gq:aba', { detail: { aba: nome } }));
  }

  window.addEventListener('hashchange', () => {
    mostrarAba(abaDoEndereco());
    window.scrollTo(0, 0);
  });

  mostrarAba(abaDoEndereco());

  // O menu só aparece com alguém logado
  if (typeof sb !== 'undefined' && sb) {
    sb.auth.onAuthStateChange((_evento, sessao) => {
      menu.hidden = !(sessao && sessao.user);
    });
  }
})();
