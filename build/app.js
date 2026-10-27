"use strict";
const DATA = JSON.parse(document.getElementById('payload').textContent);
const META = DATA.meta, SALES = DATA.sales, B = DATA.build;
const TAX = B.tax_factor || 1;
const MAIN_PRODUCT = B.main_product || 'Produto principal';
const MAIN_PREFIX = B.main_product_prefix || '';

/* ---------------- format ---------------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>(v==null||!isFinite(v))?'-':'R$ '+nf2.format(v);
const pct=v=>(v==null||!isFinite(v))?'-':nf2.format(v*100)+'%';
const intf=v=>(v==null||!isFinite(v))?'-':nf0.format(v);
const numf=v=>(v==null||!isFinite(v))?'-':nf1.format(v);
const roasf=v=>(v==null||!isFinite(v))?'-':nf1.format(v)+'x';
const dimf=v=>v==null?'-':String(v);
/* remove acentos p/ casar com o norm() do build.py (unicodedata NFKD) */
const norm=s=>(s==null?'':String(s)).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const isMainProd=p=>norm(p).startsWith(MAIN_PREFIX);
const brdate=d=>{ if(!d) return '-'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekday=d=>{ const dt=new Date(d+'T00:00:00'); return isNaN(dt)?'':WD[dt.getDay()]; };

/* ---------------- date helpers ---------------- */
function pad(n){return String(n).padStart(2,'0');}
function dstr(dt){return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function addDays(s,n){const dt=new Date(s+'T00:00:00');dt.setDate(dt.getDate()+n);return dstr(dt);}
const TODAY = B.today || B.date_max;

/* ---------------- STATE ---------------- */
const STATE = {
  page:'geral', from:B.date_min, to:B.date_max, preset:'todo', tax:true,
  selDays:new Set(),
  mSelC:new Set(), mSelA:new Set(), mSelAd:new Set(),
  sort:{}, colw: JSON.parse(localStorage.getItem('dm_colw')||'{}'),
  iaWin: localStorage.getItem('ia_win') || '14d',
};
const taxf = ()=> STATE.tax ? TAX : 1;

/* active date test: selDays override the De/Até range */
function dateActive(d){
  if(!d) return false;
  if(STATE.selDays.size) return STATE.selDays.has(d);
  return (!STATE.from || d>=STATE.from) && (!STATE.to || d<=STATE.to);
}
const metaActive  = ()=> META.filter(m=>dateActive(m.d));
const salesActive = ()=> SALES.filter(s=>dateActive(s.d));

/* ---------------- aggregation ----------------
   bucket = {sp,im,cl,pv,ck, vendas, vendasM, fat}
   vendas  = compras do produto principal (base de exibição da página)
   vendasM = compras do produto principal atribuídas ao Meta Ads (base das conversões)
   fat     = faturamento (todos os produtos do escopo)
   Obs.: na aba Meta o conjunto de vendas já é filtrado a meta==1, então vendas==vendasM. */
function newBucket(){return {sp:0,im:0,cl:0,pv:0,ck:0,vendas:0,vendasM:0,fat:0};}
function addSales(a,r){ a.vendas+=r.main; a.vendasM+=(r.main&&r.meta)?1:0; a.fat+=r.val; }
function derive(a){
  const g=a.sp*taxf();
  return {gasto:g, impr:a.im, cliques:a.cl, pv:a.pv, ck:a.ck, vendas:a.vendas, fat:a.fat,
    cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    cpv:a.pv?g/a.pv:null, cr:a.cl?a.pv/a.cl:null,               /* CR = Page Views / Cliques */
    cpic:a.ck?g/a.ck:null, vischk:a.pv?a.ck/a.pv:null,
    convlp:a.pv?a.vendasM/a.pv:null,                            /* Vendas(Meta) / Page Views */
    convchk:a.ck?a.vendasM/a.ck:null,                           /* Vendas(Meta) / Checkouts */
    cac:a.vendas?g/a.vendas:null, roas:g?a.fat/g:null, ticket:a.vendas?a.fat/a.vendas:null};
}
function buildAgg(fS,fM,dim){
  const m={}; const get=k=>m[k]||(m[k]=newBucket());
  fM.forEach(r=>{const a=get(r[dim]); a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; a.pv+=r.pv; a.ck+=r.ck;});
  fS.forEach(r=>{const a=get(r[dim]); addSales(a,r);});
  return m;
}
function totals(fS,fM){
  const a=newBucket();
  fM.forEach(r=>{a.sp+=r.sp;a.im+=r.im;a.cl+=r.cl;a.pv+=r.pv;a.ck+=r.ck;});
  fS.forEach(r=>addSales(a,r));
  return a;
}
function daily(fS,fM){
  const days={}; const g=d=>days[d]||(days[d]=Object.assign({d},newBucket()));
  fM.forEach(r=>{if(!r.d)return; const a=g(r.d); a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; a.pv+=r.pv; a.ck+=r.ck;});
  fS.forEach(r=>{if(!r.d)return; addSales(g(r.d),r);});
  return Object.values(days).sort((a,b)=>a.d<b.d?-1:1);
}

/* ---------------- generic interactive table ---------------- */
function colWidth(cfg,c){ const saved=(STATE.colw[cfg.id]||{})[c.key];
  if(saved) return saved;
  if(c.w) return c.w;
  if(c.type==='date') return 96;
  if(c.type==='dim') return c.big?300:150;
  return 88; }
function renderTable(cfg){
  const table=document.getElementById(cfg.id); if(!table) return;
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  const fmt=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='roas'?roasf(v):t==='date'?brdate(v):dimf(v);
  const widths=cfg.cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
  const colgroup='<colgroup>'+cfg.cols.map((c,i)=>`<col style="width:${widths[i]}px">`).join('')+'</colgroup>';
  let thead='<thead><tr>'+cfg.cols.map((c,i)=>{
    const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
    return `<th class="${c.type==='dim'?'dim ':''}${sc}" data-k="${c.key}" data-ci="${i}">${c.label}<span class="rsz"></span></th>`;
  }).join('')+'</tr></thead>';
  let tbody='<tbody>'+rows.map(r=>{
    const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
    const tds=cfg.cols.map(c=>{
      const v=r.cells[c.key]; let bg='';
      if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
      const cls=(c.type==='dim'?'dim':'');
      return `<td class="${cls}" style="${bg}">${fmt(c.type,v)}</td>`;
    }).join('');
    return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
  }).join('')+'</tbody>';
  let tfoot='';
  if(cfg.total){ tfoot='<tfoot><tr>'+cfg.cols.map((c,i)=>{
    const v=cfg.total[c.key]; return `<td class="${c.type==='dim'?'dim':''}">${i===0?(v==null?'Total Geral':fmt(c.type,v)):fmt(c.type,v)}</td>`;
  }).join('')+'</tr></tfoot>'; }
  table.style.width=totalW+'px';
  table.innerHTML=colgroup+thead+tbody+tfoot;
  const cols=table.querySelector('colgroup').children;
  table.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click',e=>{ if(e.target.classList.contains('rsz'))return;
      const k=th.dataset.k, cur=STATE.sort[cfg.id];
      if(!cur||cur.key!==k) STATE.sort[cfg.id]={key:k,dir:'asc'};
      else if(cur.dir==='asc') STATE.sort[cfg.id]={key:k,dir:'desc'};
      else delete STATE.sort[cfg.id];
      renderTable(cfg);
    });
  });
  table.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, ci=+th.dataset.ci, x0=e.clientX;
      const w0=cols[ci].offsetWidth, tw0=table.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); cols[ci].style.width=nw+'px'; table.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
  });
  if(cfg.selectable && cfg.onSelect){
    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.addEventListener('click',e=>{ cfg.onSelect(decodeURIComponent(tr.dataset.k), e); });
    });
  }
}
/* Heatmap por coluna: cor FIXA por métrica (definida em identidade-visual.css),
   só a OPACIDADE varia com o valor (maior valor = mais vibrante). */
