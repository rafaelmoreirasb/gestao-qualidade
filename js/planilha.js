/* ==========================================================
   js/planilha.js
   Leitura de planilhas .xlsx e .csv direto no navegador,
   sem biblioteca externa (mesmo código do esboço aprovado).
   Uso: const linhas = await lerPlanilha(arquivo);
        → lista de linhas; cada linha é uma lista de textos.
   Lê só a primeira aba da planilha. O arquivo não é guardado.
   ========================================================== */

async function lerPlanilha(arquivo) {
  const buf = await arquivo.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const ehZip = u8[0] === 0x50 && u8[1] === 0x4b;

  // ----- .csv (texto separado por ; ou ,) -----
  if (!ehZip) {
    let texto = new TextDecoder('utf-8').decode(u8);
    if (texto.indexOf(String.fromCharCode(65533)) >= 0) texto = new TextDecoder('windows-1252').decode(u8);
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const sep = (linhas[0] || '').split(';').length > (linhas[0] || '').split(',').length ? ';' : ',';
    return linhas.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
  }

  // ----- .xlsx (arquivo zip com XML dentro) -----
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('este navegador não consegue abrir .xlsx; salve a planilha como .csv ou atualize o navegador');
  }
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo inválido');
  const qtd = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const arquivos = {};
  for (let k = 0; k < qtd; k++) {
    const metodo = dv.getUint16(p + 10, true), tamanho = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
    arquivos[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen))] = { metodo, tamanho, loff };
    p += 46 + nlen + elen + clen;
  }
  const abrir = async (nome) => {
    const f = arquivos[nome];
    if (!f) return null;
    const inicio = f.loff + 30 + dv.getUint16(f.loff + 26, true) + dv.getUint16(f.loff + 28, true);
    const dados = u8.subarray(inicio, inicio + f.tamanho);
    if (f.metodo === 0) return new TextDecoder().decode(dados);
    const saida = await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return new TextDecoder().decode(saida);
  };

  const X = new DOMParser();
  const textos = [];
  const sx = await abrir('xl/sharedStrings.xml');
  if (sx) {
    const sis = X.parseFromString(sx, 'application/xml').getElementsByTagName('si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagName('t');
      let t = '';
      for (let j = 0; j < ts.length; j++) t += ts[j].textContent;
      textos.push(t);
    }
  }

  const aba = arquivos['xl/worksheets/sheet1.xml']
    ? 'xl/worksheets/sheet1.xml'
    : Object.keys(arquivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!aba) throw new Error('planilha sem abas');

  const doc = X.parseFromString(await abrir(aba), 'application/xml');
  const linhas = [];
  const rs = doc.getElementsByTagName('row');
  for (let i = 0; i < rs.length; i++) {
    const linha = [];
    const cs = rs[i].getElementsByTagName('c');
    for (let j = 0; j < cs.length; j++) {
      const c = cs[j], ref = c.getAttribute('r') || '', t = c.getAttribute('t');
      let col = 0;
      const letras = (ref.match(/^[A-Z]+/) || [''])[0];
      for (let k = 0; k < letras.length; k++) col = col * 26 + (letras.charCodeAt(k) - 64);
      col = letras ? col - 1 : linha.length;
      const v = c.getElementsByTagName('v')[0];
      let valor = '';
      if (t === 's' && v) valor = textos[Number(v.textContent)] || '';
      else if (t === 'inlineStr') { const ts = c.getElementsByTagName('t'); for (let k = 0; k < ts.length; k++) valor += ts[k].textContent; }
      else if (v) valor = v.textContent;
      linha[col] = String(valor).trim();
    }
    linhas.push(linha);
  }
  return linhas;
}
