/* ==========================================================
   js/pel.js · Aba Calculadora PEL
   Papéis (tabela pel_perfis): Analista (preenche o próprio site),
   Gestão (vê todos os sites, só leitura) e Administrador (edita
   indicadores e metas, aprova contas e vê as outras abas do app).
   O site (Site, Cidade e Regional) é informado pela pessoa no cadastro. O login e o cadastro ficam em js/supabase.js,
   que avisa esta aba pelo evento "gq:perfil".
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
const MEDALS={"Não classifica":"img/pel/medalha-nc.webp","Bronze":"img/pel/medalha-bronze.webp","Prata":"img/pel/medalha-prata.webp","Ouro":"img/pel/medalha-ouro.webp","Platina":"img/pel/medalha-platina.webp"};

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
 {id:"she_psif",kind:"psif",fixedMeta:0,name:"PSIF · Lesão grave ou fatalidade potencial",def:"Métrica de segurança que indica o número de ocorrências, registráveis ou não, com potencial de causar lesão grave (permanente) ou fatalidade. Entram os eventos E2 e E3. O site não pode registrar nenhum PSIF.",form:"Soma de PSIF do site no mês = 0"},
 {id:"she_tri",kind:"max",name:"TRI · Total de incidentes registráveis",def:"Mede a frequência de acidentes com tratamento médico (MTC), trabalho restrito (RWC), perda de tempo (LTA) ou fatalidade (FAT), a cada 200.000 horas trabalhadas. Deve ficar igual ou menor que a meta do site.",form:"TRI = (LTA + RWC + MTC + FAT) × 200.000 / HHT"},
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
   Estado
   ========================================================== */
let usuario=null;      // conta logada (auth), recebida de js/supabase.js
let perfil=null;       // linha de pel_perfis
let CONFIG=null;       // configuração compartilhada (pel_config)
let sites=[];          // pel_sites
let siteAtual="";      // site aberto na calculadora
let state=blankState();// valores do site aberto
let podeLancar=false;  // pode preencher os meses
const podeEditarCfg=()=>perfil&&perfil.papel==="admin"; // só o Administrador edita indicadores
const ehAdmin=()=>perfil&&perfil.papel==="admin";
function blankState(){return {vals:{},psif:[],tri:[],she:{}};}
function normConfig(d){
  d=d&&typeof d==="object"?d:{};
  const c={names:d.names||{},defs:d.defs||{},forms:d.forms||{},weights:d.weights||{},metas:d.metas||{},
    triMeta:d.triMeta??null,naMode:d.naMode||"ignore",periodo:d.periodo||PERIODO_PADRAO,
    meses:Array.isArray(d.meses)&&d.meses.length===3?d.meses:MESES_PADRAO.slice(),
    ordem:d.ordem&&typeof d.ordem==="object"?d.ordem:{},
    extras:Array.isArray(d.extras)?d.extras:[],        // indicadores criados pelo Administrador
    removidos:Array.isArray(d.removidos)?d.removidos:[], // indicadores excluídos (os valores ficam guardados)
    dirs:d.dirs&&typeof d.dirs==="object"?d.dirs:{}};   // sentido da meta: "min" (≤, menor é melhor) ou "max" (≥)
  // A meta do TRI ficava em "Meta TRI do site" (triMeta); agora fica na linha do TRI.
  // triMeta continua sendo gravado junto, para a versão anterior do app ainda funcionar se for preciso voltar.
  if(c.triMeta!=null&&c.metas.she_tri===undefined)c.metas.she_tri=c.triMeta;
  return c;
}

/* ---------- Indicadores ativos (padrão + criados − excluídos) ---------- */
function extraComoKpi(x){return {id:x.id,p:x.p,tag:"",name:"Novo indicador",w:0,u:"%",d:"max",def:"",form:"",extra:true};}
function extraComoShe(x){return {id:x.id,kind:"max",name:"Novo indicador",def:"",form:"",extra:true};}
function excluido(k){return CONFIG.removidos.includes(k.id)||(k.grp==="bpp"&&CONFIG.removidos.includes("bpp"));}
function todosKpis(){return [...KPIS,...CONFIG.extras.filter(x=>x.p==="efi"||x.p==="proc").map(extraComoKpi)];}
function todosShe(){return [...SHE_ITEMS,...CONFIG.extras.filter(x=>x.p==="she").map(extraComoShe)];}
function kpisAtivos(){return todosKpis().filter(k=>!excluido(k));}
function sheAtivos(){return todosShe().filter(k=>!excluido(k));}
function acharIndicador(id){return todosKpis().find(k=>k.id===id)||todosShe().find(k=>k.id===id);}
// Valores mensais de um indicador da Segurança (PSIF e TRI continuam nos campos antigos)
function sheVals(d,id){return id==="she_psif"?(d.psif||[]):id==="she_tri"?(d.tri||[]):((d.she||{})[id]||[]);}

function nameOf(k){return CONFIG.names[k.id]||k.name}
function defOf(k){return CONFIG.defs[k.id]!==undefined?CONFIG.defs[k.id]:k.def}
function formOf(k){return CONFIG.forms[k.id]!==undefined?CONFIG.forms[k.id]:k.form}
function wOf(k){const w=CONFIG.weights[k.id];return (w!==null&&w!==undefined)?w:k.w}
function maxOf(g){return kpisAtivos().filter(k=>k.p===g).reduce((a,k)=>a+wOf(k),0)}
/* Sentido da meta: BPP (perda) e Delay (atraso: Delay GM, Delay H&B e qualquer indicador com "Delay"
   no nome) são "quanto menor, melhor" (≤); os outros, "quanto maior, melhor" (≥).
   O Administrador pode trocar qualquer um clicando no símbolo, em Editar indicadores. */