const HEAT_HUE={gasto:'--heat-gasto', fat:'--heat-fat', roas:'--heat-roas'};
function heat(v,lo,hi,kind){
  if(v==null||!isFinite(v)||hi===lo||!HEAT_HUE[kind]) return 'transparent';
  const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
  const c=hx2rgb(cvar(HEAT_HUE[kind]));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.06+0.5*t).toFixed(3)})`;
}
function toggleSet(set,key,ctrl){
  if(ctrl){ set.has(key)?set.delete(key):set.add(key); }
  else { const only=set.has(key)&&set.size===1; set.clear(); if(!only) set.add(key); }
}

/* ---------------- charts ---------------- */
const charts={};
const CHART_SERIES=['--cc1','--cc2','--cc3','--cc4','--cc5','--cc6','--cc7','--cc8','--cc9','--cc10'];
const cvar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const chartPalette=()=>CHART_SERIES.map(v=>cvar(v)||'#888888');
const hx2rgb=h=>{h=(h||'').replace('#','').trim();if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'888888',16);return [(n>>16)&255,(n>>8)&255,n&255];};
const cmuted=()=>cvar('--muted')||'#6B7280', cink=()=>cvar('--ink')||'#1A1D2E', cgrid=()=>cvar('--grid')||'#EEF0F5';
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
const FMT={brl:brl,pct:pct,num:numf,int:intf,roas:roasf};

/* combo: Vendas (barras) · Gasto/Faturamento (R$) · ROAS (eixo próprio) */
function comboChart(id, d){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted(), gr=cgrid();
  charts[id]=new Chart(el,{
    data:{labels, datasets:[
      {type:'bar',label:'Vendas',data:d.map(x=>x.vendas),backgroundColor:cvar('--chart-vendas'),yAxisID:'y',borderRadius:3,order:3},
      {type:'line',label:'Gasto',data:d.map(x=>+(x.sp*taxf()).toFixed(2)),borderColor:cvar('--chart-gasto'),backgroundColor:cvar('--chart-gasto'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:2},
      {type:'line',label:'Faturamento',data:d.map(x=>+x.fat.toFixed(2)),borderColor:cvar('--chart-faturamento'),backgroundColor:cvar('--chart-faturamento'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:2},
      {type:'line',label:'ROAS',data:d.map(x=>{const g=x.sp*taxf();return g?+(x.fat/g).toFixed(2):null;}),borderColor:cink(),backgroundColor:cink(),yAxisID:'y2',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},
        tooltip:{callbacks:{label:c=>{const v=c.raw,ax=c.dataset.yAxisID; return c.dataset.label+': '+(ax==='y1'?brl(v):ax==='y2'?roasf(v):intf(v));}}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',ticks:{color:mut,font:{size:10}},grid:{color:gr},beginAtZero:true,title:{display:true,text:'Vendas',color:mut,font:{size:10}}},
        y1:{position:'right',ticks:{color:mut,font:{size:10}},grid:{display:false},beginAtZero:true,title:{display:true,text:'R$',color:mut,font:{size:10}}},
        y2:{position:'right',ticks:{color:mut,font:{size:10},callback:v=>numf(v)+'x'},grid:{display:false},beginAtZero:true,title:{display:true,text:'ROAS',color:mut,font:{size:10}}}}}
  });
}
/* linhas genéricas (1 ou 2 eixos) */
function multiLine(id, d, series, opts){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const labels=d.map(x=>x.d.slice(5)), mut=cmuted();
  const useR=series.some(s=>s.axis==='R');
  const datasets=series.map(s=>({label:s.label,data:d.map(s.fn),borderColor:s.color,backgroundColor:s.color,
    yAxisID:s.axis==='R'?'y1':'y',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,_fmt:FMT[s.fmt]||numf}));
  const scales={x:{ticks:{color:mut,font:{size:9}},grid:{display:false}},
    y:{position:'left',beginAtZero:true,ticks:{color:mut,font:{size:9},callback:v=>(FMT[opts.L.fmt]||numf)(v)},grid:{color:cgrid()}}};
  if(useR) scales.y1={position:'right',beginAtZero:true,grid:{display:false},ticks:{color:mut,font:{size:9},callback:v=>(FMT[opts.R.fmt]||numf)(v)}};
  charts[id]=new Chart(el,{type:'line',data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:10}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset._fmt||numf)(c.raw)}}},
      scales}});
}
/* barras horizontais (faturamento por anúncio) */
const barLabels={id:'barLabels',afterDatasetsDraw(ch){const{ctx}=ch;ctx.save();ctx.font='600 11px Segoe UI,system-ui';ctx.fillStyle=cmuted();ctx.textBaseline='middle';
  const ds=ch.data.datasets[0], f=ds._fmt||intf;
  ch.getDatasetMeta(0).data.forEach((el,i)=>{const v=ds.data[i]; if(!v)return; ctx.fillText(f(v),el.x+5,el.y);});ctx.restore();}};
function hbar(id, items, valFn, color, top, fmtFn){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  let arr=items.slice().sort((a,b)=>valFn(b)-valFn(a)); if(top) arr=arr.slice(0,top);
  const mut=cmuted(), f=fmtFn||intf;
  charts[id]=new Chart(el,{type:'bar', plugins:[barLabels],
    data:{labels:arr.map(x=>x.label), datasets:[{label:'v',data:arr.map(valFn),backgroundColor:color||'#1BAF7A',borderRadius:3,_fmt:f}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:44}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>f(c.raw)}}},
      scales:{x:{beginAtZero:true,ticks:{color:mut,font:{size:9}},grid:{color:cgrid()}},
              y:{ticks:{color:mut,font:{size:9}},grid:{display:false}}}}});
}
/* CAC por dia, por item de uma dimensão (campanha/conjunto/anúncio) - 1 linha por item.
   `dim` = 'camp' | 'adset' | 'ad'; usa os mesmos dados escopados da tabela acima. */
function cacDimChart(id, fM, fS, dim){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const spendTot={}; fM.forEach(r=>spendTot[r[dim]]=(spendTot[r[dim]]||0)+r.sp);
  const items=Object.keys(spendTot).sort((a,b)=>spendTot[b]-spendTot[a]).slice(0,6);
  const dset=new Set(); fM.forEach(r=>r.d&&dset.add(r.d)); fS.forEach(r=>r.d&&dset.add(r.d));
  const days=[...dset].sort();
  const K=(c,dd)=>c+'\u0001'+dd, sp={}, vd={};
  fM.forEach(r=>{if(!r.d)return; sp[K(r[dim],r.d)]=(sp[K(r[dim],r.d)]||0)+r.sp;});
  fS.forEach(r=>{if(!r.d)return; vd[K(r[dim],r.d)]=(vd[K(r[dim],r.d)]||0)+r.main;});
  const PAL=chartPalette();
  const ds=items.map((c,i)=>({label:c.length>22?c.slice(0,22)+'…':c,
    data:days.map(dd=>{const s=(sp[K(c,dd)]||0)*taxf(), v=vd[K(c,dd)]||0; return v?+(s/v).toFixed(2):null;}),
    borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],borderWidth:2,pointRadius:1.5,spanGaps:true,tension:.25}));
  const mut=cmuted();
  charts[id]=new Chart(el,{type:'line',data:{labels:days.map(x=>x.slice(5)),datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:8,font:{size:9}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{ticks:{color:mut,font:{size:9},maxRotation:0,autoSkip:true,autoSkipPadding:8},grid:{display:false}},y:{ticks:{color:mut,font:{size:9},callback:v=>brl(v)},grid:{color:cgrid()},beginAtZero:true}}}});
}

/* ---------------- KPI cards ---------------- */
function kpiCard(k){ return `<div class="kpi ${k.hero?'hero':''}"><div class="kl"><span>${k.label}</span>${k.pill?`<span class="pill q">${k.pill}</span>`:''}</div><div class="kv">${k.val}</div><div class="ka">${k.aux||''}</div></div>`; }

/* ---------------- colunas das tabelas ---------------- */
const METRIC_COLS=[
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},   /* heatmap vermelho */
  {key:'cpm',label:'CPM',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},
  {key:'cr',label:'CR',type:'pct'},
  {key:'ic',label:'IC',type:'int'},                        /* Initiate Checkouts */
  {key:'cic',label:'CIC',type:'brl'},                      /* Custo por Initiate Checkout */
  {key:'vischk',label:'VisCHK',type:'pct'},
  {key:'convchk',label:'ConvCHK',type:'pct'},
  {key:'vendas',label:'Vendas',type:'int'},
  {key:'cac',label:'CAC',type:'brl'},
  {key:'fat',label:'Faturamento',type:'brl',heat:'fat'},  /* heatmap verde */
  {key:'ticket',label:'Ticket',type:'brl'},
  {key:'roas',label:'ROAS',type:'roas',heat:'roas'},      /* heatmap amarelo */
];
const DAILY_COLS=[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:64}].concat(METRIC_COLS);
const HCOLS=[{key:'dim',label:'',type:'dim',big:true}].concat(METRIC_COLS.map(c=>{const o={...c}; delete o.heat; return o;}));
function metricCells(x,d){
  return {gasto:d.gasto, cpm:d.cpm, ctr:d.ctr, cr:d.cr, ic:x.ck, cic:d.cpic, vischk:d.vischk, convchk:d.convchk,
    vendas:x.vendas, cac:d.cac, fat:x.fat, ticket:d.ticket, roas:d.roas};
}
function dailyCells(x,d,isTotal){
  return Object.assign({date:isTotal?null:x.d, wd:isTotal?'':weekday(x.d)}, metricCells(x,d));
}

/* ---------------- tabela Vendas por produto ---------------- */
function renderProdTable(id, salesSet){
  const mainCount=salesSet.reduce((s,r)=>s+r.main,0);
  const byProd={}; salesSet.forEach(r=>{ if(isMainProd(r.prod)) return; byProd[r.prod]=(byProd[r.prod]||0)+1; });
  const rows=[{k:'__main__', cells:{prod:MAIN_PRODUCT, vendas:mainCount, pctm:1}}];
  Object.entries(byProd).sort((a,b)=>b[1]-a[1]).forEach(([prod,c])=>{
    rows.push({k:prod, cells:{prod:prod, vendas:c, pctm:mainCount?c/mainCount:null}});
  });
  renderTable({id, cols:[{key:'prod',label:'Produto',type:'dim',big:true},{key:'vendas',label:'Vendas',type:'int',w:80},{key:'pctm',label:'% vs principal',type:'pct',w:120}], rows});
}

/* ---------------- funil + gráficos de conversão (comuns às 2 abas) ---------------- */
/* ---- comparativo período atual vs período anterior de MESMO tamanho ---- */
function prevWindow(){
  if(!STATE.from||!STATE.to) return null;
  const span=Math.round((new Date(STATE.to+'T00:00:00')-new Date(STATE.from+'T00:00:00'))/86400000)+1;
  if(!(span>=1)) return null;
  return {from:addDays(STATE.from,-span), to:addDays(STATE.from,-1), span};
}
const inRange=(d,a,b)=>d&&d>=a&&d<=b;
/* métricas em que MENOR é melhor (custo); nas demais, maior é melhor */
const GOOD_LOW={gasto:1,cpm:1,cpc:1,cpv:1,cpic:1,cac:1};
function deltaBadge(cur,prev,key){
  if(cur==null||prev==null||!isFinite(cur)||!isFinite(prev)||prev===0) return '';
  const p=((cur-prev)/Math.abs(prev))*100; if(!isFinite(p)) return '';
  const flat=Math.abs(p)<0.05, up=cur>prev;
  const good=flat?null:(GOOD_LOW[key]?!up:up);
  const cls=flat?'flat':(good?'good':'bad'), arrow=flat?'→':(up?'▲':'▼');
  return `<span class="delta ${cls}">${arrow} ${nf1.format(Math.abs(p))}%</span>`;
}
function renderFunnel(id, steps){
  document.getElementById(id).innerHTML=steps.map(s=>{
    const color=s[4]?`var(${s[4]})`:'var(--accent-blue)';
    const hi=(s[3]==='gasto'||s[3]==='fat');   // valores em destaque + contorno inteiro
    const border=hi?`border-color:${color}`:`border-left-color:${color}`;
    const secs=s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val${x[2]?' s-pill '+x[2]:''}">${x[1]}</span></div>`).join('');
    return `<div class="step" style="${border}">
      <div class="step-main"><div class="m-label">${s[0]}</div>
        <div class="m-val"${hi?` style="color:${color}"`:''}>${s[1]}</div>
        ${s[5]?`<div class="m-delta">${s[5]}</div>`:''}</div>
      <div class="secs">${secs}</div></div>`;
  }).join('');
}
function funnelSteps(t, tp){
  const d=derive(t), P=(k)=>tp?tp[k]:null, Pd=tp?derive(tp):null;
  return [
    ['Gasto Total', brl(d.gasto), [], 'gasto', '--heat-gasto', deltaBadge(d.gasto, Pd?Pd.gasto:null, 'gasto')],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]], 'impr', '--c6', deltaBadge(t.im, P('im'), 'im')],
    ['Cliques', intf(t.cl), [['CPC',brl(d.cpc)],['CTR',pct(d.ctr)]], 'cl', '--c1', deltaBadge(t.cl, P('cl'), 'cl')],
    ['Page Views', intf(t.pv), [['CPV',brl(d.cpv)],['CR',pct(d.cr)]], 'pv', '--c4', deltaBadge(t.pv, P('pv'), 'pv')],
    ['Checkouts', intf(t.ck), [['CPIC',brl(d.cpic)],['VisCHK',pct(d.vischk)]], 'ck', '--c3', deltaBadge(t.ck, P('ck'), 'ck')],
    ['Vendas', intf(t.vendas), [['CAC',brl(d.cac),'cac'],['ConvCHK',pct(d.convchk)]], 'vendas', '--c7', deltaBadge(t.vendas, P('vendas'), 'vendas')],
    ['Faturamento', brl(t.fat), [['ROAS',roasf(d.roas),'roas'],['Ticket Médio',brl(d.ticket)]], 'fat', '--heat-fat', deltaBadge(t.fat, P('fat'), 'fat')],
  ];
}
function convCharts(id1,id2,id3,dd){
  multiLine(id1, dd, [{label:'CPM',fn:x=>x.im?+((x.sp*taxf())/x.im*1000).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'L'},
     {label:'CTR',fn:x=>x.im?+(x.cl/x.im).toFixed(4):null,color:cvar('--chart-ctr'),fmt:'pct',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'pct'}});
  multiLine(id2, dd, [{label:'CR',fn:x=>x.cl?+(x.pv/x.cl).toFixed(4):null,color:cvar('--chart-cr'),fmt:'pct',axis:'L'},
     {label:'VisCHK',fn:x=>x.pv?+(x.ck/x.pv).toFixed(4):null,color:cvar('--chart-vischk'),fmt:'pct',axis:'L'}], {L:{fmt:'pct'}});
  multiLine(id3, dd, [{label:'ConvLP',fn:x=>x.pv?+(x.vendasM/x.pv).toFixed(4):null,color:cvar('--chart-convlp'),fmt:'pct',axis:'L'},
     {label:'ConvCHK',fn:x=>x.ck?+(x.vendasM/x.ck).toFixed(4):null,color:cvar('--chart-vischk'),fmt:'pct',axis:'L'}], {L:{fmt:'pct'}});
}

