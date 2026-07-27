// ─── LOGÍSTICA: cargas, remitos (despacho), hoja de ruta ───

async function cargarRemitos(){const {data}=await sb.from('remitos').select('*').order('created_at',{ascending:false});_remitos=data||[];}

async function cargarCargas(){const {data}=await sb.from('cargas').select('*').order('created_at',{ascending:false});_cargas=data||[];}

// ─── CARGAS ───
function mostrarNuevaCarga(){
  document.getElementById('carga-vista-lista').style.display='none';
  document.getElementById('carga-vista-nueva').style.display='block';
  const fecha=document.getElementById('car-fecha');
  if(fecha)fecha.value=new Date().toISOString().split('T')[0];
  // Poblar filtros
  const zonas=[...new Set(_pedidos.filter(p=>p.estado==='pendiente').map(p=>p.zona||'').filter(Boolean))].sort();
  const locs=[...new Set(_pedidos.filter(p=>p.estado==='pendiente').map(p=>p.localidad||'').filter(Boolean))].sort();
  const vens=[...new Set(_pedidos.filter(p=>p.estado==='pendiente').map(p=>p.vendedor||'').filter(Boolean))].sort();
  const selZ=document.getElementById('car-fil-zona');
  selZ.innerHTML='<option value="">Todas las zonas</option>'+zonas.map(z=>`<option value="${z}">Zona ${z}</option>`).join('');
  const selL=document.getElementById('car-fil-loc');
  selL.innerHTML='<option value="">Todas las localidades</option>'+locs.map(l=>`<option value="${l}">${l}</option>`).join('');
  const selV=document.getElementById('car-fil-ven');
  selV.innerHTML='<option value="">Todos</option>'+vens.map(v=>`<option value="${v}">${v}</option>`).join('');
  loadPedsCarga();
}

function ocultarNuevaCarga(){
  document.getElementById('carga-vista-lista').style.display='block';
  document.getElementById('carga-vista-nueva').style.display='none';
}

async function abrirCarga(){ mostrarNuevaCarga(); }

function selAllPeds(val){
  document.querySelectorAll('#car-items-lista input[type=checkbox]').forEach(c=>c.checked=val);
  actualizarResumenCarga();
}

function actualizarResumenCarga(){
  const chks=[...document.querySelectorAll('#car-items-lista input[type=checkbox]:checked')];
  const pedIds=chks.map(c=>parseInt(c.value));
  const peds=_pedidos.filter(p=>pedIds.includes(p.id));
  const tot=peds.reduce((a,p)=>a+(p.total||0),0);
  const el=document.getElementById('car-resumen');
  if(el)el.innerHTML=`<b>${peds.length}</b> pedidos seleccionados · Total: <b style="color:var(--PD)">${fmt(tot)}</b>`;
}

async function loadPedsCarga(){
  const zona=document.getElementById('car-fil-zona')?.value||'';
  const loc=document.getElementById('car-fil-loc')?.value||'';
  const ven=document.getElementById('car-fil-ven')?.value||'';
  const pends=_pedidos.filter(p=>
    p.estado==='pendiente'&&
    (!zona||p.zona===zona)&&
    (!loc||(p.localidad||'')=== loc)&&
    (!ven||(p.vendedor||'').toLowerCase()===(ven).toLowerCase())
  ).sort((a,b)=>(a.zona||'').localeCompare(b.zona||'')||(a.localidad||'').localeCompare(b.localidad||''));
  const el=document.getElementById('car-items-lista');
  if(!el)return;
  if(!pends.length){el.innerHTML='<div class="empty">Sin pedidos pendientes con esos filtros</div>';actualizarResumenCarga();return;}
  el.innerHTML=pends.map(p=>{
    const c=_clientes.find(x=>x.id===p.cliente_id);
    return `<div style="display:flex;align-items:center;gap:8px;padding:12px 8px;border-bottom:1px solid var(--brd);font-size:13px">
      <input type="checkbox" id="chk-${p.id}" value="${p.id}" checked onchange="actualizarResumenCarga()" style="width:22px;height:22px;cursor:pointer;flex-shrink:0">
      <label for="chk-${p.id}" style="flex:1;cursor:pointer">
        <span style="font-weight:600">${p.cliente}</span>
        <span style="color:var(--txt2);font-size:11px;margin-left:8px">${p.localidad||''} · Z${p.zona||'-'} · ${p.vendedor||'—'} · ${p.fecha}</span>
        ${c?.direccion?`<span style="color:var(--txt2);font-size:11px;margin-left:8px">📍 ${c.direccion}</span>`:''}
      </label>
      <span style="color:var(--P);font-weight:600;white-space:nowrap">${fmt(p.total)}</span>
    </div>`;
  }).join('');
  actualizarResumenCarga();
}

async function guardarCarga(){
  const chks=[...document.querySelectorAll('#car-items-lista input[type=checkbox]:checked')];
  if(!chks.length){alert('Seleccioná al menos un pedido');return;}
  const pedIds=chks.map(c=>parseInt(c.value));
  const peds=_pedidos.filter(p=>pedIds.includes(p.id));
  const tot=peds.reduce((a,p)=>a+p.total,0);
  const ven=document.getElementById('car-chofer')?.value||'';
  const fecha=document.getElementById('car-fecha')?.value||new Date().toISOString().split('T')[0];
  const nombre=ven||'';
  ocultarNuevaCarga();
  const {data:carga,error}=await sb.from('cargas').insert({fecha,vendedor:ven,pedidos:pedIds,total:tot,estado:'armando',nombre}).select().single();
  if(error){alert('Error: '+error.message);return;}
  for(const pid of pedIds){await sb.from('pedidos').update({estado:'en_carga',carga_id:carga.id}).eq('id',pid);}
  cerrar('m-carga');await Promise.all([cargarCargas(),cargarPedidos()]);renderCargas();renderPedidos();renderDash();
}

function renderCargas(){
  const el=document.getElementById('carga-lista');
  const q=(document.getElementById('car-q')?.value||'').toLowerCase();
  const fd=document.getElementById('car-fd')?.value||'';
  const fh=document.getElementById('car-fh')?.value||'';
  const est=document.getElementById('car-est')?.value||'';
  let cargas=_cargas.filter(cg=>{
    if(est&&cg.estado!==est)return false;
    if(fd&&(cg.fecha||'')<fd)return false;
    if(fh&&(cg.fecha||'')>fh)return false;
    if(q){
      const ven=(cg.vendedor||'').toLowerCase();
      const nom=(cg.nombre||'').toLowerCase();
      const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id));
      const cliMatch=peds.some(p=>(p.cliente||'').toLowerCase().includes(q));
      if(!ven.includes(q)&&!nom.includes(q)&&!cliMatch&&!String(cg.id).includes(q))return false;
    }
    return true;
  });
  if(!cargas.length){el.innerHTML='<div class="empty">Sin cargas'+(q||fd||fh||est?' para los filtros seleccionados':'')+'</div>';return;}
  el.innerHTML=cargas.map(cg=>{
    const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id));
    const titulo=cg.nombre?`<b>${cg.nombre}</b> — Carga #${cg.id}`:`Carga #${cg.id}`;
    // Detectar si hay remitos vinculados a esta carga
    const pedIds=(cg.pedidos||[]);
    const remsCarga=_remitos.filter(r=>pedIds.includes(r.pedido_id));
    // Fallback: remitos del mismo día y vendedor si no hay por pedido_id
    const remsDisp=remsCarga.length>0?remsCarga:
      (cg.fecha&&cg.vendedor?_remitos.filter(r=>r.fecha===cg.fecha&&(r.vendedor||'').toLowerCase()===(cg.vendedor||'').toLowerCase()):[]);
    const tieneRemitos=remsDisp.length>0;
    return `<div class="ccard">
      <div class="ccard-h">
        <div>
          <div class="ccard-nm">${titulo} ${cg.vendedor?'— '+cg.vendedor:''}</div>
          <div class="ccard-sub">${cg.fecha} · ${(cg.pedidos||[]).length} pedidos</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:2px">${peds.map(p=>p.cliente).join(' · ')}</div>
        </div>
        <div style="text-align:right"><div class="ccard-tot">${fmt(cg.total)}</div><span class="b ${cg.estado==='armando'?'bW':cg.estado==='lista'?'bA':cg.estado==='emitida'?'bP':'bP'}">${cg.estado}</span></div>
      </div>
      <div class="ccard-acts">
        ${cg.estado==='armando'?`<button class="btn P sm" onclick="marcarLista(${cg.id})">✓ Marcar lista</button>`:''}
        ${cg.estado==='lista'?`<button class="btn A sm" onclick="emitirRemitos(${cg.id})">📄 Emitir remitos</button>`:''}
        <button class="btn sm" onclick="editarCarga(${cg.id})">✏️</button>
        <button class="btn sm" onclick="resumenCarga(${cg.id})">📋 Resumen</button>
        ${tieneRemitos?`<button class="btn A sm" onclick="imprimirRemitosCarga(${cg.id})">🖨️ Remitos (${remsDisp.length})</button>`:''}
        ${cg.estado==='armando'?`<button class="btn D sm" onclick="eliminarCarga(${cg.id})" title="Eliminar carga y devolver pedidos">🗑</button>`:''}
      </div>
    </div>`;
  }).join('');
}

