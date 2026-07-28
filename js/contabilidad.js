// ─── CONTABILIDAD: gastos, gastos fijos, comisiones, mayor/resultado, comprobantes de compra ───

let _pendingContTab=null;

// ─── AJUSTE NC/ND EN COMPROBANTE DE COMPRA ──────────────────────────────────
function abrirAjusteComp(compId, tipo){
  const comp=_comprobantes.find(c=>c.id===compId);if(!comp)return;
  document.getElementById('ca-comp-id').value=compId;
  document.getElementById('ca-tipo').value=tipo;
  const esNC=tipo==='nc';
  document.getElementById('m-ca-titulo').textContent=esNC
    ?'📋 Nota de crédito — Comprobante de compra'
    :'⚠️ Nota de débito — Comprobante de compra';
  document.getElementById('ca-info').innerHTML=`
    <div style="margin-bottom:4px"><strong>${comp.proveedor_nom}</strong> · ${comp.nro_comprobante||'Sin Nro'}</div>
    <div>Fecha: ${comp.fecha} · Importe actual: <strong style="color:var(--D)">${fmt(comp.importe)}</strong></div>
    <div style="margin-top:4px;font-size:12px;color:${esNC?'var(--P)':'var(--W)'}">
      ${esNC?'✅ NC reduce el monto que debés al proveedor':'⚠️ ND incrementa el monto que debés al proveedor'}
    </div>`;
  const motivoSel=document.getElementById('ca-motivo');
  // NC: motivos de crédito; ND: motivos de débito
  const motivos=esNC
    ?[['devolucion_mercaderia','Devolución de mercadería'],['descuento_comercial','Descuento comercial'],['error_facturacion','Error de facturación'],['bonificacion','Bonificación'],['otro','Otro']]
    :[['cargo_adicional','Cargo adicional'],['diferencia_precio','Diferencia de precio'],['error_facturacion','Error de facturación'],['interes_mora','Interés por mora'],['otro','Otro']];
  motivoSel.innerHTML=motivos.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  document.getElementById('ca-importe').value='';
  document.getElementById('ca-obs').value='';
  document.getElementById('ca-resultado').style.display='none';
  const btn=document.getElementById('ca-btn-guardar');
  btn.className=esNC?'btn P':'btn';
  btn.style.background=esNC?'':'var(--W)';
  btn.style.color=esNC?'':'#fff';
  document.getElementById('m-comp-ajuste').classList.add('on');
  setTimeout(()=>document.getElementById('ca-importe')?.focus(),100);
}

async function guardarAjusteComp(){
  const compId=parseInt(document.getElementById('ca-comp-id').value);
  const tipo=document.getElementById('ca-tipo').value;
  const monto=parseFloat(document.getElementById('ca-importe').value)||0;
  if(monto<=0){alert('Ingresá un importe mayor a cero');return;}
  const motivo=document.getElementById('ca-motivo').value;
  const obs=document.getElementById('ca-obs').value;
  const comp=_comprobantes.find(c=>c.id===compId);if(!comp)return;

  const nuevoImporte=tipo==='nc'
    ?Math.max(0, comp.importe-monto)
    :comp.importe+monto;
  const observNueva=`[${tipo.toUpperCase()} ${new Date().toLocaleDateString('es-AR')}: ${fmt(tipo==='nc'?-monto:monto)} — ${motivo}${obs?' — '+obs:''}]`;
  const obsActual=comp.observaciones||'';

  const {error}=await sb.from('comprobantes').update({
    importe:nuevoImporte,
    observaciones:(obsActual+' '+observNueva).trim(),
    estado:nuevoImporte<=0?'pagado':comp.estado
  }).eq('id',compId);
  if(error){alert('Error: '+error.message);return;}

  cerrar('m-comp-ajuste');
  await cargarComprobantes();
  renderComprobantes();
  const msg=tipo==='nc'
    ?`✅ NC aplicada: monto reducido de ${fmt(comp.importe)} a ${fmt(nuevoImporte)}`
    :`✅ ND aplicada: monto incrementado de ${fmt(comp.importe)} a ${fmt(nuevoImporte)}`;
  alert(msg);
}

// ═══ RESULTADO MENSUAL (datos FoxPro) ═══
let _rmMeses=[], _rmGastosMes=[];

// Números al estilo argentino: acepta "123.456.789,50", "123456789.5", "123456789"
function rmParse(s){
  s=String(s||'').trim().replace(/\$/g,'').replace(/\s/g,'');
  if(!s)return 0;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  const n=parseFloat(s);return isNaN(n)?0:n;
}

const rmFmt=n=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});

// Enter = pasar al siguiente casillero (como el FoxPro). F10/Ctrl+Enter = guardar. Insert = nuevo gasto.
function foxEnter(e){
  if(e.key==='F10'||(e.key==='Enter'&&e.ctrlKey)){e.preventDefault();rmGuardar();return;}
  if(e.key==='Insert'){e.preventDefault();rmAgregarGasto();return;}
  if(e.key!=='Enter')return;
  e.preventDefault();
  const ins=[...document.querySelectorAll('#cont-mensual input.fox-in')].filter(i=>i.offsetParent!==null);
  const i=ins.indexOf(e.target);
  if(i>=0&&i<ins.length-1){ins[i+1].focus();ins[i+1].select&&ins[i+1].select();}
}

async function rmInit(){
  const per=document.getElementById('rm-periodo');
  if(!per.value){
    const hoy=new Date();hoy.setMonth(hoy.getMonth()-1); // por defecto, el mes pasado
    per.value=String(hoy.getMonth()+1).padStart(2,'0')+'-'+hoy.getFullYear();
  }
  await rmRefrescarHistorial();
  rmCargar();
}

async function rmRefrescarHistorial(){
  try{
    const {data,error}=await sb.from('resultado_mensual').select('*');
    if(error)throw error;
    _rmMeses=(data||[]).sort((a,b)=>periodoKey(a.periodo).localeCompare(periodoKey(b.periodo)));
  }catch(e){
    document.getElementById('rm-msg').textContent='⚠ Falta crear las tablas en Supabase (correr tabla_resultado_mensual.sql)';
    _rmMeses=[];
  }
  rmRenderHistorial();
}

async function rmCargar(){
  const norm=normalizarPeriodo(document.getElementById('rm-periodo').value);
  if(!norm){document.getElementById('rm-msg').textContent='Mes inválido — escribilo como 06-2026';return;}
  document.getElementById('rm-periodo').value=norm;
  const m=_rmMeses.find(x=>x.periodo===norm);
  document.getElementById('rm-ventas').value=m&&m.ventas?rmFmt(m.ventas):'';
  document.getElementById('rm-cm').value=m&&m.contrib_marginal?rmFmt(m.contrib_marginal):'';
  document.getElementById('rm-caja-in').value=m&&m.caja_ingresos?rmFmt(m.caja_ingresos):'';
  document.getElementById('rm-caja-out').value=m&&m.caja_egresos?rmFmt(m.caja_egresos):'';
  _rmGastosMes=[];
  try{
    const {data}=await sb.from('resultado_mensual_gastos').select('*').eq('periodo',norm).order('id');
    _rmGastosMes=(data||[]).map(g=>({rubro:g.rubro,monto:g.monto}));
  }catch(e){}
  if(!_rmGastosMes.length)_rmGastosMes=[{rubro:'',monto:0}];
  document.getElementById('rm-msg').textContent=m?'Mes '+norm+' cargado (guardado el '+new Date(m.updated_at).toLocaleDateString('es-AR')+')':'Mes '+norm+' — sin datos todavía, cargalos y guardá';
  rmRenderGastos();rmCalc();
}

function rmRenderGastos(){
  const tb=document.getElementById('rm-gastos');
  tb.innerHTML=_rmGastosMes.map((g,i)=>
    '<tr><td><input class="fox-in txt" value="'+String(g.rubro||'').replace(/"/g,'&quot;')+'" placeholder="Combustible / Alquiler / Sueldos..." onkeydown="foxEnter(event)" oninput="_rmGastosMes['+i+'].rubro=this.value"></td>'+
    '<td class="n"><input class="fox-in" value="'+(g.monto?rmFmt(g.monto):'')+'" onkeydown="foxEnter(event)" oninput="_rmGastosMes['+i+'].monto=rmParse(this.value);rmCalc()"></td>'+
    '<td style="text-align:center"><button class="btn sm" onclick="_rmGastosMes.splice('+i+',1);rmRenderGastos();rmCalc()">✕</button></td></tr>'
  ).join('');
}

function rmAgregarGasto(){
  _rmGastosMes.push({rubro:'',monto:0});
  rmRenderGastos();
  const ins=document.querySelectorAll('#rm-gastos input.fox-in.txt');
  if(ins.length)ins[ins.length-1].focus();
}

function rmCopiarRubros(){
  const norm=normalizarPeriodo(document.getElementById('rm-periodo').value);
  if(!norm)return;
  const previos=_rmMeses.filter(x=>periodoKey(x.periodo)<periodoKey(norm));
  if(!previos.length){document.getElementById('rm-msg').textContent='No hay un mes anterior guardado';return;}
  const ant=previos[previos.length-1];
  sb.from('resultado_mensual_gastos').select('rubro').eq('periodo',ant.periodo).order('id').then(({data})=>{
    if(data&&data.length){
      _rmGastosMes=data.map(g=>({rubro:g.rubro,monto:0}));
      rmRenderGastos();rmCalc();
      document.getElementById('rm-msg').textContent='Rubros copiados de '+ant.periodo+' — completá los importes';
    }
  });
}

function rmCalc(){
  const v=rmParse(document.getElementById('rm-ventas').value);
  const cm=rmParse(document.getElementById('rm-cm').value);
  const g=_rmGastosMes.reduce((a,x)=>a+(x.monto||0),0);
  const res=cm-g;
  const cin=rmParse(document.getElementById('rm-caja-in').value);
  const cout=rmParse(document.getElementById('rm-caja-out').value);
  document.getElementById('rm-cmv').textContent=v||cm?rmFmt(v-cm)+'   |   CM '+(v?(cm/v*100).toFixed(1):'0.0')+'%':'—';
  document.getElementById('rm-gtot').textContent=rmFmt(g);
  const er=document.getElementById('rm-resultado');
  er.textContent=(cm||g)?rmFmt(res)+(v?'   ('+(res/v*100).toFixed(1)+'% s/ventas)':''):'—';
  er.className='n '+(res>=0?'fox-res-pos':'fox-res-neg');
  const ec=document.getElementById('rm-caja-dif');
  ec.textContent=(cin||cout)?rmFmt(cin-cout):'—';
  ec.className='n '+((cin-cout)>=0?'fox-res-pos':'fox-res-neg');
}

async function rmGuardar(){
  const norm=normalizarPeriodo(document.getElementById('rm-periodo').value);
  if(!norm){alert('Mes inválido');return;}
  const fila={
    periodo:norm,
    ventas:rmParse(document.getElementById('rm-ventas').value),
    contrib_marginal:rmParse(document.getElementById('rm-cm').value),
    caja_ingresos:rmParse(document.getElementById('rm-caja-in').value),
    caja_egresos:rmParse(document.getElementById('rm-caja-out').value),
    updated_at:new Date().toISOString()
  };
  try{
    const {error}=await sb.from('resultado_mensual').upsert(fila,{onConflict:'periodo'});
    if(error)throw error;
    await sb.from('resultado_mensual_gastos').delete().eq('periodo',norm);
    const gs=_rmGastosMes.filter(g=>g.rubro&&g.monto).map(g=>({periodo:norm,rubro:g.rubro.trim(),monto:g.monto}));
    if(gs.length){
      const {error:e2}=await sb.from('resultado_mensual_gastos').insert(gs);
      if(e2)throw e2;
    }
    document.getElementById('rm-msg').textContent='✅ '+norm+' guardado';
    await rmRefrescarHistorial();
  }catch(e){
    document.getElementById('rm-msg').textContent='❌ Error al guardar: '+(e.message||e);
  }
}

function rmRenderHistorial(){
  const tb=document.getElementById('rm-hist');
  if(!_rmMeses.length){tb.innerHTML='<tr><td colspan="10" style="color:#666;font-style:italic">Sin meses guardados todavía</td></tr>';return;}
  // Gastos por mes: los traigo todos juntos para no hacer una consulta por fila
  sb.from('resultado_mensual_gastos').select('periodo,monto').then(({data})=>{
    const gx={};(data||[]).forEach(g=>{gx[g.periodo]=(gx[g.periodo]||0)+Number(g.monto||0);});
    tb.innerHTML=_rmMeses.map(m=>{
      const g=gx[m.periodo]||0, res=Number(m.contrib_marginal||0)-g, v=Number(m.ventas||0);
      const dif=Number(m.caja_ingresos||0)-Number(m.caja_egresos||0);
      return '<tr class="rm-hist" onclick="document.getElementById(\'rm-periodo\').value=\''+m.periodo+'\';rmCargar()">'+
        '<td>'+m.periodo+'</td><td class="n">'+rmFmt(m.ventas)+'</td><td class="n">'+rmFmt(m.contrib_marginal)+'</td>'+
        '<td class="n">'+(v?(m.contrib_marginal/v*100).toFixed(1):'0.0')+'%</td>'+
        '<td class="n">'+rmFmt(g)+'</td>'+
        '<td class="n '+(res>=0?'fox-res-pos':'fox-res-neg')+'">'+rmFmt(res)+'</td>'+
        '<td class="n">'+(v?(res/v*100).toFixed(1):'0.0')+'%</td>'+
        '<td class="n">'+rmFmt(m.caja_ingresos)+'</td><td class="n">'+rmFmt(m.caja_egresos)+'</td>'+
        '<td class="n '+(dif>=0?'fox-res-pos':'fox-res-neg')+'">'+rmFmt(dif)+'</td></tr>';
    }).join('');
  });
}

function contTabDesde(tab){
  _pendingContTab=tab;
  go('contabilidad');
}

// Actualizar menú activo según panel
function actualizarNavActivo(p){
  document.querySelectorAll('.nav button[data-p],.nav-dropdown button[data-p]').forEach(b=>b.classList.remove('on'));
  // Resaltar botón del panel activo
  document.querySelectorAll(`[data-p="${p}"]`).forEach(b=>b.classList.add('on'));
  // Resaltar grupo padre
  const grupos={
    'pedidos':'ventas','pedido-movil':'ventas','carga':'ventas','remitos':'ventas','remito-rapido':'ventas','nc':'ventas',
    'clientes':'maestros','cuentas':'maestros','productos':'maestros','stock':'maestros','maestro-proveedores':'maestros','listas-precios':'maestros',
    'cobranza':'tesoreria','tesoreria':'tesoreria',
    'contabilidad':'contabilidad',
    'informes':'informes','rendicion':'informes','comisiones':'informes','contrib-zona':'informes','gastos-fijos':'informes'
  };
  const grupo=grupos[p];
  if(grupo){const ng=document.getElementById('ng-'+grupo);if(ng)ng.classList.add('active');}
  else{document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('active'));}
}