function dirPadrao(k){return k.grp==="bpp"||k.id==="dgm"||/delay/i.test(nameOf(k))?"min":"max";}
function dirOf(k){return CONFIG.dirs[k.id]==="min"||CONFIG.dirs[k.id]==="max"?CONFIG.dirs[k.id]:dirPadrao(k);}
function simboloDir(k){return dirOf(k)==="min"?"≤":"≥";}
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
  const menor=dirOf(k)==="min";
  let met=null;
  if(avg!==null&&meta!==null) met=menor?avg<=meta+1e-9:avg>=meta-1e-9;
  const ok=met===true;
  let need=null; const rem=3-n;
  if(rem>0&&n>0&&meta!==null){
    const req=(meta*3-sum)/rem; // média que os meses que faltam precisam ter
    if(menor) need=req<0?{t:"impossível"}:{t:"≤ "+fmt(req,"%"),req};
    else need=req<=0?{t:"garantido"}:req>100?{t:"impossível"}:{t:"≥ "+fmt(req,"%"),req};
  }
  return {meta,avg,n,met,ok,need,pts:ok?wOf(k):0,rem};
}
function calcular(d){
  const res={}, tot={efi:0,proc:0}, naW={efi:0,proc:0}; let comDados=0;
  for(const k of kpisAtivos()){
    const r=evalKpi(k,d);res[k.id]=r;
    if(r.na){ if(CONFIG.naMode==="full") tot[k.p]+=wOf(k); else if(CONFIG.naMode!=="zero") naW[k.p]+=wOf(k); }
    else tot[k.p]+=r.pts;
    if(r.avg!==null) comDados++;
  }
  // Segurança (pré-requisito): PSIF = nenhum mês acima da meta (0); TRI e novos = média do trimestre até a meta
  const num=a=>(a||[]).filter(v=>v!==null&&v!==undefined&&v!=="");
  const she={}; let sheFail=false, sheOk=true;
  for(const k of sheAtivos()){
    const vs=num(sheVals(d,k.id)), meta=metaOf(k);
    const r={meta,n:vs.length,soma:vs.reduce((a,b)=>a+b,0),avg:vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null,fail:false,ok:false};
    if(meta!=null&&vs.length){
      r.fail=k.kind==="psif"?vs.some(v=>v>meta+1e-9):r.avg>meta+1e-9;
      r.ok=!r.fail;
    }
    she[k.id]=r; if(r.fail)sheFail=true; if(!r.ok)sheOk=false;
  }
  if(!sheAtivos().length)sheOk=false;
  const totalW=maxOf("efi")+maxOf("proc");
  const activeW=totalW-naW.efi-naW.proc;
  const score=activeW>0?+((tot.efi+tot.proc)*100/activeW).toFixed(2):0;
  const t=sheFail?TIERS[0]:tierOf(score);
  return {res,tot,naW,she,sheFail,sheOk,totalW,activeW,score,t,comDados};
}

/* ==========================================================
   Calculadora: montagem da tabela
   ========================================================== */
