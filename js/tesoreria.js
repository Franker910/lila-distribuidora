// ─── TESORERÍA: cobros, cheques, caja, rendición, cobranza móvil ───

async function cargarCobros(){const {data,error}=await sb.from('cobros').select('id,cliente_id,cliente,fecha,forma,importe,referencia,total,efectivo,transferencia,cheque_propio,cheque_terceros,retencion_ganancias,retencion_ing_brutos,retencion_otras,estado_transferencia,estado_rendicion,reparto,carga_id,tipo_cobrador,vendedor,imputaciones,observaciones,comprobante_url,saldo_favor,banco_cheque,nro_cheque,nombre_transferencia,created_at').order('id',{ascending:false});if(error)console.error('[cobros]',error.message,error.details);_cobros=data||[];}

async function cobrarRemito(id){
  const r = _remitos.find(x=>x.id===id); if(!r) return;
  const c = _clientes.find(x=>x.id===r.cliente_id);
  const saldo = r.saldo_pendiente || r.total;
  
  // Modal rápido de cobro
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `<div style="background:var(--bg);border-radius:12px;padding:20px;width:360px;max-width:95vw">
    <div style="font-weight:600;font-size:15px;margin-bottom:4px">💵 Cobrar remito R-${String(r.id).padStart(4,'0')}</div>
    <div style="font-size:13px;color:var(--txt2);margin-bottom:14px">${esc(r.cliente)} · Saldo: ${fmt(saldo)}</div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Importe a cobrar</label>
      <input type="number" id="cob-rap-imp" value="${saldo}" style="width:100%;font-size:18px;font-weight:600;box-sizing:border-box">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Medio de pago</label>
      <select id="cob-rap-medio" style="width:100%">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="cheque">Cheque</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:8px 16px;background:var(--bg2);border:0.5px solid var(--brd);border-radius:6px;cursor:pointer">Cancelar</button>
      <button id="cob-rap-btn" style="padding:8px 16px;background:var(--G);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">✓ Confirmar cobro</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('cob-rap-btn').onclick = async function(){
    const imp = parseFloat(document.getElementById('cob-rap-imp').value)||0;
    const medio = document.getElementById('cob-rap-medio').value;
    if(imp <= 0){ alert('Ingresá un importe'); return; }

    this.textContent = 'Guardando...'; this.disabled = true;
    const reactivar=()=>{this.textContent='✓ Confirmar cobro';this.disabled=false;};

    const hoy = hoyLocal();
    const {error:cobErr}=await sb.from('cobros').insert({
      cliente_id: r.cliente_id, cliente: r.cliente||'',
      fecha: hoy, importe: imp, forma: medio,
      efectivo: medio==='efectivo'?imp:0,
      transferencia: medio==='transferencia'?imp:0,
      cheque_terceros: medio==='cheque'?imp:0,
      vendedor: r.vendedor||usuarioActual?.nombre||'',
      estado_rendicion:'pendiente',
      imputaciones:[{remito_id:id,monto:imp}]
    });
    if(cobErr){alert('Error al guardar cobro: '+cobErr.message);reactivar();return;}

    // ⚠️ Remito y saldo del cliente NO se modifican aquí.
    // Se aplican cuando un admin valida el cobro (validarCobro).
    modal.remove();
    await Promise.all([cargarCobros(),cargarRemitos()]);
    renderRemitos(); renderCC(); renderDash(); renderCobros();
    toast(`✓ Cobro de ${fmt(imp)} en ${medio} registrado — pendiente de validación`);
  };
}

function detalleHTML(d,isRem){
  const num=isRem?'R-'+String(d.id).padStart(4,'0'):'Pedido #'+d.id;
  // Buscar datos completos del cliente con comparación flexible de tipos
  const cli=_clientes.find(x=>String(x.id)===String(d.cliente_id))||
            _clientes.find(x=>String(x.codigo||'')===String(d.cliente_id))||{};
  const dir=d.lugar_entrega||d.direccion||cli.direccion||cli.domicilio||'';
  const tel=d.telefono||cli.telefono||'';
  let sub=0,dtoT=0,tot=0;
  const rows=(d.items||[]).map(it=>{
    const base=it.precio*it.cant,dtoA=base*(it.dto/100),neto=base-dtoA;
    sub+=base;dtoT+=dtoA;tot+=neto;
    return `<tr><td>${esc(it.nom)}</td><td style="text-align:center">${fmtN(it.cant,2)} ${it.un||''}</td><td style="text-align:right">${fmt(it.precio)}</td><td style="text-align:center">${it.dto||0}%</td><td style="text-align:right;font-weight:600">${fmt(neto)}</td></tr>`;
  }).join('');
  return `<div style="font-size:13px">
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:700;color:#1a7a52">${num}</div>
        <div style="color:#555">Fecha: ${d.fecha||''}</div>
        ${d.vendedor?`<div style="color:#555">Vendedor: ${esc(d.vendedor)}</div>`:''}
        ${isRem&&d.carga_id?`<div style="color:#555">Carga: #${d.carga_id}${_cargas.find(c=>c.id===d.carga_id)?.nombre?' · '+esc(_cargas.find(c=>c.id===d.carga_id).nombre):''}</div>`:''}
      </div>
      <div style="text-align:right;border-left:3px solid #1a7a52;padding-left:12px">
        <div style="font-weight:700;font-size:14px">${esc(d.cliente)}</div>
        ${dir?`<div style="color:#555">${esc(dir)}</div>`:''}
        <div style="color:#555">${esc(d.localidad||'')} · Zona ${_zonas.find(z=>z.codigo===d.zona)?.descripcion||d.zona||'-'}</div>
        ${tel?`<div style="color:#555">Tel: ${esc(tel)}</div>`:''}
        ${d.lugar_entrega?`<div style="color:#c07000;font-weight:600">📍 Entrega: ${esc(d.lugar_entrega)}</div>`:''}
      </div>
    </div>
    <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f5f5f5"><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ccc">Producto</th><th style="padding:6px 8px;border-bottom:1px solid #ccc">Cant.</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #ccc">P.Unit</th><th style="padding:6px 8px;border-bottom:1px solid #ccc">Dto</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #ccc">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="margin-top:8px;font-size:12px;color:#777">${dtoT>0?'Descuento: '+fmt(dtoT):''}</div>
    <div style="margin-top:6px;text-align:right;font-size:16px">Total: <strong style="color:#1a7a52">${fmt(tot)}</strong></div>
    ${(d.observaciones||d.obs)?`<div style="margin-top:8px;color:#555;font-size:12px">Obs: ${esc(d.observaciones||d.obs)}</div>`:''}
  </div>`;
}

// ─── COBROS ───
function toggleTrDetalle(){
  const v=parseFloat(document.getElementById('cob-transferencia')?.value)||0;
  const el=document.getElementById('cob-tr-detalle');if(el)el.style.display=v>0?'block':'none';
}
function toggleChDetalle(){
  const v=parseFloat(document.getElementById('cob-cheque3')?.value)||0;
  const el=document.getElementById('cob-ch-detalle');if(el)el.style.display=v>0?'block':'none';
}

function focusImprimerInput(){
  const inputs=document.querySelectorAll('[id^="imp-rem-"]');
  if(inputs.length){
    // Pone foco en el primer campo de imputación que esté en 0
    const zero=[...inputs].find(i=>!parseFloat(i.value));
    const target=zero||inputs[0];
    target.focus();target.select();
  } else {
    document.getElementById('cob-obs2')?.focus();
  }
}

function onTotalImputarChange(){
  // Sincroniza el campo total-imputar con efectivo si no hay forma seleccionada
  calcTotalDesdeImputacion();
}

function calcTotalCobro(){
  const ef=parseFloat(document.getElementById('cob-efectivo')?.value)||0;
  const tr=parseFloat(document.getElementById('cob-transferencia')?.value)||0;
  const ch3=parseFloat(document.getElementById('cob-cheque3')?.value)||0;
  const tot=ef+tr+ch3;
  const el=document.getElementById('cob-total-display');if(el)el.textContent=fmt(tot);
  calcTotalDesdeImputacion();
}

function toggleListaCobros(){
  const s=document.getElementById('cob-historial-section');
  if(!s)return;
  const visible=s.style.display!=='none';
  s.style.display=visible?'none':'block';
  if(!visible)renderCobros();
}

function toggleValores(){
  const body=document.getElementById('cob-valores-body');
  const chev=document.getElementById('cob-valores-chevron');
  if(!body)return;
  const visible=body.style.display!=='none';
  body.style.display=visible?'none':'block';
  if(chev)chev.textContent=visible?'▶':'▼';
}

function toggleChequeRet(){
  const el=document.getElementById('cob-cheque-ret-body');
  if(el)el.style.display=el.style.display==='none'?'block':'none';
}

function abrirCobro(){
  limpiarModalCobro();
  go('cobranza');
}

function limpiarModalCobro(){
  ['cob-cli-q','cob-ven-nom','cob-reparto','cob-banco','cob-nrocheque','cob-obs2','cob-cli-cod'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cidEl=document.getElementById('cob-cli-id');if(cidEl)cidEl.value='';
  ['cob-efectivo','cob-transferencia','cob-cheque3','cob-ret-gan','cob-ret-ib','cob-ret-otras'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});
  const fch=document.getElementById('cob-fecha-cheque');if(fch)fch.value='';
  const td=document.getElementById('cob-total-display');if(td)td.textContent='$0';
  const ti=document.getElementById('cob-total-imputar');if(ti)ti.value='0';
  const fecEl=document.getElementById('cob-fecha');if(fecEl)fecEl.value=hoyLocal();
  const rp=document.getElementById('cob-remitos-pendientes');if(rp)rp.innerHTML='';
  const rEmpty=document.getElementById('cob-remitos-empty');
  if(rEmpty){rEmpty.textContent='Seleccioná un cliente para ver sus facturas';rEmpty.style.display='block';}
  const rWrap=document.getElementById('cob-remitos-tablewrap');if(rWrap)rWrap.style.display='none';
  const rs2=document.getElementById('cob-resto-section');if(rs2)rs2.style.display='none';
  const av=document.getElementById('cob-saldo-favor-aviso');if(av)av.style.display='none';
  const ci=document.getElementById('cob-cli-info');if(ci)ci.style.display='none';
  const elImp=document.getElementById('cob-imputado-monto');if(elImp)elImp.textContent='$0';
  const elRec=document.getElementById('cob-recibido-monto');if(elRec)elRec.textContent='$0';
  const elRes=document.getElementById('cob-resto-display');if(elRes){elRes.textContent='$0';elRes.style.color='var(--W)';}
  const trDet=document.getElementById('cob-tr-detalle');if(trDet)trDet.style.display='none';
  const chDet=document.getElementById('cob-ch-detalle');if(chDet)chDet.style.display='none';
  const codEl=document.getElementById('cob-cli-cod');if(codEl)codEl.style.borderColor='';
  _cobRestoSaldoFavor=0;
  clearComprobante();
  setTimeout(()=>{const f=document.getElementById('cob-cli-cod');if(f)f.focus();},100);
}

// Sube un comprobante de transferencia al bucket "comprobantes" de Supabase Storage.
// Retorna la URL pública o '' si falla. Muestra toast con mensaje claro si el bucket no existe.
async function _subirComprobante(file, suffix){
  if(!file) return '';
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`cobros/${Date.now()}_${suffix}.${ext}`;
  const {error:upErr}=await sb.storage.from('comprobantes').upload(path, file, {upsert:true});
  if(upErr){
    const esBucketFaltante=(upErr.message||'').toLowerCase().includes('bucket')||
                            (upErr.message||'').toLowerCase().includes('not found')||
                            upErr.statusCode==='404'||upErr.error==='not_found';
    if(esBucketFaltante){
      toast('Bucket "comprobantes" no configurado. Crealo en Supabase Storage → New bucket → nombre: comprobantes → Public','warn',8000);
    } else {
      toast('No se pudo subir el comprobante: '+(upErr.message||upErr),'err',5000);
    }
    return '';
  }
  const {data:urlData}=sb.storage.from('comprobantes').getPublicUrl(path);
  return urlData?.publicUrl||'';
}

function prevComprobante(input){
  const file=input.files[0];if(!file)return;
  document.getElementById('cob-comp-nombre').textContent=file.name;
  document.getElementById('cob-comp-clear').style.display='';
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('cob-comp-img').src=e.target.result;
    document.getElementById('cob-comp-preview').style.display='block';
  };
  reader.readAsDataURL(file);
}

function clearComprobante(){
  const inp=document.getElementById('cob-comprobante');if(inp)inp.value='';
  document.getElementById('cob-comp-nombre').textContent='Sin comprobante';
  document.getElementById('cob-comp-clear').style.display='none';
  document.getElementById('cob-comp-preview').style.display='none';
  const img=document.getElementById('cob-comp-img');if(img)img.src='';
}

function dropCliCob(){
  const q=(document.getElementById('cob-cli-q').value||'').toLowerCase();
  const drop=document.getElementById('cob-cli-drop');
  if(q.length<1){drop.style.display='none';return;}
  const m=_clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.map(c=>`<div onmousedown="selCliCob(${c.id})"><strong>${esc(c.nombre)}</strong> <span style="color:var(--txt2);font-size:11px">Saldo: ${fmt(c.saldo)}</span></div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function selCliCob(id){
  const c=_clientes.find(x=>x.id===id);if(!c)return;
  document.getElementById('cob-cli-id').value=id;
  document.getElementById('cob-cli-q').value=c.nombre;
  const drop=document.getElementById('cob-cli-drop');if(drop)drop.style.display='none';
  const codEl=document.getElementById('cob-cli-cod');if(codEl){codEl.value=c.codigo||c.id||'';codEl.style.borderColor='var(--P)';}
  // Info cliente
  const ci=document.getElementById('cob-cli-info');
  const ciTxt=document.getElementById('cob-cli-info-txt');
  if(ci){
    const dias=diasDesde(c.ultimo_remito);
    if(ciTxt)ciTxt.innerHTML=`<b>${esc(c.nombre)}</b> · ${esc(c.localidad||'')} · ${esc(c.direccion?'📍 '+esc(c.direccion)+' · ':'')} ${esc(c.telefono||'—')} · Saldo: <b style="${(c.saldo||0)>0?'color:var(--D)':''}">${fmt(c.saldo)}</b>${dias!==null?` · Último rem: ${dias}d`:''}`;
    ci.style.display='flex';
  }
  // Mostrar remitos pendientes
  const remsPend=_remitos.filter(r=>String(r.cliente_id)===String(id)&&!r.cobrado).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const rEmpty=document.getElementById('cob-remitos-empty');
  const rWrap=document.getElementById('cob-remitos-tablewrap');
  const lista=document.getElementById('cob-remitos-pendientes');
  if(remsPend.length){
    if(rEmpty)rEmpty.style.display='none';
    if(rWrap)rWrap.style.display='block';
    if(lista)lista.innerHTML=remsPend.map(r=>`
       <tr>
         <td style="border:1px solid #000;padding:5px 7px"><button onclick="verRemitoEnCobro(${r.id})" title="Ver detalle" style="background:none;border:none;font-size:12px;font-weight:700;color:var(--P);cursor:pointer;padding:0;white-space:nowrap;text-decoration:underline">R-${String(r.id).padStart(4,'0')}</button></td>
         <td style="border:1px solid #000;padding:5px 7px;font-size:11px;color:var(--txt2)">${r.fecha}</td>
         <td style="border:1px solid #000;padding:5px 7px;text-align:right;font-weight:700;color:var(--D)">${fmt(r.saldo_pendiente||r.total)}</td>
         <td style="border:1px solid #000;padding:3px 5px">
           <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end">
             <input type="number" id="imp-rem-${r.id}" value="0" min="0" max="${r.saldo_pendiente||r.total}" step="0.01"
               style="width:90px;padding:5px 6px;border:1.5px solid var(--brd);border-radius:5px;text-align:right;font-size:13px;font-weight:700"
               placeholder="0" onfocus="this.select()" oninput="limitarImputacion(this,${r.saldo_pendiente||r.total});calcTotalDesdeImputacion()"
               ondblclick="imputarTotal(${r.id},${r.saldo_pendiente||r.total});this.select();"
               title="F = todo · → o Tab = botón Todo · Inicio = ver factura"
               onkeydown="cobImpKeydown(event,${r.id},${r.saldo_pendiente||r.total})">
             <button id="todo-rem-${r.id}" class="btn P" onclick="imputarTotal(${r.id},${r.saldo_pendiente||r.total})"
               style="padding:5px 8px;font-size:11px;white-space:nowrap"
               onkeydown="cobTodoKeydown(event,${r.id})">✓</button>
           </div>
         </td>
       </tr>`).join('');
  } else {
    if(rEmpty){rEmpty.textContent='Sin facturas pendientes';rEmpty.style.display='block';}
    if(rWrap)rWrap.style.display='none';
    if(lista)lista.innerHTML='';
  }
  // Sugerir saldo en efectivo y sincronizar total a imputar
  const ef=document.getElementById('cob-efectivo');
  if(ef&&(c.saldo||0)>0){
    ef.value=Math.round(c.saldo);
    calcTotalCobro();
    const ti=document.getElementById('cob-total-imputar');
    if(ti){ti.value=Math.round(c.saldo);calcTotalDesdeImputacion();}
  }
  // foco manejado por buscarCodCli o dropdown
}

function cobImpKeydown(e,remId,max){
  if(e.key==='Home'){e.preventDefault();verRemitoEnCobro(remId);return;}
  if(e.key==='F'){e.preventDefault();imputarTotal(remId,max);return;}
  if(e.key==='ArrowRight'||e.key==='Tab'){e.preventDefault();document.getElementById('todo-rem-'+remId)?.focus();return;}
  if(e.key==='Enter'){
    e.preventDefault();
    const inputs=[...document.querySelectorAll('[id^=imp-rem-]')];
    const inp=document.getElementById('imp-rem-'+remId);
    const idx=inputs.indexOf(inp);
    if(idx<inputs.length-1){inputs[idx+1].focus();inputs[idx+1].select();}else{document.getElementById('cob-obs2')?.focus();}
  }
}

function cobTodoKeydown(e,remId){
  if(e.key==='Enter'){imputarTotal(remId,parseFloat(document.getElementById('imp-rem-'+remId)?.max)||0);return;}
  if(e.key==='ArrowLeft'){document.getElementById('imp-rem-'+remId)?.focus();return;}
  if(e.key==='Tab'||e.key==='ArrowDown'||e.key==='ArrowRight'){
    e.preventDefault();
    const inputs=[...document.querySelectorAll('[id^=imp-rem-]')];
    const inp=document.getElementById('imp-rem-'+remId);
    const idx=inputs.indexOf(inp);
    if(idx<inputs.length-1){inputs[idx+1].focus();inputs[idx+1].select();}else{document.getElementById('cob-obs2')?.focus();}
  }
}

function verRemitoEnCobro(id){
  const r=_remitos.find(x=>x.id===id);if(!r)return;
  const num='R-'+String(r.id).padStart(4,'0');
  const rows=(r.items||[]).map(it=>{
    const q=it.esPeso?(it.peso||it.cant||0):it.cant;
    const sub=it.precio*q*(1-(it.dto||0)/100);
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid var(--brd)">${esc(it.nom)}</td><td style="padding:6px 10px;border-bottom:1px solid var(--brd);text-align:center">${q}</td><td style="padding:6px 10px;border-bottom:1px solid var(--brd);text-align:center;color:var(--txt2)">${it.un||''}</td><td style="padding:6px 10px;border-bottom:1px solid var(--brd);text-align:right">${fmt(sub)}</td></tr>`;
  }).join('');
  const ov=document.createElement('div');
  ov.id='cob-rem-popup';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9990;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--bg);border-radius:12px;padding:20px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.25)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:16px;font-weight:700;color:var(--P)">${num}</span>
      <button onclick="document.getElementById('cob-rem-popup').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt2);line-height:1">✕</button>
    </div>
    <div style="font-size:12px;color:var(--txt2);margin-bottom:12px">${esc(r.cliente)} · ${r.fecha}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:var(--bg2)">
        <th style="padding:6px 10px;text-align:left;font-weight:600">Producto</th>
        <th style="padding:6px 10px;text-align:center;font-weight:600">Cant.</th>
        <th style="padding:6px 10px;text-align:center;font-weight:600">Un.</th>
        <th style="padding:6px 10px;text-align:right;font-weight:600">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:right;font-size:16px;font-weight:700;color:var(--PD);margin-top:12px;border-top:2px solid var(--brd);padding-top:10px">Total: ${fmt(r.total)}</div>
    <div style="text-align:center;margin-top:14px">
      <button id="cob-rem-popup-cerrar" onclick="document.getElementById('cob-rem-popup').remove()" class="btn" style="padding:8px 28px">Cerrar</button>
    </div>
  </div>`;
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();ov.remove();}});
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('cob-rem-popup-cerrar')?.focus(),30);
}

function verCobroDetalle(id){
  const r=_cobros.find(x=>x.id===id);if(!r)return;
  const imp=r.imputaciones||[];
  const impRows=imp.length?imp.map(i=>`<tr><td style="padding:5px 8px;border-bottom:1px solid var(--brd)">R-${String(i.remito_id).padStart(4,'0')}</td><td style="padding:5px 8px;border-bottom:1px solid var(--brd);text-align:right">${fmt(i.monto)}</td></tr>`).join(''):'';
  const estBadge=r.estado_rendicion==='validado'?'✅ Validado':r.estado_rendicion==='rechazado'?'❌ Rechazado':'⏳ Pendiente';
  const body=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin-bottom:10px">
      <span>Forma: <b>${r.forma||'—'}</b></span>
      <span>Estado: <b>${estBadge}</b></span>
      ${r.reparto?`<span>Reparto: <b>${esc(r.reparto)}</b></span>`:''}
      ${r.vendedor?`<span>Cobrador: <b>${esc(r.vendedor)}</b></span>`:''}
    </div>
    ${impRows?`<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px">
      <thead><tr style="background:var(--bg2)"><th style="padding:5px 8px;text-align:left">Imputado a</th><th style="padding:5px 8px;text-align:right">Monto</th></tr></thead>
      <tbody>${impRows}</tbody>
    </table>`:''}
    ${r.observaciones?`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">Obs: ${esc(r.observaciones)}</div>`:''}
    ${r.comprobante_url?`<div style="margin-bottom:8px"><a href="${r.comprobante_url}" target="_blank">📎 Ver comprobante adjunto</a></div>`:''}
    <div style="text-align:right;font-size:16px;font-weight:700;color:var(--PD);border-top:2px solid var(--brd);padding-top:10px">Total: ${fmt(r.importe)}</div>
    <button class="btn P" style="width:100%;margin-top:12px" onclick="imprimirRecibo(${r.id})">🧾 Ver / imprimir recibo</button>
  `;
  popupDetalle('RC-'+String(r.id).padStart(4,'0'),`${esc(r.cliente||'')} · ${r.fecha}`,body);
}

function limitarImputacion(input, maxRemito){
  const val = parseFloat(input.value)||0;
  // Calcular cuánto ya está imputado en otros remitos
  const inputs = document.querySelectorAll('[id^="imp-rem-"]');
  let otrosImputados = 0;
  inputs.forEach(inp => { if(inp !== input) otrosImputados += parseFloat(inp.value)||0; });
  // Total que cobra
  const totalCobra = parseFloat(document.getElementById('cob-total-imputar')?.value)||0;
  const disponible = Math.max(0, totalCobra - otrosImputados);
  // Limitar al mínimo entre el saldo del remito y lo disponible
  const maximo = Math.min(maxRemito, disponible);
  if(val > maximo){
    input.value = maximo.toFixed(2);
    input.style.borderColor = 'var(--W)';
    setTimeout(()=>input.style.borderColor='', 1500);
  } else {
    input.style.borderColor = '';
  }
}

function imputarTotal(remId, total){
  const input = document.getElementById(`imp-rem-${remId}`);
  if(!input) return;
  
  // El total que cobra está en cob-total-imputar
  const totalCobra = parseFloat(document.getElementById('cob-total-imputar')?.value)||0;
  
  // Calcular cuánto ya está imputado en los otros remitos
  const inputs = document.querySelectorAll('[id^="imp-rem-"]');
  let yaImputado = 0;
  inputs.forEach(inp => { if(inp !== input) yaImputado += parseFloat(inp.value)||0; });
  
  const disponible = Math.max(0, totalCobra - yaImputado);
  input.value = Math.min(total, disponible) || 0;
  calcTotalDesdeImputacion();
}

function calcTotalDesdeImputacion(){
  const inputs=document.querySelectorAll('[id^="imp-rem-"]');
  let totalImputado=0;
  inputs.forEach(inp=>totalImputado+=parseFloat(inp.value)||0);
  const ef=parseFloat(document.getElementById('cob-efectivo')?.value)||0;
  const tr=parseFloat(document.getElementById('cob-transferencia')?.value)||0;
  const ch3=parseFloat(document.getElementById('cob-cheque3')?.value)||0;
  const rg=parseFloat(document.getElementById('cob-ret-gan')?.value)||0;
  const rib=parseFloat(document.getElementById('cob-ret-ib')?.value)||0;
  const ro=parseFloat(document.getElementById('cob-ret-otras')?.value)||0;
  const totalCobrado=ef+tr+ch3+rg+rib+ro;
  const resto=Math.round((totalCobrado-totalImputado)*100)/100;

  // Actualizar pie: Imputado / Recibido / Resto
  const elImp=document.getElementById('cob-imputado-monto');
  const elRec=document.getElementById('cob-recibido-monto');
  const elRes=document.getElementById('cob-resto-display');
  const elResM=document.getElementById('cob-resto-monto');
  if(elImp)elImp.textContent=fmt(totalImputado);
  if(elRec)elRec.textContent=fmt(totalCobrado);
  if(elResM){elResM.textContent=fmt(Math.abs(resto));elResM.dataset.val=Math.abs(resto);}
  if(elRes){
    if(resto===0){elRes.textContent='$0';elRes.style.color='var(--P)';}
    else if(resto>0){elRes.textContent=fmt(resto);elRes.style.color='var(--W)';}
    else{elRes.textContent='-'+fmt(Math.abs(resto));elRes.style.color='var(--D)';}
  }

  // Mostrar botón saldo a favor si hay resto positivo
  const rsSection=document.getElementById('cob-resto-section');
  if(rsSection)rsSection.style.display=(resto>0&&totalCobrado>0)?'block':'none';

  // Label bajo total (compatibilidad)
  const lbl=document.getElementById('cob-imputado-label');
  if(lbl){
    if(totalCobrado>0&&totalImputado>0){
      const color=resto<0?'color:var(--D)':resto===0?'color:var(--P)':'color:var(--W)';
      lbl.innerHTML=`Imputado: <b>${fmt(totalImputado)}</b> &nbsp;|&nbsp;<span style="${color}"><b>Resto: ${fmt(resto)}</b></span>${resto<0?' ⚠️':resto===0?' ✅':''}`;
    } else { lbl.textContent=''; }
  }
}

let _cobRestoSaldoFavor=0;

function dejarComoSaldoFavor(){
  const restoMonto=document.getElementById('cob-resto-monto');
  const monto=parseFloat(restoMonto?.dataset?.val)||0;
  if(monto<=0)return;
  _cobRestoSaldoFavor=monto;
  const aviso=document.getElementById('cob-saldo-favor-aviso');
  if(aviso){
    aviso.style.display='block';
    aviso.textContent=`✅ ${fmt(monto)} quedará como saldo a favor del cliente`;
  }
  // Ocultar el botón para que no lo presionen dos veces
  const btn=document.querySelector('#cob-resto-section button');
  if(btn)btn.style.display='none';
}

async function guardarCobro(){
  const btn=document.getElementById('cob-btn-guardar');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  const reactivar=()=>{if(btn){btn.disabled=false;btn.textContent='✓ Guardar cobro';}};

  const cid=document.getElementById('cob-cli-id').value;
  if(!cid){alert('Seleccioná un cliente');reactivar();return;}
  const ef=parseFloat(document.getElementById('cob-efectivo')?.value)||0;
  const tr=parseFloat(document.getElementById('cob-transferencia')?.value)||0;
  const ch3=parseFloat(document.getElementById('cob-cheque3')?.value)||0;
  const rg=parseFloat(document.getElementById('cob-ret-gan')?.value)||0;
  const rib=parseFloat(document.getElementById('cob-ret-ib')?.value)||0;
  const ro=parseFloat(document.getElementById('cob-ret-otras')?.value)||0;
  const imp=ef+tr+ch3+rg+rib+ro;
  if(imp<=0){alert('Ingresá al menos un importe');reactivar();return;}

  const inputs=document.querySelectorAll('[id^="imp-rem-"]');
  let totalImputado=0;
  inputs.forEach(inp=>totalImputado+=parseFloat(inp.value)||0);
  const resto=Math.round((imp-totalImputado)*100)/100;
  if(resto>0&&_cobRestoSaldoFavor===0&&inputs.length>0){
    const ok=confirm(`Hay ${fmt(resto)} sin imputar.\n¿Lo dejamos como saldo a favor del cliente?`);
    if(!ok){reactivar();return;}
    _cobRestoSaldoFavor=resto;
  }

  const c=_clientes.find(x=>x.id==cid);
  const formas=[];
  if(ef>0)formas.push('efectivo');
  if(tr>0)formas.push('transf');
  if(ch3>0)formas.push('cheque');
  if(rg>0||rib>0||ro>0)formas.push('ret');

  const imputaciones=[];
  for(const inp of inputs){
    const remId=parseInt(inp.id.replace('imp-rem-',''));
    const monto=parseFloat(inp.value)||0;
    if(monto>0)imputaciones.push({remito_id:remId,monto});
  }

  let comprobante_url='';
  if(tr>0){
    const compFile=document.getElementById('cob-comprobante')?.files?.[0];
    if(compFile) comprobante_url=await _subirComprobante(compFile, cid);
  }

  // "Imputar al guardar": solo existe (y solo pesa) para admin — el checkbox
  // ni siquiera se muestra para vendedor/repartidor, esos siempre van a Rendición.
  const wrapImp=document.getElementById('cob-imputar-wrap');
  const imputarYa=wrapImp&&wrapImp.style.display!=='none'&&!!document.getElementById('cob-imputar-ya')?.checked;

  const {data:nuevoCobro,error:cobErr}=await sb.from('cobros').insert({
    cliente_id:parseInt(cid),cliente:c?.nombre||'?',
    fecha:document.getElementById('cob-fecha').value,
    forma:formas.join('+')||'efectivo',importe:imp,
    efectivo:ef,transferencia:tr,cheque_terceros:ch3,
    retencion_ganancias:rg,retencion_ing_brutos:rib,retencion_otras:ro,
    estado_rendicion:imputarYa?'validado':'pendiente',
    banco_cheque:document.getElementById('cob-banco')?.value||'',
    nro_cheque:document.getElementById('cob-nrocheque')?.value||'',
    reparto:document.getElementById('cob-reparto')?.value||'',
    tipo_cobrador:document.getElementById('cob-tipo-cobrador')?.value||'',
    vendedor:document.getElementById('cob-ven-nom')?.value||'',
    observaciones:document.getElementById('cob-obs2')?.value||'',
    imputaciones,saldo_favor:_cobRestoSaldoFavor||0,comprobante_url
  }).select().single();
  if(cobErr){toast('Error al guardar cobro: '+cobErr.message,'err',6000);reactivar();return;}

  if(imputarYa){
    // El admin ya tiene la plata en mano: no hay rendición física que esperar,
    // se aplica el mismo efecto que validarCobro() de una.
    for(const impu of imputaciones){
      const rem=_remitos.find(r=>r.id===impu.remito_id);
      if(rem){
        const nuevoSaldoRem=Math.max(0,(rem.saldo_pendiente!=null?rem.saldo_pendiente:rem.total)-impu.monto);
        await sb.from('remitos').update({saldo_pendiente:nuevoSaldoRem,cobrado:nuevoSaldoRem<=0,forma_cobro:nuevoSaldoRem<=0?(formas.join('+')||'efectivo'):rem.forma_cobro}).eq('id',rem.id);
      }
    }
    if(c){
      const nuevoSaldoCli=Math.max(0,(c.saldo||0)-imp);
      await sb.from('clientes').update({saldo:nuevoSaldoCli}).eq('id',c.id);
    }
  } else {
    // ⚠️ El saldo del cliente y remitos NO se toca aquí.
    // Se aplica recién cuando un admin valida el cobro (validarCobro).
  }
  await Promise.all([cargarCobros(),cargarClientes(),cargarRemitos()]);
  renderCobros();renderCC();renderDash();renderRemitos();actualizarDeuda();

  const nombreCli=c?.nombre||'cliente';
  const restoMsg=_cobRestoSaldoFavor>0?` · Saldo a favor: ${fmt(_cobRestoSaldoFavor)}`:'';
  _cobRestoSaldoFavor=0;
  toast(`✅ Cobro de ${fmt(imp)} registrado para ${nombreCli}${imputarYa?' — imputado.':' — pendiente de validación.'}${restoMsg}`);
  reactivar();
  limpiarModalCobro();
  return nuevoCobro?.id;
}

function renderCobros(){
  const tbody=document.getElementById('cob-tbody');
  if(!tbody)return;
  const q=(document.getElementById('cob-q')?.value||'').toLowerCase();
  const f=document.getElementById('cob-f')?.value||'';
  let data=_cobros.filter(c=>(!q||(c.cliente||'').toLowerCase().includes(q)||(c.fecha||'').includes(q)||(c.reparto||'').toLowerCase().includes(q)||(c.vendedor||'').toLowerCase().includes(q))&&(!f||(c.forma||'').includes(f)));
  const tot=data.length,sl=data.slice((_cobPg-1)*PP,_cobPg*PP);
  tbody.innerHTML=sl.length?sl.map(r=>{
    const formas=[];
    if(r.efectivo>0)formas.push(`Ef:${fmt(r.efectivo)}`);
    if(r.transferencia>0)formas.push(`Transf:${fmt(r.transferencia)}`);
    if((r.cheque_propio||0)+(r.cheque_terceros||0)>0)formas.push(`Cheq:${fmt((r.cheque_propio||0)+(r.cheque_terceros||0))}`);
    if((r.retencion_ganancias||0)+(r.retencion_ing_brutos||0)+(r.retencion_otras||0)>0)formas.push(`Ret:${fmt((r.retencion_ganancias||0)+(r.retencion_ing_brutos||0)+(r.retencion_otras||0))}`);
    const tieneTransf=(r.transferencia||0)>0;
    const estTransf=r.estado_transferencia||'pendiente';
    const transfBadge=!tieneTransf?'—':estTransf==='validado'?'<span class="b bP">✅ Val.</span>':estTransf==='rechazado'?'<span class="b bD">❌ Rech.</span>':'<span class="b bW">⏳ Pend.</span>';
    const transfAcciones=tieneTransf&&estTransf==='pendiente'?`<button class="btn sm" style="background:var(--G);color:#fff;font-size:10px" onclick="validarTransf(${r.id})">✅</button><button class="btn sm D" style="font-size:10px" onclick="rechazarTransf(${r.id})">❌</button>`:'';
    const compLink=r.comprobante_url?`<a href="${r.comprobante_url}" target="_blank" title="Ver comprobante" style="font-size:16px">📎</a>`:'';
    const esAdmin=usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin';
    const estRend=r.estado_rendicion||'pendiente';
    const rendBadge=estRend==='validado'?'<span class="b bP">✅ Validado</span>':estRend==='rechazado'?'<span class="b bD">❌ Rechazado</span>':'<span class="b bW">⏳ Pendiente</span>';
    const rendAcciones=esAdmin&&estRend==='pendiente'?`<button class="btn sm" style="background:var(--G);color:#fff;font-size:10px" onclick="validarCobro(${r.id})" title="Validar cobro — aplica saldo">✅</button><button class="btn sm D" style="font-size:10px" onclick="rechazarCobro(${r.id})" title="Rechazar cobro — sin cambio de saldo">❌</button>`:'';
    return `<tr>
      <td>${r.fecha}</td>
      <td style="font-weight:500">${esc(r.cliente)}</td>
      <td style="font-size:11px;color:var(--txt2)">${formas.join(' · ')||r.forma||'—'}${compLink}</td>
      <td style="font-size:11px;color:var(--txt2)">${esc(r.reparto||'—')}</td>
      <td style="font-weight:600;color:var(--P)">${fmt(r.importe)}</td>
      <td>${esc(r.vendedor||'—')}</td>
      <td>${transfBadge} ${transfAcciones}</td>
      <td>${rendBadge} ${rendAcciones}</td>
      <td><button class="btn sm" onclick="imprimirRecibo(${r.id})">🖨️</button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="9"><div class="empty">Sin cobros</div></td></tr>';
  pag('cob-pg',tot,_cobPg,p=>{_cobPg=p;renderCobros();});
}