/* ---------------- PAGE 3: IA Insights ---------------- */
const r2=v=>(v==null||!isFinite(v))?null:Math.round(v*100)/100;
const r4=v=>(v==null||!isFinite(v))?null:Math.round(v*10000)/10000;
const esc=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function iaMetricRow(x,d){
  return {gasto:r2(d.gasto),impressoes:x.im,cpm:r2(d.cpm),cliques:x.cl,cpc:r2(d.cpc),ctr:r4(d.ctr),
    page_views:x.pv,cpv:r2(d.cpv),cr:r4(d.cr),checkouts:x.ck,cpic:r2(d.cpic),vischk:r4(d.vischk),
    convlp:r4(d.convlp),vendas:x.vendas,cac:r2(d.cac),convchk:r4(d.convchk),
    faturamento:r2(x.fat),roas:r2(d.roas),ticket:r2(d.ticket)};
}
/* janela própria da IA — independente do filtro de período das outras abas */
const IA_WINDOWS=[['3d',3,'3 dias'],['7d',7,'7 dias'],['14d',14,'14 dias'],['30d',30,'30 dias']];
function iaWinDays(){ const w=IA_WINDOWS.find(x=>x[0]===STATE.iaWin); return w?w[1]:14; }
function iaRenderWin(){
  document.getElementById('iaWin').innerHTML=IA_WINDOWS.map(w=>
    `<button class="chip ${STATE.iaWin===w[0]?'active':''}" data-w="${w[0]}">${w[2]}</button>`).join('');
  document.querySelectorAll('#iaWin .chip').forEach(c=>c.addEventListener('click',()=>{
    STATE.iaWin=c.dataset.w; localStorage.setItem('ia_win',STATE.iaWin); iaRenderWin();
  }));
}
function iaSumBuckets(arr){ const a=newBucket(); arr.forEach(x=>{a.sp+=x.sp;a.im+=x.im;a.cl+=x.cl;a.pv+=x.pv;a.ck+=x.ck;a.vendas+=x.vendas;a.vendasM+=x.vendasM;a.fat+=x.fat;}); return a; }
function iaPctDelta(a,b){ return (a==null||b==null||!isFinite(a)||!isFinite(b)||b===0)?null:+(((a-b)/b)*100).toFixed(1); }
function iaCmp(dR,dP,k){ return {recente:r2(dR[k]), anterior:r2(dP[k]), variacao_pct:iaPctDelta(dR[k],dP[k])}; }
function iaBuildData(){
  const winDays=iaWinDays(), from=addDays(TODAY,-(winDays-1)), to=TODAY;
  const inWin=d=>d && d>=from && d<=to;
  const fM=META.filter(m=>inWin(m.d)), fSall=SALES.filter(s=>inWin(s.d)), fSmeta=fSall.filter(s=>s.meta);
  const t=totals(fSall,fM), tm=totals(fSmeta,fM);
  const byProd={}; fSmeta.forEach(s=>{byProd[s.prod]=(byProd[s.prod]||0)+1;});

  /* --- séries diárias e janelas de tendência (escopo Meta) --- */
  const dd=daily(fSmeta,fM);                              // buckets diários (asc)
  const serie=dd.slice(-90).map(x=>{const dv=derive(x); return {d:x.d, gasto:r2(dv.gasto), cpm:r2(dv.cpm),
    ctr:r4(dv.ctr), cr:r4(dv.cr), vischk:r4(dv.vischk), convchk:r4(dv.convchk),
    vendas:x.vendas, cac:r2(dv.cac), fat:r2(x.fat), roas:r2(dv.roas)};});
  const days=dd.map(x=>x.d), n=days.length, half=Math.max(1,Math.floor(n/2));
  let comparativo=null, recentSet=null, prevSet=null;
  if(n>=2){
    recentSet=new Set(days.slice(n-half));
    prevSet=new Set(days.slice(Math.max(0,n-2*half), n-half));
    const R=iaSumBuckets(dd.filter(x=>recentSet.has(x.d))), P=iaSumBuckets(dd.filter(x=>prevSet.has(x.d)));
    const dR=derive(R), dP=derive(P);
    comparativo={
      dias_por_janela:half,
      janela_recente:{de:days[n-half], ate:days[n-1]},
      janela_anterior:prevSet.size?{de:days[Math.max(0,n-2*half)], ate:days[n-half-1]}:null,
      cpm:iaCmp(dR,dP,'cpm'), ctr:iaCmp(dR,dP,'ctr'), cr:iaCmp(dR,dP,'cr'),
      vischk:iaCmp(dR,dP,'vischk'), convchk:iaCmp(dR,dP,'convchk'),
      cac:iaCmp(dR,dP,'cac'), roas:iaCmp(dR,dP,'roas'), gasto:iaCmp(dR,dP,'gasto'),
      vendas:{recente:R.vendas, anterior:P.vendas, variacao_pct:iaPctDelta(R.vendas,P.vendas)},
    };
  }
  /* top estruturas + tendência recente vs anterior */
  function topTrend(dim,lim){
    const map=buildAgg(fSmeta,fM,dim);
    const aggR = recentSet ? buildAgg(fSmeta.filter(r=>recentSet.has(r.d)), fM.filter(r=>recentSet.has(r.d)), dim) : {};
    const aggP = prevSet   ? buildAgg(fSmeta.filter(r=>prevSet.has(r.d)),   fM.filter(r=>prevSet.has(r.d)),   dim) : {};
    return Object.entries(map).sort((a,b)=>b[1].sp-a[1].sp).slice(0,lim).map(([nome,a])=>{
      const row=Object.assign({nome}, iaMetricRow(a,derive(a)));
      if(comparativo){
        const dvR=aggR[nome]?derive(aggR[nome]):null, dvP=aggP[nome]?derive(aggP[nome]):null;
        row.tendencia={
          cac_recente:dvR?r2(dvR.cac):null, cac_anterior:dvP?r2(dvP.cac):null,
          roas_recente:dvR?r2(dvR.roas):null, roas_anterior:dvP?r2(dvP.roas):null,
          gasto_recente:dvR?r2(dvR.gasto):null, gasto_anterior:dvP?r2(dvP.gasto):null };
      }
      return row;
    });
  }

  return {
    periodo:{de:from,ate:to,janela_ia:STATE.iaWin,dias_no_periodo:n},
    imposto_meta_aplicado: STATE.tax,
    obs:"Taxas em fração 0-1. cr=PageViews/Cliques; vischk=Checkouts/PageViews; convlp=Vendas/PageViews; convchk=Vendas/Checkouts. total_todas_vendas inclui vendas orgânicas; conversões e estruturas consideram apenas Meta Ads. Produto principal = "+MAIN_PRODUCT+". comparativo_periodo compara a janela recente vs a anterior (mesmo nº de dias) — use para detectar SATURAÇÃO/fadiga (ex.: CPM subindo + CTR/ROAS caindo). serie_diaria = evolução dia a dia. variacao_pct = variação % recente vs anterior. Cada estrutura traz 'tendencia' (recente vs anterior).",
    total_todas_vendas: iaMetricRow(t,derive(t)),
    total_meta_ads: iaMetricRow(tm,derive(tm)),
    comparativo_periodo: comparativo,
    serie_diaria: serie,
    campanhas: topTrend('camp',10),
    conjuntos: topTrend('adset',10),
    anuncios: topTrend('ad',15),
    vendas_por_produto: Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([produto,vendas])=>({produto,vendas})),
  };
}
function iaBackendUrl(){ return iaNormUrl(localStorage.getItem('ia_backend')||B.ia_worker_url||''); }
function iaStatusText(){
  const b=iaBackendUrl(), p=localStorage.getItem('ia_pass');
  document.getElementById('iaStatus').textContent = b ? '' : 'backend não configurado — clique em Configurar';
  document.getElementById('iaGen').disabled = !(b&&p);
}
function iaShow(html){ document.getElementById('iaCards').innerHTML=html; }
function iaFmtDate(ts){ try{ return new Date(ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } }
function iaRenderCards(insights,usage,at,from,to){
  if(!insights.length){ iaShow('<div class="ia-empty">A IA não retornou insights.</div>'); return; }
  const stamp = at ? `<div class="ia-empty" style="grid-column:1/-1;text-align:left">Gerado em ${iaFmtDate(at)}${from&&to?` · janela ${esc(from)} a ${esc(to)}`:''}</div>` : '';
  const sev=s=>['alta','media','baixa'].includes(String(s))?s:'baixa';
  const cards=insights.map(i=>{
    const s=sev(i.severidade); let verba='';
    if(i.verba && i.verba.acao && i.verba.acao!=='manter'){
      const v=i.verba, pct=(v.percentual!=null?(' '+Math.abs(v.percentual)+'%'):'');
      verba=`<div class="ins-verba">💰 <b>Verba:</b> ${esc(v.acao)}${pct} ${v.nivel_ajuste?('no '+esc(v.nivel_ajuste)):''}${v.observacao?(' — '+esc(v.observacao)):''}<span class="ins-apply">Peça no chat para eu aplicar no Meta Ads.</span></div>`;
    }
    return `<div class="ins-card sev-${s}">
      <div class="ins-head"><span class="ins-badge">${esc(i.nivel||'funil')} · ${esc(i.metrica||'')}</span><span class="ins-sev">${esc(s)}</span></div>
      <div class="ins-title">${esc(i.titulo||'')}</div>
      <div class="ins-diag">${esc(i.diagnostico||'')}</div>
      <div class="ins-rec"><b>Ação:</b> ${esc(i.recomendacao||'')}</div>
      ${i.estrutura?`<div class="ins-struct">Estrutura: ${esc(i.estrutura)}</div>`:''}
      ${verba}
    </div>`;
  }).join('');
  const u = usage ? `<div class="ia-empty" style="grid-column:1/-1">Tokens: entrada ${usage.input_tokens||'?'} · saída ${usage.output_tokens||'?'}</div>` : '';
  iaShow(stamp+cards+u);
}
function iaNormUrl(u){ u=(u||'').trim(); if(u && !/^https?:\/\//i.test(u)) u='https://'+u; return u; }
async function iaGenerate(){
  const backend=iaBackendUrl(), pass=localStorage.getItem('ia_pass');
  if(!backend||!pass){ document.getElementById('iaConfig').style.display='block'; return; }
  const btn=document.getElementById('iaGen'); btn.classList.add('loading'); btn.disabled=true;
  iaShow('<div class="ia-empty">Gerando insights com a IA… (pode levar alguns segundos)</div>');
  try{
    const res=await fetch(backend,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass,data:iaBuildData()})});
    const txt=await res.text(); let j=null; try{ j=JSON.parse(txt); }catch{}
    if(!j){ iaShow('<div class="ins-card err"><div class="ins-title">Resposta inválida do backend</div><div class="ins-diag">HTTP '+res.status+'. A URL do Worker pode estar errada ou o Worker não está publicado. Abra a URL no navegador: deve mostrar <code>{"error":"Use GET ou POST."}</code>.</div><div class="ins-struct">'+esc(txt.slice(0,200))+'</div></div>'); return; }
    if(!res.ok || j.error){
      const extra=[]; if(j.detail) extra.push(String(j.detail)); if(j.stop_reason) extra.push('stop_reason='+j.stop_reason); if(j.raw) extra.push('Resposta do modelo: '+String(j.raw));
      iaShow('<div class="ins-card err"><div class="ins-title">Erro</div><div class="ins-diag">'+esc(j.error||('HTTP '+res.status))+'</div>'+(extra.length?('<div class="ins-struct" style="white-space:pre-wrap">'+esc(extra.join('\n').slice(0,1200))+'</div>'):'')+'</div>');
    }
    else {
      iaRenderCards(j.insights||[], j.usage, j.at||Date.now(), j.from, j.to);
    }
  }catch(e){ iaShow('<div class="ins-card err"><div class="ins-title">Falha de rede</div><div class="ins-diag">'+esc(e.message)+' — a URL deve começar com https:// e terminar em .workers.dev, e o Worker precisa estar publicado (CORS).</div></div>'); }
  finally{ btn.classList.remove('loading'); btn.disabled=false; }
}
async function iaLoadLatest(){
  const backend=iaBackendUrl();
  if(!backend){ iaShow('<div class="ia-empty">Configure o backend e clique em <b>Gerar insights</b>.</div>'); return; }
  iaShow('<div class="ia-empty">Carregando insights…</div>');
  try{
    const res=await fetch(backend,{method:'GET'});
    const j=await res.json().catch(()=>null);
    if(j && Array.isArray(j.insights) && j.insights.length){ iaRenderCards(j.insights, j.usage, j.at, j.from, j.to); }
    else { iaShow('<div class="ia-empty">Nenhum insight gerado ainda. Clique em <b>Gerar insights</b>.</div>'); }
  }catch(e){ iaShow('<div class="ia-empty">Não foi possível carregar os insights agora. Clique em <b>Gerar insights</b>.</div>'); }
}
function renderIA(){ iaStatusText(); iaRenderWin(); iaLoadLatest(); }

