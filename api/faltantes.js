/* ==========================================================
   api/faltantes.js — função do Vercel da aba "Faltante Aduana"
   A tela (faltantes.html) manda POST { fn, args } com o token de login do Supabase.
   Só responde para quem está logado com papel liberado (hoje: Administrador).
   Os dados continuam na planilha do Google Sheets: esta função só lê e grava lá.

   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     GOOGLE_SA_JSON         conteúdo do arquivo JSON da conta de serviço do Google
     PLANILHA_ID            ID da planilha "Base SSP53"
     SUPABASE_URL           mesmo endereço que está em js/supabase.js
     SUPABASE_SERVICE_ROLE  chave secreta do Supabase (Project Settings > API Keys > secret)
   ========================================================== */
process.env.TZ = 'America/Sao_Paulo'; // as datas da planilha são horário de Brasília

const fs = require('fs');
const path = require('path');
const { criarNucleo } = require('./_lib/nucleo');
const { planilhaGoogle } = require('./_lib/sheets');
const { supabaseServidor } = require('./_lib/supabase');

const PAPEIS_LIBERADOS = ['admin'];
const FUNCOES = ['painelListarDias', 'painelDadosDoDia', 'painelSalvarClassificacao', 'painelResumoPeriodo',
  'painelResponsaveis', 'painelSalvarResponsavel', 'painelPreencherResumo', 'painelCriarAbaRegras'];

let regrasTexto = null;
function regras() {
  if (regrasTexto == null) regrasTexto = fs.readFileSync(path.join(__dirname, '..', 'js', 'faltantes-regras.js'), 'utf8');
  return regrasTexto;
}

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
    if (!PAPEIS_LIBERADOS.includes(usuario.papel)) return responder(403, { erro: 'Sua conta não tem acesso à aba Faltante Aduana.' });

    let corpo = req.body;
    if (typeof corpo === 'string') corpo = JSON.parse(corpo || '{}');
    if (!corpo || typeof corpo !== 'object') {
      const pedacos = []; for await (const p of req) pedacos.push(p);
      corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8') || '{}');
    }
    const fn = String(corpo.fn || '');
    if (!FUNCOES.includes(fn)) return responder(400, { erro: 'Função desconhecida: ' + fn });

    const nucleo = criarNucleo({
      planilha: planilhaGoogle({ id: process.env.PLANILHA_ID, sa: process.env.GOOGLE_SA_JSON }),
      cache: sb.cache, regras: regras(), usuario: usuario.email,
    });
    const r = await nucleo[fn](...(Array.isArray(corpo.args) ? corpo.args : []));
    return responder(200, { r });
  } catch (e) {
    console.error(e);
    return responder(500, { erro: e && e.message ? e.message : String(e) });
  }
};