function imprimirRemitosCarga(cargaId){
  const cg=_cargas.find(x=>x.id===cargaId);if(!cg)return;
  const pedIds=(cg.pedidos||[]);
  let rems=_remitos.filter(r=>pedIds.includes(r.pedido_id));
  // Fallback: misma fecha y vendedor
  if(!rems.length&&cg.fecha&&cg.vendedor){
    rems=_remitos.filter(r=>r.fecha===cg.fecha&&(r.vendedor||'').toLowerCase()===(cg.vendedor||'').toLowerCase());
  }
  if(!rems.length){alert('No hay remitos emitidos para esta carga todavía.');return;}

  rems=rems.slice().sort((a,b)=>(a.localidad||'').localeCompare(b.localidad||'')||(a.cliente||'').localeCompare(b.cliente||''));
  const totalGeneral=rems.reduce((a,r)=>a+(r.total||0),0);
  const titulo=(cg.nombre||'Carga #'+cg.id);

  const bloques=rems.map((r,i)=>{
    const cli=_clientes.find(x=>String(x.id)===String(r.cliente_id))||_clientes.find(x=>(x.nombre||"").toLowerCase()===(r.cliente||"").toLowerCase())||_clientes.find(x=>(r.cliente||"").toLowerCase().includes((x.nombre||"").toLowerCase().split(" ")[0]))||{};
    const dir=r.lugar_entrega||r.direccion||cli.direccion||cli.domicilio||'';
    const tel=r.telefono||cli.telefono||cli.celular||cli.tel||"";
    let tot=0;
    const filas=(r.items||[]).map(it=>{
      const neto=it.precio*it.cant*(1-(it.dto||0)/100);tot+=neto;
      return '<tr>'
        +'<td style="padding:4px 7px;border:1px solid #ccc">'+it.nom+'</td>'
        +'<td style="padding:4px 7px;border:1px solid #ccc;text-align:center">'+it.cant+' '+(it.un||'')+'</td>'
        +'<td style="padding:4px 7px;border:1px solid #ccc;text-align:right">'+fmt(it.precio)+'</td>'
        +((it.dto||0)>0?'<td style="padding:4px 7px;border:1px solid #ccc;text-align:center">'+it.dto+'%</td>':'<td style="padding:4px 7px;border:1px solid #ccc;text-align:center">—</td>')
        +'<td style="padding:4px 7px;border:1px solid #ccc;text-align:right;font-weight:600">'+fmt(neto)+'</td>'
        +'</tr>';
    }).join('');
    return '<div style="margin-bottom:16px;page-break-inside:avoid;border:1px solid #ccc;border-radius:4px;overflow:hidden">'
      +'<div style="background:#1a7a52;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-weight:700;font-size:13px">'+(i+1)+'. R-'+String(r.id).padStart(4,'0')+' — '+r.cliente+'</span>'
        +'<span style="font-size:11px;font-weight:400">'+(dir?dir+' · ':'')+r.localidad+(tel?' · 📞 '+tel:'')+'</span>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px">'
        +'<thead><tr style="background:#e8f5e9">'
          +'<th style="padding:4px 7px;border:1px solid #ccc;text-align:left">Producto</th>'
          +'<th style="padding:4px 7px;border:1px solid #ccc;text-align:center;width:80px">Cant.</th>'
          +'<th style="padding:4px 7px;border:1px solid #ccc;text-align:right;width:80px">P.Unit</th>'
          +'<th style="padding:4px 7px;border:1px solid #ccc;text-align:center;width:45px">Dto</th>'
          +'<th style="padding:4px 7px;border:1px solid #ccc;text-align:right;width:90px">Total</th>'
        +'</tr></thead>'
        +'<tbody>'+filas+'</tbody>'
      +'</table>'
      +'<div style="display:flex;justify-content:space-between;padding:5px 10px;background:#fafafa;border-top:1px solid #ccc;font-size:12px">'
        +(r.observaciones?'<span style="color:#555">Obs: '+r.observaciones+'</span>':'<span></span>')
        +'<span style="font-weight:700;color:#1a7a52">Total: '+fmt(tot)+'</span>'
      +'</div>'
    +'</div>';
  }).join('');

  const resumen=rems.map((r,i)=>{
    const cli=_clientes.find(x=>String(x.id)===String(r.cliente_id))||{};
    const dir=r.lugar_entrega||r.direccion||cli.direccion||'';
    return '<tr style="'+(i%2===0?'':'background:#f9f9f9')+'">'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:center;color:#777;font-size:11px">'+(i+1)+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-size:11px;color:#555">R-'+String(r.id).padStart(4,'0')+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-weight:600">'+r.cliente+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-size:11px;color:#555">'+dir+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-size:11px">'+r.localidad+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:right;font-weight:600">'+fmt(r.total)+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:center">☐</td>'
    +'</tr>';
  }).join('');

  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Remitos — '+titulo+'</title>'
    +'<style>body{font-family:Arial,sans-serif;padding:15px;color:#000;font-size:12px;margin:0}'
    +'@page{size:A4 portrait;margin:10mm}@media print{.no-print{display:none}}'
    +'</style></head><body>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a7a52;padding-bottom:8px;margin-bottom:14px">'
      +'<div>'
        +'<div style="font-size:16px;font-weight:700;color:#1a7a52">🌸 DISTRIBUIDORA LILA</div>'
        +'<div style="font-size:13px;font-weight:600;margin-top:2px">'+titulo+'</div>'
        +'<div style="font-size:12px;margin-top:2px"><b>Fecha:</b> '+cg.fecha+' &nbsp;&nbsp; <b>Vendedor:</b> '+(cg.vendedor||'—')+'</div>'
      +'</div>'
      +'<div style="text-align:right;font-size:11px;color:#777">'
        +'<div>'+rems.length+' remitos</div>'
        +'<div style="font-size:15px;font-weight:700;color:#1a7a52;margin-top:4px">'+fmt(totalGeneral)+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="font-weight:600;font-size:13px;margin-bottom:6px;color:#1a7a52">📋 Resumen</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">'
      +'<thead><tr style="background:#e8e8e8">'
        +'<th style="padding:5px 7px;border:1px solid #ccc;width:28px;text-align:center">Nro</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;width:55px">Remito</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;text-align:left">Cliente</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;text-align:left">Dirección</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;text-align:left">Localidad</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;text-align:right;width:90px">Total</th>'
        +'<th style="padding:5px 7px;border:1px solid #ccc;text-align:center;width:35px">✓</th>'
      +'</tr></thead>'
      +'<tbody>'+resumen+'</tbody>'
      +'<tfoot><tr style="background:#e8f5e9;font-weight:700">'
        +'<td colspan="5" style="padding:6px 7px;border:1px solid #ccc;text-align:right">TOTAL</td>'
        +'<td style="padding:6px 7px;border:1px solid #ccc;text-align:right;color:#1a7a52;font-size:14px">'+fmt(totalGeneral)+'</td>'
        +'<td style="border:1px solid #ccc"></td>'
      +'</tr></tfoot>'
    +'</table>'
    +'<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#1a7a52">📄 Detalle por cliente</div>'
    +bloques
    +'<div class="no-print" style="text-align:center;margin-top:16px">'
      +'<button onclick="window.print()" style="padding:8px 24px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir</button>'
    +'</div>'
    +'</body></html>');
  w.document.close();
}

function editarCarga(id){
  const cg=_cargas.find(x=>x.id===id);if(!cg)return;
  document.getElementById('ec-id').value=id;
  document.getElementById('ec-nombre').value=cg.nombre||'';
  document.getElementById('ec-fecha').value=cg.fecha||'';
  document.getElementById('ec-ven').value=cg.vendedor||'';
  document.getElementById('m-editar-carga').classList.add('on');
}

async function guardarEditarCarga(){
  const id=parseInt(document.getElementById('ec-id').value);
  const nombre=document.getElementById('ec-nombre').value;
  const fecha=document.getElementById('ec-fecha').value;
  const vendedor=document.getElementById('ec-ven').value;
  await sb.from('cargas').update({nombre,fecha,vendedor}).eq('id',id);
  cerrar('m-editar-carga');
  await cargarCargas();renderCargas();
}

async function marcarLista(id){
  await sb.from('cargas').update({estado:'lista'}).eq('id',id);
  await cargarCargas();renderCargas();
}