/* ---------------- PAGE: Lançamento de captação (Black Friday) ----------------
   Dados próprios (DATA.bf): Meta Ads do Adveronix + leads da página de captura.
   bucket BF = {sp,im,cl,pv,lp, lm, lt}
     lp = leads do pixel (gerenciador) · lm = leads da planilha atribuídos ao Meta
     lt = todos os leads da planilha (qualquer origem)
   Se a planilha de leads não estiver acessível, "Leads" usa o pixel. */
const BF = DATA.bf || null;
/* aba BF = só campanhas com a sigla do lançamento; Visão Geral = todas (CAP_META) */
const CAP_META = BF ? BF.meta : [];
const BF_META = CAP_META.filter(m=>m.bf!==0), BF_LEADS = BF ? BF.leads : [];
const BF_HAS_LEADS = !!(BF && BF.info && BF.info.leads_ok);
const BF_UNKNOWN = '(Meta — não identificado)';
const bfMetaActive  = ()=> BF_META.filter(m=>dateActive(m.d));
const bfLeadsActive = ()=> BF_LEADS.filter(l=>dateActive(l.d));
function bfBucket(){ return {sp:0,im:0,cl:0,pv:0,lp:0,lm:0,lt:0}; }
function bfAddM(a,r){ a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; a.pv+=r.pv; a.lp+=r.lp; }
function bfAddL(a,r){ a.lt+=1; if(r.meta) a.lm+=1; }
/* "Leads" exibidos: planilha atribuída ao Meta (ou pixel, se não houver planilha) */
const bfLeadsOf = a => BF_HAS_LEADS ? a.lm : a.lp;
function bfDerive(a){ const g=a.sp*taxf(), L=bfLeadsOf(a);
  return {gasto:g, leads:L, cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    cpv:a.pv?g/a.pv:null, cr:a.cl?a.pv/a.cl:null, cpl:L?g/L:null, conv:a.pv?L/a.pv:null,
    cplp:a.lp?g/a.lp:null}; }
function bfTotals(fM,fL){ const a=bfBucket(); fM.forEach(r=>bfAddM(a,r)); fL.forEach(r=>bfAddL(a,r)); return a; }
function bfDaily(fM,fL){ const days={}; const g=d=>days[d]||(days[d]=Object.assign({d},bfBucket()));
  fM.forEach(r=>{ if(r.d) bfAddM(g(r.d),r); }); fL.forEach(r=>{ if(r.d) bfAddL(g(r.d),r); });
  return Object.values(days).sort((a,b)=>a.d<b.d?-1:1); }
function bfAgg(fM,fL,dim){ const m={}; const g=k=>m[k]||(m[k]=bfBucket());
  fM.forEach(r=>bfAddM(g(r[dim]),r)); fL.forEach(r=>{ if(r.meta) bfAddL(g(r[dim]),r); }); return m; }

const BF_METRIC_COLS=[
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},
  {key:'impr',label:'Impressões',type:'int'},
  {key:'cpm',label:'CPM',type:'brl'},
  {key:'cliques',label:'Cliques',type:'int'},
  {key:'cpc',label:'CPC',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},
  {key:'pv',label:'Page Views',type:'int'},
  {key:'cr',label:'CR',type:'pct'},
  {key:'leads',label:'Leads',type:'int',heat:'fat'},
  {key:'cpl',label:'CPL',type:'brl'},
  {key:'conv',label:'Conv. página',type:'pct'},
  {key:'lp',label:'Leads pixel',type:'int'},
];
function bfCells(a,d){ return {gasto:d.gasto, impr:a.im, cpm:d.cpm, cliques:a.cl, cpc:d.cpc, ctr:d.ctr,
  pv:a.pv, cr:d.cr, leads:d.leads, cpl:d.cpl, conv:d.conv, lp:a.lp}; }
const BF_DAILY_COLS=[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:64}].concat(BF_METRIC_COLS);
const BF_HCOLS=[{key:'dim',label:'',type:'dim',big:true}].concat(BF_METRIC_COLS.map(c=>{const o={...c}; delete o.heat; return o;}));

/* cor do CPL vs meta (verde ≤ meta · amarelo até +30% · vermelho acima) */
function bfCplCls(v){ const t=BF&&BF.cpl_target; if(!t||v==null||!isFinite(v)) return '';
  return v<=t?'rc-green':(v<=t*1.3?'rc-yellow':'rc-red'); }

function bfFunnelSteps(t,tp){ const d=bfDerive(t), Pd=tp?bfDerive(tp):null, P=k=>tp?tp[k]:null;
  return [
    ['Gasto Total', brl(d.gasto), [], 'gasto', '--heat-gasto', deltaBadge(d.gasto, Pd?Pd.gasto:null, 'gasto')],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]], 'impr', '--c6', deltaBadge(t.im, P('im'), 'im')],
    ['Cliques', intf(t.cl), [['CPC',brl(d.cpc)],['CTR',pct(d.ctr)]], 'cl', '--c1', deltaBadge(t.cl, P('cl'), 'cl')],
    ['Page Views', intf(t.pv), [['CPV',brl(d.cpv)],['CR',pct(d.cr)]], 'pv', '--c4', deltaBadge(t.pv, P('pv'), 'pv')],
    ['Leads', intf(d.leads), [['CPL',brl(d.cpl),bfCplCls(d.cpl)],['Conv. página',pct(d.conv)]], 'fat', '--heat-fat', deltaBadge(d.leads, Pd?Pd.leads:null, 'leads')],
  ]; }

function bfCombo(id, dd){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const mut=cmuted(), gr=cgrid();
  charts[id]=new Chart(el,{
    data:{labels:dd.map(x=>x.d.slice(5)), datasets:[
      {type:'bar',label:'Leads',data:dd.map(x=>bfLeadsOf(x)),backgroundColor:cvar('--chart-vendas'),yAxisID:'y',borderRadius:3,order:3},
      {type:'line',label:'Gasto',data:dd.map(x=>+(x.sp*taxf()).toFixed(2)),borderColor:cvar('--chart-gasto'),backgroundColor:cvar('--chart-gasto'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:2},
      {type:'line',label:'CPL',data:dd.map(x=>{const L=bfLeadsOf(x);return L?+((x.sp*taxf())/L).toFixed(2):null;}),borderColor:cink(),backgroundColor:cink(),yAxisID:'y2',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y'?intf(c.raw):brl(c.raw))}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{color:gr},title:{display:true,text:'Leads',color:mut,font:{size:10}}},
        y1:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{display:false},title:{display:true,text:'Gasto R$',color:mut,font:{size:10}}},
        y2:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10},callback:v=>brl(v)},grid:{display:false},title:{display:true,text:'CPL',color:mut,font:{size:10}}}}}});
}
/* CPL por dia, 1 linha por item da dimensão (top 6 por gasto) */
function bfCplDimChart(id, fM, fL, dim){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const spT={}; fM.forEach(r=>spT[r[dim]]=(spT[r[dim]]||0)+r.sp);
  const items=Object.keys(spT).sort((a,b)=>spT[b]-spT[a]).slice(0,6);
  const ds=new Set(); fM.forEach(r=>r.d&&ds.add(r.d)); const days=[...ds].sort();
  const K=(c,d)=>c+'\u0001'+d, sp={}, ld={};
  fM.forEach(r=>{ if(!r.d) return; sp[K(r[dim],r.d)]=(sp[K(r[dim],r.d)]||0)+r.sp;
    if(!BF_HAS_LEADS) ld[K(r[dim],r.d)]=(ld[K(r[dim],r.d)]||0)+r.lp; });
  if(BF_HAS_LEADS) fL.forEach(r=>{ if(!r.d||!r.meta) return; ld[K(r[dim],r.d)]=(ld[K(r[dim],r.d)]||0)+1; });
  const PAL=chartPalette();
  const sets=items.map((c,i)=>({label:c.length>22?c.slice(0,22)+'…':c,
    data:days.map(d=>{const s=(sp[K(c,d)]||0)*taxf(), v=ld[K(c,d)]||0; return v?+(s/v).toFixed(2):null;}),
    borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],borderWidth:2,pointRadius:1.5,spanGaps:true,tension:.25}));
  const mut=cmuted();
  charts[id]=new Chart(el,{type:'line',data:{labels:days.map(x=>x.slice(5)),datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:8,font:{size:9}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{ticks:{color:mut,font:{size:9},maxRotation:0,autoSkip:true,autoSkipPadding:8},grid:{display:false}},
              y:{beginAtZero:true,ticks:{color:mut,font:{size:9},callback:v=>brl(v)},grid:{color:cgrid()}}}}});
}
/* drill-down Campanha → Conjunto → Anúncio (mesma regra da aba Meta Ads) */
STATE.bSelC=new Set(); STATE.bSelA=new Set(); STATE.bSelAd=new Set();
function bfScope(ex){ let fM=bfMetaActive(), fL=bfLeadsActive().filter(l=>l.meta);
  const f=(set,k)=>{ fM=fM.filter(r=>set.has(r[k])); fL=fL.filter(r=>set.has(r[k])); };
  if(ex!=='C'&&STATE.bSelC.size) f(STATE.bSelC,'camp');
  if(ex!=='A'&&STATE.bSelA.size) f(STATE.bSelA,'adset');
  if(ex!=='D'&&STATE.bSelAd.size) f(STATE.bSelAd,'ad');
  return {fM,fL}; }