const CHEV='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* Controles do modo "Editar indicadores": ▲▼ (ordem dentro do bloco) e lixeira (excluir) */
function botoesOrdem(g,u){
  return `<span class="mover"><button type="button" class="mv" data-g="${g}" data-u="${u}" data-d="-1" title="Subir" aria-label="Subir">▲</button><button type="button" class="mv" data-g="${g}" data-u="${u}" data-d="1" title="Descer" aria-label="Descer">▼</button></span><button type="button" class="rm" data-u="${u}" title="Excluir indicador (clique duas vezes)" aria-label="Excluir indicador">✕</button>`;
}
function celulaIndicador(k,g){
  return `<div class="k-head">${g?botoesOrdem(g,k.id):""}<button type="button" class="k-toggle" aria-expanded="false" aria-label="Ver descrição e fórmula">${CHEV}</button><span class="k-name view" id="vname-${k.id}">${esc(nameOf(k))}</span><input class="ed ed-name" id="name-${k.id}" aria-label="Nome do indicador" value="${esc(nameOf(k))}"></div>
  <div class="k-info"><div class="k-lbl">Descrição <button type="button" class="b-btn" data-t="def-${k.id}" title="Negrito (Ctrl+B): selecione o texto e clique">N</button></div><div class="k-def view" id="vdef-${k.id}">${rich(defOf(k))}</div><textarea class="ed ed-def" id="def-${k.id}" rows="3" aria-label="Descrição do indicador">${esc(defOf(k))}</textarea>
  <div class="k-lbl">Fórmula <button type="button" class="b-btn" data-t="form-${k.id}" title="Negrito (Ctrl+B): selecione o texto e clique">N</button></div><div class="k-form view" id="vform-${k.id}">${rich(formOf(k))}</div><textarea class="ed ed-form" id="form-${k.id}" rows="2" aria-label="Fórmula do indicador">${esc(formOf(k))}</textarea></div>`;
}
const NOME_BPP="BPP · Perdas Operativas SVC";
/* Linha do fim de cada bloco (só no modo de edição): + Novo indicador e os excluídos */
function rodapeEdicao(g){
  const exc=CONFIG.removidos.filter(u=>ordemPadraoTodos(g).includes(u));
  const nomeU=u=>u==="bpp"?NOME_BPP:nameOf(acharIndicador(u)||{id:u,name:u});
  return `<button type="button" class="btn-ghost add-ind" data-g="${g}">+ Novo indicador</button>`+
    (exc.length?`<span class="excluidos"><span class="nota">Excluídos:</span> ${exc.map(u=>`<button type="button" class="chip-volta" data-u="${u}" title="Trazer de volta">↺ ${esc(nomeU(u))}</button>`).join(" ")}</span>`:"");
}
function buildTable(){
  for(const g of ["efi","proc"]){
    let html="";
    const ativos=kpisAtivos().filter(x=>x.p===g);
    for(const u of ordemDe(g)){
      if(u==="bpp"){
        html+=`<tr class="parent" id="row-bpp" data-u="bpp"><td class="k-cell"><div class="k-head">${botoesOrdem(g,"bpp")}<button type="button" class="k-toggle" aria-expanded="false" aria-label="Ver descrição e fórmula">${CHEV}</button><span class="k-name view">${NOME_BPP}</span></div>
          <div class="k-info"><div class="k-lbl">Descrição</div><div class="k-def">KPI de perda monetária do Programa de Proteção ao Comprador, calculado a partir das perdas por Perda, Atraso e Dano na estação e por Embalagem danificada, dividido pelo volume transportado. Cada subitem tem a sua meta e vale 2%, somando 8%.</div>
          <div class="k-lbl">Fórmula</div><div class="k-form">Perdas BPP (Lost, Delayed e Damaged at station + Damaged) / GMV do cluster</div></div></td>
          <td class="c"><span class="pts num" id="w-bpp"></span></td><td class="c"><span class="nota">4 subitens</span></td><td></td><td></td><td></td><td></td><td class="c" id="st-bpp"></td></tr>`;
      }
      for(const k of ativos.filter(x=>(x.grp==="bpp"?"bpp":x.id)===u)){
        const isSub=k.grp==="bpp";
        html+=`<tr class="${isSub?"sub":""}" data-u="${u}">
        <td class="k-cell">${celulaIndicador(k,isSub?"":g)}</td>
        <td class="c in"><input class="w-in" id="w-${k.id}" inputmode="decimal" readonly aria-label="Peso ${esc(nameOf(k))}"></td>
        <td class="in c"><div class="meta-cell"><button type="button" class="dir" id="dir-${k.id}" data-k="${k.id}" disabled title="≥ = quanto maior, melhor · ≤ = quanto menor, melhor (troque em Editar indicadores)">${simboloDir(k)}</button><input id="meta-${k.id}" class="meta-in" inputmode="decimal" placeholder="—" readonly aria-label="Meta ${esc(nameOf(k))}"></div></td>
        ${[0,1,2].map(i=>`<td class="in c"><input id="v-${k.id}-${i}" class="v-in" inputmode="text" placeholder="—" aria-label="${esc(nameOf(k))} mês ${i+1}"></td>`).join("")}
        <td class="r"><span class="avg" id="avg-${k.id}">—</span><div class="avg-n" id="avgn-${k.id}"></div></td>
        <td class="c" id="st-${k.id}"></td>
      </tr>`;
      }
    }
    html+=`<tr class="so-edicao"><td colspan="8">${rodapeEdicao(g)}</td></tr>`;
    $("tbody-"+g).innerHTML=html;
  }
  // Segurança: cabeçalho + uma linha por indicador (com Meta) + rodapé de edição
  let she=`<div class="she-row head"><span>Indicador</span><span class="c">Meta</span><span class="c" id="sh-m1">${esc(CONFIG.meses[0])}</span><span class="c" id="sh-m2">${esc(CONFIG.meses[1])}</span><span class="c" id="sh-m3">${esc(CONFIG.meses[2])}</span><span class="c">Status</span></div>`;
  const sheMap=Object.fromEntries(sheAtivos().map(k=>[k.id,k]));
  for(const u of ordemDe("she")){
    const k=sheMap[u];if(!k)continue;
    const base=k.id==="she_psif"?"psif":k.id==="she_tri"?"tri":"she-"+k.id;
    she+=`<div class="she-row" data-u="${k.id}">
      <div class="k-cell" id="cell-${k.id}">${celulaIndicador(k,"she")}</div>
      <input id="meta-${k.id}" class="meta-in" inputmode="decimal" placeholder="—" readonly aria-label="Meta ${esc(nameOf(k))}">
      ${[0,1,2].map(i=>`<input id="${base}-${i}" inputmode="${k.kind==="psif"?"numeric":"decimal"}" placeholder="—" aria-label="${esc(nameOf(k))} mês ${i+1}">`).join("")}
      <span class="c" id="st-${k.id}"></span>
    </div>`;
  }
  she+=`<div class="she-row so-edicao">${rodapeEdicao("she")}</div>`;
  $("she-grid").innerHTML=she;
  $("tiers").innerHTML=TIERS.map(t=>`<div class="tier" data-name="${t.name}"><img src="${MEDALS[t.name]}" alt=""><div><div class="t-n">${t.name}</div><div class="t-r">${t.range}</div></div></div>`).join("");
  const segs=[[0,70,"#c0392b"],[70,80,"#a8683f"],[80,88,"#a9acaf"],[88,93,"#d1a020"],[93,100,"#6f808b"]];
  $("ruler-track").innerHTML=segs.map(s=>`<span style="width:${s[1]-s[0]}%;background:${s[2]}"></span>`).join("");
  $("ruler-ticks").innerHTML=[0,70,80,88,93,100].map(v=>`<span class="num" style="left:${v}%">${v}</span>`).join("");
  marcarSetas();
}

