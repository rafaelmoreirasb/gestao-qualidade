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
const SUPABASE_URL = 'https://cpufojkpsayfzjsrygej.supabase.co';
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

// Cadastro: só e-mails deste domínio (a regra também está no banco)
const DOMINIO_CADASTRO = '@dhl.com';
const NOMES_PAPEIS = { pendente: 'Pendente', analista: 'Analista', gestao: 'Gestão', admin: 'Administrador', bloqueado: 'Bloqueado' };

let recuperandoSenha = /type=recovery/.test(location.hash);
let usuarioCarregado = null; // id da conta cujo perfil já foi carregado

function mostrarTela(qual) {
  el('tela-aguarde').hidden = qual !== 'aguarde';
  el('tela-login').hidden = qual !== 'login';
  el('tela-status').hidden = qual !== 'status';
  el('tela-app').hidden = qual !== 'app';
  el('area-usuario').hidden = !(qual === 'app' || qual === 'status');
  el('menu').hidden = qual !== 'app';
  document.body.classList.remove('carregando');
}

function mostrarErroLogin(texto, tipo) {
  const caixa = el('login-mensagem');
  caixa.textContent = texto || '';
  caixa.hidden = !texto;
  caixa.className = 'mensagem ' + (tipo === 'info' ? 'mensagem-ok' : 'mensagem-erro');
}

function mostrarFormLogin(nome) {
  ['login', 'criar', 'esqueci', 'nova-senha'].forEach((f) => { el('form-' + f).hidden = f !== nome; });
  mostrarErroLogin('');
  mostrarTela('login');
}

function mostrarStatus(titulo, texto) {
  el('status-titulo').textContent = titulo;
  el('status-texto').textContent = texto;
  mostrarTela('status');
}

function mostrarPapel(perfil) {
  const selo = el('usuario-papel');
  selo.hidden = !perfil;
  if (perfil) { selo.textContent = NOMES_PAPEIS[perfil.papel] || perfil.papel; selo.className = 'papel ' + perfil.papel; }
}

// Avisa o menu e a aba Calculadora PEL de quem entrou
function avisarPerfil(sessao, perfil) {
  // Administrador vê todas as abas; Analista e Gestão só a Calculadora PEL
  window.gqAbasPermitidas = perfil && perfil.papel === 'admin' ? null : ['pel'];
  if (typeof window.gqAtualizarMenu === 'function') window.gqAtualizarMenu();
  document.dispatchEvent(new CustomEvent('gq:perfil', { detail: { usuario: sessao ? sessao.user : null, perfil } }));
}

async function aplicarSessao(sessao, forcar) {
  if (recuperandoSenha) return;
  if (!(sessao && sessao.user)) {
    usuarioCarregado = null;
    el('usuario-email').textContent = '';
    el('login-senha').value = '';
    mostrarPapel(null);
    avisarPerfil(null, null);
    mostrarFormLogin('login');
    return;
  }
  if (!forcar && usuarioCarregado === sessao.user.id) return; // ex.: renovação automática do login
  usuarioCarregado = sessao.user.id;
  el('usuario-email').textContent = sessao.user.email || '';

  const { data: perfil, error } = await sb.from('pel_perfis').select('*').eq('user_id', sessao.user.id).maybeSingle();
  if (error) {
    usuarioCarregado = null;
    mostrarStatus('Não foi possível carregar sua conta', 'Confira a internet e clique em Verificar de novo.');
    return;
  }
  mostrarPapel(perfil);
  if (perfil && perfil.nome) el('usuario-email').textContent = perfil.nome;

  if (!perfil) {
    mostrarStatus('Conta sem acesso', 'Este app aceita só contas com e-mail ' + DOMINIO_CADASTRO + '. Clique em Sair e crie uma conta com o seu e-mail DHL.');
  } else if (perfil.papel === 'pendente') {
    mostrarStatus('Conta aguardando liberação', 'Sua conta foi criada. O administrador precisa definir se você é Analista ou Gestão, e qual é o seu site. Assim que ele liberar, clique em Verificar de novo.');
  } else if (perfil.papel === 'bloqueado') {
    mostrarStatus('Conta sem acesso', 'Sua conta está bloqueada. Fale com o administrador.');
  } else if (perfil.papel === 'analista' && !perfil.site) {
    mostrarStatus('Falta definir o seu site', 'Sua conta é de Analista, mas o administrador ainda não escolheu o seu site. Assim que ele escolher, clique em Verificar de novo.');
  } else {
    mostrarTela('app');
    avisarPerfil(sessao, perfil);
    return;
  }
  avisarPerfil(sessao, null);
}

function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function traduzirErroCadastro(erro) {
  const msg = (erro && erro.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Já existe uma conta com este e-mail. Use Entrar ou Esqueci minha senha.';
  if (msg.includes('password should be') || msg.includes('weak')) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) return 'O cadastro de novas contas está desligado no Supabase. Fale com o administrador.';
  if (msg.includes('not authorized') || msg.includes('sending')) return 'O Supabase não conseguiu enviar o e-mail. Fale com o administrador.';
  return traduzirErroLogin(erro);
}