function bfSelDim(dim,key,ctrl){
  const sets={C:STATE.bSelC,A:STATE.bSelA,D:STATE.bSelAd}, s=sets[dim];
  const order=['C','A','D'], lower=order.slice(order.indexOf(dim)+1);
  if(ctrl){ s.has(key)?s.delete(key):s.add(key); }
  else { const sole=s.has(key)&&s.size===1&&!lower.some(k=>sets[k].size);
    s.clear(); lower.forEach(k=>sets[k].clear()); if(!sole) s.add(key); }
  renderBF();
}
function renderBF(){
  if(!BF) return;
  const fM=bfMetaActive(), fLall=bfLeadsActive();
  const S=bfScope(null), t=bfTotals(S.fM, BF_HAS_LEADS?fLall.filter(l=>l.meta):[]);
  /* lt (todas as origens) independe do drill de campanha */
  t.lt=fLall.length;
  const d=bfDerive(t);
  const pw=prevWindow();
  const tp=pw?bfTotals(BF_META.filter(m=>inRange(m.d,pw.from,pw.to)), BF_LEADS.filter(l=>l.meta&&inRange(l.d,pw.from,pw.to))):null;

  /* aviso quando a planilha de leads não está acessível / sem dados no período */
  const al=document.getElementById('bfAlert');
  if(!BF_HAS_LEADS){ al.hidden=false; al.innerHTML='⚠️ A planilha de <b>Leads</b> não está acessível (compartilhe como <b>“Qualquer pessoa com o link pode ver”</b>). Enquanto isso, “Leads” usa o evento <b>Lead do pixel</b> do gerenciador.'; }
  else if(!BF_META.length){ al.hidden=false; al.textContent='⚠️ A planilha do Meta Ads (Adveronix) não retornou linhas.'; }
  else al.hidden=true;

  const unk=fLall.filter(l=>l.meta&&l.camp===BF_UNKNOWN).length;
  const metaShare=t.lt?(fLall.filter(l=>l.meta).length/t.lt):null;
  document.getElementById('bfKpis').innerHTML=[
    {label:'Gasto',val:brl(d.gasto),aux:'Meta Ads'+(STATE.tax?' · c/ imposto':'')},
    {label:'Leads (Meta)',val:intf(d.leads),aux:BF_HAS_LEADS?'planilha de captura · UTMs':'evento Lead do pixel',hero:true},
    {label:'CPL',val:`<span class="${bfCplCls(d.cpl)}">${brl(d.cpl)}</span>`,aux:BF&&BF.cpl_target?'meta '+brl(BF.cpl_target):'Gasto ÷ Leads'},
    {label:'Leads totais',val:BF_HAS_LEADS?intf(t.lt):'-',aux:BF_HAS_LEADS?('Meta = '+pct(metaShare)+' do total'):'sem planilha de leads'},
    {label:'Leads pixel',val:intf(t.lp),aux:'CPL pixel '+brl(d.cplp)},
    {label:'Conv. página',val:pct(d.conv),aux:'Leads ÷ Page Views'},
    {label:'CTR',val:pct(d.ctr),aux:'CPC '+brl(d.cpc)},
    {label:'CPM',val:brl(d.cpm),aux:intf(t.im)+' impressões'},
  ].map(kpiCard).join('') + (unk?`<p class="note" style="grid-column:1/-1">${unk} lead(s) do Meta com UTM quebrada (ex.: <code>{{ad.name}}</code>) contam como “${BF_UNKNOWN}”.</p>`:'');

  renderFunnel('bfFunnel', bfFunnelSteps(t,tp));
  const dd=bfDaily(S.fM, BF_HAS_LEADS?S.fL:[]);
  bfCombo('bfCombo', dd);
  const dl=dd.slice().reverse();
  renderTable({id:'bfDaily', cols:BF_DAILY_COLS,
    rows:dl.map(x=>({k:x.d, cells:Object.assign({date:x.d, wd:weekday(x.d)}, bfCells(x,bfDerive(x)))})),
    total:Object.assign({date:null, wd:''}, bfCells(t,d)),
    selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); }});

  multiLine('bfCpmCtr', dd, [{label:'CPM',fn:x=>x.im?+((x.sp*taxf())/x.im*1000).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'L'},
    {label:'CTR',fn:x=>x.im?+(x.cl/x.im).toFixed(4):null,color:cvar('--chart-ctr'),fmt:'pct',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'pct'}});
  multiLine('bfCrConv', dd, [{label:'CR',fn:x=>x.cl?+(x.pv/x.cl).toFixed(4):null,color:cvar('--chart-cr'),fmt:'pct',axis:'L'},
    {label:'Conv. página',fn:x=>x.pv?+(bfLeadsOf(x)/x.pv).toFixed(4):null,color:cvar('--chart-convlp'),fmt:'pct',axis:'L'}], {L:{fmt:'pct'}});
  multiLine('bfCpl', dd, [{label:'CPL',fn:x=>{const L=bfLeadsOf(x);return L?+((x.sp*taxf())/L).toFixed(2):null;},color:cink(),fmt:'brl',axis:'L'},
    {label:'CPC',fn:x=>x.cl?+((x.sp*taxf())/x.cl).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'brl'}});
  const adAgg=bfAgg(S.fM, BF_HAS_LEADS?S.fL:[], 'ad');
  hbar('bfAdBar', Object.entries(adAgg).map(([label,a])=>({label,v:bfLeadsOf(a)})), x=>x.v, cvar('--chart-faturamento'), 10, intf);

  /* origem dos leads (todas as origens, sem o drill de campanha) */
  const bySrc={}; fLall.forEach(l=>{ const k=l.meta?'Meta Ads':l.src; bySrc[k]=(bySrc[k]||0)+1; });
  hbar('bfSrcBar', Object.entries(bySrc).map(([label,v])=>({label,v})), x=>x.v, cvar('--chart-vendas'), 10, intf);
  const sd={}; fLall.forEach(l=>{ if(!l.d) return; const r=sd[l.d]||(sd[l.d]={d:l.d,meta:0,outros:0,tot:0}); r.tot++; l.meta?r.meta++:r.outros++; });
  const sdr=Object.values(sd).sort((a,b)=>a.d<b.d?1:-1);
  renderTable({id:'bfSrcDaily', cols:[{key:'date',label:'Data',type:'date'},{key:'meta',label:'Meta Ads',type:'int'},{key:'outros',label:'Outras origens',type:'int'},{key:'tot',label:'Total',type:'int'},{key:'sh',label:'% Meta',type:'pct'}],
    rows:sdr.map(r=>({k:r.d, cells:{date:r.d, meta:r.meta, outros:r.outros, tot:r.tot, sh:r.tot?r.meta/r.tot:null}})),
    total:{date:null, meta:sdr.reduce((s,r)=>s+r.meta,0), outros:sdr.reduce((s,r)=>s+r.outros,0), tot:sdr.reduce((s,r)=>s+r.tot,0),
      sh:(()=>{const T=sdr.reduce((s,r)=>s+r.tot,0);return T?sdr.reduce((s,r)=>s+r.meta,0)/T:null;})()}});

  /* tabelas de otimização com drill-down */
  const rowsOf=m=>Object.entries(m).map(([k,a])=>({k, cells:Object.assign({dim:k}, bfCells(a,bfDerive(a)))}));
  const totOf=(fM2,fL2)=>{const a=bfTotals(fM2,fL2); return Object.assign({dim:null}, bfCells(a,bfDerive(a)));};
  const Sc=bfScope('C'), Sa=bfScope('A'), Sd=bfScope('D');
  const LL=x=>BF_HAS_LEADS?x:[];
  renderTable({id:'bfCamp', cols:BF_HCOLS.map((c,i)=>i===0?{...c,label:'Campanha'}:c), rows:rowsOf(bfAgg(Sc.fM,LL(Sc.fL),'camp')), total:totOf(Sc.fM,LL(Sc.fL)),
    selectable:true, selSet:STATE.bSelC, onSelect:(k,e)=>bfSelDim('C',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'bfAdset', cols:BF_HCOLS.map((c,i)=>i===0?{...c,label:'Conjunto',big:true}:c), rows:rowsOf(bfAgg(Sa.fM,LL(Sa.fL),'adset')), total:totOf(Sa.fM,LL(Sa.fL)),
    selectable:true, selSet:STATE.bSelA, onSelect:(k,e)=>bfSelDim('A',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'bfAd', cols:BF_HCOLS.map((c,i)=>i===0?{...c,label:'Anúncio'}:c), rows:rowsOf(bfAgg(Sd.fM,LL(Sd.fL),'ad')), total:totOf(Sd.fM,LL(Sd.fL)),
    selectable:true, selSet:STATE.bSelAd, onSelect:(k,e)=>bfSelDim('D',k,e&&(e.ctrlKey||e.metaKey))});
  bfCplDimChart('bfChCamp', Sc.fM, Sc.fL, 'camp');
  bfCplDimChart('bfChAdset', Sa.fM, Sa.fL, 'adset');
  bfCplDimChart('bfChAd', Sd.fM, Sd.fL, 'ad');
}

/* ---------------- PAGE: Seguidores IG ----------------
   DATA.bf.seg = linhas do Adveronix das campanhas de seguidores
   bucket = {sp,im,cl,fol} */
const SEG = BF ? (BF.seg||[]) : [];
const SEG_LABEL = (BF&&BF.seg_label)||'Seguidores IG';
const segActive = ()=> SEG.filter(r=>dateActive(r.d));
function segBucket(){ return {sp:0,im:0,cl:0,fol:0}; }
function segAdd(a,r){ a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; a.fol+=r.fol; }
function segDerive(a){ const g=a.sp*taxf();
  return {gasto:g, cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    cps:a.fol?g/a.fol:null, taxa:a.cl?a.fol/a.cl:null, mil:a.im?a.fol/a.im*1000:null}; }
function segTotals(rows){ const a=segBucket(); rows.forEach(r=>segAdd(a,r)); return a; }
function segDaily(rows){ const m={}; rows.forEach(r=>{ if(!r.d) return; segAdd(m[r.d]||(m[r.d]=Object.assign({d:r.d},segBucket())),r); });
  return Object.values(m).sort((a,b)=>a.d<b.d?-1:1); }
function segAgg(rows,dim){ const m={}; rows.forEach(r=>segAdd(m[r[dim]]||(m[r[dim]]=segBucket()),r)); return m; }
const SEG_COLS=[
  {key:'gasto',label:'Gasto',type:'brl',heat:'gasto'},
  {key:'impr',label:'Impressões',type:'int'},
  {key:'cpm',label:'CPM',type:'brl'},
  {key:'cliques',label:'Cliques',type:'int'},
  {key:'cpc',label:'CPC',type:'brl'},
  {key:'ctr',label:'CTR',type:'pct'},
  {key:'fol',label:'Seguidores',type:'int',heat:'fat'},
  {key:'cps',label:'Custo/seguidor',type:'brl'},
  {key:'taxa',label:'Taxa de seguir',type:'pct'},
];
const segCells=(a,d)=>({gasto:d.gasto, impr:a.im, cpm:d.cpm, cliques:a.cl, cpc:d.cpc, ctr:d.ctr, fol:a.fol, cps:d.cps, taxa:d.taxa});
const SEG_DAILY_COLS=[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:64}].concat(SEG_COLS);
const SEG_HCOLS=[{key:'dim',label:'',type:'dim',big:true}].concat(SEG_COLS.map(c=>{const o={...c}; delete o.heat; return o;}));
STATE.sSelC=new Set(); STATE.sSelA=new Set(); STATE.sSelAd=new Set();
function segScope(ex){ let r=segActive();
  if(ex!=='C'&&STATE.sSelC.size) r=r.filter(x=>STATE.sSelC.has(x.camp));
  if(ex!=='A'&&STATE.sSelA.size) r=r.filter(x=>STATE.sSelA.has(x.adset));
  if(ex!=='D'&&STATE.sSelAd.size) r=r.filter(x=>STATE.sSelAd.has(x.ad));
  return r; }