// ─── FIN MENÚ DESPLEGABLE ───
function contTab(tab){
  ['gastos','asientos','mayor','resultado','mensual'].forEach(t=>{
    const el=document.getElementById('cont-'+t);
    if(el)el.style.display=t===tab?'block':'none';
    const btn=document.getElementById('cont-tab-'+t);
    if(btn){btn.style.background=t===tab?'var(--P)':'';btn.style.color=t===tab?'#fff':'';}
  });
  if(tab==='mensual')rmInit();
  if(tab==='gastos')renderGastos();
  if(tab==='mayor'){
    const hoy=new Date().toISOString().split('T')[0];
    const desde=document.getElementById('may-desde');
    const hasta=document.getElementById('may-hasta');
    if(desde&&!desde.value)desde.value=hoy.substring(0,7)+'-01';
    if(hasta&&!hasta.value)hasta.value=hoy;
  }
  if(tab==='resultado'){
    const hoy=new Date();
    const desde=document.getElementById('res-desde');
    const hasta=document.getElementById('res-hasta');
    if(desde&&!desde.value)desde.value=hoy.getFullYear()+'-01-01';
    if(hasta&&!hasta.value)hasta.value=hoy.toISOString().split('T')[0];
  }
}

function renderMayor(){
  const cuentaVal=document.getElementById('may-cuenta')?.value;
  const desde=document.getElementById('may-desde')?.value;
  const hasta=document.getElementById('may-hasta')?.value;
  const res=document.getElementById('may-resultado');
  if(!cuentaVal||!res){return;}
  const [cod,nom]=cuentaVal.split('|');
  // Buscar movimientos de esta cuenta en asientos_detalle (async)
  sb.from('asientos_detalle')
    .select('*, asientos(fecha,descripcion,tipo)')
    .eq('cuenta_cod',cod)
    .then(({data})=>{
      let movs=(data||[]).filter(d=>{
        const f=d.asientos?.fecha;
        return (!desde||f>=desde)&&(!hasta||f<=hasta);
      }).sort((a,b)=>a.asientos?.fecha.localeCompare(b.asientos?.fecha));
      let saldo=0;
      const rows=movs.map(m=>{
        saldo+=m.debe-m.haber;
        return `<tr>
          <td>${m.asientos?.fecha||''}</td>
          <td style="font-size:12px;color:var(--txt2)">${m.asientos?.descripcion||''}</td>
          <td style="color:var(--D);text-align:right">${m.debe>0?fmt(m.debe):'—'}</td>
          <td style="color:var(--P);text-align:right">${m.haber>0?fmt(m.haber):'—'}</td>
          <td style="font-weight:600;text-align:right;color:${saldo>=0?'var(--D)':'var(--P)'}">${fmt(saldo)}</td>
        </tr>`;
      }).join('');
      const totDebe=movs.reduce((a,m)=>a+m.debe,0);
      const totHaber=movs.reduce((a,m)=>a+m.haber,0);
      res.innerHTML=`
        <div style="font-size:14px;font-weight:700;color:var(--PD);margin-bottom:10px">${cod} — ${nom}</div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Fecha</th><th>Descripción</th><th style="text-align:right;color:var(--D)">Debe</th><th style="text-align:right;color:var(--P)">Haber</th><th style="text-align:right">Saldo</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:var(--txt2)">Sin movimientos</td></tr>'}</tbody>
          <tfoot><tr style="background:var(--bg2);font-weight:700">
            <td colspan="2">TOTALES</td>
            <td style="text-align:right;color:var(--D)">${fmt(totDebe)}</td>
            <td style="text-align:right;color:var(--P)">${fmt(totHaber)}</td>
            <td style="text-align:right">${fmt(saldo)}</td>
          </tr></tfoot>
        </table></div>`;
    });
}

function renderResultado(){
  const desde=document.getElementById('res-desde')?.value;
  const hasta=document.getElementById('res-hasta')?.value;
  const cuerpo=document.getElementById('res-cuerpo');
  if(!cuerpo)return;

  // 1. Ventas brutas
  const remsPeriodo=_remitos.filter(r=>r.fecha>=desde&&r.fecha<=hasta);
  const ventas=remsPeriodo.reduce((a,r)=>a+(r.total||0),0);
  const cantRemitos=remsPeriodo.length;

  // 2. Notas de crédito
  const totalNC=(_ncs||[]).filter(r=>r.fecha>=desde&&r.fecha<=hasta).reduce((a,r)=>a+(r.importe||0),0);
  const ventasNetas=ventas-totalNC;

  // 3. CMV — usa costo actual de _productos
  const costoMap={};
  _productos.forEach(p=>{costoMap[p.id]=p.costo||0;});
  let cmv=0;
  remsPeriodo.forEach(r=>{
    (r.items||[]).forEach(it=>{cmv+=(costoMap[it.id]||0)*it.cant;});
  });
  const hayCostos=_productos.some(p=>p.costo>0);

  // 4. Contribución marginal
  const contribMarginal=ventasNetas-cmv;
  const pctCM=ventasNetas>0?contribMarginal/ventasNetas*100:0;

  // 5. Gastos del período por tipo
  const gastosPeriodo=_gastos.filter(g=>g.fecha>=desde&&g.fecha<=hasta);
  const totalGastos=gastosPeriodo.reduce((a,g)=>a+(g.importe||0),0);
  const porTipo={};
  gastosPeriodo.forEach(g=>{porTipo[g.tipo]=(porTipo[g.tipo]||0)+(g.importe||0);});

  // 6. Resultado neto
  const resultadoNeto=contribMarginal-totalGastos;
  const pctResult=ventasNetas>0?resultadoNeto/ventasNetas*100:0;

  const row=(label,val,opts={})=>{
    const color=opts.color?`color:${opts.color}`:'';
    const bold=opts.bold?'font-weight:700':'';
    const sz=opts.sz?`font-size:${opts.sz}`:'font-size:13px';
    const sub=opts.sub?`<div style="font-size:11px;color:var(--txt2)">${opts.sub}</div>`:'';
    const pct=opts.pct!==undefined?`<span style="font-size:11px;color:var(--txt2);margin-left:8px">${opts.pct.toFixed(1)}%</span>`:'';
    const neg=opts.neg?`<span style="font-size:12px;color:var(--txt2)">−</span> `:'';
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:0.5px solid var(--brd)">
      <span style="${sz};${bold}">${label}${sub?'<br>'+sub:''}</span>
      <span style="${sz};${bold};${color};text-align:right">${neg}${fmt(Math.abs(val))}${pct}</span>
    </div>`;
  };
  const separator=(label)=>`<div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px">${label}</div>`;
  const totalRow=(label,val,bg,color,pct)=>`
    <div style="background:${bg};border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin:6px 0">
      <span style="font-size:14px;font-weight:700">${label}</span>
      <span style="font-size:18px;font-weight:700;color:${color}">${fmt(val)}${pct!==undefined?`<span style="font-size:12px;font-weight:400;margin-left:8px">${pct.toFixed(1)}%</span>`:''}</span>
    </div>`;

  cuerpo.innerHTML=`<div style="max-width:640px">
    ${separator('Ingresos')}
    ${row('Ventas brutas',ventas,{sub:`${cantRemitos} remitos`})}
    ${totalNC>0?row('Notas de crédito',totalNC,{neg:true,color:'var(--txt2)'}):''}
    ${totalRow('Ventas netas',ventasNetas,'var(--PL)','var(--P)')}

    ${separator('Costo de Mercadería Vendida (CMV)')}
    ${hayCostos
      ? row('CMV',cmv,{neg:true,color:'var(--D)'})
      : `<div style="font-size:12px;color:var(--W);padding:6px 0">⚠ Sin costos cargados en productos — CMV = $0. Completá el costo en el panel Productos.</div>`}
    ${totalRow('Contribución Marginal',contribMarginal,pctCM>=20?'var(--PL)':pctCM>=5?'var(--WL)':'var(--DL)',pctCM>=20?'var(--P)':pctCM>=5?'var(--W)':'var(--D)',pctCM)}

    ${separator('Gastos del período')}
    ${Object.entries(porTipo).sort((a,b)=>b[1]-a[1]).map(([tipo,tot])=>row(tipo,tot,{neg:true,color:'var(--D)'})).join('')||'<div style="font-size:12px;color:var(--txt2);padding:6px 0">Sin gastos registrados en el período.</div>'}
    ${totalGastos>0?row('Total gastos',totalGastos,{neg:true,bold:true,color:'var(--D)','sz':'14px'}):''}

    ${totalRow('RESULTADO NETO',resultadoNeto,resultadoNeto>=0?'var(--PL)':'var(--DL)',resultadoNeto>=0?'var(--P)':'var(--D)',pctResult)}

    <div style="font-size:11px;color:var(--txt2);margin-top:10px;text-align:right">Período: ${desde} al ${hasta}</div>
  </div>`;
}

// ─── FIN CONTABILIDAD ───
let _gastos=[], _gasPg=1;

async function cargarGastos(){
  const {data}=await sb.from('gastos').select('*').order('fecha',{ascending:false});
  _gastos=data||[];
}

function abrirGasto(){
  document.getElementById('gas-fecha').value=new Date().toISOString().split('T')[0];
  document.getElementById('gas-tipo').value='';
  document.getElementById('gas-desc').value='';
  document.getElementById('gas-comp').value='';
  document.getElementById('gas-imp').value='';
  document.getElementById('gas-contra').value='11101|Caja';
  document.getElementById('gas-cuenta-display').textContent='Seleccioná el tipo de gasto';
  document.getElementById('m-gas-title').textContent='Nuevo gasto';
  document.getElementById('m-gasto').classList.add('on');
  setTimeout(()=>document.getElementById('gas-tipo').focus(),100);
}

function selTipoGasto(){
  const val=document.getElementById('gas-tipo').value;
  const display=document.getElementById('gas-cuenta-display');
  if(val){
    const [cod,nom]=val.split('|');
    display.innerHTML=`<b>${cod}</b> — ${nom}`;
    display.style.color='var(--PD)';
  } else {
    display.textContent='Seleccioná el tipo de gasto';
    display.style.color='var(--txt2)';
  }
}

async function guardarGasto(){
  const tipo=document.getElementById('gas-tipo').value;
  if(!tipo){alert('Seleccioná el tipo de gasto');return;}
  const imp=parseFloat(document.getElementById('gas-imp').value)||0;
  if(imp<=0){alert('Ingresá el importe');return;}
  const [cuentaCod,cuentaNom]=tipo.split('|');
  const contra=document.getElementById('gas-contra').value;
  const [contraCod,contraNom]=contra.split('|');
  const fecha=document.getElementById('gas-fecha').value;
  const desc=document.getElementById('gas-desc').value.trim();
  const comp=document.getElementById('gas-comp').value.trim();

  // Guardar gasto
  const {data:gasto}=await sb.from('gastos').insert({
    fecha,tipo:cuentaNom,cuenta_cod:cuentaCod,cuenta_nom:cuentaNom,
    importe:imp,contrapartida:contraNom,descripcion:desc,comprobante:comp,
    vendedor:usuarioActual?.nombre||''
  }).select().single();

  // Generar asiento contable
  if(gasto){
    const {data:asiento}=await sb.from('asientos').insert({
      fecha,descripcion:desc||cuentaNom,tipo:'GASTO',
      referencia_id:gasto.id,referencia_tipo:'gasto'
    }).select().single();
    if(asiento){
      await sb.from('asientos_detalle').insert([
        {asiento_id:asiento.id,cuenta_cod:cuentaCod,cuenta_nom:cuentaNom,debe:imp,haber:0},
        {asiento_id:asiento.id,cuenta_cod:contraCod,cuenta_nom:contraNom,debe:0,haber:imp}
      ]);
    }
  }

  cerrar('m-gasto');
  await cargarGastos();
  renderGastos();
}

function renderGastos(){
  const q=(document.getElementById('gas-q')?.value||'').toLowerCase();
  const mes=document.getElementById('gas-mes')?.value||'';
  let data=_gastos.filter(g=>{
    const okQ=!q||(g.tipo||'').toLowerCase().includes(q)||(g.descripcion||'').toLowerCase().includes(q);
    const okM=!mes||g.fecha?.startsWith(mes);
    return okQ&&okM;
  });
  // Poblar meses
  const meses=[...new Set(_gastos.map(g=>g.fecha?.substring(0,7)).filter(Boolean))].sort().reverse();
  const selMes=document.getElementById('gas-mes');
  if(selMes&&selMes.options.length<=1){
    meses.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;selMes.appendChild(o);});
  }
  // Totales por tipo
  const totPorTipo={};
  data.forEach(g=>{totPorTipo[g.tipo]=(totPorTipo[g.tipo]||0)+g.importe;});
  const totalDiv=document.getElementById('gas-totales');
  if(totalDiv){
    const total=data.reduce((a,g)=>a+g.importe,0);
    totalDiv.innerHTML=`<div class="card" style="padding:8px 14px;flex:0">
      <div style="font-size:10px;color:var(--txt2);text-transform:uppercase">Total gastos</div>
      <div style="font-size:18px;font-weight:700;color:var(--D)">${fmt(total)}</div>
    </div>`+
    Object.entries(totPorTipo).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([tipo,tot])=>`
      <div style="background:var(--bg2);border-radius:8px;padding:8px 12px;font-size:12px">
        <div style="color:var(--txt2)">${tipo}</div>
        <div style="font-weight:700;color:var(--D)">${fmt(tot)}</div>
      </div>`).join('');
  }
  // Tabla
  const sl=data.slice((_gasPg-1)*PP,_gasPg*PP);
  const tbody=document.getElementById('gas-tbody');
  tbody.innerHTML=sl.map(g=>`<tr>
    <td>${g.fecha}</td>
    <td><span class="b bA" style="font-size:11px">${g.tipo}</span></td>
    <td style="color:var(--txt2);font-size:12px">${g.descripcion||'—'}</td>
    <td style="font-size:12px">${g.contrapartida}</td>
    <td style="font-size:11px;color:var(--txt2)">${g.comprobante||'—'}</td>
    <td style="font-weight:700;color:var(--D)">${fmt(g.importe)}</td>
    <td><button class="btn D sm" onclick="elimGasto(${g.id})">🗑</button></td>
  </tr>`).join('');
  pag('gas-pg',data.length,_gasPg,p=>{_gasPg=p;renderGastos();});
}

async function elimGasto(id){
  if(!confirm('¿Eliminar este gasto?'))return;
  await sb.from('gastos').delete().eq('id',id);
  await cargarGastos();renderGastos();
}

// ─── FIN PEDIDO MÓVIL ───
// ─── GASTOS FIJOS ───
const GF_KEY='lila_gastos_fijos';

