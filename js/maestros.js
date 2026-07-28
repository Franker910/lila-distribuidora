// ─── MAESTROS: clientes, productos, proveedores, zonas, listas de precios ───

// ─── CATEGORÍAS DE PRODUCTOS ───
const CATS={
  'Fiambres':['Jamones','Salames','Mortadelas','Bondiolas','Otros fiambres'],
  'Quesos':['Barra','Cremoso','Pategras','Port Salut','Especiales'],
  'Lácteos':['Yogur','Crema','Manteca','Otros lácteos'],
  'Condimentos':['Salsas','Especias','Aderezos'],
  'Conservas':['Latas','Encurtidos','Otros'],
  'Snacks':['Papas fritas','Golosinas','Otros'],
  'Congelados':['Papas','Otros congelados'],
  'Otros':[]
};

function poblarSubcats(catSelId,subcatSelId){
  const cat=document.getElementById(catSelId)?.value||'';
  const sel=document.getElementById(subcatSelId);if(!sel)return;
  const subs=CATS[cat]||[];
  sel.innerHTML='<option value="">Todas las subcategorías</option>'+subs.map(s=>`<option value="${s}">${s}</option>`).join('');
  sel.disabled=!subs.length;
}

async function cargarClientes(){
  // Cargar todos los clientes — el filtro por vendedor se hace en JS para incluir sin-vendedor
  const {data}=await sb.from('clientes').select('*').order('nombre').limit(2000);
  // Vendedor ve sus clientes + los que no tienen vendedor asignado (para no perder ninguno)
  _clientes=usuarioActual.vendedor?(data||[]).filter(c=>{const v=c.vendedor||'';return v===''||v.toLowerCase().includes(usuarioActual.vendedor.toLowerCase());}):data||[];
}

async function cargarListasPrecios(){
  try{
    const {data:listas}=await sb.from('listas_precios').select('*').eq('activa',true).order('nombre');
    _listasPrecios=listas||[];
    if(_listasPrecios.length){
      const ids=_listasPrecios.map(l=>l.id);
      const {data:items}=await sb.from('lista_precios_items').select('*').in('lista_id',ids);
      _listaPreciosItems=items||[];
    }
  }catch(e){_listasPrecios=[];_listaPreciosItems=[];}
  try{_clienteListaMap=JSON.parse(localStorage.getItem('lila_cliente_lista')||'{}');}catch{_clienteListaMap={};}
}

async function cargarProductos(){const {data}=await sb.from('productos').select('*').order('nombre');_productos=data||[];}

function poblarZonas(){
  // Poblar proveedores desde la tabla real de proveedores
  const selProv=document.getElementById('pro-prov');
  if(selProv){
    const provs=[...new Set(_productos.map(p=>p.proveedor_nom||'').filter(Boolean))].sort();
    selProv.innerHTML='<option value="">Todos los proveedores</option>';
    provs.forEach(pv=>{const o=document.createElement('option');o.value=pv;o.textContent=pv;selProv.appendChild(o);});
  }
}

// ─── CLIENTES ───
function renderClientes(){
  const q=(document.getElementById('cli-q').value||'').toLowerCase();
  // Poblar dropdowns de autofiltro dinámicamente en el primer render
  poblarSelectValores('cli-f-zona',_clientes.map(c=>c.zona||''),nombreZona);
  poblarSelectValores('cli-f-ven',_clientes.map(c=>(c.vendedor||'').trim()));
  const fNombre=document.getElementById('cli-f-nombre')?.value||'';
  const fLoc=document.getElementById('cli-f-loc')?.value||'';
  const fTel=document.getElementById('cli-f-tel')?.value||'';
  const fZona=document.getElementById('cli-f-zona')?.value||'';
  const fVen=document.getElementById('cli-f-ven')?.value||'';
  const fDto=document.getElementById('cli-f-dto')?.value||'';
  const fSaldo=document.getElementById('cli-f-saldo')?.value||'';
  let data=_clientes.filter(c=>
    (!q||(c.nombre||'').toLowerCase().includes(q)||(c.telefono||'').includes(q)||(c.localidad||'').toLowerCase().includes(q)||(c.codigo||'').toString().includes(q)||(c.cuit||'').includes(q))&&
    matchFiltroCol(c.nombre,fNombre)&&
    matchFiltroCol(c.localidad,fLoc)&&
    matchFiltroCol(c.telefono,fTel)&&
    (!fZona||c.zona===fZona)&&
    (!fVen||(c.vendedor||'').trim()===fVen)&&
    matchFiltroCol(c.descuento,fDto)&&
    matchFiltroCol(c.saldo,fSaldo)
  );
  const tot=data.length,sl=data.slice((_cliPg-1)*PP,_cliPg*PP);
  const tbody=document.getElementById('cli-tbody');
  tbody.innerHTML=sl.length?sl.map(c=>`<tr>
   <td style="font-weight:600"><span style="font-size:10px;color:var(--txt2);margin-right:4px">${c.codigo||''}</span>${c.nombre}</td>
    <td>${c.localidad||'—'}</td>
    <td>${c.telefono||'—'}</td>
    <td><span class="b bA">${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||'-'}</span></td>
    <td>${(c.vendedor||'').trim()||'—'}</td>
    <td>${c.descuento||0}%</td>
    <td style="${(c.saldo||0)>0?'color:var(--D);font-weight:600':''}">${fmt(c.saldo)}</td>
    <td style="display:flex;gap:3px">
      <button class="btn sm" onclick="editarCliente(${c.id})">✏️</button>
      <button class="btn P sm" onclick="pedRapido(${c.id})">🛒</button>
      <button class="btn sm" onclick="histCliente(${c.id})">📋</button>
    </td>
  </tr>`).join(''):'<tr><td colspan="8"><div class="empty">Sin clientes</div></td></tr>';
  pag('cli-pg',tot,_cliPg,p=>{_cliPg=p;renderClientes();});
}