function segSelDim(dim,key,ctrl){
  const sets={C:STATE.sSelC,A:STATE.sSelA,D:STATE.sSelAd}, s=sets[dim];
  const order=['C','A','D'], lower=order.slice(order.indexOf(dim)+1);
  if(ctrl){ s.has(key)?s.delete(key):s.add(key); }
  else { const sole=s.has(key)&&s.size===1&&!lower.some(k=>sets[k].size);
    s.clear(); lower.forEach(k=>sets[k].clear()); if(!sole) s.add(key); }
  renderSeg();
}
/* combo genérico: barras (quantidade) · Gasto · custo por resultado (eixo próprio) */
function resultCombo(id, dd, barLabel, barFn, costLabel){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const mut=cmuted(), gr=cgrid();
  charts[id]=new Chart(el,{
    data:{labels:dd.map(x=>x.d.slice(5)), datasets:[
      {type:'bar',label:barLabel,data:dd.map(barFn),backgroundColor:cvar('--chart-vendas'),yAxisID:'y',borderRadius:3,order:3},
      {type:'line',label:'Gasto',data:dd.map(x=>+(x.sp*taxf()).toFixed(2)),borderColor:cvar('--chart-gasto'),backgroundColor:cvar('--chart-gasto'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:2},
      {type:'line',label:costLabel,data:dd.map(x=>{const n=barFn(x);return n?+((x.sp*taxf())/n).toFixed(2):null;}),borderColor:cink(),backgroundColor:cink(),yAxisID:'y2',borderWidth:2,pointRadius:2,spanGaps:true,tension:.25,order:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y'?intf(c.raw):brl(c.raw))}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{color:gr},title:{display:true,text:barLabel,color:mut,font:{size:10}}},
        y1:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{display:false},title:{display:true,text:'Gasto R$',color:mut,font:{size:10}}},
        y2:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10},callback:v=>brl(v)},grid:{display:false},title:{display:true,text:costLabel,color:mut,font:{size:10}}}}}});
}
/* custo por resultado por dia, 1 linha por item (top 6 por gasto) */
function costDimChart(id, rows, dim, resFn){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const spT={}; rows.forEach(r=>spT[r[dim]]=(spT[r[dim]]||0)+r.sp);
  const items=Object.keys(spT).sort((a,b)=>spT[b]-spT[a]).slice(0,6);
  const days=[...new Set(rows.filter(r=>r.d).map(r=>r.d))].sort();
  const K=(c,d)=>c+'\u0001'+d, sp={}, n={};
  rows.forEach(r=>{ if(!r.d) return; sp[K(r[dim],r.d)]=(sp[K(r[dim],r.d)]||0)+r.sp; n[K(r[dim],r.d)]=(n[K(r[dim],r.d)]||0)+resFn(r); });
  const PAL=chartPalette(), mut=cmuted();
  charts[id]=new Chart(el,{type:'line',data:{labels:days.map(x=>x.slice(5)),datasets:items.map((c,i)=>({label:c.length>22?c.slice(0,22)+'…':c,
    data:days.map(d=>{const v=n[K(c,d)]||0; return v?+(((sp[K(c,d)]||0)*taxf())/v).toFixed(2):null;}),
    borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],borderWidth:2,pointRadius:1.5,spanGaps:true,tension:.25}))},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:8,font:{size:9}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{ticks:{color:mut,font:{size:9},maxRotation:0,autoSkip:true,autoSkipPadding:8},grid:{display:false}},
              y:{beginAtZero:true,ticks:{color:mut,font:{size:9},callback:v=>brl(v)},grid:{color:cgrid()}}}}});
}
function renderSeg(){
  const S=segScope(null), t=segTotals(S), d=segDerive(t);
  const pw=prevWindow(), tp=pw?segTotals(SEG.filter(r=>inRange(r.d,pw.from,pw.to))):null, dp=tp?segDerive(tp):null;
  const al=document.getElementById('segAlert');
  if(!SEG.length){ al.hidden=false; al.textContent='⚠️ A aba de seguidores do Adveronix não retornou linhas.'; } else al.hidden=true;
  document.getElementById('segKpis').innerHTML=[
    {label:'Gasto',val:brl(d.gasto),aux:'campanhas de seguidores'+(STATE.tax?' · c/ imposto':'')},
    {label:'Seguidores',val:intf(t.fol),aux:'ganhos no período',hero:true},
    {label:'Custo por seguidor',val:brl(d.cps),aux:'Gasto ÷ Seguidores'},
    {label:'Taxa de seguir',val:pct(d.taxa),aux:'Seguidores ÷ Cliques'},
    {label:'Seguidores / mil impr.',val:numf(d.mil),aux:intf(t.im)+' impressões'},
    {label:'CPM',val:brl(d.cpm),aux:'custo por mil'},
    {label:'CTR',val:pct(d.ctr),aux:'CPC '+brl(d.cpc)},
  ].map(kpiCard).join('');
  renderFunnel('segFunnel',[
    ['Gasto Total', brl(d.gasto), [], 'gasto', '--heat-gasto', deltaBadge(d.gasto, dp?dp.gasto:null, 'gasto')],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]], 'impr', '--c6', deltaBadge(t.im, tp?tp.im:null, 'im')],
    ['Cliques', intf(t.cl), [['CPC',brl(d.cpc)],['CTR',pct(d.ctr)]], 'cl', '--c1', deltaBadge(t.cl, tp?tp.cl:null, 'cl')],
    ['Seguidores', intf(t.fol), [['Custo/seg.',brl(d.cps)],['Taxa de seguir',pct(d.taxa)]], 'fat', '--heat-fat', deltaBadge(t.fol, tp?tp.fol:null, 'fol')],
  ]);
  const dd=segDaily(S);
  resultCombo('segCombo', dd, 'Seguidores', x=>x.fol, 'Custo/seguidor');
  renderTable({id:'segDaily', cols:SEG_DAILY_COLS,
    rows:dd.slice().reverse().map(x=>({k:x.d, cells:Object.assign({date:x.d, wd:weekday(x.d)}, segCells(x,segDerive(x)))})),
    total:Object.assign({date:null, wd:''}, segCells(t,d)), selectable:true, selSet:STATE.selDays,
    onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); }});
  multiLine('segCpmCtr', dd, [{label:'CPM',fn:x=>x.im?+((x.sp*taxf())/x.im*1000).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'L'},
    {label:'CTR',fn:x=>x.im?+(x.cl/x.im).toFixed(4):null,color:cvar('--chart-ctr'),fmt:'pct',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'pct'}});
  multiLine('segCost', dd, [{label:'Custo/seguidor',fn:x=>x.fol?+((x.sp*taxf())/x.fol).toFixed(2):null,color:cink(),fmt:'brl',axis:'L'},
    {label:'CPC',fn:x=>x.cl?+((x.sp*taxf())/x.cl).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'brl'}});
  multiLine('segRate', dd, [{label:'Taxa de seguir',fn:x=>x.cl?+(x.fol/x.cl).toFixed(4):null,color:cvar('--chart-convlp'),fmt:'pct',axis:'L'}], {L:{fmt:'pct'}});
  hbar('segAdBar', Object.entries(segAgg(S,'ad')).map(([label,a])=>({label:label.length>40?label.slice(0,40)+'…':label,v:a.fol})), x=>x.v, cvar('--chart-faturamento'), 10, intf);
  const rowsOf=m=>Object.entries(m).map(([k,a])=>({k, cells:Object.assign({dim:k}, segCells(a,segDerive(a)))}));
  const totOf=r=>{const a=segTotals(r); return Object.assign({dim:null}, segCells(a,segDerive(a)));};
  const Sc=segScope('C'), Sa=segScope('A'), Sd=segScope('D');
  renderTable({id:'segCamp', cols:SEG_HCOLS.map((c,i)=>i===0?{...c,label:'Campanha'}:c), rows:rowsOf(segAgg(Sc,'camp')), total:totOf(Sc),
    selectable:true, selSet:STATE.sSelC, onSelect:(k,e)=>segSelDim('C',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'segAdset', cols:SEG_HCOLS.map((c,i)=>i===0?{...c,label:'Conjunto',big:true}:c), rows:rowsOf(segAgg(Sa,'adset')), total:totOf(Sa),
    selectable:true, selSet:STATE.sSelA, onSelect:(k,e)=>segSelDim('A',k,e&&(e.ctrlKey||e.metaKey))});
  renderTable({id:'segAd', cols:SEG_HCOLS.map((c,i)=>i===0?{...c,label:'Anúncio'}:c), rows:rowsOf(segAgg(Sd,'ad')), total:totOf(Sd),
    selectable:true, selSet:STATE.sSelAd, onSelect:(k,e)=>segSelDim('D',k,e&&(e.ctrlKey||e.metaKey))});
  costDimChart('segChCamp', Sc, 'camp', r=>r.fol);
  costDimChart('segChAdset', Sa, 'adset', r=>r.fol);
  costDimChart('segChAd', Sd, 'ad', r=>r.fol);
}

/* ---------------- PAGE 1: Visão Geral (todas as campanhas da planilha) ----------------
   Seguidores = aba de seguidores · Captação = aba de captação (todas as campanhas dela)
   Leads = planilha de captura atribuída ao Meta (ou pixel, sem a planilha). */