/* ---------- Ordem dos indicadores (Segurança, Eficiência e Processos) ----------
   Cada bloco tem a sua lista. O BPP é uma unidade só ("bpp"): os 4 subitens andam juntos. */
function ordemPadraoTodos(g){ // todos, inclusive os excluídos
  if(g==="she")return todosShe().map(k=>k.id);
  const out=[];
  todosKpis().filter(k=>k.p===g).forEach(k=>{const u=k.grp==="bpp"?"bpp":k.id;if(!out.includes(u))out.push(u);});
  return out;
}
function ordemPadrao(g){return ordemPadraoTodos(g).filter(u=>!CONFIG.removidos.includes(u));}
function ordemDe(g){
  const padrao=ordemPadrao(g), salva=Array.isArray(CONFIG.ordem[g])?CONFIG.ordem[g]:[];
  const lista=salva.filter(u=>padrao.includes(u));
  padrao.forEach(u=>{if(!lista.includes(u))lista.push(u);});
  return lista;
}
function marcarSetas(){
  for(const g of ["she","efi","proc"]){
    const ordem=ordemDe(g), caixa=g==="she"?$("she-grid"):$("tbody-"+g);
    caixa.querySelectorAll(".mv").forEach(b=>{
      const i=ordem.indexOf(b.dataset.u);
      b.disabled=b.dataset.d==="-1"?i<=0:i>=ordem.length-1;
    });
  }
}
/* Remonta a calculadora depois de mudar ordem, incluir ou excluir */
function reconstruir(){
  buildTable();fillConfig();fillValores();render();
  modoEdicao($("aba-pel").classList.contains("editing"));
}
function moverIndicador(g,u,d){
  if(!podeEditarCfg())return;
  const ordem=ordemDe(g), i=ordem.indexOf(u), j=i+d;
  if(i<0||j<0||j>=ordem.length)return;
  [ordem[i],ordem[j]]=[ordem[j],ordem[i]];
  CONFIG.ordem[g]=ordem;
  reconstruir();gravarConfig();
}
function trocarSentido(id){
  if(!podeEditarCfg()||!$("aba-pel").classList.contains("editing"))return;
  const k=todosKpis().find(x=>x.id===id);if(!k)return;
  const novo=dirOf(k)==="min"?"max":"min";
  if(novo===dirPadrao(k))delete CONFIG.dirs[id]; else CONFIG.dirs[id]=novo;
  $("dir-"+id).textContent=simboloDir(k);
  gravarConfig();render();
}
function novoIndicador(g){
  if(!podeEditarCfg())return;
  const id="x"+Date.now().toString(36);
  CONFIG.extras.push({id,p:g});
  reconstruir();gravarConfig();
  const campo=$("name-"+id);if(campo.focus){campo.focus();campo.select();}
}
function excluirIndicador(u){
  if(!podeEditarCfg())return;
  if(!CONFIG.removidos.includes(u))CONFIG.removidos.push(u);
  reconstruir();gravarConfig();
}
function voltarIndicador(u){
  if(!podeEditarCfg())return;
  CONFIG.removidos=CONFIG.removidos.filter(x=>x!==u);
  reconstruir();gravarConfig();
}

/* Preenche textos, metas e pesos a partir da configuração */
function fillConfig(){
  [0,1,2].forEach(i=>{document.querySelectorAll(".h-m"+(i+1)).forEach(el=>el.textContent=CONFIG.meses[i]);$("sh-m"+(i+1)).textContent=CONFIG.meses[i];});
  $("periodo-rotulo").textContent=CONFIG.periodo;
  for(const k of [...kpisAtivos(),...sheAtivos()]){
    $("vname-"+k.id).textContent=nameOf(k);$("name-"+k.id).value=nameOf(k);
    $("vdef-"+k.id).innerHTML=rich(defOf(k));$("def-"+k.id).value=defOf(k);
    $("vform-"+k.id).innerHTML=rich(formOf(k));$("form-"+k.id).value=formOf(k);
  }
  for(const k of kpisAtivos()){ $("meta-"+k.id).value=fmtPct(metaOf(k)); $("w-"+k.id).value=fmtPct(wOf(k)); $("dir-"+k.id).textContent=simboloDir(k); }
  for(const k of sheAtivos()){ $("meta-"+k.id).value=fmtIn(metaOf(k)); }
  $("na-mode").value=CONFIG.naMode;
}
/* Preenche os meses a partir do lançamento do site */
function fillValores(){
  for(const k of kpisAtivos()){
    const v=state.vals[k.id]||[];
    [0,1,2].forEach(i=>{const el=$(`v-${k.id}-${i}`);el.value=fmtIn(v[i]);el.classList.toggle("na",v[i]==="NA");el.readOnly=!podeLancar;});
  }
  for(const k of sheAtivos()){
    const base=k.id==="she_psif"?"psif":k.id==="she_tri"?"tri":"she-"+k.id, v=sheVals(state,k.id);
    [0,1,2].forEach(i=>{const el=$(`${base}-${i}`);el.value=fmtIn(v[i]);el.readOnly=!podeLancar;});
  }
  $("pel-calc").classList.toggle("somente-leitura",!podeLancar);
  $("modo-leitura").hidden=podeLancar;
}

/* ==========================================================
   Calculadora: atualização da tela
   ========================================================== */