async function eliminarCarga(id){
  const cg=_cargas.find(x=>x.id===id);if(!cg)return;
  if(cg.estado!=='armando'){toast('Solo se pueden eliminar cargas en estado "armando"');return;}
  if(!confirm('¿Eliminar esta carga? Los pedidos vuelven a estado pendiente.'))return;
  for(const pid of (cg.pedidos||[])){await sb.from('pedidos').update({estado:'pendiente',carga_id:null}).eq('id',pid);}
  await sb.from('cargas').delete().eq('id',id);
  await Promise.all([cargarCargas(),cargarPedidos()]);
  renderCargas();renderPedidos();renderDash();
  toast('Carga eliminada — pedidos devueltos a pendiente');
}

async function emitirRemitos(cargaId){
  const cg=_cargas.find(x=>x.id===cargaId);if(!cg)return;
  const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id)&&p.estado!=='remitado'&&!p.remito_id);
  if(!peds.length){toast('Todos los pedidos de esta carga ya tienen remito.');return;}
  const hoy=new Date().toISOString().split('T')[0];
  // Acumular totales por cliente antes de actualizar para evitar sobrescritura con múltiples pedidos del mismo cliente
  const acumCliente={};
  for(const p of peds){acumCliente[p.cliente_id]=(acumCliente[p.cliente_id]||{total:0,comprado:0,fecha:hoy});acumCliente[p.cliente_id].total+=p.total;acumCliente[p.cliente_id].comprado+=p.total;}
  for(const p of peds){
    const c=_clientes.find(x=>x.id===p.cliente_id);
    const {data:rem}=await sb.from('remitos').insert({
      pedido_id:p.id,cliente_id:p.cliente_id,cliente:p.cliente,localidad:p.localidad,
      zona:p.zona,vendedor:p.vendedor,fecha:hoy,
      items:p.items,total:p.total,cobrado:false,
      direccion:c?.direccion||c?.domicilio||'',telefono:c?.telefono||''
    }).select().single();
    await sb.from('pedidos').update({estado:'remitado',remito_id:rem.id}).eq('id',p.id);
    await descontarStock(p.items||[]);
    // Asiento contable
    const totDesc=(p.items||[]).reduce((a,it)=>{const bruto=it.precio*it.cant;return a+(bruto-bruto*(1-(it.dto||0)/100));},0);
    const {data:asiento}=await sb.from('asientos').insert({
      fecha:rem.fecha,descripcion:`Remito R-${String(rem.id).padStart(4,'0')} - ${p.cliente}`,
      tipo:'VENTA',referencia_id:rem.id,referencia_tipo:'remito'
    }).select().single();
    if(asiento){
      const det=[
        {asiento_id:asiento.id,cuenta_cod:'11201',cuenta_nom:'Deudores por Ventas',debe:p.total,haber:0},
        {asiento_id:asiento.id,cuenta_cod:'40100',cuenta_nom:'Ventas',debe:0,haber:p.total+(totDesc||0)},
      ];
      if(totDesc>0)det.push({asiento_id:asiento.id,cuenta_cod:'50305',cuenta_nom:'Descuentos Concedidos',debe:totDesc,haber:0});
      await sb.from('asientos_detalle').insert(det);
    }
  }
  // Actualizar saldo de cada cliente una sola vez (acumulando todos sus pedidos)
  for(const [cliId,ac] of Object.entries(acumCliente)){
    const c=_clientes.find(x=>x.id==cliId);
    if(c)await sb.from('clientes').update({saldo:(c.saldo||0)+ac.total,total_comprado:(c.total_comprado||0)+ac.comprado,ultimo_remito:hoy}).eq('id',c.id);
  }
  // Marcar carga como emitida
  await sb.from('cargas').update({estado:'emitida'}).eq('id',cargaId);
  await cargarTodo();renderCargas();renderRemitos();renderDash();
  toast(`${peds.length} remito(s) emitido(s).`);go('remitos');
}