function abrirCliente(){
  document.getElementById('cli-edit-id').value='';
  document.getElementById('m-cli-title').textContent='Nuevo cliente';
  ['cli-nom','cli-cuit','cli-razon','cli-dir','cli-loc','cli-tel','cli-zona','cli-ven'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('cli-dto').value='0';document.getElementById('cli-saldo').value='0';
  document.getElementById('cli-cpg').value='0';document.getElementById('cli-lista').value='1';
  document.getElementById('m-cliente').classList.add('on');
}

function editarCliente(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('cli-edit-id').value=id;
  document.getElementById('m-cli-title').textContent='Editar cliente';
  document.getElementById('cli-nom').value=c.nombre||'';
  document.getElementById('cli-cuit').value=c.cuit||'';
  const razon=document.getElementById('cli-razon');if(razon)razon.value=c.razon_social||'';
  const cat=document.getElementById('cli-cat');if(cat)cat.value=c.categoria||'Cons. Final';
  document.getElementById('cli-dir').value=c.direccion||'';
  document.getElementById('cli-loc').value=c.localidad||'';
  document.getElementById('cli-tel').value=c.telefono||'';
  document.getElementById('cli-zona').value=c.zona||'';
  document.getElementById('cli-ven').value=c.vendedor||'';
  document.getElementById('cli-dto').value=c.descuento||0;
  document.getElementById('cli-saldo').value=c.saldo||0;
  document.getElementById('cli-cpg').value=c.condicion_pago||0;
  document.getElementById('cli-lista').value=c.lista||1;
  document.getElementById('m-cliente').classList.add('on');
}

async function guardarCliente(){
  const nom=(document.getElementById('cli-nom').value||'').trim().toUpperCase();
  if(!nom){alert('Ingresá el nombre');return;}
  const editId=document.getElementById('cli-edit-id').value;
  const razonEl=document.getElementById('cli-razon');
  const catEl=document.getElementById('cli-cat');
  const obj={nombre:nom,cuit:document.getElementById('cli-cuit').value.trim(),
    razon_social:(razonEl?.value||'').trim()||nom,
    categoria:catEl?.value||'Cons. Final',
    direccion:document.getElementById('cli-dir').value.trim(),
    localidad:document.getElementById('cli-loc').value.trim().toUpperCase(),
    telefono:document.getElementById('cli-tel').value.trim(),
    zona:document.getElementById('cli-zona').value.trim(),
    vendedor:document.getElementById('cli-ven').value.trim(),
    descuento:parseFloat(document.getElementById('cli-dto').value)||0,
    saldo:parseFloat(document.getElementById('cli-saldo').value)||0,
    condicion_pago:parseInt(document.getElementById('cli-cpg').value)||0,
    lista:parseInt(document.getElementById('cli-lista').value)||1};
  if(editId){await sb.from('clientes').update(obj).eq('id',editId);}
  else{await sb.from('clientes').insert(obj);}
  cerrar('m-cliente');await cargarClientes();renderClientes();renderCC();poblarZonas();
  setTimeout(()=>{const q=document.getElementById('cli-q');if(q&&document.getElementById('p-clientes')?.classList.contains('on'))q.focus();},50);
}

function pedRapido(id){go('pedidos');abrirPedido();setTimeout(()=>selCli(id),100);}

// ─── PRODUCTOS ───
// Autofiltro por columna de la grilla de Productos (compartido entre la vista y el export)
function _productoPasaAutofiltro(p){
  const costo=p.costo||0,precio=p.precio||0;
  const mReal=costo>0?Math.round((precio-costo)/costo*1000)/10:0;
  const fCod=document.getElementById('pro-f-cod')?.value||'';
  const fNom=document.getElementById('pro-f-nom')?.value||'';
  const fUn=document.getElementById('pro-f-unidad')?.value||'';
  const fCosto=document.getElementById('pro-f-costo')?.value||'';
  const fPrecio=document.getElementById('pro-f-precio')?.value||'';
  const fMreal=document.getElementById('pro-f-mreal')?.value||'';
  const fMobj=document.getElementById('pro-f-mobj')?.value||'';
  const fStock=document.getElementById('pro-f-stock')?.value||'';
  return matchFiltroCol(p.codigo,fCod)&&matchFiltroCol(p.nombre,fNom)&&matchFiltroCol(p.unidad,fUn)&&
    matchFiltroCol(costo,fCosto)&&matchFiltroCol(precio,fPrecio)&&matchFiltroCol(mReal,fMreal)&&
    matchFiltroCol(p.margen_objetivo||0,fMobj)&&matchFiltroCol(p.stock||0,fStock);
}

function renderProductos(){
  const q=(document.getElementById('pro-q').value||'').toLowerCase();
  const cat=document.getElementById('pro-cat')?.value||'';
  const subcat=document.getElementById('pro-subcat')?.value||'';
  const prov=document.getElementById('pro-prov')?.value||'';
  const activoFiltro=document.getElementById('pro-activo')?.value||'activos';
  let data=_productos.filter(p=>{
    const okQ=!q||(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q)||(p.proveedor_nom||'').toLowerCase().includes(q);
    const okC=!cat||(p.rubro||'')===cat;
    const okSC=!subcat||(p.linea||'')===subcat;
    const okP=!prov||(p.proveedor_nom||'')===prov;
    const esActivo=p.activo!==false;
    const okA=activoFiltro==='todos'||(activoFiltro==='activos'&&esActivo)||(activoFiltro==='inactivos'&&!esActivo);
    return okQ&&okC&&okSC&&okP&&okA&&_productoPasaAutofiltro(p);
  });
  const tot=data.length,sl=data.slice((_proPg-1)*PP,_proPg*PP);
  const tbody=document.getElementById('pro-tbody');
  tbody.innerHTML=sl.length?sl.map(p=>{
    const costo=p.costo||0;const precio=p.precio||0;
    const mReal=costo>0?Math.round((precio-costo)/costo*1000)/10:0;
    const mObj=p.margen_objetivo||0;
    const dif=Math.round((mReal-mObj)*10)/10;
    const badge=mReal<0?'<span class="b bD">📉 Pérdida</span>':dif>=-5&&dif<0?`<span class="b bW" title="${dif}%">⚠️ -${Math.abs(dif)}%</span>`:dif<-5?`<span class="b bD" title="${dif}%">🔴 -${Math.abs(dif)}%</span>`:'<span class="b bP">✅ OK</span>';
    const esActivo=p.activo!==false;
    return `<tr${esActivo?'':' style="opacity:0.55"'}>
    <td style="color:var(--txt2);font-size:11px">${p.codigo||''}</td>
    <td style="font-weight:600">${p.nombre}${esActivo?'':' <span class="b" style="background:var(--D30);color:var(--D);font-size:10px">INACTIVO</span>'}</td>
    <td style="font-size:11px;color:var(--txt2)">${p.proveedor_nom||''}</td>
    <td style="font-size:12px;color:var(--txt2)">${p.unidad||'—'}</td>
    <td style="font-size:12px">${fmt(costo)}</td>
    <td style="color:var(--P);font-weight:600">${fmt(precio)}</td>
    <td style="font-size:12px;font-weight:600;color:${mReal<0?'var(--D)':mReal<mObj?'var(--W)':'var(--P)'}">${mReal}%</td>
    <td style="font-size:12px;color:var(--txt2)">${mObj>0?mObj+'%':'—'}</td>
    <td>${badge}</td>
    <td><span class="b ${(p.stock||0)<=0?'bD':(p.stock||0)<=5?'bW':'bP'}">${p.stock||0}</span></td>
    <td><button class="btn sm" onclick="editarProducto(${p.id})">✏️</button></td>
  </tr>`;}).join(''):'<tr><td colspan="11"><div class="empty">Sin productos</div></td></tr>';
  pag('pro-pg',tot,_proPg,p=>{_proPg=p;renderProductos();});
}

function _getProductosFiltrados(){
  const q=(document.getElementById('pro-q')?.value||'').toLowerCase();
  const cat=document.getElementById('pro-cat')?.value||'';
  const subcat=document.getElementById('pro-subcat')?.value||'';
  const prov=document.getElementById('pro-prov')?.value||'';
  const activoFiltro=document.getElementById('pro-activo')?.value||'activos';
  return _productos.filter(p=>{
    const okQ=!q||(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q)||(p.proveedor_nom||'').toLowerCase().includes(q);
    const okC=!cat||(p.rubro||'')===cat;
    const okSC=!subcat||(p.linea||'')===subcat;
    const okPr=!prov||(p.proveedor_nom||'')===prov;
    const esActivo=p.activo!==false;
    const okA=activoFiltro==='todos'||(activoFiltro==='activos'&&esActivo)||(activoFiltro==='inactivos'&&!esActivo);
    return okQ&&okC&&okSC&&okPr&&okA&&_productoPasaAutofiltro(p);
  });
}

function _getFiltrosDesc(){
  const partes=[];
  const prov=document.getElementById('pro-prov')?.value||'';
  const cat=document.getElementById('pro-cat')?.value||'';
  const subcat=document.getElementById('pro-subcat')?.value||'';
  const q=document.getElementById('pro-q')?.value||'';
  const activo=document.getElementById('pro-activo')?.value||'activos';
  if(prov)partes.push('Proveedor: '+prov);
  if(cat)partes.push('Categoría: '+cat);
  if(subcat)partes.push('Subcategoría: '+subcat);
  if(q)partes.push('Búsqueda: "'+q+'"');
  if(activo==='inactivos')partes.push('Solo inactivos');
  else if(activo==='todos')partes.push('Activos + inactivos');
  return partes.length?partes.join(' · '):'Sin filtros (todos los productos activos)';
}

function _getSufijoCsv(){
  const prov=(document.getElementById('pro-prov')?.value||'').replace(/\s+/g,'_');
  const cat=(document.getElementById('pro-cat')?.value||'').replace(/\s+/g,'_');
  const parts=[prov,cat].filter(Boolean);
  return parts.length?'_'+parts.join('_'):'';
}

function imprimirProductos(){
  const data=_getProductosFiltrados();
  const filtrosDesc=_getFiltrosDesc();
  const filas=data.map(p=>{
    const costo=p.costo||0,precio=p.precio||0;
    const margen=costo>0?((precio-costo)/costo*100).toFixed(1)+'%':'—';
    const estado=p.activo===false?'INACTIVO':'Activo';
    return `<tr><td>${p.codigo||''}</td><td>${p.nombre}</td><td>${p.proveedor_nom||'—'}</td><td>${p.unidad||'—'}</td><td style="text-align:right">${fmt(costo)}</td><td style="text-align:right;font-weight:bold">${fmt(precio)}</td><td style="text-align:right">${margen}</td><td style="text-align:center">${p.stock||0}</td><td>${estado}</td></tr>`;
  }).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Listado de Productos</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}h2{font-size:15px;margin-bottom:6px}.filtros{font-size:11px;color:#555;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:5px 10px;margin-bottom:12px;display:inline-block}table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border:1px solid #ddd;vertical-align:top}th{background:#f0f0f0;font-size:11px;text-transform:uppercase}tr:nth-child(even){background:#fafafa}@media print{button{display:none}}</style></head><body><h2>🌸 Distribuidora Lila — Listado de Productos (${new Date().toLocaleDateString('es-AR')})</h2><div class="filtros">🔍 Filtros: ${filtrosDesc} &nbsp;·&nbsp; ${data.length} productos</div><br><table><thead><tr><th>Código</th><th>Nombre / Descripción</th><th>Proveedor</th><th>Unidad</th><th style="text-align:right">Costo</th><th style="text-align:right">Precio Vta.</th><th style="text-align:right">Margen</th><th style="text-align:center">Stock</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table><br><button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">🖨️ Imprimir</button></body></html>`);
  w.document.close();
}

function exportarProductosCSV(){
  const data=_getProductosFiltrados();
  const BOM='﻿';
  const hdr=['Código','Nombre / Descripción','Proveedor','Unidad','Costo','Precio Venta','Margen %','Stock','Estado'];
  const rows=data.map(p=>{
    const costo=p.costo||0,precio=p.precio||0;
    const margen=costo>0?((precio-costo)/costo*100).toFixed(1):'';
    const estado=p.activo===false?'INACTIVO':'Activo';
    return [p.codigo||'',p.nombre,p.proveedor_nom||'',p.unidad||'',costo,precio,margen,p.stock||0,estado].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';');
  });
  const csv=BOM+[hdr.map(h=>`"${h}"`).join(';'),...rows].join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`productos${_getSufijoCsv()}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

function recalcPrecioSugerido(){
  const costo=parseFloat(document.getElementById('pro-costo')?.value)||0;
  const margen=parseFloat(document.getElementById('pro-margen')?.value)||0;
  const el=document.getElementById('pro-precio-sug');
  if(!el)return;
  if(costo>0&&margen>0&&margen<100){
    const sugerido=Math.ceil(costo/(1-margen/100));
    el.textContent=fmt(sugerido);
    el.dataset.val=sugerido;
  } else {
    el.textContent='—';el.dataset.val='';
  }
}

function usarPrecioSugerido(){
  const v=document.getElementById('pro-precio-sug')?.dataset?.val;
  if(v)document.getElementById('pro-precio').value=v;
}

function abrirProducto(){
  document.getElementById('pro-edit-id').value='';
  document.getElementById('m-pro-title').textContent='Nuevo producto';
  ['pro-cod','pro-nom','pro-unidad'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pro-cat-modal').value='';
  document.getElementById('pro-subcat-modal').innerHTML='<option value="">— Sin subcategoría —</option>';
  document.getElementById('pro-subcat-modal').disabled=true;
  document.getElementById('pro-activo-chk').checked=true;
  ['pro-costo','pro-precio','pro-stock','pro-dto'].forEach(id=>document.getElementById(id).value='0');
  document.getElementById('pro-iva').value='21';
  document.getElementById('pro-margen').value='30';
  document.getElementById('pro-precio-sug').textContent='—';
  document.getElementById('m-producto').classList.add('on');
}

function editarProducto(id){
  const p=_productos.find(x=>x.id===id);if(!p)return;
  document.getElementById('pro-edit-id').value=id;
  document.getElementById('m-pro-title').textContent='Editar producto';
  document.getElementById('pro-cod').value=p.codigo||'';
  document.getElementById('pro-nom').value=p.nombre||'';
  document.getElementById('pro-costo').value=p.costo||0;
  document.getElementById('pro-precio').value=p.precio||0;
  document.getElementById('pro-iva').value=p.iva||21;
  document.getElementById('pro-unidad').value=p.unidad||'';
  document.getElementById('pro-stock').value=p.stock||0;
  document.getElementById('pro-dto').value=p.descuento||0;
  document.getElementById('pro-cat-modal').value=p.rubro||'';
  poblarSubcats('pro-cat-modal','pro-subcat-modal');
  document.getElementById('pro-subcat-modal').value=p.linea||'';
  document.getElementById('pro-margen').value=p.margen_objetivo||30;
  document.getElementById('pro-activo-chk').checked=p.activo!==false;
  recalcPrecioSugerido();
  document.getElementById('m-producto').classList.add('on');
}

async function guardarProducto(){
  const nom=(document.getElementById('pro-nom').value||'').trim().toUpperCase();
  if(!nom){alert('Ingresá el nombre');return;}
  const editId=document.getElementById('pro-edit-id').value;
  const obj={codigo:document.getElementById('pro-cod').value.trim(),nombre:nom,
    costo:parseFloat(document.getElementById('pro-costo').value)||0,
    precio:parseFloat(document.getElementById('pro-precio').value)||0,
    iva:parseFloat(document.getElementById('pro-iva').value)||21,
    unidad:document.getElementById('pro-unidad').value.trim(),
    stock:parseFloat(document.getElementById('pro-stock').value)||0,
    descuento:parseFloat(document.getElementById('pro-dto').value)||0,
    rubro:document.getElementById('pro-cat-modal').value,
    linea:document.getElementById('pro-subcat-modal').value,
    margen_objetivo:parseFloat(document.getElementById('pro-margen').value)||0,
    activo:document.getElementById('pro-activo-chk').checked};
  if(editId){await sb.from('productos').update(obj).eq('id',editId);}
  else{await sb.from('productos').insert(obj);}
  cerrar('m-producto');await cargarProductos();renderProductos();
}

let _listasPrecios=[], _listaPreciosItems=[], _clienteListaMap={};

let _lpItemsCache=[];

let _lpSimItems=[];

let _lpSimProActual=null;

function getPrecioLista(productoId, listaId){
  if(!listaId) return null;
  const lista=_listasPrecios.find(l=>l.id==listaId);
  if(!lista) return null;
  const item=_listaPreciosItems.find(i=>i.lista_id==listaId&&i.producto_id==productoId);
  if(item&&item.precio_override!=null) return +item.precio_override;
  const prod=_productos.find(p=>p.id===productoId);
  if(!prod) return null;
  const costo=prod.costo||0;
  if(!costo) return null;
  return costo*(1+(lista.margen_pct||0)/100);
}

function getListaCliente(clienteId){
  return _clienteListaMap[clienteId]||null;
}

function getPrecioParaCliente(productoId, clienteId){
  const listaId=getListaCliente(clienteId);
  return getPrecioLista(productoId, listaId);
}

function guardarClienteListaMap(){
  localStorage.setItem('lila_cliente_lista',JSON.stringify(_clienteListaMap));
}

// ═══════════════════════════════════════════════════════════════
// LISTAS DE PRECIOS
// ═══════════════════════════════════════════════════════════════
async function initListasPrecios(){
  await cargarListasPrecios();
  lpTab('listas');
  _lpPoblarSelects();
}

function _lpPoblarSelects(){
  const opts=_listasPrecios.map(l=>`<option value="${l.id}">${l.nombre}</option>`).join('');
  ['lp-sel-lista','lp-cli-lista-fil','lp-sim-lista','cmgc-lista-sim'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const base=id==='lp-cli-lista-fil'?'<option value="">Todas</option>':
                id==='lp-sim-lista'?'<option value="">— Sin lista —</option>':
                id==='cmgc-lista-sim'?'<option value="">Sin simulación</option>':
                '<option value="">Seleccioná una lista...</option>';
    el.innerHTML=base+opts;
  });
  const btn=document.getElementById('lp-btn-nueva');
  if(btn)btn.style.display=(usuarioActual?.esAdmin||usuarioActual?.rol==='admin')?'inline-flex':'none';
}

function lpTab(tab){
  ['listas','precios','clientes','sim'].forEach(t=>{
    const sec=document.getElementById('lp-sec-'+t);
    const btn=document.getElementById('lp-tab-'+t);
    if(sec)sec.style.display=t===tab?'block':'none';
    if(btn)btn.className=t===tab?'btn P sm':'btn sm';
  });
  if(tab==='listas')lpRenderListas();
  if(tab==='clientes')lpRenderClientes();
  if(tab==='sim')_lpPoblarSelects();
}

function lpRenderListas(){
  const el=document.getElementById('lp-listas-res');
  if(!el)return;
  if(!_listasPrecios.length){
    el.innerHTML='<div class="empty">No hay listas de precios. Creá la primera con "+ Nueva lista".</div>';
    return;
  }
  el.innerHTML=_listasPrecios.map(l=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--bg2);border:1px solid var(--brd);border-radius:10px;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:15px">${l.nombre}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:2px">Margen base: <strong>${l.margen_pct||0}%</strong> · ${Object.values(_clienteListaMap).filter(v=>v==l.id).length} cliente(s)</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn sm" onclick="lpEditarLista(${l.id})" style="color:var(--P);background:var(--PL)">Editar</button>
        <button class="btn D sm" onclick="lpEliminarLista(${l.id})">Eliminar</button>
      </div>
    </div>`).join('');
}

