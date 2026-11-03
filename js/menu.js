/* ==========================================================
   js/menu.js
   Troca de abas. A aba escolhida fica no endereço (#colaboradores),
   assim ao recarregar a página você continua na mesma aba.
   ========================================================== */

(function () {
  const ABAS = ['painel', 'gemba', 'torre', 'pokayoke', 'eficacia', 'cronograma', 'planoacao', 'colaboradores', 'pel'];
  const PADRAO = 'painel';
  const TITULO_SITE = 'Gestão de Processo e Qualidade · Mirassol SSP53';

  const menu = document.getElementById('menu');

  // Abas que a conta logada pode abrir (null = todas). Definido em js/supabase.js:
  // Administrador vê todas; Analista e Gestão só a Calculadora PEL.
  function permitidas() {
    return Array.isArray(window.gqAbasPermitidas) ? window.gqAbasPermitidas : ABAS;
  }

  function abaDoEndereco() {
    const h = (location.hash || '').replace('#', '').toLowerCase();
    const lista = permitidas();
    if (lista.includes(h)) return h;
    return lista.includes(PADRAO) ? PADRAO : lista[0];
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

  // Chamado por js/supabase.js depois de carregar o perfil de quem entrou.
  // (Quando o menu aparece ou some também é decidido lá.)
  window.gqAtualizarMenu = function () {
    const lista = permitidas();
    menu.querySelectorAll('a[data-aba]').forEach((link) => { link.hidden = !lista.includes(link.dataset.aba); });
    const aba = abaDoEndereco();
    if ((location.hash || '').replace('#', '') !== aba && lista !== ABAS) history.replaceState(null, '', '#' + aba);
    mostrarAba(aba);
  };
})();
