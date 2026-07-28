// ─── VENTAS: pedidos, remito rápido, notas de crédito/débito, venta móvil ───

let _items=[], _proTemp=null;

async function cargarPedidos(){
  const {data}=await sb.from('pedidos').select('*').order('created_at',{ascending:false});
  // Vendedor ve sus pedidos + los que no tienen vendedor asignado
  _pedidos=usuarioActual.vendedor?(data||[]).filter(p=>{const v=p.vendedor||'';return v===''||v.toLowerCase().includes(usuarioActual.vendedor.toLowerCase());}):data||[];
}

// ─── PEDIDOS ───
function renderPedidos(){
  const q=(document.getElementById('ped-q').value||'').toLowerCase();
  const est=document.getElementById('ped-est').value;
  let data=_pedidos.filter(p=>(!q||(p.cliente||'').toLowerCase().includes(q)||String(p.id).includes(q)||(p.localidad||'').toLowerCase().includes(q)||(p.vendedor||'').toLowerCase().includes(q))&&(!est||p.estado===est));
  const el=document.getElementById('ped-lista');
  if(!data.length){el.innerHTML='<div class="empty">Sin pedidos</div>';return;}
  const stBadge=s=>`<span class="b ${s==='pendiente'?'bW':s==='en_carga'?'bA':s==='remitado'?'bP':'bG'}">${s.replace('_',' ')}</span>`;
  el.innerHTML=data.map(p=>`
    <div style="background:var(--bg);border:1.5px solid var(--brd);border-radius:12px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div onclick="toggleDetallePed(${p.id})" style="display:flex;justify-content:space-between;align-items:center;padding:14px;cursor:pointer;border-left:4px solid var(--P)">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${p.id} — ${p.cliente}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:2px">${p.localidad||''} · ${(_zonas.find(z=>z.codigo===p.zona)?.descripcion||p.zona)||''} · ${p.vendedor||'—'} · ${p.fecha||''}</div>
          <div style="margin-top:4px;display:flex;align-items:center;gap:6px">${stBadge(p.estado)}<span style="font-size:11px;color:var(--txt2)">${(p.items||[]).length} producto${(p.items||[]).length!==1?'s':''}${p.visita?' · '+p.visita:''}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-left:12px;flex-shrink:0">
          <div style="font-size:18px;font-weight:700;color:var(--P)">${fmt(p.total)}</div>
          <span id="ped-chev-${p.id}" style="font-size:16px;color:var(--txt2);transition:transform 0.2s">▼</span>
        </div>
      </div>
      <div id="ped-det-${p.id}" style="display:none;border-top:1px solid var(--brd)">
        <div style="padding:12px 16px;font-size:13px;color:var(--txt2);background:var(--bg2)">
          ${(p.items||[]).map(it=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd)"><span>${it.nom||it.nombre}</span><span style="font-weight:600">${it.cant} ${it.un||'un'} · ${fmt(it.precio*it.cant)}</span></div>`).join('')}
          ${p.obs?`<div style="margin-top:8px;color:var(--txt2);font-size:12px">Obs: ${p.obs}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--brd)">
          ${p.estado==='pendiente'?`
            <button onclick="event.stopPropagation();editarPedidoMovil(${p.id})" style="flex:2;min-height:44px;background:var(--AL);color:var(--A);border:1.5px solid var(--A);border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">✏️ Editar</button>
            <button onclick="event.stopPropagation();elimPedido(${p.id})" style="flex:1;min-height:44px;background:var(--DL);color:var(--D);border:1.5px solid var(--D);border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">🗑</button>
          `:''}
          ${p.estado==='remitado'?`<button onclick="event.stopPropagation();verRemito(${p.remito_id})" style="min-height:44px;padding:0 16px;background:var(--bg2);border:1.5px solid var(--brd);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">📄 Ver remito</button>`:''}
        </div>
      </div>
    </div>`).join('');
}

function toggleDetallePed(id){
  const det=document.getElementById('ped-det-'+id);
  const chev=document.getElementById('ped-chev-'+id);
  if(!det)return;
  const open=det.style.display==='none';
  det.style.display=open?'block':'none';
  if(chev)chev.style.transform=open?'rotate(180deg)':'rotate(0deg)';
}

function verPedido(id){
  const p=_pedidos.find(x=>x.id===id);if(!p)return;
  document.getElementById('m-ver-title').textContent='Pedido #'+p.id+' — '+p.cliente;
  document.getElementById('m-ver-body').innerHTML=detalleHTML(p,false);
  document.getElementById('m-ver-print').style.display='none';
  document.getElementById('m-ver').classList.add('on');
}

async function elimPedido(id){
  if(!confirm('¿Eliminar pedido?'))return;
  await sb.from('pedidos').delete().eq('id',id);
  await cargarPedidos();renderPedidos();renderDash();
}

// ─── NUEVO PEDIDO ───
function abrirPedido(){
  _items=[];_proTemp=null;
  ['np-cli-q','np-ven','np-obs','np-pro-q'].forEach(id=>document.getElementById(id).value='');
  const nv=document.getElementById('np-visita');if(nv)nv.value='';
  document.getElementById('np-cli-id').value='';
  ['np-cli-cod','np-cod'].forEach(id=>{const e=document.getElementById(id);if(e){e.value='';e.style.borderColor='';}});
  document.getElementById('np-cant').value='1';
  document.getElementById('np-precio').value='0';
  document.getElementById('np-dto').value='0';
  document.getElementById('np-cli-info').style.display='none';
  renderItems();
  document.getElementById('m-pedido').classList.add('on');
}

