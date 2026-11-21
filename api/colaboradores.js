/* ==========================================================
   api/colaboradores.js — função do Vercel da aba "Colaboradores"
   Lê a aba "Colaboradores" da planilha Base SSP53 (Nome, CPF, User ext, Tipo),
   que o Apps Script colaboradores.gs atualiza a cada 1 hora, e devolve as linhas para a tela.
   Só LÊ a planilha e não grava nada no banco: quem grava é a própria tela (js/colaboradores.js),
   com o login de quem está usando e as regras do banco (RLS).

   Só responde para quem está logado com a aba Colaboradores em EDITAR
   (Administrador, ou conta com Colaboradores = Editar na aba Permissões).

   Usa as mesmas variáveis de ambiente do Faltante Aduana (Vercel > Settings > Environment Variables):
     GOOGLE_SA_JSON, PLANILHA_ID (Base SSP53), SUPABASE_URL, SUPABASE_SERVICE_ROLE
   ========================================================== */

const { planilhaGoogle } = require('./_lib/sheets');
const { supabaseServidor } = require('./_lib/supabase');

const ABA = 'Colaboradores';
const PAPEIS_COM_ABAS = ['usuario', 'analista', 'gestao'];

function podeEditarColaboradores(usuario) {
  if (usuario.papel === 'admin') return true;
  if (!PAPEIS_COM_ABAS.includes(usuario.papel)) return false;
  return !!(usuario.abas && usuario.abas.colaboradores === 'editar');
}

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

module.exports = async function handler(req, res) {
  const responder = (status, corpo) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(corpo)); };
  try {
    if (req.method !== 'POST') return responder(405, { erro: 'Use POST.' });
    const faltando = ['GOOGLE_SA_JSON', 'PLANILHA_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE'].filter((k) => !process.env[k]);
    if (faltando.length) return responder(500, { erro: 'Falta configurar no Vercel: ' + faltando.join(', ') + '.' });

    const sb = supabaseServidor({ url: process.env.SUPABASE_URL, chaveServico: process.env.SUPABASE_SERVICE_ROLE });
    const tokenUsuario = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const usuario = await sb.usuarioDoToken(tokenUsuario);
    if (!usuario) return responder(401, { erro: 'Entre no app de novo (sessão expirada).' });
    if (!podeEditarColaboradores(usuario)) return responder(403, { erro: 'Sua conta não pode atualizar a aba Colaboradores.' });

    const P = planilhaGoogle({ id: process.env.PLANILHA_ID, sa: process.env.GOOGLE_SA_JSON });
    if (!(await P.existe(ABA))) return responder(200, { r: { ok: false, motivo: 'A aba "' + ABA + '" não existe na planilha Base SSP53.' } });
    const v = await P.ler(ABA, 'A1:Z');

    // Acha a linha do cabeçalho (a que tem Nome, CPF e User ext) nas 15 primeiras linhas
    let lin = -1, cNome = -1, cCpf = -1, cExt = -1, cTipo = -1;
    for (let i = 0; i < Math.min(15, v.length) && lin < 0; i++) {
      const n = (v[i] || []).map(norm);
      const a = n.indexOf('nome'), b = n.indexOf('cpf'), c = n.indexOf('user ext');
      if (a >= 0 && b >= 0 && c >= 0) { lin = i; cNome = a; cCpf = b; cExt = c; cTipo = n.indexOf('tipo'); }
    }
    if (lin < 0) return responder(200, { r: { ok: false, motivo: 'Na aba "' + ABA + '" da Base SSP53 não achei o cabeçalho com Nome, CPF e User ext.' } });

    const linhas = [];
    for (const r of v.slice(lin + 1)) {
      const nome = String((r || [])[cNome] || '').replace(/\s+/g, ' ').trim();
      if (!nome || norm(nome) === 'nome') continue; // linha vazia ou cabeçalho repetido
      linhas.push({
        nome,
        cpf: String((r || [])[cCpf] || '').trim(),
        ext: String((r || [])[cExt] || '').trim(),
        tipo: cTipo >= 0 ? String((r || [])[cTipo] || '').trim() : '',
      });
    }
    return responder(200, { r: { ok: true, linhas, lidaEm: new Date().toISOString() } });
  } catch (e) {
    console.error(e);
    return responder(500, { erro: e && e.message ? e.message : String(e) });
  }
};