async function ocupado(botao, textoOcupado, fn) {
  const original = botao.textContent;
  botao.disabled = true; botao.textContent = textoOcupado;
  try { await fn(); } finally { botao.disabled = false; botao.textContent = original; }
}

function enderecoDoApp() { return location.origin + location.pathname; }

async function iniciar() {
  if (!configurado) {
    mostrarTela('login');
    mostrarErroLogin('Configuração pendente: cole a URL e a chave pública do Supabase no arquivo js/supabase.js.');
    el('botao-entrar').disabled = true;
    return;
  }

  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrarFormLogin(b.dataset.ir)));

  // Entrar
  el('form-login').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = el('login-email').value.trim();
    const senha = el('login-senha').value;
    if (!email || !senha) { mostrarErroLogin('Preencha e-mail e senha.'); return; }
    mostrarErroLogin('');
    ocupado(el('botao-entrar'), 'Entrando…', async () => {
      try {
        const sessao = await entrar(email, senha);
        await aplicarSessao(sessao, true);
      } catch (erro) {
        el('login-senha').value = '';
        mostrarErroLogin(traduzirErroLogin(erro));
      }
    });
  });

  // Criar conta (só e-mail DHL; nasce Pendente)
  el('form-criar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nome = el('criar-nome').value.trim();
    const email = el('criar-email').value.trim().toLowerCase();
    const s1 = el('criar-senha').value, s2 = el('criar-senha2').value;
    if (!nome) { mostrarErroLogin('Digite o seu nome.'); return; }
    if (!emailValido(email)) { mostrarErroLogin('Digite um e-mail válido.'); return; }
    if (!email.endsWith(DOMINIO_CADASTRO)) { mostrarErroLogin('Use o seu e-mail DHL (terminado em ' + DOMINIO_CADASTRO + ').'); return; }
    if (s1.length < 8) { mostrarErroLogin('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (s1 !== s2) { mostrarErroLogin('As duas senhas não são iguais.'); return; }
    ocupado(el('botao-criar'), 'Criando…', async () => {
      const { data, error } = await sb.auth.signUp({ email, password: s1, options: { data: { nome }, emailRedirectTo: enderecoDoApp() } });
      if (error) { mostrarErroLogin(traduzirErroCadastro(error)); return; }
      el('form-criar').reset();
      if (data.session) { await aplicarSessao(data.session, true); return; }
      mostrarFormLogin('login');
      el('login-email').value = email;
      mostrarErroLogin('Conta criada. Enviamos um e-mail de confirmação para ' + email + '. Abra o link e depois entre com a sua senha.', 'info');
    });
  });

  // Esqueci minha senha
  el('form-esqueci').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = el('esqueci-email').value.trim().toLowerCase();
    if (!emailValido(email)) { mostrarErroLogin('Digite um e-mail válido.'); return; }
    ocupado(el('botao-esqueci'), 'Enviando…', async () => {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: enderecoDoApp() });
      if (error) { mostrarErroLogin(traduzirErroCadastro(error)); return; }
      mostrarErroLogin('Se existir uma conta com ' + email + ', você vai receber um link para criar uma nova senha.', 'info');
    });
  });

  // Nova senha (depois de abrir o link do e-mail)
  el('form-nova-senha').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const s1 = el('nova-senha').value, s2 = el('nova-senha2').value;
    if (s1.length < 8) { mostrarErroLogin('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (s1 !== s2) { mostrarErroLogin('As duas senhas não são iguais.'); return; }
    ocupado(el('botao-nova-senha'), 'Salvando…', async () => {
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) { mostrarErroLogin(traduzirErroCadastro(error)); return; }
      recuperandoSenha = false;
      history.replaceState(null, '', location.pathname + location.search);
      await aplicarSessao(await sessaoAtual(), true);
    });
  });

  // Sair
  el('botao-sair').addEventListener('click', async () => {
    await sair();
    aplicarSessao(null);
  });

  // Conta pendente: conferir de novo se já foi liberada
  el('botao-status-recarregar').addEventListener('click', async () => {
    aplicarSessao(await sessaoAtual(), true);
  });

  // Mantém a tela certa se a sessão mudar (expirou, saiu em outra aba etc.)
  // O Supabase pede para não chamar o banco dentro deste aviso; por isso o setTimeout.
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { recuperandoSenha = true; mostrarFormLogin('nova-senha'); return; }
    setTimeout(() => aplicarSessao(sessao), 0);
  });

  // Ao abrir a página: veio do link de nova senha ou já está logado?
  if (recuperandoSenha) { mostrarFormLogin('nova-senha'); return; }
  await aplicarSessao(await sessaoAtual());
}

iniciar();