function renderGeral(){
  const sg=segActive(), cp=CAP_META.filter(m=>dateActive(m.d)), ld=bfLeadsActive().filter(l=>l.meta);
  const ts=segTotals(sg), ds=segDerive(ts);
  const tc=bfTotals(cp, BF_HAS_LEADS?ld:[]), dc=bfDerive(tc);
  /* histórico de vendas SS-OUT26 (planilhas antigas): gasto do Meta + vendas atribuídas ao Meta */
  const om=metaActive(), os_=salesActive().filter(x=>x.meta);
  const to=totals(os_, om), dov=derive(to);
  const gTot=ds.gasto+dc.gasto+dov.gasto, imTot=ts.im+tc.im+to.im, clTot=ts.cl+tc.cl+to.cl;
  const cpmT=imTot?gTot/imTot*1000:null, ctrT=imTot?clTot/imTot:null, cpcT=clTot?gTot/clTot:null;
  document.getElementById('gKpis').innerHTML=[
    {label:'Gasto total',val:brl(gTot),aux:'todas as campanhas'+(STATE.tax?' · c/ imposto':''),hero:true},
    {label:'Seguidores ganhos',val:intf(ts.fol),aux:'gasto '+brl(ds.gasto)},
    {label:'Custo por seguidor',val:brl(ds.cps),aux:'campanhas de seguidores'},
    {label:'Leads captados',val:intf(dc.leads),aux:(BF_HAS_LEADS?'planilha de captura':'pixel do Meta')+' · gasto '+brl(dc.gasto)},
    {label:'CPL',val:`<span class="${bfCplCls(dc.cpl)}">${brl(dc.cpl)}</span>`,aux:'campanhas de captação'},
    {label:'Vendas (SS-OUT26)',val:intf(to.vendas),aux:'CAC '+brl(dov.cac)+' · fat. '+brl(to.fat)},
    {label:'Impressões',val:intf(imTot),aux:'CPM '+brl(cpmT)},
    {label:'Cliques',val:intf(clTot),aux:'CTR '+pct(ctrT)+' · CPC '+brl(cpcT)},
  ].map(kpiCard).join('');

  /* por objetivo */
  const objRow=(nome,g,im,cl,res,resLbl)=>({k:nome, cells:{obj:nome, gasto:g, share:gTot?g/gTot:null, impr:im, cpm:im?g/im*1000:null,
    cliques:cl, ctr:im?cl/im:null, cpc:cl?g/cl:null, rlabel:resLbl, res:res, cpr:res?g/res:null}});
  renderTable({id:'gObj', cols:[{key:'obj',label:'Objetivo',type:'dim'},{key:'gasto',label:'Gasto',type:'brl'},{key:'share',label:'% do gasto',type:'pct'},
      {key:'impr',label:'Impressões',type:'int'},{key:'cpm',label:'CPM',type:'brl'},{key:'cliques',label:'Cliques',type:'int'},{key:'ctr',label:'CTR',type:'pct'},
      {key:'cpc',label:'CPC',type:'brl'},{key:'rlabel',label:'Resultado',type:'dim',w:110},{key:'res',label:'Qtd.',type:'int'},{key:'cpr',label:'Custo/resultado',type:'brl'}],
    rows:[objRow(SEG_LABEL, ds.gasto, ts.im, ts.cl, ts.fol, 'Seguidores'), objRow('Captação (leads)', dc.gasto, tc.im, tc.cl, dc.leads, 'Leads'),
      objRow('Vendas · SS-OUT26 (histórico)', dov.gasto, to.im, to.cl, to.vendas, 'Vendas')],
    total:{obj:'Total', gasto:gTot, share:gTot?1:null, impr:imTot, cpm:cpmT, cliques:clTot, ctr:ctrT, cpc:cpcT, rlabel:'', res:null, cpr:null}});

  /* evolução diária */
  const days={}; const g=d=>days[d]||(days[d]={d, sSp:0, cSp:0, vSp:0, ven:0, fol:0, lp:0, lm:0, im:0, cl:0});
  om.forEach(r=>{ if(!r.d) return; const x=g(r.d); x.vSp+=r.sp; x.im+=r.im; x.cl+=r.cl; });
  os_.forEach(r=>{ if(!r.d) return; g(r.d).ven+=r.main; });
  sg.forEach(r=>{ if(!r.d) return; const x=g(r.d); x.sSp+=r.sp; x.fol+=r.fol; x.im+=r.im; x.cl+=r.cl; });
  cp.forEach(r=>{ if(!r.d) return; const x=g(r.d); x.cSp+=r.sp; x.lp+=r.lp; x.im+=r.im; x.cl+=r.cl; });
  ld.forEach(r=>{ if(!r.d) return; g(r.d).lm+=1; });
  const dd=Object.values(days).sort((a,b)=>a.d<b.d?-1:1), L=x=>BF_HAS_LEADS?x.lm:x.lp, T=taxf();
  destroy('gEvo'); const el=document.getElementById('gEvo');
  if(el){ const mut=cmuted();
    charts.gEvo=new Chart(el,{data:{labels:dd.map(x=>x.d.slice(5)),datasets:[
      {type:'bar',label:'Gasto '+SEG_LABEL,data:dd.map(x=>+(x.sSp*T).toFixed(2)),backgroundColor:cvar('--cc1'),stack:'g',yAxisID:'y',order:3},
      {type:'bar',label:'Gasto Captação',data:dd.map(x=>+(x.cSp*T).toFixed(2)),backgroundColor:cvar('--cc6'),stack:'g',yAxisID:'y',order:3},
      {type:'bar',label:'Gasto Vendas SS-OUT26',data:dd.map(x=>+(x.vSp*T).toFixed(2)),backgroundColor:cvar('--cc4'),stack:'g',yAxisID:'y',order:3},
      {type:'line',label:'Seguidores',data:dd.map(x=>x.fol),borderColor:cvar('--chart-faturamento'),backgroundColor:cvar('--chart-faturamento'),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:1},
      {type:'line',label:'Leads',data:dd.map(L),borderColor:cink(),backgroundColor:cink(),yAxisID:'y1',borderWidth:2,pointRadius:2,tension:.25,order:0},
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y'?brl(c.raw):intf(c.raw))}}},
      scales:{x:{stacked:true,ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{stacked:true,beginAtZero:true,ticks:{color:mut,font:{size:10},callback:v=>brl(v)},grid:{color:cgrid()},title:{display:true,text:'Gasto R$',color:mut,font:{size:10}}},
        y1:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{display:false},title:{display:true,text:'Seguidores / Leads',color:mut,font:{size:10}}}}}}); }
  const dCells=x=>{ const s=x.sSp*T, c=x.cSp*T, v=x.vSp*T, l=L(x); return {date:x.d, wd:x.d?weekday(x.d):'', gasto:s+c+v, gs:s, fol:x.fol, cps:x.fol?s/x.fol:null, gc:c, leads:l, cpl:l?c/l:null, gv:v, ven:x.ven, cac:x.ven?v/x.ven:null, impr:x.im, cpm:x.im?(s+c+v)/x.im*1000:null}; };
  const tot=dd.reduce((a,x)=>{ ['sSp','cSp','vSp','ven','fol','lp','lm','im','cl'].forEach(k=>a[k]+=x[k]); return a; },{d:null,sSp:0,cSp:0,vSp:0,ven:0,fol:0,lp:0,lm:0,im:0,cl:0});
  renderTable({id:'gDaily', cols:[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:64},{key:'gasto',label:'Gasto total',type:'brl',heat:'gasto'},
      {key:'gs',label:'Gasto seguidores',type:'brl'},{key:'fol',label:'Seguidores',type:'int',heat:'fat'},{key:'cps',label:'Custo/seguidor',type:'brl'},
      {key:'gc',label:'Gasto captação',type:'brl'},{key:'leads',label:'Leads',type:'int',heat:'fat'},{key:'cpl',label:'CPL',type:'brl'},
      {key:'gv',label:'Gasto vendas',type:'brl'},{key:'ven',label:'Vendas',type:'int'},{key:'cac',label:'CAC',type:'brl'},
      {key:'impr',label:'Impressões',type:'int'},{key:'cpm',label:'CPM',type:'brl'}],
    rows:dd.slice().reverse().map(x=>({k:x.d, cells:dCells(x)})), total:Object.assign(dCells(tot),{date:null,wd:''}),
    selectable:true, selSet:STATE.selDays, onSelect:(k,e)=>{ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); }});
  multiLine('gCost', dd, [{label:'Custo/seguidor',fn:x=>x.fol?+((x.sSp*T)/x.fol).toFixed(2):null,color:cvar('--chart-faturamento'),fmt:'brl',axis:'L'},
    {label:'CPL',fn:x=>{const l=L(x);return l?+((x.cSp*T)/l).toFixed(2):null;},color:cink(),fmt:'brl',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'brl'}});
  multiLine('gCpmCtr', dd, [{label:'CPM',fn:x=>x.im?+(((x.sSp+x.cSp+x.vSp)*T)/x.im*1000).toFixed(2):null,color:cvar('--chart-cpm'),fmt:'brl',axis:'L'},
    {label:'CTR',fn:x=>x.im?+(x.cl/x.im).toFixed(4):null,color:cvar('--chart-ctr'),fmt:'pct',axis:'R'}], {L:{fmt:'brl'},R:{fmt:'pct'}});

  /* campanhas (todas) */
  const camps={}; const gc=(k,o)=>camps[k]||(camps[k]={obj:o,sp:0,im:0,cl:0,res:0});
  sg.forEach(r=>{ const c=gc(r.camp,SEG_LABEL); c.sp+=r.sp; c.im+=r.im; c.cl+=r.cl; c.res+=r.fol; });
  cp.forEach(r=>{ const c=gc(r.camp,'Captação'); c.sp+=r.sp; c.im+=r.im; c.cl+=r.cl; if(!BF_HAS_LEADS) c.res+=r.lp; });
  if(BF_HAS_LEADS) ld.forEach(r=>{ if(camps[r.camp]&&camps[r.camp].obj==='Captação') camps[r.camp].res+=1; });
  om.forEach(r=>{ const c=gc(r.camp,'Vendas'); c.sp+=r.sp; c.im+=r.im; c.cl+=r.cl; });
  os_.forEach(r=>{ if(camps[r.camp]&&camps[r.camp].obj==='Vendas') camps[r.camp].res+=r.main; });
  renderTable({id:'gCamp', cols:[{key:'dim',label:'Campanha',type:'dim',big:true},{key:'obj',label:'Objetivo',type:'dim',w:150},{key:'gasto',label:'Gasto',type:'brl'},
      {key:'impr',label:'Impressões',type:'int'},{key:'cpm',label:'CPM',type:'brl'},{key:'cliques',label:'Cliques',type:'int'},{key:'ctr',label:'CTR',type:'pct'},
      {key:'res',label:'Resultado',type:'int'},{key:'cpr',label:'Custo/resultado',type:'brl'}],
    rows:Object.entries(camps).filter(([k,c])=>c.sp>0||c.res>0).map(([k,c])=>{const gg=c.sp*T; return {k, cells:{dim:k, obj:c.obj==='Captação'?'Captação · leads':(c.obj==='Vendas'?'Vendas · SS-OUT26':c.obj+' · seguidores'), gasto:gg, impr:c.im, cpm:c.im?gg/c.im*1000:null,
      cliques:c.cl, ctr:c.im?c.cl/c.im:null, res:c.res, cpr:c.res?gg/c.res:null}};}),
    total:{dim:null, obj:'', gasto:gTot, impr:imTot, cpm:cpmT, cliques:clTot, ctr:ctrT, res:null, cpr:null}});
}

/* ---------------- date presets ---------------- */
const PRESETS=[
  ['hoje','Hoje',()=>[TODAY,TODAY]],
  ['ontem','Ontem',()=>[addDays(TODAY,-1),addDays(TODAY,-1)]],
  ['3d','3 dias',()=>[addDays(TODAY,-2),TODAY]],
  ['7d','7 dias',()=>[addDays(TODAY,-6),TODAY]],
  ['14d','14 dias',()=>[addDays(TODAY,-13),TODAY]],
  ['30d','30 dias',()=>[addDays(TODAY,-29),TODAY]],
  ['mes','Este mês',()=>{const [y,m]=TODAY.split('-');return [`${y}-${m}-01`,TODAY];}],
  ['mespass','Mês passado',()=>{const dt=new Date(TODAY+'T00:00:00');const f=new Date(dt.getFullYear(),dt.getMonth()-1,1);const l=new Date(dt.getFullYear(),dt.getMonth(),0);return [dstr(f),dstr(l)];}],
  ['todo','Máximo',()=>[B.date_min,B.date_max]],
];
/* rótulo do botão de período — mostra o intervalo aplicado dentro do próprio botão */
function syncDateInputs(){
  const el=document.getElementById('periodBtnLabel'); if(!el) return;
  if(STATE.selDays.size){ el.textContent=STATE.selDays.size+(STATE.selDays.size>1?' dias selecionados':' dia selecionado'); return; }
  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  if(STATE.from&&STATE.to) el.textContent=brdate(STATE.from)+' – '+brdate(STATE.to)+(pr?' · '+pr[1]:'');
  else el.textContent='Selecionar período';
}
function applyPreset(id){ const p=PRESETS.find(x=>x[0]===id); if(!p)return; const [f,t]=p[2]();
  STATE.from=f; STATE.to=t; STATE.preset=id; STATE.selDays.clear(); ppClose(); syncDateInputs(); renderAll(); }