async function nuevaListaPrecio(){
  const nombre=prompt('Nombre de la lista de precios:');
  if(!nombre)return;
  const margen=parseFloat(prompt('Margen base sobre costo (%) — ej: 20 para 20%:','20')||'20');
  const {data,error}=await sb.from('listas_precios').insert({nombre:nombre.trim(),margen_pct:margen,activa:true}).select().single();
  if(error){alert('Error: '+error.message);return;}
  await cargarListasPrecios();
  _lpPoblarSelects();
  lpRenderListas();
}

async function lpEditarLista(id){
  const l=_listasPrecios.find(x=>x.id===id);if(!l)return;
  const nombre=prompt('Nombre:',l.nombre);if(nombre===null)return;
  const margen=parseFloat(prompt('Margen base %:',l.margen_pct)||String(l.margen_pct));
  await sb.from('listas_precios').update({nombre:nombre.trim(),margen_pct:margen}).eq('id',id);
  await cargarListasPrecios();_lpPoblarSelects();lpRenderListas();
}

async function lpEliminarLista(id){
  if(!confirm('¿Eliminar esta lista? Se perderán todos los precios asociados.'))return;
  await sb.from('lista_precios_items').delete().eq('lista_id',id);
  await sb.from('listas_precios').delete().eq('id',id);
  Object.keys(_clienteListaMap).forEach(cid=>{if(_clienteListaMap[cid]==id)delete _clienteListaMap[cid];});
  guardarClienteListaMap();
  await cargarListasPrecios();_lpPoblarSelects();lpRenderListas();
}