const GF_TIPOS=[
  'Sueldos y Jornales','Cargas Sociales','Combustible y Lubricante','Seguros',
  'Repuestos Varios','Alquileres','Agua - Luz - Impuestos','Honorarios Profesionales',
  'Fletes','Peaje','Neumáticos','Reparaciones','Marketing y Publicidad',
  'Librería y Papelería','Gastos Informáticos','Gastos Varios'
];

const GF_CUENTA={
  'Sueldos y Jornales':'50201','Cargas Sociales':'50202','Combustible y Lubricante':'50203',
  'Seguros':'50204','Repuestos Varios':'50205','Alquileres':'50206','Agua - Luz - Impuestos':'50207',
  'Gastos Varios':'50208','Gastos Informáticos':'50209','Honorarios Profesionales':'50210',
  'Librería y Papelería':'50221','Peaje':'50222','Reparaciones':'50223',
  'Marketing y Publicidad':'50229','Fletes':'50231','Neumáticos':'50233'
};

let _gf=[];

function cargarGF(){try{_gf=JSON.parse(localStorage.getItem(GF_KEY)||'[]');}catch(e){_gf=[];}}

function guardarGF(){localStorage.setItem(GF_KEY,JSON.stringify(_gf));}

function renderGastosFijos(){
  const tbody=document.getElementById('gf-tbody');
  if(!tbody)return;
  const tiposOpts=GF_TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(!_gf.length){
    tbody.innerHTML='<tr><td colspan="5" style="color:var(--txt2);text-align:center;padding:16px">Sin plantillas. Hacé clic en "+ Agregar".</td></tr>';
    return;
  }
  tbody.innerHTML=_gf.map((g,i)=>`<tr>
    <td><input value="${g.descripcion||''}" placeholder="Ej: Sueldo Juan" oninput="_gf[${i}].descripcion=this.value;guardarGF()" style="width:100%;padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px"></td>
    <td><select onchange="_gf[${i}].tipo=this.value;guardarGF()" style="padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:12px;width:100%">
      <option value="">— Elegir —</option>
      ${GF_TIPOS.map(t=>`<option value="${t}" ${g.tipo===t?'selected':''}>${t}</option>`).join('')}
    </select></td>
    <td style="text-align:right">
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
        <span style="font-size:13px;color:var(--txt2)">$</span>
        <input type="number" value="${g.importe||0}" min="0" step="100" oninput="_gf[${i}].importe=parseFloat(this.value)||0;guardarGF()" style="width:110px;padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px;text-align:right">
      </div>
    </td>
    <td style="text-align:center">
      <input type="checkbox" ${g.activo!==false?'checked':''} onchange="_gf[${i}].activo=this.checked;guardarGF()" style="width:16px;height:16px;cursor:pointer">
    </td>
    <td><button class="btn D sm" onclick="_gf.splice(${i},1);guardarGF();renderGastosFijos()">🗑</button></td>
  </tr>`).join('');
  renderResumenGF();
}

function agregarGastoFijo(){
  _gf.push({descripcion:'',tipo:'Gastos Varios',importe:0,activo:true});
  guardarGF();renderGastosFijos();
  setTimeout(()=>{const rows=document.querySelectorAll('#gf-tbody tr');if(rows.length){const inp=rows[rows.length-1].querySelector('input');if(inp)inp.focus();}},50);
}

function renderResumenGF(){
  const el=document.getElementById('gf-resumen');
  if(!el)return;
  const activos=_gf.filter(g=>g.activo!==false&&g.importe>0);
  if(!activos.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin gastos fijos configurados.</div>';return;}
  const total=activos.reduce((a,g)=>a+(g.importe||0),0);
  const porTipo={};
  activos.forEach(g=>{porTipo[g.tipo||'Sin tipo']=(porTipo[g.tipo||'Sin tipo']||0)+(g.importe||0);});
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px">
      <div style="background:var(--bg2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--txt2)">TOTAL MENSUAL ESTIMADO</div>
        <div style="font-size:20px;font-weight:700;color:var(--D);margin-top:4px">${fmt(total)}</div>
      </div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--txt2)">ÍTEMS ACTIVOS</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px">${activos.length}</div>
      </div>
    </div>
    ${Object.entries(porTipo).sort((a,b)=>b[1]-a[1]).map(([tipo,tot])=>`
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd);font-size:13px">
        <span style="color:var(--txt2)">${tipo}</span>
        <span style="font-weight:600;color:var(--D)">${fmt(tot)}</span>
      </div>`).join('')}`;
}

async function aplicarGastosFijos(){
  const mesVal=document.getElementById('gf-mes').value;
  const fechaComp=document.getElementById('gf-fecha-comp').value;
  if(!mesVal){alert('Seleccioná el mes a registrar');return;}
  const activos=_gf.filter(g=>g.activo!==false&&g.tipo&&g.importe>0);
  if(!activos.length){alert('No hay gastos fijos activos con tipo e importe definidos');return;}

  const estado=document.getElementById('gf-estado');
  estado.innerHTML=`<div style="color:var(--txt2);font-size:13px">⏳ Registrando ${activos.length} gastos...</div>`;

  const fechaBase=fechaComp||mesVal+'-01';
  const errores=[];
  let ok=0;

  for(const g of activos){
    const cuentaCod=GF_CUENTA[g.tipo]||'50208';
    const {error}=await sb.from('gastos').insert({
      fecha:fechaBase,
      tipo:g.tipo,
      cuenta_cod:cuentaCod,
      cuenta_nom:g.tipo,
      importe:g.importe,
      contrapartida:'Caja',
      descripcion:(g.descripcion||g.tipo)+' — gasto fijo '+mesVal,
      comprobante:'',
      vendedor:usuarioActual?.nombre||''
    });
    if(error)errores.push(g.descripcion||g.tipo);
    else ok++;
  }

  await cargarGastos();
  if(errores.length){
    estado.innerHTML=`<div style="background:var(--WL);border-radius:6px;padding:10px;font-size:13px">
      ⚠ ${ok} gastos registrados. Errores en: ${errores.join(', ')}</div>`;
  }else{
    estado.innerHTML=`<div style="background:var(--PL);border-radius:6px;padding:10px;font-size:13px">
      ✓ ${ok} gastos fijos registrados para ${mesVal}. Podés verlos en <b>Contabilidad → Gastos</b>.</div>`;
  }
}

function initGastosFijos(){
  cargarGF();renderGastosFijos();
  const hoy=new Date();
  const mes=document.getElementById('gf-mes');
  const fc=document.getElementById('gf-fecha-comp');
  if(mes&&!mes.value)mes.value=hoy.toISOString().substring(0,7);
  if(fc&&!fc.value)fc.value=hoy.toISOString().split('T')[0];
}

// ─── CONTRIBUCIÓN MARGINAL POR ZONA ───
function initContribZona(){
  const hoy=new Date().toISOString().split('T')[0];
  const primerDia=hoy.substring(0,7)+'-01';
  const d=document.getElementById('cm-desde'),h=document.getElementById('cm-hasta');
  if(d&&!d.value)d.value=primerDia;
  if(h&&!h.value)h.value=hoy;
  document.getElementById('cm-res-panel').style.display='none';
}

function calcularContribMarginal(){
  const desde=document.getElementById('cm-desde').value;
  const hasta=document.getElementById('cm-hasta').value;

  const rems=_remitos.filter(r=>(!desde||r.fecha>=desde)&&(!hasta||r.fecha<=hasta));

  // Mapa de costos por producto id
  const costoMap={};
  _productos.forEach(p=>{costoMap[p.id]=p.costo||0;});

  // Acumular por zona y por producto
  const porZona={};
  const porProd={};
  let totVentas=0,totCMV=0,totRems=0;

  rems.forEach(r=>{
    const cli=_clientes.find(c=>c.id===r.cliente_id);
    const zona=(cli?.zona)||'Sin zona';
    if(!porZona[zona])porZona[zona]={ventas:0,cmv:0,rems:0};
    porZona[zona].rems++;
    totRems++;

    (r.items||[]).forEach(it=>{
      const venta=it.precio*it.cant*(1-(it.dto||0)/100);
      const costo=(costoMap[it.id]||0)*it.cant;
      porZona[zona].ventas+=venta;
      porZona[zona].cmv+=costo;
      totVentas+=venta;
      totCMV+=costo;

      const nom=it.nom||'—';
      if(!porProd[nom])porProd[nom]={cant:0,ventas:0,cmv:0};
      porProd[nom].cant+=it.cant;
      porProd[nom].ventas+=venta;
      porProd[nom].cmv+=costo;
    });
  });

  const totMargen=totVentas-totCMV;
  const pctMargen=totVentas>0?totMargen/totVentas*100:0;

  // KPIs
  const kpiColor=(pct)=>pct>=30?'var(--P)':pct>=15?'var(--W)':'var(--D)';
  document.getElementById('cm-kpis').innerHTML=`
    <div class="card" style="text-align:center;padding:12px 8px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px">VENTAS TOTALES</div>
      <div style="font-size:20px;font-weight:700;color:var(--P)">${fmt(totVentas)}</div>
      <div style="font-size:11px;color:var(--txt2)">${totRems} remitos</div>
    </div>
    <div class="card" style="text-align:center;padding:12px 8px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px">CMV</div>
      <div style="font-size:20px;font-weight:700;color:var(--D)">${fmt(totCMV)}</div>
      <div style="font-size:11px;color:var(--txt2)">${totVentas>0?Math.round(totCMV/totVentas*100):0}% de ventas</div>
    </div>
    <div class="card" style="text-align:center;padding:12px 8px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px">CONTRIB. MARGINAL</div>
      <div style="font-size:20px;font-weight:700;color:${kpiColor(pctMargen)}">${fmt(totMargen)}</div>
      <div style="font-size:11px;color:var(--txt2)">${pctMargen.toFixed(1)}% de margen</div>
    </div>`;

  // Tabla por zona
  const zonasArr=Object.entries(porZona).sort((a,b)=>b[1].ventas-a[1].ventas);
  const tbody=document.getElementById('cm-zona-tbody');
  if(!zonasArr.length){
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--txt2)">Sin datos en ese período</td></tr>';
  }else{
    const margenBadge=pct=>pct>=30?'bP':pct>=15?'bW':'bD';
    tbody.innerHTML=zonasArr.map(([z,d])=>{
      const margen=d.ventas-d.cmv;
      const pct=d.ventas>0?margen/d.ventas*100:0;
      const pctVentas=totVentas>0?Math.round(d.ventas/totVentas*100):0;
      return `<tr>
        <td><span class="b bA">${_zonas.find(x=>x.codigo===z)?.descripcion||z}</span></td>
        <td style="text-align:right;font-weight:600">${fmt(d.ventas)}
          <div style="height:4px;background:var(--PL);border-radius:2px;margin-top:3px"><div style="height:4px;background:var(--P);border-radius:2px;width:${pctVentas}%"></div></div>
        </td>
        <td style="text-align:right;color:var(--D)">${fmt(d.cmv)}</td>
        <td style="text-align:right;font-weight:700">${fmt(margen)}</td>
        <td style="text-align:right"><span class="b ${margenBadge(pct)}">${pct.toFixed(1)}%</span></td>
        <td style="text-align:right;color:var(--txt2)">${d.rems}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML+=`<tr style="background:var(--bg2);font-weight:700;border-top:2px solid var(--brd)">
      <td>TOTAL</td>
      <td style="text-align:right">${fmt(totVentas)}</td>
      <td style="text-align:right;color:var(--D)">${fmt(totCMV)}</td>
      <td style="text-align:right">${fmt(totMargen)}</td>
      <td style="text-align:right">${pctMargen.toFixed(1)}%</td>
      <td style="text-align:right;color:var(--txt2)">${totRems}</td>
    </tr>`;
  }

  // Top productos
  const prodsArr=Object.entries(porProd).sort((a,b)=>(b[1].ventas-b[1].cmv)-(a[1].ventas-a[1].cmv)).slice(0,15);
  const ptbody=document.getElementById('cm-prod-tbody');
  const hasCosto=_productos.some(p=>p.costo>0);
  if(!hasCosto){
    ptbody.innerHTML='<tr><td colspan="6" style="color:var(--txt2);text-align:center;padding:12px">Los productos no tienen costo cargado — el CMV es $0. Ingresá el costo en el panel Productos.</td></tr>';
  }else if(!prodsArr.length){
    ptbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--txt2)">Sin datos</td></tr>';
  }else{
    ptbody.innerHTML=prodsArr.map(([nom,d])=>{
      const margen=d.ventas-d.cmv;
      const pct=d.ventas>0?margen/d.ventas*100:0;
      const margenBadge=pct>=30?'bP':pct>=15?'bW':'bD';
      return `<tr>
        <td style="font-weight:500">${nom}</td>
        <td style="text-align:right;color:var(--txt2)">${d.cant}</td>
        <td style="text-align:right">${fmt(d.ventas)}</td>
        <td style="text-align:right;color:var(--D)">${fmt(d.cmv)}</td>
        <td style="text-align:right;font-weight:600">${fmt(margen)}</td>
        <td style="text-align:right"><span class="b ${margenBadge}">${pct.toFixed(1)}%</span></td>
      </tr>`;
    }).join('');
  }

  document.getElementById('cm-res-panel').style.display='block';
}

// ─── COMISIONES POR PERSONA ───
let _comPersonas=[];

function cargarComPersonas(){try{_comPersonas=JSON.parse(localStorage.getItem('lila_com_personas')||'[]');}catch(e){_comPersonas=[];}}

function guardarComPersonas(){localStorage.setItem('lila_com_personas',JSON.stringify(_comPersonas));}

function renderComPersonas(){
  const tbody=document.getElementById('com-personas-tbody');
  if(!tbody)return;
  if(!_comPersonas.length){
    tbody.innerHTML='<tr><td colspan="5" style="color:var(--txt2);text-align:center;padding:16px">Sin personas configuradas. Hacé clic en "+ Agregar persona".</td></tr>';
    return;
  }
  tbody.innerHTML=_comPersonas.map((p,i)=>`<tr>
    <td><input value="${p.nombre||''}" oninput="_comPersonas[${i}].nombre=this.value;guardarComPersonas()" style="width:100%;padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px"></td>
    <td><select onchange="_comPersonas[${i}].rol=this.value;guardarComPersonas()" style="padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px">
      <option value="vendedor" ${(p.rol||'vendedor')==='vendedor'?'selected':''}>Vendedor</option>
      <option value="cobrador" ${p.rol==='cobrador'?'selected':''}>Cobrador</option>
      <option value="repartidor" ${p.rol==='repartidor'?'selected':''}>Repartidor</option>
    </select></td>
    <td style="text-align:center"><input type="number" value="${p.pct_ventas??2}" min="0" max="100" step="0.1" oninput="_comPersonas[${i}].pct_ventas=parseFloat(this.value)||0;guardarComPersonas()" style="width:65px;padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px;text-align:right"> %</td>
    <td style="text-align:center"><input type="number" value="${p.pct_cobranza??1}" min="0" max="100" step="0.1" oninput="_comPersonas[${i}].pct_cobranza=parseFloat(this.value)||0;guardarComPersonas()" style="width:65px;padding:5px 7px;border:1px solid var(--brd);border-radius:6px;font-size:13px;text-align:right"> %</td>
    <td><button class="btn D sm" onclick="_comPersonas.splice(${i},1);guardarComPersonas();renderComPersonas()">🗑</button></td>
  </tr>`).join('');
}

