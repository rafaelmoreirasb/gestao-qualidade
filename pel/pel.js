/* ==========================================================
   pel/pel.js · Calculadora PEL com login e perfis
   Papéis: Analista (preenche o próprio site), Gestão (vê todos os
   sites e edita indicadores e metas) e Administrador (Gestão +
   libera contas e cadastra sites).
   ========================================================== */
(function(){
"use strict";

const TIERS=[
  {min:0,  name:"Não classifica", range:"0% a 69,99%"},
  {min:70, name:"Bronze",         range:"70% a 79,99%"},
  {min:80, name:"Prata",          range:"80% a 87,99%"},
  {min:88, name:"Ouro",           range:"88% a 92,99%"},
  {min:93, name:"Platina",        range:"93% a 100%"},
];
const MEDALS={"Não classifica":"img/medalha-nc.webp","Bronze":"img/medalha-bronze.webp","Prata":"img/medalha-prata.webp","Ouro":"img/medalha-ouro.webp","Platina":"img/medalha-platina.webp"};

/* Indicadores: textos, pesos e metas padrão (a Gestão pode mudar pela tela) */
const KPIS=[
 {id:"bpp_lost",   p:"efi",tag:"BPP",name:"Perda na Estação (Lost at station)",   w:2,u:"%",d:"min",grp:"bpp",def:"Perda monetária do Programa de Proteção ao Comprador (BPP) causada por pacotes perdidos na estação. A meta é a perda máxima permitida para essa causa.",form:"Perdas BPP por Lost at station / GMV do cluster"},
 {id:"bpp_delay",  p:"efi",tag:"BPP",name:"Atraso na Estação (Delayed at station)",  w:2,u:"%",d:"min",grp:"bpp",def:"Perda monetária do BPP causada por pacotes atrasados na estação (cancelamento do comprador após o prazo, com falha automática por adiamento). A meta é a perda máxima permitida para essa causa.",form:"Perdas BPP por Delayed at station / GMV do cluster"},
 {id:"bpp_dmgst",  p:"efi",tag:"BPP",name:"Danificado na Estação (Damaged at station)",w:2,u:"%",d:"min",grp:"bpp",def:"Perda monetária do BPP causada por pacotes danificados na estação. A meta é a perda máxima permitida para essa causa.",form:"Perdas BPP por Damaged at station / GMV do cluster"},
 {id:"bpp_dmg",    p:"efi",tag:"BPP",name:"Embalagem Danificada (Damaged)", w:2,u:"%",d:"min",grp:"bpp",def:"Perda monetária do BPP causada por embalagem danificada. A meta é a perda máxima permitida para essa causa.",form:"Perdas BPP por Damaged / GMV do cluster"},
 {id:"cps",  p:"efi",tag:"CPS",name:"Custo por pacote (CPS)",w:8,u:"%",d:"min",def:"Mostra quanto custa cada pacote que passa pelo SVC.",form:"Custo total SVC / Volume handling V2 (tabela oficial Planning)"},
 {id:"ggp",  p:"efi",tag:"GGP",name:"Produtividade bruta (GGP)",w:8,u:"%",d:"max",def:"Produtividade bruta: total de pacotes do SVC dividido pelo quadro de reps contratados.",form:"Volume handling V2 / HC contratado (Meli + 3PL)"},
 {id:"gnp",  p:"efi",tag:"GNP",name:"Produtividade líquida (GNP)",w:4,u:"%",d:"max",def:"Produtividade líquida: pacotes conteinerizados pelo SVC divididos pelas horas registradas no LMS.",form:"Volume conteinerizado / HC LMS"},
 {id:"dgm",  p:"efi",tag:"Delay",name:"Delay GM",w:4,u:"%",d:"min",def:"Pacotes GM que tiveram a primeira visita ou entrega depois da data original de promessa, dentro do total entregue.",form:"Pacotes GM com 1ª visita ou entrega após a promessa / Total de pacotes GM entregues"},
 {id:"efi_n1", p:"efi",tag:"",name:"Novo indicador 1",w:6,u:"%",d:"max",def:"Descreva o que este indicador mede.",form:"Escreva a fórmula de cálculo."},
 {id:"efi_n2", p:"efi",tag:"",name:"Novo indicador 2",w:6,u:"%",d:"max",def:"Descreva o que este indicador mede.",form:"Escreva a fórmula de cálculo."},
 {id:"efi_n3", p:"efi",tag:"",name:"Novo indicador 3",w:6,u:"%",d:"max",def:"Descreva o que este indicador mede.",form:"Escreva a fórmula de cálculo."},
 {id:"dmgsla",p:"proc",tag:"PS",name:"SLA aprovação Damage",w:3,u:"%",d:"max",def:"Tickets “Damaged” aprovados ou cancelados em até 24 horas úteis, sem contar sábados e domingos. Considera só envios com resolução final. A aprovação aciona o reembolso ao comprador.",form:"Tickets Damaged resolvidos em até 24h úteis / Total de tickets Damaged aprovados ou cancelados no mês"},
 {id:"inv",  p:"proc",tag:"Inventário",name:"Acuracidade de inventário",w:5,u:"%",d:"max",def:"Precisão da contagem entre pacotes inventariados no SVC e pacotes que faltam inventariar, conforme o sistema. Não separa por área de estoque.",form:"Shipments inventariados / (Shipments inventariados + Shipments faltantes)"},
 {id:"audg", p:"proc",tag:"Gaiolas",name:"Auditoria gaiolas sem auto-close",w:4,u:"%",d:"max",def:"Auditorias concluídas em contêineres sem fechamento automático, para reduzir as perdas de pacotes at_station.",form:"(Auditorias concluídas em contêineres sem auto-close + eficiência da auditoria) / (Total de contêineres sem auto-close + eficiência da auditoria)"},
 {id:"fech", p:"proc",tag:"Carrinhos",name:"Fechamento automático",w:4,u:"%",d:"max",def:"Gaiolas que fecharam automaticamente (com ou sem unidades faltantes) sobre o total de gaiolas processadas. Sacas não entram na conta.",form:"(Autoclose + Autoclose with missing units) / (Autoclose + Autoclose with missing units + Close)"},
 {id:"poka", p:"proc",tag:"Poka Yoke",name:"Bipes OK",w:3,u:"%",d:"max",def:"Leituras bem-sucedidas ao adicionar pacotes aos contêineres. Bipes do QR de Problem Solver contam como OK. Tentar colocar o pacote no contêiner errado conta como erro.",form:"Bipes OK na conteinerização / Total de bipes (OK + Não OK)"},
 {id:"tmec", p:"proc",tag:"TMEC",name:"Cumprimento TMEC",w:7,u:"%",d:"max",def:"Tempo Médio de Estadia da Carga: mede a eficiência dos tempos de saída para SVC e Last Mile. Exige aderência ao YMS de pelo menos 95% (Gate In e Gate Out).",form:"Rotas com (Gate Out − Gate In) dentro do alvo / Total de rotas"},
 {id:"trr",  p:"proc",tag:"Training",name:"Aderência Reps",w:4,u:"%",d:"max",fixedMeta:80,def:"Aderência dos reps (permanentes, temporários e diaristas) ao programa de integração e ao curso estratégico do trimestre. Mês sem ingresso fica em branco.",form:"Ingressos que concluíram o onboarding / Total de ingressos no mês"},
 {id:"oe",   p:"proc",tag:"OE",name:"Conformidade Auditoria OE / mensal",w:15,u:"%",d:"max",fixedMeta:80,def:"Conformidade com os padrões da auditoria de excelência operacional (OE). Sem auditoria no mês, vale o checklist operacional mensal. Se o site foi auditado, o resultado se repete nos meses seguintes do trimestre.",form:"Soma dos checklists [peso do checklist × (conformidades / perguntas aplicáveis)]"},
 {id:"pa",   p:"proc",tag:"PDCA",name:"Planos de ação no prazo",w:5,u:"%",d:"max",def:"Progresso e fechamento das ações corretivas das auditorias OE e mensais, garantindo a solução das causas raiz e evitando recorrência.",form:"Planos de ação / PDCA concluídos no prazo / Total de planos com vencimento no período"},
];
const SHE_ITEMS=[
 {id:"she_psif",name:"PSIF · Lesão grave ou fatalidade potencial",def:"Métrica de segurança que indica o número de ocorrências, registráveis ou não, com potencial de causar lesão grave (permanente) ou fatalidade. Entram os eventos E2 e E3. O site não pode registrar nenhum PSIF.",form:"Soma de PSIF do site no mês = 0"},
 {id:"she_tri",name:"TRI · Total de incidentes registráveis",def:"Mede a frequência de acidentes com tratamento médico (MTC), trabalho restrito (RWC), perda de tempo (LTA) ou fatalidade (FAT), a cada 200.000 horas trabalhadas. Deve ficar igual ou menor que a meta do site.",form:"TRI = (LTA + RWC + MTC + FAT) × 200.000 / HHT"},
];

const MESES_PADRAO=["Setembro","Outubro","Novembro"];
const PERIODO_PADRAO="Q4 2026";
const PAPEIS={pendente:"Pendente",analista:"Analista",gestao:"Gestão",admin:"Administrador",bloqueado:"Bloqueado"};

/* ==========================================================
   Utilitários
   ========================================================== */
const $=id=>document.getElementById(id)||document.createElement("div");
const local={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function parseNum(s){
  if(s===null||s===undefined)return null;
  s=String(s).trim().replace(/\s|%|R\$/g,"");
  if(s==="")return null;
  if(s.includes(",")&&s.includes("."))s=s.replace(/\./g,"").replace(",",".");
  else s=s.replace(",",".");
  const n=Number(s);return isFinite(n)?n:null;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function rich(s){return esc(s).replace(/\*\*([\s\S]+?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>")}
function nf(v){return (+v.toFixed(2)).toLocaleString("pt-BR",{maximumFractionDigits:2})}
function fmt(v,u){ if(v===null||v===undefined||!isFinite(v))return "—";
  const d=u==="%"?(Math.abs(v)<1&&v!==0?3:2):1;
  const s=v.toLocaleString("pt-BR",{minimumFractionDigits:Math.min(d,2),maximumFractionDigits:d});
  return u==="%"?s+"%":s; }
function fmtIn(v){ return v===null||v===undefined?"":v==="NA"?"N/A":String(v).replace(".",","); }
function fmtPct(v){ return v===null||v===undefined||v===""?"":fmtIn(v)+"%"; }
function parseVal(s){ return /^\s*n\s*\/?\s*a\s*$/i.test(String(s))?"NA":parseNum(s); }
function tierOf(score){ let t=TIERS[0]; for(const x of TIERS) if(score>=x.min-1e-9) t=x; return t; }
function dataHora(iso){ if(!iso)return "—"; const d=new Date(iso); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function debounce(fn,ms){let t;return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
function armar(btn,texto,acao){ // botão de confirmação em dois cliques
  if(btn.dataset.armado){delete btn.dataset.armado;btn.textContent=btn.dataset.orig;acao();return;}
  btn.dataset.orig=btn.textContent;btn.dataset.armado="1";btn.textContent=texto;
  setTimeout(()=>{if(btn.dataset.armado){delete btn.dataset.armado;btn.textContent=btn.dataset.orig;}},3000);
}

/* ==========================================================
   Supabase
   ========================================================== */
const configurado=typeof PEL_SUPABASE_URL==="string"&&PEL_SUPABASE_URL.startsWith("https://")&&typeof PEL_SUPABASE_CHAVE_PUBLICA==="string"&&!PEL_SUPABASE_CHAVE_PUBLICA.startsWith("COLE_AQUI")&&window.supabase;
const sb=configurado?window.supabase.createClient(PEL_SUPABASE_URL,PEL_SUPABASE_CHAVE_PUBLICA,{auth:{persistSession:true,autoRefreshToken:true}}):null;
const DOMINIO=(typeof PEL_DOMINIO==="string"?PEL_DOMINIO:"@dhl.com").toLowerCase();

/* ==========================================================
   Estado
   ========================================================== */
let usuario=null;      // conta logada (auth)
let perfil=null;       // linha de pel_perfis
let CONFIG=null;       // configuração compartilhada (pel_config)
let sites=[];          // pel_sites
let siteAtual="";      // site aberto na calculadora
let state=blankState();// valores do site aberto
let podeLancar=false;  // pode preencher os meses
const podeEditarCfg=()=>perfil&&(perfil.papel==="gestao"||perfil.papel==="admin");
const ehAdmin=()=>perfil&&perfil.papel==="admin";
function blankState(){return {vals:{},psif:[],tri:[]};}
function normConfig(d){
  d=d&&typeof d==="object"?d:{};
  return {names:d.names||{},defs:d.defs||{},forms:d.forms||{},weights:d.weights||{},metas:d.metas||{},
    triMeta:d.triMeta??null,naMode:d.naMode||"ignore",periodo:d.periodo||PERIODO_PADRAO,
    meses:Array.isArray(d.meses)&&d.meses.length===3?d.meses:MESES_PADRAO.slice()};
}

function nameOf(k){return CONFIG.names[k.id]||k.name}
function defOf(k){return CONFIG.defs[k.id]!==undefined?CONFIG.defs[k.id]:k.def}
function formOf(k){return CONFIG.forms[k.id]!==undefined?CONFIG.forms[k.id]:k.form}
function wOf(k){const w=CONFIG.weights[k.id];return (w!==null&&w!==undefined)?w:k.w}
function maxOf(g){return KPIS.filter(k=>k.p===g).reduce((a,k)=>a+wOf(k),0)}
function metaOf(k){const m=CONFIG.metas[k.id];return (m!==null&&m!==undefined)?m:(k.fixedMeta!==undefined?k.fixedMeta:null)}
function naRule(){return {ignore:"ignorado no cálculo (o peso sai da conta)",zero:"conta como 0% do peso",full:"conta como 100% do peso"}[CONFIG.naMode]||""}

/* ==========================================================
   Cálculo (o mesmo para a calculadora e para a Visão geral)
   ========================================================== */
function evalKpi(k,d){
  const meta=metaOf(k);
  const vals=((d.vals||{})[k.id]||[]).slice(0,3);
  if(vals.includes("NA")) return {meta,avg:null,n:0,met:null,ok:false,na:true,need:null,pts:0,rem:0};
  const filled=vals.filter(v=>v!==null&&v!==undefined&&v!=="");
  const n=filled.length, sum=filled.reduce((a,b)=>a+b,0);
  const avg=n?sum/n:null;
  let met=null;
  if(avg!==null&&meta!==null) met=avg>=meta-1e-9;
  const ok=met===true;
  let need=null; const rem=3-n;
  if(rem>0&&n>0&&meta!==null){
    const req=(meta*3-sum)/rem;
    need=req<=0?{t:"garantido"}:req>100?{t:"impossível"}:{t:"≥ "+fmt(req,"%"),req};
  }
  return {meta,avg,n,met,ok,need,pts:ok?wOf(k):0,rem};
}
function calcular(d){
  const res={}, tot={efi:0,proc:0}, naW={efi:0,proc:0}; let comDados=0;
  for(const k of KPIS){
    const r=evalKpi(k,d);res[k.id]=r;
    if(r.na){ if(CONFIG.naMode==="full") tot[k.p]+=wOf(k); else if(CONFIG.naMode!=="zero") naW[k.p]+=wOf(k); }
    else tot[k.p]+=r.pts;
    if(r.avg!==null) comDados++;
  }
  const num=a=>(a||[]).filter(v=>v!==null&&v!==undefined&&v!=="");
  const ps=num(d.psif), tr=num(d.tri);
  const psifFail=ps.some(v=>v>0), psifOk=ps.length>0&&!psifFail;
  const triAvg=tr.length?tr.reduce((a,b)=>a+b,0)/tr.length:null;
  const triFail=triAvg!==null&&CONFIG.triMeta!=null&&triAvg>CONFIG.triMeta+1e-9;
  const triOk=triAvg!==null&&CONFIG.triMeta!=null&&!triFail;
  const sheFail=psifFail||triFail;
  const totalW=maxOf("efi")+maxOf("proc");
  const activeW=totalW-naW.efi-naW.proc;
  const score=activeW>0?+((tot.efi+tot.proc)*100/activeW).toFixed(2):0;
  const t=sheFail?TIERS[0]:tierOf(score);
  return {res,tot,naW,ps,psifFail,psifOk,triAvg,triFail,triOk,sheFail,totalW,activeW,score,t,comDados};
}

/* ==========================================================
   Calculadora: montagem da tabela
   ========================================================== */
const CHEV='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function celulaIndicador(k){
  return `<div class="k-head"><button type="button" class="k-toggle" aria-expanded="false" aria-label="Ver descrição e fórmula">${CHEV}</button><span class="k-name view" id="vname-${k.id}">${esc(nameOf(k))}</span><input class="ed ed-name" id="name-${k.id}" aria-label="Nome do indicador" value="${esc(nameOf(k))}"></div>
  <div class="k-info"><div class="k-lbl">Descrição <button type="button" class="b-btn" data-t="def-${k.id}" title="Negrito (Ctrl+B): selecione o texto e clique">N</button></div><div class="k-def view" id="vdef-${k.id}">${rich(defOf(k))}</div><textarea class="ed ed-def" id="def-${k.id}" rows="3" aria-label="Descrição do indicador">${esc(defOf(k))}</textarea>
  <div class="k-lbl">Fórmula <button type="button" class="b-btn" data-t="form-${k.id}" title="Negrito (Ctrl+B): selecione o texto e clique">N</button></div><div class="k-form view" id="vform-${k.id}">${rich(formOf(k))}</div><textarea class="ed ed-form" id="form-${k.id}" rows="2" aria-label="Fórmula do indicador">${esc(formOf(k))}</textarea></div>`;
}
function buildTable(){
  for(const g of ["efi","proc"]){
    let html="", lastTag=null;
    for(const k of KPIS.filter(x=>x.p===g)){
      const isSub=k.grp==="bpp";
      if(isSub&&lastTag!=="BPP"){
        html+=`<tr class="parent" id="row-bpp"><td class="k-cell"><div class="k-head"><button type="button" class="k-toggle" aria-expanded="false" aria-label="Ver descrição e fórmula">${CHEV}</button><span class="k-name view">BPP · Perdas Operativas SVC</span></div>
          <div class="k-info"><div class="k-lbl">Descrição</div><div class="k-def">KPI de perda monetária do Programa de Proteção ao Comprador, calculado a partir das perdas por Perda, Atraso e Dano na estação e por Embalagem danificada, dividido pelo volume transportado. Cada subitem tem a sua meta e vale 2%, somando 8%.</div>
          <div class="k-lbl">Fórmula</div><div class="k-form">Perdas BPP (Lost, Delayed e Damaged at station + Damaged) / GMV do cluster</div></div></td>
          <td class="c"><span class="pts num" id="w-bpp"></span></td><td class="c"><span class="nota">4 subitens</span></td><td></td><td></td><td></td><td></td><td class="c" id="st-bpp"></td></tr>`;
      }
      lastTag=k.tag;
      html+=`<tr class="${isSub?"sub":""}">
        <td class="k-cell">${celulaIndicador(k)}</td>
        <td class="c in"><input class="w-in" id="w-${k.id}" inputmode="decimal" readonly aria-label="Peso ${esc(k.name)}"></td>
        <td class="in c"><div class="meta-cell"><input id="meta-${k.id}" class="meta-in" inputmode="decimal" placeholder="—" readonly aria-label="Meta ${esc(k.name)}"></div></td>
        ${[0,1,2].map(i=>`<td class="in c"><input id="v-${k.id}-${i}" class="v-in" inputmode="text" placeholder="—" aria-label="${esc(k.name)} mês ${i+1}"></td>`).join("")}
        <td class="r"><span class="avg" id="avg-${k.id}">—</span><div class="avg-n" id="avgn-${k.id}"></div></td>
        <td class="c" id="st-${k.id}"></td>
      </tr>`;
    }
    $("tbody-"+g).innerHTML=html;
  }
  for(const k of SHE_ITEMS) $("cell-"+k.id).innerHTML=celulaIndicador(k);
  $("tiers").innerHTML=TIERS.map(t=>`<div class="tier" data-name="${t.name}"><img src="${MEDALS[t.name]}" alt=""><div><div class="t-n">${t.name}</div><div class="t-r">${t.range}</div></div></div>`).join("");
  const segs=[[0,70,"#c0392b"],[70,80,"#a8683f"],[80,88,"#a9acaf"],[88,93,"#d1a020"],[93,100,"#6f808b"]];
  $("ruler-track").innerHTML=segs.map(s=>`<span style="width:${s[1]-s[0]}%;background:${s[2]}"></span>`).join("");
  $("ruler-ticks").innerHTML=[0,70,80,88,93,100].map(v=>`<span class="num" style="left:${v}%">${v}</span>`).join("");
}

/* Preenche textos, metas e pesos a partir da configuração */
function fillConfig(){
  [0,1,2].forEach(i=>{document.querySelectorAll(".h-m"+(i+1)).forEach(el=>el.textContent=CONFIG.meses[i]);$("sh-m"+(i+1)).textContent=CONFIG.meses[i];});
  $("periodo-rotulo").textContent=CONFIG.periodo;
  for(const k of [...KPIS,...SHE_ITEMS]){
    $("vname-"+k.id).textContent=nameOf(k);$("name-"+k.id).value=nameOf(k);
    $("vdef-"+k.id).innerHTML=rich(defOf(k));$("def-"+k.id).value=defOf(k);
    $("vform-"+k.id).innerHTML=rich(formOf(k));$("form-"+k.id).value=formOf(k);
  }
  for(const k of KPIS){ $("meta-"+k.id).value=fmtPct(metaOf(k)); $("w-"+k.id).value=fmtPct(wOf(k)); }
  $("tri-meta").value=fmtIn(CONFIG.triMeta);
  $("na-mode").value=CONFIG.naMode;
}
/* Preenche os meses a partir do lançamento do site */
function fillValores(){
  for(const k of KPIS){
    const v=state.vals[k.id]||[];
    [0,1,2].forEach(i=>{const el=$(`v-${k.id}-${i}`);el.value=fmtIn(v[i]);el.classList.toggle("na",v[i]==="NA");el.readOnly=!podeLancar;});
  }
  [0,1,2].forEach(i=>{
    $("psif-"+i).value=fmtIn((state.psif||[])[i]);$("tri-"+i).value=fmtIn((state.tri||[])[i]);
    $("psif-"+i).readOnly=!podeLancar;$("tri-"+i).readOnly=!podeLancar;
  });
  $("aba-calc").classList.toggle("somente-leitura",!podeLancar);
  $("modo-leitura").hidden=podeLancar;
}

/* ==========================================================
   Calculadora: atualização da tela
   ========================================================== */
function render(){
  const c=calcular(state);
  for(const k of KPIS){
    const r=c.res[k.id];
    $("avg-"+k.id).textContent=fmt(r.avg,"%");
    $("avgn-"+k.id).textContent=r.n?(r.n===3?"média dos 3 meses":`média de ${r.n} ${r.n>1?"meses":"mês"}`):"";
    let st;
    if(r.na) st=`<span class="pill na-pill" title="Indicador marcado como N/A: ${naRule()}">N/A</span>`;
    else if(r.avg===null||r.meta===null) st=`<span class="pill wait">${r.avg===null?"Sem dados":"Sem meta"}</span>`;
    else if(r.met) st=`<span class="pill ok">Na meta</span>`;
    else st=`<span class="pill no">Fora</span>`;
    $("st-"+k.id).innerHTML=st;
  }
  $("sub-efi").textContent=`${nf(c.tot.efi)}% de ${nf(maxOf("efi")-c.naW.efi)}%`;
  $("sub-proc").textContent=`${nf(c.tot.proc)}% de ${nf(maxOf("proc")-c.naW.proc)}%`;
  {const subs=KPIS.filter(k=>k.grp==="bpp");const wsum=subs.reduce((a,k)=>a+wOf(k),0);const ok=subs.filter(k=>c.res[k.id].ok).length;const any=subs.some(k=>c.res[k.id].avg!==null);
   $("w-bpp").textContent=nf(wsum)+"%";$("st-bpp").innerHTML=any?`<span class="pill ${ok===subs.length?"ok":ok?"warn":"no"}">${ok} de ${subs.length} na meta</span>`:`<span class="pill wait">Sem dados</span>`;}
  for(const g of ["efi","proc"]){const fora=KPIS.filter(k=>k.p===g&&c.res[k.id].avg!==null&&!c.res[k.id].ok).length;const com=KPIS.some(k=>k.p===g&&c.res[k.id].avg!==null);const el=$("fora-"+g);el.textContent=!com?"Sem dados":fora?`${fora} fora da meta`:"Tudo na meta";el.className="pill "+(!com?"wait":fora?"no":"ok");}

  $("psif-st").innerHTML=c.ps.length?(c.psifFail?`<span class="pill no">${c.ps.reduce((a,b)=>a+b,0)} PSIF</span>`:`<span class="pill ok">Zero</span>`):`<span class="pill wait">Sem dados</span>`;
  $("tri-st").innerHTML=c.triAvg===null?`<span class="pill wait">Sem dados</span>`:CONFIG.triMeta==null?`<span class="pill wait">Sem meta</span>`:c.triFail?`<span class="pill no">${fmt(c.triAvg,"")}</span>`:`<span class="pill ok">${fmt(c.triAvg,"")}</span>`;
  const wWarn=$("w-warn");wWarn.hidden=false;
  wWarn.innerHTML=Math.abs(c.totalW-100)<1e-6?`<span class="pill ok">Soma dos pesos: 100%</span>`:`<span class="pill no">Soma dos pesos: ${nf(c.totalW)}%</span> Ajuste para fechar 100%.`;
  const t=c.t, zeroed=c.sheFail, score=c.score;
  $("seguranca").classList.toggle("fail",zeroed);
  $("she-note").innerHTML=zeroed?`<span class="pill no">Não cumprido · site em Não classifica</span>`:(c.psifOk&&c.triOk)?`<span class="pill ok">Cumprido</span>`:`<span class="pill wait">Pendente</span>`;
  $("medal-big").src=MEDALS[t.name];$("medal-big").alt="Medalha "+t.name;
  const lab=$("ruler-label");
  lab.textContent=score.toLocaleString("pt-BR",{maximumFractionDigits:2})+"% · "+t.name;lab.classList.toggle("blocked",zeroed);
  lab.style.transform=score<12?"translateX(-8px)":score>88?"translateX(calc(-100% + 8px))":"translateX(-50%)";
  $("ruler-marker").style.left=Math.max(0,Math.min(100,score))+"%";
  document.querySelectorAll(".tier").forEach(el=>el.classList.toggle("on",el.dataset.name===t.name));

  const idx=TIERS.indexOf(t); let html="";
  if(zeroed) html=`<b>SHE não cumprido: o site cai automaticamente em Não classifica.</b> Os outros indicadores somam ${nf(score)}%, o que daria ${tierOf(score).name} se o SHE estivesse em dia.`;
  else if(idx===TIERS.length-1) html=`<b>Faixa máxima.</b> Sobram ${nf(score-93)}% acima do corte de Platina (93%).`;
  else{
    const nt=TIERS[idx+1], gap=nt.min-score;
    const cand=KPIS.filter(k=>!c.res[k.id].ok&&c.res[k.id].need&&c.res[k.id].need.t!=="impossível"&&c.res[k.id].avg!==null).sort((a,b)=>wOf(b)-wOf(a));
    const recuperavel=cand.reduce((a,k)=>a+wOf(k),0);
    html=`<b>Faltam ${nf(gap)}% para ${nt.name} (${nt.min}%).</b> `;
    if(cand.length){
      html+=recuperavel>=gap?`Dá para chegar recuperando:`:`Os indicadores ainda recuperáveis somam ${nf(recuperavel)}%, o que não basta para ${nt.name}:`;
      html+=`<ul>`+cand.slice(0,5).map(k=>`<li>${k.tag==="BPP"?"BPP · ":""}${esc(nameOf(k))} (+${nf(wOf(k))}%): ${c.res[k.id].need.t} ${c.res[k.id].rem>1?"nos próximos "+c.res[k.id].rem+" meses":"no próximo mês"}</li>`).join("")+`</ul>`;
    } else if(c.comDados) html+=`Não há indicadores recuperáveis neste trimestre com os meses que faltam.`;
    else html+=`Lance os resultados do mês para ver o que falta.`;
  }
  $("next").innerHTML=html;
}

/* ==========================================================
   Gravação no Supabase
   ========================================================== */
function msgSalvo(el,txt,erro){el.textContent=txt;el.classList.toggle("erro",!!erro);}
const gravarLancamento=debounce(async()=>{
  if(!podeLancar||!siteAtual)return;
  msgSalvo($("salvo"),"Salvando…");
  const {error}=await sb.from("pel_lancamentos").upsert({site:siteAtual,periodo:CONFIG.periodo,dados:state,atualizado_por:usuario.id,atualizado_em:new Date().toISOString()});
  if(error) msgSalvo($("salvo"),"Não foi possível salvar. Confira a internet e digite de novo.",true);
  else msgSalvo($("salvo"),"Salvo às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
},700);
async function gravarConfigAgora(elMsg){
  if(!podeEditarCfg())return false;
  if(elMsg)msgSalvo(elMsg,"Salvando…");
  const {error}=await sb.from("pel_config").update({dados:CONFIG,atualizado_por:usuario.id,atualizado_em:new Date().toISOString()}).eq("id",1);
  if(elMsg){ if(error) msgSalvo(elMsg,"Não foi possível salvar a configuração. Tente de novo.",true); else msgSalvo(elMsg,"Configuração salva às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})); }
  return !error;
}
const gravarConfig=debounce(()=>gravarConfigAgora($("salvo")),800);

/* ==========================================================
   Carregamento de dados
   ========================================================== */
async function carregarConfig(){
  const {data,error}=await sb.from("pel_config").select("dados").eq("id",1).maybeSingle();
  if(error) throw error;
  CONFIG=normConfig(data&&data.dados);
}
async function carregarSites(){
  const {data,error}=await sb.from("pel_sites").select("*").order("codigo");
  if(error) throw error;
  sites=data||[];
}
async function abrirSite(codigo){
  siteAtual=codigo||"";
  podeLancar=!!siteAtual&&(ehAdmin()||(perfil.papel==="analista"&&perfil.site===siteAtual));
  state=blankState();
  msgSalvo($("salvo"),"");
  if(siteAtual){
    const {data,error}=await sb.from("pel_lancamentos").select("dados,atualizado_em").eq("site",siteAtual).eq("periodo",CONFIG.periodo).maybeSingle();
    if(error) msgSalvo($("salvo"),"Não foi possível carregar os dados do site.",true);
    else if(data){ state=Object.assign(blankState(),data.dados||{}); msgSalvo($("salvo"),"Última atualização: "+dataHora(data.atualizado_em)); }
  }
  const s=sites.find(x=>x.codigo===siteAtual);
  $("site-fixo").textContent=siteAtual?(siteAtual+(s&&s.nome?" · "+s.nome:"")):"Sem site definido";
  $("site-escolha").value=siteAtual;
  fillValores();render();
}

/* ==========================================================
   Abas e papéis
   ========================================================== */
function mostrarAba(nome){
  document.querySelectorAll("#menu button").forEach(b=>{if(b.dataset.aba===nome)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  document.querySelectorAll("#tela-app .aba").forEach(s=>s.hidden=s.id!=="aba-"+nome);
  if(nome==="visao")carregarVisao();
  if(nome==="usuarios")carregarUsuarios();
  if(nome==="sites")carregarAbaSites();
  if(usuario)local.set("pel:aba:"+usuario.id,nome);
}
function prepararApp(){
  const p=perfil.papel;
  document.querySelectorAll("#menu button").forEach(b=>{b.hidden=!!b.dataset.papel&&!b.dataset.papel.split(" ").includes(p);});
  $("menu").hidden=p==="analista";
  $("btn-edit").hidden=!podeEditarCfg();
  $("usuario-email").textContent=perfil.nome||perfil.email;
  $("usuario-papel").textContent=PAPEIS[p];$("usuario-papel").className="papel "+p;
  const escolhe=p==="gestao"||p==="admin";
  $("site-escolha").hidden=!escolhe;$("site-fixo").hidden=escolhe;
  $("site-escolha").innerHTML=`<option value="">Escolha um site</option>`+sites.map(s=>`<option value="${esc(s.codigo)}">${esc(s.codigo)}${s.nome?" · "+esc(s.nome):""}</option>`).join("");
  fillConfig();
}

/* ---------- Visão geral ---------- */
let visaoLanc=[];
async function carregarVisao(){
  $("visao-periodo").textContent="Trimestre: "+CONFIG.periodo;
  $("visao-tbody").innerHTML=`<tr><td colspan="9" class="vazio">Carregando…</td></tr>`;
  await carregarSites().catch(()=>{});
  const {data,error}=await sb.from("pel_lancamentos").select("site,dados,atualizado_em").eq("periodo",CONFIG.periodo);
  if(error){$("visao-tbody").innerHTML=`<tr><td colspan="9" class="vazio">Não foi possível carregar os sites. Recarregue a página.</td></tr>`;return;}
  visaoLanc=data||[];
  const linhas=sites.map(s=>{const l=visaoLanc.find(x=>x.site===s.codigo);const c=l?calcular(Object.assign(blankState(),l.dados||{})):null;return {s,l,c};});
  const cont={};TIERS.forEach(t=>cont[t.name]=0);
  linhas.forEach(x=>{if(x.c&&x.c.comDados)cont[x.c.t.name]++;});
  $("visao-contagem").innerHTML=TIERS.map(t=>`<div class="cont"><img src="${MEDALS[t.name]}" alt=""><div><div class="n">${cont[t.name]}</div><div class="r">${t.name}<br>${t.range}</div></div></div>`).join("");
  linhas.sort((a,b)=>(b.c&&b.c.comDados?b.c.score:-1)-(a.c&&a.c.comDados?a.c.score:-1));
  $("visao-tbody").innerHTML=linhas.length?linhas.map(({s,l,c})=>{
    const tem=c&&c.comDados;
    const she=!c?`<span class="pill wait">—</span>`:c.sheFail?`<span class="pill no">Não cumprido</span>`:(c.psifOk&&c.triOk)?`<span class="pill ok">Cumprido</span>`:`<span class="pill wait">Pendente</span>`;
    return `<tr data-site="${esc(s.codigo)}"><td>${esc(s.regional||"—")}</td><td><b>${esc(s.codigo)}</b>${s.nome?" · "+esc(s.nome):""}</td><td>${esc(CONFIG.periodo)}</td>
      <td class="c">${she}</td><td class="c num">${tem?nf(c.tot.efi)+"%":"—"}</td><td class="c num">${tem?nf(c.tot.proc)+"%":"—"}</td>
      <td class="c num"><b>${tem?nf(c.score)+"%":"—"}</b></td><td>${tem?`<img class="med" src="${MEDALS[c.t.name]}" alt="">${c.t.name}`:`<span class="nota">Sem lançamentos</span>`}</td>
      <td>${l?dataHora(l.atualizado_em):"—"}</td></tr>`;
  }).join(""):`<tr><td colspan="9" class="vazio">Nenhum site cadastrado ainda.${ehAdmin()?" Cadastre na aba Sites.":""}</td></tr>`;
}

/* ---------- Usuários ---------- */
let perfis=[], filtroPapel="";
async function carregarUsuarios(){
  $("usuarios-tbody").innerHTML=`<tr><td colspan="5" class="vazio">Carregando…</td></tr>`;
  await carregarSites().catch(()=>{});
  const {data,error}=await sb.from("pel_perfis").select("*").order("criado_em",{ascending:false});
  if(error){$("usuarios-tbody").innerHTML=`<tr><td colspan="5" class="vazio">Não foi possível carregar os usuários.</td></tr>`;return;}
  perfis=data||[];desenharUsuarios();
}
function desenharUsuarios(){
  const lista=perfis.filter(p=>!filtroPapel||p.papel===filtroPapel);
  $("usuarios-tbody").innerHTML=lista.length?lista.map(p=>{
    const eu=p.user_id===usuario.id;
    return `<tr class="${p.papel==="pendente"?"pendente":""}" data-id="${p.user_id}"><td><b>${esc(p.nome||"—")}</b>${eu?' <span class="nota">(você)</span>':""}</td><td>${esc(p.email)}</td><td>${dataHora(p.criado_em)}</td>
      <td><select class="u-papel" aria-label="Papel de ${esc(p.email)}" ${eu?"disabled":""}>${Object.keys(PAPEIS).map(k=>`<option value="${k}" ${k===p.papel?"selected":""}>${PAPEIS[k]}</option>`).join("")}</select></td>
      <td><select class="u-site" aria-label="Site de ${esc(p.email)}"><option value="">—</option>${sites.map(s=>`<option value="${esc(s.codigo)}" ${s.codigo===p.site?"selected":""}>${esc(s.codigo)}${s.nome?" · "+esc(s.nome):""}</option>`).join("")}</select></td></tr>`;
  }).join(""):`<tr><td colspan="5" class="vazio">Nenhuma conta ${filtroPapel?"com este papel":"ainda"}.</td></tr>`;
}
async function alterarUsuario(id,campo,valor){
  const p=perfis.find(x=>x.user_id===id);if(!p)return;
  if(campo==="papel"&&valor==="analista"&&!p.site){msgSalvo($("usuarios-msg"),"Escolha também o site do analista.",true);}
  msgSalvo($("usuarios-msg"),"Salvando…");
  const {error}=await sb.from("pel_perfis").update({[campo]:valor}).eq("user_id",id);
  if(error){msgSalvo($("usuarios-msg"),"Não foi possível salvar. "+(error.message||""),true);desenharUsuarios();return;}
  p[campo]=valor;
  msgSalvo($("usuarios-msg"),`${p.nome||p.email}: ${campo==="papel"?"papel "+PAPEIS[valor]:"site "+(valor||"nenhum")} salvo.`);
  if(campo==="papel")desenharUsuarios();
}

/* ---------- Sites e trimestre ---------- */
async function carregarAbaSites(){
  $("periodo-nome").value=CONFIG.periodo;["m1","m2","m3"].forEach((m,i)=>$("periodo-"+m).value=CONFIG.meses[i]);
  await carregarSites().catch(()=>{});
  const {data}=await sb.from("pel_perfis").select("site,papel");
  const nAna={};(data||[]).forEach(p=>{if(p.papel==="analista"&&p.site)nAna[p.site]=(nAna[p.site]||0)+1;});
  $("sites-tbody").innerHTML=sites.length?sites.map(s=>`<tr><td><b>${esc(s.codigo)}</b></td><td>${esc(s.nome||"—")}</td><td>${esc(s.regional||"—")}</td><td class="num">${nAna[s.codigo]||0}</td>
    <td class="r"><button type="button" class="btn-ghost s-excluir" data-site="${esc(s.codigo)}">Excluir</button></td></tr>`).join(""):`<tr><td colspan="5" class="vazio">Nenhum site cadastrado.</td></tr>`;
  prepararApp();
}

/* ==========================================================
   Eventos da calculadora
   ========================================================== */
function ligarCalculadora(){
  const main=document.querySelector("main");
  main.addEventListener("input",e=>{
    const id=e.target.id;let m;
    if((m=id.match(/^w-(.+)$/))){
      const k=KPIS.find(x=>x.id===m[1]);if(!k||!podeEditarCfg())return;
      const v=parseNum(e.target.value);
      if(v===null||v===k.w)delete CONFIG.weights[k.id]; else CONFIG.weights[k.id]=Math.max(0,v);
      gravarConfig();render();return;
    }
    if((m=id.match(/^(name|def|form)-(.+)$/))){
      const k=KPIS.find(x=>x.id===m[2])||SHE_ITEMS.find(x=>x.id===m[2]);if(!k||!podeEditarCfg())return;
      const v=e.target.value;
      if(m[1]==="name"){ if(v.trim()===""||v===k.name)delete CONFIG.names[k.id]; else CONFIG.names[k.id]=v; $("vname-"+k.id).textContent=nameOf(k); }
      else if(m[1]==="def"){ if(v===k.def)delete CONFIG.defs[k.id]; else CONFIG.defs[k.id]=v; $("vdef-"+k.id).innerHTML=rich(defOf(k)); }
      else { if(v===k.form)delete CONFIG.forms[k.id]; else CONFIG.forms[k.id]=v; $("vform-"+k.id).innerHTML=rich(formOf(k)); }
      gravarConfig();render();return;
    }
    if((m=id.match(/^meta-(.+)$/))){ if(!podeEditarCfg())return; const v=parseNum(e.target.value); if(v===null)delete CONFIG.metas[m[1]]; else CONFIG.metas[m[1]]=v; gravarConfig();render();return; }
    if(id==="tri-meta"){ if(!podeEditarCfg())return; CONFIG.triMeta=parseNum(e.target.value); gravarConfig();render();return; }
    if(!podeLancar)return;
    if((m=id.match(/^v-(.+)-(\d)$/))){
      const v=parseVal(e.target.value);(state.vals[m[1]]=state.vals[m[1]]||[])[+m[2]]=v;
      if(v==="NA"){e.target.value="N/A";e.target.classList.add("na");}else e.target.classList.remove("na");
    }
    else if((m=id.match(/^(psif|tri)-(\d)$/))){(state[m[1]]=state[m[1]]||[])[+m[2]]=parseNum(e.target.value);}
    else return;
    gravarLancamento();render();
  });
  main.addEventListener("change",e=>{
    if(e.target.id==="na-mode"&&podeEditarCfg()){CONFIG.naMode=e.target.value;gravarConfig();render();}
    else if(e.target.id==="site-escolha"){abrirSite(e.target.value);local.set("pel:site:"+usuario.id,e.target.value);}
  });
  main.addEventListener("focusout",e=>{
    const el=e.target; if(!el.matches||!el.matches(".meta-in, .w-in"))return;
    const v=parseNum(el.value); el.value=v===null?"":fmtPct(v);
  });
  function boldWrap(ta){
    const a=ta.selectionStart,b=ta.selectionEnd,v=ta.value;
    if(a===b){ta.focus();return;}
    let sel=v.slice(a,b),pre=v.slice(0,a),post=v.slice(b);
    if(pre.endsWith("**")&&post.startsWith("**")){pre=pre.slice(0,-2);post=post.slice(2);ta.value=pre+sel+post;ta.setSelectionRange(pre.length,pre.length+sel.length);}
    else if(sel.startsWith("**")&&sel.endsWith("**")&&sel.length>4){sel=sel.slice(2,-2);ta.value=pre+sel+post;ta.setSelectionRange(pre.length,pre.length+sel.length);}
    else {ta.value=pre+"**"+sel+"**"+post;ta.setSelectionRange(pre.length+2,pre.length+2+sel.length);}
    ta.focus();ta.dispatchEvent(new Event("input",{bubbles:true}));
  }
  main.addEventListener("mousedown",e=>{if(e.target.closest(".b-btn"))e.preventDefault();});
  main.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="b"&&e.target.matches("textarea.ed")){e.preventDefault();boldWrap(e.target);}});
  function setOpen(tr,on){tr.classList.toggle("aberto",on);const b=tr.querySelector(".k-toggle");if(b)b.setAttribute("aria-expanded",on);}
  main.addEventListener("click",e=>{
    const b=e.target.closest(".b-btn");if(b){const ta=$(b.dataset.t);if(ta.tagName==="TEXTAREA")boldWrap(ta);return;}
    const t=e.target.closest(".k-toggle, .k-name.view");
    if(t){const tr=t.closest("tr, .she-row");if(tr)setOpen(tr,!tr.classList.contains("aberto"));}
  });
  $("btn-edit").addEventListener("click",()=>{
    if(!podeEditarCfg())return;
    const on=!document.body.classList.contains("editing");
    document.querySelectorAll(".meta-in, .w-in, .lock-in").forEach(el=>{el.readOnly=!on;});
    $("na-mode").disabled=!on;
    document.body.classList.toggle("editing",on);
    $("btn-edit").textContent=on?"Concluir edição":"Editar indicadores";
    $("btn-reset-txt").hidden=!on;
    $("table-note").textContent=on?"Os campos amarelos podem ser editados e valem para todos os sites. Para destacar em negrito, selecione o texto e clique em N (ou Ctrl+B).":"Regra: média do trimestre igual ou maior que a meta soma 100% do peso. Abaixo da meta, soma 0%. Digite N/A no mês para marcar o indicador como não aplicável.";
    if(!on)gravarConfigAgora($("salvo"));
  });
  $("btn-expand").addEventListener("click",e=>{
    const rows=[...document.querySelectorAll("#aba-calc tbody tr, #aba-calc .she-row")].filter(r=>r.querySelector(".k-toggle"));
    const open=!rows.every(r=>r.classList.contains("aberto"));
    rows.forEach(r=>setOpen(r,open));e.target.textContent=open?"Recolher todos":"Expandir todos";
  });
  $("btn-reset-txt").addEventListener("click",e=>armar(e.target,"Clique de novo para restaurar",()=>{
    CONFIG.names={};CONFIG.defs={};CONFIG.forms={};CONFIG.weights={};
    fillConfig();render();gravarConfigAgora($("salvo"));
  }));
  document.querySelectorAll("details.bloco").forEach(d=>{
    const k="pel:open:"+d.id; if(local.get(k)===false) d.open=false;
    d.addEventListener("toggle",()=>local.set(k,d.open));
  });
}

/* ==========================================================
   Eventos das abas de Gestão e Administrador
   ========================================================== */
function ligarAdmin(){
  $("menu").addEventListener("click",e=>{const b=e.target.closest("button[data-aba]");if(b)mostrarAba(b.dataset.aba);});
  $("visao-tbody").addEventListener("click",e=>{const tr=e.target.closest("tr[data-site]");if(!tr)return;mostrarAba("calc");abrirSite(tr.dataset.site);});
  $("filtro-papel").addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;filtroPapel=b.dataset.f;document.querySelectorAll("#filtro-papel .chip").forEach(c=>c.setAttribute("aria-pressed",c===b));desenharUsuarios();});
  $("usuarios-tbody").addEventListener("change",e=>{
    const tr=e.target.closest("tr[data-id]");if(!tr)return;
    if(e.target.classList.contains("u-papel"))alterarUsuario(tr.dataset.id,"papel",e.target.value);
    if(e.target.classList.contains("u-site"))alterarUsuario(tr.dataset.id,"site",e.target.value);
  });
  $("form-site").addEventListener("submit",async e=>{
    e.preventDefault();
    const codigo=$("site-codigo").value.trim().toUpperCase();
    if(!codigo){msgSalvo($("sites-msg"),"Digite o código do site.",true);return;}
    const {error}=await sb.from("pel_sites").insert({codigo,nome:$("site-nome").value.trim(),regional:$("site-regional").value.trim()});
    if(error){msgSalvo($("sites-msg"),error.code==="23505"?"Já existe um site com este código.":"Não foi possível adicionar o site.",true);return;}
    $("form-site").reset();msgSalvo($("sites-msg"),`Site ${codigo} adicionado.`);carregarAbaSites();
  });
  $("sites-tbody").addEventListener("click",e=>{
    const b=e.target.closest(".s-excluir");if(!b)return;
    armar(b,"Confirmar exclusão",async()=>{
      const {error}=await sb.from("pel_sites").delete().eq("codigo",b.dataset.site);
      if(error){msgSalvo($("sites-msg"),"Não foi possível excluir o site.",true);return;}
      msgSalvo($("sites-msg"),`Site ${b.dataset.site} excluído, junto com os lançamentos dele.`);carregarAbaSites();
    });
  });
  $("form-periodo").addEventListener("submit",async e=>{
    e.preventDefault();
    const nome=$("periodo-nome").value.trim(), meses=["m1","m2","m3"].map(m=>$("periodo-"+m).value.trim());
    if(!nome||meses.some(m=>!m)){msgSalvo($("periodo-msg"),"Preencha o nome do trimestre e os três meses.",true);return;}
    CONFIG.periodo=nome;CONFIG.meses=meses;
    if(await gravarConfigAgora($("periodo-msg"))){fillConfig();if(siteAtual)abrirSite(siteAtual);}
  });
}

/* ==========================================================
   Login, cadastro e senha
   ========================================================== */
const telas=["tela-aguarde","tela-login","tela-status","tela-app"];
function mostrarTela(id){telas.forEach(t=>$(t).hidden=t!==id);$("area-usuario").hidden=!(id==="tela-app"||id==="tela-status");if(id!=="tela-app")$("menu").hidden=true;}
function formLogin(nome){["entrar","criar","esqueci","nova-senha"].forEach(f=>$("form-"+f).hidden=f!==nome);aviso("");mostrarTela("tela-login");}
function aviso(txt,tipo){const m=$("login-mensagem");m.hidden=!txt;m.textContent=txt;m.className="mensagem "+(tipo==="info"?"mensagem-ok":"mensagem-erro");}
function traduzirErro(erro){
  const msg=(erro&&erro.message||"").toLowerCase();
  if(msg.includes("invalid login credentials"))return "E-mail ou senha incorretos.";
  if(msg.includes("email not confirmed"))return "Seu e-mail ainda não foi confirmado. Abra o link que enviamos para a sua caixa de entrada.";
  if(msg.includes("already registered")||msg.includes("already been registered"))return "Já existe uma conta com este e-mail. Use Entrar ou Esqueci minha senha.";
  if(msg.includes("password should be")||msg.includes("weak"))return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  if(msg.includes("signups not allowed")||msg.includes("signup is disabled"))return "O cadastro de novas contas está desligado no Supabase. Fale com o administrador.";
  if(msg.includes("too many")||msg.includes("rate limit"))return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if(msg.includes("failed to fetch")||msg.includes("network"))return "Não foi possível conectar. Confira a internet e tente de novo.";
  return "Não foi possível concluir. Tente de novo.";
}
function emailValido(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function ehDhl(e){return e.toLowerCase().endsWith(DOMINIO);}
async function ocupado(btn,fn){btn.disabled=true;try{await fn();}finally{btn.disabled=false;}}

function status(titulo,texto){$("status-titulo").textContent=titulo;$("status-texto").textContent=texto;mostrarTela("tela-status");}

async function entrarNoApp(session){
  usuario=session.user;
  $("usuario-email").textContent=usuario.email;$("usuario-papel").textContent="";$("usuario-papel").className="papel";
  const {data,error}=await sb.from("pel_perfis").select("*").eq("user_id",usuario.id).maybeSingle();
  if(error){status("Não foi possível carregar sua conta","Confira a internet e clique em Verificar de novo.");return;}
  perfil=data;
  if(!perfil){status("Conta sem acesso à Calculadora",`A Calculadora PEL aceita só contas com e-mail ${DOMINIO}. Saia e crie uma conta com o seu e-mail DHL.`);return;}
  $("usuario-email").textContent=perfil.nome||perfil.email;$("usuario-papel").textContent=PAPEIS[perfil.papel];$("usuario-papel").className="papel "+perfil.papel;
  if(perfil.papel==="pendente"){status("Conta aguardando liberação","Sua conta foi criada. O administrador precisa definir se você é Analista ou Gestão, e qual é o seu site. Assim que ele liberar, clique em Verificar de novo.");return;}
  if(perfil.papel==="bloqueado"){status("Conta sem acesso","Sua conta está bloqueada na Calculadora PEL. Fale com o administrador.");return;}
  if(perfil.papel==="analista"&&!perfil.site){status("Falta definir o seu site","Sua conta é de Analista, mas o administrador ainda não escolheu o seu site. Assim que ele escolher, clique em Verificar de novo.");return;}
  try{await carregarConfig();await carregarSites();}
  catch(e){status("Não foi possível carregar a Calculadora","Confira a internet e clique em Verificar de novo.");return;}
  prepararApp();
  mostrarTela("tela-app");
  if(perfil.papel==="analista"){mostrarAba("calc");await abrirSite(perfil.site);}
  else{
    const ult=local.get("pel:aba:"+usuario.id), salvo=local.get("pel:site:"+usuario.id);
    const permitidas=ehAdmin()?["calc","visao","usuarios","sites"]:["calc","visao"];
    await abrirSite(sites.some(s=>s.codigo===salvo)?salvo:"");
    mostrarAba(permitidas.includes(ult)?ult:"visao");
  }
}

function ligarLogin(){
  document.querySelectorAll("[data-ir]").forEach(b=>b.addEventListener("click",()=>formLogin(b.dataset.ir)));
  $("form-entrar").addEventListener("submit",e=>{e.preventDefault();ocupado($("botao-entrar"),async()=>{
    const email=$("entrar-email").value.trim().toLowerCase(),senha=$("entrar-senha").value;
    if(!emailValido(email)||!senha){aviso("Digite o e-mail e a senha.");return;}
    const {data,error}=await sb.auth.signInWithPassword({email,password:senha});
    if(error){aviso(traduzirErro(error));return;}
    aviso("");await entrarNoApp(data.session);
  });});
  $("form-criar").addEventListener("submit",e=>{e.preventDefault();ocupado($("botao-criar"),async()=>{
    const nome=$("criar-nome").value.trim(),email=$("criar-email").value.trim().toLowerCase(),s1=$("criar-senha").value,s2=$("criar-senha2").value;
    if(!nome){aviso("Digite o seu nome.");return;}
    if(!emailValido(email)){aviso("Digite um e-mail válido.");return;}
    if(!ehDhl(email)){aviso(`Use o seu e-mail DHL (terminado em ${DOMINIO}).`);return;}
    if(s1.length<8){aviso("A senha precisa ter pelo menos 8 caracteres.");return;}
    if(s1!==s2){aviso("As duas senhas não são iguais.");return;}
    const {data,error}=await sb.auth.signUp({email,password:s1,options:{data:{nome},emailRedirectTo:location.href.split("#")[0]}});
    if(error){aviso(traduzirErro(error));return;}
    if(data.session){await entrarNoApp(data.session);return;}
    $("form-criar").reset();formLogin("entrar");$("entrar-email").value=email;
    aviso(`Conta criada. Enviamos um e-mail de confirmação para ${email}. Abra o link e depois entre com a sua senha. Se não achar, olhe a caixa de spam.`,"info");
  });});
  $("form-esqueci").addEventListener("submit",e=>{e.preventDefault();ocupado($("botao-esqueci"),async()=>{
    const email=$("esqueci-email").value.trim().toLowerCase();
    if(!emailValido(email)){aviso("Digite um e-mail válido.");return;}
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.href.split("#")[0]});
    if(error){aviso(traduzirErro(error));return;}
    aviso(`Se existir uma conta com ${email}, você vai receber um link para criar uma nova senha.`,"info");
  });});
  $("form-nova-senha").addEventListener("submit",e=>{e.preventDefault();ocupado($("botao-nova-senha"),async()=>{
    const s1=$("nova-senha").value,s2=$("nova-senha2").value;
    if(s1.length<8){aviso("A senha precisa ter pelo menos 8 caracteres.");return;}
    if(s1!==s2){aviso("As duas senhas não são iguais.");return;}
    const {error}=await sb.auth.updateUser({password:s1});
    if(error){aviso(traduzirErro(error));return;}
    recuperando=false;history.replaceState(null,"",location.pathname+location.search);
    const {data}=await sb.auth.getSession();
    if(data.session)await entrarNoApp(data.session);else{formLogin("entrar");aviso("Senha alterada. Entre com a nova senha.","info");}
  });});
  $("botao-sair").addEventListener("click",async()=>{
    await sb.auth.signOut();usuario=null;perfil=null;document.body.classList.remove("editing");
    formLogin("entrar");
  });
  $("botao-status-recarregar").addEventListener("click",async()=>{
    const {data}=await sb.auth.getSession();if(data.session)entrarNoApp(data.session);else formLogin("entrar");
  });
}

/* ==========================================================
   Início
   ========================================================== */
let recuperando=/type=recovery/.test(location.hash);
async function iniciar(){
  if(!sb){$("tela-aguarde").textContent="A Calculadora ainda não está ligada ao Supabase. Cole a Project URL e a chave pública no arquivo pel/config.js (passo a passo no LEIAME.md).";return;}
  CONFIG=normConfig({});
  buildTable();fillConfig();
  ligarLogin();ligarCalculadora();ligarAdmin();
  sb.auth.onAuthStateChange((evento)=>{
    if(evento==="PASSWORD_RECOVERY"){recuperando=true;formLogin("nova-senha");}
  });
  if(recuperando){formLogin("nova-senha");return;}
  const {data}=await sb.auth.getSession();
  if(recuperando)return;
  if(data.session)await entrarNoApp(data.session);
  else formLogin("entrar");
}
iniciar();

})();