function dropCli(){
  const q=(document.getElementById('np-cli-q').value||'').toLowerCase();
  const drop=document.getElementById('np-cli-drop');
  if(q.length<1){drop.style.display='none';return;}
  const m=_clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.telefono||'').includes(q));
  drop.innerHTML=m.map(c=>`<div onmousedown="selCli(${c.id})"><strong>${c.nombre}</strong> <span style="color:var(--txt2);font-size:11px">${c.localidad} · ${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||''}</span></div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function selCli(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('np-cli-id').value=id;
  document.getElementById('np-cli-q').value=c.nombre;
  document.getElementById('np-cli-drop').style.display='none';
  const cc=document.getElementById('np-cli-cod');if(cc){cc.value=c.codigo||c.id||'';cc.style.borderColor='var(--P)';}
  document.getElementById('np-ven').value=c.vendedor||'';
  document.getElementById('np-dto').value=c.descuento||0;
  const dias=diasDesde(c.ultimo_remito);
  const info=document.getElementById('np-cli-info');
  const nombre=document.getElementById('np-cli-nombre');
  const detalle=document.getElementById('np-cli-detalle');
  const saldoEl=document.getElementById('np-cli-saldo');
  if(nombre)nombre.textContent=c.nombre;
  if(detalle)detalle.textContent=`📍 ${c.localidad||''} · ${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||''} · 📞 ${c.telefono||'—'} · Dto: ${c.descuento||0}%${dias!==null?' · Último rem: '+dias+' días':''}`;
  if(saldoEl){
    saldoEl.textContent=fmt(c.saldo||0);
    saldoEl.style.color=(c.saldo||0)>0?'var(--D)':'var(--P)';
  }
  info.style.display='block';
}

function dropPro(){
  const q=(document.getElementById('np-pro-q').value||'').toLowerCase();
  const drop=document.getElementById('np-pro-drop');
  if(q.length<1){drop.style.display='none';_proTemp=null;return;}
  const m=_productos.filter(p=>p.activo!==false&&((p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q)));
  drop.innerHTML=m.map(p=>{
    const stock=p.stock||0;
    const stockColor=stock<=0?'color:#C00000;font-weight:600':stock<=5?'color:#C55A11;font-weight:600':'color:var(--txt2)';
    const stockIcon=stock<=0?'❌ Sin stock':stock<=5?'⚠️ Stock bajo: '+stock:stock+' '+( p.unidad||'');
    return `<div class="drop-item" onmousedown="selPro(${p.id})">
      <div style="font-weight:600">${p.nombre}</div>
      <div style="display:flex;gap:8px;font-size:11px;margin-top:2px">
        <span style="color:var(--PD);font-weight:600">${fmt(p.precio)}</span>
        <span style="${stockColor}">${stockIcon}</span>
      </div>
    </div>`;
  }).join('');
  drop.style.display=m.length?'block':'none';
}

function selPro(id){
  _proTemp=_productos.find(x=>x.id===id);if(!_proTemp)return;
  document.getElementById('np-pro-q').value=_proTemp.nombre;
  document.getElementById('np-pro-drop').style.display='none';
  const cp=document.getElementById('np-cod');if(cp){cp.value=_proTemp.codigo||_proTemp.id;cp.style.borderColor='var(--P)';}
  document.getElementById('np-precio').value=_proTemp.precio||0;
  const cid=document.getElementById('np-cli-id').value;
  const c=cid?_clientes.find(x=>x.id==cid):null;
  const dto=Math.max(_proTemp.descuento||0, c?.descuento||0);
  document.getElementById('np-dto').value=dto;
}

function agregarItem(){
  if(!_proTemp){const q=(document.getElementById('np-pro-q').value||'').toLowerCase();_proTemp=_productos.find(p=>(p.nombre||'').toLowerCase().includes(q));}
  if(!_proTemp){alert('Seleccioná un producto');return;}
  const cant=parseFloat(document.getElementById('np-cant').value)||1;
  const precio=parseFloat(document.getElementById('np-precio').value)||0;
  const dto=parseFloat(document.getElementById('np-dto').value)||0;
  const ex=_items.find(i=>i.id===_proTemp.id);
  if(ex){ex.cant+=cant;}else{_items.push({id:_proTemp.id,nom:_proTemp.nombre,un:_proTemp.unidad||'',cant,precio,dto,iva:_proTemp.iva||21});}
  _proTemp=null;document.getElementById('np-pro-q').value='';document.getElementById('np-cant').value='1';
  const _npc=document.getElementById('np-cod');if(_npc){_npc.value='';_npc.style.borderColor='';}
  renderItems();
}

function renderItems(){
  const el=document.getElementById('np-items'),tb=document.getElementById('np-totbar');
  if(!el||!tb)return;
  if(!_items.length){el.innerHTML='<div class="empty" style="padding:14px">Agregá productos al pedido</div>';tb.style.display='none';return;}
  let sub=0,dtoT=0,ivaT=0,tot=0;
  el.innerHTML=_items.map((it,i)=>{
    const base=it.precio*it.cant,dtoA=base*(it.dto/100),neto=base-dtoA;let iva=0;
    sub+=base;dtoT+=dtoA;ivaT+=0;tot+=neto;
    return `<div class="pitem"><span class="pnom">${it.nom}</span><input type="number" value="${it.cant}" min="0.01" step="0.01" onchange="updItem(${i},'cant',this.value)" style="width:70px"><span style="color:var(--txt2);font-size:11px">${it.un}</span><input type="number" value="${it.precio}" onchange="updItem(${i},'precio',this.value)" style="width:90px;text-align:right"><span style="width:45px;text-align:center;font-size:11px;color:var(--txt2)">${it.dto?it.dto+'%':''}</span><span class="ptot">${fmt(it.precio*it.cant*(1-it.dto/100))}</span><button class="btn D sm" onclick="delItem(${i})">🗑</button></div>`;
  }).join('');
  tb.style.display='flex';
  document.getElementById('np-desglose').textContent=`Sub ${fmt(sub)}${dtoT>0?' | Dto '+fmt(dtoT):''}`;
  document.getElementById('np-total').textContent=fmt(tot);
}

function updItem(i,k,v){_items[i][k]=parseFloat(v)||0;renderItems();}

function delItem(i){_items.splice(i,1);renderItems();}

async function guardarPedido(){
  const cid=document.getElementById('np-cli-id').value;
  if(!cid){alert('Seleccioná un cliente');return;}
  if(!_items.length){alert('Agregá al menos un producto');return;}
  const c=_clientes.find(x=>x.id==cid);
  let tot=0;_items.forEach(it=>{tot+=it.precio*it.cant*(1-it.dto/100);});
  const {error}=await sb.from('pedidos').insert({
    cliente_id:parseInt(cid),cliente:c?.nombre||'?',localidad:c?.localidad||'',
    zona:c?.zona||'',vendedor:document.getElementById('np-ven').value||c?.vendedor||'',
    fecha:document.getElementById('np-fecha').value,observaciones:document.getElementById('np-obs').value,visita:document.getElementById('np-visita').value||null,
    items:_items,total:Math.round(tot*100)/100,estado:'pendiente'
  });
  if(error){alert('Error: '+error.message);return;}
  cerrar('m-pedido');await cargarPedidos();renderPedidos();renderDash();go('pedidos');
}

function toggleNuevoCompVentas(e){
  e.stopPropagation();
  const m=document.getElementById('nuevo-comp-ventas-menu');
  if(!m)return;
  const showing=m.style.display!=='none';
  m.style.display=showing?'none':'block';
  if(!showing){
    const close=()=>{m.style.display='none';document.removeEventListener('click',close);};
    setTimeout(()=>document.addEventListener('click',close),10);
  }
}

function cerrarMenuNuevoComp(){
  const m=document.getElementById('nuevo-comp-ventas-menu');if(m)m.style.display='none';
}

// ─── REMITO RÁPIDO ───
let _rrItems=[], _rrProTemp=null, _rrPedidoId=null;

// Fila de carga (estilo FoxPro): valores crudos tipeados en la última fila de
// #rr-items, todavía sin confirmar como ítem del remito. _rrProTemp guarda el
// producto ya resuelto (por código o por el desplegable de nombre). "lista"
// es la lista de precios elegida PARA ESTA FILA (cada producto puede llevar
// una distinta dentro del mismo remito) — se mantiene entre filas para no
// tener que reelegirla cada vez, pero se puede cambiar fila por fila.
let _rrStagingVals={cod:'',cant:'1',peso:'',precio:'0',dto:'0',lista:''};

function initRR(){
  document.getElementById('rr-fecha').value=new Date().toISOString().split('T')[0];
  _rrItems=[];_rrProTemp=null;
  _rrStagingVals={cod:'',cant:'1',peso:'',precio:'0',dto:'0',lista:''};
  ['rr-cli-q','rr-obs','rr-lugar'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const codCli=document.getElementById('rr-cli-cod');if(codCli){codCli.value='';codCli.style.borderColor='';}
  document.getElementById('rr-cli-id').value='';
  const info=document.getElementById('rr-cli-info');if(info)info.style.display='none';
  renderItemsRR();
  // Foco al campo de código de cliente
  setTimeout(()=>{
    const codCli=document.getElementById('rr-cli-cod');
    if(codCli) codCli.focus();
  }, 100);
}

// Opciones <option> de lista de precios para la columna "Lista" de la grilla.
function _rrListaOptions(selectedListaId){
  const sel=String(selectedListaId||'');
  return '<option value="">Base</option>'+_listasPrecios.map(l=>`<option value="${l.id}"${String(l.id)===sel?' selected':''}>${l.nombre}</option>`).join('');
}

// Cambio de lista de precios de un ítem YA cargado en el remito: reprecia
// solo esa fila, no todo el remito.
function actualizarListaItemRR(i,val){
  const it=_rrItems[i];if(!it)return;
  it.listaId=val?parseInt(val):null;
  const nuevoPrecio=it.listaId?getPrecioLista(it.id,it.listaId):null;
  if(nuevoPrecio!=null)it.precio=nuevoPrecio;
  renderItemsRR();
}

// Cambio de lista de precios de la fila de carga (todavía sin confirmar).
function actualizarListaStagingRR(val){
  _rrStagingVals.lista=val;
  if(_rrProTemp){
    const listaId=val?parseInt(val):null;
    const nuevoPrecio=listaId?getPrecioLista(_rrProTemp.id,listaId):null;
    _rrStagingVals.precio=String(nuevoPrecio!=null?nuevoPrecio:(_rrProTemp.precio||0));
  }
  renderItemsRR();
}

// ─── BUSCADOR POR NOMBRE (F1) ───
function abrirBuscadorCli(pfx){
  const m=_getModalMap()[pfx];if(!m)return;
  // Crear modal overlay temporal
  const existing=document.getElementById('modal-busq');
  if(existing)existing.remove();
  const div=document.createElement('div');
  div.id='modal-busq';
  div.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML=`
    <div style="background:var(--bg);border-radius:12px;padding:20px;width:420px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:14px">🔍 Buscar cliente</span>
        <button onclick="document.getElementById('modal-busq').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--txt2)">✕</button>
      </div>
      <input id="busq-cli-q" placeholder="Escribí nombre, dirección o teléfono..." autocomplete="off"
        style="padding:8px 12px;border:1px solid var(--brd);border-radius:8px;font-size:14px;margin-bottom:10px"
        oninput="filtrarBusqCli()"
        onkeydown="navBusq(event,'busq-cli-list','busq-cli-q',false)">
      <div id="busq-cli-list" style="overflow-y:auto;flex:1;max-height:50vh"></div>
    </div>`;
  document.body.appendChild(div);
  // Cerrar al hacer click fuera
  div.addEventListener('click',e=>{if(e.target===div)div.remove();});
  setTimeout(()=>{
    document.getElementById('busq-cli-q')?.focus();
    filtrarBusqCli(pfx);
  },50);
  div._pfx=pfx;
}

// ─── NAVEGACIÓN CON FLECHAS EN BUSCADOR F1 ───
let _busqIdx=-1;

function navBusq(e, listaId, inputId, esPro){
  const lista=document.getElementById(listaId);
  if(!lista)return;
  const items=lista.querySelectorAll('div[onmousedown]');
  if(!items.length)return;

  if(e.key==='ArrowDown'){
    e.preventDefault();
    _busqIdx=Math.min(_busqIdx+1, items.length-1);
    items.forEach((el,i)=>el.style.background=i===_busqIdx?'var(--PL)':'');
    items[_busqIdx]?.scrollIntoView({block:'nearest'});
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    _busqIdx=Math.max(_busqIdx-1, 0);
    items.forEach((el,i)=>el.style.background=i===_busqIdx?'var(--PL)':'');
    items[_busqIdx]?.scrollIntoView({block:'nearest'});
  } else if(e.key==='Enter'){
    e.preventDefault();
    if(_busqIdx>=0 && items[_busqIdx]){
      // Simular click en el item seleccionado
      const attr=items[_busqIdx].getAttribute('onmousedown');
      if(attr) eval(attr);
    } else if(items.length===1){
      // Si hay solo uno, seleccionarlo directo
      const attr=items[0].getAttribute('onmousedown');
      if(attr) eval(attr);
    }
    _busqIdx=-1;
  } else if(e.key==='Escape'){
    const modal=esPro?document.getElementById('modal-busq-pro'):document.getElementById('modal-busq');
    if(modal)modal.remove();
    _busqIdx=-1;
  }
}

function filtrarBusqCli(){
  _busqIdx=-1;
  const div=document.getElementById('modal-busq');if(!div)return;
  const pfx=div._pfx||'rr';
  const m=_getModalMap()[pfx];if(!m)return;
  const q=(document.getElementById('busq-cli-q')?.value||'').toLowerCase();
  const lista=document.getElementById('busq-cli-list');if(!lista)return;
  const res=_clientes.filter(c=>
    !q||
    (c.nombre||'').toLowerCase().includes(q)||
    (c.direccion||'').toLowerCase().includes(q)||
    (c.telefono||'').includes(q)||
    String(c.codigo||'').includes(q)
  );
  lista.innerHTML=res.length?res.map(c=>`
    <div onmousedown="selDesدeBuscador('${pfx}',${c.id})"
      style="padding:8px 10px;border-bottom:0.5px solid var(--brd);cursor:pointer;border-radius:6px"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${c.nombre} <span style="color:var(--txt2);font-size:11px">Cód: ${c.codigo||c.id}</span></div>
      <div style="font-size:11px;color:var(--txt2)">${c.direccion||''} ${c.localidad||''} ${c.telefono?'· Tel: '+c.telefono:''}</div>
    </div>`).join(''):'<div style="padding:12px;color:var(--txt2);font-size:12px">Sin resultados</div>';
}

function selDesدeBuscador(pfx,id){
  document.getElementById('modal-busq')?.remove();
  const m=_getModalMap()[pfx];if(!m)return;
  m.selCli(id);
}

function abrirBuscadorPro(pfx){
  const m=_getModalMap()[pfx];if(!m||!m.codPro)return;
  const existing=document.getElementById('modal-busq-pro');
  if(existing)existing.remove();
  const div=document.createElement('div');
  div.id='modal-busq-pro';
  div.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML=`
    <div style="background:var(--bg);border-radius:12px;padding:20px;width:420px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:14px">🔍 Buscar producto</span>
        <button onclick="document.getElementById('modal-busq-pro').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--txt2)">✕</button>
      </div>
      <input id="busq-pro-q" placeholder="Escribí nombre o código..." autocomplete="off"
        style="padding:8px 12px;border:1px solid var(--brd);border-radius:8px;font-size:14px;margin-bottom:10px"
        oninput="filtrarBusqPro()"
        onkeydown="navBusq(event,'busq-pro-list','busq-pro-q',true)">
      <div id="busq-pro-list" style="overflow-y:auto;flex:1;max-height:50vh"></div>
    </div>`;
  document.body.appendChild(div);
  div.addEventListener('click',e=>{if(e.target===div)div.remove();});
  div._pfx=pfx;
  setTimeout(()=>{
    document.getElementById('busq-pro-q')?.focus();
    filtrarBusqPro();
  },50);
}

function filtrarBusqPro(){
  _busqIdx=-1;
  const div=document.getElementById('modal-busq-pro');if(!div)return;
  const pfx=div._pfx||'rr';
  const m=_getModalMap()[pfx];if(!m)return;
  const q=(document.getElementById('busq-pro-q')?.value||'').toLowerCase();
  const lista=document.getElementById('busq-pro-list');if(!lista)return;
  const res=_productos.filter(p=>
    !q||
    (p.nombre||'').toLowerCase().includes(q)||
    String(p.codigo||'').includes(q)
  );
  lista.innerHTML=res.length?res.map(p=>`
    <div onmousedown="selProDesdeBuscador('${pfx}',${p.id})"
      style="padding:8px 10px;border-bottom:0.5px solid var(--brd);cursor:pointer;border-radius:6px"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${p.nombre} <span style="color:var(--txt2);font-size:11px">Cód: ${p.codigo||p.id}</span></div>
      <div style="font-size:11px;color:var(--txt2)">${fmt(p.precio)} · ${p.unidad||''} · Stock: ${p.stock||0}</div>
    </div>`).join(''):'<div style="padding:12px;color:var(--txt2);font-size:12px">Sin resultados</div>';
}

function selProDesdeBuscador(pfx,id){
  document.getElementById('modal-busq-pro')?.remove();
  const m=_getModalMap()[pfx];if(!m)return;
  m.selPro(id);
  setTimeout(()=>{const f=document.getElementById(m.focoProTras);if(f)f.focus();},50);
}

function buscarCodCli(pfx){
  const m=_getModalMap()[pfx];if(!m)return;
  const cod=(document.getElementById(m.codCli)?.value||'').trim();
  const el=document.getElementById(m.codCli);
  if(!cod){if(el)el.style.borderColor='';return;}
  const c=_clientes.find(x=>String(x.codigo||'').trim()===cod||String(x.id).trim()===cod);
  if(c){
    m.selCli(c.id);
    if(el)el.style.borderColor='var(--P)';
    // foco al siguiente campo útil
    const sig=document.getElementById(m.focoCliTras);
    if(sig)setTimeout(()=>{sig.focus();if(sig.select)sig.select();},150);
  } else {
    if(el)el.style.borderColor='var(--D)';
  }
}

function buscarCodPro(pfx){
  const m=_getModalMap()[pfx];if(!m||!m.codPro)return;
  const cod=(document.getElementById(m.codPro)?.value||'').trim();
  const el=document.getElementById(m.codPro);
  if(!cod){if(el)el.style.borderColor='';return;}
  const p=_productos.find(x=>String(x.codigo||'').trim()===cod||String(x.id).trim()===cod);
  if(p){
    m.selPro(p.id);
    if(el)el.style.borderColor='var(--P)';
    setTimeout(()=>{const f=document.getElementById(m.focoProTras);if(f)f.focus();},50);
  } else {
    el.style.borderColor='var(--D)';
  }
}

function buscarPorCodCli(){buscarCodCli('rr');}

function dropCliRR(){
  const inp=document.getElementById('rr-cli-q');
  const q=(inp.value||'').toLowerCase();
  const drop=document.getElementById('rr-cli-drop');
  if(q.length<1){drop.style.display='none';return;}
  const esAdmin=!!(usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin');
  const ven=(esAdmin?'':(usuarioActual?.vendedor||usuarioActual?.nombre||'')).toLowerCase();
  const m=_clientes.filter(c=>{
    const matchQ=(c.nombre||'').toLowerCase().includes(q)||(c.telefono||'').includes(q);
    if(!ven)return matchQ;
    return matchQ&&(c.vendedor||'').toLowerCase().includes(ven);
  });
  drop.innerHTML=m.map(c=>`<div onmousedown="selCliRR(${c.id})"><strong>${c.nombre}</strong> <span style="color:var(--txt2);font-size:11px">${c.localidad} · ${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||''}</span></div>`).join('');
  if(m.length){ajustarDrop(inp,drop);drop.style.display='block';}else{drop.style.display='none';}
}

function selCliRR(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('rr-cli-id').value=id;
  document.getElementById('rr-cli-q').value=c.nombre;
  document.getElementById('rr-cli-drop').style.display='none';
  const cc=document.getElementById('rr-cli-cod');if(cc){cc.value=c.codigo||c.id||'';cc.style.borderColor='var(--P)';}
  // Actualizar vendedor con el del cliente si corresponde
  const venEl=document.getElementById('rr-ven');
  const venShow=document.getElementById('rr-ven-show');
  const venNombre=c.vendedor||usuarioActual?.nombre||'';
  if(venEl) venEl.value=venNombre;
  if(venShow) venShow.textContent=venNombre||'Sin vendedor';
  // Por defecto para la fila de carga, la lista de precios asignada al
  // cliente (cada ítem la puede cambiar a mano en su propia columna).
  const listaCliente=getListaCliente(c.id);
  _rrStagingVals.lista=listaCliente?String(listaCliente):'';
  const dias=diasDesde(c.ultimo_remito);
  const info=document.getElementById('rr-cli-info');

  info.innerHTML=`<div style="font-weight:600;font-size:13px;margin-bottom:3px">${c.nombre}</div>
    <div style="font-size:12px;color:var(--txt2)">${c.direccion?'📍 '+c.direccion+', ':''} ${c.localidad||''} · ${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||''} | 📞 ${c.telefono||'—'} | Lista: <b>${c.lista||1}</b> | Dto: <b>${c.descuento||0}%</b> | Saldo CC: <b style="${(c.saldo||0)>0?'color:var(--D)':''}">${fmt(c.saldo)}</b>${dias!==null?` | Último rem: <b>${dias} días</b>`:''}</div>`;
  info.style.display='block';

  // Pedido pendiente → cartel compacto en el panel lateral (no tapa el remito)
  const pedPend=_pedidos.filter(p=>p.cliente_id===id&&p.estado==='pendiente');
  const pedPanel=document.getElementById('rr-pedido-panel');
  const pedInfo=document.getElementById('rr-pedido-info');
  const pedBtn=document.getElementById('rr-pedido-btn');
  if(pedPend.length){
    const ped=pedPend[0];
    if(pedPanel&&pedInfo&&pedBtn){
      const titEl=document.getElementById('rr-pedido-titulo');
      if(titEl)titEl.textContent=`📋 Pedido pendiente — ${c.nombre}`;
      const items=(ped.items||[]).slice(0,5).map(i=>`• ${i.nom} — ${i.cant} ${i.un||''}`).join('<br>');
      const plus=(ped.items||[]).length>5?`<br>...y ${(ped.items||[]).length-5} más`:'';
      pedInfo.innerHTML=`<b>#${ped.id}</b> · ${ped.fecha}<br><span style="color:var(--txt2)">${(ped.items||[]).length} productos · ${fmt(ped.total)}</span><div style="margin-top:6px;font-size:11px;color:var(--txt2)">${items}${plus}</div>`;
      pedBtn.onclick=()=>{cargarItemsDePedido(ped.id);setTimeout(()=>{const f=document.getElementById('rr-cod');if(f){f.focus();f.select();}},120);};
      const btnIgn=document.getElementById('rr-pedido-btn-ign');
      if(btnIgn)btnIgn.onclick=()=>{
        pedPanel.style.display='none';_rrPedidoId=null;
        setTimeout(()=>{const f=document.getElementById('rr-cod');if(f){f.focus();f.select();}},120);
      };
      const btnCan=document.getElementById('rr-pedido-btn-can');
      if(btnCan)btnCan.onclick=()=>{
        limpiarRR();
        setTimeout(()=>{const f=document.getElementById('rr-cli-cod');if(f){f.focus();f.select();}},80);
      };
      pedPanel.style.display='block';
    }
  } else {
    if(pedPanel)pedPanel.style.display='none';
    setTimeout(()=>{const f=document.getElementById('rr-cod');if(f){f.focus();f.select();}},120);
  }
}