function resumenCarga(id){
  const cg=_cargas.find(x=>x.id===id);if(!cg)return;
  _cargaActual=cg;_verTipo='carga';
  const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id));
  const totalGeneral=peds.reduce((a,p)=>a+p.total,0);
  document.getElementById('m-ver-title').textContent='Carga #'+cg.id+' — '+cg.vendedor;
  const _mvp=document.getElementById('m-ver-print');
  if(_mvp){_mvp.textContent='🖨 Hoja de carga';_mvp.onclick=imprimirHojaCarga;_mvp.style.display='inline-flex';}
  const _mvp2=document.getElementById('m-ver-print2');
  if(_mvp2){_mvp2.textContent='🖨 Hoja de ruta';_mvp2.onclick=imprimirHojaRuta;_mvp2.style.display='inline-flex';}
  const _anu=document.getElementById('m-ver-anular');if(_anu)_anu.style.display='none';
  document.getElementById('m-ver-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;color:var(--txt2)">${cg.fecha} · ${peds.length} paradas · Vendedor: <b>${cg.vendedor||'—'}</b></div>
      <div style="font-size:18px;font-weight:700;color:var(--P)">${fmt(totalGeneral)}</div>
    </div>

    <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--PD)">📦 Hoja de carga — por cliente:</div>

    ${peds.map((p,i)=>{
      const c=_clientes.find(x=>x.id===p.cliente_id);
      return `
      <div style="border:1px solid var(--brd);border-radius:8px;margin-bottom:12px;overflow:hidden">
        <div style="background:var(--PL);padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-weight:700;font-size:14px">${i+1}. ${p.cliente}</span>
            <span style="color:var(--PD);font-size:11px;margin-left:6px;font-weight:600">Cód: ${c?.codigo||p.cliente_id||'—'}</span>
            <span style="color:var(--txt2);font-size:12px;margin-left:8px">${c?.direccion||'—'} · ${p.localidad||''}</span>
          </div>
          <span style="font-weight:700;color:var(--PD)">${fmt(p.total)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--bg2)">
            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--brd)">Producto</th>
            <th style="padding:6px 10px;text-align:right;border-bottom:1px solid var(--brd)">Cant.</th>
            <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--brd)">Unidad</th>
            <th style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--brd)">Peso real</th>
          </tr></thead>
          <tbody>
            ${(p.items||[]).map(it=>`<tr>
              <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd)">${it.nom}</td>
              <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:700">${fmtN(it.cant,2)}</td>
              <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);color:var(--txt2)">${it.un||''}</td>
              <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);text-align:center">
                ${(it.un||'').toLowerCase()==='kg'?`<input type="number" placeholder="0.00" step="0.01" style="width:80px;padding:3px 6px;border:1px solid var(--brd);border-radius:4px;text-align:center">`:'-'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    }).join('')}

    <div style="font-weight:600;font-size:13px;margin-bottom:8px;margin-top:4px;color:var(--PD)">🗺️ Hoja de ruta — resumen:</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:var(--bg2)">
        <th style="padding:7px 10px;text-align:center;border-bottom:1px solid var(--brd);width:32px">Nro</th>
        <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--brd)">Cliente</th>
        <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--brd)">Dirección</th>
        <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--brd)">Localidad</th>
        <th style="padding:7px 10px;text-align:right;border-bottom:1px solid var(--brd)">Total</th>
        <th style="padding:7px 10px;text-align:center;border-bottom:1px solid var(--brd)">☐</th>
      </tr></thead>
      <tbody>
        ${peds.map((p,i)=>{
          const c=_clientes.find(x=>x.id===p.cliente_id);
          return `<tr style="${i%2===0?'':'background:var(--bg2)'}">
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);text-align:center;font-weight:700;color:var(--txt2)">${i+1}</td>
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);font-weight:600">${p.cliente}</td>
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);color:var(--txt2);font-size:12px">${c?.direccion||'—'}</td>
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);color:var(--txt2)">${p.localidad||''}</td>
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:600;color:var(--P)">${fmt(p.total)}</td>
            <td style="padding:7px 10px;border-bottom:0.5px solid var(--brd);text-align:center">☐</td>
          </tr>`;
        }).join('')}
        <tr style="background:var(--PL);font-weight:700">
          <td colspan="4" style="padding:8px 10px;border-top:2px solid var(--brd)">TOTAL</td>
          <td style="padding:8px 10px;border-top:2px solid var(--brd);text-align:right;color:var(--PD);font-size:15px">${fmt(totalGeneral)}</td>
          <td style="border-top:2px solid var(--brd)"></td>
        </tr>
      </tbody>
    </table>
    ${peds.length?`<div style="margin-top:10px;font-size:11px;color:var(--txt2)">Pedidos: #${peds.map(p=>p.id).join(', #')}</div>`:''}
  `;
  document.getElementById('m-ver').classList.add('on');
}

// ─── REMITOS ───
function renderRemitos(){
  const q=(document.getElementById('rem-q').value||'').toLowerCase();
  const est=document.getElementById('rem-est').value;
  const fd=document.getElementById('rem-fd')?.value||'';
  const fh=document.getElementById('rem-fh')?.value||'';
  const fNro=document.getElementById('rem-f-nro')?.value||'';
  const fFecha=document.getElementById('rem-f-fecha')?.value||'';
  const fCli=document.getElementById('rem-f-cli')?.value||'';
  const fLoc=document.getElementById('rem-f-loc')?.value||'';
  const fItems=document.getElementById('rem-f-items')?.value||'';
  const fTotal=document.getElementById('rem-f-total')?.value||'';
  let data=_remitos.filter(r=>{
    if(r.anulado)return false;
    if(q&&!((r.cliente||'').toLowerCase().includes(q)||('r-'+String(r.id).padStart(4,'0')).includes(q)||String(r.id).includes(q)||(r.localidad||'').toLowerCase().includes(q)))return false;
    if(est==='parcial'){if(!(r.saldo_pendiente>0&&r.saldo_pendiente<r.total&&!r.cobrado))return false;}
    else if(est!==''&&String(r.cobrado)!==est)return false;
    if(fd&&r.fecha<fd)return false;
    if(fh&&r.fecha>fh)return false;
    if(!matchFiltroCol('R-'+String(r.id).padStart(4,'0'),fNro))return false;
    if(!matchFiltroCol(r.fecha,fFecha))return false;
    if(!matchFiltroCol(r.cliente,fCli))return false;
    if(!matchFiltroCol(r.localidad,fLoc))return false;
    if(!matchFiltroCol((r.items||[]).length,fItems))return false;
    if(!matchFiltroCol(r.total,fTotal))return false;
    return true;
  });
  const tot=data.length,sl=data.slice((_remPg-1)*PP,_remPg*PP);
  const tbody=document.getElementById('rem-tbody');
  tbody.innerHTML=sl.length?sl.map(r=>{
    const parcial=!r.cobrado&&r.saldo_pendiente>0&&r.saldo_pendiente<r.total;
    const cobBadge=r.cobrado?'<span class="b bP">Cobrado</span>':parcial?`<span class="b bW" title="Saldo: ${fmt(r.saldo_pendiente)}">Parcial</span>`:'<span class="b" style="background:var(--bg2);color:var(--txt2)">Pendiente</span>';
    return `<tr>
    <td style="font-weight:600;color:var(--P)">R-${String(r.id).padStart(4,'0')}</td>
    <td>${r.fecha}</td><td style="font-weight:500">${r.cliente}</td><td>${r.localidad||''}</td>
    <td>${(r.items||[]).length}</td><td style="font-weight:600">${fmt(r.total)}</td>
    <td>${cobBadge}</td>
    <td>${r.factura_arca?`<span class="b bA" title="${r.nro_arca||''}" style="cursor:pointer">✅ ${r.nro_arca||'ARCA'}</span>`:`<button class="btn sm" style="font-size:11px" onclick="marcarARCA(${r.id})">+ ARCA</button>`}</td>
    <td>
      <button class="btn sm" onclick="verRemito(${r.id})">👁</button>
      <button class="btn sm" onclick="impRem(${r.id})">🖨️</button>
      ${!r.cobrado?`<button class="btn sm" style="background:var(--G);color:#fff;font-size:11px" onclick="cobrarRemito(${r.id})">💵 Cobrar</button>`:''}
    </td>
  </tr>`;}).join(''):'<tr><td colspan="9"><div class="empty">Sin remitos</div></td></tr>';
  pag('rem-pg',tot,_remPg,p=>{_remPg=p;renderRemitos();});
}

async function marcarARCA(id){
  const nro=prompt('Número de comprobante ARCA (opcional):');
  if(nro===null)return; // canceló
  await sb.from('remitos').update({factura_arca:true, nro_arca:nro||''}).eq('id',id);
  await cargarRemitos();renderRemitos();
}

let _remActual=null;

let _verTipo='remito';

 // 'remito' o 'carga'
let _cargaActual=null;

function verRemito(id){
  const r=_remitos.find(x=>x.id===id);if(!r)return;
  _remActual=r;_verTipo='remito';
  document.getElementById('m-ver-title').textContent='Remito R-'+String(r.id).padStart(4,'0')+' — '+r.cliente;
  const _p2=document.getElementById('m-ver-print2');if(_p2){_p2.style.display='none';}
  const _p=document.getElementById('m-ver-print');
  if(_p){_p.textContent='🖨️ Imprimir remito';_p.onclick=imprimirRemito;_p.style.display='inline-flex';}
  const _an=document.getElementById('m-ver-anular');
  if(_an){_an.style.display=(!r.cobrado&&!r.anulado)?'inline-flex':'none';}
  document.getElementById('m-ver-body').innerHTML=detalleHTML(r,true);
  document.getElementById('m-ver').classList.add('on');
}

async function anularRemito(){
  if(!_remActual)return;
  const r=_remActual;
  if(r.cobrado){toast('No se puede anular un remito ya cobrado','err');return;}
  if(!confirm(`¿Anular Remito R-${String(r.id).padStart(4,'0')} de ${r.cliente}?\nSe revertirá el saldo del cliente.`))return;
  await sb.from('remitos').update({anulado:true}).eq('id',r.id);
  const c=_clientes.find(x=>x.id===r.cliente_id);
  if(c){const ns=Math.max(0,(c.saldo||0)-r.total);const nc=Math.max(0,(c.total_comprado||0)-r.total);await sb.from('clientes').update({saldo:ns,total_comprado:nc}).eq('id',c.id);}
  if(r.pedido_id)await sb.from('pedidos').update({estado:'pendiente',remito_id:null}).eq('id',r.pedido_id);
  cerrar('m-ver');
  await Promise.all([cargarRemitos(),cargarClientes(),cargarPedidos()]);
  renderRemitos();renderCC();renderDash();renderPedidos();
  toast('Remito anulado — saldo del cliente revertido');
}

function impRem(id){verRemito(id);imprimirRemito();}

function imprimirHojaCarga(){
  const cg=_cargaActual;
  if(!cg){alert('No hay carga activa');return;}
  const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id));
  const fecha=cg.fecha||new Date().toISOString().split('T')[0];
  const vendedor=cg.vendedor||'—';

  const bloques=peds.map((p,i)=>{
    const c=_clientes.find(x=>x.id==p.cliente_id)||{};
    const filasProd=(p.items||[]).map((it,j)=>{
      const esPeso=(it.un||'').toLowerCase()==='kg';
      const rawUn=(it.un||'').trim();
      const unitDisplay=rawUn&&!/\s/.test(rawUn)&&rawUn.length<=6?rawUn:'—';
      const prod=_productos.find(px=>px.id==it.id);
      const codProd=prod?.codigo||it.cod||'';
      return '<tr>'
        +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-size:11px;color:#555;white-space:nowrap">'+codProd+'</td>'
        +'<td style="padding:4px 6px;border:1px solid #ccc;font-weight:500">'+it.nom+'</td>'
        +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:center">'+it.cant+'</td>'
        +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:center;color:#555">'+unitDisplay+'</td>'
        +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:center;letter-spacing:2px">'+(esPeso?'_________':'—')+'</td>'
        +'</tr>';
    }).join('');
    const codCliente=c.codigo||p.cliente_id||'';

    return '<div style="margin-bottom:16px;page-break-inside:avoid">'
      +'<div style="background:#1a7a52;color:#fff;padding:6px 10px;font-weight:700;font-size:13px;border-radius:4px 4px 0 0">'
        +(i+1)+'. <span style="font-size:17px;font-weight:900;background:rgba(255,255,255,0.2);padding:1px 7px;border-radius:3px;letter-spacing:1px">'+codCliente+'</span> '+p.cliente
        +'<span style="float:right;font-size:11px;font-weight:400">'+(c.direccion||'')+' '+(p.localidad||'')+'</span>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:#e8f5e9">'
          +'<th style="padding:4px 6px;border:1px solid #ccc;text-align:center;width:8%">Código</th>'
          +'<th style="padding:4px 6px;border:1px solid #ccc;text-align:left">Producto</th>'
          +'<th style="padding:4px 6px;border:1px solid #ccc;text-align:center;width:12%">Cant.</th>'
          +'<th style="padding:4px 6px;border:1px solid #ccc;text-align:center;width:9%">Unidad</th>'
          +'<th style="padding:4px 6px;border:1px solid #ccc;text-align:center;width:22%">Peso real (kg)</th>'
        +'</tr></thead>'
        +'<tbody>'+filasProd+'</tbody>'
      +'</table>'
      +'<div style="text-align:right;padding:4px 8px;border:1px solid #ccc;border-top:none;font-size:12px;background:#fafafa">'
        +'Vendedor: <b>'+vendedor+'</b> &nbsp;&nbsp; Total estimado: <b>'+fmt(p.total)+'</b>'
      +'</div>'
    +'</div>';
  }).join('');

  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Hoja de Carga #'+cg.id+'</title>'
    +'<style>'
    +'body{font-family:Arial,sans-serif;padding:15px;color:#000;font-size:12px;margin:0}'
    +'@page{size:A4 portrait;margin:10mm}'
    +'@media print{.no-print{display:none}}'
    +'</style></head><body>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a7a52;padding-bottom:8px;margin-bottom:14px">'
      +'<div>'
        +'<div style="font-size:16px;font-weight:700;color:#1a7a52">🌸 DISTRIBUIDORA LILA — Hoja de Carga</div>'
        +'<div style="font-size:12px;margin-top:3px"><b>Repartidor:</b> '+vendedor+' &nbsp;&nbsp; <b>Fecha:</b> '+fecha+' &nbsp;&nbsp; <b>Carga #:</b> '+cg.id+'</div>'
      +'</div>'
      +'<div style="text-align:right;font-size:11px;color:#777">'
        +'<div>'+peds.length+' paradas</div>'
      +'</div>'
    +'</div>'
    +bloques
    +'<div class="no-print" style="text-align:center;margin-top:16px">'
      +'<button onclick="window.print()" style="padding:8px 24px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir</button>'
    +'</div>'
    +'</body></html>');
  w.document.close();
}

function imprimirHojaRuta(){
  const cg=_cargaActual;
  if(!cg){alert('No hay carga activa');return;}
  const peds=_pedidos.filter(p=>(cg.pedidos||[]).includes(p.id));
  const totalGeneral=peds.reduce((a,p)=>a+p.total,0);
  const fecha=cg.fecha||new Date().toISOString().split('T')[0];
  const vendedor=cg.vendedor||'—';

  const filas=peds.map((p,i)=>{
    const c=_clientes.find(x=>x.id==p.cliente_id)||{};
    const dir=c.direccion||p.localidad||'—';
    const loc=p.localidad||c.localidad||'';
    const tel=c.telefono||c.celular||'';
    const rem=_remitos.find(r=>r.pedido_id===p.id||r.id===p.remito_id);
    const nroRem=rem?'R-'+String(rem.id).padStart(4,'0'):'';
    return '<tr style="'+(i%2===0?'':'background:#f9f9f9')+'">'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px;color:#777">'+(i+1)+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-weight:600">'+(c.codigo||p.cliente_id||'')+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-weight:600">'+p.cliente
        +'<div style="font-size:10px;color:#555;font-weight:400">'+(tel?'📞 '+tel:'')+'</div></td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-weight:700;color:#1a7a52;text-align:center">'+nroRem+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-size:11px;color:#555">'+dir+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;font-size:11px">'+loc+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px">'+(c.zona||p.zona||'')+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:right;font-weight:600">'+fmt(p.total)+'</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;text-align:center">☐</td>'
      +'<td style="padding:5px 7px;border:1px solid #ccc;min-width:80px"></td>'
      +'</tr>';
  }).join('');

  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Hoja de Ruta — Carga #'+cg.id+'</title>'
    +'<style>'
    +'body{font-family:Arial,sans-serif;padding:15px;color:#000;font-size:12px;margin:0}'
    +'table{width:100%;border-collapse:collapse}'
    +'th{background:#e8e8e8;padding:5px 7px;border:1px solid #ccc;font-size:11px;text-align:left}'
    +'@page{size:A4 landscape;margin:8mm}'
    +'@media print{.no-print{display:none}}'
    +'</style></head><body>'
    // Header
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a7a52;padding-bottom:8px;margin-bottom:10px">'
      +'<div>'
        +'<div style="font-size:16px;font-weight:700;color:#1a7a52">🌸 DISTRIBUIDORA LILA</div>'
        +'<div style="font-size:12px;margin-top:3px"><b>Repartidor:</b> '+vendedor+'</div>'
        +'<div style="font-size:12px"><b>Fecha:</b> '+fecha+' &nbsp;&nbsp; <b>Carga #:</b> '+cg.id+'</div>'
      +'</div>'
      +'<div style="text-align:right;font-size:12px">'
        +'<div>Salida: ____________</div>'
        +'<div style="margin-top:6px">Llegada: ____________</div>'
        +'<div style="margin-top:6px">Página: 1</div>'
      +'</div>'
    +'</div>'
    // Tabla
    +'<table>'
      +'<thead><tr>'
        +'<th style="width:30px;text-align:center">Nro</th>'
        +'<th style="width:45px">Cód</th>'
        +'<th style="min-width:140px">Cliente</th>'
        +'<th style="width:70px">Remito</th>'
        +'<th style="min-width:130px">Dirección</th>'
        +'<th style="width:80px">Localidad</th>'
        +'<th style="width:40px;text-align:center">Zona</th>'
        +'<th style="width:90px;text-align:right">Importe</th>'
        +'<th style="width:35px;text-align:center">✓</th>'
        +'<th style="min-width:90px">Observaciones</th>'
      +'</tr></thead>'
      +'<tbody>'+filas+'</tbody>'
      +'<tfoot><tr style="background:#e8f5e9;font-weight:700">'
        +'<td colspan="7" style="padding:6px 7px;border:1px solid #ccc;text-align:right">TOTAL</td>'
        +'<td style="padding:6px 7px;border:1px solid #ccc;text-align:right;color:#1a7a52;font-size:14px">'+fmt(totalGeneral)+'</td>'
        +'<td colspan="2" style="border:1px solid #ccc;padding:6px 7px">'+peds.length+' paradas</td>'
      +'</tr></tfoot>'
    +'</table>'
    +'<div class="no-print" style="text-align:center;margin-top:16px">'
      +'<button onclick="window.print()" style="padding:8px 24px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir</button>'
    +'</div>'
    +'</body></html>');
  w.document.close();
}

function imprimirRemito(){
  const d=_remActual;
  if(!d){alert('No hay remito activo');return;}
  const num='R-'+String(d.id).padStart(4,'0');
  const cli=_clientes.find(x=>String(x.id)===String(d.cliente_id))||
            _clientes.find(x=>String(x.codigo)===String(d.cliente_id))||{};
  const dir=d.lugar_entrega||d.direccion||cli.direccion||cli.domicilio||'';
  const tel=d.telefono||cli.telefono||cli.celular||'';
  const condPago=d.condicion_pago??cli.condicion_pago;
  const condTexto=condPago?condPago+' días':'Contado';
  let sub=0,dtoT=0,tot=0;
  const rows=(d.items||[]).map(it=>{
    const prod=_productos.find(p=>p.id===it.id||p.nombre===it.nom)||{};
    const base=it.precio*it.cant,dtoA=base*((it.dto||0)/100),neto=base-dtoA;
    sub+=base;dtoT+=dtoA;tot+=neto;
    const esKg=(it.un||'').toLowerCase()==='kg';
    return '<tr>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-size:11px;white-space:nowrap">'+fmtN(it.cant,2)+' '+(it.un||'')+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;font-size:11px">'+it.nom+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-size:10px;color:#666">'+(prod.codigo||'—')+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-size:11px">'+(esKg?fmtN(it.cant,2):'—')+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:right;font-size:11px">'+fmt(it.precio)+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-size:11px">'+((it.dto||0)||'—')+(it.dto?'%':'')+'</td>'
      +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:right;font-weight:600;font-size:11px">'+fmt(neto)+'</td>'
      +'</tr>';
  }).join('');

  const bloque=(etiqueta)=>`
    <div style="padding:10px 0 8px 0;min-height:48%">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1a7a52;padding-bottom:8px;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#1a7a52">🌸 Distribuidora Lila</div>
          <div style="font-size:9px;color:#888;margin-top:2px">Distribución mayorista</div>
        </div>
        <div style="text-align:center;flex:1;padding:0 10px">
          <div style="font-size:22px;font-weight:800;color:#1a7a52;letter-spacing:1px">${num}</div>
          <div style="font-size:10px;color:#fff;font-weight:700;background:#1a7a52;padding:3px 12px;border-radius:12px;display:inline-block;margin-top:3px;letter-spacing:.5px">${etiqueta}</div>
        </div>
        <div style="text-align:right;min-width:110px">
          <div style="font-size:12px;font-weight:700">${d.fecha}</div>
          ${d.vendedor?`<div style="font-size:11px;color:#1a7a52;font-weight:600;margin-top:2px">Vendedor: ${d.vendedor}</div>`:''}
          <div style="font-size:10px;color:#555;margin-top:2px">Cond.: <b>${condTexto}</b></div>
        </div>
      </div>
      <div style="background:#f4f8f6;border:1.5px solid #c8e6d5;border-radius:5px;padding:8px 12px;margin-bottom:10px">
        <div style="font-weight:700;font-size:13px;color:#1a1a1a">${d.cliente}</div>
        ${dir?'<div style="color:#555;font-size:10px;margin-top:3px">📍 '+dir+'</div>':''}
        <div style="color:#666;font-size:10px;margin-top:2px">${d.localidad||''}${d.zona?' · Zona '+d.zona:''}${tel?' · Tel: '+tel:''}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;table-layout:fixed">
        <colgroup>
          <col style="width:58px"><col><col style="width:46px"><col style="width:44px"><col style="width:70px"><col style="width:42px"><col style="width:74px">
        </colgroup>
        <thead><tr style="background:#e8f5ef">
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:center">Cant.</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:left">Producto</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:center">Código</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:center">Kilos</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:right">P.Unit</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:center">Dto %</th>
          <th style="padding:5px 6px;border:1px solid #b2d8c4;font-size:10px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:right;border-top:1.5px solid #ccc;padding-top:6px;margin-top:2px">
        <div style="font-size:11px;color:#555">Total sin descuento: <b>${fmt(sub)}</b></div>
        ${dtoT>0?'<div style="font-size:11px;color:#b05000">Descuento: <b>− '+fmt(dtoT)+'</b></div>':''}
        <div style="font-size:16px;font-weight:800;color:#1a7a52;margin-top:4px">Neto a pagar: ${fmt(tot)}</div>
      </div>
      ${(d.observaciones||d.obs)?'<div style="font-size:10px;color:#555;border-top:1px solid #ddd;padding-top:5px;margin-top:6px">Obs: '+(d.observaciones||d.obs)+'</div>':''}
      <div style="margin-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#555;border-top:1px solid #ddd;padding-top:8px">
        <span>Firma: ___________________________</span>
        <span>Aclaración: ___________________________</span>
      </div>
    </div>`;

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${num}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;margin:0;padding:8mm;color:#000}
      @page{size:A4 portrait;margin:8mm}
      @media print{.no-print{display:none}body{padding:0}}
      .pagina{width:100%;display:flex;flex-direction:column;min-height:calc(100vh - 16mm)}
      .corte{border-top:1.5px dashed #aaa;margin:8px 0;text-align:center;font-size:9px;color:#aaa;letter-spacing:3px;padding:2px 0}
    </style></head><body>
    <div class="pagina">
      ${bloque('ORIGINAL — CLIENTE')}
      <div class="corte">✂ &nbsp;&nbsp; CORTAR &nbsp;&nbsp; ✂</div>
      ${bloque('DUPLICADO — EMPRESA')}
    </div>
    <div class="no-print" style="text-align:center;margin-top:14px">
      <button onclick="window.print()" style="padding:9px 28px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">🖨️ Imprimir</button>
    </div>
    </body></html>`);
  w.document.close();
}

