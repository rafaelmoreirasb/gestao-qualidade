/* ==========================================================
   api/_lib/sheets.js
   Acesso à planilha pela Google Sheets API, com a CONTA DE SERVIÇO.
   A chave fica só na variável de ambiente GOOGLE_SA_JSON do Vercel (nunca no GitHub).
   Tudo é lido como o texto que aparece na planilha (FORMATTED_VALUE) e gravado como texto (RAW),
   igual ao que o Apps Script fazia.
   ========================================================== */
const crypto = require('crypto');

const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
let tokenGuardado = null; // reaproveitado enquanto a função do Vercel estiver "quente"

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function token(sa) {
  if (tokenGuardado && tokenGuardado.expira > Date.now() + 60000) return tokenGuardado.valor;
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
  const assinatura = b64url(crypto.createSign('RSA-SHA256').update(cab + '.' + corpo).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + cab + '.' + corpo + '.' + assinatura,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Google recusou a conta de serviço: ' + (j.error_description || j.error || r.status));
  tokenGuardado = { valor: j.access_token, expira: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenGuardado.valor;
}

const faixa = (aba, a1) => "'" + String(aba).replace(/'/g, "''") + "'!" + a1;

function planilhaGoogle({ id, sa }) {
  const credenciais = typeof sa === 'string' ? JSON.parse(sa) : sa;
  let abas = null; // nomes das abas (lidos uma vez por chamada)

  async function chamar(caminho, opcoes) {
    const r = await fetch(API + id + caminho, { ...(opcoes || {}), headers: { Authorization: 'Bearer ' + (await token(credenciais)), 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 403 || r.status === 404) throw new Error('Sem acesso à planilha. Compartilhe a planilha com ' + credenciais.client_email + ' como Editor. (' + msg + ')');
      throw new Error('Google Sheets: ' + msg);
    }
    return j;
  }

  return {
    url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    async existe(aba) {
      if (!abas) abas = new Set(((await chamar('?fields=sheets.properties.title')).sheets || []).map((s) => s.properties.title));
      return abas.has(aba);
    },
    async ler(aba, a1) {
      const j = await chamar('/values/' + encodeURIComponent(faixa(aba, a1)) + '?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS');
      return j.values || [];
    },
    /** Lê vários trechos da mesma aba de uma vez (values:batchGet). Devolve uma lista de tabelas, na mesma ordem. */
    async lerVarios(aba, faixasA1) {
      const saida = [];
      for (let i = 0; i < faixasA1.length; i += 40) { // até 40 trechos por pedido (o endereço não pode ficar enorme)
        const parte = faixasA1.slice(i, i + 40);
        const q = parte.map((a1) => 'ranges=' + encodeURIComponent(faixa(aba, a1))).join('&');
        const j = await chamar('/values:batchGet?' + q + '&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS');
        (j.valueRanges || []).forEach((v) => saida.push(v.values || []));
      }
      return saida;
    },
    async atualizar(aba, a1, valores) {
      await chamar('/values/' + encodeURIComponent(faixa(aba, a1)) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: valores }) });
    },
    async anexar(aba, valores) {
      await chamar('/values/' + encodeURIComponent(faixa(aba, 'A1')) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: valores }) });
    },
    async limpar(aba, a1) {
      await chamar('/values/' + encodeURIComponent(faixa(aba, a1)) + ':clear', { method: 'POST', body: '{}' });
    },
    async criarAba(aba, cabecalho) {
      await chamar(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: aba, gridProperties: { frozenRowCount: 1 } } } }] }) });
      if (abas) abas.add(aba);
      if (cabecalho) await this.atualizar(aba, 'A1', [cabecalho]);
    },
  };
}

module.exports = { planilhaGoogle };