async function validarTransf(id){
  const {error}=await sb.from('cobros').update({estado_transferencia:'validado'}).eq('id',id);
  if(error){toast('Error al validar','err');return;}
  const c=_cobros.find(x=>x.id===id);if(c)c.estado_transferencia='validado';
  renderCobros();toast('✅ Transferencia validada');
}

async function rechazarTransf(id){
  if(!confirm('¿Rechazar esta transferencia? El cobro quedará marcado como rechazado.'))return;
  const {error}=await sb.from('cobros').update({estado_transferencia:'rechazado'}).eq('id',id);
  if(error){toast('Error al rechazar','err');return;}
  const c=_cobros.find(x=>x.id===id);if(c)c.estado_transferencia='rechazado';
  renderCobros();toast('❌ Transferencia rechazada');
}

async function validarCobro(id){
  if(!confirm('¿Validar este cobro? Se descontará el saldo del cliente y sus remitos.'))return;
  const cob=_cobros.find(x=>x.id===id);if(!cob)return;
  const {error}=await sb.from('cobros').update({estado_rendicion:'validado'}).eq('id',id);
  if(error){toast('Error al validar cobro: '+error.message,'err');return;}
  // Aplicar saldo a remitos imputados
  const imps=Array.isArray(cob.imputaciones)?cob.imputaciones:[];
  for(const imp of imps){
    const rem=_remitos.find(r=>r.id===imp.remito_id);
    if(rem){
      const nuevoSaldo=Math.max(0,(rem.saldo_pendiente!=null?rem.saldo_pendiente:rem.total)-imp.monto);
      await sb.from('remitos').update({saldo_pendiente:nuevoSaldo,cobrado:nuevoSaldo<=0,forma_cobro:nuevoSaldo<=0?(cob.forma||'efectivo'):rem.forma_cobro}).eq('id',rem.id);
    }
  }
  // Aplicar saldo al cliente
  const cli=_clientes.find(x=>x.id===cob.cliente_id||(cob.cliente&&x.nombre&&x.nombre.trim().toLowerCase()===cob.cliente.trim().toLowerCase()));
  if(cli){
    const nuevoSaldo=Math.max(0,(cli.saldo||0)-cob.importe);
    await sb.from('clientes').update({saldo:nuevoSaldo}).eq('id',cli.id);
  }
  await Promise.all([cargarCobros(),cargarClientes(),cargarRemitos()]);
  renderRendicion();renderCobros();renderCC();renderDash();renderRemitos();
  toast('✅ Cobro validado — saldo aplicado');
}

async function rechazarCobro(id){
  if(!confirm('¿Rechazar este cobro?'))return;
  const cob=_cobros.find(x=>x.id===id);if(!cob)return;
  const imps=Array.isArray(cob.imputaciones)?cob.imputaciones:[];
  const remImpactados=imps.map(imp=>_remitos.find(r=>r.id===imp.remito_id)).filter(r=>r&&r.cobrado);
  const yaImpacto=remImpactados.length>0||cob.estado_rendicion==='validado';
  const {error}=await sb.from('cobros').update({estado_rendicion:'rechazado'}).eq('id',id);
  if(error){toast('Error al rechazar cobro: '+error.message,'err');return;}
  if(yaImpacto){
    for(const imp of imps){
      const rem=_remitos.find(r=>r.id===imp.remito_id);
      if(rem){
        const saldoRevertido=(rem.saldo_pendiente!=null?rem.saldo_pendiente:0)+imp.monto;
        await sb.from('remitos').update({saldo_pendiente:saldoRevertido,cobrado:false,forma_cobro:null}).eq('id',rem.id);
      }
    }
    const cli=_clientes.find(x=>x.id===cob.cliente_id||(cob.cliente&&x.nombre&&x.nombre.trim().toLowerCase()===cob.cliente.trim().toLowerCase()));
    if(cli){
      const saldoRevertido=(cli.saldo||0)+cob.importe;
      await sb.from('clientes').update({saldo:saldoRevertido}).eq('id',cli.id);
    }
  }
  await Promise.all([cargarCobros(),cargarClientes(),cargarRemitos()]);
  renderRendicion();renderCobros();renderCC();renderDash();renderRemitos();
  toast('❌ Cobro rechazado'+(yaImpacto?' — saldo revertido':''));
}

// ─── RENDICIÓN — por Hoja de Ruta ─────────────────────────────────────────
let _hojaRutaTodas=[];
let _rendHojaSel=null; // {fecha, vendedor} de la hoja elegida, o null

async function cargarHojaRutaTodas(){
  const {data}=await sb.from('hoja_ruta').select('*').order('fecha',{ascending:false});
  _hojaRutaTodas=data||[];
}

// Próximo número de rendición: correlativo consultado directo en la base
// (no confiar en cachés locales que puedan no estar cargados/actualizados).
async function _proximoNumeroRendicion(){
  const [{data:hr},{data:cb}]=await Promise.all([
    sb.from('hoja_ruta').select('numero_rendicion').not('numero_rendicion','is',null).order('numero_rendicion',{ascending:false}).limit(1),
    sb.from('cobros').select('numero_rendicion').not('numero_rendicion','is',null).order('numero_rendicion',{ascending:false}).limit(1)
  ]);
  const maxHr=hr?.[0]?.numero_rendicion||0;
  const maxCb=cb?.[0]?.numero_rendicion||0;
  return Math.max(maxHr,maxCb)+1;
}

function _idsChk(sel){return [...document.querySelectorAll(sel+':checked')].map(c=>parseInt(c.dataset.cobid));}

function renderRendicion(){
  renderListaHojasRuta();
  if(_rendHojaSel)renderGrillaRendicion();
  renderSinHojaRuta();
}