function imprimirHojaRutaGrupal(){
  const fecha=document.getElementById('rem-grupo-fecha').value;
  const ven=(document.getElementById('rem-grupo-ven').value||'').toLowerCase().trim();
  if(!fecha){alert('Seleccioná una fecha');return;}
  let rems=_remitos.filter(r=>r.fecha===fecha);
  if(ven)rems=rems.filter(r=>(r.vendedor||'').toLowerCase().includes(ven));
  if(!rems.length){alert('No hay remitos para esa fecha'+(ven?' y vendedor':''));return;}

  // Deduplicar: 1) por ID, 2) por cliente+items+total (duplicados lógicos con distinto ID)
  rems=[...new Map(rems.map(r=>[r.id,r])).values()];
  {const seen=new Set();rems=rems.filter(r=>{const k=String(r.cliente_id||r.cliente)+'|'+(r.items||[]).length+'|'+r.total;return seen.has(k)?false:(seen.add(k),true);});}
  // Ordenar por localidad y cliente
  rems=rems.slice().sort((a,b)=>(a.localidad||'').localeCompare(b.localidad||'')||(a.cliente||'').localeCompare(b.cliente||''));
  const totalGeneral=rems.reduce((a,r)=>a+(r.total||0),0);
  const vendedorTitulo=ven||[...new Set(rems.map(r=>r.vendedor||'').filter(Boolean))].join(', ')||'—';

  // Bloques detalle por remito
  const bloques=rems.map((r,i)=>{
    const cli=_clientes.find(x=>String(x.id)===String(r.cliente_id))||_clientes.find(x=>(x.nombre||'').toLowerCase()===(r.cliente||'').toLowerCase())||{};
    const dir=r.lugar_entrega||r.direccion||cli.direccion||cli.domicilio||'';
    const tel=r.telefono||cli.telefono||cli.celular||'';
    let tot=0;
    const filas=(r.items||[]).map(it=>{
      const neto=it.precio*it.cant*(1-(it.dto||0)/100);tot+=neto;
      return '<tr>'
        +'<td style="padding:3px 6px;border:1px solid #ccc;font-size:11px">'+it.nom+'</td>'
        +'<td style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-size:11px;white-space:nowrap">'+it.cant+' '+(it.un||'')+'</td>'
        +'<td style="padding:3px 6px;border:1px solid #ccc;text-align:right;font-size:11px">'+fmt(it.precio)+'</td>'
        +((it.dto||0)>0?'<td style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-size:11px">'+it.dto+'%</td>':'<td style="padding:3px 6px;border:1px solid #ccc;text-align:center;color:#aaa;font-size:11px">—</td>')
        +'<td style="padding:3px 6px;border:1px solid #ccc;text-align:right;font-weight:600;font-size:11px">'+fmt(neto)+'</td>'
        +'</tr>';
    }).join('');
    const obs=r.observaciones||'';
    return '<div style="margin-bottom:12px;page-break-inside:avoid;border:1.5px solid #ccc;border-radius:4px;overflow:hidden">'
      +'<div style="background:#1a7a52;color:#fff;padding:5px 9px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-weight:700;font-size:12px">'+(i+1)+'. R-'+String(r.id).padStart(4,'0')+' — '+r.cliente+'</span>'
        +'<span style="font-size:10px;font-weight:400;opacity:0.9">'+(dir?dir+' · ':'')+r.localidad+(tel?' · '+tel:'')+'</span>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
        +'<colgroup><col><col style="width:70px"><col style="width:68px"><col style="width:34px"><col style="width:72px"></colgroup>'
        +'<thead><tr style="background:#e8f5e9">'
          +'<th style="padding:3px 6px;border:1px solid #ccc;text-align:left;font-size:11px">Producto</th>'
          +'<th style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-size:11px">Cant.</th>'
          +'<th style="padding:3px 6px;border:1px solid #ccc;text-align:right;font-size:11px">P.Unit</th>'
          +'<th style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-size:11px">Dto</th>'
          +'<th style="padding:3px 6px;border:1px solid #ccc;text-align:right;font-size:11px">Total</th>'
        +'</tr></thead>'
        +'<tbody>'+filas+'</tbody>'
      +'</table>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 9px;background:#fafafa;border-top:1px solid #ccc;font-size:11px;gap:12px">'
        +'<span style="color:#444;flex:1">Obs: '+(obs||'<span style="color:#bbb">___________________________________</span>')+'</span>'
        +'<span style="white-space:nowrap">Cobrado: <b>$_______________</b></span>'
        +'<span style="font-weight:700;color:#1a7a52;white-space:nowrap">Total: '+fmt(tot)+'</span>'
      +'</div>'
    +'</div>';
  }).join('');

  // Tabla resumen
  const resumen=rems.map((r,i)=>{
    const cli=_clientes.find(x=>String(x.id)===String(r.cliente_id))||{};
    const dir=r.lugar_entrega||r.direccion||cli.direccion||'';
    return '<tr style="'+(i%2===0?'':'background:#f9f9f9')+'">'
      +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:center;color:#777;font-size:10px">'+(i+1)+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;font-size:10px;color:#555;white-space:nowrap">R-'+String(r.id).padStart(4,'0')+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;font-weight:600;font-size:11px">'+r.cliente+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;font-size:10px;color:#555">'+dir+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;font-size:10px">'+r.localidad+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-weight:600;font-size:11px">'+fmt(r.total)+'</td>'
      +'<td style="padding:4px 6px;border:1px solid #ccc;font-size:11px">$___________</td>'
    +'</tr>';
  }).join('');

  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hoja de Ruta — '+fecha+'</title>'
    +'<style>'
    +'*{box-sizing:border-box}'
    +'body{font-family:Arial,sans-serif;padding:10mm;color:#000;font-size:11px;margin:0;line-height:1.3}'
    +'@page{size:A4 portrait;margin:10mm}'
    +'@media print{.no-print{display:none}body{padding:0}}'
    +'</style></head><body>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a7a52;padding-bottom:6px;margin-bottom:10px">'
      +'<div>'
        +'<div style="font-size:15px;font-weight:700;color:#1a7a52">DISTRIBUIDORA LILA — Hoja de Ruta</div>'
        +'<div style="font-size:11px;margin-top:2px"><b>Fecha:</b> '+fecha+' &nbsp; <b>Vendedor:</b> '+vendedorTitulo+' &nbsp; <b>Paradas:</b> '+rems.length+'</div>'
      +'</div>'
      +'<div style="text-align:right">'
        +'<div style="font-size:13px;font-weight:700;color:#1a7a52">'+fmt(totalGeneral)+'</div>'
        +'<div style="font-size:10px;color:#777">total general</div>'
      +'</div>'
    +'</div>'
    +'<div style="font-weight:700;font-size:11px;margin-bottom:4px;color:#1a7a52">RESUMEN</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;table-layout:fixed">'
      +'<colgroup><col style="width:24px"><col style="width:46px"><col><col style="width:110px"><col style="width:80px"><col style="width:72px"><col style="width:90px"></colgroup>'
      +'<thead><tr style="background:#e8e8e8">'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:center">Nro</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc">Remito</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:left">Cliente</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:left">Dirección</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:left">Localidad</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:right">Total</th>'
        +'<th style="padding:4px 5px;border:1px solid #ccc;text-align:left">Cobrado $</th>'
      +'</tr></thead>'
      +'<tbody>'+resumen+'</tbody>'
      +'<tfoot><tr style="background:#e8f5e9;font-weight:700">'
        +'<td colspan="5" style="padding:5px 6px;border:1px solid #ccc;text-align:right;font-size:11px">TOTAL GENERAL</td>'
        +'<td style="padding:5px 6px;border:1px solid #ccc;text-align:right;color:#1a7a52;font-size:13px">'+fmt(totalGeneral)+'</td>'
        +'<td style="border:1px solid #ccc"></td>'
      +'</tr></tfoot>'
    +'</table>'
    +'<div style="font-weight:700;font-size:11px;margin-bottom:6px;color:#1a7a52">DETALLE POR CLIENTE</div>'
    +bloques
    +'<div style="border-top:2px solid #1a7a52;margin-top:10px;padding-top:6px;text-align:right;font-size:13px;font-weight:700;color:#1a7a52">TOTAL GENERAL: '+fmt(totalGeneral)+'</div>'
    +'<div class="no-print" style="text-align:center;margin-top:16px">'
      +'<button onclick="window.print()" style="padding:8px 24px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Imprimir</button>'
    +'</div>'
    +'</body></html>');
  w.document.close();
}