/* ---- popover do seletor de período (estilo Data Studio) ---- */
const MONTHS_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_PT=['D','S','T','Q','Q','S','S'];
const PP={from:null,to:null,preset:'',fromView:'',toView:''};
function ymView(ds){ return (ds||TODAY).slice(0,7); }
function shiftView(view,delta){ const [y,m]=view.split('-').map(Number); const dt=new Date(y,m-1+delta,1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
function ppIsOpen(){ const pop=document.getElementById('periodPop'); return pop && !pop.hidden; }
function ppOpen(){
  PP.from=STATE.from; PP.to=STATE.to; PP.preset=STATE.selDays.size?'':STATE.preset;
  PP.fromView=ymView(STATE.from); PP.toView=ymView(STATE.to);
  document.getElementById('periodPop').hidden=false;
  document.getElementById('periodBtn').setAttribute('aria-expanded','true');
  ppRenderAll();
}
function ppClose(){ const pop=document.getElementById('periodPop'); if(pop) pop.hidden=true;
  const b=document.getElementById('periodBtn'); if(b) b.setAttribute('aria-expanded','false'); }
function ppRenderAll(){ ppRenderPresets(); ppRenderCal('from'); ppRenderCal('to'); ppRenderRange(); }
function ppRenderPresets(){
  const host=document.getElementById('ppPresets');
  host.innerHTML=PRESETS.map(p=>`<button class="pp-preset ${PP.preset===p[0]?'active':''}" data-p="${p[0]}">${p[1]}</button>`).join('');
  host.querySelectorAll('.pp-preset').forEach(c=>c.addEventListener('click',()=>{
    const p=PRESETS.find(x=>x[0]===c.dataset.p); const [f,t]=p[2]();
    PP.from=f; PP.to=t; PP.preset=p[0]; PP.fromView=ymView(f); PP.toView=ymView(t); ppRenderAll();
  }));
}
function ppRenderCal(side){
  const host=document.getElementById(side==='from'?'ppCalFrom':'ppCalTo');
  const view=side==='from'?PP.fromView:PP.toView;
  const [y,m]=view.split('-').map(Number);
  const startDow=new Date(y,m-1,1).getDay(), dim=new Date(y,m,0).getDate();
  let cells='';
  for(let i=0;i<startDow;i++) cells+='<span class="pp-day empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=view+'-'+pad(d);
    const inR=PP.from&&PP.to&&ds>=PP.from&&ds<=PP.to, isEdge=(ds===PP.from||ds===PP.to);
    const cls=['pp-day']; if(inR) cls.push('in'); if(ds===PP.from) cls.push('edge-l'); if(ds===PP.to) cls.push('edge-r'); if(isEdge) cls.push('sel');
    cells+=`<button class="${cls.join(' ')}" data-side="${side}" data-d="${ds}">${d}</button>`;
  }
  host.innerHTML=`<div class="pp-cal-head"><span class="pp-cal-title">${side==='from'?'Data de início':'Data de término'}</span></div>
    <div class="pp-cal-nav"><button class="pp-nav" data-nav="-1">‹</button><span class="pp-cal-month">${MONTHS_PT[m-1]} ${y}</span><button class="pp-nav" data-nav="1">›</button></div>
    <div class="pp-dow">${DOW_PT.map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="pp-grid">${cells}</div>`;
  host.querySelectorAll('.pp-nav').forEach(b=>b.addEventListener('click',()=>{
    const nv=shiftView(view,+b.dataset.nav); if(side==='from') PP.fromView=nv; else PP.toView=nv; ppRenderCal(side);
  }));
  host.querySelectorAll('.pp-day[data-d]').forEach(b=>b.addEventListener('click',()=>ppPickDay(side,b.dataset.d)));
}
function ppPickDay(side,ds){
  PP.preset='';
  if(side==='from'){ PP.from=ds; if(PP.to&&PP.from>PP.to) PP.to=PP.from; }
  else { PP.to=ds; if(PP.from&&PP.to<PP.from) PP.from=PP.to; }
  ppRenderAll();
}
function ppRenderRange(){
  const el=document.getElementById('ppRange');
  if(PP.from&&PP.to){ const n=Math.round((new Date(PP.to+'T00:00:00')-new Date(PP.from+'T00:00:00'))/86400000)+1;
    el.textContent=brdate(PP.from)+' – '+brdate(PP.to)+(n>0?' · '+n+(n>1?' dias':' dia'):''); }
  else el.textContent='Selecione as datas';
}
function ppApply(){
  if(!PP.from||!PP.to){ ppClose(); return; }
  STATE.from=PP.from; STATE.to=PP.to; STATE.preset=PP.preset||''; STATE.selDays.clear();
  ppClose(); syncDateInputs(); renderAll();
}

/* ---------------- navigation & boot ---------------- */
function setPage(p){ STATE.page=p;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  document.getElementById('page-geral').classList.toggle('active',p==='geral');
  document.getElementById('page-seg').classList.toggle('active',p==='seg');
  document.getElementById('page-ia').classList.toggle('active',p==='ia');
  document.getElementById('page-bf').classList.toggle('active',p==='bf');
  document.getElementById('ptitle').textContent = p==='ia'?'IA Insights':(p==='bf'?(BF?BF.label:'Lançamento'):(p==='seg'?SEG_LABEL:'Visão Geral'));
  document.getElementById('navToggle').checked=false;
  history.replaceState(null,'', '#'+p);
  renderAll();
}
function renderAll(){ if(STATE.page==='ia') renderIA(); else if(STATE.page==='bf') renderBF(); else if(STATE.page==='seg') renderSeg(); else renderGeral(); }

/* Tema ESCURO é o padrão; só fica claro se o usuário tiver escolhido 'light'. */
function applyTheme(){ const t=localStorage.getItem('dm_theme'); if(t==='light') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme','dark'); }
applyTheme();
document.getElementById('themeBtn').addEventListener('click',()=>{ const dark=document.documentElement.getAttribute('data-theme')==='dark'; localStorage.setItem('dm_theme',dark?'light':'dark'); applyTheme(); renderAll(); });

document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>setPage(n.dataset.page)));
document.getElementById('taxToggle').addEventListener('click',function(){ STATE.tax=!STATE.tax; this.classList.toggle('on',STATE.tax); renderAll(); });
/* seletor de período: abre/fecha popover, aplicar/cancelar, fechar ao clicar fora/Esc */
document.getElementById('periodBtn').addEventListener('click',e=>{ e.stopPropagation(); ppIsOpen()?ppClose():ppOpen(); });
document.getElementById('ppApply').addEventListener('click',ppApply);
document.getElementById('ppCancel').addEventListener('click',ppClose);
document.getElementById('periodPop').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{ if(ppIsOpen()) ppClose(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ppIsOpen()) ppClose(); });
document.getElementById('clearBtn').addEventListener('click',()=>{ STATE.mSelC.clear();STATE.mSelA.clear();STATE.mSelAd.clear();STATE.bSelC.clear();STATE.bSelA.clear();STATE.bSelAd.clear();STATE.sSelC.clear();STATE.sSelA.clear();STATE.sSelAd.clear();STATE.selDays.clear(); applyPreset('mes'); });
document.getElementById('refreshBtn').addEventListener('click',function(){ this.classList.add('loading'); goRefresh(); });

/* IA Insights config + geração */
document.getElementById('iaCfgBtn').addEventListener('click',()=>{ const c=document.getElementById('iaConfig');
  c.style.display = c.style.display==='none'?'block':'none';
  document.getElementById('iaUrl').value=localStorage.getItem('ia_backend')||'';
  document.getElementById('iaPass').value=localStorage.getItem('ia_pass')||''; });
document.getElementById('iaSave').addEventListener('click',()=>{
  const u=iaNormUrl(document.getElementById('iaUrl').value), p=document.getElementById('iaPass').value;
  if(u) localStorage.setItem('ia_backend',u); else localStorage.removeItem('ia_backend');
  if(p) localStorage.setItem('ia_pass',p); else localStorage.removeItem('ia_pass');
  document.getElementById('iaCfgMsg').textContent='Salvo neste navegador ✓';
  document.getElementById('iaConfig').style.display='none'; iaStatusText(); });
document.getElementById('iaGen').addEventListener('click',iaGenerate);

document.title=(B.client_sub?B.client_sub+' · ':'')+(B.client_name||'Dashboard');
document.getElementById('logoMain').textContent=B.client_name||'—';
document.getElementById('logoSub').textContent=B.client_sub||'';
document.getElementById('taxLabel').textContent=B.tax_label||'Imposto';
document.getElementById('updated').innerHTML='Última atualização:<br>'+B.generated_at_brt+' (BRT)';
document.getElementById('buildFoot').textContent='build __BUILD_ID__';
document.getElementById('buildFoot2').textContent='· build __BUILD_ID__';

syncDateInputs(); iaStatusText();
document.getElementById('taxToggle').classList.toggle('on', STATE.tax);  /* imposto Meta ON por padrão */
if(BF){ document.getElementById('bfNav').hidden=false; document.getElementById('segNav').hidden=false;
  document.getElementById('segNavLabel').textContent=SEG_LABEL;
  document.getElementById('bfNavLabel').textContent=BF.label; document.getElementById('bfSub').textContent=[BF.sub,BF.sigla].filter(Boolean).join(' · '); }
const HASH_PAGES={'#ia':'ia','#bf':BF?'bf':'geral','#seg':BF?'seg':'geral'};
setPage(HASH_PAGES[location.hash]||'geral');

/* ---------------- Aviso de nova versão (sem recarregar por cima do usuário) ----------------
   O build publica uma versão nova a cada ~30 min, mas o GitHub Pages serve o HTML
   com Cache-Control próprio (as metatags http-equiv do <head> NÃO controlam o cache
   HTTP), então abrir a URL "pelada" pode entregar uma cópia antiga.

   Em vez de recarregar a página sozinho — o que apagava filtros, seleção e rolagem no
   meio do uso, e empilhava uma entrada no histórico a cada 30 min —, aqui a página
   CONSULTA a versão publicada com cache:'no-store' e, se houver build novo, mostra um
   aviso discreto. Quem decide a hora de atualizar é o usuário. */
const UPD_CHECK_MS = 5*60*1000;   /* consulta a cada 5 min (a página tem ~35 KB) */
let updPending = false;

function goRefresh(){
  /* replace() em vez de href: não empilha histórico a cada atualização */
  location.replace(location.pathname+'?t='+Date.now()+location.hash);
}

function updShowBanner(){
  if(updPending || document.getElementById('updBanner')) return;
  updPending = true;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.innerHTML = '<span>Novos dados publicados.</span>'
               + '<button class="btn primary" id="updNow">Atualizar agora</button>'
               + '<button class="btn" id="updLater" title="Continuar nesta versão">Depois</button>';
  document.body.appendChild(el);
  document.getElementById('updNow').addEventListener('click', goRefresh);
  document.getElementById('updLater').addEventListener('click', ()=>{ el.remove(); });
}

async function updCheck(){
  if(updPending || document.hidden) return;
  try{
    const r = await fetch(location.pathname+'?v='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const html = await r.text();
    const m = html.match(/<meta\s+name="build"\s+content="([^"]+)"/i);
    if(m && B.build_id && m[1] !== B.build_id) updShowBanner();
  }catch(e){ /* offline ou falha de rede: tenta de novo no próximo ciclo */ }
}

setInterval(updCheck, UPD_CHECK_MS);
/* uma checagem logo após abrir: se o Pages entregou uma cópia de cache, o usuário
   descobre em segundos em vez de ficar olhando número velho sem saber */
setTimeout(updCheck, 15*1000);
/* e ao voltar para a aba, que é quando a pessoa vai de fato olhar os números */
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) updCheck(); });

