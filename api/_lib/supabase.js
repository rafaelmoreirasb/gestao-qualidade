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

  return { usuarioDoToken, cache };
}

module.exports = { supabaseServidor };