// ─── Pool de clientes para el repartidor ─────────────────────────────────────
let _hrClientesHoy = null;

// Carga/reparto activo del repartidor para hoy (o null si no tiene ninguna carga emitida hoy)
let _cargaActivaHoy = null;

 // null = no cargado, [] = cargado sin ruta, [ids] = ruta del día
async function cargarHojaRutaRepartidor(){
  if(usuarioActual?.rol!=='repartidor'){_hrClientesHoy=null;_cargaActivaHoy=null;return;}
  const hoy=new Date().toISOString().split('T')[0];
  const nombre=usuarioActual.nombre||'';
  const {data}=await sb.from('hoja_ruta').select('cliente_id').eq('fecha',hoy).ilike('vendedor',nombre);
  const ids=(data||[]).map(r=>r.cliente_id).filter(Boolean);
  _hrClientesHoy=ids.length?ids:[];

  // Carga/reparto activo: la carga emitida hoy a nombre de este chofer/repartidor
  const candidatas=(_cargas||[]).filter(c=>c.estado==='emitida'&&c.fecha===hoy&&(c.vendedor||'').toLowerCase()===nombre.toLowerCase());
  _cargaActivaHoy=candidatas.length?candidatas.sort((a,b)=>b.id-a.id)[0]:null;

  // Mostrar badge indicador
  const badge=document.getElementById('cobm-ruta-badge');
  if(badge){
    const partes=[];
    partes.push(ids.length?`📍 Ruta del día: ${ids.length} cliente${ids.length>1?'s':''}`:'⚠️ Sin hoja de ruta hoy — mostrando todos tus clientes');
    partes.push(_cargaActivaHoy?`🚚 ${_cargaActivaHoy.nombre||'Reparto #'+_cargaActivaHoy.id}`:'⚠️ Sin reparto emitido hoy — el cobro no quedará vinculado a una carga');
    badge.textContent=partes.join(' · ');
    badge.style.display='block';
  }
}