function agregarPersonaCom(){
  _comPersonas.push({nombre:'',rol:'vendedor',pct_ventas:2,pct_cobranza:1});
  guardarComPersonas();renderComPersonas();
  setTimeout(()=>{const rows=document.querySelectorAll('#com-personas-tbody tr');if(rows.length){const inp=rows[rows.length-1].querySelector('input');if(inp)inp.focus();}},50);
}

function initComisiones(){
  cargarComPersonas();renderComPersonas();
  const hoy=new Date().toISOString().split('T')[0];
  const primerDia=hoy.substring(0,7)+'-01';
  const desde=document.getElementById('com-desde');const hasta=document.getElementById('com-hasta');
  if(desde&&!desde.value)desde.value=primerDia;
  if(hasta&&!hasta.value)hasta.value=hoy;
  const sel=document.getElementById('com-zona-fil');
  if(sel&&sel.options.length<=1){
    const zonas=[...new Set(_clientes.map(c=>c.zona||'').filter(Boolean))].sort();
    zonas.forEach(z=>{const o=document.createElement('option');o.value=z;o.textContent=nombreZona(z);sel.appendChild(o);});
  }
  document.getElementById('com-res-panel').style.display='none';
}

function calcularComisionesPorPersona(){
  const desde=document.getElementById('com-desde').value;
  const hasta=document.getElementById('com-hasta').value;
  const zonaFil=document.getElementById('com-zona-fil').value;
  if(!_comPersonas.length){alert('Agregá al menos una persona');return;}

  let rems=_remitos.filter(r=>(!desde||r.fecha>=desde)&&(!hasta||r.fecha<=hasta));
  let cobs=_cobros.filter(c=>(!desde||c.fecha>=desde)&&(!hasta||c.fecha<=hasta));

  if(zonaFil){
    rems=rems.filter(r=>{const cli=_clientes.find(c=>c.id===r.cliente_id);return (cli?.zona||'')===zonaFil;});
    cobs=cobs.filter(c=>{const cli=_clientes.find(cl=>cl.id===c.cliente_id);return (cli?.zona||'')===zonaFil;});
  }

  const rolBadge=r=>r==='vendedor'?'bP':r==='cobrador'?'bA':'bW';
  const rolLabel=r=>({vendedor:'Vendedor',cobrador:'Cobrador',repartidor:'Repartidor'}[r]||r);

  const res=_comPersonas.map(p=>{
    const nom=(p.nombre||'').toLowerCase().trim();
    const remsP=rems.filter(r=>(r.vendedor||'').toLowerCase().trim()===nom);
    const cobsP=cobs.filter(c=>(c.vendedor||'').toLowerCase().trim()===nom);
    const ventas=remsP.reduce((a,r)=>a+(r.total||0),0);
    const cobranza=cobsP.reduce((a,c)=>a+(c.importe||0),0);
    const comV=ventas*(p.pct_ventas||0)/100;
    const comC=cobranza*(p.pct_cobranza||0)/100;
    return {...p,ventas,cobranza,comV,comC,total:comV+comC};
  });

  const tbody=document.getElementById('com-res-tbody');
  tbody.innerHTML=res.map(p=>`<tr>
    <td style="font-weight:600">${p.nombre||'—'}</td>
    <td><span class="b ${rolBadge(p.rol)}">${rolLabel(p.rol)}</span></td>
    <td style="text-align:right">${fmt(p.ventas)}</td>
    <td style="text-align:right">${fmt(p.cobranza)}</td>
    <td style="text-align:right;color:var(--P)">${fmt(p.comV)} <span style="font-size:10px;color:var(--txt2)">${p.pct_ventas}%</span></td>
    <td style="text-align:right;color:var(--A)">${fmt(p.comC)} <span style="font-size:10px;color:var(--txt2)">${p.pct_cobranza}%</span></td>
    <td style="text-align:right;font-weight:700;color:var(--PD);font-size:15px">${fmt(p.total)}</td>
  </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--txt2)">Sin datos en ese período</td></tr>';

  const totVentas=res.reduce((a,p)=>a+p.ventas,0),totCobs=res.reduce((a,p)=>a+p.cobranza,0);
  const totComV=res.reduce((a,p)=>a+p.comV,0),totComC=res.reduce((a,p)=>a+p.comC,0),totCom=res.reduce((a,p)=>a+p.total,0);
  tbody.innerHTML+=`<tr style="background:var(--bg2);font-weight:700;border-top:2px solid var(--brd)">
    <td colspan="2">TOTAL</td>
    <td style="text-align:right">${fmt(totVentas)}</td>
    <td style="text-align:right">${fmt(totCobs)}</td>
    <td style="text-align:right;color:var(--P)">${fmt(totComV)}</td>
    <td style="text-align:right;color:var(--A)">${fmt(totComC)}</td>
    <td style="text-align:right;color:var(--PD);font-size:15px">${fmt(totCom)}</td>
  </tr>`;

  // Desglose por zona
  const porZona={};
  rems.forEach(r=>{
    const cli=_clientes.find(c=>c.id===r.cliente_id);
    const z=(cli?.zona)||'Sin zona';
    if(!porZona[z])porZona[z]={ventas:0,cobranza:0};
    porZona[z].ventas+=(r.total||0);
  });
  cobs.forEach(c=>{
    const cli=_clientes.find(cl=>cl.id===c.cliente_id);
    const z=(cli?.zona)||'Sin zona';
    if(!porZona[z])porZona[z]={ventas:0,cobranza:0};
    porZona[z].cobranza+=(c.importe||0);
  });
  const zonaDiv=document.getElementById('com-zonas-res');
  const zonasArr=Object.entries(porZona).sort((a,b)=>b[1].ventas-a[1].ventas);
  if(zonasArr.length){
    const totalZ=zonasArr.reduce((a,[,d])=>a+d.ventas,0);
    zonaDiv.innerHTML=`<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Zona</th><th style="text-align:right">Ventas</th><th style="text-align:right">% del total</th><th style="text-align:right">Cobranza</th><th style="text-align:right">% Cobrado</th></tr></thead>
      <tbody>${zonasArr.map(([z,d])=>{
        const pctTotal=totalZ>0?Math.round(d.ventas/totalZ*100):0;
        const pctCob=d.ventas>0?Math.round(d.cobranza/d.ventas*100):0;
        return `<tr>
          <td><span class="b bA">${_zonas.find(x=>x.codigo===z)?.descripcion||z}</span></td>
          <td style="text-align:right;font-weight:600">${fmt(d.ventas)}</td>
          <td style="text-align:right"><div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
            <div style="background:var(--PL);border-radius:3px;height:8px;width:${pctTotal}px;max-width:80px"></div>
            <span style="font-size:11px;color:var(--txt2)">${pctTotal}%</span></div></td>
          <td style="text-align:right">${fmt(d.cobranza)}</td>
          <td style="text-align:right"><span class="b ${pctCob>=80?'bP':pctCob>=50?'bW':'bD'}">${pctCob}%</span></td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr style="font-weight:700;background:var(--bg2)">
        <td>TOTAL</td>
        <td style="text-align:right">${fmt(totalZ)}</td>
        <td style="text-align:right">100%</td>
        <td style="text-align:right">${fmt(zonasArr.reduce((a,[,d])=>a+d.cobranza,0))}</td>
        <td></td>
      </tr></tfoot>
    </table></div>`;
  }else{
    zonaDiv.innerHTML='<div style="color:var(--txt2);font-size:12px;padding:10px">Sin datos de zona para el período seleccionado.</div>';
  }
  document.getElementById('com-res-panel').style.display='block';
}

// ─── COMPROBANTES DE COMPRAS ───
let _comprobantes = [], _compPg = 1;
let _cargaArtCompId = null;

async function cargarComprobantes(){
  const {data} = await sb.from('comprobantes_compras').select('*').order('fecha', {ascending:false});
  _comprobantes = data || [];
}

// ─── BUSCADOR DE PROVEEDORES EN COMPROBANTE ──────────────────────────────────
function dropProvComp(){
  const q=(document.getElementById('comp-prov-q')?.value||'').toLowerCase();
  const drop=document.getElementById('comp-prov-drop');if(!drop)return;
  if(q.length<1){drop.style.display='none';return;}
  const m=_proveedores.filter(p=>(p.nombre||'').toLowerCase().includes(q)).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));
  drop.innerHTML=m.map(p=>`<div style="padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--brd);font-size:13px"
    onmousedown="selProvComp(${p.id})"><strong>${p.nombre}</strong>
    ${p.cuit?'<span style="font-size:11px;color:var(--txt2);margin-left:6px">CUIT: '+p.cuit+'</span>':''}</div>`).join('');
  drop.style.display=m.length?'block':'none';
}

function buscarCodProv(){
  const cod=(document.getElementById('comp-prov-cod')?.value||'').trim();
  const el=document.getElementById('comp-prov-cod');
  if(!cod){if(el)el.style.borderColor='';return;}
  const p=_proveedores.find(x=>String(x.codigo||x.id).trim()===cod);
  if(p){
    selProvComp(p.id);
    if(el)el.style.borderColor='var(--P)';
    document.getElementById('comp-prov-q').value=p.nombre;
    setTimeout(()=>document.getElementById('comp-nro')?.focus(),50);
  } else {
    if(el)el.style.borderColor='var(--D)';
  }
}

function abrirBuscadorProv(){
  const existing=document.getElementById('modal-busq-prov');if(existing)existing.remove();
  const div=document.createElement('div');
  div.id='modal-busq-prov';
  div.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML=`
    <div style="background:var(--bg);border-radius:12px;padding:20px;width:420px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:14px">🔍 Buscar proveedor</span>
        <button onclick="document.getElementById('modal-busq-prov').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--txt2)">✕</button>
      </div>
      <input id="busq-prov-q" placeholder="Nombre, CUIT o código..." autocomplete="off"
        style="padding:8px 12px;border:1px solid var(--brd);border-radius:8px;font-size:14px;margin-bottom:10px"
        oninput="filtrarBusqProv()"
        onkeydown="navBusqProv(event)">
      <div style="display:flex;gap:6px;margin-bottom:10px" id="busq-prov-orden-row"></div>
      <div id="busq-prov-list" style="overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1;max-height:50vh"></div>
    </div>`;
  document.body.appendChild(div);
  div.addEventListener('click',e=>{if(e.target===div)div.remove();});
  _busqProvOrden='az';
  renderBusqProvOrden();
  setTimeout(()=>{document.getElementById('busq-prov-q')?.focus();filtrarBusqProv();},50);
}

let _busqProvIdx=-1;
let _busqProvOrden='az'; // 'az' | 'saldo_desc' | 'saldo_asc'

function renderBusqProvOrden(){
  const row=document.getElementById('busq-prov-orden-row');if(!row)return;
  const opciones=[['az','A-Z'],['saldo_desc','↓ Mayor saldo'],['saldo_asc','↑ Menor saldo']];
  const activo='flex:1;padding:6px 8px;border-radius:8px;border:1.5px solid var(--P);background:var(--P);color:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit';
  const inactivo='flex:1;padding:6px 8px;border-radius:8px;border:1.5px solid var(--brd);background:var(--bg);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit';
  row.innerHTML=opciones.map(([val,label])=>
    `<button onclick="_busqProvOrden='${val}';renderBusqProvOrden();filtrarBusqProv()" style="${_busqProvOrden===val?activo:inactivo}">${label}</button>`
  ).join('');
}

// Lo que le debemos a un proveedor: comprobantes de compra aún no pagados.
function _saldoProveedor(provId){
  return (_comprobantes||[]).filter(c=>String(c.proveedor_id)===String(provId)&&c.estado!=='pagado')
    .reduce((s,c)=>s+(c.importe||0),0);
}

function filtrarBusqProv(){
  _busqProvIdx=-1;
  const q=(document.getElementById('busq-prov-q')?.value||'').toLowerCase();
  const lista=document.getElementById('busq-prov-list');if(!lista)return;
  let res=_proveedores.filter(p=>
    !q||(p.nombre||'').toLowerCase().includes(q)||String(p.cuit||'').includes(q)||String(p.codigo||p.id).includes(q)
  ).map(p=>({...p,_saldo:_saldoProveedor(p.id)}));
  if(_busqProvOrden==='saldo_desc') res=res.sort((a,b)=>b._saldo-a._saldo);
  else if(_busqProvOrden==='saldo_asc') res=res.sort((a,b)=>a._saldo-b._saldo);
  else res=res.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));
  lista.innerHTML=res.length?res.map(p=>`
    <div style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--brd);display:flex;align-items:center;justify-content:space-between;gap:10px"
      onmousedown="selProvComp(${p.id});document.getElementById('modal-busq-prov').remove();setTimeout(()=>document.getElementById('comp-nro')?.focus(),50)">
      <div>
        <div style="font-weight:600;font-size:13px">${p.nombre}</div>
        ${p.cuit?'<div style="font-size:11px;color:var(--txt2)">CUIT: '+p.cuit+'</div>':''}
      </div>
      ${p._saldo?`<div style="font-size:12px;font-weight:700;color:var(--D);flex-shrink:0">${fmt(p._saldo)}</div>`:''}
    </div>`).join(''):'<div style="padding:16px;text-align:center;color:var(--txt2);font-size:13px">Sin resultados</div>';
}

function navBusqProv(e){
  const lista=document.getElementById('busq-prov-list');if(!lista)return;
  const items=lista.querySelectorAll('div[onmousedown]');
  if(!items.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();_busqProvIdx=Math.min(_busqProvIdx+1,items.length-1);items.forEach((el,i)=>el.style.background=i===_busqProvIdx?'var(--PL)':'');items[_busqProvIdx]?.scrollIntoView({block:'nearest'});}
  else if(e.key==='ArrowUp'){e.preventDefault();_busqProvIdx=Math.max(_busqProvIdx-1,0);items.forEach((el,i)=>el.style.background=i===_busqProvIdx?'var(--PL)':'');items[_busqProvIdx]?.scrollIntoView({block:'nearest'});}
  else if(e.key==='Enter'){e.preventDefault();const target=_busqProvIdx>=0?items[_busqProvIdx]:items.length===1?items[0]:null;if(target){const attr=target.getAttribute('onmousedown');if(attr)eval(attr);}_busqProvIdx=-1;}
  else if(e.key==='Escape'){document.getElementById('modal-busq-prov')?.remove();}
}