function renderListaHojasRuta(){
  const el=document.getElementById('rend-hr-lista');if(!el)return;
  const q=(document.getElementById('rend-hr-q')?.value||'').toLowerCase();
  const num=(document.getElementById('rend-hr-num')?.value||'').trim();
  const desde=document.getElementById('rend-hr-desde')?.value||'';
  const hasta=document.getElementById('rend-hr-hasta')?.value||'';
  const grupos={};
  _hojaRutaTodas.forEach(r=>{
    const vend=(r.vendedor||'').trim()||'—';
    const key=r.fecha+'|'+vend;
    if(!grupos[key])grupos[key]={fecha:r.fecha,vendedor:vend,filas:[]};
    grupos[key].filas.push(r);
  });
  let lista=Object.values(grupos).sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.vendedor.localeCompare(b.vendedor));
  if(q)lista=lista.filter(g=>g.vendedor.toLowerCase().includes(q));
  if(desde)lista=lista.filter(g=>g.fecha>=desde);
  if(hasta)lista=lista.filter(g=>g.fecha<=hasta);
  if(num)lista=lista.filter(g=>g.filas.some(f=>String(f.numero_rendicion||'').includes(num)));
  if(!lista.length){el.innerHTML='<div class="empty">No hay hojas de ruta cargadas.</div>';return;}
  el.innerHTML=lista.map(g=>{
    const cerrada=g.filas.length>0&&g.filas.every(f=>f.cerrada);
    const numRend=g.filas.find(f=>f.numero_rendicion)?.numero_rendicion;
    const cerradoPor=g.filas.find(f=>f.cerrado_por)?.cerrado_por;
    const fechaFmt=g.fecha.split('-').reverse().join('/');
    const sel=_rendHojaSel&&_rendHojaSel.fecha===g.fecha&&_rendHojaSel.vendedor===g.vendedor;
    const vendJsSafe=g.vendedor.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<div onclick="seleccionarHojaRendicion('${g.fecha}','${vendJsSafe}')"
      style="cursor:pointer;padding:10px 14px;border-radius:8px;margin-bottom:6px;border:1.5px solid ${sel?'var(--P)':'var(--brd)'};background:${sel?'var(--PL)':'var(--bg)'};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b>${esc(g.vendedor)}</b> <span style="color:var(--txt2);font-size:12px">— ${fechaFmt} · ${g.filas.length} cliente${g.filas.length>1?'s':''}</span>
        ${cerradoPor&&cerradoPor.toLowerCase()!==g.vendedor.toLowerCase()?`<span style="color:var(--txt2);font-size:11px"> · cerrada por ${cerradoPor}</span>`:''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;font-size:11px">
        ${numRend?`<span class="b bA">Rendición #${numRend}</span>`:''}
        <span class="b ${cerrada?'bP':'bW'}">${cerrada?'🔒 Cerrada':'🔓 Abierta'}</span>
      </div>
    </div>`;
  }).join('');
}

function seleccionarHojaRendicion(fecha,vendedor){
  _rendHojaSel={fecha,vendedor};
  renderListaHojasRuta();
  const wrap=document.getElementById('rend-grilla-wrap');
  if(wrap)wrap.style.display='block';
  renderGrillaRendicion();
}

function cerrarGrillaRendicion(){
  _rendHojaSel=null;
  const wrap=document.getElementById('rend-grilla-wrap');
  if(wrap)wrap.style.display='none';
  renderListaHojasRuta();
}

function renderGrillaRendicion(){
  if(!_rendHojaSel)return;
  const {fecha,vendedor}=_rendHojaSel;
  const filasHoja=_hojaRutaTodas.filter(r=>r.fecha===fecha&&((r.vendedor||'').trim()||'—')===vendedor).sort((a,b)=>(a.orden||0)-(b.orden||0));
  const titEl=document.getElementById('rend-grilla-titulo');
  if(titEl)titEl.textContent=`${vendedor} — ${fecha.split('-').reverse().join('/')}`;

  const fCli=(document.getElementById('rend-f-cli')?.value||'').toLowerCase();
  const fZona=document.getElementById('rend-f-zona')?.value||'';
  const fCobro=document.getElementById('rend-f-cobro')?.value||'';
  const fForma=document.getElementById('rend-f-forma')?.value||'';
  const fEstado=document.getElementById('rend-f-estado')?.value||'';

  const filas=filasHoja.map(hr=>{
    const cli=_clientes.find(c=>c.id===hr.cliente_id);
    const zona=(cli?.zona||hr.zona||'').trim();
    const rems=_remitos.filter(r=>!r.anulado&&String(r.cliente_id)===String(hr.cliente_id)&&r.fecha===fecha);
    const importeRemito=rems.reduce((a,r)=>a+(r.total||0),0);
    const cobs=_cobros.filter(c=>String(c.cliente_id)===String(hr.cliente_id)&&c.fecha===fecha);
    const cobPrincipal=cobs[0]||null;
    const importeCobrado=cobs.reduce((a,c)=>a+(c.importe||0),0);
    const formas=[...new Set(cobs.map(c=>c.forma).filter(Boolean))].join('+');
    const estado=cobPrincipal?(cobPrincipal.estado_rendicion||'pendiente'):null;
    const numRend=cobPrincipal?.numero_rendicion||hr.numero_rendicion||null;
    return {hr,cli,zona,importeRemito,cobs,cobPrincipal,importeCobrado,formas,estado,numRend};
  });

  // Filtros dinámicos de columna (zona/forma) según lo que hay en esta hoja
  const selZona=document.getElementById('rend-f-zona');
  if(selZona){
    const zonas=[...new Set(filas.map(f=>f.zona).filter(Boolean))].sort();
    if(selZona.dataset.hoja!==fecha+vendedor){selZona.innerHTML='<option value="">Todas</option>'+zonas.map(z=>`<option value="${z}">${_zonas.find(x=>x.codigo===z)?.descripcion||z}</option>`).join('');selZona.dataset.hoja=fecha+vendedor;}
  }
  const selForma=document.getElementById('rend-f-forma');
  if(selForma){
    const formasSet=[...new Set(filas.flatMap(f=>f.formas?f.formas.split('+'):[]))].sort();
    if(selForma.dataset.hoja!==fecha+vendedor){selForma.innerHTML='<option value="">Todas</option>'+formasSet.map(fm=>`<option value="${fm}">${fm}</option>`).join('');selForma.dataset.hoja=fecha+vendedor;}
  }

  const filasFiltradas=filas.filter(f=>{
    const okCli=!fCli||(f.cli?.nombre||f.hr.nombre||'').toLowerCase().includes(fCli);
    const okZona=!fZona||f.zona===fZona;
    const okCobro=!fCobro||(fCobro==='si'?f.cobs.length>0:f.cobs.length===0);
    const okForma=!fForma||f.formas.includes(fForma);
    const okEstado=!fEstado||f.estado===fEstado;
    return okCli&&okZona&&okCobro&&okForma&&okEstado;
  });

  const esAdmin=usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin';
  const tbody=document.getElementById('rend-grilla-tbody');
  if(tbody)tbody.innerHTML=filasFiltradas.length?filasFiltradas.map(f=>{
    const nombre=f.cli?.nombre||f.hr.nombre||'?';
    const badge=!f.cobPrincipal?'<span class="b" style="background:var(--bg2);color:var(--txt2)">Sin cobro</span>':
      f.estado==='validado'?'<span class="b bP">✅ Aprobado</span>':
      f.estado==='rechazado'?'<span class="b bD">❌ Rechazado</span>':'<span class="b bW">⏳ Pendiente</span>';
    const puedeAccion=esAdmin&&f.cobPrincipal&&f.estado==='pendiente';
    const acciones=puedeAccion?`<button class="btn sm" style="background:var(--G);color:#fff;font-size:10px" onclick="validarCobro(${f.cobPrincipal.id})">✅</button><button class="btn sm D" style="font-size:10px" onclick="rechazarCobro(${f.cobPrincipal.id})">❌</button>`:'';
    const chk=puedeAccion?`<input type="checkbox" class="rend-chk" data-cobid="${f.cobPrincipal.id}">`:'';
    return `<tr>
      <td>${chk}</td>
      <td style="font-weight:500">${esc(nombre)}</td>
      <td>${f.zona?`<span class="b bA">${esc(_zonas.find(z=>z.codigo===f.zona)?.descripcion||f.zona)}</span>`:'—'}</td>
      <td>${esc(vendedor)}</td>
      <td style="text-align:right">${f.importeRemito?fmt(f.importeRemito):'—'}</td>
      <td style="text-align:center">${f.cobs.length?'✅ Sí':'—'}</td>
      <td style="text-align:right;${f.importeCobrado?'font-weight:700;color:var(--P)':''}">${f.importeCobrado?fmt(f.importeCobrado):'—'}</td>
      <td style="font-size:11px;color:var(--txt2)">${f.formas||'—'}</td>
      <td style="text-align:center">${f.numRend||'—'}</td>
      <td>${badge}</td>
      <td style="white-space:nowrap">${acciones}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="11"><div class="empty">Sin resultados</div></td></tr>';

  const totalClientes=filas.length;
  const cobrados=filas.filter(f=>f.cobs.length>0).length;
  const pct=totalClientes?Math.round(cobrados/totalClientes*100):0;
  const totalRemitos=filas.reduce((a,f)=>a+f.importeRemito,0);
  const totalCobrado=filas.reduce((a,f)=>a+f.importeCobrado,0);
  const gastos=(_gastosReparto||[]).filter(g=>g.fecha===fecha&&(g.vendedor||'').toLowerCase()===vendedor.toLowerCase());
  const totalGastos=gastos.reduce((a,g)=>a+(g.importe||0),0);
  const liquido=totalCobrado-totalGastos;
  const resEl=document.getElementById('rend-resumen');
  if(resEl)resEl.innerHTML=`
    <div class="g4">
      <div class="card"><div style="font-size:11px;color:var(--txt2)">CLIENTES</div><div style="font-size:20px;font-weight:700">${totalClientes}</div></div>
      <div class="card"><div style="font-size:11px;color:var(--txt2)">COBRADOS</div><div style="font-size:20px;font-weight:700">${cobrados} <span style="font-size:13px;color:var(--txt2)">(${pct}%)</span></div></div>
      <div class="card"><div style="font-size:11px;color:var(--txt2)">TOTAL REMITOS</div><div style="font-size:20px;font-weight:700">${fmt(totalRemitos)}</div></div>
      <div class="card"><div style="font-size:11px;color:var(--txt2)">TOTAL COBRADO</div><div style="font-size:20px;font-weight:700;color:var(--P)">${fmt(totalCobrado)}</div></div>
    </div>
    ${gastos.length?`
    <div class="card" style="margin-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:8px">⛽ Gastos de reparto</div>
      ${gastos.map(g=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:var(--txt2)"><span>${esc(g.concepto)}${esc(g.proveedor?' · '+g.proveedor:'')}</span><span>${fmt(g.importe)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--brd);margin-top:8px;padding-top:8px;font-size:13px;font-weight:700">
        <span>Total cobrado</span><span>${fmt(totalCobrado)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:var(--D)">
        <span>− Total gastos</span><span>${fmt(totalGastos)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:var(--P);border-top:2px solid var(--brd);margin-top:6px;padding-top:6px">
        <span>LÍQUIDO A RENDIR</span><span>${fmt(liquido)}</span>
      </div>
    </div>`:''}`;
}

function rendToggleAll(cb){
  document.querySelectorAll('.rend-chk').forEach(el=>{if(!el.disabled)el.checked=cb.checked;});
}

function rendAprobarSeleccionados(){
  const ids=_idsChk('.rend-chk');
  if(!ids.length){toast('Seleccioná al menos un cobro','err');return;}
  aprobarTodoRendicion(ids);
}
function rendRechazarSeleccionados(){
  const ids=_idsChk('.rend-chk');
  if(!ids.length){toast('Seleccioná al menos un cobro','err');return;}
  rechazarTodoRendicion(ids);
}
function rendAprobarSelSinHoja(){
  const ids=_idsChk('.rend-sh-chk');
  if(!ids.length){toast('Seleccioná al menos un cobro','err');return;}
  aprobarTodoRendicion(ids);
}
function rendRechazarSelSinHoja(){
  const ids=_idsChk('.rend-sh-chk');
  if(!ids.length){toast('Seleccioná al menos un cobro','err');return;}
  rechazarTodoRendicion(ids);
}

async function rendAsignarNumeroAuto(){
  if(!_rendHojaSel)return;
  const {fecha,vendedor}=_rendHojaSel;
  const num=await _proximoNumeroRendicion();
  if(!confirm(`¿Asignar el número de rendición #${num} a esta hoja de ruta?`))return;
  const dq=sb.from('hoja_ruta').update({numero_rendicion:num}).eq('fecha',fecha).is('numero_rendicion',null);
  if(vendedor&&vendedor!=='—')dq.eq('vendedor',vendedor);
  await dq;
  const clienteIds=_hojaRutaTodas.filter(r=>r.fecha===fecha&&((r.vendedor||'').trim()||'—')===vendedor).map(r=>r.cliente_id);
  for(const cid of clienteIds){
    await sb.from('cobros').update({numero_rendicion:num}).eq('cliente_id',cid).eq('fecha',fecha).is('numero_rendicion',null);
  }
  await Promise.all([cargarCobros(),cargarHojaRutaTodas()]);
  renderRendicion();
  toast(`✅ Número de rendición #${num} asignado`);
}

async function rendAsignarNumeroAutoSinHoja(){
  const ids=_idsChk('.rend-sh-chk');
  if(!ids.length){toast('Seleccioná al menos un cobro','err');return;}
  const num=await _proximoNumeroRendicion();
  if(!confirm(`¿Asignar el número de rendición #${num} a ${ids.length} cobro(s)?`))return;
  for(const id of ids){await sb.from('cobros').update({numero_rendicion:num}).eq('id',id);}
  await cargarCobros();
  renderRendicion();
  toast(`✅ Número de rendición #${num} asignado`);
}

function renderSinHojaRuta(){
  const el=document.getElementById('rend-sin-hoja');if(!el)return;
  const mostrarTodos=document.getElementById('rend-mostrar-todos')?.checked;
  const hojaKeys=new Set(_hojaRutaTodas.map(r=>String(r.cliente_id)+'|'+r.fecha));
  let cobrosSinHoja=_cobros.filter(c=>!hojaKeys.has(String(c.cliente_id)+'|'+c.fecha));
  if(!mostrarTodos)cobrosSinHoja=cobrosSinHoja.filter(c=>(c.estado_rendicion||'pendiente')==='pendiente');
  if(!cobrosSinHoja.length){el.innerHTML='<div class="empty">No hay cobros sin hoja de ruta.</div>';return;}
  const esAdmin=usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin';
  const rows=cobrosSinHoja.map(c=>{
    const est=c.estado_rendicion||'pendiente';
    const badge=est==='validado'?'<span class="b bP">✅ Aprobado</span>':est==='rechazado'?'<span class="b bD">❌ Rechazado</span>':'<span class="b bW">⏳ Pendiente</span>';
    const puede=esAdmin&&est==='pendiente';
    const chk=puede?`<input type="checkbox" class="rend-sh-chk" data-cobid="${c.id}">`:'';
    const acciones=puede?`<button class="btn sm" style="background:var(--G);color:#fff;font-size:10px" onclick="validarCobro(${c.id})">✅</button><button class="btn sm D" style="font-size:10px" onclick="rechazarCobro(${c.id})">❌</button>`:'';
    return `<tr><td>${chk}</td><td style="font-weight:500">${esc(c.cliente||'?')}</td><td>${c.fecha}</td><td>${esc(c.vendedor||'—')}</td><td style="text-align:right;font-weight:700;color:var(--P)">${fmt(c.importe)}</td><td style="font-size:11px;color:var(--txt2)">${c.forma||'—'}</td><td>${c.numero_rendicion||'—'}</td><td>${badge}</td><td style="white-space:nowrap">${acciones}</td></tr>`;
  }).join('');
  el.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <button class="btn sm" onclick="document.querySelectorAll('.rend-sh-chk').forEach(c=>c.checked=true)">Marcar todo</button>
      <button class="btn sm P" onclick="rendAprobarSelSinHoja()">✅ Aprobar seleccionados</button>
      <button class="btn sm D" onclick="rendRechazarSelSinHoja()">❌ Rechazar seleccionados</button>
      <button class="btn sm" onclick="rendAsignarNumeroAutoSinHoja()">🔢 Asignar número automático</button>
      <button class="btn sm A" onclick="rendGenerarHojaRutaFaltante()" title="Crea la hoja de ruta que falta para estos cobros (vinieron de una carga sin hoja armada a mano)">🔗 Generar hoja de ruta</button>
    </div>
    <div class="tbl-wrap"><table class="tbl" style="font-size:12px">
      <thead><tr><th></th><th>Cliente</th><th>Fecha</th><th>Vendedor</th><th style="text-align:right">Importe</th><th>Forma</th><th>Nº Rend.</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// Backfill: crea la hoja_ruta que falta para los cobros ya guardados que
// vinieron del flujo de carga (sin pasar por "Armar ruta"), para que dejen
// de aparecer como huérfanos acá y se integren a la grilla normal.
async function rendGenerarHojaRutaFaltante(){
  const hojaKeys=new Set(_hojaRutaTodas.map(r=>String(r.cliente_id)+'|'+r.fecha));
  const cobrosSinHoja=_cobros.filter(c=>!hojaKeys.has(String(c.cliente_id)+'|'+c.fecha));
  if(!cobrosSinHoja.length){toast('No hay cobros sin hoja de ruta.');return;}
  if(!confirm(`¿Generar la hoja de ruta faltante para ${cobrosSinHoja.length} cobro(s)?`))return;
  for(const c of cobrosSinHoja){
    await _asegurarHojaRutaParaCobro(c.cliente_id,c.fecha,c.vendedor||'');
  }
  await cargarHojaRutaTodas();
  renderRendicion();
  toast('✅ Hoja de ruta generada para los cobros sueltos.');
}

async function aprobarTodoRendicion(ids){
  if(!confirm(`¿Aprobar ${ids.length} cobro(s)? Se descontará el saldo de los clientes y sus remitos.`))return;
  const esAdmin=usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin';
  if(!esAdmin){toast('Solo el admin puede aprobar cobros','err');return;}
  let ok=0,err=0;
  // Saldos corrientes en memoria: si el lote trae más de un cobro del mismo
  // cliente o imputado al mismo remito, cada iteración tiene que partir del
  // saldo ya descontado por la anterior — no del valor stale de _clientes/_remitos,
  // que si no se pisa una imputación a la siguiente.
  const saldoRemCorriente={},saldoCliCorriente={};
  for(const id of ids){
    const cob=_cobros.find(x=>x.id===id);if(!cob||cob.estado_rendicion!=='pendiente')continue;
    const {error}=await sb.from('cobros').update({estado_rendicion:'validado'}).eq('id',id);
    if(error){err++;continue;}
    const imps=Array.isArray(cob.imputaciones)?cob.imputaciones:[];
    for(const imp of imps){
      const rem=_remitos.find(r=>r.id===imp.remito_id);
      if(rem){
        if(!(rem.id in saldoRemCorriente))saldoRemCorriente[rem.id]=rem.saldo_pendiente!=null?rem.saldo_pendiente:rem.total;
        const nuevoSaldo=Math.max(0,saldoRemCorriente[rem.id]-imp.monto);
        saldoRemCorriente[rem.id]=nuevoSaldo;
        await sb.from('remitos').update({saldo_pendiente:nuevoSaldo,cobrado:nuevoSaldo<=0,forma_cobro:nuevoSaldo<=0?(cob.forma||'efectivo'):rem.forma_cobro}).eq('id',rem.id);
      }
    }
    const cli=_clientes.find(x=>x.id===cob.cliente_id||(cob.cliente&&x.nombre&&x.nombre.trim().toLowerCase()===cob.cliente.trim().toLowerCase()));
    if(cli){
      if(!(cli.id in saldoCliCorriente))saldoCliCorriente[cli.id]=cli.saldo||0;
      const nuevoSaldo=Math.max(0,saldoCliCorriente[cli.id]-cob.importe);
      saldoCliCorriente[cli.id]=nuevoSaldo;
      await sb.from('clientes').update({saldo:nuevoSaldo}).eq('id',cli.id);
    }
    ok++;
  }
  await Promise.all([cargarCobros(),cargarClientes(),cargarRemitos()]);
  renderRendicion();renderCobros();renderCC();renderDash();renderRemitos();
  toast(err>0?`✅ ${ok} aprobados, ${err} errores`:`✅ ${ok} cobro(s) aprobados — saldo aplicado`);
}

async function rechazarTodoRendicion(ids){
  if(!confirm(`¿Rechazar ${ids.length} cobro(s)?`))return;
  const esAdmin=usuarioActual?.esAdmin||usuarioActual?.rol_original==='admin';
  if(!esAdmin){toast('Solo el admin puede rechazar cobros','err');return;}
  let ok=0;
  // Mismo cuidado que aprobarTodoRendicion: saldo corriente en memoria para
  // no pisar la reversión de un cobro con la del siguiente en el mismo lote.
  const saldoRemCorriente={},saldoCliCorriente={};
  for(const id of ids){
    const cob=_cobros.find(x=>x.id===id);if(!cob||cob.estado_rendicion==='rechazado')continue;
    const imps=Array.isArray(cob.imputaciones)?cob.imputaciones:[];
    const yaImpacto=cob.estado_rendicion==='validado';
    const {error}=await sb.from('cobros').update({estado_rendicion:'rechazado'}).eq('id',id);
    if(error)continue;
    if(yaImpacto){
      for(const imp of imps){
        const rem=_remitos.find(r=>r.id===imp.remito_id);
        if(rem){
          if(!(rem.id in saldoRemCorriente))saldoRemCorriente[rem.id]=rem.saldo_pendiente!=null?rem.saldo_pendiente:0;
          const saldoRevertido=saldoRemCorriente[rem.id]+imp.monto;
          saldoRemCorriente[rem.id]=saldoRevertido;
          await sb.from('remitos').update({saldo_pendiente:saldoRevertido,cobrado:false,forma_cobro:null}).eq('id',rem.id);
        }
      }
      const cli=_clientes.find(x=>x.id===cob.cliente_id||(cob.cliente&&x.nombre&&x.nombre.trim().toLowerCase()===cob.cliente.trim().toLowerCase()));
      if(cli){
        if(!(cli.id in saldoCliCorriente))saldoCliCorriente[cli.id]=cli.saldo||0;
        const saldoRevertido=saldoCliCorriente[cli.id]+cob.importe;
        saldoCliCorriente[cli.id]=saldoRevertido;
        await sb.from('clientes').update({saldo:saldoRevertido}).eq('id',cli.id);
      }
    }
    ok++;
  }
  await Promise.all([cargarCobros(),cargarClientes(),cargarRemitos()]);
  renderRendicion();renderCobros();renderCC();renderDash();renderRemitos();
  toast(`❌ ${ok} cobro(s) rechazados`);
}

function imprimirRecibo(id){
  const r=_cobros.find(x=>x.id===id);if(!r)return;
  const nro=String(r.id).padStart(6,'0');
  const imps=Array.isArray(r.imputaciones)?r.imputaciones:[];

  const filasFacturas=imps.length?imps.map(imp=>{
    const rem=_remitos.find(x=>x.id===imp.remito_id);
    const num=rem?'R-'+String(rem.id).padStart(4,'0'):'R-'+String(imp.remito_id).padStart(4,'0');
    const fechaEmision=rem?.fecha||'—';
    return `<tr>
      <td style="border:1px solid #000;padding:5px 7px">${num}</td>
      <td style="border:1px solid #000;padding:5px 7px">${fechaEmision}</td>
      <td style="border:1px solid #000;padding:5px 7px;text-align:right">${fmt(imp.monto)}</td>
    </tr>`;
  }).join(''):`<tr><td colspan="3" style="border:1px solid #000;padding:8px;text-align:center;color:#555">Sin facturas imputadas</td></tr>`;

  const medios=[];
  if((r.efectivo||0)>0)medios.push(['Efectivo',r.efectivo]);
  if((r.transferencia||0)>0)medios.push(['Transferencia',r.transferencia]);
  if((r.cheque_propio||0)>0)medios.push(['Cheque propio',r.cheque_propio]);
  if((r.cheque_terceros||0)>0)medios.push([`Cheque de terceros${esc(r.banco_cheque?' ('+esc(r.banco_cheque)+')':'')}${r.nro_cheque?' Nro:'+r.nro_cheque:''}`,r.cheque_terceros]);
  const filasMedios=medios.map(([label,val])=>`
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #000;font-size:12px">
      <span>${label}</span><span>${fmt(val)}</span>
    </div>`).join('');

  // Comisión del vendedor sobre este cobro puntual (misma config que usan
  // los resúmenes de Rendición: persona.pct_cobranza).
  cargarComPersonas();
  const personaRec=_comPersonas.find(p=>(p.nombre||'').toLowerCase()===(r.vendedor||'').toLowerCase());
  const pctCobranza=personaRec?.pct_cobranza??0;
  const comisionRecibo=pctCobranza>0?(r.importe||0)*(pctCobranza/100):0;

  const totalImputado=imps.reduce((a,i)=>a+(i.monto||0),0);
  const diferencia=Math.round((r.importe-totalImputado)*100)/100;

  // Saldo restante del cliente después de este cobro — para cuando pregunta
  // "¿cuánto me queda debiendo?". Si ya está validado, c.saldo ya lo excluye;
  // si todavía está pendiente de aprobar, se lo resta acá como proyección.
  const cliRec=_clientes.find(x=>String(x.id)===String(r.cliente_id))||_clientes.find(x=>x.nombre&&r.cliente&&x.nombre.trim().toLowerCase()===r.cliente.trim().toLowerCase());
  const validadoRec=(r.estado_rendicion||'pendiente')==='validado';
  const saldoRestante=cliRec?Math.round(((cliRec.saldo||0)-(validadoRec?0:r.importe))*100)/100:null;

  const textoCompartir=`Recibo ${nro} — Distribuidora Lila\nCliente: ${esc(r.cliente)}\nFecha: ${r.fecha}\nImporte: ${fmt(r.importe)}${saldoRestante!=null?`\nSaldo restante: ${fmt(saldoRestante)}`:''}`;

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Recibo ${nro}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;padding:18px;color:#000;background:#fff;max-width:760px;margin:0 auto;font-size:15px}
    table{border-collapse:collapse;width:100%}
    .fila-medios{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .fila-medios>div{flex:1;min-width:220px}
    @media print{button,.no-print{display:none}}
  </style></head><body>

  <div id="recibo-print-area" style="background:#fff;padding:26px;border:1px solid #ddd;border-radius:14px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px">
    <div>
      <div style="font-size:22px;font-weight:bold">DISTRIBUIDORA LILA</div>
      <div style="font-size:17px;font-weight:bold;margin-top:4px">RECIBO DE COBRO Nro ${nro}</div>
    </div>
    <div style="text-align:right;font-size:15px">Fecha: <b>${r.fecha}</b></div>
  </div>

  <div style="font-size:15px;margin-bottom:14px">
    <b>Cliente:</b> ${esc(r.cliente)}${esc(r.cliente_id?' (Cód: '+esc(r.cliente_id)+')':'')}<br>
    ${r.vendedor?`<b>Vendedor:</b> ${esc(r.vendedor)}<br>`:''}
    ${r.reparto?`<b>Reparto:</b> ${esc(r.reparto)}<br>`:''}
  </div>

  <div class="fila-medios">
    <div>
      <table style="font-size:14px">
        <thead><tr>
          <th style="border:1px solid #000;padding:6px 7px;text-align:left">Comprobante</th>
          <th style="border:1px solid #000;padding:6px 7px;text-align:left">Fecha</th>
          <th style="border:1px solid #000;padding:6px 7px;text-align:right">Importe</th>
        </tr></thead>
        <tbody>${filasFacturas}</tbody>
      </table>
    </div>
    <div style="border:1px solid #000;padding:9px 12px">
      <div style="font-weight:bold;font-size:14px;border-bottom:1px solid #000;padding-bottom:5px;margin-bottom:5px">MEDIOS DE PAGO</div>
      ${filasMedios||'<div style="font-size:14px;color:#555">—</div>'}
    </div>
  </div>

  ${r.observaciones?`<div style="font-size:14px;margin-top:10px">Obs: ${esc(r.observaciones)}</div>`:''}

  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <table style="font-size:15px;min-width:260px;width:auto">
      <tr><td style="border:1px solid #000;padding:7px 10px">TOTAL</td><td style="border:1px solid #000;padding:7px 10px;text-align:right;font-weight:bold">${fmt(r.importe)}</td></tr>
      <tr><td style="border:1px solid #000;padding:7px 10px">DIFERENCIA</td><td style="border:1px solid #000;padding:7px 10px;text-align:right">${fmt(diferencia)}</td></tr>
      ${comisionRecibo>0?`<tr><td style="border:1px solid #000;padding:7px 10px;color:#555">Comisión vendedor (${pctCobranza}%)</td><td style="border:1px solid #000;padding:7px 10px;text-align:right;color:#555">${fmt(comisionRecibo)}</td></tr>`:''}
      ${saldoRestante!=null?`<tr><td style="border:1px solid #000;padding:7px 10px;font-weight:bold">SALDO RESTANTE</td><td style="border:1px solid #000;padding:7px 10px;text-align:right;font-weight:bold;color:${saldoRestante>0?'#c0392b':'#1a7a52'}">${fmt(saldoRestante)}</td></tr>`:''}
    </table>
  </div>

  <div style="margin-top:50px;text-align:center;font-size:14px">
    <div style="border-top:1px solid #000;width:260px;margin:0 auto;padding-top:6px">Firma del cliente</div>
  </div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
    <button onclick="window.print()" style="padding:10px 20px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:15px">🖨️ Imprimir</button>
    <button id="btn-compartir-rec" style="padding:10px 20px;background:#1a6fa8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:15px">📤 Compartir como imagen</button>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
  <script>
    document.getElementById('btn-compartir-rec').onclick=function(){
      var texto=${JSON.stringify(textoCompartir)};
      var btn=this; var textoOriginal=btn.textContent;
      btn.textContent='Generando...'; btn.disabled=true;
      function volver(){btn.textContent=textoOriginal;btn.disabled=false;}
      if(typeof html2canvas==='undefined'){
        // La librería no cargó (sin internet, bloqueada, etc.) — compartir solo texto.
        if(navigator.share){navigator.share({title:'Recibo ${nro}',text:texto}).catch(function(){});}
        else{navigator.clipboard&&navigator.clipboard.writeText(texto);alert('Copiado — pegalo en WhatsApp.');}
        volver();return;
      }
      html2canvas(document.getElementById('recibo-print-area'),{scale:2,backgroundColor:'#ffffff'}).then(function(canvas){
        canvas.toBlob(function(blob){
          if(!blob){volver();return;}
          var file=new File([blob],'recibo-${nro}.png',{type:'image/png'});
          if(navigator.canShare&&navigator.canShare({files:[file]})){
            navigator.share({files:[file],title:'Recibo ${nro}',text:texto}).catch(function(){}).then(volver);
          } else if(navigator.share){
            navigator.share({title:'Recibo ${nro}',text:texto}).catch(function(){});
            volver();
          } else {
            var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='recibo-${nro}.png';a.click();
            alert('Se descargó la imagen del recibo — compartila desde tu galería.');
            volver();
          }
        },'image/png');
      }).catch(function(){volver();alert('No se pudo generar la imagen — se comparte como texto.');
        if(navigator.share)navigator.share({title:'Recibo ${nro}',text:texto}).catch(function(){});
      });
    };
  <\/script>
  </body></html>`);
  w.document.close();
}

function imprimirCuentaCorriente(){
  const titulo=document.getElementById('m-ver-title')?.textContent||'Cuenta corriente';
  const body=document.getElementById('m-ver-body')?.innerHTML||'';
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:20px;color:#000;font-size:12px}
    table{border-collapse:collapse;width:100%}
    @page{size:A4 landscape;margin:10mm}
    @media print{button{display:none}}
  </style></head><body>
  <div style="font-size:16px;font-weight:700;color:#1a7a52;border-bottom:2px solid #1a7a52;padding-bottom:8px;margin-bottom:14px">🌸 Distribuidora Lila — ${titulo}</div>
  ${body}
  <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 20px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Imprimir</button></div>
  </body></html>`);
  w.document.close();
}

// ─── CUENTAS CORRIENTES ───
function actualizarDeuda(){
  const d=_clientes.reduce((a,c)=>a+(c.saldo>0?c.saldo:0),0);
  document.getElementById('cc-total-deuda').textContent='Deuda total: '+fmt(d);
}

function renderCC(){
  actualizarDeuda();
  const q=(document.getElementById('cc-q').value||'').toLowerCase();
  const f=document.getElementById('cc-f').value;
  poblarSelectValores('cc-f-zona',_clientes.map(c=>c.zona||''),nombreZona);
  poblarSelectValores('cc-f-ven',_clientes.map(c=>(c.vendedor||'').trim()));
  const fCli=document.getElementById('cc-f-cli')?.value||'';
  const fLoc=document.getElementById('cc-f-loc')?.value||'';
  const fZona=document.getElementById('cc-f-zona')?.value||'';
  const fVen=document.getElementById('cc-f-ven')?.value||'';
  const fDias=document.getElementById('cc-f-dias')?.value||'';
  const fSaldo=document.getElementById('cc-f-saldo')?.value||'';
  const fTotal=document.getElementById('cc-f-total')?.value||'';
  let data=_clientes.filter(c=>{
    const okQ=!q||(c.nombre||'').toLowerCase().includes(q)||(c.localidad||'').toLowerCase().includes(q)||String(c.codigo||'').includes(q)||String(c.id||'').includes(q);
    const dias=diasDesde(c.ultimo_remito);
    const venc=c.saldo>0&&dias!==null&&dias>(c.condicion_pago||0)+5;
    const okF=f===''||(f==='deuda'&&c.saldo>0)||(f==='ok'&&c.saldo<=0)||(f==='vencido'&&venc);
    const okCols=matchFiltroCol(c.nombre,fCli)&&matchFiltroCol(c.localidad,fLoc)&&
      (!fZona||c.zona===fZona)&&(!fVen||(c.vendedor||'').trim()===fVen)&&
      matchFiltroCol(dias,fDias)&&matchFiltroCol(c.saldo,fSaldo)&&matchFiltroCol(c.total_comprado,fTotal);
    return okQ&&okF&&okCols;
  }).sort((a,b)=>{
    const sa=a.saldo||0,sb=b.saldo||0;
    if(sb!==sa)return sb-sa;
    return (b.ultimo_remito||'').localeCompare(a.ultimo_remito||'');
  });
  const tot=data.length,sl=data.slice((_ccPg-1)*PP,_ccPg*PP);
  const tbody=document.getElementById('cc-tbody');
  tbody.innerHTML=sl.length?sl.map(c=>{
    const dias=diasDesde(c.ultimo_remito);
    const venc=c.saldo>0&&dias!==null&&dias>(c.condicion_pago||0)+5;
    const dColor=dias===null?'':venc?'color:var(--D);font-weight:600':dias<=(c.condicion_pago||0)?'color:var(--P)':'color:var(--W)';
    return `<tr style="${venc?'background:var(--DL)':''};cursor:pointer" onclick="histCliente(${c.id})">
      <td style="font-weight:600">${esc(c.nombre)}<div style="font-size:10px;color:var(--txt2)">${esc(c.telefono||'')}</div></td>
      <td>${esc(c.localidad||'')}</td>
      <td><span class="b bA">${(_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona)||'-'}</span></td>
      <td>${esc(c.vendedor||'—')}</td>
      <td style="color:var(--txt2);font-size:12px">${c.ultimo_remito||'—'}</td>
      <td style="${dColor}">${dias!==null?dias+'d':'—'}</td>
      <td style="${(c.saldo||0)>0?'color:var(--D);font-weight:600':'color:var(--P)'}">${fmt(c.saldo)}</td>
      <td>${fmt(c.total_comprado||0)}</td>
      <td style="display:flex;gap:3px" onclick="event.stopPropagation()">
        <button class="btn sm" onclick="histCliente(${c.id})">📋</button>
        <button class="btn P sm" onclick="cobroRapido(${c.id})">💰</button>
      </td>
    </tr>`;
  }).join(''):'<tr><td colspan="9"><div class="empty">Sin resultados</div></td></tr>';
  pag('cc-pg',tot,_ccPg,p=>{_ccPg=p;renderCC();});
}

function cobroRapido(id){
  abrirCobro();
  setTimeout(()=>selCliCob(id),50);
  go('cobranza');
}

function colorDias(dias,condPago){
  const cp=condPago||0;
  if(dias<=cp)return 'color:var(--P)';
  if(dias>cp+5)return 'color:var(--D);font-weight:600';
  return 'color:var(--W)';
}

// Tecla Inicio (o click) sobre un renglón de la cuenta corriente: abre el comprobante de origen
function histAbrirDetalle(tipo,id){
  if(tipo==='REMITO')verRemitoEnCobro(id);
  else if(tipo==='RECIBO')verCobroDetalle(id);
  else if(tipo==='N.CRED')verNCDetalle(id);
}

// Navegación por teclado entre renglones de la cuenta corriente: ↑↓ mueve el
// foco entre movimientos, Inicio o Enter abre el comprobante de ese renglón.
function histNavFila(e,tr,tipo,id){
  if(e.key==='Home'||e.key==='Enter'){e.preventDefault();histAbrirDetalle(tipo,id);return;}
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();
  // [tabindex] genérico: sirve tanto para las filas <tr> de la vista de PC
  // como para las tarjetas <div> de la vista angosta (celular).
  const filas=[...tr.parentElement.querySelectorAll('[tabindex]')];
  const idx=filas.indexOf(tr);
  const next=e.key==='ArrowDown'?Math.min(idx+1,filas.length-1):Math.max(idx-1,0);
  filas[next]?.focus();
  filas[next]?.scrollIntoView({block:'nearest'});
}

// La cuenta corriente tiene 8 columnas: en un celular eso obliga a arrastrar
// para los costados. Por debajo de 760px se muestra una tarjeta por movimiento.
function _ccAngosta(){
  return window.innerWidth < 760;
}

function _ccTarjetasHTML(movs,c){
  if(!movs.length){
    return `<div style="padding:20px;text-align:center;color:var(--txt2);font-size:13px">Sin movimientos registrados en el sistema nuevo.<br><small>El saldo inicial refleja la historia anterior.</small></div>`;
  }
  const totDebe=movs.reduce((a,m)=>a+m.debe,0);
  const totHaber=movs.reduce((a,m)=>a+m.haber,0);
  const filas=movs.map(m=>{
    const esHaber=m.haber>0;
    const monto=esHaber?'−'+fmt(m.haber):'+'+fmt(m.debe);
    const sub=esc([m.fecha,m.forma||'',m.reparto?'Rep: '+m.reparto:''].filter(Boolean).join(' · '));
    return `<div tabindex="0" onclick="histAbrirDetalle('${m.tipo}',${m.id})"
      onkeydown="histNavFila(event,this,'${m.tipo}',${m.id})"
      onfocus="this.style.outline='2px solid var(--P)'" onblur="this.style.outline=''"
      title="↑↓ navegar · Inicio o Enter para ver el detalle"
      style="padding:10px 12px;border-bottom:1px solid var(--brd);cursor:pointer;${m.tipo==='RECIBO'?'background:#f0faf5':m.tipo==='N.CRED'?'background:#fef9f0':'background:#fff'}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:700">${m.tipo} <span style="color:var(--A)">${m.nro}</span></div>
          <div style="font-size:11px;color:var(--txt2);margin-top:2px">${sub}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:700;color:${esHaber?'var(--P)':'var(--D)'}">${monto}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:2px">Saldo: <b style="color:${m.saldo>0?'var(--D)':'var(--P)'}">${fmt(m.saldo)}</b></div>
        </div>
      </div>
      ${m.obs?`<div style="font-size:11px;color:var(--txt2);margin-top:5px;word-break:break-word">${esc(m.obs)}</div>`:''}
    </div>`;
  }).join('');
  return `
    <div style="border:1px solid var(--brd);border-radius:8px;overflow:hidden">${filas}</div>
    <div style="margin-top:10px;background:var(--bg2);border-radius:8px;padding:10px 12px;font-size:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>Total facturado</span><b style="color:var(--D)">${fmt(totDebe)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>Total pagado</span><b style="color:var(--P)">${fmt(totHaber)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--brd);padding-top:6px">
        <b>Saldo</b><b style="font-size:15px;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo)}</b>
      </div>
    </div>`;
}

function histCliente(id){
  const sid=String(id);
  const c=_clientes.find(x=>String(x.id)===sid)||_clientes.find(x=>x.id==id);
  if(!c)return;
  const rems=_remitos.filter(r=>String(r.cliente_id)===sid&&!r.anulado).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const cobs=_cobros.filter(r=>(String(r.cliente_id)===sid||(r.cliente&&c.nombre&&r.cliente.trim().toLowerCase()===c.nombre.trim().toLowerCase()))&&(r.estado_rendicion||'pendiente')!=='rechazado').sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const ncs=_ncs?_ncs.filter(r=>String(r.cliente_id)===sid).sort((a,b)=>a.fecha.localeCompare(b.fecha)):[];
  const dias=diasDesde(c.ultimo_remito);

  // Armar movimientos unificados con saldo acumulado
  let movs=[];
  // Saldo inicial
  const saldoInicial=c.saldo_inicial||0;
  
  // Agregar remitos como DEBE
  rems.forEach(r=>movs.push({id:r.id,fecha:r.fecha,tipo:'REMITO',nro:'R-'+String(r.id).padStart(4,'0'),debe:r.total,haber:0,reparto:'',obs:''}));
  // Agregar cobros como HABER — con detalle de imputación
  cobs.forEach(r=>{
    const imp=r.imputaciones||[];
    const obs=r.observaciones||'';
    const detalle=imp.length?imp.map(i=>`R-${String(i.remito_id).padStart(4,'0')}: ${fmt(i.monto)}`).join(', '):'';
    const rendTxt=r.numero_rendicion?`Rendición #${r.numero_rendicion}`:'sin rendición aún';
    const validado=(r.estado_rendicion||'pendiente')==='validado';
    movs.push({id:r.id,fecha:r.fecha,tipo:'RECIBO',nro:'RC-'+String(r.id).padStart(4,'0'),debe:0,haber:r.importe,reparto:r.reparto||'',obs:[detalle||obs,rendTxt].filter(Boolean).join(' · '),forma:r.forma||'',pendienteAprobar:!validado});
  });
  // Agregar NC como HABER
  ncs.forEach(r=>movs.push({id:r.id,fecha:r.fecha,tipo:'N.CRED',nro:'NC-'+String(r.id).padStart(4,'0'),debe:0,haber:r.importe,reparto:'',obs:r.motivo||''}));
  
  // Ordenar por fecha
  movs.sort((a,b)=>a.fecha.localeCompare(b.fecha));

  // Calcular saldo acumulado desde saldo inicial
  let saldoAcum=saldoInicial;
  movs=movs.map(m=>{
    saldoAcum+=m.debe-m.haber;
    return {...m,saldo:saldoAcum};
  });

  // Si no hay movimientos, el saldo es el actual
  if(!movs.length) saldoAcum=c.saldo||0;

  document.getElementById('m-ver-title').textContent='Cuenta corriente — '+c.nombre;
  const _mvpCC=document.getElementById('m-ver-print');
  if(_mvpCC){_mvpCC.textContent='🖨 Imprimir';_mvpCC.onclick=imprimirCuentaCorriente;_mvpCC.style.display='inline-flex';}
  const _mvp2CC=document.getElementById('m-ver-print2');if(_mvp2CC)_mvp2CC.style.display='none';
  const _anuCC=document.getElementById('m-ver-anular');if(_anuCC)_anuCC.style.display='none';
  document.getElementById('m-ver-body').innerHTML=`
    <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--txt2)">
      <span>📍 ${esc(c.direccion||'—')}, ${esc(c.localidad||'')}</span>
      <span>📞 ${esc(c.telefono||'—')}</span>
      <span>Vendedor: <b>${esc(c.vendedor||'—')}</b></span>
      <span>Zona: <b>${_zonas.find(z=>z.codigo===c.zona)?.descripcion||c.zona||'—'}</b></span>
      <span>Cond. pago: <b>${c.condicion_pago?c.condicion_pago+' días':'Contado'}</b></span>
      <span>Dto: <b>${c.descuento||0}%</b></span>
      ${dias!==null?`<span>Días deuda: <b style="${colorDias(dias,c.condicion_pago)}">${dias}d</b></span>`:''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:${(c.saldo||0)>0?'var(--DL)':'var(--PL)'};border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <span style="font-weight:600;font-size:13px">Saldo actual</span>
      <span style="font-size:20px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo)}</span>
    </div>
    ${(()=>{const pend=movs.filter(m=>m.pendienteAprobar).reduce((a,m)=>a+m.haber,0);return pend>0?`<div style="font-size:12px;color:#946200;background:#fff3d6;margin-bottom:8px;padding:7px 10px;border-radius:6px">⏳ Hay ${fmt(pend)} en cobros pendientes de aprobar en Rendición — todavía no están descontados del saldo de arriba.</div>`:'';})()}
    ${saldoInicial>0?`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px;padding:6px 10px;background:var(--bg2);border-radius:6px">Saldo inicial al inicio del sistema: <b>${fmt(saldoInicial)}</b></div>`:''}
    ${_ccAngosta()?_ccTarjetasHTML(movs,c):`
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:var(--bg2)">
          <th style="padding:9px 10px;text-align:left;border-bottom:1px solid var(--brd)">Fecha</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:1px solid var(--brd)">Comprobante</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:1px solid var(--brd)">Nro</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:1px solid var(--brd);color:var(--D)">Debe</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:1px solid var(--brd);color:var(--P)">Haber</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:1px solid var(--brd)">Saldo</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:1px solid var(--brd)">Reparto</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:1px solid var(--brd)">Obs</th>
        </tr>
      </thead>
      <tbody>
        ${movs.length?movs.map(m=>`<tr tabindex="0" onclick="histAbrirDetalle('${m.tipo}',${m.id})" onkeydown="histNavFila(event,this,'${m.tipo}',${m.id})" onfocus="this.style.outline='2px solid var(--P)'" onblur="this.style.outline=''" title="↑↓ navegar · Inicio o Enter para ver el detalle" style="cursor:pointer;${m.tipo==='RECIBO'?'background:#f0faf5':m.tipo==='N.CRED'?'background:#fef9f0':''}">
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd)">${m.fecha}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);font-weight:600">${m.tipo}${m.pendienteAprobar?' <span title="Todavía no se aprobó en Rendición — el saldo real del cliente no lo refleja aún" style="font-size:10px;font-weight:700;color:#946200;background:#fff3d6;border-radius:4px;padding:2px 5px">⏳ pendiente</span>':''}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);color:var(--A)">${m.nro}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--D)">${m.debe>0?fmt(m.debe):''}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--P)">${m.haber>0?fmt(m.haber):''}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:700;color:${m.saldo>0?'var(--D)':'var(--P)'}">${fmt(m.saldo)}${m.pendienteAprobar?'<span style="font-size:10px;font-weight:400;color:var(--txt2)"> (proy.)</span>':''}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);text-align:center;color:var(--txt2)">${esc(m.reparto||'—')}</td>
          <td style="padding:8px 10px;border-bottom:0.5px solid var(--brd);color:var(--txt2);font-size:12px">${esc(m.obs||'')}</td>
        </tr>`).join(''):`<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--txt2)">Sin movimientos registrados en el sistema nuevo.<br><small>El saldo inicial refleja la historia anterior.</small></td></tr>`}
      </tbody>
      ${movs.length?`<tfoot>
        <tr style="background:var(--bg2);font-weight:600">
          <td colspan="3" style="padding:8px;border-top:2px solid var(--brd)">TOTALES</td>
          <td style="padding:8px;text-align:right;border-top:2px solid var(--brd);color:var(--D)">${fmt(movs.reduce((a,m)=>a+m.debe,0))}</td>
          <td style="padding:8px;text-align:right;border-top:2px solid var(--brd);color:var(--P)">${fmt(movs.reduce((a,m)=>a+m.haber,0))}</td>
          <td style="padding:8px;text-align:right;border-top:2px solid var(--brd);color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo)}</td>
          <td colspan="2" style="border-top:2px solid var(--brd)"></td>
        </tr>
      </tfoot>`:''}
    </table>
    </div>`}
  `;
  document.getElementById('m-ver').classList.add('on');
  // Foco automático en el movimiento más reciente para poder navegar con
  // ↑↓ y abrir el comprobante con Inicio/Enter sin tocar el mouse.
  if(movs.length){
    setTimeout(()=>{
      const filas=document.querySelectorAll('#m-ver-body [tabindex]');
      filas[filas.length-1]?.focus();
    },80);
  }
}

async function initRendicion(){
  // Por defecto, últimos 7 días — si no, se acumula todo el historial de
  // hojas de ruta (muchas de una sola parada, abiertas y ya sin uso).
  const desdeEl=document.getElementById('rend-hr-desde');
  if(desdeEl&&!desdeEl.value)desdeEl.value=hoyLocalOffset(-7);
  await Promise.all([cargarHojaRutaTodas(),cargarGastosReparto()]);
  renderRendicion();
}

function calcEfectivo(){
  const billetes=[20000,10000,2000,1000,500,200,100,50,20,10];
  let total=0;
  billetes.forEach(b=>{
    const cant=parseInt(document.getElementById(`bill-${b}`)?.value)||0;
    const sub=cant*b;
    total+=sub;
    const el=document.getElementById(`bill-sub-${b}`);
    if(el)el.textContent=sub>0?fmt(sub):'$0';
  });
  const el=document.getElementById('total-efectivo-contado');
  if(el)el.textContent=fmt(total);
}

async function generarRendicion(){
  const desde=document.getElementById('rend-desde').value;
  const hasta=document.getElementById('rend-hasta').value;
  const reparto=document.getElementById('rend-reparto').value.trim();
  const cobrador=document.getElementById('rend-cobrador-nom')?.value.trim().toLowerCase()||'';
  const soloPendientes=document.getElementById('rend-solo-pendientes')?.checked;
  const {data}=await sb.from('cobros').select('*').gte('fecha',desde).lte('fecha',hasta);
  let cobros=data||[];
  if(reparto)cobros=cobros.filter(c=>c.reparto===reparto);
  if(cobrador)cobros=cobros.filter(c=>(c.vendedor||'').toLowerCase().includes(cobrador)||(c.tipo_cobrador||'').toLowerCase().includes(cobrador));
  if(soloPendientes)cobros=cobros.filter(c=>(c.estado_rendicion||'pendiente')==='pendiente');
  const el=document.getElementById('rend-resultado');
  if(!cobros.length){el.innerHTML='<div class="empty">Sin cobros en ese período</div>';return;}

  cargarComPersonas();

  const totalGeneral=cobros.reduce((a,c)=>a+(c.importe||0),0);
  const totalEf=cobros.reduce((a,c)=>a+(c.efectivo||0),0);
  const totalTr=cobros.reduce((a,c)=>a+(c.transferencia||0),0);
  const totalCh=cobros.reduce((a,c)=>a+(c.cheque_propio||0)+(c.cheque_terceros||0),0);
  const totalRet=cobros.reduce((a,c)=>a+(c.retencion_ganancias||0)+(c.retencion_ing_brutos||0)+(c.retencion_otras||0),0);

  const billetes=[20000,10000,2000,1000,500,200,100,50,20,10];
  let totalContado=0;
  billetes.forEach(b=>{totalContado+=(parseInt(document.getElementById(`bill-${b}`)?.value)||0)*b;});
  const diferencia=totalContado-totalEf;

  const montoEntrega=parseFloat(document.getElementById('rend-monto-entrega')?.value)||0;
  const saldoAEntregar=totalGeneral-montoEntrega;

  // Agrupar por cobrador/vendedor
  const porCobrador={};
  cobros.forEach(c=>{
    const k=(c.vendedor||'Sin asignar').trim();
    if(!porCobrador[k]){porCobrador[k]={cobros:[],total:0,ef:0,tr:0,ch:0,ret:0,pendientes:0,validados:0};}
    porCobrador[k].cobros.push(c);
    porCobrador[k].total+=c.importe||0;
    porCobrador[k].ef+=(c.efectivo||0);
    porCobrador[k].tr+=(c.transferencia||0);
    porCobrador[k].ch+=(c.cheque_propio||0)+(c.cheque_terceros||0);
    porCobrador[k].ret+=(c.retencion_ganancias||0)+(c.retencion_ing_brutos||0)+(c.retencion_otras||0);
    if((c.estado_rendicion||'pendiente')==='pendiente')porCobrador[k].pendientes++;
    else if(c.estado_rendicion==='validado')porCobrador[k].validados++;
  });

  const cobradoresHTML=Object.entries(porCobrador).map(([nombre,g])=>{
    const persona=_comPersonas.find(p=>(p.nombre||'').toLowerCase()===nombre.toLowerCase());
    const pctC=persona?.pct_cobranza??0;
    const comision=pctC>0?g.total*(pctC/100):0;
    const detalleId='rend-det-'+nombre.replace(/[^a-z0-9]/gi,'-');
    const pendBadge=g.pendientes>0?`<span class="b bW" style="font-size:10px">${g.pendientes} pend.</span> `:'';
    const valBadge=g.validados>0?`<span class="b bP" style="font-size:10px">${g.validados} val.</span>`:'';
    return `<div style="border:1px solid var(--brd);border-radius:10px;margin-bottom:10px;overflow:hidden">
      <div onclick="var d=document.getElementById('${detalleId}');d.style.display=d.style.display==='none'?'block':'none'"
        style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg2);cursor:pointer">
        <div>
          <div style="font-weight:700;font-size:14px">👤 ${nombre} ${pendBadge}${valBadge}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:2px">${g.cobros.length} cobro${g.cobros.length!==1?'s':''}${g.ef>0?' · Ef: '+fmt(g.ef):''}${g.tr>0?' · Transf: '+fmt(g.tr):''}${g.ch>0?' · Cheq: '+fmt(g.ch):''}${comision>0?' · Com. ('+pctC+'%): '+fmt(comision):''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:700;color:var(--PD)">${fmt(g.total)}</div>
          <div style="font-size:10px;color:var(--txt2)">▼ ver detalle</div>
        </div>
      </div>
      <div id="${detalleId}" style="display:none">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--bg2)">
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--brd)">Fecha</th>
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--brd)">Cliente</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">Importe</th>
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--brd)">Forma</th>
            <th style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--brd)">Reparto</th>
            <th style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--brd)">Estado</th>
            <th style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--brd)">Firma</th>
          </tr></thead>
          <tbody>
            ${g.cobros.map(c=>{
              const est=c.estado_rendicion||'pendiente';
              const estBadge=est==='validado'?'<span class="b bP" style="font-size:10px">✅ Val.</span>':est==='rechazado'?'<span class="b bD" style="font-size:10px">❌ Rech.</span>':'<span class="b bW" style="font-size:10px">⏳ Pend.</span>';
              const cli=_clientes.find(x=>x.id===c.cliente_id);
              return `<tr>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);color:var(--txt2)">${c.fecha}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);font-weight:500">${esc(c.cliente)}${cli?.codigo?' <span style="color:var(--txt2);font-size:10px">#'+cli.codigo+'</span>':''}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:600;color:var(--P)">${fmt(c.importe)}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);font-size:11px;color:var(--txt2)">${c.forma||'—'}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:center;color:var(--txt2)">${esc(c.reparto||'—')}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:center">${estBadge}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:center;color:var(--txt2)">___________</td>
              </tr>`;
            }).join('')}
            <tr style="background:var(--PL);font-weight:700">
              <td colspan="2" style="padding:6px 8px;border-top:2px solid var(--brd)">Subtotal</td>
              <td style="padding:6px 8px;border-top:2px solid var(--brd);text-align:right;color:var(--PD)">${fmt(g.total)}</td>
              <td colspan="4" style="border-top:2px solid var(--brd);padding:6px 8px;font-size:11px;color:var(--txt2)">${comision>0?'Comisión: '+fmt(comision):''}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  el.innerHTML=`
    <div style="background:var(--PL);border-radius:8px;padding:12px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:600">${cobros.length} cobros · ${desde} al ${hasta}${soloPendientes?' · solo pendientes':''}</span>
        <span style="font-size:20px;font-weight:700;color:var(--PD)">${fmt(totalGeneral)}</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px">
        ${totalEf>0?`<span>Efectivo: <b>${fmt(totalEf)}</b></span>`:''}
        ${totalTr>0?`<span>Transferencia: <b>${fmt(totalTr)}</b></span>`:''}
        ${totalCh>0?`<span>Cheques: <b>${fmt(totalCh)}</b></span>`:''}
        ${totalRet>0?`<span>Retenciones: <b>${fmt(totalRet)}</b></span>`:''}
      </div>
      ${montoEntrega>0?`<div style="margin-top:10px;border-top:1px solid var(--brd);padding-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">
        <div><div style="color:var(--txt2);font-size:11px">Salió con</div><div style="font-weight:600">${fmt(montoEntrega)}</div></div>
        <div><div style="color:var(--txt2);font-size:11px">Total cobrado</div><div style="font-weight:600">${fmt(totalGeneral)}</div></div>
        <div style="grid-column:1/-1;background:${saldoAEntregar>=0?'#e8f5e9':'#fdecea'};border-radius:6px;padding:6px 10px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:600;font-size:13px">${saldoAEntregar>=0?'💰 A entregar':'⚠️ Diferencia'}</span>
          <span style="font-size:18px;font-weight:700;color:${saldoAEntregar>=0?'var(--G)':'var(--D)'}">${fmt(Math.abs(saldoAEntregar))}</span>
        </div>
      </div>`:''}
    </div>

    ${totalContado>0?`<div style="background:${diferencia===0?'var(--PL)':diferencia>0?'#e8f5e9':'#fdecea'};border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:600;font-size:13px">Cuadre de caja</div>
        <div style="font-size:11px;color:var(--txt2)">Efectivo cobros: ${fmt(totalEf)} · Contado: ${fmt(totalContado)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700;color:${diferencia===0?'var(--P)':diferencia>0?'green':'var(--D)'}">${diferencia>=0?'+':''}${fmt(diferencia)}</div>
        <div style="font-size:11px">${diferencia===0?'✅ Cuadra perfecto':diferencia>0?'⬆️ Sobra efectivo':'⬇️ Falta efectivo'}</div>
      </div>
    </div>`:''}

    <div style="margin-bottom:12px">${cobradoresHTML}</div>
    <button class="btn A" onclick="imprimirRendicion()" style="margin-top:8px">🖨️ Imprimir rendición</button>
  `;
}

function imprimirRendicion(){
  if(!_rendHojaSel){alert('Seleccioná una hoja de ruta primero');return;}
  const titulo=document.getElementById('rend-grilla-titulo')?.textContent||'Rendición';
  const numRend=document.querySelector('#rend-grilla-tbody')?.closest('.tbl-wrap')?.previousElementSibling;

  // Clonar la tabla y sacar las columnas que no aplican en papel (check y acciones).
  const tablaOrig=document.querySelector('#rend-grilla-tbody')?.closest('table');
  let filasHTML='';
  if(tablaOrig){
    const clon=tablaOrig.cloneNode(true);
    clon.querySelectorAll('tr').forEach(tr=>{
      if(tr.children.length)tr.removeChild(tr.children[tr.children.length-1]); // acciones
      if(tr.children.length)tr.removeChild(tr.children[0]); // checkbox
    });
    clon.querySelectorAll('.tbl-autofiltro').forEach(tr=>tr.remove());
    clon.querySelectorAll('input,select,button').forEach(el=>el.remove());
    filasHTML=clon.outerHTML;
  }
  const resumenHTML=document.getElementById('rend-resumen')?.innerHTML||'';

  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Rendición — ${titulo}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;font-size:12px;color:#000}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th,td{border:1px solid #000;padding:5px 7px;text-align:left}
    th{background:#eee}
    .g4{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .card{border:1px solid #000;border-radius:4px;padding:8px 10px;flex:1;min-width:120px}
    @media print{.no-print{display:none}}
  </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px">
      <div style="font-size:16px;font-weight:900">DISTRIBUIDORA LILA — Rendición de cobranza</div>
      <div style="font-size:13px;font-weight:700">${titulo}</div>
    </div>
    ${filasHTML}
    ${resumenHTML}
    <div style="margin-top:30px;display:flex;justify-content:space-between;font-size:12px">
      <div>Firma repartidor/vendedor: _____________________</div>
      <div>Firma recibí conforme: _____________________</div>
    </div>
    <div class="no-print" style="text-align:center;margin-top:16px">
      <button onclick="window.print()" style="padding:8px 24px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir</button>
    </div>
  </body></html>`);
  w.document.close();
}

// ─── SALDOS POR ZONA ───

function initSaldosZona() {
  // Cargar clientes si no están cargados
  if (!_clientes.length) {
    cargarClientes().then(() => {
      poblarSelectorZonas();
      renderSaldosZona();
    });
  } else {
    poblarSelectorZonas();
    renderSaldosZona();
  }
}

function poblarSelectorZonas() {
  const sel = document.getElementById('sz-zona');
  if (!sel) return;
  
  // Guardar valor seleccionado actual
  const valorActual = sel.value;
  
  // Limpiar y agregar opción por defecto
  sel.innerHTML = '<option value="">— Seleccioná una zona —</option>';
  
  // Obtener zonas únicas de los clientes
  const zonas = [...new Set(_clientes.map(c => c.zona).filter(Boolean))].sort();
  
  zonas.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z;
    // Mostrar descripción de la zona si existe
    const zonaObj = _zonas.find(zn => zn.codigo === z);
    opt.textContent = zonaObj ? `${z} - ${esc(zonaObj.descripcion)}` : z;
    if (z === valorActual) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderSaldosZona() {
  const zonaSeleccionada = document.getElementById('sz-zona')?.value || '';
  const filtro = document.getElementById('sz-filtro')?.value || 'deudores';
  const orden = document.getElementById('sz-orden')?.value || 'saldo';
  const hoy = hoyLocal();

  const contenedor = document.getElementById('sz-tabla');
  const resumenContainer = document.getElementById('sz-resumen');

  // Si no hay zona seleccionada, mostrar mensaje
  if (!zonaSeleccionada) {
    resumenContainer.innerHTML = '';
    contenedor.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--txt2); font-size:15px;">
        <div style="font-size:40px; margin-bottom:12px;">🗺️</div>
        <div style="font-weight:600;">Seleccioná una zona para ver los saldos</div>
        <div style="font-size:13px; margin-top:6px;">Elegí una zona en el selector de arriba</div>
      </div>
    `;
    return;
  }

  // Filtrar clientes por zona
  let lista = _clientes.filter(c => c.activo !== false && (c.zona || 'Sin zona') === zonaSeleccionada);
  
  if (filtro === 'deudores') {
    lista = lista.filter(c => (c.saldo || 0) > 0);
  }

  // Ordenar
  if (orden === 'saldo') {
    lista.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
  } else if (orden === 'nombre') {
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  } else if (orden === 'dias') {
    lista.sort((a, b) => {
      const dA = a.ultimo_remito ? Math.floor((new Date(hoy) - new Date(a.ultimo_remito)) / 864e5) : 9999;
      const dB = b.ultimo_remito ? Math.floor((new Date(hoy) - new Date(b.ultimo_remito)) / 864e5) : 9999;
      return dB - dA;
    });
  }

  // Calcular totales
  const totalDeuda = lista.reduce((s, c) => s + (c.saldo || 0), 0);
  const totalClientes = lista.length;
  const clientesConDeuda = lista.filter(c => (c.saldo || 0) > 0.01).length;
  const promedio = totalClientes > 0 ? totalDeuda / totalClientes : 0;

  // --- RESÚMEN ---
  resumenContainer.innerHTML = `
    <div style="background:var(--bg); border:1px solid var(--brd); border-radius:8px; padding:10px 14px; display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
      <div>
        <div style="font-size:11px; color:var(--txt2); font-weight:600; text-transform:uppercase;">Total Deuda</div>
        <div style="font-size:20px; font-weight:700; color:var(--D);">${fmt(totalDeuda)}</div>
      </div>
      <div>
        <div style="font-size:11px; color:var(--txt2); font-weight:600; text-transform:uppercase;">Clientes</div>
        <div style="font-size:20px; font-weight:700; color:var(--txt);">${totalClientes}</div>
        <div style="font-size:11px; color:var(--txt2);">${clientesConDeuda} con deuda</div>
      </div>
      <div>
        <div style="font-size:11px; color:var(--txt2); font-weight:600; text-transform:uppercase;">Promedio</div>
        <div style="font-size:20px; font-weight:700; color:var(--P);">${fmt(promedio)}</div>
      </div>
      <div style="flex:1; text-align:right; font-size:12px; color:var(--txt2);">
        Zona: <strong style="color:var(--txt);">${zonaSeleccionada}</strong>
        ${filtro === 'deudores' ? ' · Solo deudores' : ' · Todos los clientes'}
      </div>
    </div>
  `;

  // --- TABLA ---
  if (!lista.length) {
    contenedor.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--txt2);">
        <div style="font-size:30px; margin-bottom:8px;">✅</div>
        <div>No hay clientes ${filtro === 'deudores' ? 'con deuda' : ''} en la zona <strong>${zonaSeleccionada}</strong></div>
      </div>
    `;
    return;
  }

  // Construir tabla
  let html = `
    <table class="tbl" style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:left; background:var(--bg2);">Cód.</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:left; background:var(--bg2);">Cliente</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:left; background:var(--bg2);">Localidad</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:left; background:var(--bg2);">Vendedor</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:center; background:var(--bg2);">Último remito</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:center; background:var(--bg2);">Días</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:right; background:var(--bg2);">Vencido</th>
          <th style="border:1px solid var(--brd); padding:8px 10px; text-align:right; background:var(--bg2);">Saldo</th>
        </tr>
      </thead>
      <tbody>
  `;

  lista.forEach(c => {
    const dias = c.ultimo_remito ? Math.floor((new Date(hoy) - new Date(c.ultimo_remito)) / 864e5) : null;
    const condPago = c.condicion_pago || 0;
    
    // Color de días
    let diasColor = 'var(--txt2)';
    if (dias !== null) {
      if (dias > (condPago + 5)) diasColor = 'var(--D)';
      else if (dias > condPago) diasColor = 'var(--W)';
      else diasColor = 'var(--P)';
    }
    
    // Calcular vencido (remitos sin cobrar que superan la condición de pago)
    const remsCli = _remitos.filter(r => String(r.cliente_id) === String(c.id) && !r.anulado && !r.cobrado);
    const vencido = remsCli.filter(r => {
      const dRem = Math.floor((new Date(hoy) - new Date(r.fecha)) / 864e5);
      return dRem > condPago;
    }).reduce((s, r) => s + (r.saldo_pendiente ?? r.total ?? 0), 0);

    // Badge de estado
    const saldo = c.saldo || 0;
    let estadoClass = 'bP';
    let estadoText = '✅ Al día';
    if (saldo > 0.01) {
      if (dias !== null && dias > (condPago + 5)) {
        estadoClass = 'bD';
        estadoText = '⚠️ Vencido';
      } else {
        estadoClass = 'bW';
        estadoText = '⏳ Pendiente';
      }
    }

    html += `
      <tr onclick="histCliente(${c.id})" style="cursor:pointer;" title="Ver cuenta corriente">
        <td style="border:1px solid var(--brd); padding:6px 10px; color:var(--txt2);">${c.codigo || '—'}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; font-weight:600;">${esc(c.nombre)}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; color:var(--txt2);">${esc(c.localidad || '—')}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; color:var(--txt2);">${esc(c.vendedor || '—')}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; text-align:center; font-size:12px; color:var(--txt2);">${c.ultimo_remito || '—'}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; text-align:center; font-weight:600; color:${diasColor};">${dias !== null ? dias + ' d' : '—'}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; text-align:right; font-weight:700; color:${vencido > 0 ? 'var(--D)' : 'var(--txt2)'};">${vencido > 0 ? fmt(vencido) : '—'}</td>
        <td style="border:1px solid var(--brd); padding:6px 10px; text-align:right; font-weight:700; color:${saldo > 0.01 ? 'var(--D)' : 'var(--P)'};">${fmt(saldo)}</td>
      </tr>
    `;
  });

  // Total general
  html += `
        <tr style="background:var(--PL); font-weight:700; border-top:2px solid var(--brd);">
          <td colspan="7" style="padding:8px 10px; text-align:right;">TOTAL ZONA</td>
          <td style="padding:8px 10px; text-align:right; color:var(--D);">${fmt(totalDeuda)}</td>
        </tr>
      </tbody>
    </table>
  `;

  contenedor.innerHTML = html;

  const wrap = document.getElementById('sz-tabla-wrap');
  if (wrap) {
    wrap.style.overflowY = 'auto';
    wrap.style.flex = '1 1 auto';
  }
}

function imprimirSaldosZona() {
  const zonaVal = document.getElementById('sz-zona')?.value || '';
  const titulo = zonaVal ? (zonaVal === 'Sin zona' ? zonaVal : (nombreZona(zonaVal) || zonaVal)) : 'Todas las zonas';
  
  // Obtener el contenido de la tabla (sin el mensaje de "seleccioná una zona")
  const tablaContent = document.getElementById('sz-tabla').innerHTML;
  const resumenContent = document.getElementById('sz-resumen').innerHTML;
  
  // Verificar si hay tabla o es el mensaje de selección
  if (!zonaVal) {
    alert('Primero seleccioná una zona para imprimir.');
    return;
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <html>
      <head>
        <title>Saldos por Zona — Distribuidora Lila</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #000; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { padding: 5px 8px; border: 1px solid #ddd; text-align: left; }
          th { background: #f5f5f5; font-weight: 600; }
          h2 { margin: 0 0 4px 0; color: #1a7a52; }
          h3 { margin: 4px 0 14px 0; color: #444; font-weight: 400; }
          .resumen-print { background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 14px; display: flex; gap: 20px; }
          .resumen-print .item { display: inline-block; margin-right: 20px; }
          .resumen-print .label { font-size: 10px; color: #666; text-transform: uppercase; }
          .resumen-print .value { font-size: 18px; font-weight: 700; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h2>Distribuidora Lila</h2>
        <h3>Saldos por Zona — ${titulo} · ${new Date().toLocaleDateString('es-AR')}</h3>
        <div class="resumen-print">${resumenContent}</div>
        ${tablaContent}
        <script>
          window.onload = function() { window.print(); }
        <\/script>
      </body>
    </html>
  `);
  w.document.close();
}

function renderChequesCartera(){
  const el=document.getElementById('chq-lista');
  if(!el)return;
  el.innerHTML='<div style="color:var(--txt2);font-style:italic;padding:20px">Módulo de cheques en cartera — próximamente.</div>';
}

function abrirCheque(){alert('Próximamente');}

// ─── FIN GASTOS ───
let _cobMovilCliId=null, _cobMovilForma=null;

function verCCDesdeCobro(){
  const cid = document.getElementById('cob-cli-id')?.value;
  if(!cid){ alert('Seleccioná un cliente primero'); return; }
  histCliente(parseInt(cid));
}

function prevComprobanteMov(input){
  const file=input.files[0];if(!file)return;
  document.getElementById('cobm-comp-nombre').textContent=file.name;
  document.getElementById('cobm-comp-clear').style.display='';
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('cobm-comp-img').src=e.target.result;
    document.getElementById('cobm-comp-preview').style.display='block';
  };
  reader.readAsDataURL(file);
}

function clearComprobanteMov(){
  const inp=document.getElementById('cobm-comprobante');if(inp)inp.value='';
  document.getElementById('cobm-comp-nombre').textContent='Sin comprobante';
  document.getElementById('cobm-comp-clear').style.display='none';
  document.getElementById('cobm-comp-preview').style.display='none';
  const img=document.getElementById('cobm-comp-img');if(img)img.src='';
}

// ── Navegación entre sub-paneles de cobranza ─────────────────────────────
function cobmAbrirCC(){
  document.getElementById('cobm-acciones').style.display='none';
  document.getElementById('cobm-panel-cc').style.display='block';
  const q=document.getElementById('cobm-cc-q');if(q)q.value='';
  const l=document.getElementById('cobm-cc-lista');if(l)l.innerHTML='';
  poblarSelectZona('cobm-cc-zon');
  setTimeout(()=>{const q=document.getElementById('cobm-cc-q');if(q)q.focus();},100);
}

function cobmVolverAcciones(){
  document.getElementById('cobm-acciones').style.display='block';
  document.getElementById('cobm-panel-cc').style.display='none';
  document.getElementById('cobm-panel-miscobranzas').style.display='none';
}

// ── Cuenta corriente desde cobranza ─────────────────────────────────────
function buscarClienteCC(){
  const q=(document.getElementById('cobm-cc-q')?.value||'').toLowerCase().trim();
  const zonaFil=document.getElementById('cobm-cc-zon')?.value||'';
  const lista=document.getElementById('cobm-cc-lista');
  if(!lista)return;
  if(!q&&!zonaFil){lista.innerHTML='';return;}
  const res=_clientes.filter(c=>
    ((c.nombre||'').toLowerCase().includes(q)||(c.codigo||'').toString().includes(q))
    &&(!zonaFil||c.zona===zonaFil)
  ).slice(0,8);
  if(!res.length){lista.innerHTML='<div style="font-size:13px;color:var(--txt2);padding:8px 0">Sin resultados</div>';return;}
  lista.innerHTML=res.map(c=>`
    <div onclick="cobmIrCC(${c.id})"
      style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg2);border-radius:10px;margin-bottom:6px;cursor:pointer;border:1.5px solid var(--brd);-webkit-tap-highlight-color:transparent">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nombre)}</div>
        <div style="font-size:11px;color:var(--txt2);margin-top:2px">${esc(c.localidad||'')}</div>
      </div>
      ${c.saldo?`<div style="font-size:15px;font-weight:700;color:var(--D);flex-shrink:0;margin-left:10px">${fmt(c.saldo)}</div>`:'<div style="font-size:12px;color:var(--P);flex-shrink:0;margin-left:10px">✓ Al día</div>'}
    </div>`).join('');
}

function cobmIrCC(clienteId){
  const c=_clientes.find(x=>x.id===clienteId);
  if(!c)return;
  go('cuentas');
  setTimeout(()=>{
    const q=document.getElementById('cc-q');
    if(q){q.value=c.nombre;renderCC();}
  },200);
}

// ── Mis cobranzas ────────────────────────────────────────────────────────
let _cobmcPeriodo='mes';

let _cobmcZona='';

function cobmAbrirMisCobranzas(){
  document.getElementById('cobm-acciones').style.display='none';
  document.getElementById('cobm-panel-cc').style.display='none';
  document.getElementById('cobm-panel-miscobranzas').style.display='block';
  _cobmcZona='';
  cobmSetPeriodo('mes');
}

function cobmSetPeriodo(periodo){
  _cobmcPeriodo=periodo;
  // Mostrar/ocultar picker de fecha
  const fw=document.getElementById('cobmc-fecha-wrap');
  if(fw) fw.style.display=periodo==='dia'?'block':'none';
  if(periodo==='dia'){
    const fi=document.getElementById('cobmc-fecha-input');
    if(fi&&!fi.value) fi.value=hoyLocal();
  }
  cobmRenderMisCobranzas();
}

function cobmSetZonaMC(zona){
  _cobmcZona=zona;
  cobmRenderMisCobranzas();
}

function cobmRenderMisCobranzas(){
  // Actualizar tabs
  const tabs={sem:'semana',mes:'mes',dia:'dia'};
  const esActivo='flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--PD);background:var(--PD);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit';
  const esInactivo='flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--brd);background:var(--bg);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit';
  ['sem','mes','dia'].forEach(k=>{
    const t=document.getElementById('cobmc-tab-'+k);
    if(t) t.style.cssText=_cobmcPeriodo===tabs[k]?esActivo:esInactivo;
  });

  const ven=(usuarioActual?.nombre||'').toLowerCase();
  const venAlt=(usuarioActual?.vendedor||'').toLowerCase(); // campo vendedor como fallback
  const hoy=hoyLocal();
  let desde,hasta=hoy;
  if(_cobmcPeriodo==='semana'){
    const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7));
    desde=d.toISOString().split('T')[0];
  } else if(_cobmcPeriodo==='dia'){
    const fi=document.getElementById('cobmc-fecha-input');
    desde=fi?.value||hoy; hasta=desde;
  } else {
    desde=hoy.substring(0,7)+'-01';
  }

  // Cobros propios en período — coincide nombre o campo vendedor
  let misCobros=(_cobros||[]).filter(c=>{
    const cv=(c.vendedor||'').toLowerCase();
    const matches=cv===ven||(venAlt&&cv===venAlt);
    return matches&&c.fecha>=desde&&c.fecha<=hasta;
  });

  // Remitos propios en período (para total vendido)
  let misRemitos=(_remitos||[]).filter(r=>{
    const rv=(r.vendedor||'').toLowerCase();
    return (rv===ven||(venAlt&&rv===venAlt))&&r.fecha>=desde&&r.fecha<=hasta;
  });

  // Chips de zona a partir de los cobros del período
  const chips=document.getElementById('cobmc-zona-chips');
  if(chips){
    const zonasEnCobros=[...new Set(misCobros.map(c=>{
      const cli=_clientes.find(x=>x.id===c.cliente_id);
      return cli?.localidad||'';
    }).filter(Boolean))].sort();
    if(zonasEnCobros.length>1){
      const mkChip=(label,val)=>{
        const activo=_cobmcZona===val;
        return `<button onclick="cobmSetZonaMC('${val}')"
          style="padding:5px 12px;border-radius:20px;border:1.5px solid ${activo?'var(--PD)':'var(--brd)'};background:${activo?'var(--PD)':'var(--bg)'};color:${activo?'#fff':''};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;-webkit-tap-highlight-color:transparent">
          ${label}
        </button>`;
      };
      chips.innerHTML=mkChip('Todas','')+zonasEnCobros.map(z=>mkChip(z,z)).join('');
    } else {
      chips.innerHTML='';
      if(_cobmcZona) _cobmcZona='';
    }
  }

  // Filtrar por zona si hay una seleccionada
  if(_cobmcZona){
    misCobros=misCobros.filter(c=>{
      const cli=_clientes.find(x=>x.id===c.cliente_id);
      return (cli?.localidad||'')===_cobmcZona;
    });
    misRemitos=misRemitos.filter(r=>{
      const cli=_clientes.find(x=>x.id===r.cliente_id);
      return (cli?.localidad||'')===_cobmcZona;
    });
  }

  const totalVendido=misRemitos.reduce((s,r)=>s+(r.total||0),0);
  const totalCobrado=misCobros.reduce((s,c)=>s+(c.importe||0),0);

  // Comisión desde config de localStorage
  cargarComPersonas();
  const persona=_comPersonas.find(p=>(p.nombre||'').toLowerCase()===ven);
  const pctV=persona?.pct_ventas??2;
  const pctC=persona?.pct_cobranza??1;
  const comision=totalVendido*(pctV/100)+totalCobrado*(pctC/100);

  // Resumen cards
  const res=document.getElementById('cobm-mc-resumen');
  if(res) res.innerHTML=`
    <div style="flex:1;min-width:110px;background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:center">
      <div style="font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">Vendido</div>
      <div style="font-size:18px;font-weight:700;color:var(--PD);margin-top:4px">${fmt(totalVendido)}</div>
    </div>
    <div style="flex:1;min-width:110px;background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:center">
      <div style="font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">Cobrado</div>
      <div style="font-size:18px;font-weight:700;color:var(--P);margin-top:4px">${fmt(totalCobrado)}</div>
    </div>
    <div style="flex:1;min-width:110px;background:#7c3aed;border-radius:12px;padding:12px;box-shadow:0 2px 8px rgba(124,58,237,.2);text-align:center">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px">Comisión</div>
      <div style="font-size:18px;font-weight:700;color:#fff;margin-top:4px">${fmt(comision)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">${pctV}%v+${pctC}%c</div>
    </div>`;

  // Lista agrupada por día
  const porFecha={};
  misCobros.forEach(c=>{
    if(!porFecha[c.fecha])porFecha[c.fecha]=[];
    porFecha[c.fecha].push(c);
  });
  const fechas=Object.keys(porFecha).sort().reverse();
  const lista=document.getElementById('cobm-mc-lista');
  if(!lista)return;
  if(!fechas.length){
    lista.innerHTML='<div style="font-size:13px;color:var(--txt2);padding:8px 0;text-align:center">Sin cobros en el período</div>';
    return;
  }
  const diaLabel=f=>{
    const d=new Date(f+'T12:00:00');
    return d.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
  };
  const formaIcon=f=>({efectivo:'💵',transferencia:'🏦',transf:'🏦',cheque:'📋'}[f]||'💰');
  lista.innerHTML=fechas.map(f=>{
    const cobsDia=porFecha[f];
    const subtotal=cobsDia.reduce((s,c)=>s+(c.importe||0),0);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:0 2px">
        <div style="font-size:12px;font-weight:700;color:var(--txt2)">${diaLabel(f)}</div>
        <div style="font-size:14px;font-weight:700;color:var(--P)">${fmt(subtotal)}</div>
      </div>
      ${cobsDia.map(c=>{
        const cli=_clientes.find(x=>x.id===c.cliente_id);
        const zona=cli?.localidad?`<span style="font-size:10px;background:var(--bg2);border-radius:4px;padding:1px 5px;margin-left:4px">${esc(cli.localidad)}</span>`:'';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fff;border-radius:10px;margin-bottom:5px;border:1px solid var(--brd)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.cliente||'?')}${zona}</div>
            <div style="font-size:11px;color:var(--txt2)">${formaIcon(c.forma)} ${c.forma||''}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--PD);flex-shrink:0;margin-left:10px">${fmt(c.importe)}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function limpiarCobMovil(){
  _cobMovilCliId=null;
  _cobMovilForma=null;
  
  cerrarDropdownCobMovil();
  
  const qEl=document.getElementById('cobm-cli-q');
  if(qEl) qEl.value='';
  
  const codEl=document.getElementById('cobm-cli-cod');
  if(codEl){ codEl.value=''; codEl.style.borderColor=''; }
  
  const nEl=document.getElementById('cobm-cli-nombre');
  if(nEl) nEl.textContent='Seleccioná un cliente';
  
  const sEl=document.getElementById('cobm-cli-saldo');
  if(sEl) sEl.textContent='';
  
  const bcc=document.getElementById('cobm-btn-cc');
  if(bcc) bcc.style.display='none';
  
  const pc=document.getElementById('cobm-paso-cliente');
  if(pc) pc.style.display='block';
  
  const pp=document.getElementById('cobm-paso-cobro');
  if(pp) pp.style.display='none';
  
  poblarSelectZona('cobm-cli-zon');
  
  const imp=document.getElementById('cobm-importe');
  if(imp) imp.value='';
  
  const obs=document.getElementById('cobm-obs');
  if(obs) obs.value='';
  
  const fw=document.getElementById('cobm-facturas-wrap');
  if(fw) fw.style.display='none';
  
  const rw=document.getElementById('cobm-resto-wrap');
  if(rw) rw.style.display='none';
  
  const cw=document.getElementById('cobm-comp-wrap');
  if(cw) cw.style.display='none';
  
  clearComprobanteMov();
  
  const tn=document.getElementById('cobm-transf-nombre');
  if(tn) tn.value='';
  
  const chw=document.getElementById('cobm-cheque-wrap');
  if(chw) chw.style.display='none';
  
  const nc=document.getElementById('cobm-nrocheque');
  if(nc) nc.value='';
  
  ['cobm-btn-ef','cobm-btn-tr','cobm-btn-ch'].forEach(id=>{
    const b=document.getElementById(id);
    if(b){ b.style.background='#fff'; b.style.borderColor='var(--brd)'; b.style.color=''; }
  });
  
  // Volver a pantalla principal de cobranza
  const acc=document.getElementById('cobm-acciones');
  if(acc) acc.style.display='block';
  
  const pcc=document.getElementById('cobm-panel-cc');
  if(pcc) pcc.style.display='none';
  
  const pmc=document.getElementById('cobm-panel-miscobranzas');
  if(pmc) pmc.style.display='none';
  
  setTimeout(()=>document.getElementById('cobm-cli-q')?.focus(),100);

  const clientesRuta = document.getElementById('cobm-clientes-ruta-hoy');
  if (clientesRuta) {
    clientesRuta.innerHTML = '';
    clientesRuta.style.display = 'none';
  }

  // Ocultar el footer flotante
  const footer = document.getElementById('cobm-fixed-footer');
  if (footer) footer.style.display = 'none';
}

function _cobmCliPool(){
  if(!_hrClientesHoy||!_hrClientesHoy.length){
    // Sin ruta: usar todos los clientes (vendedores) o todos (repartidores sin ruta)
    if(usuarioActual?.rol==='repartidor'&&usuarioActual?.vendedor){
      const v=(usuarioActual.vendedor||'').toLowerCase();
      const porVendedor=_clientes.filter(c=>(c.vendedor||'').toLowerCase()===v);
      return porVendedor.length?porVendedor:_clientes;
    }
    const v=usuarioActual?.vendedor||usuarioActual?.nombre||'';
    if(!v)return _clientes;
    const filtrado=_clientes.filter(c=>(c.vendedor||'').toLowerCase()===v.toLowerCase());
    return filtrado.length?filtrado:_clientes;
  }
  // Con ruta: solo los clientes de la hoja del día
  const rutaSet=new Set(_hrClientesHoy);
  return _clientes.filter(c=>rutaSet.has(c.id));
}

// ─── COBRANZA MÓVIL ──────

// Variables globales para el buscador de zonas
let _cobZonaInput = '';
let _cobZonasCache = [];

// Inicializar buscador de zonas
function initBuscadorZonasCob() {
  const input = document.getElementById('cobm-zona-input');
  if (!input) return;
  
  // Cargar zonas únicas de los clientes
  const zonasUnicas = [...new Set(_clientes.map(c => c.zona).filter(Boolean))];
  _cobZonasCache = zonasUnicas.map(z => {
    const zonaObj = _zonas.find(zn => zn.codigo === z);
    return {
      codigo: z,
      descripcion: zonaObj?.descripcion || z,
      clientes: _clientes.filter(c => c.zona === z)
    };
  }).sort((a,b) => a.descripcion.localeCompare(b.descripcion));
  
  // Eventos del input
  input.addEventListener('input', function() {
    _cobZonaInput = this.value.trim();
    mostrarSugerenciasZonas();
  });
  
  input.addEventListener('focus', function() {
    if (this.value.trim() || _cobZonaInput) {
      mostrarSugerenciasZonas();
    }
  });
  
  input.addEventListener('blur', function() {
    setTimeout(() => {
      document.getElementById('cobm-zona-sugerencias').style.display = 'none';
    }, 200);
  });
  
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const sugerencias = document.getElementById('cobm-zona-sugerencias');
      const items = sugerencias.querySelectorAll('.zona-sug-item');
      if (items.length === 1) {
        items[0].click();
      } else if (items.length > 1) {
        // Seleccionar la primera
        items[0].click();
      }
    }
    if (e.key === 'Escape') {
      document.getElementById('cobm-zona-sugerencias').style.display = 'none';
    }
  });
}

function mostrarSugerenciasZonas() {
  const input = document.getElementById('cobm-zona-input');
  const contenedor = document.getElementById('cobm-zona-sugerencias');
  const termino = _cobZonaInput.toLowerCase();
  
  if (!termino || termino.length < 1) {
    contenedor.style.display = 'none';
    return;
  }
  
  // Buscar zonas que coincidan
  const coincidencias = _cobZonasCache.filter(z => 
    z.descripcion.toLowerCase().includes(termino) || 
    z.codigo.toLowerCase().includes(termino)
  );
  
  if (!coincidencias.length) {
    contenedor.innerHTML = `
      <div style="padding:12px 14px;color:var(--txt2);font-size:13px;text-align:center;">
        ❌ No se encontraron zonas con "${termino}"
      </div>
    `;
    contenedor.style.display = 'block';
    return;
  }
  
  // Mostrar hasta 8 zonas
  const mostrar = coincidencias.slice(0, 8);
  contenedor.innerHTML = mostrar.map(z => `
    <div class="zona-sug-item" 
         onclick="seleccionarZonaCob('${z.codigo}')"
         style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background 0.15s;"
         onmouseover="this.style.background='var(--bg2)'" 
         onmouseout="this.style.background='transparent'">
      <div>
        <div style="font-weight:600;font-size:14px;">${esc(z.descripcion)}</div>
        <div style="font-size:11px;color:var(--txt2);">${z.codigo} · ${z.clientes.length} cliente${z.clientes.length !== 1 ? 's' : ''}</div>
      </div>
      <div style="font-size:12px;color:var(--P);background:var(--PL);padding:2px 10px;border-radius:12px;">
        ${z.clientes.filter(c => (c.saldo||0) > 0).length} con deuda
      </div>
    </div>
  `).join('');
  
  contenedor.style.display = 'block';
}


function seleccionarZonaCob(codigoZona) {
  const input = document.getElementById('cobm-zona-input');
  const contenedor = document.getElementById('cobm-zona-sugerencias');
  
  // Mostrar la zona seleccionada
  const zona = _cobZonasCache.find(z => z.codigo === codigoZona);
  if (zona) {
    input.value = `${zona.descripcion} (${zona.codigo})`;
  }
  
  // Ocultar sugerencias
  contenedor.style.display = 'none';
  
  // Filtrar clientes por esta zona y mostrarlos como cards
  mostrarClientesPorZona(codigoZona);
}

function mostrarClientesPorZona(codigoZona) {
  const contenedor = document.getElementById('cobm-clientes-por-zona');
  if (!contenedor) return;
  
  const clientes = _clientes.filter(c => c.zona === codigoZona && c.activo !== false);
  
  if (!clientes.length) {
    contenedor.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--txt2);font-size:14px;">
        No hay clientes en esta zona
      </div>
    `;
    contenedor.style.display = 'block';
    return;
  }
  
  // Ordenar por nombre
  clientes.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));
  
  // Mostrar como tarjetas
  contenedor.innerHTML = clientes.map(c => `
    <div onclick="selClienteCobMovil(${c.id})"
      style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#fff;border-radius:10px;margin-bottom:6px;border:1.5px solid var(--brd);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all 0.15s;"
      onmouseover="this.style.borderColor='var(--P)';this.style.background='var(--bg2)'" 
      onmouseout="this.style.borderColor='var(--brd)';this.style.background='#fff'">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nombre)}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:2px">${esc(c.localidad||'')} ${c.codigo ? '· #' + c.codigo : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div style="font-size:16px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo||0)}</div>
        <div style="font-size:10px;color:var(--txt2);">
          ${c.ultimo_remito ? (Math.floor((new Date() - new Date(c.ultimo_remito)) / 864e5)) + 'd' : '—'}
        </div>
      </div>
    </div>
  `).join('');
  
  // Ocultar el paso de cliente (el input de zona) y mostrar los clientes
  const pasoCliente = document.getElementById('cobm-paso-cliente');
  if (pasoCliente) pasoCliente.style.display = 'none';
  
  contenedor.style.display = 'block';
}

function limpiarBuscadorZonas() {
  const input = document.getElementById('cobm-zona-input');
  if (input) input.value = '';
  
  const sugerencias = document.getElementById('cobm-zona-sugerencias');
  if (sugerencias) sugerencias.style.display = 'none';
  
  const clientesPorZona = document.getElementById('cobm-clientes-por-zona');
  if (clientesPorZona) {
    clientesPorZona.innerHTML = '';
    clientesPorZona.style.display = 'none';
  }
  
  const pasoCliente = document.getElementById('cobm-paso-cliente');
  if (pasoCliente) pasoCliente.style.display = 'block';
  
  _cobZonaInput = '';
}

function buscarClienteCobMovil(){
  const q=(document.getElementById('cobm-cli-q').value||'').toLowerCase().trim();
  const zonaFil=document.getElementById('cobm-cli-zon')?.value||'';
  const lista=document.getElementById('cobm-cli-lista');
  if(!lista) return;
  
  // Si no hay búsqueda ni zona, ocultar
  if(q.length<1 && !zonaFil){
    lista.style.display='none';
    lista.innerHTML='';
    return;
  }
  
  const pool=_cobmCliPool();
  const m=pool.filter(c=>{
    const matchNombre=(c.nombre||'').toLowerCase().includes(q);
    const matchCodigo=String(c.codigo||c.id).includes(q);
    const matchZona=!zonaFil || c.zona===zonaFil;
    return (matchNombre || matchCodigo) && matchZona;
  }).slice(0,12); // Limitar a 12 resultados para no saturar
  
  if(!m.length){
    lista.style.display='block';
    lista.innerHTML='<div style="padding:14px;font-size:14px;color:var(--txt2);text-align:center">❌ Sin resultados</div>';
    posicionarDropdownCobMovil();
    return;
  }
  
  lista.style.display='block';
  lista.innerHTML=m.map(c=>`
    <div onclick="selClienteCobMovil(${c.id})"
      style="display:flex;justify-content:space-between;align-items:center;min-height:56px;padding:10px 14px;border-bottom:1px solid var(--brd);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background 0.15s;"
      onmouseover="this.style.background='var(--bg2)'" 
      onmouseout="this.style.background='transparent'">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nombre)}</div>
        <div style="font-size:12px;color:var(--txt2);margin-top:2px">${esc(c.localidad||'')}${c.codigo?' · #'+c.codigo:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div style="font-size:16px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo||0)}</div>
      </div>
    </div>
  `).join('');
  
  posicionarDropdownCobMovil();
}

//Posicionamiento inteligente del dropdown
function posicionarDropdownCobMovil() {
  const input = document.getElementById('cobm-cli-q');
  const lista = document.getElementById('cobm-cli-lista');
  if (!input || !lista || lista.style.display === 'none') return;
  
  requestAnimationFrame(() => {
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    const espacioAbajo = viewportHeight - rect.bottom - 10;
    const espacioArriba = rect.top - 10;
    const usarArriba = espacioAbajo < 180 && espacioArriba > espacioAbajo;
    const espacioDisponible = usarArriba ? espacioArriba : espacioAbajo;
    let alturaMax = Math.min(300, Math.max(80, espacioDisponible - 20));
    
    let topPos, bottomPos;
    if (usarArriba) {
      topPos = 'auto';
      bottomPos = (viewportHeight - rect.top + 8) + 'px';
    } else {
      topPos = (rect.bottom + 6) + 'px';
      bottomPos = 'auto';
    }
    
    lista.style.position = 'fixed';
    lista.style.top = topPos;
    lista.style.bottom = bottomPos;
    lista.style.left = Math.max(10, rect.left) + 'px';
    lista.style.width = Math.min(rect.width, viewportWidth - 20) + 'px';
    lista.style.maxHeight = alturaMax + 'px';
    lista.style.overflowY = 'auto';
    lista.style.overflowX = 'hidden';
    lista.style.zIndex = '99999';
    lista.style.background = '#fff';
    lista.style.border = '2px solid var(--P)';
    lista.style.borderRadius = '12px';
    lista.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
    lista.style.display = 'block';
    lista.style.padding = '4px 0';
    lista.style.WebkitOverflowScrolling = 'touch';
    
    const dropRect = lista.getBoundingClientRect();
    if (dropRect.right > viewportWidth - 8) {
      lista.style.left = Math.max(8, viewportWidth - dropRect.width - 8) + 'px';
    }
    if (dropRect.left < 8) {
      lista.style.left = '8px';
    }
    
    if (dropRect.height > viewportHeight * 0.7) {
      lista.style.maxHeight = Math.floor(viewportHeight * 0.6) + 'px';
    }
  });
}

// Buscar por código (con posicionamiento mejorado)
function cobmBuscarPorCod(){
  const cod=(document.getElementById('cobm-cli-cod')?.value||'').trim();
  const lista=document.getElementById('cobm-cli-lista');
  if(!cod){
    lista.style.display='none';
    lista.innerHTML='';
    return;
  }
  
  const pool=_cobmCliPool();
  const m=pool.filter(c=>String(c.codigo||c.id)===cod).slice(0,10);
  
  if(!m.length){
    lista.style.display='block';
    lista.innerHTML='<div style="padding:14px;text-align:center;color:var(--txt2)">❌ Cliente no encontrado</div>';
    posicionarDropdownCobMovil();
    return;
  }
  
  lista.style.display='block';
  lista.innerHTML=m.map(c=>`
    <div onclick="selClienteCobMovil(${c.id})"
      style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--brd);cursor:pointer;-webkit-tap-highlight-color:transparent"
      onmouseover="this.style.background='var(--bg2)'" 
      onmouseout="this.style.background='transparent'">
      <div>
        <div style="font-size:16px;font-weight:700">${esc(c.nombre)}</div>
        <div style="font-size:12px;color:var(--txt2)">${esc(c.localidad||'')}</div>
      </div>
      <div style="font-size:16px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo||0)}</div>
    </div>
  `).join('');
  
  posicionarDropdownCobMovil();
}

//Cerrar dropdown al hacer scroll o tocar fuera
function cerrarDropdownCobMovil() {
  const lista = document.getElementById('cobm-cli-lista');
  if (lista) {
    lista.style.display = 'none';
    lista.innerHTML = '';
  }
}

//Inicializar los event listeners para cerrar el dropdown
function initDropdownCobMovil() {
  // Cerrar al hacer scroll (con debounce para no cerrar mientras se escribe)
  let scrollTimeout;
  document.addEventListener('scroll', function() {
    const lista = document.getElementById('cobm-cli-lista');
    if (lista && lista.style.display === 'block') {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        cerrarDropdownCobMovil();
      }, 150);
    }
  }, { passive: true });
  
  // Cerrar al tocar fuera del dropdown y del input
  document.addEventListener('touchstart', function(e) {
    const lista = document.getElementById('cobm-cli-lista');
    const input = document.getElementById('cobm-cli-q');
    const codInput = document.getElementById('cobm-cli-cod');
    if (lista && lista.style.display === 'block') {
      const target = e.target;
      if (!lista.contains(target) && target !== input && target !== codInput) {
        cerrarDropdownCobMovil();
      }
    }
  }, { passive: true });
  
  // Cerrar al hacer clic fuera
  document.addEventListener('click', function(e) {
    const lista = document.getElementById('cobm-cli-lista');
    const input = document.getElementById('cobm-cli-q');
    const codInput = document.getElementById('cobm-cli-cod');
    if (lista && lista.style.display === 'block') {
      if (!lista.contains(e.target) && e.target !== input && e.target !== codInput) {
        cerrarDropdownCobMovil();
      }
    }
  });
  
  // Re-posicionar al rotar o redimensionar
  let resizeTimeout;
  window.addEventListener('resize', function() {
    const lista = document.getElementById('cobm-cli-lista');
    if (lista && lista.style.display === 'block') {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        posicionarDropdownCobMovil();
      }, 100);
    }
  }, { passive: true });
  
  // Re-posicionar al abrir el teclado en móvil
  window.addEventListener('focusin', function(e) {
    const lista = document.getElementById('cobm-cli-lista');
    if (lista && lista.style.display === 'block' && 
        (e.target === document.getElementById('cobm-cli-q') || 
         e.target === document.getElementById('cobm-cli-cod'))) {
      setTimeout(posicionarDropdownCobMovil, 300);
    }
  });
}


function cobmConfirmarCod(){
  const cod=(document.getElementById('cobm-cli-cod')?.value||'').trim();
  if(!cod)return;
  const pool=_cobmCliPool();
  const c=pool.find(x=>String(x.codigo||x.id)===cod);
  if(c){selClienteCobMovil(c.id);}
  else{const el=document.getElementById('cobm-cli-cod');if(el)el.style.borderColor='var(--D)';}
}

function selClienteCobMovil(id){
  const c=_clientes.find(x=>x.id===id);
  if(!c) return;
  
  _cobMovilCliId=id;
  const qEl=document.getElementById('cobm-cli-q');
  if(qEl) qEl.value=c.nombre;
  
  const codEl=document.getElementById('cobm-cli-cod');
  if(codEl) codEl.value=c.codigo||c.id||'';
  
  const nEl=document.getElementById('cobm-cli-nombre');
  if(nEl) nEl.textContent=`[${c.codigo||c.id}] ${esc(c.nombre.toUpperCase())}`;
  
  const sEl=document.getElementById('cobm-cli-saldo');
  if(sEl) sEl.textContent=`Saldo: ${fmt(c.saldo||0)}`;
  
  // Cerrar dropdown
  cerrarDropdownCobMovil();
  
  // Mostrar paso de cobro
  const pc=document.getElementById('cobm-paso-cliente');
  if(pc) pc.style.display='none';
  
  const pcc=document.getElementById('cobm-panel-cc');
  if(pcc) pcc.style.display='none';
  
  const pmc=document.getElementById('cobm-panel-miscobranzas');
  if(pmc) pmc.style.display='none';
  
  const pa=document.getElementById('cobm-acciones');
  if(pa) pa.style.display='none';
  
  const bcc=document.getElementById('cobm-btn-cc');
  if(bcc) bcc.style.display='block';
  
  const pp=document.getElementById('cobm-paso-cobro');
  if(pp) pp.style.display='block';
  
  // Cargar facturas pendientes
  const remsPend=_remitos.filter(r=>String(r.cliente_id)===String(id)&&!r.cobrado).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const wrap=document.getElementById('cobm-facturas-wrap');
  const lista=document.getElementById('cobm-facturas');
  if(remsPend.length && wrap && lista){
    wrap.style.display='block';
    lista.innerHTML=remsPend.map(r=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--brd)">
        <div style="flex:1;cursor:pointer" onclick="verRemitoEnCobro(${r.id})">
          <div style="font-size:14px;font-weight:600;text-decoration:underline;color:var(--P)">R-${String(r.id).padStart(4,'0')}</div>
          <div style="font-size:11px;color:var(--txt2)">${r.fecha} · Saldo: ${fmt(r.saldo_pendiente||r.total)}</div>
        </div>
        <input type="number" id="cobm-imp-${r.id}" value="0" min="0" step="0.01"
          style="width:120px;padding:8px;border:2px solid var(--brd);border-radius:8px;font-size:16px;font-weight:700;text-align:right"
          oninput="calcCobMovil()" onfocus="this.select()" ondblclick="cobmImputarTodo(${r.id},${r.saldo_pendiente||r.total})"
          onkeydown="if(event.key==='Home'){event.preventDefault();verRemitoEnCobro(${r.id})}"
          title="Doble toque = todo · Inicio = ver factura">
      </div>
    `).join('');
  } else if(wrap) {
    wrap.style.display='none';
  }
  
  setTimeout(()=>document.getElementById('cobm-importe')?.focus(),100);

  // Mostrar el footer flotante cuando se muestra el paso de cobro
  const footer = document.getElementById('cobm-fixed-footer');
  if (footer) footer.style.display = 'block';
}

// Ver la cuenta corriente del cliente que se está cobrando, sin perder
// lo que ya se cargó en el formulario (se abre en el modal de siempre).
function cobmVerCCActual(){
  if(!_cobMovilCliId){toast('Seleccioná un cliente primero','warn');return;}
  histCliente(_cobMovilCliId);
}

function cobmImputarTodo(remId,monto){const inp=document.getElementById('cobm-imp-'+remId);if(inp){inp.value=monto;calcCobMovil();}}

function selFormaCobMovil(forma){
  _cobMovilForma=forma;
  ['cobm-btn-ef','cobm-btn-tr','cobm-btn-ch'].forEach(id=>{const b=document.getElementById(id);if(b){b.style.background='#fff';b.style.borderColor='var(--brd)';b.style.color='';}});
  const keys={efectivo:'cobm-btn-ef',transferencia:'cobm-btn-tr',cheque:'cobm-btn-ch'};
  const cols={efectivo:'var(--P)',transferencia:'var(--A)',cheque:'var(--W)'};
  const btn=document.getElementById(keys[forma]);
  const col=cols[forma]||'var(--P)';
  if(btn){btn.style.background=col;btn.style.borderColor=col;btn.style.color='#fff';}
  const cw=document.getElementById('cobm-comp-wrap');
  if(cw)cw.style.display=forma==='transferencia'?'block':'none';
  if(forma!=='transferencia')clearComprobanteMov();
  const chw=document.getElementById('cobm-cheque-wrap');
  if(chw)chw.style.display=forma==='cheque'?'block':'none';
  if(forma!=='cheque'){const nc=document.getElementById('cobm-nrocheque');if(nc)nc.value='';}
}

function calcCobMovil(){
  const importe=parseFloat(document.getElementById('cobm-importe')?.value)||0;
  const inputs=document.querySelectorAll('[id^="cobm-imp-"]');
  let totalImp=0;inputs.forEach(i=>totalImp+=parseFloat(i.value)||0);
  const resto=Math.round((importe-totalImp)*100)/100;
  const wrap=document.getElementById('cobm-resto-wrap');
  const restoEl=document.getElementById('cobm-resto');
  if(wrap&&restoEl){
    if(resto>0&&importe>0){wrap.style.display='block';restoEl.textContent=fmt(resto);}
    else wrap.style.display='none';
  }
}

async function guardarCobMovil(){
  const btn=document.getElementById('cobm-btn-guardar');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  const reactivar=()=>{if(btn){btn.disabled=false;btn.textContent='✓ Confirmar cobro';}};

  if(!_cobMovilCliId){alert('Seleccioná un cliente');reactivar();return;}
  if(!_cobMovilForma){alert('Elegí la forma de cobro');reactivar();return;}
  const importe=parseFloat(document.getElementById('cobm-importe')?.value)||0;
  if(importe<=0){alert('Ingresá el importe');reactivar();return;}
  const c=_clientes.find(x=>x.id===_cobMovilCliId);
  const inputs=document.querySelectorAll('[id^="cobm-imp-"]');
  const imputaciones=[];let totalImp=0;
  for(const inp of inputs){const remId=parseInt(inp.id.replace('cobm-imp-',''));const monto=parseFloat(inp.value)||0;if(monto>0){imputaciones.push({remito_id:remId,monto});totalImp+=monto;}}
  const resto=Math.round((importe-totalImp)*100)/100;

  let comprobante_url='';
  if(_cobMovilForma==='transferencia'){
    const nombreTransf=(document.getElementById('cobm-transf-nombre')?.value||'').trim();
    if(!nombreTransf){alert('Ingresá el nombre del cliente que transfirió');reactivar();return;}
    const compFile=document.getElementById('cobm-comprobante')?.files?.[0];
    if(compFile) comprobante_url=await _subirComprobante(compFile, _cobMovilCliId);
  }

  // Cheque: el número es lo único imprescindible para identificarlo después.
  let nroCheque='';
  if(_cobMovilForma==='cheque'){
    nroCheque=(document.getElementById('cobm-nrocheque')?.value||'').trim();
    if(!nroCheque){alert('Ingresá el número del cheque');reactivar();return;}
  }

  const nombreTransf=_cobMovilForma==='transferencia'?(document.getElementById('cobm-transf-nombre')?.value||'').trim():'';
  const {data:cobNuevo,error:cobErr}=await sb.from('cobros').insert({
    nro_cheque:nroCheque||null,
    cliente_id:_cobMovilCliId,cliente:c?.nombre||'?',
    fecha:hoyLocal(),
    forma:_cobMovilForma,importe,
    efectivo:_cobMovilForma==='efectivo'?importe:0,
    transferencia:_cobMovilForma==='transferencia'?importe:0,
    cheque_terceros:_cobMovilForma==='cheque'?importe:0,
    estado_rendicion:'pendiente',
    vendedor:usuarioActual?.nombre||'',
    reparto:_cargaActivaHoy?(_cargaActivaHoy.nombre||('Reparto #'+_cargaActivaHoy.id)):'',
    carga_id:_cargaActivaHoy?.id||null,
    observaciones:document.getElementById('cobm-obs')?.value||'',
    imputaciones,saldo_favor:resto>0?resto:0,
    comprobante_url,
    nombre_transferencia:nombreTransf||null
  }).select().single();
  if(cobErr){alert('Error al guardar cobro: '+cobErr.message);reactivar();return;}

  // ⚠️ El saldo del cliente y remitos NO se toca aquí.
  // Se aplica recién cuando un admin valida el cobro (validarCobro).
  // Si el cobro vino de una carga (no de una hoja de ruta armada a mano),
  // generar esa hoja de ruta ahora para que en Rendición no quede huérfano
  // en "Cobros sin hoja de ruta".
  if(_cargaActivaHoy){await _asegurarHojaRutaParaCobro(_cobMovilCliId,hoyLocal(),usuarioActual?.nombre||'');}
  await Promise.all([cargarCobros(),cargarRemitos(),hrMarcarVisitadoPorCliente(_cobMovilCliId)]);
  renderDash();
  mostrarConfirmacionMovil('cobro', c?.nombre, fmt(importe)+(resto>0?' · Resto a favor: '+fmt(resto):'') + ' — pendiente de validación', cobNuevo?.id);
  limpiarCobMovil();
  reactivar();
}

function _renderComisionCard(){
  const card=document.getElementById('vh-comision-card');
  if(!card)return;
  const ven=(usuarioActual?.nombre||'').toLowerCase();
  const hoy=hoyLocal();
  const iniMes=hoy.substring(0,7)+'-01';
  const misCobros=(_cobros||[]).filter(c=>{
    return (c.vendedor||'').toLowerCase()===ven&&c.fecha>=iniMes&&c.fecha<=hoy;
  });
  const misRemitos=(_remitos||[]).filter(r=>{
    return (r.vendedor||'').toLowerCase()===ven&&r.fecha>=iniMes&&r.fecha<=hoy;
  });
  const totalV=misRemitos.reduce((s,r)=>s+(r.total||0),0);
  const totalC=misCobros.reduce((s,c)=>s+(c.importe||0),0);
  cargarComPersonas();
  const persona=_comPersonas.find(p=>(p.nombre||'').toLowerCase()===ven);
  const pctV=persona?.pct_ventas??2;
  const pctC=persona?.pct_cobranza??1;
  const comision=totalV*(pctV/100)+totalC*(pctC/100);
  const mesLabel=new Date(hoy+'T12:00').toLocaleDateString('es-AR',{month:'long'}).toUpperCase();
  card.innerHTML=`
    <div onclick="go('cobranza');setTimeout(()=>document.getElementById('cobmc-tab-mes')?.click(),300)"
      style="background:linear-gradient(135deg,#7c3aed,#5b21b6);border-radius:20px;padding:16px 18px;box-shadow:0 3px 16px rgba(124,58,237,.25);cursor:pointer;-webkit-tap-highlight-color:transparent">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px">Comisión ${mesLabel}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.5)">${pctV}% v + ${pctC}% c →</div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1;background:rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;text-align:center">
          <div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px">Vendido</div>
          <div style="font-size:16px;font-weight:700;color:#fff">${fmt(totalV)}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;text-align:center">
          <div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px">Cobrado</div>
          <div style="font-size:16px;font-weight:700;color:#fff">${fmt(totalC)}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.2);border-radius:12px;padding:10px 12px;text-align:center;border:1.5px solid rgba(255,255,255,.3)">
          <div style="font-size:10px;color:rgba(255,255,255,.75);margin-bottom:3px">Comisión</div>
          <div style="font-size:16px;font-weight:700;color:#fff">${fmt(comision)}</div>
        </div>
      </div>
    </div>`;
}

// ─── MOSTRAR CLIENTES DE LA RUTA DEL DÍA EN COBRANZA ─────────────────────

async function mostrarClientesDeRutaHoy() {
  console.log('🔍 mostrarClientesDeRutaHoy() - INICIO');
  
  const contenedor = document.getElementById('cobm-clientes-ruta-hoy');
  if (!contenedor) {
    console.warn('❌ Contenedor cobm-clientes-ruta-hoy NO ENCONTRADO');
    return;
  }
  
  console.log('✅ Contenedor encontrado:', contenedor);
  console.log('📊 _hrClientesHoy:', _hrClientesHoy);
  console.log('📊 _clientes.length:', _clientes.length);
  
  // Verificar si hay clientes en la ruta de hoy
  if (!_hrClientesHoy || !_hrClientesHoy.length) {
    console.log('⚠️ No hay clientes en la ruta de hoy');
    contenedor.innerHTML = '';
    contenedor.style.display = 'none';
    return;
  }
  
  // SI EL CLIENTE NO ESTÁ EN _clientes, CARGARLO DESDE SUPABASE
  let clientesRuta = _clientes.filter(c => _hrClientesHoy.includes(c.id) && c.activo !== false);
  
  if (!clientesRuta.length) {
    console.log('⚠️ Clientes no encontrados en _clientes, buscando en Supabase...');
    
    // Buscar los clientes faltantes directamente
    for (const id of _hrClientesHoy) {
      const { data, error } = await sb.from('clientes').select('*').eq('id', id).single();
      if (data && !error) {
        console.log('✅ Cliente encontrado en Supabase:', data.nombre);
        // Agregar al array de clientes global
        _clientes.push(data);
        clientesRuta.push(data);
      } else {
        console.warn('❌ Cliente ID', id, 'no encontrado en Supabase');
      }
    }
  }
  
  console.log('👥 clientesRuta encontrados:', clientesRuta.length);
  
  if (!clientesRuta.length) {
    console.log('⚠️ No se encontraron clientes');
    contenedor.innerHTML = `
      <div style="padding:12px;text-align:center;color:var(--txt2);font-size:13px;background:var(--bg2);border-radius:8px;margin-top:4px;">
        ⚠️ El cliente de tu ruta no se encuentra en la base de datos.
      </div>
    `;
    contenedor.style.display = 'block';
    return;
  }
  
  console.log('✅ Clientes encontrados, mostrando...');
  
  // Ordenar por nombre
  clientesRuta.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));
  
  // Mostrar los clientes como tarjetas
  contenedor.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 8px 0;padding-top:8px;border-top:1.5px solid var(--brd);">
      📋 Clientes de tu ruta de hoy (${clientesRuta.length})
    </div>
    ${clientesRuta.map(c => `
      <div onclick="selClienteCobMovil(${c.id})"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--PL);border-radius:10px;margin-bottom:6px;border:1.5px solid var(--P);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all 0.15s;"
        onmouseover="this.style.borderColor='var(--PD)';this.style.background='#d4f0e0'" 
        onmouseout="this.style.borderColor='var(--P)';this.style.background='var(--PL)'">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nombre)}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:2px">${esc(c.localidad||'')} ${c.codigo ? '· #' + c.codigo : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:10px">
          <div style="font-size:16px;font-weight:700;color:${(c.saldo||0)>0?'var(--D)':'var(--P)'}">${fmt(c.saldo||0)}</div>
          <div style="font-size:10px;color:var(--P);font-weight:600;">💰 Cobrar →</div>
        </div>
      </div>
    `).join('')}
  `;
  
  contenedor.style.display = 'block';
  console.log('✅ Clientes mostrados correctamente');
}