// ─── HOJA DE RUTA ──────────────────────────────────────────────
let _hrRuta = [];

 // array de {cliente_id, nombre, direccion, telefono, zona, orden, visitado}
function hrTab(tab){
  document.getElementById('hr-panel-admin').style.display=tab==='admin'?'':'none';
  document.getElementById('hr-panel-mia').style.display=tab==='mia'?'':'none';
  document.getElementById('hr-tab-admin').className='btn'+(tab==='admin'?' P':'')+' sm';
  document.getElementById('hr-tab-mia').className='btn'+(tab==='mia'?' P':'')+' sm';
  if(tab==='mia') hrVerMiRuta();
}

function hrInit(){
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('hr-fecha').value = hoy;
  document.getElementById('hr-fecha-mia').value = hoy;
  // Poblar vendedores
  const sel = document.getElementById('hr-vendedor');
  const vens = [...new Set(_clientes.map(c=>c.vendedor||'').filter(Boolean))].sort();
  sel.innerHTML = '<option value="">— Todos —</option>' + vens.map(v=>`<option value="${v}">${v}</option>`).join('');
  // Si soy vendedor, pre-seleccionar mi nombre y mostrar botón volver
  const btnVolver = document.getElementById('hr-btn-volver');
  if(usuarioActual?.rol==='vendedor'){
    sel.value=usuarioActual.nombre||'';sel.disabled=true;
    if(btnVolver){btnVolver.style.display='flex';btnVolver.style.alignItems='center';}
    hrTab('mia');
  } else {
    if(btnVolver) btnVolver.style.display='none';
    hrCargarRuta();
  }
}

async function hrCargarRuta(){
  const fecha = document.getElementById('hr-fecha').value;
  const vend = document.getElementById('hr-vendedor').value;
  if(!fecha) return;
  const q = sb.from('hoja_ruta').select('*').eq('fecha', fecha);
  if(vend) q.eq('vendedor', vend);
  const {data} = await q.order('orden');
  _hrRuta = (data||[]).map(r=>({...r, visitado: r.visitado||false}));
  hrRenderLista();
  const cerrada=_hrRuta.length>0&&_hrRuta.every(r=>r.cerrada);
  const numRend=_hrRuta.find(r=>r.numero_rendicion)?.numero_rendicion;
  const badge=document.getElementById('hr-estado-badge');
  if(badge)badge.innerHTML=cerrada?`<span class="b bP">🔒 Cerrada${numRend?' — Rendición #'+numRend:''}</span>`:_hrRuta.length?'<span class="b bW">🔓 Abierta</span>':'';
}

