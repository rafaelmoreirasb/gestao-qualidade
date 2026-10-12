/* ==========================================================
   js/supabase.js
   Conexão com o Supabase, login e funções comuns.
   ========================================================== */

/* ----------------------------------------------------------
   CONFIGURAÇÃO — cole aqui os dois valores do Supabase
   (Project Settings > Data API > Project URL
    e Project Settings > API Keys > chave pública).
   Mantenha as aspas simples em volta de cada valor.
   NUNCA cole aqui a chave secreta (secret / service_role).
   ---------------------------------------------------------- */
const SUPABASE_URL = 'https://cpufojkpsayfzjsrygej.supabase.co/rest/v1/';
const SUPABASE_CHAVE_PUBLICA = 'sb_publishable_xMTcrsIwIh9kDl5I2sNbvA_P2xqFrYA';
/* ------------------- fim da configuração ------------------ */


const configurado =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_CHAVE_PUBLICA.startsWith('COLE_AQUI');

// Cliente do Supabase usado por todo o app.
// (O nome "sb" evita confusão com a biblioteca "supabase" carregada pelo CDN.)
const sb = configurado
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;


/* ---------------- Funções comuns de login ---------------- */

async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.session;
}

async function sair() {
  await sb.auth.signOut();
}

async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

function traduzirErroLogin(erro) {
  const msg = (erro && erro.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado no Supabase.';
  if (msg.includes('too many') || msg.includes('rate limit')) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Não foi possível conectar. Confira a internet e tente de novo.';
  return 'Não foi possível entrar. Tente de novo.';
}


/* ---------------- Controle das telas ---------------- */

const el = (id) => document.getElementById(id);

function mostrarTela(qual) {
  el('tela-aguarde').hidden = qual !== 'aguarde';
  el('tela-login').hidden = qual !== 'login';
  el('tela-app').hidden = qual !== 'app';
  el('area-usuario').hidden = qual !== 'app';
  document.body.classList.remove('carregando');
}

function aplicarSessao(sessao) {
  if (sessao && sessao.user) {
    el('usuario-email').textContent = sessao.user.email || '';
    mostrarTela('app');
  } else {
    el('usuario-email').textContent = '';
    el('login-senha').value = '';
    mostrarTela('login');
  }
}

function mostrarErroLogin(texto) {
  const caixa = el('login-mensagem');
  caixa.textContent = texto;
  caixa.hidden = !texto;
}

async function iniciar() {
  if (!configurado) {
    mostrarTela('login');
    mostrarErroLogin('Configuração pendente: cole a URL e a chave pública do Supabase no arquivo js/supabase.js.');
    el('botao-entrar').disabled = true;
    return;
  }

  // Entrar
  el('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    if (!email || !senha) { mostrarErroLogin('Preencha e-mail e senha.'); return; }

    mostrarErroLogin('');
    const botao = el('botao-entrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const sessao = await entrar(email, senha);
      aplicarSessao(sessao);
    } catch (erro) {
      el('login-senha').value = '';
      mostrarErroLogin(traduzirErroLogin(erro));
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });

  // Sair
  el('botao-sair').addEventListener('click', async () => {
    await sair();
    aplicarSessao(null);
  });

  // Mantém a tela certa se a sessão mudar (expirou, saiu em outra aba etc.)
  sb.auth.onAuthStateChange((_evento, sessao) => aplicarSessao(sessao));

  // Ao abrir a página: já está logado?
  aplicarSessao(await sessaoAtual());
}

iniciar();