async function abrirComprobante(){
  document.getElementById('comp-edit-id').value = '';
  document.getElementById('m-comp-title').textContent = 'Nuevo comprobante';
  document.getElementById('comp-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('comp-nro').value = '';
  document.getElementById('comp-desc').value = '';
  document.getElementById('comp-importe').value = '0';
  document.getElementById('comp-obs').value = '';
  document.getElementById('comp-condpago').value = '0';
  document.getElementById('comp-tipo').value = 'factura';
  
  // Calcular vencimiento
  calcVencimiento();
  
  // Recargar proveedores por si acaso
  if(!_proveedores.length) await cargarProveedores();

  // Resetear campos proveedor
  ['comp-prov-id','comp-prov-q','comp-prov-cod'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';if(el.style)el.style.borderColor='';}});
  document.getElementById('comp-prov-drop').style.display='none';

  // Resetear cuenta
  document.getElementById('comp-cuenta').value = '50101|Costo Mercadería Vendida';
  
  // Limpiar productos previos
  document.getElementById('comp-costos-lista').innerHTML='';
  document.getElementById('comp-costos-section').style.display='block';
  const toggleBtn=document.getElementById('comp-costos-toggle');
  if(toggleBtn)toggleBtn.textContent='ocultar ▲';

  document.getElementById('m-comprobante').classList.add('on');
  setTimeout(()=>document.getElementById('comp-prov-cod').focus(), 100);
}

function calcCostoReal(costoFacturado, condFiscal, pctFact){
  if(condFiscal==='no_factura') return costoFacturado;
  if(condFiscal==='factura_parcial'){
    const part=(pctFact||50)/100;
    return costoFacturado*part/1.21 + costoFacturado*(1-part);
  }
  // factura_todo (default)
  return costoFacturado/1.21;
}

function selProvComp(id){
  if(id!=null){
    document.getElementById('comp-prov-id').value=id;
    const p=_proveedores.find(x=>x.id===id||String(x.id)===String(id));
    if(p){
      const q=document.getElementById('comp-prov-q');if(q)q.value=p.nombre;
      const cod=document.getElementById('comp-prov-cod');if(cod){cod.value=p.codigo||p.id||'';cod.style.borderColor='var(--P)';}
      document.getElementById('comp-prov-drop').style.display='none';
    }
  }
  const prov = _proveedores.find(p => String(p.id) === String(document.getElementById('comp-prov-id').value));
  if(!prov) return;
  
  // Auto-completar condición de pago
  if(prov.condicion_pago){
    const dias = parseInt(prov.condicion_pago) || 0;
    const sel = document.getElementById('comp-condpago');
    const opciones = [0,7,15,30,45,60,90];
    const cercano = opciones.reduce((a,b) => Math.abs(b-dias) < Math.abs(a-dias) ? b : a);
    sel.value = String(cercano);
    calcVencimiento();
  }
  
  // Auto-completar cuenta contable del proveedor
  if(prov.cuenta_defecto){
    document.getElementById('comp-cuenta').value = prov.cuenta_defecto;
  }
  // Mostrar condición fiscal
  let cfTexto='', cfColor='var(--txt2)';
  if(prov.condicion_fiscal==='no_factura'){cfTexto='⚠️ No factura — el precio ingresado es el costo real (sin descontar IVA)';cfColor='var(--W)';}
  else if(prov.condicion_fiscal==='factura_parcial'){cfTexto=`📋 Factura parcial (${prov.pct_factura||'?'}%) — se calculará costo real ponderado`;cfColor='var(--A)';}
  else{cfTexto='✅ Factura todo — el costo real = precio ÷ 1.21';cfColor='var(--P)';}
  let cfBadge=document.getElementById('comp-cf-badge');
  if(!cfBadge){cfBadge=document.createElement('div');cfBadge.id='comp-cf-badge';cfBadge.style.cssText='padding:6px 14px;font-size:11px;border-radius:6px;margin:4px 18px 0;background:var(--bg2)';document.getElementById('comp-ia-status').insertAdjacentElement('afterend',cfBadge);}
  cfBadge.style.color=cfColor;cfBadge.style.display='block';cfBadge.textContent=cfTexto;
}

function calcVencimiento(){
  const fecha = document.getElementById('comp-fecha').value;
  const dias = parseInt(document.getElementById('comp-condpago').value) || 0;
  if(!fecha) return;
  const venc = new Date(fecha);
  venc.setDate(venc.getDate() + dias);
  document.getElementById('comp-vencimiento').value = venc.toISOString().split('T')[0];
}

async function guardarComprobante(){
  const provId = document.getElementById('comp-prov-id').value;
  if(!provId){ alert('Seleccioná un proveedor'); return; }
  const importe = parseFloat(document.getElementById('comp-importe').value) || 0;
  if(importe <= 0){ alert('Ingresá el importe'); return; }
  
  const prov = _proveedores.find(p => String(p.id) === String(provId));
  const fecha = document.getElementById('comp-fecha').value;
  const nro = document.getElementById('comp-nro').value.trim();
  const desc = document.getElementById('comp-desc').value.trim();
  const venc = document.getElementById('comp-vencimiento').value;
  const condpago = parseInt(document.getElementById('comp-condpago').value) || 0;
  const tipo = document.getElementById('comp-tipo').value;
  const obs = document.getElementById('comp-obs').value.trim();
  const cuenta = document.getElementById('comp-cuenta').value;
  const formapago = document.getElementById('comp-formapago').value;
  const [cuentaCod, cuentaNom] = cuenta.split('|');
  const [pagoCod, pagoNom] = formapago.split('|');
  
  // Determinar estado
  const hoy = new Date().toISOString().split('T')[0];
  const estado = condpago === 0 ? 'pagado' : (venc < hoy ? 'vencido' : 'pendiente');
  
  const editId = document.getElementById('comp-edit-id').value;
  const obj = {
    proveedor_id: parseInt(provId),
    proveedor_nom: prov?.nombre || '',
    fecha, nro_comprobante: nro,
    tipo, descripcion: desc,
    importe, condicion_pago: condpago,
    fecha_vencimiento: venc,
    estado,
    cuenta_cod: cuentaCod, cuenta_nom: cuentaNom,
    forma_pago_cod: pagoCod, forma_pago_nom: pagoNom,
    observaciones: obs
  };
  
  let compId;
  if(editId){
    await sb.from('comprobantes_compras').update(obj).eq('id', editId);
    compId = parseInt(editId);
  } else {
    const {data} = await sb.from('comprobantes_compras').insert(obj).select().single();
    compId = data?.id;
  }
  
  // Generar asiento contable automático
  if(compId && !editId){
    const {data:asiento} = await sb.from('asientos').insert({
      fecha,
      descripcion: `${tipo.toUpperCase()} ${nro} - ${prov?.nombre} - ${desc||tipo}`,
      tipo: 'COMPRA',
      referencia_id: compId,
      referencia_tipo: 'comprobante_compra'
    }).select().single();
    
    if(asiento){
      const detalles = [
        {asiento_id: asiento.id, cuenta_cod: cuentaCod, cuenta_nom: cuentaNom, debe: importe, haber: 0},
        {asiento_id: asiento.id, cuenta_cod: pagoCod === 'cuenta_corriente' ? '21001' : pagoCod, cuenta_nom: pagoNom, debe: 0, haber: importe}
      ];
      await sb.from('asientos_detalle').insert(detalles);
    }
  }
  
  // Procesar productos: actualizar stock + costos reales (con lógica IVA del proveedor)
  const condFiscal = prov?.condicion_fiscal || 'factura_todo';
  const pctFact = prov?.pct_factura || 100;
  const costoRows=[...document.querySelectorAll('.comp-costo-row')];
  let costosCambiados=0, stockActualizado=0;
  const items=[];
  for(const row of costoRows){
    const prodId=row.dataset.prodId;
    if(!prodId)continue;
    const prod=_productos.find(x=>String(x.id)===String(prodId));
    if(!prod)continue;
    const precioFacturado=parseFloat(row.querySelector('.comp-costo-val')?.value)||0;
    const cantidad=parseFloat(row.querySelector('.comp-costo-cant')?.value)||0;
    if(precioFacturado<=0&&cantidad<=0)continue;

    const upd={};
    if(precioFacturado>0){
      const costoReal=calcCostoReal(precioFacturado, condFiscal, pctFact);
      // Costo promedio ponderado: (stock_actual × costo_actual + cant_nueva × costo_real) / (stock_actual + cant_nueva)
      const stockActual=prod.stock||0;
      const costoActual=prod.costo||costoReal;
      const costoPromedio=stockActual>0&&cantidad>0
        ?Math.round((stockActual*costoActual+cantidad*costoReal)/(stockActual+cantidad)*100)/100
        :Math.round(costoReal*100)/100;
      upd.costo=costoPromedio;
      const margen=prod.margen_objetivo||30;
      upd.precio=margen>0&&margen<100?Math.ceil(costoPromedio/(1-margen/100)):prod.precio;
      costosCambiados++;
    }
    if(cantidad>0){
      upd.stock=(prod.stock||0)+cantidad;
      stockActualizado++;
    }
    await sb.from('productos').update(upd).eq('id',prodId);
    items.push({
      producto_id:parseInt(prodId),
      producto_nom:prod.nombre||'',
      codigo:prod.codigo||'',
      cantidad,
      costo_unitario:upd.costo||0,
      subtotal:cantidad*(upd.costo||0)
    });
  }

  // Guardar items en el comprobante (requiere columna items jsonb)
  if(compId&&items.length>0){
    await sb.from('comprobantes_compras').update({items}).eq('id',compId);
  }

  if(costosCambiados>0||stockActualizado>0){
    await cargarProductos();renderProductos();
    const partes=[];
    if(costosCambiados>0)partes.push(`${costosCambiados} costo${costosCambiados>1?'s':''} actualizado${costosCambiados>1?'s':''}`);
    if(stockActualizado>0)partes.push(`${stockActualizado} producto${stockActualizado>1?'s':''} con stock sumado`);
    toast(`✅ ${partes.join(' · ')}`);
  }

  cerrar('m-comprobante');
  document.getElementById('comp-costos-lista').innerHTML='';
  await cargarComprobantes();
  renderComprobantes();
  return compId;
}

function toggleCompCostos(){
  const sec=document.getElementById('comp-costos-section');
  const btn=document.getElementById('comp-costos-toggle');
  const open=sec.style.display!=='none';
  sec.style.display=open?'none':'block';
  if(btn)btn.textContent=open?'mostrar ▼':'ocultar ▲';
}

function agregarItemCostoComp(){
  const lista=document.getElementById('comp-costos-lista');
  const opts=_productos.map(p=>`<option value="${p.id}">${p.codigo?p.codigo+' — ':''}${p.nombre}</option>`).join('');
  const row=document.createElement('div');
  row.className='comp-costo-row';
  row.style.cssText='display:grid;grid-template-columns:1fr 72px 130px 90px 20px;gap:4px;align-items:center';
  row.innerHTML=`
    <select class="comp-costo-sel" style="padding:5px 6px;border:1px solid var(--brd);border-radius:6px;font-size:12px;width:100%"
      onchange="this.closest('.comp-costo-row').dataset.prodId=this.value;actualizarCostoAnterior(this)">
      <option value="">— Producto —</option>${opts}
    </select>
    <input type="number" class="comp-costo-cant" placeholder="0" min="0" step="0.001"
      style="padding:5px 6px;border:2px solid var(--P);border-radius:6px;font-size:13px;font-weight:700;text-align:right;width:100%;box-sizing:border-box"
      title="Cantidad recibida (actualiza stock)">
    <div style="display:flex;flex-direction:column;gap:1px">
      <span class="comp-costo-ant" style="font-size:9px;color:var(--txt2);white-space:nowrap">Anterior: —</span>
      <input type="number" class="comp-costo-val" placeholder="$ costo" min="0" step="0.01"
        style="padding:5px 6px;border:1px solid var(--brd);border-radius:6px;font-size:12px;width:100%;box-sizing:border-box"
        oninput="mostrarPrecioSugComp(this)">
    </div>
    <span class="comp-precio-sug" style="font-size:11px;color:var(--P);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
    <button type="button" onclick="this.closest('.comp-costo-row').remove()"
      style="background:none;border:none;cursor:pointer;color:var(--D);font-size:16px;padding:0;line-height:1">✕</button>`;
  lista.appendChild(row);
  row.dataset.prodId='';
  row.querySelector('.comp-costo-cant').focus();
}

function actualizarCostoAnterior(sel){
  const prod=_productos.find(x=>String(x.id)===sel.value);
  const ant=sel.closest('.comp-costo-row').querySelector('.comp-costo-ant');
  if(ant)ant.textContent=prod?`Costo anterior: ${fmt(prod.costo||0)}`:'Costo anterior: —';
}

function mostrarPrecioSugComp(inp){
  const row=inp.closest('.comp-costo-row');
  const prodId=row.dataset.prodId;
  const prod=_productos.find(x=>String(x.id)===String(prodId));
  const margen=prod?.margen_objetivo||30;
  const precioFact=parseFloat(inp.value)||0;
  const provId=document.getElementById('comp-prov-id')?.value;
  const prov=_proveedores.find(p=>String(p.id)===String(provId));
  const costoReal=precioFact>0?calcCostoReal(precioFact,prov?.condicion_fiscal||'factura_todo',prov?.pct_factura||100):0;
  const sug=costoReal>0&&margen>0&&margen<100?Math.ceil(costoReal/(1-margen/100)):0;
  const el=row.querySelector('.comp-precio-sug');
  if(el){
    if(costoReal>0&&costoReal!==precioFact){
      el.innerHTML=`<span style="color:var(--txt2);font-size:10px">Real: ${fmt(costoReal)}</span>${sug>0?`<br>→ ${fmt(sug)}`:''}`;
    } else {
      el.textContent=sug>0?`→ ${fmt(sug)}`:'';
    }
  }
}

// ─── CARGA DE ARTÍCULOS SOBRE UN COMPROBANTE YA GUARDADO ───────────────────
// (útil sobre todo para los importados de AFIP, que no traen detalle de productos)
// Mismo patrón que Remito rápido: una única fila de carga siempre abierta al
// final de la grilla (código exacto o nombre con autocompletar, F2 = buscador
// completo), sin botón "Agregar" — confirmar con Enter/Tab deja lista la
// siguiente fila para el próximo producto.
let _caItems=[], _caProTemp=null;
let _caStagingVals={cod:'',cant:'1',costo:'0'};

function abrirCargaArticulos(compId){
  const comp=_comprobantes.find(c=>c.id===compId); if(!comp)return;
  _cargaArtCompId=compId;
  const info=document.getElementById('carga-art-info');
  if(info)info.innerHTML=`Comprobante <b>${comp.nro_comprobante||'#'+comp.id}</b> · <b>${comp.proveedor_nom||''}</b> · ${comp.fecha||''} · ${fmt(comp.importe)}`;
  _caItems=[]; _caProTemp=null; _caStagingVals={cod:'',cant:'1',costo:'0'};
  document.getElementById('m-carga-articulos').classList.add('on');
  renderItemsCA();
  setTimeout(()=>{const f=document.getElementById('ca-cod');if(f){f.focus();f.select();}},80);
}

// Celda Código de la fila de carga: dígitos → código exacto (Enter/Tab confirma),
// letras → autocompletar por nombre (dropdown abajo), F2 → buscador completo.
function _caCodKeydown(e){
  if(e.key==='F2'){e.preventDefault();abrirBuscadorPro('ca');return;}
  const drop=document.getElementById('ca-pro-drop');
  const items=drop?.querySelectorAll('.drop-item');
  if(items&&items.length&&drop.style.display!=='none'&&(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Enter'||e.key==='Escape')){
    navDropProCA(e); return;
  }
  if(e.key==='Enter'||(e.key==='Tab'&&e.target.value.trim())){
    e.preventDefault();
    buscarCodigoCA();
  }
}

function buscarCodigoCA(){
  const cod=(document.getElementById('ca-cod')?.value||'').trim();
  if(!cod)return;
  const prod=_productos.find(p=>String(p.codigo).trim()===cod);
  if(prod){ selProCA(prod.id); }
  else{ const el=document.getElementById('ca-cod'); if(el)el.style.borderColor='var(--D)'; }
}

function dropProCA(){
  const val=(document.getElementById('ca-cod')?.value||'').trim();
  const drop=document.getElementById('ca-pro-drop');
  if(!drop)return;
  if(!val){drop.style.display='none';return;}
  if(/^[0-9]+$/.test(val)){drop.style.display='none';return;} // solo dígitos = código exacto
  const q=val.toLowerCase();
  const m=_productos.filter(p=>(p.nombre||'').toLowerCase().includes(q));
  drop.innerHTML=m.length?m.map(p=>`<div class="drop-item" onmousedown="selProCA(${p.id})" style="padding:9px 12px">
      <div style="font-weight:600;font-size:14px">${p.nombre}</div>
      <div style="font-size:12px;color:var(--txt2);margin-top:2px">Cód: ${p.codigo||p.id} · Unidad: ${p.unidad||'—'} · Costo actual: ${fmt(p.costo||0)}</div>
    </div>`).join(''):'<div style="padding:8px;color:var(--txt2);font-size:12px">Sin resultados</div>';
  drop.style.display='block';
}

function navDropProCA(e){
  const drop=document.getElementById('ca-pro-drop');
  const items=drop?.querySelectorAll('.drop-item');
  if(!items||!items.length){
    if(e.key==='ArrowUp'){e.preventDefault();document.getElementById('ca-cod')?.focus();}
    return;
  }
  let idx=Array.from(items).findIndex(i=>i.classList.contains('active'));
  if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(idx+1,items.length-1);}
  else if(e.key==='ArrowUp'){
    e.preventDefault();
    if(idx<=0){drop.style.display='none';document.getElementById('ca-cod')?.focus();return;}
    idx=Math.max(idx-1,0);
  }
  else if(e.key==='Enter'&&idx>=0){e.preventDefault();items[idx].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return;}
  else if(e.key==='Escape'){drop.style.display='none';return;}
  items.forEach(i=>i.classList.remove('active'));
  if(idx>=0){items[idx].classList.add('active');items[idx].scrollIntoView({block:'nearest'});}
}

// Resuelve el producto (código exacto, autocompletar o buscador F2) para la
// fila de carga: lo deja en _caProTemp y pasa el foco a Cantidad.
function selProCA(id){
  _caProTemp=_productos.find(x=>x.id===id); if(!_caProTemp)return;
  const drop=document.getElementById('ca-pro-drop'); if(drop)drop.style.display='none';
  _caStagingVals.cod=String(_caProTemp.codigo||_caProTemp.id);
  if(!_caStagingVals.cant)_caStagingVals.cant='1';
  renderItemsCA();
  setTimeout(()=>{const f=document.getElementById('ca-cant');if(f){f.focus();f.select();}},80);
}

// Navegación Cantidad→Costo de la fila de carga. Al completar la última
// celda, confirma el ítem y deja lista una fila nueva vacía.
function _caStagingKeydown(e,campo){
  if(e.key!=='Enter'&&e.key!=='Tab')return;
  e.preventDefault();
  const orden=['cant','costo'];
  const idx=orden.indexOf(campo);
  if(idx<0||idx>=orden.length-1){_caCommitStaging();return;}
  const f=document.getElementById('ca-'+orden[idx+1]);
  if(f){f.focus();f.select();}
}

function updStagingCA(campo,v,inputEl){
  _caStagingVals[campo]=v;
  renderItemsCA();
  if(!inputEl)return;
  const el2=document.getElementById('ca-'+campo);
  if(el2){el2.value=v;el2.focus();el2.setSelectionRange(v.length,v.length);}
}

function _caCommitStaging(){
  if(!_caProTemp){toast('Elegí un producto (código, nombre o F2)','warn');return;}
  const cant=parseFloat(_caStagingVals.cant)||0;
  const costo=parseFloat(_caStagingVals.costo)||0;
  if(cant<=0&&costo<=0){toast('Ingresá cantidad o costo','warn');return;}
  const ex=_caItems.find(i=>i.id===_caProTemp.id);
  if(ex){ ex.cant+=cant; if(costo>0)ex.costo=costo; }
  else{ _caItems.push({id:_caProTemp.id,nom:_caProTemp.nombre,codigo:_caProTemp.codigo||'',unidad:_caProTemp.unidad||'',cant,costo}); }
  _caProTemp=null;
  _caStagingVals={cod:'',cant:'1',costo:'0'};
  renderItemsCA();
  setTimeout(()=>{const f=document.getElementById('ca-cod');if(f)f.focus();},80);
}

const _caInputStyle='padding:8px 10px;border:1.5px solid var(--brd);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box';

function _caStagingRowHTML(){
  const p=_caProTemp;
  const cant=parseFloat(_caStagingVals.cant)||0;
  const costo=parseFloat(_caStagingVals.costo)||0;
  const sub=cant*costo;
  return `<div class="pitem" style="background:var(--PL)">
    <span class="drop-wrap" style="width:80px;flex-shrink:0;position:relative">
      <input id="ca-cod" value="${_caStagingVals.cod}" placeholder="Cód." autocomplete="off" title="Código de producto — F2 para buscar por nombre"
        oninput="dropProCA()" onkeydown="_caCodKeydown(event)" style="width:100%;text-align:center;${_caInputStyle}">
      <div class="drop" id="ca-pro-drop" style="width:280px"></div>
    </span>
    <span class="pnom" style="color:${p?'inherit':'var(--txt2)'}">${p?p.nombre:'— código, nombre o F2 —'}</span>
    <span style="width:64px;flex-shrink:0;text-align:center;font-size:12px;color:var(--txt2)">${p?.unidad||''}</span>
    <input type="text" inputmode="decimal" id="ca-cant" value="${_caStagingVals.cant}" oninput="updStagingCA('cant',this.value,this)" onkeydown="_caStagingKeydown(event,'cant')"
      style="width:80px;text-align:center;${_caInputStyle};border-color:var(--P);border-width:2px" title="Cantidad recibida (actualiza stock)">
    <input type="text" inputmode="decimal" id="ca-costo" value="${_caStagingVals.costo}" oninput="updStagingCA('costo',this.value,this)" onkeydown="_caStagingKeydown(event,'costo')"
      style="width:110px;text-align:right;${_caInputStyle}" title="Costo unitario facturado">
    <span class="ptot">${sub>0?fmt(sub):'—'}</span>
    <span style="width:32px"></span>
  </div>`;
}

function renderItemsCA(){
  const el=document.getElementById('carga-art-lista'); if(!el)return;
  const rows=_caItems.map((it,i)=>{
    const sub=it.cant*it.costo;
    return `<div class="pitem">
      <span style="width:80px;flex-shrink:0;text-align:center;font-size:11px;color:var(--txt2)">${it.codigo||''}</span>
      <span class="pnom">${it.nom}</span>
      <span style="width:64px;flex-shrink:0;text-align:center;font-size:12px;color:var(--txt2)">${it.unidad||''}</span>
      <input type="text" inputmode="decimal" data-idx="${i}" data-field="cant" value="${it.cant}" oninput="updItemCA(${i},'cant',this.value,this)" style="width:80px;text-align:center;${_caInputStyle}">
      <input type="text" inputmode="decimal" data-idx="${i}" data-field="costo" value="${it.costo}" oninput="updItemCA(${i},'costo',this.value,this)" style="width:110px;text-align:right;${_caInputStyle}">
      <span class="ptot">${fmt(sub)}</span>
      <button class="btn D sm" onclick="delItemCA(${i})">🗑</button>
    </div>`;
  }).join('');
  const header=`<div class="fx-grid-head" style="display:flex;gap:6px;padding:2px 8px 5px;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase">
    <span style="width:80px;text-align:center">Código</span>
    <span style="flex:1">Descripción</span>
    <span style="width:64px;text-align:center">Unidad</span>
    <span style="width:80px;text-align:center">Cantidad</span>
    <span style="width:110px;text-align:right">Costo unitario</span>
    <span style="min-width:80px;text-align:right">Subtotal</span>
    <span style="width:32px"></span>
  </div>`;
  el.innerHTML='<div id="ca-items-grid">'+header+rows+_caStagingRowHTML()+'</div>';
}

function updItemCA(i,k,v,inputEl){
  _caItems[i][k]=parseFloat(v)||0;
  renderItemsCA();
  if(!inputEl)return;
  const el2=document.querySelector(`#ca-items-grid input[data-idx="${i}"][data-field="${k}"]`);
  if(el2){el2.value=v;el2.focus();el2.setSelectionRange(v.length,v.length);}
}

function delItemCA(i){_caItems.splice(i,1);renderItemsCA();}

// ─── LECTURA DE FACTURA DE PROVEEDOR CON GEMINI ────────────────────────────
// Extrae los renglones de la factura y los agrega directo a _caItems,
// matcheando cada descripción contra el catálogo de productos por nombre.
function leerFacturaConGemini(){
  let key=localStorage.getItem('lila_gemini_key');
  if(!key){
    key=prompt('Ingresá tu API key de Gemini (Google AI Studio — se guarda solo en este dispositivo):');
    if(!key)return;
    localStorage.setItem('lila_gemini_key',key.trim());
  }
  document.getElementById('ca-ia-file').click();
}

async function procesarFacturaGemini(input){
  const file=input.files&&input.files[0]; input.value='';
  if(!file)return;
  const key=localStorage.getItem('lila_gemini_key'); if(!key){toast('Falta API key de Gemini','err');return;}
  const status=document.getElementById('ca-ia-status');
  status.style.display='block'; status.textContent='✨ Leyendo factura con Gemini...';
  try{
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
    const mimeType=file.type||'image/jpeg';
    const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(key)}`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[
          {inlineData:{mimeType,data:b64}},
          {text:'Extraé cada línea de producto de esta factura de compra y respondé SOLO con JSON válido, sin markdown:\n{"productos":[{"descripcion":"...","cantidad":0,"costo_unitario":0}]}\nEl costo_unitario es el precio unitario tal como figura en la factura (no lo calcules ni le saques IVA). No incluyas subtotales, IVA, percepciones ni otros conceptos que no sean productos.'}
        ]}],
        generationConfig:{responseMimeType:'application/json'}
      })
    });
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.error?.message||('Error API Gemini ('+resp.status+')'));}
    const data=await resp.json();
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'{}';
    let parsed;
    try{parsed=JSON.parse(txt);}catch{const m=txt.match(/\{[\s\S]*\}/);parsed=m?JSON.parse(m[0]):{};}

    const productos=parsed.productos||[];
    if(!productos.length){
      status.textContent='⚠️ No se detectaron productos en la factura.';
      setTimeout(()=>{status.style.display='none';},4000);
      return;
    }

    let agregados=0; const sinMatch=[];
    productos.forEach(item=>{
      const desc=(item.descripcion||'').trim(); if(!desc)return;
      const q=desc.toLowerCase();
      const match=_productos.find(p=>(p.nombre||'').toLowerCase().includes(q.substring(0,8))||q.includes((p.nombre||'').toLowerCase().substring(0,8)));
      const cant=parseFloat(item.cantidad)||0;
      const costo=parseFloat(item.costo_unitario)||0;
      if(match){
        const ex=_caItems.find(i=>i.id===match.id);
        if(ex){ ex.cant+=cant; if(costo>0)ex.costo=costo; }
        else{ _caItems.push({id:match.id,nom:match.nombre,codigo:match.codigo||'',unidad:match.unidad||'',cant,costo}); }
        agregados++;
      } else {
        sinMatch.push(desc);
      }
    });
    renderItemsCA();
    status.textContent=`✅ ${agregados} producto(s) cargado(s)${sinMatch.length?` · ${sinMatch.length} sin coincidencia — agregalos a mano: ${sinMatch.slice(0,3).join(', ')}${sinMatch.length>3?'…':''}`:''}. Revisá cantidades y costos antes de guardar.`;
    setTimeout(()=>{status.style.display='none';},8000);
  }catch(e){
    console.error(e);
    status.textContent='❌ Error: '+e.message;
    setTimeout(()=>{status.style.display='none';},5000);
  }
}

async function guardarCargaArticulos(){
  const compId=_cargaArtCompId; if(!compId)return;
  const comp=_comprobantes.find(c=>c.id===compId); if(!comp)return;
  if(!_caItems.length){ toast('Agregá al menos un producto','warn'); return; }
  const prov=_proveedores.find(p=>String(p.id)===String(comp.proveedor_id));
  const condFiscal=prov?.condicion_fiscal||'factura_todo';
  const pctFact=prov?.pct_factura||100;

  let costosCambiados=0, stockActualizado=0;
  const nuevos=[];
  for(const it of _caItems){
    const prod=_productos.find(x=>x.id===it.id); if(!prod)continue;
    const cantidad=it.cant||0, precioFacturado=it.costo||0;
    if(cantidad<=0&&precioFacturado<=0)continue;

    const upd={};
    if(precioFacturado>0){
      const costoReal=calcCostoReal(precioFacturado, condFiscal, pctFact);
      const stockActual=prod.stock||0;
      const costoActual=prod.costo||costoReal;
      const costoPromedio=stockActual>0&&cantidad>0
        ?Math.round((stockActual*costoActual+cantidad*costoReal)/(stockActual+cantidad)*100)/100
        :Math.round(costoReal*100)/100;
      upd.costo=costoPromedio;
      const margen=prod.margen_objetivo||30;
      upd.precio=margen>0&&margen<100?Math.ceil(costoPromedio/(1-margen/100)):prod.precio;
      costosCambiados++;
    }
    if(cantidad>0){
      upd.stock=(prod.stock||0)+cantidad;
      stockActualizado++;
    }
    await sb.from('productos').update(upd).eq('id',prod.id);
    nuevos.push({
      producto_id:prod.id, producto_nom:prod.nombre||'', codigo:prod.codigo||'',
      cantidad, costo_unitario:upd.costo||0, subtotal:cantidad*(upd.costo||0)
    });
  }

  if(!nuevos.length){ toast('Agregá al menos un producto con cantidad o costo','warn'); return; }

  const items=[...(comp.items||[]), ...nuevos];
  await sb.from('comprobantes_compras').update({items}).eq('id',compId);
  await cargarProductos(); renderProductos();
  await cargarComprobantes(); renderComprobantes();

  const partes=[];
  if(costosCambiados>0)partes.push(`${costosCambiados} costo${costosCambiados>1?'s':''} actualizado${costosCambiados>1?'s':''}`);
  if(stockActualizado>0)partes.push(`${stockActualizado} producto${stockActualizado>1?'s':''} con stock sumado`);
  toast(`✅ ${partes.join(' · ')}`);
  cerrar('m-carga-articulos');
}

// ─── CUENTA CORRIENTE DE PROVEEDORES ────────────────────────────────────────
// Movimientos: cada comprobante es un DEBE en su fecha; si ya está pagado,
// el mismo importe entra como HABER en su fecha_pago (o la fecha del
// comprobante si es más vieja y no tiene fecha_pago cargada).
function histProveedor(id){
  const p=_proveedores.find(x=>x.id===id); if(!p)return;
  const comps=_comprobantes.filter(c=>String(c.proveedor_id)===String(id));
  let movs=[];
  comps.forEach(c=>{
    movs.push({id:c.id,fecha:c.fecha,tipo:'COMPRA',nro:c.nro_comprobante||'#'+c.id,debe:c.importe||0,haber:0,obs:c.descripcion||''});
    if(c.estado==='pagado'){
      movs.push({id:c.id,fecha:c.fecha_pago||c.fecha,tipo:'PAGO',nro:c.nro_comprobante||'#'+c.id,debe:0,haber:c.importe||0,obs:''});
    }
  });
  movs.sort((a,b)=>a.fecha.localeCompare(b.fecha));
  let saldo=0;
  movs=movs.map(m=>{saldo+=m.debe-m.haber;return {...m,saldo};});
  const saldoFinal=saldo;

  document.getElementById('m-ver-title').textContent='Cuenta corriente — '+p.nombre;
  const mvp=document.getElementById('m-ver-print'); if(mvp)mvp.style.display='none';
  const mvp2=document.getElementById('m-ver-print2'); if(mvp2)mvp2.style.display='none';
  const anu=document.getElementById('m-ver-anular'); if(anu)anu.style.display='none';

  document.getElementById('m-ver-body').innerHTML=`
    <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--txt2)">
      <span>CUIT: ${p.cuit||'—'}</span>
      <span>📞 ${p.telefono||'—'}</span>
      <span>Plazo pago: <b>${p.plazo_pago_dias!=null?p.plazo_pago_dias+' días':'—'}</b></span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:${saldoFinal>0?'var(--DL)':'var(--PL)'};border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <span style="font-weight:600;font-size:13px">Saldo actual — lo que le debemos</span>
      <span style="font-size:20px;font-weight:700;color:${saldoFinal>0?'var(--D)':'var(--P)'}">${fmt(saldoFinal)}</span>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--bg2)">
        <th style="padding:7px 8px;text-align:left;border-bottom:1px solid var(--brd)">Fecha</th>
        <th style="padding:7px 8px;text-align:left;border-bottom:1px solid var(--brd)">Tipo</th>
        <th style="padding:7px 8px;text-align:left;border-bottom:1px solid var(--brd)">Comprobante</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--brd);color:var(--D)">Debe</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--brd);color:var(--P)">Haber</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--brd)">Saldo</th>
      </tr></thead>
      <tbody>${movs.length?movs.map(m=>`<tr>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd)">${m.fecha}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd);font-weight:500">${m.tipo}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd);color:var(--A)">${m.nro}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--D)">${m.debe>0?fmt(m.debe):''}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--P)">${m.haber>0?fmt(m.haber):''}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:600;color:${m.saldo>0?'var(--D)':'var(--P)'}">${fmt(m.saldo)}</td>
      </tr>`).join(''):'<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--txt2)">Sin comprobantes registrados</td></tr>'}</tbody>
    </table>
    </div>`;
  document.getElementById('m-ver').classList.add('on');
}

async function pagarComprobante(id){
  const comp = _comprobantes.find(x => x.id === id);
  if(!comp) return;
  if(!confirm(`¿Marcar como pagado el comprobante ${comp.nro_comprobante || id}?`)) return;
  const hoy=new Date().toISOString().split('T')[0];
  await sb.from('comprobantes_compras').update({estado: 'pagado', fecha_pago: hoy}).eq('id', id);
  await cargarComprobantes();
  renderComprobantes();
}

async function eliminarComprobante(id){
  if(!confirm('¿Eliminar este comprobante?')) return;
  await sb.from('comprobantes_compras').delete().eq('id', id);
  await cargarComprobantes();
  renderComprobantes();
}

function imprimirComprobante(id){
  const c=_comprobantes.find(x=>x.id===id);if(!c)return;
  const hoy=new Date().toISOString().split('T')[0];
  let estado=c.estado;
  if(estado==='pendiente'&&c.fecha_vencimiento&&c.fecha_vencimiento<hoy)estado='vencido';
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Comprobante ${c.nro_comprobante||c.id}</title>
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
    <div class="nro">COMPROBANTE DE COMPRA ${c.nro_comprobante||'#'+c.id}</div>
  </div>
  <div class="row"><span><b>Fecha:</b></span><span>${c.fecha||'—'}</span></div>
  <div class="row"><span><b>Proveedor:</b></span><span>${c.proveedor_nom||'—'}</span></div>
  ${c.descripcion?`<div class="row"><span><b>Descripción:</b></span><span>${c.descripcion}</span></div>`:''}
  ${c.fecha_vencimiento?`<div class="row"><span><b>Vencimiento:</b></span><span>${c.fecha_vencimiento}</span></div>`:''}
  <div class="row"><span><b>Cond. pago:</b></span><span>${c.condicion_pago?c.condicion_pago+' días':'Contado'}</span></div>
  <div class="row"><span><b>Estado:</b></span><span>${estado}</span></div>
  <div class="row total"><span>IMPORTE</span><span>${fmt(c.importe)}</span></div>
  <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 20px;background:#1a7a52;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Imprimir</button></div>
  </body></html>`);
  w.document.close();
}