// ─── TESORERÍA ───────────────────────────────────────────────
let _pagosProv=[];

let _movBanc=[];

let _tesoTabActual='cobros';

let _cajaPer='mes';

const _tesoPg={cobros:1,pagos:1};

async function cargarPagosProv(){
  const {data,error}=await sb.from('pagos_proveedores').select('*').order('fecha',{ascending:false});
  if(error&&error.code==='42P01'){
    toast('Tabla pagos_proveedores no existe. Crear en Supabase con el SQL del panel.','err',6000);
    _pagosProv=[];return;
  }
  _pagosProv=data||[];
}

async function cargarMovBanc(){
  const {data,error}=await sb.from('movimientos_bancarios').select('*').order('fecha',{ascending:false});
  if(error&&error.code==='42P01'){
    toast('Tabla movimientos_bancarios no existe. Crear en Supabase con el SQL del panel.','err',6000);
    _movBanc=[];return;
  }
  _movBanc=data||[];
}

async function initTesoreria(){
  if(!_pagosProv.length)await cargarPagosProv();
  if(!_movBanc.length)await cargarMovBanc();
  // Poblar select de proveedores
  const sel=document.getElementById('pag-prov');
  if(sel&&_proveedores.length){
    const cur=sel.value;
    sel.innerHTML='<option value="">Seleccionar...</option>'+
      _proveedores.map(p=>`<option value="${p.id}">${p.cuit?p.cuit+' — ':''}${esc(p.nombre)}</option>`).join('');
    if(cur)sel.value=cur;
  }
  // Defaults de fecha
  const hoy=hoyLocal();
  const pagF=document.getElementById('pag-fecha');if(pagF&&!pagF.value)pagF.value=hoy;
  const concF=document.getElementById('conc-fecha');if(concF&&!concF.value)concF.value=hoy;
  // Default para rango de cobros: mes actual
  const tcoFd=document.getElementById('tco-fd');const tcoFh=document.getElementById('tco-fh');
  if(tcoFh&&!tcoFh.value)tcoFh.value=hoy;
  if(tcoFd&&!tcoFd.value){const d=new Date();tcoFd.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
  tesoTab(_tesoTabActual);

  initDropdownCobMovil();
    // Inicializar buscador de zonas para cobranza móvil
  setTimeout(() => {
    if (document.getElementById('cobm-zona-input')) {
      initBuscadorZonasCob();
    }
  }, 500);
}

function tesoTab(tab){
  _tesoTabActual=tab;
  ['cobros','pagos','caja','concil'].forEach(t=>{
    const tp=document.getElementById('tp-'+t);
    const btn=document.getElementById('tt-'+t);
    if(tp)tp.style.display=t===tab?'block':'none';
    if(btn){btn.classList.toggle('P',t===tab);}
  });
  if(tab==='cobros')renderTesCobros();
  else if(tab==='pagos')renderTesPagos();
  else if(tab==='caja'){cajaPeriodo(_cajaPer);}
  else if(tab==='concil')renderTesConcil();
}

// ── Tab Cobros ──
function renderTesCobros(){
  const q=(document.getElementById('tco-q')?.value||'').toLowerCase();
  const fd=document.getElementById('tco-fd')?.value||'';
  const fh=document.getElementById('tco-fh')?.value||'';
  const forma=document.getElementById('tco-forma')?.value||'';
  let data=_cobros.filter(c=>{
    if(q&&!(c.cliente||'').toLowerCase().includes(q))return false;
    if(fd&&c.fecha<fd)return false;
    if(fh&&c.fecha>fh)return false;
    if(forma&&!(c.forma||'').includes(forma))return false;
    return true;
  });
  data.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const totEf=data.reduce((a,c)=>a+(c.efectivo||0),0);
  const totTr=data.reduce((a,c)=>a+(c.transferencia||0),0);
  const totCh=data.reduce((a,c)=>a+(c.cheque_terceros||0)+(c.cheque_propio||0),0);
  const totImp=data.reduce((a,c)=>a+(c.importe||0),0);
  document.getElementById('tco-kpis').innerHTML=`
    <div class="stat"><div class="n">${fmt(totEf)}</div><div class="l">💵 Efectivo</div></div>
    <div class="stat"><div class="n" style="color:var(--A)">${fmt(totTr)}</div><div class="l">🏦 Transferencias</div></div>
    <div class="stat"><div class="n" style="color:var(--W)">${fmt(totCh)}</div><div class="l">📋 Cheques recibidos</div></div>
    <div class="stat"><div class="n">${fmt(totImp)}</div><div class="l">Total cobrado (${data.length})</div></div>`;
  const PP2=25,pg=_tesoPg.cobros,sl=data.slice((pg-1)*PP2,pg*PP2);
  document.getElementById('tco-tbody').innerHTML=sl.length?sl.map(r=>`<tr>
    <td>${r.fecha}</td>
    <td style="font-weight:500">${esc(r.cliente||'—')}</td>
    <td style="font-size:11px">${(r.forma||'').split('+').map(f=>f==='efectivo'?'💵 Ef':f==='transf'?'🏦 Tr':f==='cheque'?'📋 Ch':f).join(' · ')||'—'}</td>
    <td style="color:var(--P)">${(r.efectivo||0)>0?fmt(r.efectivo):'—'}</td>
    <td style="color:var(--A)">${(r.transferencia||0)>0?fmt(r.transferencia):'—'}</td>
    <td style="color:var(--W)">${((r.cheque_terceros||0)+(r.cheque_propio||0))>0?fmt((r.cheque_terceros||0)+(r.cheque_propio||0)):'—'}</td>
    <td style="font-weight:700">${fmt(r.importe||0)}</td>
    <td style="color:var(--txt2);font-size:12px">${esc(r.vendedor||'—')}</td>
    <td><button class="btn sm" onclick="imprimirRecibo(${r.id})" title="Ver / imprimir recibo">🧾</button></td>
  </tr>`).join(''):'<tr><td colspan="9"><div class="empty">Sin cobros para el período seleccionado</div></td></tr>';
  pag('tco-pg',data.length,pg,p=>{_tesoPg.cobros=p;renderTesCobros();});
}

// ── Tab Pagos Proveedores ──
async function guardarPago(){
  const prov=document.getElementById('pag-prov').value;
  const imp=parseFloat(document.getElementById('pag-importe').value)||0;
  const fecha=document.getElementById('pag-fecha').value;
  const forma=document.getElementById('pag-forma').value;
  const concepto=(document.getElementById('pag-concepto').value||'').trim();
  if(!prov){alert('Seleccioná un proveedor');return;}
  if(!imp){alert('Ingresá un importe');return;}
  if(!fecha){alert('Ingresá la fecha');return;}
  const provNom=_proveedores.find(x=>x.id==prov)?.nombre||'?';
  const btn=document.querySelector('#tp-pagos .btn.P');
  if(btn){btn.textContent='Guardando...';btn.disabled=true;}
  const {error}=await sb.from('pagos_proveedores').insert({
    fecha,proveedor_id:parseInt(prov),proveedor:provNom,importe:imp,forma,concepto
  });
  if(btn){btn.textContent='✓ Registrar';btn.disabled=false;}
  if(error){alert('Error: '+error.message);return;}
  await cargarPagosProv();
  document.getElementById('pag-importe').value='';
  document.getElementById('pag-concepto').value='';
  renderTesPagos();
  toast('Pago registrado');
}

function renderTesPagos(){
  const q=(document.getElementById('pag-q')?.value||'').toLowerCase();
  const forma=document.getElementById('pag-f-forma')?.value||'';
  let data=_pagosProv.filter(p=>{
    if(q&&!((p.proveedor||'').toLowerCase().includes(q)||(p.cuit||'').includes(q)||(p.concepto||'').toLowerCase().includes(q)))return false;
    if(forma&&p.forma!==forma)return false;
    return true;
  });
  data.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const totEf=data.filter(p=>p.forma==='efectivo').reduce((a,p)=>a+(p.importe||0),0);
  const totTr=data.filter(p=>p.forma==='transferencia').reduce((a,p)=>a+(p.importe||0),0);
  const totCh=data.filter(p=>p.forma==='cheque').reduce((a,p)=>a+(p.importe||0),0);
  const totAll=totEf+totTr+totCh;
  document.getElementById('tpag-kpis').innerHTML=`
    <div class="stat"><div class="n">${fmt(totEf)}</div><div class="l">💵 Efectivo</div></div>
    <div class="stat"><div class="n" style="color:var(--A)">${fmt(totTr)}</div><div class="l">🏦 Transferencias</div></div>
    <div class="stat"><div class="n" style="color:var(--W)">${fmt(totCh)}</div><div class="l">📋 Cheques emitidos</div></div>
    <div class="stat"><div class="n" style="color:var(--D)">${fmt(totAll)}</div><div class="l">Total pagado (${data.length})</div></div>`;
  const PP2=200,pg=_tesoPg.pagos||1,sl=data.slice((pg-1)*PP2,pg*PP2);
  document.getElementById('tpag-tbody').innerHTML=sl.length?sl.map(p=>{const prov=_proveedores.find(x=>x.nombre===p.proveedor);return`<tr>
    <td>${p.fecha}</td>
    <td style="font-weight:600">${esc(p.proveedor||'—')}${prov?.cuit?`<br><span style="font-size:10px;color:var(--txt2)">${prov.cuit}</span>`:''}</td>
    <td>${esc(p.concepto||'—')}</td>
    <td>${p.forma==='efectivo'?'💵 Efectivo':p.forma==='transferencia'?'🏦 Transf.':p.forma==='cheque'?'📋 Cheque':p.forma||'—'}</td>
    <td style="font-weight:700;color:var(--D)">${fmt(p.importe||0)}</td>
    <td><button class="btn sm D" onclick="eliminarPago(${p.id})">🗑</button></td>
  </tr>`;}).join(''):'<tr><td colspan="6"><div class="empty">Sin pagos registrados</div></td></tr>';
  pag('tpag-pg',data.length,pg,p=>{_tesoPg.pagos=p;renderTesPagos();});
}

async function eliminarPago(id){
  if(!confirm('¿Eliminar este pago?'))return;
  await sb.from('pagos_proveedores').delete().eq('id',id);
  await cargarPagosProv();renderTesPagos();
  toast('Pago eliminado');
}

// ── Tab Saldo de Caja ──
function cajaPeriodo(per){
  _cajaPer=per;
  const hoy=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const d2s=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  let fd,fh=d2s(hoy);
  if(per==='hoy'){fd=d2s(hoy);}
  else if(per==='semana'){const d=new Date(hoy);d.setDate(hoy.getDate()-((hoy.getDay()+6)%7));fd=d2s(d);}
  else if(per==='mes'){fd=`${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`;}
  else if(per==='custom'){
    document.getElementById('caja-custom-rng').style.display='flex';
    return;
  }
  document.getElementById('caja-custom-rng').style.display='none';
  document.getElementById('caja-fd').value=fd;
  document.getElementById('caja-fh').value=fh;
  renderTesCaja();
}

function renderTesCaja(){
  const fd=document.getElementById('caja-fd')?.value||'';
  const fh=document.getElementById('caja-fh')?.value||'';
  const lbl=fd===fh?fd:`${fd} → ${fh}`;
  document.getElementById('caja-periodo-label').textContent=`Período: ${lbl||'(todos)'}`;
  const cobs=_cobros.filter(c=>(!fd||c.fecha>=fd)&&(!fh||c.fecha<=fh));
  const cobEf=cobs.reduce((a,c)=>a+(c.efectivo||0),0);
  const cobTr=cobs.reduce((a,c)=>a+(c.transferencia||0),0);
  const cobCh=cobs.reduce((a,c)=>a+(c.cheque_terceros||0)+(c.cheque_propio||0),0);
  const cobTot=cobEf+cobTr+cobCh;
  const pags=_pagosProv.filter(p=>(!fd||p.fecha>=fd)&&(!fh||p.fecha<=fh));
  const pagEf=pags.filter(p=>p.forma==='efectivo').reduce((a,p)=>a+(p.importe||0),0);
  const pagTr=pags.filter(p=>p.forma==='transferencia').reduce((a,p)=>a+(p.importe||0),0);
  const pagCh=pags.filter(p=>p.forma==='cheque').reduce((a,p)=>a+(p.importe||0),0);
  const pagTot=pagEf+pagTr+pagCh;
  const saldoNet=cobTot-pagTot;
  const colNet=saldoNet>=0?'var(--P)':'var(--D)';
  const bgNet=saldoNet>=0?'var(--PL)':'var(--DL)';
  const row2=(lbl2,val,color)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--brd);font-size:13px"><span>${lbl2}</span><span style="font-weight:700;color:${color}">${fmt(val)}</span></div>`;
  const sCard=(lbl2,val)=>{const c=val>=0?'var(--P)':'var(--D)';const bg=val>=0?'var(--PL)':'var(--DL)';
    return `<div style="background:${bg};border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:16px;font-weight:700;color:${c}">${fmt(val)}</div><div style="font-size:11px;color:var(--txt2);margin-top:2px">${lbl2}</div></div>`;};
  document.getElementById('tp-caja-body').innerHTML=`
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="n">${fmt(cobTot)}</div><div class="l">Total cobrado</div></div>
    <div class="stat"><div class="n" style="color:var(--D)">${fmt(pagTot)}</div><div class="l">Total pagado a prov.</div></div>
    <div class="stat" style="background:${bgNet};border-color:${colNet}"><div class="n" style="color:${colNet}">${fmt(saldoNet)}</div><div class="l">Saldo neto del período</div></div>
    <div class="stat"><div class="n" style="color:var(--txt2)">${cobs.length} cob. / ${pags.length} pag.</div><div class="l">Cantidad de movimientos</div></div>
  </div>
  <div class="g2" style="margin-bottom:14px">
    <div class="card">
      <div style="font-size:12px;font-weight:700;color:var(--PD);margin-bottom:8px">📥 Cobros por medio</div>
      ${row2('💵 Efectivo',cobEf,'var(--P)')}
      ${row2('🏦 Transferencias',cobTr,'var(--A)')}
      ${row2('📋 Cheques recibidos',cobCh,'var(--W)')}
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;font-weight:700"><span>Total</span><span style="color:var(--P)">${fmt(cobTot)}</span></div>
    </div>
    <div class="card">
      <div style="font-size:12px;font-weight:700;color:var(--D);margin-bottom:8px">📤 Pagos por medio</div>
      ${row2('💵 Efectivo',pagEf,'var(--D)')}
      ${row2('🏦 Transferencias',pagTr,'var(--D)')}
      ${row2('📋 Cheques emitidos',pagCh,'var(--D)')}
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;font-weight:700"><span>Total</span><span style="color:var(--D)">${fmt(pagTot)}</span></div>
    </div>
  </div>
  <div class="card">
    <div style="font-size:12px;font-weight:700;color:var(--PD);margin-bottom:10px">⚖ Saldo neto por medio de pago</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${sCard('💵 Efectivo',cobEf-pagEf)}
      ${sCard('🏦 Transferencias',cobTr-pagTr)}
      ${sCard('📋 Cheques',cobCh-pagCh)}
    </div>
  </div>`;
}

