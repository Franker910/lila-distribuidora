// ═══════════════════════════════════════════════════════════════════════
// INFORMES → PRODUCTOS: ANÁLISIS DE PRODUCTOS
// Une en una sola pestaña: análisis por producto (ventas del período,
// comparación contra el período anterior, markup y margen, abanico de
// listas de precios, tendencia de 12 meses) + ficha de producto con
// evolución, clientes que compran / dejaron de comprar, cruce por
// proveedor e historial de costos.
//
// Fuentes (todas ya cargadas al iniciar la app):
//   _remitos       → ventas (fecha, cliente_id, items[{id,nom,cant,precio,dto}])
//   _productos     → maestro (costo NETO, iva, proveedor_nom, rubro, stock)
//   _listasPrecios / getPrecioLista() → listas (markup sobre costo)
//   _comprobantes  → compras con items (costo_unitario resultante)
//
// Definiciones:
//   Markup = (venta − costo) / costo   → cuánto se le suma al costo
//   Margen = (venta − costo) / venta   → cuánto queda de cada peso vendido
// ═══════════════════════════════════════════════════════════════════════

let _ip = {
  sort: 'venta', dir: -1,
  costoIva: false,          // false = costo neto · true = costo + IVA (clientes en negro)
  abiertos: new Set(),      // productos con el abanico de listas abierto
  rows: [], per: null,
  fichaId: null, fichaTab: 'resumen',
  diasSinComprar: 45
};
let _ipChart = null;

// ─── Utilidades ────────────────────────────────────────────────────────
function _ipYM(f){ return String(f||'').slice(0,7); }
function _ipAddMeses(ym, n){
  let [y,m] = ym.split('-').map(Number);
  m += n; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;}
  return y+'-'+String(m).padStart(2,'0');
}
function _ipUltimoDia(ym){
  const [y,m] = ym.split('-').map(Number);
  return ym+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
}
function _ipMeses12(hastaYM){ const a=[]; for(let i=11;i>=0;i--) a.push(_ipAddMeses(hastaYM,-i)); return a; }
const _IP_MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function _ipMesLbl(ym){ const [y,m]=ym.split('-'); return _IP_MES[+m-1]+' '+y.slice(2); }
function _ipPct(v){ return (v==null||!isFinite(v)) ? '—' : (Math.round(v*1000)/10).toLocaleString('es-AR')+'%'; }
function _ipNum(v){ return (Math.round((v||0)*10)/10).toLocaleString('es-AR'); }
function _ipDiasEntre(a,b){ return Math.round((new Date(b)-new Date(a))/864e5); }

function _ipCosto(p){
  const c = +p?.costo || 0;
  return _ip.costoIva ? c*(1+((+p?.iva||21)/100)) : c;
}

// Todas las líneas de venta (remitos no anulados), aplanadas
function _ipLineas(){
  const out=[];
  (_remitos||[]).forEach(r=>{
    if(r.anulado || !r.fecha) return;
    const f = String(r.fecha).slice(0,10);
    (r.items||[]).forEach(it=>{
      const cant = +it.cant||0;
      out.push({
        fecha:f, ym:f.slice(0,7),
        cli:r.cliente_id, cliNom:r.cliente||'',
        pid:it.id, nom:it.nom||'',
        cant, venta:(+it.precio||0)*cant*(1-(+it.dto||0)/100)
      });
    });
  });
  return out;
}

function _ipProdDeLinea(l){
  return _productos.find(p=>p.id===l.pid) || _productos.find(p=>p.nombre===l.nom) || null;
}

// ─── Período ───────────────────────────────────────────────────────────
function _ipPeriodo(){
  const preset = document.getElementById('ip-per')?.value || 'mes';
  const hoy = hoyLocal(), ymHoy = hoy.slice(0,7);
  let desde, hasta;
  if(preset==='mes'){ desde=ymHoy+'-01'; hasta=hoy; }
  else if(preset==='mesant'){ const ym=_ipAddMeses(ymHoy,-1); desde=ym+'-01'; hasta=_ipUltimoDia(ym); }
  else if(preset==='3m'){ desde=_ipAddMeses(ymHoy,-2)+'-01'; hasta=hoy; }
  else if(preset==='anio'){ desde=hoy.slice(0,4)+'-01-01'; hasta=hoy; }
  else if(preset==='12m'){ desde=_ipAddMeses(ymHoy,-11)+'-01'; hasta=hoy; }
  else {
    desde = document.getElementById('ip-desde')?.value || ymHoy+'-01';
    hasta = document.getElementById('ip-hasta')?.value || hoy;
  }
  // Período anterior comparable
  let antD, antH;
  if(preset==='mes'){
    // mismo tramo del mes anterior (1 al día de hoy) para comparar parejo
    const ym=_ipAddMeses(ymHoy,-1), dia=Math.min(+hoy.slice(8,10), +_ipUltimoDia(ym).slice(8,10));
    antD=ym+'-01'; antH=ym+'-'+String(dia).padStart(2,'0');
  } else if(preset==='anio'){
    const y=+hoy.slice(0,4)-1; antD=y+'-01-01'; antH=y+hoy.slice(4);
  } else {
    const dias=_ipDiasEntre(desde,hasta)+1;
    const h=new Date(desde); h.setDate(h.getDate()-1);
    const d=new Date(h); d.setDate(d.getDate()-dias+1);
    antD=d.toISOString().slice(0,10); antH=h.toISOString().slice(0,10);
  }
  return {preset, desde, hasta, antD, antH};
}