function render(){
  const c=calcular(state);
  for(const k of kpisAtivos()){
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
  {const subs=kpisAtivos().filter(k=>k.grp==="bpp");const wsum=subs.reduce((a,k)=>a+wOf(k),0);const ok=subs.filter(k=>c.res[k.id].ok).length;const any=subs.some(k=>c.res[k.id].avg!==null);
   $("w-bpp").textContent=nf(wsum)+"%";$("st-bpp").innerHTML=any?`<span class="pill ${ok===subs.length?"ok":ok?"warn":"no"}">${ok} de ${subs.length} na meta</span>`:`<span class="pill wait">Sem dados</span>`;}
  for(const g of ["efi","proc"]){const fora=kpisAtivos().filter(k=>k.p===g&&c.res[k.id].avg!==null&&!c.res[k.id].ok).length;const com=kpisAtivos().some(k=>k.p===g&&c.res[k.id].avg!==null);const el=$("fora-"+g);el.textContent=!com?"Sem dados":fora?`${fora} fora da meta`:"Tudo na meta";el.className="pill "+(!com?"wait":fora?"no":"ok");}

  for(const k of sheAtivos()){
    const r=c.she[k.id];
    const txt=k.kind==="psif"?(r.soma?r.soma+" PSIF":"Zero"):fmt(r.avg,"");
    $("st-"+k.id).innerHTML=!r.n?`<span class="pill wait">Sem dados</span>`:r.meta==null?`<span class="pill wait">Sem meta</span>`:`<span class="pill ${r.fail?"no":"ok"}">${txt}</span>`;
  }
  const wWarn=$("w-warn");wWarn.hidden=false;
  wWarn.innerHTML=Math.abs(c.totalW-100)<1e-6?`<span class="pill ok">Soma dos pesos: 100%</span>`:`<span class="pill no">Soma dos pesos: ${nf(c.totalW)}%</span> Ajuste para fechar 100%.`;
  const t=c.t, zeroed=c.sheFail, score=c.score;
  $("seguranca").classList.toggle("fail",zeroed);
  $("she-note").innerHTML=zeroed?`<span class="pill no">Não cumprido · site em Não classifica</span>`:c.sheOk?`<span class="pill ok">Cumprido</span>`:`<span class="pill wait">Pendente</span>`;
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
    const cand=kpisAtivos().filter(k=>!c.res[k.id].ok&&c.res[k.id].need&&c.res[k.id].need.t!=="impossível"&&c.res[k.id].avg!==null).sort((a,b)=>wOf(b)-wOf(a));
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
function mostrarSub(nome){
  document.querySelectorAll("#pel-menu button").forEach(b=>{if(b.dataset.sub===nome)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  document.querySelectorAll("#aba-pel .pel-sub").forEach(s=>s.hidden=s.id!=="pel-"+nome);
  subAtual=nome;
  if(nome==="visao")carregarVisao();
  if(nome==="usuarios")carregarUsuarios();
  if(nome==="sites")carregarAbaSites();
  if(usuario)local.set("pel:sub:"+usuario.id,nome);
}
let subAtual="calc";
function prepararApp(){
  const p=perfil.papel;
  document.querySelectorAll("#pel-menu button").forEach(b=>{b.hidden=!!b.dataset.papel&&!b.dataset.papel.split(" ").includes(p);});
  $("pel-menu").hidden=p==="analista";
  $("btn-edit").hidden=!podeEditarCfg();
  document.querySelector("#aba-pel .na-sel").hidden=p==="analista"; // Analista não vê "N/A nos meses"
  const escolhe=p==="gestao"||p==="admin";
  $("site-escolha").hidden=!escolhe;$("site-fixo").hidden=escolhe;
  $("site-escolha").innerHTML=`<option value="">Escolha um site</option>`+sites.map(s=>`<option value="${esc(s.codigo)}">${esc(s.codigo)}${s.nome?" · "+esc(s.nome):""}</option>`).join("");
  fillConfig();
}

/* ---------- Visão geral ---------- */
let visaoLanc=[];
async function carregarVisao(){
  $("visao-periodo").textContent="Trimestre: "+CONFIG.periodo;
  $("visao-tbody").innerHTML=`<tr><td colspan="11" class="vazio">Carregando…</td></tr>`;
  await carregarSites().catch(()=>{});
  const {data,error}=await sb.from("pel_lancamentos").select("site,dados,atualizado_em,atualizado_por").eq("periodo",CONFIG.periodo);
  if(error){$("visao-tbody").innerHTML=`<tr><td colspan="11" class="vazio">Não foi possível carregar os sites. Recarregue a página.</td></tr>`;return;}
  visaoLanc=data||[];
  // Nome de quem salvou por último (Gestão e Administrador podem ler os perfis)
  const nomes={};
  const {data:pf}=await sb.from("pel_perfis").select("user_id,nome,email");
  (pf||[]).forEach(p=>{nomes[p.user_id]=p.nome||p.email;});
  const linhas=sites.map(s=>{const l=visaoLanc.find(x=>x.site===s.codigo);const c=l?calcular(Object.assign(blankState(),l.dados||{})):null;return {s,l,c};});
  const cont={};TIERS.forEach(t=>cont[t.name]=0);
  linhas.forEach(x=>{if(x.c&&x.c.comDados)cont[x.c.t.name]++;});
  $("visao-contagem").innerHTML=TIERS.map(t=>`<div class="cont"><img src="${MEDALS[t.name]}" alt=""><div><div class="n">${cont[t.name]}</div><div class="r">${t.name}<br>${t.range}</div></div></div>`).join("");
  linhas.sort((a,b)=>(b.c&&b.c.comDados?b.c.score:-1)-(a.c&&a.c.comDados?a.c.score:-1));
  $("visao-tbody").innerHTML=linhas.length?linhas.map(({s,l,c},idx)=>{
    const tem=c&&c.comDados;
    const she=!c?`<span class="pill wait">—</span>`:c.sheFail?`<span class="pill no">Não cumprido</span>`:c.sheOk?`<span class="pill ok">Cumprido</span>`:`<span class="pill wait">Pendente</span>`;
    return `<tr data-site="${esc(s.codigo)}" class="${idx%2?"listra":""}"><td class="col-exp">${mesesLancados(l).length?`<button type="button" class="vg-exp" aria-expanded="false" aria-label="Ver o resultado de cada mês" title="Ver o resultado de cada mês">${CHEV}</button>`:""}</td><td class="col-reg">${esc(s.regional||"—")}</td><td class="c"><b>${esc(s.codigo)}</b>${s.nome?" · "+esc(s.nome):""}</td><td class="c">${esc(CONFIG.periodo)}</td>
      <td class="c">${she}</td><td class="c num">${tem?nf(c.tot.efi)+"%":"—"}</td><td class="c num">${tem?nf(c.tot.proc)+"%":"—"}</td>
      <td class="c num"><b>${tem?nf(c.score)+"%":"—"}</b></td><td>${tem?`<img class="med" src="${MEDALS[c.t.name]}" alt="">${c.t.name}`:`<span class="nota">Sem lançamentos</span>`}</td>
      <td class="pequeno">${l?dataHora(l.atualizado_em):"—"}</td><td class="pequeno">${l&&l.atualizado_por?esc(nomes[l.atualizado_por]||"—"):"—"}</td></tr>
      ${linhasMeses(s,l,nomes)}`;
  }).join(""):`<tr><td colspan="11" class="vazio">Nenhum site cadastrado ainda. Os sites aparecem quando as pessoas criam a conta.</td></tr>`;
}

/* Lançamento de um mês só (posição 0, 1 ou 2): mesma conta do trimestre, usando só aquele mês */
function dadosDoMes(d,i){
  const um=a=>{const v=(a||[])[i];return v===undefined?[]:[v];};
  const out={vals:{},psif:um(d.psif),tri:um(d.tri),she:{}};
  Object.keys(d.vals||{}).forEach(id=>{out.vals[id]=um(d.vals[id]);});
  Object.keys(d.she||{}).forEach(id=>{out.she[id]=um(d.she[id]);});
  return out;
}
/* Mês lançado = tem pelo menos um valor (ou N/A) em qualquer indicador */
function mesLancado(d,i){
  const tem=a=>{const v=(a||[])[i];return v!==null&&v!==undefined&&v!=="";};
  return Object.values(d.vals||{}).some(tem)||tem(d.psif)||tem(d.tri)||Object.values(d.she||{}).some(tem);
}
function mesesLancados(l){return l?[0,1,2].filter(i=>mesLancado(l.dados||{},i)):[];}
/* Linhas que abrem embaixo de cada site (começam fechadas): resultado de cada mês já lançado,
   com a última atualização daquele mês e quem fez */
function linhasMeses(s,l,nomes){
  const upd=(l&&l.dados&&l.dados.upd)||{};
  return mesesLancados(l).map(i=>{
    const u=upd[i]||{};
    const c=l?calcular(dadosDoMes(Object.assign(blankState(),l.dados||{}),i)):null;
    const tem=c&&c.comDados;
    const temShe=c&&sheAtivos().some(k=>c.she[k.id]&&c.she[k.id].n);
    const she=!temShe?`<span class="pill wait">—</span>`:c.sheFail?`<span class="pill no">Não cumprido</span>`:c.sheOk?`<span class="pill ok">Cumprido</span>`:`<span class="pill wait">Pendente</span>`;
    return `<tr class="vg-mes-linha" data-pai="${esc(s.codigo)}" hidden><td class="col-exp"></td><td class="col-reg"></td><td class="c vg-mes-nome">${esc(CONFIG.meses[i])}</td><td class="c pequeno">mês ${i+1}</td>
      <td class="c">${she}</td><td class="c num">${tem?nf(c.tot.efi)+"%":"—"}</td><td class="c num">${tem?nf(c.tot.proc)+"%":"—"}</td>
      <td class="c num"><b>${tem?nf(c.score)+"%":"—"}</b></td><td>${tem?`<img class="med" src="${MEDALS[c.t.name]}" alt="">${c.t.name}`:`<span class="nota">Só Segurança lançada</span>`}</td>
      <td class="pequeno">${u.em?dataHora(u.em):"—"}</td><td class="pequeno">${u.por?esc(nomes[u.por]||"—"):"—"}</td></tr>`;
  }).join("");
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
      <td>${siteTexto(p.site)}</td>
      <td><select class="u-papel" aria-label="Papel de ${esc(p.email)}" ${eu?"disabled":""}>${Object.keys(PAPEIS).map(k=>`<option value="${k}" ${k===p.papel?"selected":""}>${PAPEIS[k]}</option>`).join("")}</select></td></tr>`;
  }).join(""):`<tr><td colspan="5" class="vazio">Nenhuma conta ${filtroPapel?"com este papel":"ainda"}.</td></tr>`;
}
// Site da conta, só para leitura: "SSP53 · Mirassol-SP · SPI"
function siteTexto(codigo){
  if(!codigo)return `<span class="nota">Sem site</span>`;
  const s=sites.find(x=>x.codigo===codigo);
  return `<b>${esc(codigo)}</b>`+(s?[s.nome,s.regional].filter(Boolean).map(t=>" · "+esc(t)).join(""):"");
}
async function alterarUsuario(id,campo,valor){
  const p=perfis.find(x=>x.user_id===id);if(!p)return;
  msgSalvo($("usuarios-msg"),"Salvando…");
  const {error}=await sb.from("pel_perfis").update({[campo]:valor}).eq("user_id",id);
  if(error){msgSalvo($("usuarios-msg"),"Não foi possível salvar. "+(error.message||""),true);desenharUsuarios();return;}
  p[campo]=valor;
  msgSalvo($("usuarios-msg"),`${p.nome||p.email}: papel ${PAPEIS[valor]} salvo.`+(valor==="analista"&&!p.site?" Atenção: esta conta não tem site, então o analista ainda não consegue entrar.":""));
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
  const main=$("aba-pel");
  main.addEventListener("input",e=>{
    const id=e.target.id;let m;
    if((m=id.match(/^w-(.+)$/))){
      const k=todosKpis().find(x=>x.id===m[1]);if(!k||!podeEditarCfg())return;
      const v=parseNum(e.target.value);
      if(v===null||v===k.w)delete CONFIG.weights[k.id]; else CONFIG.weights[k.id]=Math.max(0,v);
      gravarConfig();render();return;
    }
    if((m=id.match(/^(name|def|form)-(.+)$/))){
      const k=acharIndicador(m[2]);if(!k||!podeEditarCfg())return;
      const v=e.target.value;
      if(m[1]==="name"){ if(v.trim()===""||v===k.name)delete CONFIG.names[k.id]; else CONFIG.names[k.id]=v; $("vname-"+k.id).textContent=nameOf(k); $("dir-"+k.id).textContent=simboloDir(k); }
      else if(m[1]==="def"){ if(v===k.def)delete CONFIG.defs[k.id]; else CONFIG.defs[k.id]=v; $("vdef-"+k.id).innerHTML=rich(defOf(k)); }
      else { if(v===k.form)delete CONFIG.forms[k.id]; else CONFIG.forms[k.id]=v; $("vform-"+k.id).innerHTML=rich(formOf(k)); }
      gravarConfig();render();return;
    }
    if((m=id.match(/^meta-(.+)$/))){ if(!podeEditarCfg())return; const v=parseNum(e.target.value); if(v===null)delete CONFIG.metas[m[1]]; else CONFIG.metas[m[1]]=v; if(m[1]==="she_tri")CONFIG.triMeta=v; gravarConfig();render();return; }
    if(!podeLancar)return;
    if((m=id.match(/^v-(.+)-(\d)$/))){
      const v=parseVal(e.target.value);(state.vals[m[1]]=state.vals[m[1]]||[])[+m[2]]=v;
      if(v==="NA"){e.target.value="N/A";e.target.classList.add("na");}else e.target.classList.remove("na");
    }
    else if((m=id.match(/^(psif|tri)-(\d)$/))){(state[m[1]]=state[m[1]]||[])[+m[2]]=parseNum(e.target.value);}
    else if((m=id.match(/^she-(.+)-(\d)$/))){state.she=state.she||{};(state.she[m[1]]=state.she[m[1]]||[])[+m[2]]=parseNum(e.target.value);}
    else return;
    // Última atualização de cada mês (aparece nas linhas dos meses da Visão geral)
    const mes=+id.slice(-1);
    state.upd=state.upd||{};state.upd[mes]={em:new Date().toISOString(),por:usuario.id};
    gravarLancamento();render();
  });
  main.addEventListener("change",e=>{
    if(e.target.id==="na-mode"&&podeEditarCfg()){CONFIG.naMode=e.target.value;gravarConfig();render();}
    else if(e.target.id==="site-escolha"){abrirSite(e.target.value);local.set("pel:site:"+usuario.id,e.target.value);}
  });
  main.addEventListener("focusout",e=>{
    const el=e.target; if(!el.matches||!el.matches(".meta-in, .w-in"))return;
    const v=parseNum(el.value); el.value=v===null?"":(el.closest(".she-row")?fmtIn(v):fmtPct(v));
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
    const mv=e.target.closest(".mv");if(mv){moverIndicador(mv.dataset.g,mv.dataset.u,+mv.dataset.d);return;}
    const dir=e.target.closest(".dir");if(dir){trocarSentido(dir.dataset.k);return;}
    const rm=e.target.closest(".rm");if(rm){armar(rm,"Excluir?",()=>excluirIndicador(rm.dataset.u));return;}
    const add=e.target.closest(".add-ind");if(add){novoIndicador(add.dataset.g);return;}
    const volta=e.target.closest(".chip-volta");if(volta){voltarIndicador(volta.dataset.u);return;}
    const b=e.target.closest(".b-btn");if(b){const ta=$(b.dataset.t);if(ta.tagName==="TEXTAREA")boldWrap(ta);return;}
    const t=e.target.closest(".k-toggle, .k-name.view");
    if(t){const tr=t.closest("tr, .she-row");if(tr)setOpen(tr,!tr.classList.contains("aberto"));}
  });
  $("btn-edit").addEventListener("click",()=>{
    if(!podeEditarCfg())return;
    const on=!$("aba-pel").classList.contains("editing");
    modoEdicao(on);
    if(!on)gravarConfigAgora($("salvo"));
  });
  $("btn-expand").addEventListener("click",e=>{
    const rows=[...document.querySelectorAll("#pel-calc tbody tr, #pel-calc .she-row")].filter(r=>r.querySelector(".k-toggle"));
    const open=!rows.every(r=>r.classList.contains("aberto"));
    rows.forEach(r=>setOpen(r,open));e.target.textContent=open?"Recolher todos":"Expandir todos";
  });
  $("btn-reset-txt").addEventListener("click",e=>armar(e.target,"Clique de novo para restaurar",()=>{
    // Volta textos, pesos e ordem de fábrica; os indicadores criados e os excluídos continuam como estão
    const criados=CONFIG.extras.map(x=>x.id);
    const soCriados=o=>Object.fromEntries(Object.entries(o).filter(([id])=>criados.includes(id)));
    CONFIG.names=soCriados(CONFIG.names);CONFIG.defs=soCriados(CONFIG.defs);CONFIG.forms=soCriados(CONFIG.forms);CONFIG.weights=soCriados(CONFIG.weights);CONFIG.ordem={};
    reconstruir();gravarConfigAgora($("salvo"));
  }));
}
/* Liga ou desliga o modo "Editar indicadores" (só Administrador) */
function modoEdicao(on){
  document.querySelectorAll("#aba-pel .meta-in, #aba-pel .w-in, #aba-pel .lock-in").forEach(el=>{el.readOnly=!on;});
  document.querySelectorAll("#aba-pel .dir").forEach(el=>{el.disabled=!on;});
  $("na-mode").disabled=!on;
  $("aba-pel").classList.toggle("editing",on);
  $("btn-edit").textContent=on?"Concluir edição":"Editar indicadores";
  $("btn-reset-txt").hidden=!on;
  $("table-note").textContent=on?"Os campos amarelos podem ser editados e valem para todos os sites. Clique em ≥/≤ para trocar o sentido da meta. ▲▼ mudam a ordem, ✕ exclui (clique duas vezes) e + Novo indicador, no fim de cada bloco, acrescenta. Para destacar em negrito, selecione o texto e clique em N (ou Ctrl+B).":"Regra: média do trimestre dentro da meta soma 100% do peso; fora, soma 0%. ≥ = quanto maior, melhor (média igual ou maior que a meta). ≤ = quanto menor, melhor (média igual ou menor que a meta, ex.: BPP e Delay). Digite N/A no mês para marcar o indicador como não aplicável.";
}
/* Segurança, Eficiência e Processos começam sempre fechados */
function fecharBlocos(){
  document.querySelectorAll("#aba-pel details.bloco").forEach(d=>{d.open=false;});
}

/* ==========================================================
   Eventos das abas de Gestão e Administrador
   ========================================================== */
function ligarAdmin(){
  $("pel-menu").addEventListener("click",e=>{const b=e.target.closest("button[data-sub]");if(b)mostrarSub(b.dataset.sub);});
  $("visao-tbody").addEventListener("click",e=>{
    const exp=e.target.closest(".vg-exp");
    if(exp){ // seta: abre/fecha as linhas dos 3 meses, sem abrir a calculadora
      const tr=exp.closest("tr"), abrir=!tr.classList.contains("aberto");
      document.querySelectorAll(`#visao-tbody tr.vg-mes-linha[data-pai="${CSS.escape(tr.dataset.site)}"]`).forEach(m=>{m.hidden=!abrir;});
      exp.setAttribute("aria-expanded",abrir);tr.classList.toggle("aberto",abrir);return;
    }
    const tr=e.target.closest("tr[data-site]");if(!tr)return;mostrarSub("calc");abrirSite(tr.dataset.site);
  });
  $("filtro-papel").addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;filtroPapel=b.dataset.f;document.querySelectorAll("#filtro-papel .chip").forEach(c=>c.setAttribute("aria-pressed",c===b));desenharUsuarios();});
  $("usuarios-tbody").addEventListener("change",e=>{
    const tr=e.target.closest("tr[data-id]");if(!tr)return;
    if(e.target.classList.contains("u-papel"))alterarUsuario(tr.dataset.id,"papel",e.target.value);
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
   Início: js/supabase.js avisa quem entrou e qual é o perfil
   ========================================================== */
let ligado=false, avisoEl=null;
function avisoAba(txt){
  $("pel-aviso").hidden=!txt;$("pel-aviso").textContent=txt||"";
  $("pel-conteudo").hidden=!!txt;
}
async function abrirPEL(){
  if(!ligado){CONFIG=normConfig({});buildTable();ligarCalculadora();ligarAdmin();ligado=true;}
  fecharBlocos();
  avisoAba("Carregando a Calculadora PEL…");
  try{await carregarConfig();await carregarSites();}
  catch(e){avisoAba("Não foi possível carregar a Calculadora PEL. Confira a internet e recarregue a página.");return;}
  avisoAba("");
  buildTable();modoEdicao(false);
  prepararApp();
  if(perfil.papel==="analista"){mostrarSub("calc");await abrirSite(perfil.site);return;}
  const salvo=local.get("pel:site:"+usuario.id);
  await abrirSite(sites.some(s=>s.codigo===salvo)?salvo:"");
  mostrarSub("visao"); // Administrador e Gestão sempre começam na Visão geral
}
document.addEventListener("gq:perfil",e=>{
  const d=e.detail||{};
  usuario=d.usuario||null; perfil=d.perfil||null;
  if(usuario&&perfil&&["analista","gestao","admin"].includes(perfil.papel)) abrirPEL();
});
// Ao voltar para a aba: blocos fechados e, para Administrador e Gestão, a Visão geral atualizada
document.addEventListener("gq:aba",e=>{
  if(!(e.detail&&e.detail.aba==="pel"&&ligado&&perfil))return;
  fecharBlocos();
  if(perfil.papel!=="analista") mostrarSub("visao");
});

})();