// ── Tab Conciliación Bancaria ──
async function guardarMovBanc(){
  const fecha=document.getElementById('conc-fecha').value;
  const desc=(document.getElementById('conc-desc').value||'').trim();
  const imp=parseFloat(document.getElementById('conc-importe').value)||0;
  const tipo=document.getElementById('conc-tipo').value;
  if(!fecha||!imp){alert('Fecha e importe son requeridos');return;}
  const {error}=await sb.from('movimientos_bancarios').insert({fecha,descripcion:desc,importe:imp,tipo,conciliado:false});
  if(error){alert('Error: '+error.message);return;}
  await cargarMovBanc();
  document.getElementById('conc-importe').value='';
  document.getElementById('conc-desc').value='';
  renderTesConcil();
  toast('Movimiento del extracto agregado');
}

function renderTesConcil(){
  const pendBanc=_movBanc.filter(m=>!m.conciliado);
  const conciliados=_movBanc.filter(m=>m.conciliado);
  // Movimientos del sistema pendientes de conciliar
  const conciliadosCobIds=new Set(_movBanc.filter(m=>m.conciliado&&m.conciliado_tipo==='cobro').map(m=>m.conciliado_id));
  const conciliadosPagIds=new Set(_movBanc.filter(m=>m.conciliado&&m.conciliado_tipo==='pago').map(m=>m.conciliado_id));
  const sisCredPend=_cobros.filter(c=>(c.transferencia||0)>0&&!conciliadosCobIds.has(c.id));
  const sisDebPend=_pagosProv.filter(p=>p.forma==='transferencia'&&!conciliadosPagIds.has(p.id));
  // Extracto pendiente
  const itemBanc=(m)=>`<tr>
    <td>${m.fecha}</td><td style="font-size:11px">${esc(m.descripcion||'—')}</td>
    <td>${m.tipo==='credito'?'<span class="b bP">⬆ Crédito</span>':'<span class="b bD">⬇ Débito</span>'}</td>
    <td style="font-weight:700">${fmt(m.importe)}</td>
    <td><button class="btn sm D" title="Eliminar" onclick="eliminarMovBanc(${m.id})">🗑</button></td></tr>`;
  document.getElementById('conc-banco-list').innerHTML=pendBanc.length
    ?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Importe</th><th></th></tr></thead><tbody>${pendBanc.map(itemBanc).join('')}</tbody></table></div>`
    :'<div style="font-size:12px;color:var(--P);padding:8px">✅ Sin movimientos pendientes en el extracto</div>';
  // Sistema pendiente
  const allSis=[
    ...sisCredPend.map(c=>({fecha:c.fecha,desc:c.cliente||'?',tipo:'credito',imp:c.transferencia,comp:c.comprobante_url||''})),
    ...sisDebPend.map(p=>({fecha:p.fecha,desc:p.proveedor||'?',tipo:'debito',imp:p.importe,comp:''}))
  ].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const _compThumb=url=>url?`<a href="${url}" target="_blank" title="Ver comprobante"><img src="${url}" style="height:38px;border-radius:4px;cursor:pointer;object-fit:cover;border:1px solid var(--A)" onerror="this.parentNode.innerHTML='📎'"></a>`:'—';
  document.getElementById('conc-sistema-list').innerHTML=allSis.length
    ?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Importe</th><th>Comprobante</th></tr></thead><tbody>${allSis.map(s=>`<tr><td>${s.fecha}</td><td style="font-size:11px">${esc(s.desc)}</td><td>${s.tipo==='credito'?'<span class="b bA">⬆ Cobro Tr.</span>':'<span class="b bD">⬇ Pago Tr.</span>'}</td><td style="font-weight:700">${fmt(s.imp)}</td><td>${_compThumb(s.comp)}</td></tr>`).join('')}</tbody></table></div>`
    :'<div style="font-size:12px;color:var(--P);padding:8px">✅ Sin movimientos pendientes en el sistema</div>';
  // Conciliados
  const cnt=document.getElementById('conc-count');
  if(cnt)cnt.textContent=conciliados.length;
  document.getElementById('conc-conciliados').innerHTML=conciliados.length
    ?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha banco</th><th>Descripción</th><th>Tipo</th><th>Importe</th><th>Origen sistema</th><th>Comp.</th><th></th></tr></thead><tbody>${conciliados.map(m=>{
      let origen='',comp='';
      if(m.conciliado_tipo==='cobro'){const c=_cobros.find(x=>x.id===m.conciliado_id);origen=c?`Cobro ${esc(c.cliente)} (${c.fecha})`:'?';comp=c?.comprobante_url||'';}
      else if(m.conciliado_tipo==='pago'){const p=_pagosProv.find(x=>x.id===m.conciliado_id);origen=p?`Pago ${esc(p.proveedor)} (${p.fecha})`:'?';}
      return `<tr><td>${m.fecha}</td><td style="font-size:11px">${esc(m.descripcion||'—')}</td>
        <td>${m.tipo==='credito'?'<span class="b bP">⬆</span>':'<span class="b bD">⬇</span>'}</td>
        <td style="font-weight:700">${fmt(m.importe)}</td>
        <td style="font-size:12px;color:var(--P)">${origen}</td>
        <td>${comp?`<a href="${comp}" target="_blank" title="Ver comprobante"><img src="${comp}" style="height:32px;border-radius:3px;object-fit:cover;border:1px solid var(--brd)" onerror="this.parentNode.innerHTML='📎'"></a>`:'—'}</td>
        <td><button class="btn sm" title="Desconciliar" onclick="desconciliar(${m.id})">↩</button></td></tr>`;
    }).join('')}</tbody></table></div>`
    :'<div style="font-size:12px;color:var(--txt2);padding:8px">No hay movimientos conciliados aún</div>';
}

async function autoConciliar(){
  const pendBanc=_movBanc.filter(m=>!m.conciliado);
  if(!pendBanc.length){toast('No hay movimientos pendientes en el extracto');return;}
  const conciliadosCobIds=new Set(_movBanc.filter(m=>m.conciliado&&m.conciliado_tipo==='cobro').map(m=>m.conciliado_id));
  const conciliadosPagIds=new Set(_movBanc.filter(m=>m.conciliado&&m.conciliado_tipo==='pago').map(m=>m.conciliado_id));
  let cant=0;
  for(const mov of pendBanc){
    if(mov.tipo==='credito'){
      const match=_cobros.find(c=>(c.transferencia||0)===mov.importe&&c.fecha===mov.fecha&&!conciliadosCobIds.has(c.id));
      if(match){
        await sb.from('movimientos_bancarios').update({conciliado:true,conciliado_id:match.id,conciliado_tipo:'cobro'}).eq('id',mov.id);
        conciliadosCobIds.add(match.id);cant++;
      }
    }else{
      const match=_pagosProv.find(p=>p.importe===mov.importe&&p.fecha===mov.fecha&&p.forma==='transferencia'&&!conciliadosPagIds.has(p.id));
      if(match){
        await sb.from('movimientos_bancarios').update({conciliado:true,conciliado_id:match.id,conciliado_tipo:'pago'}).eq('id',mov.id);
        conciliadosPagIds.add(match.id);cant++;
      }
    }
  }
  await cargarMovBanc();renderTesConcil();
  toast(cant?`✅ ${cant} movimiento${cant!==1?'s':''} conciliado${cant!==1?'s':''}`:'Sin coincidencias exactas (misma fecha + mismo importe)');
}

async function eliminarMovBanc(id){
  if(!confirm('¿Eliminar este movimiento del extracto?'))return;
  await sb.from('movimientos_bancarios').delete().eq('id',id);
  await cargarMovBanc();renderTesConcil();
  toast('Movimiento eliminado');
}

async function desconciliar(id){
  await sb.from('movimientos_bancarios').update({conciliado:false,conciliado_id:null,conciliado_tipo:null}).eq('id',id);
  await cargarMovBanc();renderTesConcil();
  toast('Movimiento desconciliado');
}

// ─── LIMPIAR FILTROS DE CUENTAS CORRIENTES ───
function limpiarFiltrosCC() {
  document.getElementById('cc-q').value = '';
  document.getElementById('cc-f').value = '';
  document.getElementById('cc-f-zona').value = '';
  document.getElementById('cc-f-saldo').value = '';
  document.getElementById('cc-f-dias').value = '';
  _ccPg = 1;
  renderCC();
}

// ─── LIMPIAR FILTROS DE RENDICIÓN ───
function limpiarFiltrosRendicion() {
  document.getElementById('rend-hr-q').value = '';
  document.getElementById('rend-hr-num').value = '';
  document.getElementById('rend-hr-desde').value = '';
  document.getElementById('rend-hr-hasta').value = '';
  renderListaHojasRuta();
}