function hrRenderLista(){
  const el = document.getElementById('hr-lista-ruta');
  if(!_hrRuta.length){
    el.innerHTML='<div class="empty">Sin clientes en la ruta. Agregá clientes con el botón de arriba.</div>';
    return;
  }
  el.innerHTML = _hrRuta.map((r,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border-radius:10px;margin-bottom:6px;${r.visitado?'opacity:0.5':''}">
      <span style="font-size:18px;font-weight:700;color:var(--txt2);min-width:24px">${i+1}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${r.nombre}</div>
        <div style="font-size:11px;color:var(--txt2)">${r.direccion||''}${r.localidad?' · '+r.localidad:''}${r.zona?' · Z'+r.zona:''}</div>
        ${r.telefono?`<div style="font-size:11px;color:var(--P)">${r.telefono}</div>`:''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        ${i>0?`<button class="btn sm" onclick="hrMover(${i},-1)">↑</button>`:'<span style="width:28px"></span>'}
        ${i<_hrRuta.length-1?`<button class="btn sm" onclick="hrMover(${i},1)">↓</button>`:'<span style="width:28px"></span>'}
        <button class="btn D sm" onclick="hrEliminar(${i})">✕</button>
      </div>
    </div>`).join('');
}

function hrAgregarCliente(){
  const w = document.getElementById('hr-buscador-wrap');
  w.style.display = w.style.display==='none'?'':'none';
  if(w.style.display!=='none'){document.getElementById('hr-cli-q').value='';hrFiltrarClientes();setTimeout(()=>document.getElementById('hr-cli-q').focus(),100);}
}

function hrFiltrarClientes(){
  const q=(document.getElementById('hr-cli-q').value||'').toLowerCase();
  const drop = document.getElementById('hr-cli-drop');
  const idsEnRuta = new Set(_hrRuta.map(r=>r.cliente_id));
  const res = _clientes.filter(c=>!idsEnRuta.has(c.id)&&(!q||(c.nombre||'').toLowerCase().includes(q)||(c.zona||'').toLowerCase().includes(q)||(c.localidad||'').toLowerCase().includes(q))).slice(0,30);
  drop.style.display = 'block';
  drop.innerHTML = res.length ? res.map(c=>`
    <div style="padding:8px 12px;cursor:pointer;border-bottom:0.5px solid var(--brd)" onmousedown="hrSelCli(${c.id})">
      <div style="font-weight:600;font-size:13px">${c.nombre}</div>
      <div style="font-size:11px;color:var(--txt2)">${c.direccion||''}${c.localidad?' · '+c.localidad:''}${c.zona?' · Z'+c.zona:''} ${c.telefono?'· '+c.telefono:''}</div>
    </div>`).join('') : '<div style="padding:10px;color:var(--txt2);font-size:13px">Sin resultados</div>';
}

function hrSelCli(id){
  if(_hrRuta.length&&_hrRuta.every(r=>r.cerrada)){alert('Esta hoja de ruta ya está cerrada y no se pueden agregar más clientes.');return;}
  const c = _clientes.find(x=>x.id===id);if(!c)return;
  _hrRuta.push({cliente_id:c.id,nombre:c.nombre,direccion:c.direccion||'',localidad:c.localidad||'',zona:c.zona||'',telefono:c.telefono||'',vendedor:document.getElementById('hr-vendedor').value||'',orden:_hrRuta.length+1,visitado:false,fecha:document.getElementById('hr-fecha').value});
  document.getElementById('hr-cli-drop').style.display='none';
  document.getElementById('hr-buscador-wrap').style.display='none';
  hrRenderLista();
}

function hrMover(i, dir){
  if(i+dir<0||i+dir>=_hrRuta.length)return;
  [_hrRuta[i],_hrRuta[i+dir]]=[_hrRuta[i+dir],_hrRuta[i]];
  hrRenderLista();
}

function hrEliminar(i){_hrRuta.splice(i,1);hrRenderLista();}

async function hrGuardarRuta(){
  const fecha = document.getElementById('hr-fecha').value;
  const vend = document.getElementById('hr-vendedor').value;
  if(!fecha){alert('Seleccioná una fecha');return;}
  if(_hrRuta.length&&_hrRuta.every(r=>r.cerrada)){alert('Esta hoja de ruta ya está cerrada (tiene rendición generada) y no se puede modificar.');return;}
  // Borrar la ruta anterior de ese día y vendedor
  const dq = sb.from('hoja_ruta').delete().eq('fecha',fecha);
  if(vend) dq.eq('vendedor',vend);
  await dq;
  if(_hrRuta.length){
    const rows = _hrRuta.map((r,i)=>({...r,orden:i+1,fecha,vendedor:vend||r.vendedor}));
    const {error} = await sb.from('hoja_ruta').insert(rows);
    if(error){alert('Error al guardar: '+error.message);return;}
  }
  alert('Ruta guardada ✓');
  hrCargarRuta();
}

async function hrCerrarYGenerarRendicion(){
  const fecha = document.getElementById('hr-fecha').value;
  const vend = document.getElementById('hr-vendedor').value;
  if(!fecha){alert('Seleccioná una fecha');return;}
  if(!_hrRuta.length){alert('No hay clientes cargados en esta hoja de ruta');return;}
  if(_hrRuta.every(r=>r.cerrada)){alert('Esta hoja de ruta ya está cerrada.');return;}
  if(!confirm(`¿Cerrar la hoja de ruta de ${vend||'(todos)'} del ${fecha} y generar su rendición?\nLos cobros de estos clientes quedarán listos para aprobar en Rendición.`))return;
  const num=await _proximoNumeroRendicion();
  const dq=sb.from('hoja_ruta').update({cerrada:true,numero_rendicion:num}).eq('fecha',fecha);
  if(vend)dq.eq('vendedor',vend);
  const {error}=await dq;
  if(error){alert('Error al cerrar: '+error.message);return;}
  const clienteIds=_hrRuta.map(r=>r.cliente_id);
  for(const cid of clienteIds){
    await sb.from('cobros').update({numero_rendicion:num}).eq('cliente_id',cid).eq('fecha',fecha).is('numero_rendicion',null);
  }
  await cargarCobros();
  alert(`✅ Hoja de ruta cerrada — Rendición #${num} generada.`);
  hrCargarRuta();
}

let _hrMiaRutaActual = [];

async function hrVerMiRuta(){
  const fecha = document.getElementById('hr-fecha-mia').value;
  const vend = usuarioActual?.nombre||'';
  if(!fecha) return;
  const q = sb.from('hoja_ruta').select('*').eq('fecha',fecha);
  if(vend) q.eq('vendedor',vend);
  const {data} = await q.order('orden');
  const ruta = data||[];
  _hrMiaRutaActual = ruta;
  const cerrada = ruta.length>0 && ruta.every(r=>r.cerrada);
  const btnAgregar = document.getElementById('hr-mia-btn-agregar');
  if(btnAgregar) btnAgregar.style.display = cerrada?'none':'';
  if(cerrada){
    const buscador=document.getElementById('hr-mia-buscador');
    if(buscador) buscador.style.display='none';
  }
  const el = document.getElementById('hr-mia-lista');
  if(!ruta.length){el.innerHTML='<div class="empty">Sin clientes asignados para hoy</div>';return;}
  el.innerHTML = (cerrada?'<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">🔒 Ruta cerrada — ya se generó su rendición</div>':'') + ruta.map((r,i)=>`
    <div onclick="hrMarcarVisitado(${r.id},${!r.visitado})"
      style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:${r.visitado?'var(--PL)':'var(--bg)'};border-radius:14px;margin-bottom:8px;border:2px solid ${r.visitado?'var(--P)':'var(--brd)'};cursor:pointer;transition:background .15s">
      <div style="font-size:26px;font-weight:700;min-width:32px;text-align:center;color:${r.visitado?'var(--P)':'var(--txt2)'}">
        ${r.visitado?'✓':i+1}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:16px;${r.visitado?'text-decoration:line-through;color:var(--txt2)':''}">${r.nombre}</div>
        ${r.direccion||r.localidad?`<div style="font-size:12px;color:var(--txt2);margin-top:2px">${[r.direccion,r.localidad].filter(Boolean).join(' · ')}</div>`:''}
        ${r.telefono?`<a href="tel:${r.telefono.replace(/\D/g,'')}" onclick="event.stopPropagation()"
          style="display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:13px;color:var(--P);font-weight:600;text-decoration:none;padding:4px 10px;background:var(--PL);border-radius:8px">
          📞 ${r.telefono}</a>`:''}
      </div>
      <div style="font-size:11px;color:${r.visitado?'var(--P)':'var(--txt2)'};text-align:right;flex-shrink:0;font-weight:600">
        ${r.visitado?'Visitado':'Tocar para<br>marcar'}
      </div>
    </div>`).join('');
}

async function hrMarcarVisitado(id, visitado){
  await sb.from('hoja_ruta').update({visitado}).eq('id',id);
  hrVerMiRuta();
}

// ─── Agregar cliente sobre la marcha (vista móvil del repartidor/vendedor) ──
function hrMiRutaAgregarToggle(){
  const w=document.getElementById('hr-mia-buscador');if(!w)return;
  const abrir=w.style.display==='none';
  w.style.display=abrir?'block':'none';
  if(abrir){
    document.getElementById('hr-mia-cli-q').value='';
    hrMiRutaFiltrar();
    setTimeout(()=>document.getElementById('hr-mia-cli-q')?.focus(),100);
  }
}

function hrMiRutaFiltrar(){
  const q=(document.getElementById('hr-mia-cli-q')?.value||'').toLowerCase();
  const drop=document.getElementById('hr-mia-cli-drop');if(!drop)return;
  if(q.length<1){drop.style.display='none';return;}
  const idsEnRuta=new Set(_hrMiaRutaActual.map(r=>r.cliente_id));
  const res=_clientes.filter(c=>!idsEnRuta.has(c.id)&&(c.nombre||'').toLowerCase().includes(q)).slice(0,15);
  drop.innerHTML=res.length?res.map(c=>`
    <div onmousedown="hrMiRutaAgregarCliente(${c.id})" style="padding:12px 14px;cursor:pointer;border-bottom:0.5px solid var(--brd)">
      <div style="font-weight:600;font-size:14px">${c.nombre}</div>
      <div style="font-size:12px;color:var(--txt2)">${c.direccion||''}${c.localidad?' · '+c.localidad:''}</div>
    </div>`).join(''):'<div style="padding:12px;color:var(--txt2);font-size:13px">Sin resultados</div>';
  drop.style.display='block';
}

async function hrMiRutaAgregarCliente(clienteId){
  const c=_clientes.find(x=>x.id===clienteId);if(!c)return;
  const fecha=document.getElementById('hr-fecha-mia').value;
  const vend=usuarioActual?.nombre||'';
  if(_hrMiaRutaActual.length&&_hrMiaRutaActual.every(r=>r.cerrada)){
    alert('Esta hoja de ruta ya fue cerrada, no se pueden agregar más clientes.');
    return;
  }
  const ordenMax=_hrMiaRutaActual.reduce((m,r)=>Math.max(m,r.orden||0),0);
  const {error}=await sb.from('hoja_ruta').insert({
    cliente_id:c.id,nombre:c.nombre,direccion:c.direccion||'',localidad:c.localidad||'',
    zona:c.zona||'',telefono:c.telefono||'',vendedor:vend,orden:ordenMax+1,visitado:false,fecha
  });
  if(error){alert('Error al agregar cliente: '+error.message);return;}
  document.getElementById('hr-mia-cli-drop').style.display='none';
  document.getElementById('hr-mia-buscador').style.display='none';
  hrVerMiRuta();
}