// ─── Inicialización / subpestañas ──────────────────────────────────────
function ipSubTab(t){
  ['analisis','cmg','precios'].forEach(x=>{
    const s=document.getElementById('ip-sub-'+x); if(s) s.style.display = x===t?'block':'none';
    const b=document.getElementById('ip-subbtn-'+x);
    if(b){ b.style.background = x===t?'var(--P)':''; b.style.color = x===t?'#fff':''; }
  });
  if(t==='analisis') ipRender();
}

function ipInit(){
  const selP=document.getElementById('ip-prov');
  if(selP && selP.options.length<=1){
    const provs=[...new Set(_productos.map(p=>p.proveedor_nom).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    selP.innerHTML='<option value="">Todos los proveedores</option>'+provs.map(p=>`<option>${esc(p)}</option>`).join('');
  }
  const selC=document.getElementById('ip-cat');
  if(selC && selC.options.length<=1){
    // Categorías oficiales (las mismas que usa Maestros → Productos, ver CATS en maestros.js).
    // No se pueblan dinámicamente desde la base porque hay productos con rubro mal
    // cargado (códigos numéricos del FoxPro viejo, mayúsculas y tildes inconsistentes).
    // Ver cleanup pendiente en la tabla productos.
    const cats=['Fiambres','Quesos','Lácteos','Condimentos','Conservas','Snacks','Congelados','Otros'];
    selC.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  }
  ipSubTab('analisis');
}

// Normaliza texto para comparar categorías sin importar mayúsculas ni tildes.
// Así 'FIAMBRES', 'Fiambres' y 'fiambres' cuentan como la misma categoría.
function _ipNormCat(s){
  return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function ipCambioPeriodo(){
  const custom = document.getElementById('ip-per')?.value==='custom';
  ['ip-desde','ip-hasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.parentElement.style.display = custom?'':'none'; });
  ipRender();
}

function ipToggleCostoIva(){ _ip.costoIva = !!document.getElementById('ip-costo-iva')?.checked; ipRender(); if(_ip.fichaId) ipFichaRender(); }

function ipOrden(k){
  if(_ip.sort===k) _ip.dir*=-1; else { _ip.sort=k; _ip.dir = (k==='nom'||k==='prov')?1:-1; }
  ipRenderTabla();
}

// ─── Cálculo de la grilla ──────────────────────────────────────────────
function ipRender(){
  const el=document.getElementById('ip-res'); if(!el) return;
  const per=_ipPeriodo(); _ip.per=per;
  const q=(document.getElementById('ip-q')?.value||'').toLowerCase().trim();
  const cat=document.getElementById('ip-cat')?.value||'';
  const prov=document.getElementById('ip-prov')?.value||'';
  const soloVenta=!!document.getElementById('ip-solo-venta')?.checked;

  const lineas=_ipLineas();
  const hastaYM=per.hasta.slice(0,7), meses=_ipMeses12(hastaYM), desde12=meses[0]+'-01';
  const acc={};   // pid → acumulados
  const get=(pid)=>acc[pid]||(acc[pid]={cant:0,venta:0,cantAnt:0,ventaAnt:0,clis:new Set(),ult:null,m:{}});
  lineas.forEach(l=>{
    const p=_ipProdDeLinea(l); if(!p) return;
    const a=get(p.id);
    if(l.fecha>=per.desde && l.fecha<=per.hasta){ a.cant+=l.cant; a.venta+=l.venta; if(l.cli!=null) a.clis.add(l.cli); }
    if(l.fecha>=per.antD && l.fecha<=per.antH){ a.cantAnt+=l.cant; a.ventaAnt+=l.venta; }
    if(l.fecha>=desde12 && l.fecha<=per.hasta){ a.m[l.ym]=(a.m[l.ym]||0)+l.cant; }
    if(!a.ult || l.fecha>a.ult) a.ult=l.fecha;
  });

  // Mismo criterio que usa el resto de la app (renderClientes, cobmBuscarPorCod):
  //   · Número puro ("10", "500") → match EXACTO de código, para que "10" no
  //     traiga 110, 210, 1010, etc. por substring.
  //   · Con letras o mixto → contains sobre nombre y código (como antes).
  const esNumeroPuro = /^\d+$/.test(q);
  const rows=_productos.filter(p=>{
    if(p.activo===false) return false;
    if(q){
      const okQ = esNumeroPuro
        ? String(p.codigo||'').trim() === q
        : ((p.nombre||'').toLowerCase().includes(q) || String(p.codigo||'').includes(q));
      if(!okQ) return false;
    }
    if(cat && _ipNormCat(p.rubro)!==_ipNormCat(cat)) return false;
    if(prov && (p.proveedor_nom||'')!==prov) return false;
    return true;
  }).map(p=>{
    const a=acc[p.id]||{cant:0,venta:0,cantAnt:0,ventaAnt:0,clis:new Set(),ult:null,m:{}};
    const cu=_ipCosto(p), costo=a.cant*cu, cmg=a.venta-costo;
    return {
      p, id:p.id, nom:p.nombre||'', prov:p.proveedor_nom||'', cod:p.codigo||'',
      cu, cant:a.cant, venta:a.venta, cmg,
      markup: costo>0 ? cmg/costo : null,
      margen: a.venta>0 ? cmg/a.venta : null,
      ventaAnt:a.ventaAnt,
      var: a.ventaAnt>0 ? (a.venta-a.ventaAnt)/a.ventaAnt : (a.venta>0?null:null),
      clis:a.clis.size, ult:a.ult,
      spark: meses.map(m=>a.m[m]||0)
    };
  }).filter(r=>!soloVenta || r.venta>0);

  _ip.rows=rows;

  // KPIs
  const tv=rows.reduce((s,r)=>s+r.venta,0), tc=rows.reduce((s,r)=>s+r.cant*r.cu,0), tcmg=tv-tc;
  const tvAnt=rows.reduce((s,r)=>s+r.ventaAnt,0);
  const conVenta=rows.filter(r=>r.venta>0).length;
  const sinCosto=rows.filter(r=>r.venta>0 && !r.cu).length;
  const varT = tvAnt>0 ? (tv-tvAnt)/tvAnt : null;
  const fmtF=f=>f.split('-').reverse().join('/');

  document.getElementById('ip-kpis').innerHTML=`
    <div class="ip-kpi"><div class="n">${fmt(tv)}</div><div class="l">Venta del período</div></div>
    <div class="ip-kpi"><div class="n" style="color:${varT==null?'#000':varT>=0?'var(--P)':'var(--D)'}">${varT==null?'—':(varT>=0?'▲ ':'▼ ')+_ipPct(Math.abs(varT))}</div><div class="l">vs anterior (${fmt(tvAnt)})</div></div>
    <div class="ip-kpi"><div class="n">${fmt(tcmg)}</div><div class="l">CMG (venta − costo)</div></div>
    <div class="ip-kpi"><div class="n">${_ipPct(tv>0?tcmg/tv:null)}</div><div class="l">Margen s/venta</div></div>
    <div class="ip-kpi"><div class="n">${_ipPct(tc>0?tcmg/tc:null)}</div><div class="l">Markup s/costo</div></div>
    <div class="ip-kpi"><div class="n">${conVenta} / ${rows.length}</div><div class="l">Productos con venta</div></div>`;
  document.getElementById('ip-leyenda').innerHTML=
    `Período <b>${fmtF(per.desde)} al ${fmtF(per.hasta)}</b> · comparado con <b>${fmtF(per.antD)} al ${fmtF(per.antH)}</b> · costo <b>${_ip.costoIva?'con IVA (clientes en negro)':'neto sin IVA (clientes que facturan)'}</b>`+
    (sinCosto?` · <span style="color:var(--D);font-weight:700">⚠ ${sinCosto} producto(s) vendidos sin costo cargado</span>`:'');

  ipRenderTabla();
}

function _ipSpark(vals){
  const max=Math.max(...vals,0); if(!max) return '<span style="color:#888">—</span>';
  const w=4,g=1,h=18;
  return `<svg width="${vals.length*(w+g)}" height="${h}" style="vertical-align:middle">${vals.map((v,i)=>{
    const bh=Math.max(v?2:0,Math.round(v/max*h));
    return `<rect x="${i*(w+g)}" y="${h-bh}" width="${w}" height="${bh}" fill="${i===vals.length-1?'var(--P)':'#8b9097'}"><title>${_ipNum(v)}</title></rect>`;
  }).join('')}</svg>`;
}

function _ipListasDe(p){
  const cu=_ipCosto(p), iva=(+p.iva||21)/100;
  const filas=[];
  if(+p.precio>0) filas.push({nombre:'Precio base (maestro)', pctLista:null, neto:+p.precio, override:false});
  (_listasPrecios||[]).forEach(l=>{
    const precio=getPrecioLista(p.id,l.id);
    const item=(_listaPreciosItems||[]).find(i=>i.lista_id==l.id&&i.producto_id==p.id);
    filas.push({nombre:l.nombre, pctLista:+l.margen_pct||0, neto:precio, override:!!(item&&item.precio_override!=null), listaId:l.id});
  });
  return filas.map(f=>({
    ...f,
    conIva: f.neto!=null ? f.neto*(1+iva) : null,
    markup: f.neto!=null && cu>0 ? (f.neto-cu)/cu : null,
    margen: f.neto!=null && f.neto>0 ? (f.neto-cu)/f.neto : null,
    clientes: f.listaId!=null ? Object.values(_clienteListaMap||{}).filter(v=>v==f.listaId).length : null
  }));
}

function _ipTablaListas(p){
  const filas=_ipListasDe(p);
  if(!filas.length) return '<div style="padding:6px;color:#333">No hay listas de precios activas.</div>';
  return `<table class="tbl ip-tbl-listas"><thead><tr>
      <th>Lista</th><th class="r">% lista</th><th class="r">Precio neto</th><th class="r">Precio c/IVA</th>
      <th class="r">Markup real</th><th class="r">Margen real</th><th class="r">CMG unit.</th><th class="r">Clientes</th>
    </tr></thead><tbody>${filas.map(f=>{
      const col=f.margen==null?'#000':f.margen<0?'var(--D)':'#000';
      return `<tr>
        <td><b>${esc(f.nombre)}</b>${f.override?' <span class="b bW" title="Precio fijado a mano en esta lista">fijo</span>':''}</td>
        <td class="r">${f.pctLista==null?'—':f.pctLista+'%'}</td>
        <td class="r"><b>${f.neto==null?'<span style="color:var(--D)">sin costo</span>':fmt(f.neto)}</b></td>
        <td class="r">${f.conIva==null?'—':fmt(f.conIva)}</td>
        <td class="r" style="color:${col}">${_ipPct(f.markup)}</td>
        <td class="r" style="color:${col};font-weight:700">${_ipPct(f.margen)}</td>
        <td class="r">${f.neto==null?'—':fmt(f.neto-_ipCosto(p))}</td>
        <td class="r">${f.clientes==null?'—':f.clientes}</td>
      </tr>`;}).join('')}</tbody></table>`;
}

function ipToggleListas(pid, ev){
  if(ev) ev.stopPropagation();
  if(_ip.abiertos.has(pid)) _ip.abiertos.delete(pid); else _ip.abiertos.add(pid);
  ipRenderTabla();
}

function ipRenderTabla(){
  const el=document.getElementById('ip-res'); if(!el) return;
  const k=_ip.sort, d=_ip.dir;
  const rows=[..._ip.rows].sort((a,b)=>{
    const va=a[k], vb=b[k];
    if(typeof va==='string'||typeof vb==='string') return String(va||'').localeCompare(String(vb||''),'es')*d;
    return ((va??-Infinity)-(vb??-Infinity))*d;
  });
  if(!rows.length){ el.innerHTML='<div class="empty">No hay productos con esos filtros.</div>'; return; }
  const th=(key,lbl,cls='')=>`<th class="${cls} ip-sort" onclick="ipOrden('${key}')">${lbl}${_ip.sort===key?(_ip.dir>0?' ▲':' ▼'):''}</th>`;
  const nListas=(_listasPrecios||[]).length+1;
  el.innerHTML=`<div class="tbl-wrap"><table class="tbl ip-tbl"><thead><tr>
      ${th('cod','Cód.')}${th('nom','Producto')}${th('prov','Proveedor')}
      ${th('cu','Costo','r')}${th('cant','Cant.','r')}${th('venta','Venta','r')}${th('cmg','CMG','r')}
      ${th('markup','Markup','r')}${th('margen','Margen','r')}${th('var','vs ant.','r')}
      ${th('clis','Clientes','r')}<th>12 meses</th><th>Listas</th>
    </tr></thead><tbody>${rows.map(r=>{
      const abierto=_ip.abiertos.has(r.id);
      const colM=r.margen==null?'#000':r.margen<0?'var(--D)':'#000';
      const vv=r.var==null?(r.venta>0&&!r.ventaAnt?'<span class="b bA">nuevo</span>':'—'):`<span style="color:${r.var>=0?'var(--P)':'var(--D)'};font-weight:700">${r.var>=0?'▲':'▼'} ${_ipPct(Math.abs(r.var))}</span>`;
      return `<tr class="ip-row" onclick="ipFicha(${r.id})">
        <td>${esc(String(r.cod))}</td>
        <td><b>${esc(r.nom)}</b></td>
        <td>${esc(r.prov)}</td>
        <td class="r">${r.cu?fmt(r.cu):'<span style="color:var(--D)">sin costo</span>'}</td>
        <td class="r">${r.cant?_ipNum(r.cant)+' '+esc(r.p.unidad||''):'—'}</td>
        <td class="r"><b>${r.venta?fmt(r.venta):'—'}</b></td>
        <td class="r">${r.venta?fmt(r.cmg):'—'}</td>
        <td class="r" style="color:${colM}">${_ipPct(r.markup)}</td>
        <td class="r" style="color:${colM};font-weight:700">${_ipPct(r.margen)}</td>
        <td class="r">${vv}</td>
        <td class="r">${r.clis||'—'}</td>
        <td>${_ipSpark(r.spark)}</td>
        <td><button class="btn sm" onclick="ipToggleListas(${r.id},event)" title="Ver todas las listas">${abierto?'▾':'▸'} ${nListas}</button></td>
      </tr>${abierto?`<tr class="ip-sub"><td colspan="13">${_ipTablaListas(r.p)}</td></tr>`:''}`;
    }).join('')}</tbody></table></div>
    <div style="font-size:11px;color:#333;margin-top:6px">Tocá una fila para abrir la ficha del producto. <b>Markup</b> = ganancia ÷ costo · <b>Margen</b> = ganancia ÷ venta.</div>`;
}

function ipExportarCSV(){
  const rows=_ip.rows; if(!rows.length) return;
  const n=v=>v==null?'':String(Math.round(v*100)/100).replace('.',',');
  const lines=[['Codigo','Producto','Proveedor','Costo','Cantidad','Venta','CMG','Markup %','Margen %','Venta periodo anterior','Clientes','Ultima venta'].join(';')];
  rows.forEach(r=>lines.push([r.cod,`"${(r.nom||'').replace(/"/g,'""')}"`,`"${r.prov}"`,n(r.cu),n(r.cant),n(r.venta),n(r.cmg),n(r.markup==null?null:r.markup*100),n(r.margen==null?null:r.margen*100),n(r.ventaAnt),r.clis,r.ult||''].join(';')));
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`analisis_productos_${_ip.per.desde}_${_ip.per.hasta}.csv`; a.click();
}

// ═══════════════════════════════════════════════════════════════════════
// FICHA DE PRODUCTO
// ═══════════════════════════════════════════════════════════════════════
function _ipAsegurarModal(){
  if(document.getElementById('m-ipficha')) return;
  const d=document.createElement('div');
  d.className='mbg'; d.id='m-ipficha';
  d.innerHTML=`<div class="mdl" style="width:1100px">
    <div class="mh"><h3 id="ipf-titulo">Producto</h3>
      <button class="btn sm" onclick="ipFichaCerrar()">✕ Cerrar</button></div>
    <div style="padding:8px 14px 0;display:flex;gap:6px;flex-wrap:wrap" id="ipf-tabs"></div>
    <div class="mb" id="ipf-body" style="padding:14px"></div>
  </div>`;
  d.addEventListener('click',e=>{ if(e.target===d) ipFichaCerrar(); });
  document.body.appendChild(d);
}

function ipFicha(pid){
  _ipAsegurarModal();
  _ip.fichaId=pid;
  document.getElementById('m-ipficha').classList.add('on');
  ipFichaRender();
}
function ipFichaCerrar(){
  if(_ipChart){ _ipChart.destroy(); _ipChart=null; }
  _ip.fichaId=null;
  cerrar('m-ipficha');
}
function ipFichaTab(t){ _ip.fichaTab=t; ipFichaRender(); }

function ipFichaRender(){
  const p=_productos.find(x=>x.id===_ip.fichaId); if(!p) return;
  document.getElementById('ipf-titulo').innerHTML=`<span style="color:#333">${esc(String(p.codigo||''))}</span> · ${esc(p.nombre)} <span style="font-weight:400;color:#333">· ${esc(p.proveedor_nom||'sin proveedor')} · ${esc(p.rubro||'')}</span>`;
  const tabs=[['resumen','Resumen'],['evolucion','Evolución'],['listas','Listas'],['clientes','Clientes'],['proveedor','Proveedor'],['costos','Costos']];
  document.getElementById('ipf-tabs').innerHTML=tabs.map(([k,l])=>
    `<button class="btn sm" onclick="ipFichaTab('${k}')" style="${_ip.fichaTab===k?'background:var(--P);color:#fff':''}">${l}</button>`).join('')+
    `<label style="margin-left:auto;font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${_ip.costoIva?'checked':''} onchange="document.getElementById('ip-costo-iva').checked=this.checked;ipToggleCostoIva()"> Costo con IVA</label>`;
  if(_ipChart){ _ipChart.destroy(); _ipChart=null; }
  const body=document.getElementById('ipf-body');
  const t=_ip.fichaTab;
  if(t==='resumen') body.innerHTML=_ipFResumen(p);
  else if(t==='evolucion'){ body.innerHTML=_ipFEvolucion(p); _ipFChart(p); }
  else if(t==='listas') body.innerHTML=`<div style="font-size:12px;margin-bottom:8px">Costo usado: <b>${fmt(_ipCosto(p))}</b> ${_ip.costoIva?'(con IVA '+(+p.iva||21)+'%)':'(neto)'} · IVA del producto: <b>${+p.iva||21}%</b></div>`+_ipTablaListas(p)+
      `<div style="font-size:11px;color:#333;margin-top:8px">⚠ La asignación cliente → lista hoy se guarda en el navegador de quien la cargó, por eso "Clientes" puede verse distinto en cada equipo.</div>`;
  else if(t==='clientes') body.innerHTML=_ipFClientes(p);
  else if(t==='proveedor') body.innerHTML=_ipFProveedor(p);
  else if(t==='costos') body.innerHTML=_ipFCostos(p);
}

function _ipLineasProd(p){ return _ipLineas().filter(l=>l.pid===p.id || (!l.pid && l.nom===p.nombre)); }

function _ipKpi(n,l,col){ return `<div class="ip-kpi"><div class="n"${col?` style="color:${col}"`:''}>${n}</div><div class="l">${l}</div></div>`; }
function _ipVar(a,b){ if(!b) return a?'<span class="b bA">nuevo</span>':'—'; const v=(a-b)/b; return `<span style="color:${v>=0?'var(--P)':'var(--D)'};font-weight:700">${v>=0?'▲':'▼'} ${_ipPct(Math.abs(v))}</span>`; }

function _ipFResumen(p){
  const L=_ipLineasProd(p), hoy=hoyLocal(), ym=hoy.slice(0,7), ymAnt=_ipAddMeses(ym,-1);
  const dia=hoy.slice(8,10), anio=hoy.slice(0,4), anioAnt=String(+anio-1);
  const sum=(f)=>L.filter(f).reduce((a,l)=>({cant:a.cant+l.cant,venta:a.venta+l.venta}),{cant:0,venta:0});
  const mes=sum(l=>l.ym===ym), mesAntParejo=sum(l=>l.ym===ymAnt && l.fecha.slice(8,10)<=dia), mesAnt=sum(l=>l.ym===ymAnt);
  const ytd=sum(l=>l.fecha.slice(0,4)===anio), ytdAnt=sum(l=>l.fecha.slice(0,4)===anioAnt && l.fecha.slice(5)<=hoy.slice(5));
  const cu=_ipCosto(p);
  const cmgY=ytd.venta-ytd.cant*cu;
  const ult=L.reduce((m,l)=>l.fecha>m?l.fecha:m,'');
  const clis90=new Set(L.filter(l=>_ipDiasEntre(l.fecha,hoy)<=90).map(l=>l.cli)).size;
  const precio=+p.precio||0;
  return `
    <div class="ip-kpis">
      ${_ipKpi(fmt(cu),'Costo '+(_ip.costoIva?'con IVA':'neto'))}
      ${_ipKpi(precio?fmt(precio):'—','Precio base')}
      ${_ipKpi(_ipPct(cu>0&&precio?(precio-cu)/cu:null),'Markup base')}
      ${_ipKpi(_ipPct(precio?(precio-cu)/precio:null),'Margen base')}
      ${_ipKpi(_ipNum(p.stock||0)+' '+esc(p.unidad||''),'Stock',(p.stock||0)<=0?'var(--D)':null)}
      ${_ipKpi(ult?ult.split('-').reverse().join('/'):'nunca','Última venta')}
    </div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Período</th><th class="r">Cantidad</th><th class="r">Venta</th><th class="r">Comparado con</th><th class="r">Cantidad</th><th class="r">Venta</th><th class="r">Variación</th></tr></thead><tbody>
      <tr><td><b>Mes actual</b> (al día ${+dia})</td><td class="r">${_ipNum(mes.cant)}</td><td class="r"><b>${fmt(mes.venta)}</b></td><td class="r">mes anterior al día ${+dia}</td><td class="r">${_ipNum(mesAntParejo.cant)}</td><td class="r">${fmt(mesAntParejo.venta)}</td><td class="r">${_ipVar(mes.venta,mesAntParejo.venta)}</td></tr>
      <tr><td><b>Mes anterior</b> completo</td><td class="r">${_ipNum(mesAnt.cant)}</td><td class="r">${fmt(mesAnt.venta)}</td><td colspan="4"></td></tr>
      <tr><td><b>Año ${anio}</b> a la fecha</td><td class="r">${_ipNum(ytd.cant)}</td><td class="r"><b>${fmt(ytd.venta)}</b></td><td class="r">${anioAnt} mismo tramo</td><td class="r">${_ipNum(ytdAnt.cant)}</td><td class="r">${fmt(ytdAnt.venta)}</td><td class="r">${_ipVar(ytd.venta,ytdAnt.venta)}</td></tr>
    </tbody></table>
    <div class="ip-kpis" style="margin-top:12px">
      ${_ipKpi(fmt(cmgY),'CMG del año')}
      ${_ipKpi(_ipPct(ytd.venta>0?cmgY/ytd.venta:null),'Margen real del año')}
      ${_ipKpi(_ipPct(ytd.cant*cu>0?cmgY/(ytd.cant*cu):null),'Markup real del año')}
      ${_ipKpi(ytd.cant>0?fmt(ytd.venta/ytd.cant):'—','Precio promedio cobrado')}
      ${_ipKpi(clis90,'Clientes últimos 90 días')}
    </div>
    <div style="font-size:11px;color:#333;margin-top:8px">El margen "real" usa el precio efectivamente cobrado en los remitos (con descuentos) contra el costo actual del producto.</div>`;
}

function _ipFSerie(p){
  const L=_ipLineasProd(p), meses=_ipMeses12(hoyLocal().slice(0,7)), cu=_ipCosto(p);
  return meses.map(m=>{
    const ls=L.filter(l=>l.ym===m);
    const cant=ls.reduce((a,l)=>a+l.cant,0), venta=ls.reduce((a,l)=>a+l.venta,0);
    const mAnt=_ipAddMeses(m,-12), lsA=L.filter(l=>l.ym===mAnt);
    return {m, cant, venta, cmg:venta-cant*cu, clis:new Set(ls.map(l=>l.cli)).size, ventaAA:lsA.reduce((a,l)=>a+l.venta,0)};
  });
}

function _ipFEvolucion(p){
  const s=_ipFSerie(p);
  return `<div style="position:relative;height:260px"><canvas id="ipf-chart"></canvas></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Mes</th><th class="r">Cantidad</th><th class="r">Venta</th><th class="r">CMG</th><th class="r">Margen</th><th class="r">Clientes</th><th class="r">Mismo mes año ant.</th><th class="r">Var.</th></tr></thead><tbody>
    ${s.slice().reverse().map(r=>`<tr><td><b>${_ipMesLbl(r.m)}</b></td><td class="r">${_ipNum(r.cant)}</td><td class="r">${fmt(r.venta)}</td><td class="r">${fmt(r.cmg)}</td><td class="r">${_ipPct(r.venta>0?r.cmg/r.venta:null)}</td><td class="r">${r.clis||'—'}</td><td class="r">${r.ventaAA?fmt(r.ventaAA):'—'}</td><td class="r">${r.ventaAA?_ipVar(r.venta,r.ventaAA):'—'}</td></tr>`).join('')}
    </tbody></table>`;
}

function _ipFChart(p){
  const cv=document.getElementById('ipf-chart'); if(!cv||typeof Chart==='undefined') return;
  const s=_ipFSerie(p);
  _ipChart=new Chart(cv,{
    data:{labels:s.map(r=>_ipMesLbl(r.m)),datasets:[
      {type:'bar',label:'Venta $',data:s.map(r=>Math.round(r.venta)),backgroundColor:'#1a7a52',yAxisID:'y',order:2},
      {type:'line',label:'Cantidad',data:s.map(r=>Math.round(r.cant*10)/10),borderColor:'#1a5fa8',backgroundColor:'#1a5fa8',tension:.25,yAxisID:'y2',order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#000'}},tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y'?' Venta: '+fmt(c.raw):' Cantidad: '+_ipNum(c.raw)}}},
      scales:{y:{position:'left',ticks:{color:'#000',callback:v=>'$'+Number(v).toLocaleString('es-AR')},grid:{color:'#e4e6e9'}},
              y2:{position:'right',ticks:{color:'#000'},grid:{display:false}},
              x:{ticks:{color:'#000'},grid:{display:false}}}}
  });
}

function _ipFClientes(p){
  const L=_ipLineasProd(p), hoy=hoyLocal(), N=_ip.diasSinComprar;
  const desde12=_ipAddMeses(hoy.slice(0,7),-11)+'-01';
  const hace90=new Date(Date.now()-90*864e5).toISOString().slice(0,10), hace180=new Date(Date.now()-180*864e5).toISOString().slice(0,10);
  // Última compra de CUALQUIER producto por cliente (para distinguir "perdí el producto" de "perdí el cliente")
  const ultGeneral={};
  (_remitos||[]).forEach(r=>{ if(r.anulado||!r.fecha) return; const f=String(r.fecha).slice(0,10); if(!ultGeneral[r.cliente_id]||f>ultGeneral[r.cliente_id]) ultGeneral[r.cliente_id]=f; });
  const cli={};
  L.filter(l=>l.fecha>=desde12).forEach(l=>{
    const c=cli[l.cli]||(cli[l.cli]={id:l.cli,nom:l.cliNom,cant:0,venta:0,ult:null,veces:new Set(),c3:0,c3a:0});
    c.cant+=l.cant; c.venta+=l.venta; c.veces.add(l.fecha);
    if(!c.ult||l.fecha>c.ult) c.ult=l.fecha;
    if(l.fecha>=hace90) c.c3+=l.cant; else if(l.fecha>=hace180) c.c3a+=l.cant;
  });
  const nombre=id=>{ const c=(_clientesTodos||_clientes||[]).find(x=>x.id===id); return c?c.nombre:null; };
  const arr=Object.values(cli).map(c=>({...c,nom:nombre(c.id)||c.nom||'?',dias:_ipDiasEntre(c.ult,hoy),ultG:ultGeneral[c.id]}));
  const activos=arr.filter(c=>c.dias<N).sort((a,b)=>b.venta-a.venta);
  const perdidos=arr.filter(c=>c.dias>=N).sort((a,b)=>b.venta-a.venta);
  const tend=c=>!c.c3a?(c.c3?'<span class="b bA">nuevo</span>':'—'):_ipVar(c.c3,c.c3a);
  const f=d=>d?d.split('-').reverse().join('/'):'—';
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px">
      Se considera que <b>dejó de comprar</b> si pasaron más de
      <input type="number" value="${N}" min="7" style="width:60px" onchange="_ip.diasSinComprar=+this.value||45;ipFichaRender()"> días desde su última compra de este producto (mirando los últimos 12 meses).
    </div>
    <div style="font-weight:700;margin:4px 0">✅ Lo compran (${activos.length})</div>
    ${activos.length?`<table class="tbl"><thead><tr><th>Cliente</th><th class="r">Cantidad 12m</th><th class="r">Venta 12m</th><th class="r">Compras</th><th class="r">Última</th><th class="r">Últ. 90d vs 90d ant.</th></tr></thead><tbody>
      ${activos.map(c=>`<tr><td><b>${esc(c.nom)}</b></td><td class="r">${_ipNum(c.cant)}</td><td class="r">${fmt(c.venta)}</td><td class="r">${c.veces.size}</td><td class="r">${f(c.ult)} <span style="color:#333">(${c.dias}d)</span></td><td class="r">${tend(c)}</td></tr>`).join('')}
    </tbody></table>`:'<div class="empty">Nadie lo compró en los últimos '+N+' días.</div>'}
    <div style="font-weight:700;margin:14px 0 4px;color:var(--D)">⚠ Dejaron de comprarlo (${perdidos.length})</div>
    ${perdidos.length?`<table class="tbl"><thead><tr><th>Cliente</th><th class="r">Cantidad 12m</th><th class="r">Venta 12m</th><th class="r">Última de este producto</th><th>¿Sigue comprando otras cosas?</th></tr></thead><tbody>
      ${perdidos.map(c=>{
        const dG=c.ultG?_ipDiasEntre(c.ultG,hoy):null;
        const sigue=dG!=null&&dG<N;
        return `<tr><td><b>${esc(c.nom)}</b></td><td class="r">${_ipNum(c.cant)}</td><td class="r">${fmt(c.venta)}</td><td class="r">${f(c.ult)} <span style="color:#333">(${c.dias}d)</span></td>
          <td>${sigue?`<span class="b bW">Sí — perdiste el producto, no el cliente</span> <span style="font-size:11px">(últ. compra hace ${dG}d)</span>`:`<span class="b bD">No — cliente inactivo${dG!=null?' hace '+dG+'d':''}</span>`}</td></tr>`;
      }).join('')}
    </tbody></table>`:'<div class="empty">Ningún cliente dejó de comprarlo.</div>'}`;
}

function _ipFProveedor(p){
  const prov=p.proveedor_nom||'';
  if(!prov) return '<div class="empty">Este producto no tiene proveedor cargado.</div>';
  const prodsProv=_productos.filter(x=>(x.proveedor_nom||'')===prov && x.activo!==false);
  const ids=new Set(prodsProv.map(x=>x.id));
  const hoy=hoyLocal(), desde12=_ipAddMeses(hoy.slice(0,7),-11)+'-01';
  const L=_ipLineas().filter(l=>l.fecha>=desde12).map(l=>({...l,p:_ipProdDeLinea(l)})).filter(l=>l.p&&ids.has(l.p.id));
  const porProd={}, porCli={};
  L.forEach(l=>{
    const a=porProd[l.p.id]||(porProd[l.p.id]={p:l.p,cant:0,venta:0,clis:new Set()});
    a.cant+=l.cant; a.venta+=l.venta; a.clis.add(l.cli);
    const c=porCli[l.cli]||(porCli[l.cli]={id:l.cli,nom:l.cliNom,venta:0,prods:new Set(),ult:null,esteProd:false});
    c.venta+=l.venta; c.prods.add(l.p.id); if(!c.ult||l.fecha>c.ult) c.ult=l.fecha; if(l.p.id===p.id) c.esteProd=true;
  });
  const nombre=id=>{ const c=(_clientesTodos||_clientes||[]).find(x=>x.id===id); return c?c.nombre:null; };
  const prods=prodsProv.map(x=>{ const a=porProd[x.id]||{cant:0,venta:0,clis:new Set()}; const cu=_ipCosto(x); return {x,cant:a.cant,venta:a.venta,cmg:a.venta-a.cant*cu,clis:a.clis.size}; }).sort((a,b)=>b.venta-a.venta);
  const tot=prods.reduce((s,r)=>s+r.venta,0);
  const clis=Object.values(porCli).map(c=>({...c,nom:nombre(c.id)||c.nom||'?'})).sort((a,b)=>b.venta-a.venta);
  return `
    <div class="ip-kpis">
      ${_ipKpi(esc(prov),'Proveedor')}
      ${_ipKpi(prodsProv.length,'Productos activos')}
      ${_ipKpi(fmt(tot),'Venta 12 meses')}
      ${_ipKpi(clis.length,'Clientes que le compran')}
    </div>
    <div style="font-weight:700;margin:12px 0 4px">Productos de ${esc(prov)} — últimos 12 meses</div>
    <table class="tbl"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Venta</th><th class="r">% del proveedor</th><th class="r">CMG</th><th class="r">Margen</th><th class="r">Clientes</th></tr></thead><tbody>
      ${prods.map(r=>`<tr class="ip-row" onclick="ipFicha(${r.x.id})" style="${r.x.id===p.id?'background:var(--PL)':''}"><td><b>${esc(r.x.nombre)}</b></td><td class="r">${r.cant?_ipNum(r.cant):'—'}</td><td class="r">${r.venta?fmt(r.venta):'—'}</td><td class="r">${tot?_ipPct(r.venta/tot):'—'}</td><td class="r">${r.venta?fmt(r.cmg):'—'}</td><td class="r">${_ipPct(r.venta>0?r.cmg/r.venta:null)}</td><td class="r">${r.clis||'—'}</td></tr>`).join('')}
    </tbody></table>
    <div style="font-weight:700;margin:14px 0 4px">Clientes que le compran a ${esc(prov)}</div>
    ${clis.length?`<table class="tbl"><thead><tr><th>Cliente</th><th class="r">Venta 12m</th><th class="r">Productos distintos</th><th class="r">Última compra</th><th>¿Lleva ${esc(p.nombre)}?</th></tr></thead><tbody>
      ${clis.map(c=>`<tr><td><b>${esc(c.nom)}</b></td><td class="r">${fmt(c.venta)}</td><td class="r">${c.prods.size} de ${prodsProv.length}</td><td class="r">${c.ult.split('-').reverse().join('/')}</td><td>${c.esteProd?'<span class="b bP">Sí</span>':'<span class="b bW">No — oportunidad</span>'}</td></tr>`).join('')}
    </tbody></table>`:'<div class="empty">Sin ventas de este proveedor en 12 meses.</div>'}`;
}

function _ipFCostos(p){
  const hist=[];
  (_comprobantes||[]).forEach(c=>{
    (Array.isArray(c.items)?c.items:[]).forEach(it=>{
      if(+it.producto_id===p.id) hist.push({fecha:String(c.fecha||'').slice(0,10),prov:c.proveedor_nom||'',nro:c.nro_comprobante||'',tipo:c.tipo||'',cant:+it.cantidad||0,costo:+it.costo_unitario||0});
    });
  });
  hist.sort((a,b)=>a.fecha.localeCompare(b.fecha));
  hist.forEach((h,i)=>{ const prev=hist[i-1]; h.var=prev&&prev.costo?(h.costo-prev.costo)/prev.costo:null; });
  const f=d=>d?d.split('-').reverse().join('/'):'—';
  return `
    <div class="ip-kpis">
      ${_ipKpi(fmt(+p.costo||0),'Costo neto actual')}
      ${_ipKpi(fmt((+p.costo||0)*(1+(+p.iva||21)/100)),'Costo con IVA '+(+p.iva||21)+'%')}
      ${_ipKpi(hist.length,'Compras registradas')}
      ${_ipKpi(hist.length?f(hist[hist.length-1].fecha):'—','Último cambio por compra')}
    </div>
    ${hist.length?`<table class="tbl" style="margin-top:12px"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Comprobante</th><th class="r">Cantidad</th><th class="r">Costo resultante</th><th class="r">Variación</th></tr></thead><tbody>
      ${hist.slice().reverse().map(h=>`<tr><td>${f(h.fecha)}</td><td>${esc(h.prov)}</td><td>${esc((h.tipo+' '+h.nro).trim())}</td><td class="r">${_ipNum(h.cant)}</td><td class="r"><b>${fmt(h.costo)}</b></td><td class="r">${h.var==null?'—':`<span style="color:${h.var>0?'var(--D)':'var(--P)'};font-weight:700">${h.var>0?'▲':'▼'} ${_ipPct(Math.abs(h.var))}</span>`}</td></tr>`).join('')}
    </tbody></table>`:'<div class="empty" style="margin-top:12px">No hay compras con detalle de productos para este artículo.</div>'}
    <div style="font-size:11px;color:#333;margin-top:8px">⚠ Provisorio: se arma con las compras cargadas y muestra el costo promedio que quedó después de cada compra. Los cambios de costo hechos a mano en el maestro no quedan registrados hasta que exista la tabla de historial de costos.</div>`;
}