function cargarItemsDePedido(pedId){
  const ped=_pedidos.find(x=>x.id===pedId);if(!ped)return;
  _rrPedidoId=pedId;
  const cid=document.getElementById('rr-cli-id').value;
  const c=_clientes.find(x=>x.id==cid);

  // Cargar los items del pedido al remito rápido (limpio la fila de carga en curso)
  _rrItems=[];
  _rrProTemp=null;_rrStagingVals={cod:'',cant:'1',peso:'',precio:'0',dto:'0'};
  (ped.items||[]).forEach(it=>{
    const prod=_productos.find(p=>p.id===it.id||p.nombre===it.nom);
    const precio=prod?.precio||it.precio||0;
    const dto=Math.max(it.dto||0, c?.descuento||0);
    const esPeso=(it.un||'').toLowerCase()==='kg';
    _rrItems.push({
      id:it.id,
      nom:it.nom,
      un:it.un||'',
      cant:it.cant,
      peso:0, // peso real de balanza, a completar para productos kg
      precio:precio,
      dto:dto,
      iva:it.iva||21,
      esPeso:esPeso,
      pedido_cant:it.cant
    });
  });
  renderItemsRR();
  
  // Mostrar aviso
  const info=document.getElementById('rr-cli-info');
  const avisoEl=info.querySelector('.aviso-pedido');
  if(!avisoEl){
    const div=document.createElement('div');
    div.className='aviso-pedido';
    div.style.cssText='margin-top:6px;padding:6px 10px;background:var(--PL);border-radius:6px;font-size:11px;color:var(--PD)';
    div.textContent=`✅ ${_rrItems.length} productos cargados del pedido #${pedId}. Ajustá los pesos reales donde corresponda.`;
    info.appendChild(div);
  }
}

function buscarPorCodigoRR(){
  const cod=(document.getElementById('rr-cod').value||'').trim();
  if(!cod)return;
  const prod=_productos.find(p=>String(p.codigo).trim()===cod);
  if(prod){
    selProRR(prod.id);
  } else {
    const el=document.getElementById('rr-cod');if(el)el.style.borderColor='var(--D)';
  }
}

function navDropProRR(e){
  const drop = document.getElementById('rr-pro-drop');
  const items = drop?.querySelectorAll('.drop-item');
  if(!items || !items.length){
    if(e.key==='ArrowUp'){e.preventDefault();document.getElementById('rr-cod').focus();}
    return;
  }
  let idx = Array.from(items).findIndex(i=>i.classList.contains('active'));
  if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,items.length-1);}
  else if(e.key==='ArrowUp'){
    e.preventDefault();
    if(idx<=0){drop.style.display='none';document.getElementById('rr-cod').focus();return;}
    idx=Math.max(idx-1,0);
  }
  else if(e.key==='Enter'&&idx>=0){e.preventDefault();items[idx].click();return;}
  else if(e.key==='Escape'){drop.style.display='none';return;}
  items.forEach(i=>i.classList.remove('active'));
  if(idx>=0){items[idx].classList.add('active');items[idx].scrollIntoView({block:'nearest'});}
}