async function lpCargarPrecios(){
  const listaId=document.getElementById('lp-sel-lista').value;
  if(!listaId){document.getElementById('lp-precios-res').innerHTML='';return;}
  const {data}=await sb.from('lista_precios_items').select('*').eq('lista_id',listaId);
  _listaPreciosItems=_listaPreciosItems.filter(i=>i.lista_id!=listaId);
  _listaPreciosItems.push(...(data||[]));
  _lpItemsCache=data||[];
  lpFiltrarPrecios();
}

function lpFiltrarPrecios(){
  const listaId=document.getElementById('lp-sel-lista').value;
  const q=(document.getElementById('lp-pro-q')?.value||'').toLowerCase();
  const lista=_listasPrecios.find(l=>l.id==listaId);
  const el=document.getElementById('lp-precios-res');
  if(!listaId||!lista){if(el)el.innerHTML='';return;}
  let prods=_productos.filter(p=>!q||(p.nombre||'').toLowerCase().includes(q));
  if(!prods.length){el.innerHTML='<div class="empty">Sin resultados</div>';return;}
  el.innerHTML=`<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:8px 10px;text-align:left">Producto</th>
      <th style="padding:8px 10px;text-align:right">Costo</th>
      <th style="padding:8px 10px;text-align:right">Precio base</th>
      <th style="padding:8px 10px;text-align:right">Precio lista (${lista.margen_pct}%)</th>
      <th style="padding:8px 10px;text-align:right">Override</th>
      <th style="padding:8px 10px;text-align:right">Precio final</th>
    </tr></thead>
    <tbody>${prods.map(p=>{
      const item=_lpItemsCache.find(i=>i.producto_id===p.id);
      const precioBase=p.precio||0;
      const costo=p.costo||0;
      const precioLista=costo?(costo*(1+(lista.margen_pct||0)/100)):precioBase;
      const override=item?.precio_override;
      const final=override!=null?override:precioLista;
      return `<tr style="border-bottom:0.5px solid var(--brd)">
        <td style="padding:7px 10px;font-weight:500">${p.nombre}</td>
        <td style="padding:7px 10px;text-align:right;color:var(--txt2)">${fmt(costo)}</td>
        <td style="padding:7px 10px;text-align:right;color:var(--txt2)">${fmt(precioBase)}</td>
        <td style="padding:7px 10px;text-align:right">${fmt(precioLista)}</td>
        <td style="padding:7px 10px;text-align:right">
          <input type="number" value="${override!=null?override:''}" placeholder="Auto"
            style="width:90px;padding:4px 6px;border:1px solid var(--brd);border-radius:6px;font-size:12px;text-align:right"
            onchange="lpGuardarOverride(${listaId},${p.id},this.value)">
        </td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--PD)">${fmt(final)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

