/* ==========================================================
   api/_lib/supabase.js
   Confere quem está logado (token do Supabase que a tela manda) e guarda o cache do painel
   na tabela faltantes_cache (sql/016_faltantes_cache.sql). Usa a chave secreta (service role),
   que fica só nas variáveis de ambiente do Vercel.
   ========================================================== */

function supabaseServidor({ url, chaveServico }) {
  const base = String(url || '').replace(/\/$/, '');
  // A chave secreta vai só no cabeçalho apikey (funciona com a chave nova sb_secret_… e com a antiga service_role).
  const cab = { apikey: chaveServico, 'Content-Type': 'application/json' };

  /** Devolve { email, papel, abas } de quem mandou o token, ou null se o token não vale. */
  async function usuarioDoToken(tokenUsuario) {
    if (!tokenUsuario) return null;
    const r = await fetch(base + '/auth/v1/user', { headers: { apikey: chaveServico, Authorization: 'Bearer ' + tokenUsuario } });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !u.id) return null;
    const p = await fetch(base + '/rest/v1/pel_perfis?select=papel,nome,abas&user_id=eq.' + encodeURIComponent(u.id), { headers: cab });
    const perfis = p.ok ? await p.json() : [];
    return { id: u.id, email: u.email || '', papel: perfis[0] ? perfis[0].papel : '', nome: perfis[0] ? perfis[0].nome : '', abas: perfis[0] && perfis[0].abas && typeof perfis[0].abas === 'object' ? perfis[0].abas : {} };
  }

  const cache = {
    async ler(chave) {
      try {
        const r = await fetch(base + '/rest/v1/faltantes_cache?select=valor,expira&chave=eq.' + encodeURIComponent(chave), { headers: cab });
        if (!r.ok) return null;
        const [linha] = await r.json();
        if (!linha || new Date(linha.expira).getTime() < Date.now()) return null;
        return JSON.parse(linha.valor);
      } catch (e) { return null; }
    },
    async gravar(chave, valor, segundos) {
      try {
        await fetch(base + '/rest/v1/faltantes_cache?on_conflict=chave', {
          method: 'POST', headers: { ...cab, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ chave, valor: JSON.stringify(valor), expira: new Date(Date.now() + (segundos || 600) * 1000).toISOString() }),
        });
      } catch (e) { /* sem cache, tudo bem */ }
    },
  };

  /** Foto de cada dia (sql/020_faltantes_foto.sql): guardada para sempre, para o painel mostrar dias já arquivados da planilha. */
  const fotos = {
    async listar() {
      const r = await fetch(base + '/rest/v1/faltantes_foto?select=dia,n,origem,gerado_em&order=data.desc', { headers: cab });
      if (!r.ok) throw new Error('Não consegui ler as fotos dos dias (rode o sql/020_faltantes_foto.sql no Supabase). HTTP ' + r.status);
      return r.json();
    },
    async ler(dia) {
      const r = await fetch(base + '/rest/v1/faltantes_foto?select=valor,origem,gerado_em&dia=eq.' + encodeURIComponent(dia), { headers: cab });
      if (!r.ok) return null;
      const [linha] = await r.json();
      if (!linha) return null;
      const v = JSON.parse(linha.valor);
      v.foto = { origem: linha.origem, geradoEm: new Date(linha.gerado_em).getTime() };
      return v;
    },
    async gravar(dia, valor, n, origem) {
      const m = String(dia).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) throw new Error('Dia inválido para a foto: ' + dia);
      const r = await fetch(base + '/rest/v1/faltantes_foto?on_conflict=dia', {
        method: 'POST', headers: { ...cab, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ dia, data: m[3] + '-' + m[2] + '-' + m[1], n: n || 0, valor: JSON.stringify(valor), origem: origem || '', gerado_em: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error('Não consegui guardar a foto do dia ' + dia + ' (HTTP ' + r.status + ').');
    },
  };

  return { usuarioDoToken, cache, fotos };
}

module.exports = { supabaseServidor };