// Celda Código de la fila de carga (estilo FoxPro): dígitos → código exacto
// (Enter/Tab confirma), letras → autocompletar por nombre (dropdown abajo).
function _rrCodKeydown(e){
  if(e.key==='F2'){e.preventDefault();abrirBuscadorPro('rr');return;}
  const drop=document.getElementById('rr-pro-drop');
  const items=drop?.querySelectorAll('.drop-item');
  if(items&&items.length&&drop.style.display!=='none'&&(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Enter'||e.key==='Escape')){
    navDropProRR(e);
    return;
  }
  if(e.key==='Enter'||(e.key==='Tab'&&e.target.value.trim())){
    e.preventDefault();
    buscarPorCodigoRR();
  }
}

function dropProRR(){
  const val=(document.getElementById('rr-cod')?.value||'').trim();
  const drop=document.getElementById('rr-pro-drop');
  if(!drop)return;
  if(!val){drop.style.display='none';_rrProTemp=null;return;}
  // Solo dígitos: es búsqueda por código exacto (Enter/Tab la resuelve), no autocompletar por nombre
  if(/^[0-9]+$/.test(val)){drop.style.display='none';return;}
  const q=val.toLowerCase();
  const m=_productos.filter(p=>p.activo!==false&&(p.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.length?m.map(p=>{
    const stock=p.stock||0;
    const stockColor=stock<=0?'color:#C00000;font-weight:600':stock<=5?'color:#C55A11;font-weight:600':'color:var(--txt2)';
    const stockIcon=stock<=0?'❌ Sin stock':stock<=5?'⚠️ Bajo: '+stock:stock+' '+(p.unidad||'');
    return `<div class="drop-item" onmousedown="selProRR(${p.id})" style="padding:9px 12px">
      <div style="font-weight:600;font-size:14px">${p.nombre}</div>
      <div style="display:flex;gap:8px;font-size:12px;margin-top:3px">
        <span style="color:var(--PD);font-weight:600">${fmt(p.precio)}</span>
        <span style="${stockColor}">${stockIcon}</span>
      </div>
    </div>`;
  }).join(''):'<div style="padding:8px;color:var(--txt2);font-size:12px">Sin resultados</div>';
  drop.style.display='block';
}

// Resuelve el producto (por código exacto o elegido del desplegable/buscador F2)
// para la fila de carga: llena código/precio/dto en _rrStagingVals y re-renderiza.
function selProRR(id){
  _rrProTemp=_productos.find(x=>x.id===id);if(!_rrProTemp)return;
  const drop=document.getElementById('rr-pro-drop');if(drop)drop.style.display='none';
  _rrStagingVals.cod=String(_rrProTemp.codigo||_rrProTemp.id);
  const listaId=_rrStagingVals.lista?parseInt(_rrStagingVals.lista):null;
  const precioLista=listaId?getPrecioLista(_rrProTemp.id,listaId):null;
  _rrStagingVals.precio=String(precioLista!=null?precioLista:(_rrProTemp.precio||0));
  const cid=document.getElementById('rr-cli-id').value;
  const c=cid?_clientes.find(x=>x.id==cid):null;
  _rrStagingVals.dto=String(Math.max(_rrProTemp.descuento||0,c?.descuento||0));
  if(!_rrStagingVals.cant)_rrStagingVals.cant='1';
  // Si es producto por peso, dejar el peso vacío para que se complete a mano
  const unidad=(_rrProTemp.unidad||'').toLowerCase().trim();
  const esPeso=['kg','kilo','kilos','k','kilogramo','kilogramos'].includes(unidad);
  _rrStagingVals.peso=esPeso?'':'0';
  renderItemsRR();
  setTimeout(()=>{
    const f=document.getElementById('rr-'+(esPeso?'peso':'cant'));
    if(f){f.focus();f.select();}
  },80);
}

// Navegación Código→Cant/Peso→Precio→Dto de la fila de carga. Al completar la
// última celda, confirma el ítem y deja lista una fila nueva vacía (sin botón Agregar).
function _rrStagingKeydown(e,campo){
  if(e.key!=='Enter'&&e.key!=='Tab')return;
  e.preventDefault();
  if(campo==='peso'){
    const peso=parseFloat(e.target.value)||0;
    if(peso<=0){
      e.target.style.borderColor='var(--D)';e.target.style.background='#fdecea';
      e.target.focus();e.target.select();
      return;
    }
  }
  const esPeso=_rrProTemp&&['kg','kilo','kilos','k','kilogramo','kilogramos'].includes((_rrProTemp.unidad||'').toLowerCase().trim());
  const orden=esPeso?['peso','precio','dto']:['cant','precio','dto'];
  const idx=orden.indexOf(campo);
  if(idx<0||idx>=orden.length-1){_rrCommitStaging();return;}
  const f=document.getElementById('rr-'+orden[idx+1]);
  if(f){f.focus();f.select();}
}

function updStagingRR(campo,v,inputEl){
  _rrStagingVals[campo]=v;
  renderItemsRR();
  if(!inputEl)return;
  // Mismo cuidado que updItemRR: restaurar el string crudo tipeado para no
  // pisar un punto decimal a medio escribir con el valor ya parseado, y
  // dejar el cursor al final (si no, al reenfocar vuelve a la posición 0 y
  // lo siguiente que tipeás se inserta ANTES de lo ya escrito).
  const el2=document.getElementById('rr-'+campo);
  if(el2){el2.value=v;el2.focus();el2.setSelectionRange(v.length,v.length);}
}

function _rrCommitStaging(){
  if(!_rrProTemp){alert('Seleccioná un producto (código o nombre)');return;}
  const cant=parseFloat(_rrStagingVals.cant)||1;
  const peso=parseFloat(_rrStagingVals.peso)||0;
  const precio=parseFloat(_rrStagingVals.precio)||0;
  const dto=parseFloat(_rrStagingVals.dto)||0;
  const unidad=(_rrProTemp.unidad||'').toLowerCase().trim();
  const esPorPeso=['kg','kilo','kilos','k','kilogramo','kilogramos'].includes(unidad);
  if(esPorPeso&&peso<=0){
    alert('⚠️ '+_rrProTemp.nombre+' se vende por kg. Ingresá el peso real de la balanza.');
    const f=document.getElementById('rr-peso');
    if(f){f.focus();f.select();f.style.borderColor='var(--D)';}
    return;
  }
  const unFinal=esPorPeso?'kg':(_rrProTemp.unidad||'un');
  const listaId=_rrStagingVals.lista?parseInt(_rrStagingVals.lista):null;
  const ex=_rrItems.find(i=>i.id===_rrProTemp.id);
  if(ex){ex.cant+=cant;if(esPorPeso)ex.peso=(ex.peso||0)+peso;}
  else{_rrItems.push({id:_rrProTemp.id,nom:_rrProTemp.nombre,un:unFinal,cant,peso:esPorPeso?peso:0,precio,dto,iva:_rrProTemp.iva||21,esPeso:esPorPeso,listaId});}
  _rrProTemp=null;
  // Se mantiene "lista" para la próxima fila (uso típico: mismo cliente,
  // misma lista casi siempre) — el resto de los campos sí se limpia.
  _rrStagingVals={cod:'',cant:'1',peso:'',precio:'0',dto:'0',lista:_rrStagingVals.lista};
  renderItemsRR();
  setTimeout(()=>{const f=document.getElementById('rr-cod');if(f)f.focus();},80);
}

function _rrStagingRowHTML(){
  const p=_rrProTemp;
  const unidad=p?(p.unidad||'').toLowerCase().trim():'';
  const esPeso=p?['kg','kilo','kilos','k','kilogramo','kilogramos'].includes(unidad):false;
  const cant=parseFloat(_rrStagingVals.cant)||0;
  const peso=parseFloat(_rrStagingVals.peso)||0;
  const precio=parseFloat(_rrStagingVals.precio)||0;
  const dto=parseFloat(_rrStagingVals.dto)||0;
  const q=esPeso?peso:cant;
  const neto=p&&q>0?precio*q*(1-dto/100):0;
  const pesoCol=p&&esPeso
    ?`<input type="text" inputmode="decimal" id="rr-peso" value="${_rrStagingVals.peso}" oninput="updStagingRR('peso',this.value,this)" onkeydown="_rrStagingKeydown(event,'peso')" style="width:70px;${peso<=0?'border-color:var(--D);background:#fdecea':''}" placeholder="kg real" title="Peso real de balanza">`
    :`<span style="width:70px;display:inline-block;text-align:center;font-size:12px;color:var(--txt2)">—</span>`;
  return `<div class="pitem rr-staging">
    <span class="drop-wrap" style="width:55px;flex-shrink:0;position:relative">
      <input id="rr-cod" value="${_rrStagingVals.cod}" placeholder="Cód." autocomplete="off" title="Código de producto — F2 para buscar por nombre"
        oninput="dropProRR()" onkeydown="_rrCodKeydown(event)" style="width:100%;text-align:center">
      <div class="drop" id="rr-pro-drop" style="width:280px"></div>
    </span>
    <input id="rr-pro-q" readonly tabindex="-1" value="${p?p.nombre:''}" placeholder="— código o nombre (F2) —" style="flex:1">
    <select id="rr-item-lista" onchange="actualizarListaStagingRR(this.value)" style="width:72px;font-size:11px" title="Lista de precios para este producto">${_rrListaOptions(_rrStagingVals.lista)}</select>
    <input type="text" inputmode="decimal" id="rr-cant" value="${_rrStagingVals.cant}" oninput="updStagingRR('cant',this.value,this)" onkeydown="_rrStagingKeydown(event,'cant')" style="width:58px" title="Cantidad">
    ${pesoCol}
    <input type="text" inputmode="decimal" id="rr-precio" value="${_rrStagingVals.precio}" oninput="updStagingRR('precio',this.value,this)" onkeydown="_rrStagingKeydown(event,'precio')" style="width:88px;text-align:right">
    <input type="text" inputmode="decimal" id="rr-dto" value="${_rrStagingVals.dto}" oninput="updStagingRR('dto',this.value,this)" onkeydown="_rrStagingKeydown(event,'dto')" style="width:42px;text-align:center">
    <span class="ptot">${neto>0?fmt(neto):'—'}</span>
    <span style="width:32px"></span>
  </div>`;
}

function renderItemsRR(){
  const el=document.getElementById('rr-items'),tb=document.getElementById('rr-totbar');
  let sub=0,dtoT=0,tot=0;
  const rows=_rrItems.map((it,i)=>{
    const q=it.esPeso?(it.peso||0):it.cant;
    const base=it.precio*q,dtoA=base*(it.dto/100),neto=base-dtoA;
    sub+=base;dtoT+=dtoA;tot+=neto;
    const pedidoCant=it.pedido_cant?`<span style="color:var(--txt2);font-size:10px">(ped:${it.pedido_cant})</span>`:'';
    const codigo=_productos.find(p=>p.id===it.id)?.codigo||'';
    const pesoCol=it.esPeso
      ?`<input type="text" inputmode="decimal" data-idx="${i}" data-field="peso" value="${it.peso||''}" oninput="updItemRR(${i},'peso',this.value,this)" style="width:70px;${(it.peso||0)===0?'border-color:var(--W)':''}" placeholder="kg real" title="Peso real de balanza">`
      :`<span style="width:70px;display:inline-block;text-align:center;font-size:12px;color:var(--txt2)">—</span>`;
    return `<div class="pitem" style="${it.esPeso&&(it.peso||0)===0?'border:1px solid var(--W);background:var(--WL)':''}">
      <span style="width:55px;flex-shrink:0;text-align:center;font-size:11px;color:var(--txt2)">${codigo}</span>
      <span class="pnom">${it.nom}${it.esPeso?' <span class="b bA" style="font-size:10px">kg</span>':''} ${pedidoCant}</span>
      <select onchange="actualizarListaItemRR(${i},this.value)" style="width:72px;font-size:11px" title="Lista de precios para este producto">${_rrListaOptions(it.listaId)}</select>
      <input type="text" inputmode="decimal" data-idx="${i}" data-field="cant" value="${it.cant}" oninput="updItemRR(${i},'cant',this.value,this)" style="width:58px" title="Cantidad">
      ${pesoCol}
      <input type="text" inputmode="decimal" data-idx="${i}" data-field="precio" value="${it.precio}" oninput="updItemRR(${i},'precio',this.value,this)" style="width:88px;text-align:right">
      <span style="width:42px;text-align:center;font-size:11px;color:var(--txt2)">${it.dto?it.dto+'%':''}</span>
      <span class="ptot">${q>0?fmt(neto):'—'}</span>
      <button class="btn D sm" onclick="delItemRR(${i})">🗑</button>
    </div>`;
  }).join('');
  const header=`<div class="fx-grid-head" style="display:flex;gap:6px;padding:2px 8px 3px;font-size:10px;font-weight:700;text-transform:uppercase">
    <span style="width:55px;text-align:center">Cód.</span>
    <span style="flex:1">Producto</span>
    <span style="width:72px;text-align:center">Lista</span>
    <span style="width:58px;text-align:center">Cant.</span>
    <span style="width:70px;text-align:center">Peso KG</span>
    <span style="width:88px;text-align:right">Precio</span>
    <span style="width:42px;text-align:center">Dto</span>
    <span style="min-width:80px;text-align:right">Subtotal</span>
    <span style="width:32px"></span>
  </div>`;
  el.innerHTML=header+rows+_rrStagingRowHTML();
  const sinPeso=_rrItems.filter(it=>it.esPeso&&(it.peso||0)===0).length;
  if(sinPeso){
    el.innerHTML+=`<div style="background:var(--WL);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--W);margin-top:6px">⚠️ ${sinPeso} producto(s) por kg sin peso. Completá el peso real de la balanza.</div>`;
  }
  tb.style.display=_rrItems.length?'flex':'none';
  document.getElementById('rr-desglose').textContent=`Sub ${fmt(sub)}${dtoT>0?' | Dto '+fmt(dtoT):''}`;
  document.getElementById('rr-total').textContent=fmt(tot);
}

function updItemRR(i,k,v,inputEl){
  _rrItems[i][k]=parseFloat(v)||0;
  renderItemsRR();
  if(!inputEl)return;
  // Restaurar el string crudo tipeado (ej "1." antes de terminar "1.5") y el
  // cursor al final: sin esto, al reenfocar el cursor vuelve al principio y
  // el siguiente caracter tipeado se inserta ANTES de lo ya escrito.
  const el2=document.querySelector(`#rr-items input[data-idx="${i}"][data-field="${k}"]`);
  if(el2){el2.value=v;el2.focus();el2.setSelectionRange(v.length,v.length);}
}

function delItemRR(i){_rrItems.splice(i,1);renderItemsRR();}

function limpiarRR(){
  _rrItems=[];_rrProTemp=null;_rrPedidoId=null;
  _rrStagingVals={cod:'',cant:'1',peso:'',precio:'0',dto:'0'};
  document.getElementById('rr-cli-q').value='';
  document.getElementById('rr-cli-id').value='';
  const cc=document.getElementById('rr-cli-cod');if(cc){cc.value='';cc.style.borderColor='';}
  document.getElementById('rr-cli-info').style.display='none';
  document.getElementById('rr-obs').value='';
  const pedPanel=document.getElementById('rr-pedido-panel');
  if(pedPanel)pedPanel.style.display='none';
  renderItemsRR();
}

async function descontarStock(items){
  for(const it of items){
    if(!(it.cant>0))continue;
    const prod=_productos.find(p=>p.id===(it.id||it.producto_id));
    if(!prod)continue;
    const nuevoStock=Math.max(0,(prod.stock||0)-it.cant);
    const {error}=await sb.from('productos').update({stock:nuevoStock}).eq('id',prod.id);
    if(!error)prod.stock=nuevoStock;
  }
}

async function emitirRemitoRapido(){
  const cid=document.getElementById('rr-cli-id').value;
  if(!cid){alert('Seleccioná un cliente');return;}
  if(!_rrItems.length){alert('Agregá al menos un producto');return;}
  const c=_clientes.find(x=>x.id==cid);
  let tot=0;_rrItems.forEach(it=>{const q=it.esPeso?(it.peso||0):it.cant;tot+=it.precio*q*(1-it.dto/100);});
  tot=Math.round(tot*100)/100;
  const {data:rem,error}=await sb.from('remitos').insert({
    cliente_id:parseInt(cid),cliente:c?.nombre||'?',localidad:c?.localidad||'',
    zona:c?.zona||'',vendedor:document.getElementById('rr-ven').value||c?.vendedor||'',
    fecha:document.getElementById('rr-fecha').value,
    items:_rrItems,total:tot,cobrado:false,
    observaciones:document.getElementById('rr-obs').value,
    lugar_entrega:document.getElementById('rr-lugar')?.value||'',
    direccion:c?.direccion||c?.domicilio||'',
    telefono:c?.telefono||''
  }).select().single();
  if(error){alert('Error: '+error.message);return;}
  // Calcular total descuentos
  const totDescuento=_rrItems.reduce((a,it)=>{
    const q=it.esPeso?(it.peso||0):it.cant;
    const bruto=it.precio*q;
    const neto=bruto*(1-(it.dto||0)/100);
    return a+(bruto-neto);
  },0);
  // Actualizar CC cliente
  await sb.from('clientes').update({
    saldo:(c?.saldo||0)+tot,
    total_comprado:(c?.total_comprado||0)+tot,
    ultimo_remito:rem.fecha
  }).eq('id',c.id);
  // Asiento contable automático
  const {data:asiento}=await sb.from('asientos').insert({
    fecha:rem.fecha,
    descripcion:`Remito R-${String(rem.id).padStart(4,'0')} - ${c?.nombre}`,
    tipo:'VENTA',referencia_id:rem.id,referencia_tipo:'remito'
  }).select().single();
  if(asiento){
    const detalle=[
      {asiento_id:asiento.id,cuenta_cod:'11201',cuenta_nom:'Deudores por Ventas',debe:tot,haber:0},
      {asiento_id:asiento.id,cuenta_cod:'40100',cuenta_nom:'Ventas',debe:0,haber:tot+(totDescuento||0)},
    ];
    if(totDescuento>0){
      detalle.push({asiento_id:asiento.id,cuenta_cod:'50305',cuenta_nom:'Descuentos Concedidos',debe:totDescuento,haber:0});
    }
    await sb.from('asientos_detalle').insert(detalle);
  }
  await descontarStock(_rrItems);
  if(_rrPedidoId){await sb.from('pedidos').update({estado:'remitado',remito_id:rem.id}).eq('id',_rrPedidoId);}
  await Promise.all([cargarRemitos(),cargarClientes(),cargarProductos(),cargarPedidos()]);
  limpiarRR();
  setTimeout(()=>{const el=document.getElementById('rr-cli-cod');if(el){el.focus();el.select();}},80);
  renderDash();renderCC();renderRemitos();
  // Guardar remito actual por si quiere imprimir después
  _remActual=rem;_verTipo='remito';
  // Mostrar opciones sin confirm bloqueante
  const num='R-'+String(rem.id).padStart(4,'0');
  const toast = document.createElement('div');
  toast.style.cssText='position:fixed;bottom:20px;right:20px;background:var(--bg);border:1px solid var(--P);border-radius:10px;padding:14px 18px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:flex;flex-direction:column;gap:8px';
  toast.innerHTML=`
    <div style="font-weight:600;font-size:14px;color:var(--P)">✅ Remito ${num} grabado</div>
    <div style="font-size:13px;color:var(--txt2)">${rem.cliente} · ${fmt(rem.total)}</div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button onclick="imprimirRemito();this.closest('div[style*=fixed]').remove()" style="flex:1;padding:8px;background:var(--P);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">🖨️ Imprimir</button>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:8px;background:var(--bg2);border:0.5px solid var(--brd);border-radius:6px;cursor:pointer">Cerrar</button>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(()=>{ if(toast.parentNode) toast.remove(); }, 8000);
  // Facturación secuencial por carga (pesaje real, cajón por cajón): avanzar
  // al siguiente pedido pendiente en vez de dejar el formulario en blanco.
  if(_facturandoCargaId)_facturarSiguientePedidoCarga();
  return rem.id;
}

let _ncs=[], _ncItems=[], _ncProTemp=null;

async function cargarNCs(){const {data}=await sb.from('notas_credito').select('*').order('created_at',{ascending:false});_ncs=data||[];}

function toggleNCItems(){
  const motivo=document.getElementById('nc-motivo').value;
  const esDevolucion=motivo==='devolucion';
  // Sección de items (campos producto + lista) — visible solo en devolución
  const secProd=document.getElementById('nc-sec-producto');
  if(secProd){
    // Dentro de nc-sec-producto, el buscador y la grilla siempre visibles en devolución
    // En modo descuento/error/anulación mostrar solo el campo importe
    const gridItem=secProd.querySelector('.nc-grid-items');
    if(gridItem)gridItem.style.display=esDevolucion?'':'none';
  }
  const impWrap=document.getElementById('nc-importe-wrap');
  if(impWrap)impWrap.style.display=esDevolucion?'none':'block';
  const tb=document.getElementById('nc-totbar');if(tb)tb.style.display=esDevolucion&&_ncItems.length?'flex':'none';
  if(!esDevolucion){_ncItems=[];const li=document.getElementById('nc-items-lista');if(li)li.innerHTML='';}
}

function ncSetModo(modo){
  const isF=modo==='factura';
  const secF=document.getElementById('nc-sec-factura');
  const secP=document.getElementById('nc-sec-producto');
  const btnF=document.getElementById('nc-modo-fac');
  const btnP=document.getElementById('nc-modo-prod');
  if(secF)secF.style.display=isF?'block':'none';
  if(secP)secP.style.display=isF?'none':'block';
  if(btnF){btnF.className=isF?'btn P sm':'btn sm';}
  if(btnP){btnP.className=isF?'btn sm':'btn P sm';}
  // Reset imputacion sections
  const fs=document.getElementById('nc-facturas-section');if(fs)fs.style.display='none';
  const is=document.getElementById('nc-imputacion-section');if(is)is.style.display='none';
  const iw=document.getElementById('nc-imputacion-wrap');if(iw)iw.style.display='none';
  _ncItems=[];
  const li=document.getElementById('nc-items-lista');if(li)li.innerHTML='';
  const tb=document.getElementById('nc-totbar');if(tb)tb.style.display='none';
}

function abrirNC(){
  _ncItems=[];_ncProTemp=null;
  ['nc-cli-q','nc-pro-q','nc-obs-m'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['nc-cli-id','nc-cli-cod','nc-cod'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.style.borderColor='';}});
  const cant=document.getElementById('nc-cant');if(cant)cant.value='1';
  const precio=document.getElementById('nc-precio');if(precio)precio.value='0';
  const motivo=document.getElementById('nc-motivo');if(motivo)motivo.value='devolucion';
  const imp=document.getElementById('nc-importe');if(imp)imp.value='0';
  const fecha=document.getElementById('nc-fecha-m');if(fecha)fecha.value=new Date().toISOString().split('T')[0];
  const hist=document.getElementById('nc-historial-precio');if(hist)hist.style.display='none';
  ncSetModo('producto');
  toggleNCItems();
  document.getElementById('m-nc').classList.add('on');
}

function dropCliNC(){
  const q=(document.getElementById('nc-cli-q').value||'').toLowerCase();
  const drop=document.getElementById('nc-cli-drop');
  if(q.length<1){drop.style.display='none';return;}
  const m=_clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.map(c=>`<div onmousedown="selCliNC(${c.id})"><strong>${c.nombre}</strong> <span style="color:var(--txt2);font-size:11px">Saldo: ${fmt(c.saldo)}</span></div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function selCliNC(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('nc-cli-id').value=id;
  document.getElementById('nc-cli-q').value=c.nombre;
  document.getElementById('nc-cli-drop').style.display='none';
  const cc=document.getElementById('nc-cli-cod');if(cc){cc.value=c.codigo||c.id||'';cc.style.borderColor='var(--P)';}

  // Si hay un producto ya seleccionado, actualizar historial ahora
  if(_ncProTemp)_mostrarHistorialNC(_ncProTemp.id,id);

  // Mostrar facturas pendientes
  const remsPend=_remitos.filter(r=>r.cliente_id===id&&!r.cobrado).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const renderFacturasHTML=(label)=>{
    if(!remsPend.length) return '';
    return `<div style="font-size:12px;color:var(--txt2);margin-bottom:6px">${label}</div>`+
    remsPend.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:0.5px solid var(--brd);font-size:13px">
      <input type="radio" name="nc-factura" id="nc-fac-${r.id}" value="${r.id}" style="width:16px;height:16px"
        onkeydown="if(event.key==='Home'){event.preventDefault();verRemitoEnCobro(${r.id})}" title="Inicio = ver factura">
      <label for="nc-fac-${r.id}" style="flex:1;cursor:pointer">
        <strong style="text-decoration:underline;color:var(--P);cursor:pointer" onclick="event.preventDefault();event.stopPropagation();verRemitoEnCobro(${r.id})">R-${String(r.id).padStart(4,'0')}</strong>
        <span style="color:var(--txt2);font-size:11px;margin-left:6px">${r.fecha}</span>
        <span style="color:var(--D);font-weight:600;margin-left:8px">${fmt(r.saldo_pendiente||r.total)}</span>
      </label>
    </div>`).join('');
  };
  // Modo factura: mostrar en nc-sec-factura
  const facSec=document.getElementById('nc-facturas-section');
  const facList=document.getElementById('nc-facturas-lista');
  const facEmpty=document.getElementById('nc-facturas-empty');
  if(facSec&&facList){
    if(remsPend.length){
      facSec.style.display='block';
      facList.innerHTML=renderFacturasHTML('Seleccioná la factura a anular:');
      if(facEmpty)facEmpty.style.display='none';
    } else {
      facSec.style.display='none';
      if(facEmpty)facEmpty.style.display='block';
    }
  }
  // Modo producto: mostrar en nc-imputacion-wrap
  const impWrap=document.getElementById('nc-imputacion-wrap');
  const impSec=document.getElementById('nc-imputacion-section');
  const impList=document.getElementById('nc-imputacion-lista');
  if(impWrap&&impSec&&impList){
    if(remsPend.length){
      impWrap.style.display='block';
      impSec.style.display='block';
      impList.innerHTML=renderFacturasHTML('Imputar contra (opcional):');
    } else {
      impWrap.style.display='none';
      impSec.style.display='none';
    }
  }
}

function buscarPorCodigoNC(){
  const cod=(document.getElementById('nc-cod').value||'').trim();
  if(!cod)return;
  const prod=_productos.find(p=>String(p.codigo).trim()===cod);
  if(prod){
    selProNC(prod.id);
    document.getElementById('nc-cod').style.borderColor='var(--P)';
    document.getElementById('nc-cant').focus();
  } else {
    document.getElementById('nc-cod').style.borderColor='var(--D)';
  }
}

function dropProNC(){
  const q=(document.getElementById('nc-pro-q').value||'').toLowerCase();
  const drop=document.getElementById('nc-pro-drop');
  if(q.length<1){drop.style.display='none';_ncProTemp=null;return;}
  const m=_productos.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q));
  drop.innerHTML=m.map(p=>`<div onmousedown="selProNC(${p.id})"><strong>${p.nombre}</strong> <span style="color:var(--txt2);font-size:11px">${fmt(p.precio)} · stock:${p.stock||0} ${p.unidad||''}</span></div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function _mostrarHistorialNC(prodId, cliId){
  if(!cliId||!prodId){
    const secHist=document.getElementById('nc-historial-precio');
    if(secHist){
      if(prodId&&!cliId){secHist.style.display='block';secHist.innerHTML='<div style="font-size:12px;color:var(--W);padding:6px">⚠ Seleccioná el cliente para ver el historial de precios</div>';}
      else secHist.style.display='none';
    }
    return;
  }
  const prod=_productos.find(x=>x.id===prodId);
  const remitosCliente=_remitos.filter(r=>r.cliente_id===cliId&&r.items);
  const historial=[];
  remitosCliente.forEach(r=>{
    let items=r.items;
    if(typeof items==='string'){try{items=JSON.parse(items);}catch(e){return;}}
    if(!Array.isArray(items))return;
    const item=items.find(it=>it.id===prodId||it.prod_id===prodId||(it.nom||'').toLowerCase()===(prod?.nombre||'').toLowerCase());
    if(item)historial.push({fecha:r.fecha,remito_id:r.id,precio:item.precio||item.p||0,cant:item.cant||item.q||1});
  });
  const secHist=document.getElementById('nc-historial-precio');
  if(!secHist)return;
  if(historial.length){
    historial.sort((a,b)=>b.fecha.localeCompare(a.fecha));
    secHist.style.display='block';
    secHist.innerHTML=`<div style="font-size:11px;font-weight:600;color:var(--txt2);text-transform:uppercase;margin-bottom:6px">Últimos remitos con este producto</div>`+
      historial.slice(0,5).map(h=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg2);border-radius:6px;margin-bottom:4px;cursor:pointer"
        onclick="document.getElementById('nc-precio').value='${h.precio}';this.closest('#nc-historial-precio').querySelectorAll('div[onclick]').forEach(d=>d.style.background='var(--bg2)');this.style.background='var(--PL)'">
        <span style="font-size:12px">R-${String(h.remito_id).padStart(4,'0')} · ${h.fecha} · ${fmtN(h.cant,2)} ${prod?.unidad||''}</span>
        <span style="font-size:13px;font-weight:700;color:var(--PD)">${fmt(h.precio)} <span style="font-size:10px;color:var(--txt2)">👆 usar</span></span>
      </div>`).join('');
  } else {
    secHist.style.display='block';
    secHist.innerHTML='<div style="font-size:12px;color:var(--txt2);padding:6px">Sin remitos con este producto para el cliente seleccionado</div>';
  }
}

function selProNC(id){
  _ncProTemp=_productos.find(x=>x.id===id);if(!_ncProTemp)return;
  document.getElementById('nc-pro-q').value=_ncProTemp.nombre;
  document.getElementById('nc-pro-drop').style.display='none';
  document.getElementById('nc-precio').value=_ncProTemp.precio||0;
  const cp=document.getElementById('nc-cod');if(cp){cp.value=_ncProTemp.codigo||_ncProTemp.id;cp.style.borderColor='var(--P)';}

  // Buscar historial de precios de este producto para el cliente seleccionado
  const cliId=parseInt(document.getElementById('nc-cli-id').value)||0;
  _mostrarHistorialNC(id,cliId);
}

function agregarItemNC(){
  if(!_ncProTemp){const q=(document.getElementById('nc-pro-q').value||'').toLowerCase();_ncProTemp=_productos.find(p=>(p.nombre||'').toLowerCase().includes(q));}
  if(!_ncProTemp){alert('Seleccioná un producto');return;}
  const cant=parseFloat(document.getElementById('nc-cant').value)||1;
  const precio=parseFloat(document.getElementById('nc-precio').value)||0;
  const ex=_ncItems.find(i=>i.id===_ncProTemp.id);
  if(ex){ex.cant+=cant;}
  else{_ncItems.push({id:_ncProTemp.id,nom:_ncProTemp.nombre,un:_ncProTemp.unidad||'',cant,precio,iva:_ncProTemp.iva||21});}
  _ncProTemp=null;
  document.getElementById('nc-pro-q').value='';
  document.getElementById('nc-cant').value='1';
  const _ncc=document.getElementById('nc-cod');if(_ncc){_ncc.value='';_ncc.style.borderColor='';}
  renderItemsNC();
}

function renderItemsNC(){
  const el=document.getElementById('nc-items-lista');
  const tb=document.getElementById('nc-totbar');
  if(!_ncItems.length){el.innerHTML='';tb.style.display='none';return;}
  let tot=0;
  el.innerHTML=_ncItems.map((it,i)=>{
    const subtot=it.precio*it.cant;tot+=subtot;
    return `<div class="pitem">
      <span class="pnom">${it.nom}</span>
      <input type="number" value="${it.cant}" min="0.01" step="0.01" onchange="_ncItems[${i}].cant=parseFloat(this.value)||0;renderItemsNC()" style="width:70px">
      <span style="color:var(--txt2);font-size:11px">${it.un}</span>
      <span class="ptot">${fmt(subtot)}</span>
      <button class="btn D sm" onclick="_ncItems.splice(${i},1);renderItemsNC()">🗑</button>
    </div>`;
  }).join('');
  tb.style.display='flex';
  document.getElementById('nc-total').textContent=fmt(tot);
}

async function guardarNC(){
  const cid=document.getElementById('nc-cli-id').value;
  if(!cid){alert('Seleccioná un cliente');return;}
  const motivo=document.getElementById('nc-motivo').value;
  const c=_clientes.find(x=>x.id==cid);
  let imp=0;
  if(motivo==='devolucion'){
    if(!_ncItems.length){alert('Agregá al menos un producto a devolver');return;}
    imp=_ncItems.reduce((a,it)=>a+it.precio*it.cant,0);
  } else {
    imp=parseFloat(document.getElementById('nc-importe')?.value)||0;
    if(imp<=0){alert('Ingresá un importe');return;}
  }
  imp=Math.round(imp*100)/100;

  // Ver si hay factura seleccionada para imputar
  const facturaSeleccionada=document.querySelector('input[name="nc-factura"]:checked');
  const remito_id=facturaSeleccionada?parseInt(facturaSeleccionada.value):null;

  const {data:nc,error}=await sb.from('notas_credito').insert({
    cliente_id:parseInt(cid),cliente:c?.nombre||'?',
    fecha:document.getElementById('nc-fecha-m').value,
    motivo,importe:imp,
    items:motivo==='devolucion'?_ncItems:null,
    observaciones:document.getElementById('nc-obs-m').value,
    remito_id:remito_id
  }).select().single();
  if(error){alert('Error: '+error.message);return;}

  // Descontar saldo cliente
  if(c){await sb.from('clientes').update({saldo:Math.max(0,(c.saldo||0)-imp)}).eq('id',c.id);}

  // Si hay factura seleccionada, actualizar su saldo pendiente
  if(remito_id){
    const rem=_remitos.find(r=>r.id===remito_id);
    if(rem){
      const saldoActual=rem.saldo_pendiente||rem.total;
      const nuevoSaldo=Math.max(0,saldoActual-imp);
      await sb.from('remitos').update({
        saldo_pendiente:nuevoSaldo,
        cobrado:nuevoSaldo<=0
      }).eq('id',remito_id);
    }
  }

  // Si es devolución, devolver stock
  if(motivo==='devolucion'){
    for(const it of _ncItems){
      const prod=_productos.find(p=>p.id===it.id);
      if(prod){
        await sb.from('productos').update({stock:(prod.stock||0)+it.cant}).eq('id',prod.id);
      }
    }
  }

  cerrar('m-nc');
  await Promise.all([cargarClientes(),cargarProductos(),cargarNCs(),cargarRemitos()]);
  renderCC();renderDash();actualizarDeuda();renderNCs();renderProductos();renderRemitos();
  alert(`✅ Nota de crédito emitida por ${fmt(imp)}.\nSaldo de ${c?.nombre} actualizado.${remito_id?' Imputada contra R-'+String(remito_id).padStart(4,'0')+'.':''}${motivo==='devolucion'?' Stock actualizado.':''}`);
  return nc.id;
}

function verNCDetalle(id){
  const n=_ncs.find(x=>x.id===id);if(!n)return;
  const esND=(n.motivo||'').startsWith('ND:');
  const motivoTxt=esND?n.motivo.replace('ND:',''):n.motivo;
  const body=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin-bottom:10px">
      <span>Motivo: <b>${motivoTxt||'—'}</b></span>
      ${n.remito_id?`<span>Vinculada a: <b>R-${String(n.remito_id).padStart(4,'0')}</b></span>`:''}
    </div>
    ${n.observaciones?`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">Obs: ${n.observaciones}</div>`:''}
    <div style="text-align:right;font-size:16px;font-weight:700;color:var(--PD);border-top:2px solid var(--brd);padding-top:10px">Importe: ${fmt(Math.abs(n.importe))}</div>
  `;
  popupDetalle((esND?'ND-':'NC-')+String(n.id).padStart(4,'0'),`${n.cliente||''} · ${n.fecha}`,body);
}

function imprimirNC(id){
  const n=_ncs.find(x=>x.id===id);if(!n)return;
  const esND=(n.motivo||'').startsWith('ND:');
  const nro=(esND?'ND-':'NC-')+String(n.id).padStart(4,'0');
  const motivoTxt=esND?n.motivo.replace('ND:',''):n.motivo;
  const filasItems=(n.items||[]).map(it=>`<tr><td style="padding:4px 6px;border-bottom:1px solid #eee">${it.nom}</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center">${it.cant}</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right">${fmt(it.precio)}</td></tr>`).join('');
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${nro}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:30px;color:#000;max-width:500px;margin:0 auto}
    .titulo{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px}
    .empresa{font-size:18px;font-weight:bold}
    .nro{font-size:14px;color:#555}
    .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:13px}
    .row.total{font-weight:bold;font-size:15px;border-top:2px solid #000;border-bottom:none;margin-top:8px;padding-top:8px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="titulo">
    <div class="empresa">🌸 DISTRIBUIDORA LILA</div>
    <div class="nro">${esND?'NOTA DE DÉBITO':'NOTA DE CRÉDITO'} ${nro}</div>
  </div>
  <div class="row"><span><b>Fecha:</b></span><span>${n.fecha||'—'}</span></div>
  <div class="row"><span><b>Cliente:</b></span><span>${n.cliente||'—'}</span></div>
  <div class="row"><span><b>Motivo:</b></span><span>${motivoTxt||'—'}</span></div>
  ${n.remito_id?`<div class="row"><span><b>Factura vinculada:</b></span><span>R-${String(n.remito_id).padStart(4,'0')}</span></div>`:''}
  ${filasItems?`<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px"><thead><tr><th style="text-align:left;padding:4px 6px;border-bottom:1px solid #000">Producto</th><th style="padding:4px 6px;border-bottom:1px solid #000">Cant.</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #000">Precio</th></tr></thead><tbody>${filasItems}</tbody></table>`:''}
  <div class="row total"><span>IMPORTE</span><span>${fmt(Math.abs(n.importe))}</span></div>
  ${n.observaciones?`<div style="font-size:12px;color:#555;margin-top:8px">Obs: ${n.observaciones}</div>`:''}
  <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 20px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Imprimir</button></div>
  </body></html>`);
  w.document.close();
}

function renderNCs(){
  const tbody=document.getElementById('nc-tbody');if(!tbody)return;
  const q=(document.getElementById('nc-q')?.value||'').toLowerCase();
  const data=_ncs.filter(n=>!q||(n.cliente||'').toLowerCase().includes(q)||(n.motivo||'').toLowerCase().includes(q)||(n.observaciones||'').toLowerCase().includes(q));
  if(!data.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty">${_ncs.length?'Sin resultados':'Sin notas de crédito'}</div></td></tr>`;return;}
  tbody.innerHTML=data.map(n=>`<tr data-nc-id="${n.id}">
    <td style="font-weight:600;color:var(--A)">NC-${String(n.id).padStart(4,'0')}</td>
    <td>${n.fecha}</td><td style="font-weight:500">${n.cliente}</td>
    <td><span class="b ${n.motivo==='devolucion'?'bW':'bA'}">${n.motivo||''}</span></td>
    <td style="font-weight:600;color:var(--D)">${fmt(n.importe)}</td>
    <td>${n.observaciones||'—'}</td>
    <td><button class="btn sm" onclick="imprimirNC(${n.id})" title="Imprimir">🖨</button></td>
  </tr>`).join('');
}

// ─── NOTA DE DÉBITO ─────────────────────────────────────────────────────
function abrirND(){
  ['nd-cli-q','nd-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['nd-cli-id','nd-cli-cod'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.style.borderColor='';}});
  const imp=document.getElementById('nd-importe');if(imp)imp.value='';
  const fecha=document.getElementById('nd-fecha');if(fecha)fecha.value=new Date().toISOString().split('T')[0];
  const motivo=document.getElementById('nd-motivo');if(motivo)motivo.value='interes';
  const saldo=document.getElementById('nd-cli-saldo');if(saldo)saldo.textContent='—';
  document.getElementById('m-nd').classList.add('on');
  setTimeout(()=>document.getElementById('nd-cli-cod')?.focus(),100);
}

function dropCliND(){
  const q=(document.getElementById('nd-cli-q')?.value||'').toLowerCase();
  const drop=document.getElementById('nd-cli-drop');if(!drop)return;
  if(q.length<1){drop.style.display='none';return;}
  const m=_clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.map(c=>`<div onmousedown="selCliND(${c.id})"><strong>${c.nombre}</strong> <span style="color:var(--txt2);font-size:11px">Saldo: ${fmt(c.saldo)}</span></div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function selCliND(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('nd-cli-id').value=id;
  document.getElementById('nd-cli-q').value=c.nombre;
  document.getElementById('nd-cli-drop').style.display='none';
  const cod=document.getElementById('nd-cli-cod');if(cod){cod.value=c.codigo||c.id||'';cod.style.borderColor='var(--P)';}
  const saldo=document.getElementById('nd-cli-saldo');
  if(saldo)saldo.textContent=fmt(c.saldo||0);
  setTimeout(()=>document.getElementById('nd-importe')?.focus(),50);
}

async function guardarND(){
  const cid=document.getElementById('nd-cli-id').value;
  if(!cid){alert('Seleccioná un cliente');return;}
  const imp=parseFloat(document.getElementById('nd-importe')?.value)||0;
  if(imp<=0){alert('Ingresá un importe mayor a cero');return;}
  const c=_clientes.find(x=>x.id==cid);
  const motivo=document.getElementById('nd-motivo').value;

  const {data:nd,error}=await sb.from('notas_credito').insert({
    cliente_id:parseInt(cid),cliente:c?.nombre||'?',
    fecha:document.getElementById('nd-fecha').value,
    motivo:'ND:'+motivo,importe:-imp, // importe negativo = ND
    observaciones:document.getElementById('nd-obs').value,
    remito_id:null
  }).select().single();
  if(error){alert('Error: '+error.message);return;}

  // Incrementar saldo del cliente
  if(c){await sb.from('clientes').update({saldo:(c.saldo||0)+imp}).eq('id',c.id);}

  cerrar('m-nd');
  await Promise.all([cargarClientes(),cargarNCs()]);
  renderCC();renderDash();actualizarDeuda();renderNCs();
  alert(`✅ Nota de débito emitida por ${fmt(imp)}.\nSaldo de ${c?.nombre} aumentado en ${fmt(imp)}.`);
  return nd.id;
}

// ─── FIN COBRO MÓVIL ───

// ─── PEDIDO MÓVIL (estilo Moviler) ───
let _pmCliId=null, _pmCarrito=[], _pmMarcaActual=null, _pmProdActual=null;

function renderVendedorHome(){
  const bloques=document.getElementById('vh-bloques');
  if(!bloques)return;
  // Guardar el HTML original de vendedor una sola vez, para poder restaurarlo
  // si un usuario dualRolMovil vuelve de Repartidor a Vendedor (toggleRolMovil).
  if(!window._vhBloquesOriginal) window._vhBloquesOriginal=bloques.innerHTML;
  const esRep=usuarioActual?.rol==='repartidor';
  if(!esRep){
    bloques.innerHTML=window._vhBloquesOriginal;
    _renderComisionCard();
    return;
  }
  bloques.innerHTML=`
    <div style="background:#fff;border-radius:20px;padding:16px;box-shadow:0 2px 16px rgba(0,0,0,.07)">
      <div style="font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-left:2px">💰 Cobro</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="go('cobranza')"
          style="display:flex;align-items:center;gap:16px;width:100%;padding:20px 22px;background:#1a6fa8;color:#fff;border:none;border-radius:14px;font-size:19px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:0 3px 10px rgba(26,111,168,.25)">
          <span style="font-size:28px;line-height:1">💰</span><span>Cobrar</span>
        </button>
        <button onclick="go('hoja-ruta')"
          style="display:flex;align-items:center;gap:16px;width:100%;padding:16px 22px;background:#ede9fe;color:#5b21b6;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent">
          <span style="font-size:22px;line-height:1">🗺</span><span>Hoja de ruta</span>
        </button>
      </div>
    </div>
    <div style="background:#fff;border-radius:20px;padding:16px;box-shadow:0 2px 16px rgba(0,0,0,.07)">
      <div style="font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-left:2px">📦 Devoluciones</div>
      <button onclick="go('nc')"
        style="display:flex;align-items:center;gap:16px;width:100%;padding:20px 22px;background:var(--W);color:#fff;border:none;border-radius:14px;font-size:19px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:0 3px 10px rgba(234,88,12,.25)">
        <span style="font-size:28px;line-height:1">📋</span><span>Registrar devolución</span>
      </button>
    </div>
    <div id="vh-comision-card"></div>`;
  _renderComisionCard();
}

function abrirPedidoMovil(){
  // Si el panel fue reemplazado con innerHTML, restaurarlo primero
  const panel=document.getElementById('p-pedido-movil');
  if(panel && window._pmPanelOriginal && !document.getElementById('pm-cli-nombre')){
    panel.innerHTML=window._pmPanelOriginal;
  }
  _pmCliId=null;_pmCarrito=[];_pmMarcaActual=null;_pmProdActual=null;
  go('pedido-movil');
  const nomEl=document.getElementById('pm-cli-nombre');
  const saldoEl=document.getElementById('pm-cli-saldo');
  const qEl=document.getElementById('pm-cli-q');
  const listaEl=document.getElementById('pm-cli-lista');
  const pasoCliEl=document.getElementById('pm-paso-cliente');
  const pasoProdEl=document.getElementById('pm-paso-productos');
  const pasoResEl=document.getElementById('pm-paso-resumen');
  if(nomEl)nomEl.textContent='Seleccioná un cliente';
  if(saldoEl)saldoEl.textContent='';
  if(qEl)qEl.value='';
  if(listaEl)listaEl.innerHTML='';
  if(pasoCliEl)pasoCliEl.style.display='block';
  if(pasoProdEl)pasoProdEl.style.display='none';
  if(pasoResEl)pasoResEl.style.display='none';
  const saldoWrap=document.getElementById('pm-cli-saldo-wrap');
  if(saldoWrap)saldoWrap.style.display='none';
  poblarSelectZona('pm-cli-zon');
  actualizarCarritoBar();
  setTimeout(()=>document.getElementById('pm-cli-q')?.focus(),100);
}

function pmBuscarPorCod(){const cod=(document.getElementById('pm-cli-cod')?.value||'').trim();if(!cod)return;const c=_clientes.find(x=>String(x.codigo||x.id)===cod);if(c){selClienteMovil(c.id);document.getElementById('pm-cli-cod').style.borderColor='var(--P)';}else{document.getElementById('pm-cli-cod').style.borderColor='var(--D)';}}

function buscarClienteMovil(){
  const q=(document.getElementById('pm-cli-q').value||'').toLowerCase();
  const zonaFil=document.getElementById('pm-cli-zon')?.value||'';
  const lista=document.getElementById('pm-cli-lista');
  if(q.length<1&&!zonaFil){lista.innerHTML='';return;}
  const m=_clientes.filter(c=>
    ((c.nombre||'').toLowerCase().includes(q)||String(c.codigo||c.id).includes(q))
    &&(!zonaFil||c.zona===zonaFil)
  ).slice(0,12);
  lista.innerHTML=m.map(c=>`
    <div onclick="selClienteMovil(${c.id})" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--brd);cursor:pointer;background:#fff;active:background:var(--PL)">
      <div>
        <div style="font-size:15px;font-weight:600">[${c.codigo||c.id}] ${c.nombre.toUpperCase()}</div>
        <div style="font-size:12px;color:var(--txt2)">${c.direccion||''} ${c.localidad||''} · Tel: ${c.telefono||'—'}</div>
      </div>
      <div style="text-align:right;min-width:80px">
        <div style="font-size:14px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo||0)}</div>
        <div style="font-size:10px;color:var(--txt2)">saldo</div>
      </div>
    </div>`).join('');
}

function selClienteMovil(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  _pmCliId=id;
  document.getElementById('pm-cli-nombre').textContent=`[${c.codigo||c.id}] ${c.nombre.toUpperCase()}`;
  document.getElementById('pm-cli-detalle').textContent=`${c.localidad||''} · ${c.telefono||''}`;
  const saldoEl=document.getElementById('pm-cli-saldo');
  const saldoWrap=document.getElementById('pm-cli-saldo-wrap');
  if(saldoEl){saldoEl.textContent=fmt(c.saldo||0);saldoEl.style.color=(c.saldo||0)>0?'#ffb3b3':'#b3ffcc';}
  if(saldoWrap)saldoWrap.style.display='block';
  document.getElementById('pm-paso-cliente').style.display='none';
  document.getElementById('pm-paso-productos').style.display='block';
  cargarMarcasMovil();
}

async function verSaldoMovil(){
  const c=_clientes.find(x=>x.id===_pmCliId);if(!c)return;

  let modal=document.getElementById('pm-saldo-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='pm-saldo-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=function(e){if(e.target===modal)modal.remove();};
    document.body.appendChild(modal);
  }

  modal.innerHTML=`<div style="background:var(--bg);border-radius:16px 16px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto">
    <div style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:15px;font-weight:700;color:var(--PD)">${c.nombre}</div>
        <button onclick="document.getElementById('pm-saldo-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt2)">✕</button>
      </div>
      <div style="background:var(--PL);border-radius:10px;padding:12px;margin-bottom:14px;text-align:center">
        <div style="font-size:11px;color:var(--PD);font-weight:600;text-transform:uppercase">Saldo actual</div>
        <div style="font-size:28px;font-weight:700;color:var(--PD)">${fmt(c.saldo||0)}</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--txt2);text-transform:uppercase;margin-bottom:8px">Últimos 2 meses</div>
      <div id="cc-movil-lista">Cargando...</div>
    </div>
    <div style="padding:0 14px 16px">
      <button onclick="document.getElementById('pm-saldo-modal').remove()" style="width:100%;padding:12px;background:var(--PD);color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">Cerrar</button>
    </div>
  </div>`;
  modal.style.display='flex';

  const desde=new Date();desde.setMonth(desde.getMonth()-2);
  const desdeStr=desde.toISOString().split('T')[0];

  const [{data:remitos},{data:cobros}]=await Promise.all([
    sb.from('remitos').select('fecha,total,numero,saldo_pendiente,cobrado').eq('cliente_id',c.id).gte('fecha',desdeStr).order('fecha',{ascending:false}).limit(40),
    sb.from('cobros').select('fecha,importe,forma').eq('cliente_id',c.id).gte('fecha',desdeStr).order('fecha',{ascending:false}).limit(40),
  ]);

  const movs=[
    ...(remitos||[]).map(r=>({fecha:r.fecha,tipo:'remito',desc:'Remito #'+(r.numero||r.id),importe:r.total,cobrado:r.cobrado})),
    ...(cobros||[]).map(co=>({fecha:co.fecha,tipo:'cobro',desc:'Cobro '+co.forma,importe:co.importe})),
  ].sort((a,b)=>b.fecha.localeCompare(a.fecha));

  const lista=document.getElementById('cc-movil-lista');
  if(!lista)return;
  if(!movs.length){
    lista.innerHTML='<div style="color:var(--txt2);text-align:center;padding:20px">Sin movimientos en los últimos 2 meses</div>';
    return;
  }
  lista.innerHTML=movs.map(m=>{
    const esCobro=m.tipo==='cobro';
    const color=esCobro?'var(--G)':'var(--D)';
    const signo=esCobro?'−':'+';
    const badge=!esCobro&&!m.cobrado?'<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:4px;margin-left:4px">pendiente</span>':
      (!esCobro?'<span style="font-size:10px;background:#e8f5e9;color:#2e7d32;padding:2px 6px;border-radius:4px;margin-left:4px">✓ cobrado</span>':''  );
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:0.5px solid var(--brd)">
      <div>
        <div style="font-size:14px;font-weight:600">${m.desc}${badge}</div>
        <div style="font-size:11px;color:var(--txt2)">${m.fecha}</div>
      </div>
      <div style="font-size:16px;font-weight:700;color:${color}">${signo}${fmt(m.importe)}</div>
    </div>`;
  }).join('');
}

// ── Catálogo móvil agrupado por marca (acordeón) ──
// Se usa igual al tomar el pedido y al editarlo, para que el vendedor vea
// siempre el mismo orden. Antes al editar se mostraba una lista plana en el
// orden crudo de la base, que se leía como desordenada.
function _pmMarcaDe(p){ return p.proveedor_nom||p.rubro||'OTROS'; }

// Items ya cargados: en edición son los del pedido; si no, el carrito nuevo.
function _pmItemsActuales(){ return _editPedMovil?_editPedMovil.items:_pmCarrito; }

function _pmRenderMarcas(cont,pref){
  if(!cont)return;
  const items=_pmItemsActuales()||[];
  const marcas=[...new Set(_productos.filter(p=>p.activo!==false).map(_pmMarcaDe).filter(Boolean))].sort();
  cont.innerHTML=marcas.map(m=>{
    const key=m.replace(/[^a-zA-Z0-9]/g,'_');
    const enCarrito=items.filter(x=>{const prod=_productos.find(p=>p.id===x.id);return prod&&_pmMarcaDe(prod)===m;});
    const badge=enCarrito.length>0?`<span style="background:var(--P);color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:700">${enCarrito.length} ✓</span>`:'';
    return `<div><div onclick="toggleMarcaMovil('${m.replace(/'/g,"\\'")}','${key}','${pref}')" style="display:flex;justify-content:space-between;align-items:center;padding:16px 14px;border-bottom:1px solid var(--brd);cursor:pointer;background:var(--P);color:#fff;"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:16px;font-weight:700">${m}</span>${badge}</div><span id="${pref}-chevron-${key}" style="color:#fff;font-size:20px;font-weight:300">›</span></div><div id="${pref}-prods-${key}" style="display:none;background:var(--bg2)"></div></div>`;
  }).join('');
}

function cargarMarcasMovil(){
  _pmRenderMarcas(document.getElementById('pm-marcas-lista'),'pm');
}

function toggleMarcaMovil(marca,key,pref){
  pref=pref||'pm';
  const div=document.getElementById(pref+'-prods-'+key);
  const chev=document.getElementById(pref+'-chevron-'+key);
  if(!div)return;
  const open=div.style.display!=='none';
  if(open){div.style.display='none';if(chev)chev.textContent='›';}
  else{
    const items=_pmItemsActuales()||[];
    const prods=_productos.filter(p=>_pmMarcaDe(p)===marca&&p.activo!==false);
    div.innerHTML=prods.map(p=>{const enCarrito=items.find(x=>x.id===p.id);return `<div onclick="abrirPopupMovil(${p.id})" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--brd);cursor:pointer;background:${enCarrito?'var(--PL)':'#fff'};border-left:${enCarrito?'4px solid var(--P)':'4px solid transparent'}"><div style="flex:1"><div style="font-size:15px;font-weight:${enCarrito?'700':'500'}">${p.nombre}</div>${enCarrito?`<div style="font-size:12px;color:var(--P);font-weight:600">✓ ${enCarrito.cant} ${p.unidad||''} en pedido</div>`:''}</div><div style="text-align:right;margin-left:12px"><div style="font-size:15px;font-weight:700;color:var(--PD)">${fmt(p.precio||0)}</div><div style="width:30px;height:30px;border-radius:50%;background:var(--P);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;margin-left:auto;margin-top:2px">+</div></div></div>`;}).join('')||`<div style="padding:14px 18px;color:var(--txt2);font-size:13px">Sin productos</div>`;
    div.style.display='block';if(chev)chev.textContent='⌄';
    div.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

function abrirPopupMovil(prodId){
  const p=_productos.find(x=>x.id===prodId);if(!p)return;
  _pmProdActual=p;
  // En modo edición buscar en _editPedMovil.items; en modo nuevo en _pmCarrito
  const existente=_editPedMovil
    ? _editPedMovil.items.find(x=>x.id===prodId)
    : _pmCarrito.find(x=>x.id===prodId);
  document.getElementById('pm-popup-nombre').textContent=p.nombre;
  const _lpPrecioLista=_pmCliId?getPrecioParaCliente(p.id,_pmCliId):null;
  const _lpPrecioBase=p.precio||0;
  const _lpPrecioMostrar=_lpPrecioLista!=null?_lpPrecioLista:_lpPrecioBase;
  const _lpListaNom=_pmCliId&&getListaCliente(_pmCliId)?(_listasPrecios.find(l=>l.id==getListaCliente(_pmCliId))?.nombre||''):'';
  document.getElementById('pm-popup-precio').innerHTML=fmt(_lpPrecioMostrar)+' <span style="color:var(--txt2)">'+(p.unidad||'')+'</span>'+(_lpListaNom?` <span style="font-size:11px;background:var(--PL);color:var(--PD);border-radius:4px;padding:1px 5px">${_lpListaNom}</span>`:'');
  document.getElementById('pm-cant').value=existente?existente.cant:1;
  document.getElementById('pm-dto').value=existente?existente.dto:(p.descuento||0);
  // En modo edición ocultar el backdrop del sheet para evitar doble oscurecimiento
  if(_editPedMovil){
    const bd=document.getElementById('epm-backdrop');
    if(bd)bd.style.opacity='0';
  }
  document.getElementById('pm-popup-bg').style.display='flex';
  setTimeout(()=>document.getElementById('pm-cant').select(),50);
}

function cerrarPopupMovil(){
  document.getElementById('pm-popup-bg').style.display='none';
  _pmProdActual=null;
  // Restaurar backdrop del bottom sheet si estamos en modo edición
  if(_editPedMovil){
    const bd=document.getElementById('epm-backdrop');
    if(bd)bd.style.opacity='1';
  }
}

function pmCantidad(delta){
  const inp=document.getElementById('pm-cant');
  const v=Math.max(0,parseFloat(inp.value||0)+delta*0.5);
  inp.value=Math.round(v*10)/10;
}

function agregarAlCarrito(){
  if(!_pmProdActual)return;
  const cant=parseFloat(document.getElementById('pm-cant').value)||0;
  const dto=parseFloat(document.getElementById('pm-dto').value)||0;
  const _ppLista=_pmCliId?getPrecioParaCliente(_pmProdActual?.id,_pmCliId):null;
  const precio=_ppLista!=null?_ppLista:(_pmProdActual?.precio||0);

  if(_editPedMovil){
    // Modo edición: guardar referencia antes de cerrar el popup (que nula _pmProdActual)
    const prod=_pmProdActual;
    cerrarPopupMovil();
    const idx=_editPedMovil.items.findIndex(x=>x.id===prod.id);
    if(cant<=0){
      if(idx>=0) _editPedMovil.items.splice(idx,1);
    } else {
      const _precioLP=_pmCliId?getPrecioParaCliente(prod.id,_pmCliId):null;
      const item={id:prod.id,nom:prod.nombre,un:prod.unidad||'un',cant,precio:_precioLP!=null?_precioLP:(prod.precio||0),dto,iva:prod.iva||21};
      if(idx>=0) _editPedMovil.items[idx]=item; else _editPedMovil.items.push(item);
    }
    const busq=document.getElementById('epm-busq');
    if(busq)busq.value='';
    renderEditPedidoMovil();
    // Redibujar el catálogo para que se actualice el contador "✓ en pedido",
    // igual que hace cargarMarcasMovil() en la toma de pedido original.
    filtrarAgregarMovil();
    return;
  }

  // Modo nuevo pedido: actualizar _pmCarrito
  if(cant<=0){
    _pmCarrito=_pmCarrito.filter(x=>x.id!==_pmProdActual.id);
  } else {
    const neto=precio*cant*(1-dto/100);
    const idx=_pmCarrito.findIndex(x=>x.id===_pmProdActual.id);
    const item={id:_pmProdActual.id,nom:_pmProdActual.nombre,precio,cant,dto,un:_pmProdActual.unidad||'',neto};
    if(idx>=0)_pmCarrito[idx]=item;else _pmCarrito.push(item);
  }
  cerrarPopupMovil();
  actualizarCarritoBar();
  cargarMarcasMovil();
}

function actualizarCarritoBar(){
  const bar=document.getElementById('pm-carrito-bar');
  const tot=_pmCarrito.reduce((a,x)=>a+x.neto,0);
  const n=_pmCarrito.length;
  const itemsEl=document.getElementById('pm-carrito-items');
  const totalEl=document.getElementById('pm-carrito-total');
  if(itemsEl)itemsEl.textContent=n+' producto'+(n!==1?'s':'');
  if(totalEl)totalEl.textContent=fmt(tot);
  if(bar)bar.style.display=n>0?'flex':'none';
}

function mostrarResumenMovil(){
  document.getElementById('pm-paso-productos').style.display='none';
  document.getElementById('pm-paso-resumen').style.display='block';
  const tot=_pmCarrito.reduce((a,x)=>a+x.neto,0);
  document.getElementById('pm-resumen-total').textContent=fmt(tot);
  document.getElementById('pm-resumen-items').innerHTML=_pmCarrito.map(x=>`
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--brd);font-size:14px">
      <div>
        <div style="font-weight:600">${x.nom}</div>
        <div style="color:var(--txt2);font-size:12px">${x.cant} ${x.un} × ${fmt(x.precio)}${x.dto>0?' − '+x.dto+'%':''}</div>
      </div>
      <div style="font-weight:700;color:var(--PD)">${fmt(x.neto)}</div>
    </div>`).join('');
}

function volverProductosMovil(){
  document.getElementById('pm-paso-resumen').style.display='none';
  document.getElementById('pm-paso-productos').style.display='block';
}

async function confirmarPedidoMovil(){
  // Guardar HTML original del panel si aún no está guardado
  if(!window._pmPanelOriginal){
    const panel=document.getElementById('p-pedido-movil');
    if(panel) window._pmPanelOriginal = panel.innerHTML;
  }
  if(!_pmCliId){alert('Seleccioná un cliente');return;}
  if(!_pmCarrito.length){alert('Agregá al menos un producto');return;}
  const c=_clientes.find(x=>x.id===_pmCliId);
  const tot=_pmCarrito.reduce((a,x)=>a+x.neto,0);
  const items=_pmCarrito.map(x=>({id:x.id,nom:x.nom,precio:x.precio,cant:x.cant,dto:x.dto,un:x.un}));
  const {error}=await sb.from('pedidos').insert({
    cliente_id:_pmCliId,cliente:c?.nombre||'?',
    localidad:c?.localidad||'',zona:c?.zona||'',
    vendedor:usuarioActual?.nombre||'',
    fecha:new Date().toISOString().split('T')[0],
    items,total:tot,estado:'pendiente',
    visita:document.getElementById('pm-visita').value||null,
    observaciones:document.getElementById('pm-obs').value||null
  });
  if(error){alert('Error: '+error.message);return;}
  await cargarPedidos();renderDash();
  // Mostrar pantalla de confirmación con opciones
  mostrarConfirmacionMovil('pedido', c?.nombre, _pmCarrito.length+' productos · '+fmt(tot));
}

function mostrarConfirmacionMovil(tipo, cliente, detalle){
  // Mostrar panel de éxito con opciones
  const panel=document.getElementById('p-pedido-movil');
  if(!panel)return;
  const esCobranza=tipo==='cobro';
  panel.innerHTML=`
    <div style="max-width:480px;padding:20px">
      <div style="text-align:center;padding:30px 0 20px">
        <div style="font-size:48px">✅</div>
        <div style="font-size:18px;font-weight:700;color:var(--P);margin-top:10px">${esCobranza?'Cobro confirmado':'Pedido confirmado'}</div>
        <div style="font-size:15px;font-weight:600;margin-top:8px">${cliente}</div>
        <div style="font-size:13px;color:var(--txt2);margin-top:4px">${detalle}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="${esCobranza?'go(\'cobranza\')':'resetYNuevoPedido()'}" 
          style="width:100%;padding:14px;background:var(--P);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer">
  // Modo nuevo pedido: actualizar _pmCarrito
        </button>
        <button onclick="${esCobranza?'go(\'cobranza\');setTimeout(()=>cobmAbrirMisCobranzas(),50);setTimeout(()=>cobmSetPeriodo(\'dia\'),80)':'verMisPedidosHoy()'}"
          style="width:100%;padding:14px;background:var(--bg2);color:var(--PD);border:2px solid var(--P);border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">
          ${esCobranza?'📊 Ver mis cobros de hoy':'📋 Ver mis pedidos de hoy'}
        </button>
        <button onclick="go('vendedor-home')" 
          style="width:100%;padding:12px;background:transparent;color:var(--txt2);border:1px solid var(--brd);border-radius:10px;font-size:14px;cursor:pointer">
          🏠 Volver al inicio
        </button>
      </div>
    </div>`;
  go('pedido-movil');
}

function verCobranzaHoy(){
  go('cobranza-hoy');
  const hoy = new Date().toISOString().split('T')[0];
  const nombre = (usuarioActual?.nombre||'').toLowerCase();
  const vendedor = (usuarioActual?.vendedor||'').toLowerCase();

  // Admin y usuarios con esAdmin ven todos; vendedores/repartidores solo los suyos
  const esAdmin = usuarioActual?.esAdmin || usuarioActual?.rol==='admin' || usuarioActual?.rol_original==='admin';
  const cobrosHoy = _cobros.filter(c => {
    if(c.fecha !== hoy) return false;
    if(esAdmin) return true;
    const cv = (c.vendedor||'').toLowerCase();
    return cv === nombre || (vendedor && cv === vendedor);
  });

  // Título
  const tit = document.getElementById('cob-hoy-titulo');
  if(tit) tit.textContent = new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});

  // Totales
  const total = cobrosHoy.reduce((a,c)=>a+(c.importe||0),0);
  const elTot = document.getElementById('cob-hoy-total');
  const elCant = document.getElementById('cob-hoy-cantidad');
  if(elTot) elTot.textContent = fmt(total);
  if(elCant) elCant.textContent = cobrosHoy.length;

  // Formas de pago
  const ef = cobrosHoy.reduce((a,c)=>a+(c.efectivo||0),0);
  const tr = cobrosHoy.reduce((a,c)=>a+(c.transferencia||0),0);
  const ch = cobrosHoy.reduce((a,c)=>a+(c.cheque_terceros||0),0);
  const elFormas = document.getElementById('cob-hoy-formas');
  if(elFormas){
    let html = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    if(ef>0) html+=`<div style="flex:1;background:#e8f5e9;border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:11px;color:#2e7d32">💵 Efectivo</div><div style="font-size:16px;font-weight:700;color:#1a7a52">${fmt(ef)}</div></div>`;
    if(tr>0) html+=`<div style="flex:1;background:#e3f2fd;border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:11px;color:#1565c0">🏦 Transf.</div><div style="font-size:16px;font-weight:700;color:#1a5fa8">${fmt(tr)}</div></div>`;
    if(ch>0) html+=`<div style="flex:1;background:var(--WL);border-radius:8px;padding:8px 12px;text-align:center"><div style="font-size:11px;color:var(--W)">📋 Cheque</div><div style="font-size:16px;font-weight:700;color:var(--W)">${fmt(ch)}</div></div>`;
    if(!ef&&!tr&&!ch) html+='<div style="color:var(--txt2);font-size:13px;padding:8px">Sin cobros registrados hoy</div>';
    html += '</div>';
    elFormas.innerHTML = html;
  }

  // Lista
  const elLista = document.getElementById('cob-hoy-lista');
  if(elLista){
    if(!cobrosHoy.length){
      elLista.innerHTML='<div class="empty">Sin cobros hoy</div>';
    } else {
      elLista.innerHTML = cobrosHoy.map(c=>{
        const formas=[];
        if(c.efectivo>0)formas.push('Ef:'+fmt(c.efectivo));
        if(c.transferencia>0)formas.push('Tr:'+fmt(c.transferencia));
        if(c.cheque_terceros>0)formas.push('Ch:'+fmt(c.cheque_terceros));
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--brd)">
          <div>
            <div style="font-size:14px;font-weight:600">${c.cliente}</div>
            <div style="font-size:11px;color:var(--txt2)">${formas.join(' · ')||c.forma||'—'}</div>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--P)">${fmt(c.importe)}</div>
        </div>`;
      }).join('');
    }
  }
}

function resetYNuevoPedido(){
  const panel=document.getElementById('p-pedido-movil');
  if(panel && window._pmPanelOriginal){
    panel.innerHTML = window._pmPanelOriginal;
  }
  _pmCliId=null;_pmCarrito=[];_pmMarcaActual=null;_pmProdActual=null;
  const pc=document.getElementById('pm-paso-cliente');if(pc)pc.style.display='block';
  const pp=document.getElementById('pm-paso-productos');if(pp)pp.style.display='none';
  const pr=document.getElementById('pm-paso-resumen');if(pr)pr.style.display='none';
  const nomEl=document.getElementById('pm-cli-nombre');if(nomEl)nomEl.textContent='Seleccioná un cliente';
  const saldoWrap=document.getElementById('pm-cli-saldo-wrap');if(saldoWrap)saldoWrap.style.display='none';
  const qEl=document.getElementById('pm-cli-q');if(qEl){qEl.value='';setTimeout(()=>qEl.focus(),100);}
  const listaEl=document.getElementById('pm-cli-lista');if(listaEl)listaEl.innerHTML='';
  actualizarCarritoBar();
  go('pedido-movil');
}

// estado temporal de edición de pedido móvil
let _editPedMovil = null;

 // {id, items:[...]}
function detalleMovilHTML(p){
  const items = p.items || [];
  if(!items.length) return '<div style="color:var(--txt2);font-size:16px;padding:8px 0">Sin productos</div>';
  let tot = 0;
  const rows = items.map(it=>{
    const neto = it.precio * it.cant * (1 - (it.dto||0)/100);
    tot += neto;
    return `<div style="display:flex;align-items:center;min-height:52px;padding:10px 0;border-bottom:1px solid var(--brd);gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:600;line-height:1.3">${it.nom}</div>
        <div style="font-size:14px;color:var(--txt2);margin-top:2px">${fmt(it.precio)} × ${fmtN(it.cant,2)} ${it.un||'un'}${it.dto?` · ${it.dto}% dto`:''}</div>
      </div>
      <div style="font-size:17px;font-weight:700;color:var(--P);flex-shrink:0">${fmt(neto)}</div>
    </div>`;
  }).join('');
  const obs = p.observaciones || p.obs;
  return `<div>${rows}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;font-size:18px;font-weight:700">
      <span style="color:var(--txt2);font-size:14px">Total</span>
      <span style="color:var(--P)">${fmt(tot)}</span>
    </div>
    ${obs?`<div style="font-size:14px;color:var(--txt2);padding:6px 0">📝 ${obs}</div>`:''}`;
}

function verMisPedidosHoy(){
  const hoy=new Date().toISOString().split('T')[0];
  const misPedidos=_pedidos.filter(p=>
    p.vendedor===usuarioActual?.nombre && p.fecha===hoy
  ).sort((a,b)=>b.id-a.id);
  const panel=document.getElementById('p-pedido-movil');
  if(!panel)return;
  const stBadge=s=>s==='pendiente'?`<span style="background:var(--WL);color:var(--W);border-radius:20px;padding:2px 8px;font-size:12px;font-weight:600">Pendiente</span>`:s==='en_carga'?`<span style="background:var(--AL);color:var(--A);border-radius:20px;padding:2px 8px;font-size:12px;font-weight:600">En carga</span>`:s==='remitado'?`<span style="background:var(--PL);color:var(--PD);border-radius:20px;padding:2px 8px;font-size:12px;font-weight:600">Remitado</span>`:'';
  panel.innerHTML=`
    <div style="max-width:520px;padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button onclick="go('vendedor-home')" style="background:none;border:none;font-size:22px;cursor:pointer;padding:8px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center">←</button>
        <div>
          <h2 style="font-size:17px;font-weight:700;color:var(--PD);margin:0">📋 Mis pedidos de hoy</h2>
          <div style="font-size:13px;color:var(--txt2)">${misPedidos.length} pedido${misPedidos.length!==1?'s':''} · ${hoy}</div>
        </div>
      </div>
      ${misPedidos.length?misPedidos.map(p=>`
        <div style="background:var(--bg);border:1.5px solid var(--brd);border-radius:12px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
          <div onclick="toggleDetallePedMovil(${p.id})" style="display:flex;justify-content:space-between;align-items:center;padding:14px;cursor:pointer;border-left:4px solid var(--P)">
            <div style="flex:1;min-width:0">
              <div style="font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.cliente}</div>
              <div style="font-size:13px;color:var(--txt2);margin-top:3px">${p.items?.length||0} productos · ${p.localidad||''}${p.visita?' · '+p.visita:''}</div>
              <div style="margin-top:5px">${stBadge(p.estado)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-left:12px;flex-shrink:0">
              <div style="font-size:19px;font-weight:700;color:var(--P)">${fmt(p.total)}</div>
              <span id="ped-mov-chevron-${p.id}" style="font-size:18px;color:var(--txt2);transition:transform 0.2s">▼</span>
            </div>
          </div>
          <div id="ped-mov-det-${p.id}" style="display:none;border-top:1px solid var(--brd)">
            <div id="ped-mov-det-inner-${p.id}" style="padding:14px 16px">
              ${detalleMovilHTML(p)}
            </div>
            ${p.estado==='pendiente'?`<div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--brd)">
              <button onclick="event.stopPropagation();editarPedidoMovil(${p.id})" style="flex:2;min-height:52px;background:var(--AL);color:var(--A);border:1.5px solid var(--A);border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
                ✏️ Editar
              </button>
              <button onclick="event.stopPropagation();elimPedidoMovil(${p.id})" style="flex:1;min-height:52px;background:var(--DL);color:var(--D);border:1.5px solid var(--D);border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
                🗑
              </button>
            </div>`:''}
          </div>
        </div>`).join('')
      :'<div style="text-align:center;color:var(--txt2);padding:40px 20px;font-size:15px">Sin pedidos cargados hoy</div>'}
      <button onclick="abrirPedidoMovil()" style="width:100%;margin-top:6px;padding:16px;background:var(--P);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        + Nuevo pedido
      </button>
    </div>`;
  go('pedido-movil');
}

function toggleDetallePedMovil(id){
  const det=document.getElementById('ped-mov-det-'+id);
  const chev=document.getElementById('ped-mov-chevron-'+id);
  if(!det)return;
  const open=det.style.display==='none';
  det.style.display=open?'block':'none';
  if(chev)chev.style.transform=open?'rotate(180deg)':'rotate(0deg)';
}

async function elimPedidoMovil(id){
  if(!confirm('¿Eliminar este pedido?'))return;
  await sb.from('pedidos').delete().eq('id',id);
  await cargarPedidos();
  verMisPedidosHoy();
  toast('Pedido eliminado');
}

// ── Edición de pedido en la vista móvil — bottom sheet ──
function editarPedidoMovil(pedId){
  const p=_pedidos.find(x=>x.id===pedId);if(!p)return;
  _editPedMovil={id:pedId,items:JSON.parse(JSON.stringify(p.items||[]))};
  const cl=document.getElementById('epm-sheet-cliente');
  if(cl)cl.textContent=p.cliente||'';
  const busq=document.getElementById('epm-busq');
  if(busq)busq.value='';
  const drop=document.getElementById('epm-drop');
  if(drop)drop.style.display='none';
  renderEditPedidoMovil();
  abrirBottomSheetEditar();
  setTimeout(()=>{const b=document.getElementById('epm-busq');if(b){b.value='';filtrarAgregarMovil();}},350);
}

function abrirBottomSheetEditar(){
  const backdrop=document.getElementById('epm-backdrop');
  const sheet=document.getElementById('epm-sheet');
  if(!backdrop||!sheet)return;
  backdrop.style.opacity='1';
  backdrop.style.pointerEvents='all';
  sheet.style.transform='translateY(0)';
  document.body.style.overflow='hidden';
}

function cerrarBottomSheetEditar(){
  const backdrop=document.getElementById('epm-backdrop');
  const sheet=document.getElementById('epm-sheet');
  if(!backdrop||!sheet)return;
  backdrop.style.opacity='0';
  backdrop.style.pointerEvents='none';
  sheet.style.transform='translateY(100%)';
  document.body.style.overflow='';
}

function renderEditPedidoMovil(){
  const {items}=_editPedMovil;
  const filas=items.map((it,i)=>`
    <div style="display:flex;align-items:center;min-height:48px;padding:6px 0;border-bottom:1px solid var(--brd);gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--txt)">${it.nom}</div>
        <div style="font-size:11px;color:var(--txt2)">${fmt(it.precio)}</div>
      </div>
      <input type="number" inputmode="decimal" value="${it.cant}" min="0" step="0.5"
        onchange="_editPedMovil.items[${i}].cant=parseFloat(this.value)||0;actualizarTotalEditMovil()"
        style="width:64px;height:40px;font-size:17px;font-weight:700;text-align:center;border:2px solid var(--P);border-radius:8px;padding:0 4px;color:var(--PD)">
      <span style="font-size:12px;color:var(--txt2);min-width:24px;text-align:left">${it.un||'un'}</span>
      <button onclick="_editPedMovil.items.splice(${i},1);renderEditPedidoMovil()"
        style="min-width:36px;min-height:36px;background:var(--DL);color:var(--D);border:none;border-radius:8px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ✕
      </button>
    </div>`).join('');
  const epmItems=document.getElementById('epm-items');
  if(epmItems)epmItems.innerHTML=filas||'<div style="padding:12px 0;font-size:13px;color:var(--txt2)">Sin productos. Buscá arriba para agregar.</div>';
  // Actualizar contador del header
  const lbl=document.getElementById('epm-items-label');
  if(lbl)lbl.textContent=items.length?`${items.length} producto${items.length>1?'s':''} en el pedido`:'Pedido vacío';
  actualizarTotalEditMovil();
}

function actualizarTotalEditMovil(){
  const el=document.getElementById('epm-total');if(!el)return;
  const tot=(_editPedMovil.items||[]).reduce((s,it)=>s+it.precio*it.cant*(1-(it.dto||0)/100),0);
  el.textContent='Total: '+fmt(tot);
}

function filtrarAgregarMovil(){
  const q=(document.getElementById('epm-busq')?.value||'').toLowerCase().trim();
  const drop=document.getElementById('epm-drop');if(!drop)return;
  // Sin búsqueda: mismo catálogo por marca que en la toma de pedido original.
  if(!q){_pmRenderMarcas(drop,'epm');drop.style.display='block';return;}
  const todos=_productos.filter(p=>p.activo!==false);
  const res=todos.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q)||(p.linea||'').toLowerCase().includes(q));
  if(!res.length){drop.style.display='none';return;}
  drop.innerHTML=res.map(p=>{
    const enEdit=_editPedMovil?.items.find(x=>x.id===p.id);
    const sub=[p.linea,p.rubro].filter(Boolean).join(' · ');
    return `<div onclick="abrirPopupMovil(${p.id})"
      style="padding:12px 14px;border-bottom:1px solid var(--brd);cursor:pointer;min-height:52px;display:flex;align-items:center;gap:10px;background:${enEdit?'var(--PL)':''}">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
        ${sub?`<div style="font-size:11px;color:var(--txt2)">${sub}</div>`:''}
        ${enEdit?`<div style="font-size:12px;color:var(--P);font-weight:600">✓ ${enEdit.cant} ${p.unidad||''} en pedido</div>`:''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:700;color:var(--PD)">${fmt(p.precio)}</div>
        ${p.unidad?`<div style="font-size:11px;color:var(--txt2)">${p.unidad}</div>`:''}
      </div>
    </div>`;
  }).join('');
  drop.style.display='block';
}

async function guardarEditPedidoMovil(){
  const {id,items}=_editPedMovil;
  const filtrados=items.filter(it=>it.cant>0);
  if(!filtrados.length){toast('Agregá al menos un producto','err');return;}
  let tot=0;filtrados.forEach(it=>{tot+=it.precio*it.cant*(1-(it.dto||0)/100);});
  tot=Math.round(tot*100)/100;
  const {error}=await sb.from('pedidos').update({items:filtrados,total:tot}).eq('id',id);
  if(error){toast('Error al guardar','err');return;}
  cerrarBottomSheetEditar();
  _editPedMovil=null;
  await cargarPedidos();
  toast('✅ Pedido actualizado');
  verMisPedidosHoy();
  // Reabrir el detalle del pedido editado
  setTimeout(()=>{
    const det=document.getElementById('ped-mov-det-'+id);
    const chev=document.getElementById('ped-mov-chevron-'+id);
    if(det)det.style.display='block';
    if(chev)chev.style.transform='rotate(180deg)';
  },50);
}

function cancelarEditPedidoMovil(){
  _editPedMovil=null;
  cerrarBottomSheetEditar();
}