async function lpGuardarOverride(listaId,productoId,val){
  const precio=val===''?null:parseFloat(val);
  const existing=_lpItemsCache.find(i=>i.producto_id===productoId);
  if(existing){
    if(precio===null){
      await sb.from('lista_precios_items').delete().eq('id',existing.id);
      _lpItemsCache=_lpItemsCache.filter(i=>i.id!==existing.id);
    } else {
      await sb.from('lista_precios_items').update({precio_override:precio}).eq('id',existing.id);
      existing.precio_override=precio;
    }
  } else if(precio!==null){
    const {data}=await sb.from('lista_precios_items').insert({lista_id:listaId,producto_id:productoId,precio_override:precio}).select().single();
    if(data)_lpItemsCache.push(data);
  }
  _listaPreciosItems=_listaPreciosItems.filter(i=>!(i.lista_id==listaId&&i.producto_id===productoId));
  if(precio!==null){
    const item=_lpItemsCache.find(i=>i.producto_id===productoId);
    if(item)_listaPreciosItems.push(item);
  }
}

function lpRenderClientes(){
  const q=(document.getElementById('lp-cli-q')?.value||'').toLowerCase();
  const listaFil=document.getElementById('lp-cli-lista-fil')?.value||'';
  const el=document.getElementById('lp-cli-res');if(!el)return;
  let clis=_clientes.filter(c=>!q||(c.nombre||'').toLowerCase().includes(q));
  if(listaFil)clis=clis.filter(c=>String(_clienteListaMap[c.id]||'')==listaFil);
  if(!clis.length){el.innerHTML='<div class="empty">Sin resultados</div>';return;}
  el.innerHTML=`<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:8px 10px;text-align:left">Cliente</th>
      <th style="padding:8px 10px;text-align:left">Lista asignada</th>
    </tr></thead>
    <tbody>${clis.slice(0,100).map(c=>{
      const listaId=_clienteListaMap[c.id]||'';
      return `<tr style="border-bottom:0.5px solid var(--brd)">
        <td style="padding:7px 10px;font-weight:500">${c.nombre}</td>
        <td style="padding:7px 10px">
          <select style="width:100%;padding:4px 6px;border:1px solid var(--brd);border-radius:6px;font-size:12px"
            onchange="lpAsignarClienteLista(${c.id},this.value)">
            <option value="">— Sin lista —</option>
            ${_listasPrecios.map(l=>`<option value="${l.id}"${l.id==listaId?' selected':''}>${l.nombre}</option>`).join('')}
          </select>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>${clis.length>100?`<div style="font-size:12px;color:var(--txt2);padding:8px 0">Mostrando 100 de ${clis.length} — filtrá para ver más</div>`:''}`;
}

function lpAsignarClienteLista(clienteId, listaId){
  if(listaId) _clienteListaMap[clienteId]=parseInt(listaId);
  else delete _clienteListaMap[clienteId];
  guardarClienteListaMap();
}

function lpSimDropCli(){
  const q=(document.getElementById('lp-sim-cli-q').value||'').toLowerCase();
  const drop=document.getElementById('lp-sim-cli-drop');
  if(q.length<1){drop.style.display='none';return;}
  const m=_clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.map(c=>`<div onmousedown="lpSimSelCli(${c.id})"
    style="padding:10px 12px;cursor:pointer;border-bottom:0.5px solid var(--brd)"
    onmouseover="this.style.background='var(--PL)'" onmouseout="this.style.background=''">
    <div style="font-weight:600">${c.nombre}</div>
    ${_clienteListaMap[c.id]?`<div style="font-size:11px;color:var(--PD)">${_listasPrecios.find(l=>l.id==_clienteListaMap[c.id])?.nombre||''}</div>`:''}
  </div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function lpSimSelCli(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('lp-sim-cli-id').value=id;
  document.getElementById('lp-sim-cli-q').value=c.nombre;
  document.getElementById('lp-sim-cli-drop').style.display='none';
  const listaId=_clienteListaMap[id];
  if(listaId){const sel=document.getElementById('lp-sim-lista');if(sel)sel.value=listaId;}
}

function lpSimDropPro(){
  const q=(document.getElementById('lp-sim-pro-q').value||'').toLowerCase();
  const drop=document.getElementById('lp-sim-pro-drop');
  if(q.length<1){drop.style.display='none';return;}
  const m=_productos.filter(p=>(p.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.map(p=>`<div onmousedown="lpSimSelPro(${p.id})"
    style="padding:10px 12px;cursor:pointer;border-bottom:0.5px solid var(--brd)"
    onmouseover="this.style.background='var(--PL)'" onmouseout="this.style.background=''">
    <div style="font-weight:600">${p.nombre}</div>
    <div style="font-size:11px;color:var(--txt2)">${fmt(p.precio||0)} base · costo ${fmt(p.costo||0)}</div>
  </div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function lpSimSelPro(id){
  const p=_productos.find(x=>x.id===id);if(!p)return;
  _lpSimProActual=p;
  document.getElementById('lp-sim-pro-q').value=p.nombre;
  document.getElementById('lp-sim-pro-drop').style.display='none';
}

function lpSimAgregar(){
  const p=_lpSimProActual;if(!p){alert('Seleccioná un producto');return;}
  const cant=parseFloat(document.getElementById('lp-sim-cant').value)||1;
  const listaId=document.getElementById('lp-sim-lista').value;
  const precioLista=listaId?getPrecioLista(p.id,listaId):null;
  const precioBase=p.precio||0;
  const precioFinal=precioLista!=null?precioLista:precioBase;
  const idx=_lpSimItems.findIndex(i=>i.id===p.id);
  const item={id:p.id,nom:p.nombre,cant,precioBase,precioLista:precioFinal,listaId};
  if(idx>=0)_lpSimItems[idx]=item;else _lpSimItems.push(item);
  document.getElementById('lp-sim-pro-q').value='';
  document.getElementById('lp-sim-cant').value='1';
  _lpSimProActual=null;
  lpSimRender();
}

function lpSimRender(){
  const el=document.getElementById('lp-sim-items');
  const totDiv=document.getElementById('lp-sim-totales');
  if(!_lpSimItems.length){
    el.innerHTML='<div class="empty" style="padding:12px 0">Agregá productos para simular</div>';
    if(totDiv)totDiv.style.display='none';
    return;
  }
  el.innerHTML=`<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px">
    <thead><tr style="background:var(--bg2)">
      <th style="padding:7px 10px;text-align:left">Producto</th>
      <th style="padding:7px 10px;text-align:right">Cant.</th>
      <th style="padding:7px 10px;text-align:right">P. base</th>
      <th style="padding:7px 10px;text-align:right">P. lista</th>
      <th style="padding:7px 10px;text-align:right">Total base</th>
      <th style="padding:7px 10px;text-align:right">Total lista</th>
      <th style="padding:7px 10px"></th>
    </tr></thead>
    <tbody>${_lpSimItems.map((i,idx)=>{
      const totBase=i.cant*i.precioBase;
      const totLista=i.cant*i.precioLista;
      const dif=totLista-totBase;
      return `<tr style="border-bottom:0.5px solid var(--brd)">
        <td style="padding:6px 10px;font-weight:500">${i.nom}</td>
        <td style="padding:6px 10px;text-align:right">${i.cant}</td>
        <td style="padding:6px 10px;text-align:right;color:var(--txt2)">${fmt(i.precioBase)}</td>
        <td style="padding:6px 10px;text-align:right;color:var(--PD);font-weight:600">${fmt(i.precioLista)}</td>
        <td style="padding:6px 10px;text-align:right;color:var(--txt2)">${fmt(totBase)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:700">${fmt(totLista)}</td>
        <td style="padding:6px 10px;text-align:right">
          <span style="font-size:11px;color:${dif>=0?'var(--P)':'var(--D)'}">${dif>=0?'+':''}${fmt(dif)}</span>
          <button onclick="_lpSimItems.splice(${idx},1);lpSimRender()" style="background:none;border:none;color:var(--D);cursor:pointer;font-size:14px;padding:0 4px">✕</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
  const totalBase=_lpSimItems.reduce((s,i)=>s+i.cant*i.precioBase,0);
  const totalLista=_lpSimItems.reduce((s,i)=>s+i.cant*i.precioLista,0);
  const dif=totalLista-totalBase;
  if(totDiv){
    totDiv.style.display='block';
    document.getElementById('lp-sim-tot-val').textContent=fmt(totalLista);
    document.getElementById('lp-sim-tot-base').textContent=fmt(totalBase);
    const difEl=document.getElementById('lp-sim-tot-diff');
    difEl.textContent=(dif>=0?'+':'')+fmt(dif);
    difEl.style.color=dif>=0?'var(--P)':'var(--D)';
  }
}

// ─── MAESTRO PROVEEDORES ───
let _proveedores = [];

async function cargarProveedores(){
  const {data} = await sb.from('proveedores').select('*').order('nombre');
  _proveedores = data || [];
}

function navProvTabla(e){navTablaGen(e,'prov-tbody','tr',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

let _provOrden='az'; // 'az' | 'saldo_desc' | 'saldo_asc'

function renderProveedores(){
  resetNav('prov-tbody');
  const q = (document.getElementById('prov-q')?.value||'').toLowerCase();
  const fNom=document.getElementById('prov-f-nom')?.value||'';
  const fCuit=document.getElementById('prov-f-cuit')?.value||'';
  const fCont=document.getElementById('prov-f-cont')?.value||'';
  const fPlazo=document.getElementById('prov-f-plazo')?.value||'';
  const fSaldo=document.getElementById('prov-f-saldo')?.value||'';
  let data = _proveedores
    .filter(p => !q || (p.nombre||'').toLowerCase().includes(q)||(p.cuit||'').includes(q)||(p.codigo||'').toString().includes(q)||(p.contacto||'').toLowerCase().includes(q))
    .filter(p => matchFiltroCol(p.nombre,fNom)&&matchFiltroCol(p.cuit,fCuit)&&matchFiltroCol(p.contacto,fCont)&&matchFiltroCol(p.plazo_pago_dias,fPlazo))
    .map(p=>({...p,_saldo:_saldoProveedor(p.id)}))
    .filter(p=>matchFiltroCol(p._saldo,fSaldo));

  if(_provOrden==='saldo_desc') data.sort((a,b)=>b._saldo-a._saldo);
  else if(_provOrden==='saldo_asc') data.sort((a,b)=>a._saldo-b._saldo);
  else data.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));

  const totalesEl=document.getElementById('prov-totales');
  if(totalesEl){
    const totalSaldo=data.reduce((s,p)=>s+p._saldo,0);
    totalesEl.innerHTML=`<div class="stat" style="padding:8px 12px;display:inline-block"><div class="n" style="font-size:16px;color:var(--D)">${fmt(totalSaldo)}</div><div class="l">Saldo total (lo que debemos)</div></div>`;
  }

  const tbody = document.getElementById('prov-tbody');
  if(!tbody) return;
  tbody.innerHTML = data.length ? data.map(p => `<tr>
    <td style="font-weight:600">${p.nombre}</td>
    <td style="color:var(--txt2)">${p.cuit||'—'}</td>
    <td>${p.contacto||'—'}</td>
    <td>${p.telefono||'—'}</td>
    <td>${p.email||'—'}</td>
    <td>${p.condicion_pago||'—'}</td>
    <td>${p.plazo_pago_dias!=null?`<span class="b bP">${p.plazo_pago_dias}d</span>`:'—'}</td>
    <td style="text-align:right;font-weight:600;color:${p._saldo>0?'var(--D)':'var(--txt2)'};cursor:pointer" onclick="histProveedor(${p.id})" title="Ver cuenta corriente">${fmt(p._saldo)}</td>
    <td><button class="btn sm" onclick="editarProveedor(${p.id})">✏️</button>
        <button class="btn D sm" onclick="eliminarProveedor(${p.id})">🗑</button></td>
  </tr>`).join('') : '<tr><td colspan="9"><div class="empty">Sin proveedores</div></td></tr>';
}

function abrirProveedor(){
  document.getElementById('prov-edit-id').value = '';
  document.getElementById('m-prov-title').textContent = 'Nuevo proveedor';
  ['prov-nom','prov-cuit','prov-contacto','prov-tel','prov-email','prov-condicion','prov-plazo','prov-obs'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('prov-cond-fiscal').value='factura_todo';
  document.getElementById('prov-pct-factura').value='';
  document.getElementById('prov-pct-wrap').style.display='none';
  document.getElementById('m-proveedor').classList.add('on');
}

function togglePctFactura(){
  const v=document.getElementById('prov-cond-fiscal').value;
  document.getElementById('prov-pct-wrap').style.display=v==='factura_parcial'?'':'none';
}

function editarProveedor(id){
  const p = _proveedores.find(x => x.id === id); if(!p) return;
  document.getElementById('prov-edit-id').value = id;
  document.getElementById('m-prov-title').textContent = 'Editar proveedor';
  document.getElementById('prov-nom').value = p.nombre||'';
  document.getElementById('prov-cuit').value = p.cuit||'';
  document.getElementById('prov-contacto').value = p.contacto||'';
  document.getElementById('prov-tel').value = p.telefono||'';
  document.getElementById('prov-email').value = p.email||'';
  document.getElementById('prov-condicion').value = p.condicion_pago||'';
  document.getElementById('prov-plazo').value = p.plazo_pago_dias!=null?p.plazo_pago_dias:'';
  document.getElementById('prov-obs').value = p.observaciones||'';
  document.getElementById('prov-cuenta').value = p.cuenta_defecto||'';
  document.getElementById('prov-cond-fiscal').value = p.condicion_fiscal||'factura_todo';
  document.getElementById('prov-pct-factura').value = p.pct_factura||'';
  document.getElementById('prov-pct-wrap').style.display = (p.condicion_fiscal==='factura_parcial')?'':'none';
  document.getElementById('m-proveedor').classList.add('on');
}

async function guardarProveedor(){
  const nom = (document.getElementById('prov-nom').value||'').trim();
  if(!nom){ alert('Ingresá el nombre'); return; }
  const editId = document.getElementById('prov-edit-id').value;
  const obj = {
    nombre: nom,
    cuit: document.getElementById('prov-cuit').value.trim(),
    contacto: document.getElementById('prov-contacto').value.trim(),
    telefono: document.getElementById('prov-tel').value.trim(),
    email: document.getElementById('prov-email').value.trim(),
    condicion_pago: document.getElementById('prov-condicion').value.trim(),
    plazo_pago_dias: document.getElementById('prov-plazo').value!==''?parseInt(document.getElementById('prov-plazo').value):null,
    cuenta_defecto: document.getElementById('prov-cuenta').value,
    observaciones: document.getElementById('prov-obs').value.trim(),
    condicion_fiscal: document.getElementById('prov-cond-fiscal').value,
    pct_factura: document.getElementById('prov-pct-factura').value!==''?parseFloat(document.getElementById('prov-pct-factura').value):null,
  };
  if(editId){ await sb.from('proveedores').update(obj).eq('id', editId); }
  else { await sb.from('proveedores').insert(obj); }
  cerrar('m-proveedor');
  await cargarProveedores();
  renderProveedores();
}

async function eliminarProveedor(id){
  if(!confirm('¿Eliminar este proveedor?')) return;
  await sb.from('proveedores').delete().eq('id', id);
  await cargarProveedores();
  renderProveedores();
}

// ─── MAESTRO ZONAS ───
let _zonas = [];

async function cargarZonas(){
  const {data,error} = await sb.from('zonas').select('*').order('codigo');
  if(error) console.error('Error cargando zonas:', error.message);
  _zonas = data || [];
}

function renderZonas(){
  const q = (document.getElementById('zona-q')?.value||'').toLowerCase();
  const data = _zonas.filter(z => !q || (z.codigo||'').toLowerCase().includes(q) || (z.descripcion||'').toLowerCase().includes(q));
  const tbody = document.getElementById('zona-tbody');
  if(!tbody) return;
  tbody.innerHTML = data.length ? data.map(z => {
    const clientes = _clientes.filter(c => c.zona === z.codigo).length;
    return `<tr>
      <td style="font-weight:700;color:var(--P)">${z.codigo}</td>
      <td>${z.descripcion||'—'}</td>
      <td>${z.vendedor||'—'}</td>
      <td><span class="b bA">${clientes} clientes</span></td>
      <td><button class="btn sm" onclick="editarZona(${z.id})">✏️</button>
          <button class="btn D sm" onclick="eliminarZona(${z.id})">🗑</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty">Sin zonas</div></td></tr>';
}

function abrirZona(){
  document.getElementById('zona-edit-id').value = '';
  document.getElementById('m-zona-title').textContent = 'Nueva zona';
  ['zona-cod','zona-ven','zona-desc'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('m-zona').classList.add('on');
}

function editarZona(id){
  const z = _zonas.find(x => x.id === id); if(!z) return;
  document.getElementById('zona-edit-id').value = id;
  document.getElementById('m-zona-title').textContent = 'Editar zona';
  document.getElementById('zona-cod').value = z.codigo||'';
  document.getElementById('zona-ven').value = z.vendedor||'';
  document.getElementById('zona-desc').value = z.descripcion||'';
  document.getElementById('m-zona').classList.add('on');
}

async function guardarZona(){
  const cod = (document.getElementById('zona-cod').value||'').trim();
  if(!cod){ alert('Ingresá el código de zona'); return; }
  const editId = document.getElementById('zona-edit-id').value;
  const obj = {
    codigo: cod,
    vendedor: document.getElementById('zona-ven').value.trim(),
    descripcion: document.getElementById('zona-desc').value.trim(),
  };
  if(editId){ await sb.from('zonas').update(obj).eq('id', editId); }
  else { await sb.from('zonas').insert(obj); }
  cerrar('m-zona');
  await cargarZonas();
  renderZonas();
}

async function eliminarZona(id){
  if(!confirm('¿Eliminar esta zona?')) return;
  await sb.from('zonas').delete().eq('id', id);
  await cargarZonas();
  renderZonas();
}

// ─── ZONAS DESDE LOCALIDADES ─────────────────────────────────
async function sincronizarZonasDesdeLocalidades() {
  if (!_clientes?.length) { toast('Cargá los clientes primero', 'err'); return; }
  await cargarZonas();
  const localidades = [...new Set((_clientes).map(c=>(c.localidad||'').trim()).filter(Boolean))].sort();
  const descripcionesExistentes = new Set((_zonas||[]).map(z => (z.descripcion||'').trim().toUpperCase()));
  const nuevas = localidades.filter(loc => !descripcionesExistentes.has(loc.toUpperCase()));
  if (!nuevas.length) { toast('✅ Todas las localidades ya tienen zona asociada'); renderZonas(); return; }

  const ok = confirm(`Se crearán ${nuevas.length} zona(s) nueva(s), una por localidad (con código numérico nuevo):\n${nuevas.join(', ')}\n\n¿Continuar?`);
  if (!ok) return;

  // El código de zona es numérico: se asigna el siguiente disponible a partir
  // del máximo existente (no se puede usar el nombre de la localidad como código).
  let maxCod = Math.max(0, ...(_zonas||[]).map(z=>parseInt(z.codigo)||0));
  let ok2 = 0, errs = 0;
  for (const loc of nuevas) {
    maxCod++;
    const { error } = await sb.from('zonas').insert({ codigo: String(maxCod), descripcion: loc, vendedor: '' });
    if (!error) ok2++; else { errs++; console.error('Error zona', loc, error); }
  }
  await cargarZonas();
  go('p-zonas');
  renderZonas();
  if (errs) toast(`⚠️ ${ok2} creadas, ${errs} errores — revisá consola`, 'err');
  else toast(`✅ ${ok2} zona(s) creada(s): ${nuevas.slice(0,3).join(', ')}${nuevas.length>3?'…':''}`);
}