function verComprobanteCompra(id){
  const c=_comprobantes.find(x=>x.id===id);if(!c)return;
  const hoy=new Date().toISOString().split('T')[0];
  let estado=c.estado;
  if(estado==='pendiente'&&c.fecha_vencimiento&&c.fecha_vencimiento<hoy)estado='vencido';
  const body=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin-bottom:10px">
      <span>Estado: <b>${estado}</b></span>
      <span>Cond. pago: <b>${c.condicion_pago?c.condicion_pago+'d':'Contado'}</b></span>
      ${c.fecha_vencimiento?`<span>Vence: <b>${c.fecha_vencimiento}</b></span>`:''}
    </div>
    ${c.descripcion?`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">${c.descripcion}</div>`:''}
    <div style="text-align:right;font-size:16px;font-weight:700;color:var(--PD);border-top:2px solid var(--brd);padding-top:10px">Importe: ${fmt(c.importe)}</div>
  `;
  popupDetalle(c.nro_comprobante||('Comprobante #'+c.id),`${c.proveedor_nom||''} · ${c.fecha}`,body);
}

function renderComprobantes(){
  const q = (document.getElementById('comp-q')?.value||'').toLowerCase();
  const est = document.getElementById('comp-est')?.value||'';
  const mes = document.getElementById('comp-mes')?.value||'';
  
  // Actualizar estado vencidos
  const hoy = new Date().toISOString().split('T')[0];
  
  const fFecha=document.getElementById('comp-f-fecha')?.value||'';
  const fProv=document.getElementById('comp-f-prov')?.value||'';
  const fNro=document.getElementById('comp-f-nro')?.value||'';
  const fDesc=document.getElementById('comp-f-desc')?.value||'';
  const fVenc=document.getElementById('comp-f-venc')?.value||'';
  const fImp=document.getElementById('comp-f-imp')?.value||'';

  let data = _comprobantes.filter(c => {
    const okQ = !q || (c.proveedor_nom||'').toLowerCase().includes(q) || (c.descripcion||'').toLowerCase().includes(q) || (c.nro_comprobante||'').includes(q);
    let estado = c.estado;
    if(estado === 'pendiente' && c.fecha_vencimiento && c.fecha_vencimiento < hoy) estado = 'vencido';
    const okE = !est || estado === est;
    const okM = !mes || (c.fecha||'').startsWith(mes);
    const okCols = matchFiltroCol(c.fecha,fFecha)&&matchFiltroCol(c.proveedor_nom,fProv)&&matchFiltroCol(c.nro_comprobante,fNro)&&
      matchFiltroCol(c.descripcion||c.tipo,fDesc)&&matchFiltroCol(c.fecha_vencimiento,fVenc)&&matchFiltroCol(c.importe,fImp);
    return okQ && okE && okM && okCols;
  });
  
  // Poblar meses
  const meses = [...new Set(_comprobantes.map(c => c.fecha?.substring(0,7)).filter(Boolean))].sort().reverse();
  const selMes = document.getElementById('comp-mes');
  if(selMes && selMes.options.length <= 1){
    meses.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; selMes.appendChild(o); });
  }
  
  // Totales
  const totalPend = data.filter(c=>c.estado==='pendiente').reduce((a,c)=>a+c.importe,0);
  const totalVenc = data.filter(c=>c.estado==='vencido'||( c.estado==='pendiente'&&c.fecha_vencimiento<hoy)).reduce((a,c)=>a+c.importe,0);
  const totalPag = data.filter(c=>c.estado==='pagado').reduce((a,c)=>a+c.importe,0);
  const elTot = document.getElementById('comp-totales');
  if(elTot) elTot.innerHTML = `
    <div class="stat" style="padding:8px 12px"><div class="n" style="font-size:16px;color:var(--W)">${fmt(totalPend)}</div><div class="l">Pendiente</div></div>
    <div class="stat" style="padding:8px 12px"><div class="n" style="font-size:16px;color:var(--D)">${fmt(totalVenc)}</div><div class="l">Vencido</div></div>
    <div class="stat" style="padding:8px 12px"><div class="n" style="font-size:16px;color:var(--P)">${fmt(totalPag)}</div><div class="l">Pagado</div></div>
  `;
  
  const sl = data.slice((_compPg-1)*PP, _compPg*PP);
  const tbody = document.getElementById('comp-tbody');
  tbody.innerHTML = sl.length ? sl.map(c => {
    let estado = c.estado;
    if(estado === 'pendiente' && c.fecha_vencimiento && c.fecha_vencimiento < hoy) estado = 'vencido';
    const badgeClass = estado==='pagado'?'bP':estado==='vencido'?'bD':'bW';
    const diasVenc = c.fecha_vencimiento ? Math.floor((new Date(c.fecha_vencimiento)-new Date())/(864e5)) : null;
    return `<tr data-comp-id="${c.id}" style="${estado==='vencido'?'background:var(--DL)':''}">
      <td>${c.fecha}</td>
      <td style="font-weight:600">${c.proveedor_nom}</td>
      <td style="color:var(--txt2);font-size:12px">${c.nro_comprobante||'—'}</td>
      <td style="font-size:12px">${c.descripcion||c.tipo||'—'}</td>
      <td style="font-size:12px;${estado==='vencido'?'color:var(--D);font-weight:600':''}">${c.fecha_vencimiento||'—'}${diasVenc!==null&&estado==='pendiente'?` <span style="font-size:10px;color:var(--txt2)">(${diasVenc}d)</span>`:''}</td>
      <td style="font-size:12px">${c.condicion_pago?c.condicion_pago+'d':'Contado'}</td>
      <td style="font-weight:600;color:var(--D)">${fmt(c.importe)}</td>
      <td><span class="b ${badgeClass}">${estado}</span></td>
      <td style="display:flex;gap:3px;flex-wrap:wrap">
        ${estado!=='pagado'?`<button class="btn P sm" onclick="pagarComprobante(${c.id})">✓ Pagar</button>`:''}
        <button class="btn sm" onclick="abrirCargaArticulos(${c.id})" title="Cargar los productos recibidos: actualiza stock y costo">📦 Artículos${c.items&&c.items.length?` (${c.items.length})`:''}</button>
        <button class="btn sm" onclick="abrirAjusteComp(${c.id},'nc')" title="Nota de crédito del proveedor" style="background:#dbeafe;color:#1e40af;border:none">NC</button>
        <button class="btn sm" onclick="abrirAjusteComp(${c.id},'nd')" title="Nota de débito del proveedor" style="background:#fef3c7;color:#92400e;border:none">ND</button>
        <button class="btn sm" onclick="imprimirComprobante(${c.id})" title="Imprimir">🖨</button>
        <button class="btn D sm" onclick="eliminarComprobante(${c.id})">🗑</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="9"><div class="empty">Sin comprobantes</div></td></tr>';
  
  pag('comp-pg', data.length, _compPg, p => { _compPg = p; renderComprobantes(); });
}

