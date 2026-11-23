/* ==========================================================
   js/menu.js
   Troca de abas. A aba escolhida fica no endereço (#colaboradores),
   assim ao recarregar a página você continua na mesma aba.
   ========================================================== */

(function () {
  const ABAS = ['painel', 'gemba', 'faltantes', 'pokayoke', 'eficacia', 'cronograma', 'planoacao', 'colaboradores', 'pel', 'permissoes'];
  const PADRAO = 'painel';
  const TITULO_SITE = 'Gestão de Processo e Qualidade · Mirassol SSP53';

  const menu = document.getElementById('menu');

  // Abas que a conta logada pode abrir (null = todas). Definido em js/supabase.js:
  // Administrador vê todas; as outras contas, as abas liberadas para elas (Fase 11).
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
      if (!sec) return;
      sec.hidden = a !== nome;
      // Modo Ver (Fase 11): esconde os botões de gravar, apagar e importar
      sec.classList.toggle('gq-so-ver', typeof window.gqPodeEditar === 'function' && !!window.gqNivelAba(a) && !window.gqPodeEditar(a));
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

  // Se o perfil já chegou antes deste arquivo carregar, aplica agora (Fase 11)
  if (window.gqAbasPermitidas !== undefined) window.gqAtualizarMenu();
})();
