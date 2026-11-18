/* ==========================================================
   api/faltantes.js — função do Vercel da aba "Faltante Aduana"
   A tela (faltantes.html) manda POST { fn, args } com o token de login do Supabase.
   Só responde para quem está logado com a aba liberada: Administrador, ou conta com a aba
   Faltante Aduana em Ver (só consulta) ou Editar (consulta e salva) — Fase 11, sql/017.
   Os dados continuam na planilha do Google Sheets: esta função só lê e grava lá.

   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     GOOGLE_SA_JSON         conteúdo do arquivo JSON da conta de serviço do Google
     PLANILHA_ID            ID da planilha "Base SSP53"
     SUPABASE_URL           mesmo endereço que está em js/supabase.js
     SUPABASE_SERVICE_ROLE  chave secreta do Supabase (Project Settings > API Keys > secret)
     FALTANTES_SEGREDO      senha combinada com o Apps Script da Base SSP53: quando a planilha recebe dados novos,
                            o script chama esta função com o cabeçalho X-Faltantes-Segredo e o app recalcula os dias recentes
   ========================================================== */
process.env.TZ = 'America/Sao_Paulo'; // as datas da planilha são horário de Brasília

const fs = require('fs');
const path = require('path');
const { criarNucleo } = require('./_lib/nucleo');
const { planilhaGoogle } = require('./_lib/sheets');
const { supabaseServidor } = require('./_lib/supabase');
const crypto = require('crypto');

/** Confere a senha do Apps Script sem vazar o tamanho/posição do erro (comparação em tempo constante). */
function segredoConfere(recebido) {
  const certo = process.env.FALTANTES_SEGREDO || '';
  if (certo.length < 16 || !recebido) return false;
  const a = crypto.createHash('sha256').update(String(recebido)).digest();
  const b = crypto.createHash('sha256').update(certo).digest();
  return crypto.timingSafeEqual(a, b);
}

// Fase 11: o Administrador marca, para cada conta, a aba em Ver ou Editar (pel_perfis.abas)
const PAPEIS_COM_ABAS = ['usuario', 'analista', 'gestao'];
const FUNCOES_QUE_GRAVAM = ['painelSalvarClassificacao', 'painelSalvarResponsavel', 'painelPreencherResumo', 'painelCriarAbaRegras'];
function nivelFaltantes(usuario) {
  if (usuario.papel === 'admin') return 'editar';
  if (!PAPEIS_COM_ABAS.includes(usuario.papel)) return null;
  const n = usuario.abas && usuario.abas.faltantes;
  return n === 'editar' || n === 'ver' ? n : null;
}
const FUNCOES = ['painelListarDias', 'painelVersao', 'painelDadosDoDia', 'painelSalvarClassificacao', 'painelResumoPeriodo',
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

    // Aviso da planilha (Apps Script): só pode pedir o recálculo dos dias recentes, nada mais.
    const segredo = req.headers['x-faltantes-segredo'];
    if (segredo !== undefined) {
      if (!segredoConfere(segredo)) return responder(401, { erro: 'Senha do aviso não confere (FALTANTES_SEGREDO no Vercel e no Apps Script).' });
      const nucleo = criarNucleo({
        planilha: planilhaGoogle({ id: process.env.PLANILHA_ID, sa: process.env.GOOGLE_SA_JSON }),
        cache: sb.cache, regras: regras(), usuario: 'planilha (aviso automático)',
      });
      const origem = String((req.query && req.query.origem) || '').slice(0, 40);
      return responder(200, { r: await nucleo.prepararRecentes(origem) });
    }

    const tokenUsuario = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const usuario = await sb.usuarioDoToken(tokenUsuario);
    if (!usuario) return responder(401, { erro: 'Entre no app de novo (sessão expirada).' });
    const nivel = nivelFaltantes(usuario);
    if (!nivel) return responder(403, { erro: 'Sua conta não tem acesso à aba Faltante Aduana.' });

    let corpo = req.body;
    if (typeof corpo === 'string') corpo = JSON.parse(corpo || '{}');
    if (!corpo || typeof corpo !== 'object') {
      const pedacos = []; for await (const p of req) pedacos.push(p);
      corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8') || '{}');
    }
    const fn = String(corpo.fn || '');
    if (!FUNCOES.includes(fn)) return responder(400, { erro: 'Função desconhecida: ' + fn });
    if (FUNCOES_QUE_GRAVAM.includes(fn) && nivel !== 'editar') return responder(403, { erro: 'Sua conta só pode ver a aba Faltante Aduana (não pode salvar).' });

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