// ─── IMPORTACIÓN DEL CSV DE AFIP (Mis Comprobantes → Recibidos) ────────────
// El CSV trae todo lo administrativo (proveedor, número, fecha, importe) pero
// NO el detalle de productos: eso vive solo en el PDF de cada factura.

// Códigos de tipo de comprobante de AFIP → tipo interno de la app.
const _AFIP_TIPOS = {
  1:['factura','Factura A'],       2:['nota_debito','Nota de Débito A'],  3:['nota_credito','Nota de Crédito A'],
  6:['factura','Factura B'],       7:['nota_debito','Nota de Débito B'],  8:['nota_credito','Nota de Crédito B'],
  11:['factura','Factura C'],     12:['nota_debito','Nota de Débito C'], 13:['nota_credito','Nota de Crédito C'],
  51:['factura','Factura M'],     52:['nota_debito','Nota de Débito M'], 53:['nota_credito','Nota de Crédito M'],
  81:['ticket','Tique Factura A'],82:['ticket','Tique Factura B'],       83:['ticket','Tique'],
  109:['ticket','Tique C'],       110:['nota_credito','Tique Nota de Crédito'],
  111:['ticket','Tique Factura C'],112:['nota_credito','Tique NC A'],    113:['nota_credito','Tique NC B'],
  114:['nota_credito','Tique NC C'],118:['ticket','Tique Factura M'],
  201:['factura','FCE Factura A'],202:['nota_debito','FCE ND A'],       203:['nota_credito','FCE NC A'],
  206:['factura','FCE Factura B'],207:['nota_debito','FCE ND B'],       208:['nota_credito','FCE NC B'],
  211:['factura','FCE Factura C'],212:['nota_debito','FCE ND C'],       213:['nota_credito','FCE NC C']
};

// AFIP usa coma decimal y punto de miles: "1.234,56" → 1234.56
function _afipNum(v){
  const s=String(v==null?'':v).trim();
  if(!s) return 0;
  return parseFloat(s.replace(/\./g,'').replace(',','.'))||0;
}

// AFIP exporta la fecha como "AAAA-MM-DD" (ISO) o "DD/MM/AAAA" según el reporte;
// el resto de la app usa siempre ISO "AAAA-MM-DD".
function _afipFecha(v){
  const s=String(v||'').trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m){const [,y,mo,d]=m;return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){const [,d,mo,y]=m;return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;}
  return '';
}

// Divide una línea de CSV respetando las comillas.
function _csvLinea(linea,sep){
  const out=[];let campo='',dentro=false;
  for(let i=0;i<linea.length;i++){
    const ch=linea[i];
    if(ch==='"'){
      if(dentro&&linea[i+1]==='"'){campo+='"';i++;}
      else dentro=!dentro;
    } else if(ch===sep&&!dentro){out.push(campo);campo='';}
    else campo+=ch;
  }
  out.push(campo);
  return out.map(s=>s.trim());
}

function _afipStatus(html){
  const el=document.getElementById('afip-import-status');
  if(el){el.style.display='block';el.innerHTML=html;}
}

async function importarCSVAfip(input){
  const file=input.files&&input.files[0];
  input.value='';
  if(!file) return;
  _afipStatus('Leyendo el archivo...');

  let texto=await file.text();
  if(texto.charCodeAt(0)===0xFEFF) texto=texto.slice(1);
  const lineas=texto.split(/\r?\n/).filter(l=>l.trim());
  if(lineas.length<2){_afipStatus('<b style="color:var(--D)">El archivo está vacío o no tiene datos.</b>');return;}

  // AFIP exporta con punto y coma; se detecta por si acaso.
  const sep=(lineas[0].match(/;/g)||[]).length>=(lineas[0].match(/,/g)||[]).length?';':',';
  const cab=_csvLinea(lineas[0],sep).map(h=>h.replace(/^"|"$/g,'').trim());
  const col=nombre=>cab.findIndex(h=>h.toLowerCase()===nombre.toLowerCase());

  const iFecha=col('Fecha de Emisión'), iTipo=col('Tipo de Comprobante'),
        iPtoVta=col('Punto de Venta'), iNroD=col('Número Desde'),
        iCuit=col('Nro. Doc. Emisor'), iNombre=col('Denominación Emisor'),
        iTotal=col('Imp. Total');

  if([iFecha,iTipo,iPtoVta,iNroD,iCuit,iNombre,iTotal].some(i=>i<0)){
    _afipStatus('<b style="color:var(--D)">Este archivo no parece ser el CSV de "Mis Comprobantes" de AFIP.</b><br>'+
      '<span style="color:var(--txt2);font-size:12px">Faltan columnas esperadas. Descargalo desde AFIP → Mis Comprobantes → Recibidos, sin modificarlo.</span>');
    return;
  }

  // Índice de comprobantes ya cargados, para no duplicar.
  const yaCargados=new Set(_comprobantes.map(c=>String(c.proveedor_id)+'|'+(c.nro_comprobante||'')));
  const provPorCuit={};
  _proveedores.forEach(p=>{const k=String(p.cuit||'').replace(/\D/g,'');if(k)provPorCuit[k]=p;});

  const filas=[], sinProveedor=new Map();
  for(let i=1;i<lineas.length;i++){
    const f=_csvLinea(lineas[i],sep);
    if(f.length<cab.length-2) continue;
    const cuit=String(f[iCuit]||'').replace(/\D/g,'');
    const total=_afipNum(f[iTotal]);
    const fecha=_afipFecha(f[iFecha]);
    if(!cuit||!total||!fecha) continue;
    const codTipo=parseInt(f[iTipo])||0;
    const [tipo,tipoNom]=_AFIP_TIPOS[codTipo]||['otro','Comprobante tipo '+codTipo];
    const nro=String(f[iPtoVta]||'').padStart(4,'0')+'-'+String(f[iNroD]||'').padStart(8,'0');
    const fila={
      fecha, tipo, tipoNom, nro, cuit,
      nombre:(f[iNombre]||'').trim(), importe:total,
      prov:provPorCuit[cuit]||null
    };
    if(!fila.prov&&!sinProveedor.has(cuit)) sinProveedor.set(cuit,fila.nombre);
    filas.push(fila);
  }

  if(!filas.length){_afipStatus('<b style="color:var(--D)">No se encontró ningún comprobante válido en el archivo.</b>');return;}

  // Crear los proveedores que falten, para no perder comprobantes.
  if(sinProveedor.size){
    const lista=[...sinProveedor.entries()].map(([cuit,nom])=>`${nom} (${cuit})`).join('\n');
    const ok=confirm(`Hay ${sinProveedor.size} proveedor(es) del archivo que no están en el sistema:\n\n${lista}\n\n¿Los creo automáticamente? (Si cancelás, esos comprobantes se saltean)`);
    if(ok){
      const nuevos=[...sinProveedor.entries()].map(([cuit,nom])=>({nombre:nom||('CUIT '+cuit),cuit}));
      const {error}=await sb.from('proveedores').insert(nuevos);
      if(error){_afipStatus('<b style="color:var(--D)">No se pudieron crear los proveedores: '+error.message+'</b>');return;}
      await cargarProveedores();
      _proveedores.forEach(p=>{const k=String(p.cuit||'').replace(/\D/g,'');if(k)provPorCuit[k]=p;});
      filas.forEach(f=>{if(!f.prov)f.prov=provPorCuit[f.cuit]||null;});
    }
  }

  const hoy=new Date().toISOString().split('T')[0];
  const aInsertar=[]; let dup=0, sinProv=0, sinCuenta=0;
  for(const f of filas){
    if(!f.prov){sinProv++;continue;}
    if(yaCargados.has(String(f.prov.id)+'|'+f.nro)){dup++;continue;}
    const plazo=parseInt(f.prov.plazo_pago_dias)||0;
    // El vencimiento sale del plazo pactado con el proveedor (AFIP no lo informa).
    const venc=plazo>0
      ? new Date(new Date(f.fecha).getTime()+plazo*86400000).toISOString().split('T')[0]
      : f.fecha;
    // Cuenta contable: la que tenga configurada el proveedor por defecto (Maestros → Proveedores).
    const [cuentaCod,cuentaNom]=(f.prov.cuenta_defecto||'').split('|');
    if(!cuentaCod) sinCuenta++;
    aInsertar.push({
      proveedor_id:f.prov.id, proveedor_nom:f.prov.nombre,
      fecha:f.fecha, nro_comprobante:f.nro, tipo:f.tipo,
      descripcion:f.tipoNom+' — importado de AFIP',
      importe:f.importe, condicion_pago:plazo,
      fecha_vencimiento:venc,
      estado:plazo===0?'pendiente':(venc<hoy?'vencido':'pendiente'),
      cuenta_cod:cuentaCod||null, cuenta_nom:cuentaNom||null,
      observaciones:'Importado del CSV de AFIP'
    });
    yaCargados.add(String(f.prov.id)+'|'+f.nro);
  }

  if(!aInsertar.length){
    _afipStatus(`<b>No había nada nuevo para importar.</b><br><span style="color:var(--txt2);font-size:12px">${dup} ya estaban cargados${sinProv?` · ${sinProv} sin proveedor asociado`:''}.</span>`);
    return;
  }

  const total=aInsertar.reduce((a,c)=>a+c.importe,0);
  if(!confirm(`Se van a importar ${aInsertar.length} comprobante(s) por ${fmt(total)}.\n`+
    `${dup?`(${dup} ya estaban cargados y se saltean)\n`:''}${sinProv?`(${sinProv} se saltean por no tener proveedor)\n`:''}`+
    `${sinCuenta?`(${sinCuenta} sin cuenta contable por defecto — no van a generar asiento hasta que se la asignes al proveedor)\n`:''}\n¿Continuar?`)) {
    _afipStatus('Importación cancelada.');
    return;
  }

  _afipStatus('Importando '+aInsertar.length+' comprobante(s)...');
  const {data:insertados,error}=await sb.from('comprobantes_compras').insert(aInsertar).select();
  if(error){_afipStatus('<b style="color:var(--D)">Error al importar: '+error.message+'</b>');return;}

  // Asiento contable (debe: cuenta del proveedor · haber: Cuenta Corriente Proveedores) —
  // solo para los que tienen cuenta asignada. Sin esto no aparecen en el Libro Mayor.
  const conCuenta=(insertados||[]).filter(c=>c.cuenta_cod);
  if(conCuenta.length){
    const {data:asientosIns,error:errAs}=await sb.from('asientos').insert(conCuenta.map(c=>({
      fecha:c.fecha,
      descripcion:`${(c.tipo||'').toUpperCase()} ${c.nro_comprobante} - ${c.proveedor_nom} - ${c.descripcion}`,
      tipo:'COMPRA', referencia_id:c.id, referencia_tipo:'comprobante_compra'
    }))).select();
    if(!errAs&&asientosIns){
      const detalles=[];
      conCuenta.forEach((c,i)=>{
        const asientoId=asientosIns[i]?.id; if(!asientoId)return;
        detalles.push(
          {asiento_id:asientoId, cuenta_cod:c.cuenta_cod, cuenta_nom:c.cuenta_nom, debe:c.importe, haber:0},
          {asiento_id:asientoId, cuenta_cod:'21001', cuenta_nom:'Cuenta Corriente Prov.', debe:0, haber:c.importe}
        );
      });
      if(detalles.length) await sb.from('asientos_detalle').insert(detalles);
    }
  }

  await cargarComprobantes();
  renderComprobantes();
  _afipStatus(`<b style="color:var(--P)">✅ ${aInsertar.length} comprobante(s) importados por ${fmt(total)}.</b>`+
    `<br><span style="color:var(--txt2);font-size:12px">${dup?dup+' ya estaban cargados. ':''}${sinProv?sinProv+' sin proveedor. ':''}${sinCuenta?sinCuenta+' sin cuenta contable por defecto (no generaron asiento). ':''}`+
    `Recordá que el detalle de productos no viene en el CSV: cargalo con el botón "📦 Artículos" en cada comprobante.</span>`);
  toast(`✅ ${aInsertar.length} comprobantes importados`);
}

// ─── LECTURA DE FACTURA CON IA (Gemini) ────────────────────────────────
function cargarFacturaIA(){
  let key=localStorage.getItem('lila_gemini_key');
  if(!key){
    key=prompt('Ingresá tu API key de Gemini (Google AI Studio — se guarda solo en este dispositivo):');
    if(!key)return;
    localStorage.setItem('lila_gemini_key',key.trim());
  }
  document.getElementById('comp-ia-file').click();
}

async function leerFacturaConIA(input){
  const file=input.files[0];if(!file)return;
  const key=localStorage.getItem('lila_gemini_key');if(!key){toast('Falta API key de Gemini','err');return;}
  const status=document.getElementById('comp-ia-status');
  status.style.display='block';status.textContent='✨ Leyendo factura con IA...';
  try{
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
    const mimeType=file.type||'image/jpeg';
    const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(key)}`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[
          {inlineData:{mimeType,data:b64}},
          {text:'Extraé los datos de esta factura/comprobante y respondé SOLO con JSON válido (sin markdown ni texto extra):\n{"proveedor":"...","nro_comprobante":"...","fecha":"YYYY-MM-DD","importe":0,"descripcion":"...","tipo":"factura|recibo|ticket|otro","productos":[{"nombre":"...","cantidad":1,"costo_unitario":0}]}'}
        ]}],
        generationConfig:{responseMimeType:'application/json'}
      })
    });
    if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error(e.error?.message||('Error API Gemini ('+resp.status+')'));}
    const data=await resp.json();
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'{}';
    let parsed;
    try{parsed=JSON.parse(txt);}catch{const m=txt.match(/\{[\s\S]*\}/);parsed=m?JSON.parse(m[0]):{};}
    // Rellenar formulario
    if(parsed.fecha)document.getElementById('comp-fecha').value=parsed.fecha;
    if(parsed.nro_comprobante)document.getElementById('comp-nro').value=parsed.nro_comprobante;
    if(parsed.importe)document.getElementById('comp-importe').value=parsed.importe;
    if(parsed.descripcion)document.getElementById('comp-desc').value=parsed.descripcion;
    if(parsed.tipo){const sel=document.getElementById('comp-tipo');for(const o of sel.options)if(o.value===parsed.tipo){sel.value=parsed.tipo;break;}}
    // Proveedor: buscar por nombre similar
    if(parsed.proveedor){
      const q=parsed.proveedor.toLowerCase();
      const match=_proveedores.find(p=>(p.nombre||'').toLowerCase().includes(q)||q.includes((p.nombre||'').toLowerCase().substring(0,5)));
      if(match)selProvComp(match.id);
    }
    // Productos: agregar a la lista de costos
    if(parsed.productos?.length){
      document.getElementById('comp-costos-lista').innerHTML='';
      for(const prod of parsed.productos){
        agregarItemCostoComp();
        const rows=document.querySelectorAll('.comp-costo-row');
        const last=rows[rows.length-1];
        if(!last)continue;
        const sel=last.querySelector('.comp-costo-sel');
        const cant=last.querySelector('.comp-costo-cant');
        const val=last.querySelector('.comp-costo-val');
        // Buscar producto por nombre
        const q2=(prod.nombre||'').toLowerCase();
        const match2=_productos.find(p=>(p.nombre||'').toLowerCase().includes(q2.substring(0,6)));
        if(match2&&sel){
          sel.value=match2.id;
          last.dataset.prodId=match2.id;
          sel.dispatchEvent(new Event('change'));
        } else if(sel){
          const opt=document.createElement('option');opt.value='__ia__';opt.textContent=prod.nombre||'?';sel.appendChild(opt);sel.value='__ia__';
        }
        if(cant&&prod.cantidad)cant.value=prod.cantidad;
        if(val&&prod.costo_unitario)val.value=prod.costo_unitario;
      }
    }
    status.textContent=`✅ Datos extraídos${parsed.productos?.length?` · ${parsed.productos.length} producto(s) detectado(s)`:''}. Verificá y completá lo que falte.`;
    setTimeout(()=>{status.style.display='none';},4000);
  }catch(e){
    console.error(e);
    status.textContent='❌ Error: '+e.message;
    setTimeout(()=>{status.style.display='none';},4000);
  }
  input.value='';
}
