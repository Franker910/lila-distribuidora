// ─── INFORMES: dashboard, reportes, comparativos, stock, gerencial ───

// ─── MÓDULO GERENCIAL ───
// Permitir scroll sobre los canvas de Chart.js
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('wheel', function(e) {
    const body = document.querySelector('.body');
    if(body && e.target && e.target.tagName === 'CANVAS') {
      body.scrollTop += e.deltaY;
      e.preventDefault();
    }
  }, {passive: false});
});

let _gerData = null;

let _gerVista = 'saldo';

let _gerDetalleChart = null;

let _gerCharts = {};

function procesarGerencial() {
  const status = document.getElementById('ger-status');
  status.textContent = 'Procesando archivos...';

  // Helper para detectar mes desde nombre de archivo
  function detectarMes(nombre) {
    const n = nombre.toLowerCase();
    if(n.includes('enero') || n.includes('_01_') || n.includes('31-01') || n.includes('31_01')) return 'Ene';
    if(n.includes('febrero') || n.includes('_02_') || n.includes('28-02') || n.includes('29-02')) return 'Feb';
    if(n.includes('marzo') || n.includes('_03_') || n.includes('31-03') || n.includes('31_03')) return 'Mar';
    if(n.includes('abril') || n.includes('_04_') || n.includes('30-04')) return 'Abr';
    if(n.includes('mayo') || n.includes('_05_') || n.includes('31-05')) return 'May';
    if(n.includes('junio') || n.includes('_06_') || n.includes('13-06') || n.includes('30-06')) return 'Jun';
    return 'Jun';
  }

  const filesResult = document.getElementById('ger-files-result').files;
  const filesVentas = document.getElementById('ger-files-ventas').files;
  const filesSaldos = document.getElementById('ger-files-saldos').files;

  if (!filesResult.length && !filesVentas.length && !filesSaldos.length) {
    status.textContent = 'Cargá al menos un archivo.';
    return;
  }

  const readXLSX = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, {type:'binary'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve({ name: file.name, data: XLSX.utils.sheet_to_json(ws, {header:1, defval:''}) });
    };
    reader.readAsBinaryString(file);
  });

  Promise.all([
    ...Array.from(filesResult).map(readXLSX),
    ...Array.from(filesVentas).map(readXLSX),
    ...Array.from(filesSaldos).map(readXLSX),
  ]).then(results => {
    const resultFiles = results.slice(0, filesResult.length);
    const ventasFiles = results.slice(filesResult.length, filesResult.length + filesVentas.length);
    const saldosFiles = results.slice(filesResult.length + filesVentas.length);

    _gerData = { meses: {}, clientes: {}, productos: {} };

    // Procesar resultados (productos) — filas útiles desde fila 11 (índice 10)
    // Estructura: col0=cod, col1=articulo, col2=cant, col3=kilos, col4=ventaNeta, col5=costo, col6=diferencia
    resultFiles.forEach(f => {
      const mesKey = detectarMes(f.name);
      if(!_gerData.meses[mesKey]) _gerData.meses[mesKey] = {venta:0,costo:0,margen:0};
      f.data.forEach((row,i) => {
        if(i < 10) return; // saltear encabezados
        const cod = row[0];
        if(!cod || isNaN(parseFloat(cod))) return;
        const art = String(row[1]||'').trim();
        const venta = parseFloat(row[4]) || 0;
        const costo = parseFloat(row[5]) || 0;
        const margen = parseFloat(row[6]) || 0;
        if(!art || art.length < 2 || venta <= 0) return;
        _gerData.meses[mesKey].venta += venta;
        _gerData.meses[mesKey].costo += costo;
        _gerData.meses[mesKey].margen += margen;
        if(!_gerData.productos[art]) _gerData.productos[art] = {venta:0,margen:0};
        _gerData.productos[art].venta += venta;
        _gerData.productos[art].margen += margen;
      });
    });

    // Procesar ventas por cliente — filas útiles desde fila 7 (índice 6)
    // Estructura: col0=codigo, col1=cliente, col2=venta
    ventasFiles.forEach(f => {
      const mesKey = detectarMes(f.name);
      f.data.forEach((row,i) => {
        if(i < 6) return;
        const cod = parseInt(row[0]);
        if(!cod || isNaN(cod)) return;
        const nombre = String(row[1]||'').trim();
        const venta = parseFloat(row[2]) || 0;
        if(!nombre || venta <= 0) return;
        if(!_gerData.clientes[cod]) _gerData.clientes[cod] = {nombre, ventas:{}, saldos:{}};
        _gerData.clientes[cod].ventas[mesKey] = venta;
      });
    });

    // Procesar saldos — filas útiles desde fila 5 (índice 4)
    // Estructura: col0=codigo, col1=cliente, col2=direccion, col3=localidad, col4=saldo
    saldosFiles.forEach(f => {
      const mesKey = detectarMes(f.name);
      f.data.forEach((row,i) => {
        if(i < 4) return;
        const cod = parseInt(row[0]);
        if(!cod || isNaN(cod)) return;
        const nombre = String(row[1]||'').trim();
        const saldo = parseFloat(row[4]) || 0;
        if(!nombre) return;
        if(!_gerData.clientes[cod]) _gerData.clientes[cod] = {nombre, ventas:{}, saldos:{}};
        _gerData.clientes[cod].saldos[mesKey] = saldo;
      });
    });

    status.textContent = `✓ Procesado: ${resultFiles.length} archivos de resultados, ${ventasFiles.length} de ventas, ${saldosFiles.length} de saldos. Guardando en base de datos...`;
    renderGerencial();
    guardarGerencialSupabase(_gerData).then(() => {
      status.textContent = `✓ Procesado y guardado en base de datos. ${resultFiles.length} resultados, ${ventasFiles.length} ventas, ${saldosFiles.length} saldos.`;
    }).catch(e => {
      status.textContent = `✓ Procesado. Error al guardar: ${e.message}`;
    });
  });
}

async function guardarGerencialSupabase(data) {
  const ordenMeses = ['Ene','Feb','Mar','Abr','May','Jun'];
  const anio = 2026;

  // Limpiar datos anteriores del año
  await sb.from('ger_resultados').delete().eq('anio', anio);
  await sb.from('ger_ventas_cliente').delete().eq('anio', anio);
  await sb.from('ger_saldos_cliente').delete().eq('anio', anio);

  // Guardar resultados por mes
  const rowsResultados = [];
  for(const [mes, mesData] of Object.entries(data.meses)) {
    // Guardar totales del mes como un registro resumen
  }
  // Guardar productos
  for(const [art, prodData] of Object.entries(data.productos)) {
    // Los productos no tienen mes individual aquí, son acumulados
    // Guardarlos con mes='TOTAL'
    rowsResultados.push({
      mes: 'TOTAL', anio,
      articulo: art,
      venta_neta: Math.round(prodData.venta * 100) / 100,
      costo: 0,
      margen: Math.round(prodData.margen * 100) / 100,
      pct_margen: prodData.venta > 0 ? Math.round(prodData.margen/prodData.venta*10000)/100 : 0
    });
  }
  if(rowsResultados.length > 0) {
    // Insertar en lotes de 500
    for(let i=0; i<rowsResultados.length; i+=500) {
      await sb.from('ger_resultados').insert(rowsResultados.slice(i, i+500));
    }
  }

  // Guardar ventas por cliente
  const rowsVentas = [];
  for(const [cod, cliData] of Object.entries(data.clientes)) {
    for(const [mes, venta] of Object.entries(cliData.ventas)) {
      if(venta > 0) {
        rowsVentas.push({mes, anio, codigo: parseInt(cod), cliente: cliData.nombre, venta});
      }
    }
  }
  for(let i=0; i<rowsVentas.length; i+=500) {
    await sb.from('ger_ventas_cliente').insert(rowsVentas.slice(i, i+500));
  }

  // Guardar saldos por cliente
  const rowsSaldos = [];
  for(const [cod, cliData] of Object.entries(data.clientes)) {
    for(const [mes, saldo] of Object.entries(cliData.saldos)) {
      if(saldo !== 0) {
        rowsSaldos.push({mes, anio, codigo: parseInt(cod), cliente: cliData.nombre, saldo});
      }
    }
  }
  for(let i=0; i<rowsSaldos.length; i+=500) {
    await sb.from('ger_saldos_cliente').insert(rowsSaldos.slice(i, i+500));
  }
}

async function cargarGerencialSupabase() {
  const status = document.getElementById('ger-status');
  status.textContent = 'Cargando datos guardados...';

  const anio = 2026;
  const [resProds, resVentas, resSaldos] = await Promise.all([
    sb.from('ger_resultados').select('*').eq('anio', anio),
    sb.from('ger_ventas_cliente').select('*').eq('anio', anio),
    sb.from('ger_saldos_cliente').select('*').eq('anio', anio),
  ]);

  if((!resVentas.data || resVentas.data.length === 0) && (!resProds.data || resProds.data.length === 0)) {
    status.textContent = 'No hay datos guardados. Cargá los archivos del FoxPro.';
    return;
  }

  _gerData = { meses: {}, clientes: {}, productos: {} };

  // Reconstruir productos
  (resProds.data || []).forEach(r => {
    if(!_gerData.productos[r.articulo]) _gerData.productos[r.articulo] = {venta:0, margen:0};
    _gerData.productos[r.articulo].venta += parseFloat(r.venta_neta);
    _gerData.productos[r.articulo].margen += parseFloat(r.margen);
  });

  // Reconstruir ventas y meses
  (resVentas.data || []).forEach(r => {
    const mes = r.mes;
    if(!_gerData.meses[mes]) _gerData.meses[mes] = {venta:0, costo:0, margen:0};
    _gerData.meses[mes].venta += parseFloat(r.venta);
    const cod = r.codigo;
    if(!_gerData.clientes[cod]) _gerData.clientes[cod] = {nombre: r.cliente, ventas:{}, saldos:{}};
    _gerData.clientes[cod].ventas[mes] = (_gerData.clientes[cod].ventas[mes]||0) + parseFloat(r.venta);
  });

  // Reconstruir saldos
  (resSaldos.data || []).forEach(r => {
    const cod = r.codigo;
    if(!_gerData.clientes[cod]) _gerData.clientes[cod] = {nombre: r.cliente, ventas:{}, saldos:{}};
    _gerData.clientes[cod].saldos[r.mes] = parseFloat(r.saldo);
  });

  status.textContent = `✓ Datos cargados desde base de datos (${resVentas.data?.length || 0} registros de ventas).`;
  document.getElementById('ger-dashboard').style.display = 'block';
  (document.getElementById('inf-content')||document.querySelector('.body')).scrollTo({top:0, behavior:'smooth'});
  renderGerencial();
}

function renderGerencial() {
  if(!_gerData) return;
  document.getElementById('ger-dashboard').style.display = 'block';
  (document.getElementById('inf-content')||document.querySelector('.body')).scrollTo({top:0, behavior:'smooth'});

  const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#aaa' : '#777';

  // Destruir charts anteriores
  Object.values(_gerCharts).forEach(c => { try{c.destroy()}catch(e){} });
  _gerCharts = {};

  // Ordenar meses
  const ordenMeses = ['Ene','Feb','Mar','Abr','May','Jun'];
  const mesesDisp = ordenMeses.filter(m => _gerData.meses[m]);
  const ventas = mesesDisp.map(m => Math.round(_gerData.meses[m].venta/1000000*10)/10);
  const margenes = mesesDisp.map(m => Math.round(_gerData.meses[m].margen/1000000*10)/10);
  const pcts = mesesDisp.map(m => {
    const v = _gerData.meses[m].venta;
    return v > 0 ? Math.round(_gerData.meses[m].margen/v*1000)/10 : 0;
  });

  const totalVenta = ventas.reduce((a,b)=>a+b,0);
  const totalMargen = margenes.reduce((a,b)=>a+b,0);
  const pctProm = totalVenta > 0 ? Math.round(totalMargen/totalVenta*1000)/10 : 0;

  // KPIs
  document.getElementById('ger-kpis').innerHTML = `
    <div style="background:var(--bg2);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px;text-transform:uppercase">Venta total</div>
      <div style="font-size:20px;font-weight:600">\$${totalVenta.toFixed(1)}M</div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px;text-transform:uppercase">Margen total</div>
      <div style="font-size:20px;font-weight:600">\$${totalMargen.toFixed(1)}M</div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px;text-transform:uppercase">Margen %</div>
      <div style="font-size:20px;font-weight:600">${pctProm}%</div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:12px">
      <div style="font-size:11px;color:var(--txt2);margin-bottom:4px;text-transform:uppercase">Meses cargados</div>
      <div style="font-size:20px;font-weight:600">${mesesDisp.length}</div>
    </div>`;

  // Chart ventas y márgenes
  if(document.getElementById('ger-chart-meses')) {
    _gerCharts.meses = new Chart(document.getElementById('ger-chart-meses'), {
      type:'bar',
      data:{labels:mesesDisp,datasets:[
        {label:'Venta',data:ventas,backgroundColor:'#378ADD',borderRadius:4},
        {label:'Margen',data:margenes,backgroundColor:'#1D9E75',borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10},color:textColor,boxWidth:10}},
          tooltip:{callbacks:{label:c=>' $'+c.parsed.y.toFixed(1)+'M'}}},
        scales:{x:{ticks:{color:textColor,font:{size:11}},grid:{display:false}},
          y:{ticks:{color:textColor,font:{size:10},callback:v=>'$'+v+'M'},grid:{color:gridColor}}}}
    });
  }

  // Chart margen %
  if(document.getElementById('ger-chart-pct')) {
    _gerCharts.pct = new Chart(document.getElementById('ger-chart-pct'), {
      type:'line',
      data:{labels:mesesDisp,datasets:[{label:'Margen %',data:pcts,
        borderColor:'#639922',backgroundColor:'rgba(99,153,34,0.1)',
        borderWidth:2,pointRadius:4,pointBackgroundColor:'#639922',fill:true,tension:0.3}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.parsed.y.toFixed(1)+'%'}}},
        scales:{x:{ticks:{color:textColor,font:{size:11}},grid:{display:false}},
          y:{ticks:{color:textColor,font:{size:10},callback:v=>v+'%'},grid:{color:gridColor}}}}
    });
  }

  // Top clientes
  const clientesArr = Object.values(_gerData.clientes).map(c => {
    const tv = Object.values(c.ventas).reduce((a,b)=>a+b,0);
    const saldoJun = c.saldos['Jun'] || c.saldos['May'] || 0;
    const promMes = tv / Math.max(Object.keys(c.ventas).length, 1);
    const ratio = promMes > 0 ? saldoJun/promMes : 0;
    return {...c, total_venta:tv, saldo_jun:saldoJun, ratio};
  }).filter(c=>c.total_venta>0).sort((a,b)=>b.total_venta-a.total_venta);

  const top15 = clientesArr.slice(0,15);
  if(document.getElementById('ger-chart-clientes')) {
    _gerCharts.clientes = new Chart(document.getElementById('ger-chart-clientes'), {
      type:'bar', indexAxis:'y',
      data:{labels:top15.map(c=>c.nombre.split(' ').slice(0,2).join(' ')),
        datasets:[{label:'Venta total',data:top15.map(c=>Math.round(c.total_venta/1000)),
          backgroundColor:'#534AB7',borderRadius:3,barThickness:16}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' $'+c.parsed.x.toFixed(0)+'K'}}},
        scales:{x:{ticks:{color:textColor,font:{size:10},callback:v=>'$'+v+'K'},grid:{color:gridColor}},
          y:{ticks:{color:textColor,font:{size:10}},grid:{display:false}}}}
    });
  }

  // Alertas
  const alertas = clientesArr.filter(c=>c.ratio>=1.5 && c.total_venta>200000)
    .sort((a,b)=>b.ratio-a.ratio).slice(0,8);
  const fmt = n => n>=1000000?'$'+(n/1000000).toFixed(1)+'M':'$'+(n/1000).toFixed(0)+'K';
  document.getElementById('ger-alertas').innerHTML = alertas.map(c => {
    const col = c.ratio>=2?'#C00000':'#C55A11';
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--brd)">
      <span>${c.nombre.split(' ').slice(0,2).join(' ')}</span>
      <span style="color:${col};font-weight:600">${c.ratio.toFixed(1)}x</span>
    </div>`;
  }).join('') || '<div style="color:var(--txt2)">Sin alertas</div>';

  // Top saldos
  const topSaldos = clientesArr.filter(c=>c.saldo_jun>0).sort((a,b)=>b.saldo_jun-a.saldo_jun).slice(0,10);
  document.getElementById('ger-top-saldos').innerHTML = topSaldos.map(c => {
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--brd)">
      <span>${c.nombre.split(' ').slice(0,2).join(' ')}</span>
      <span style="color:var(--txt2)">${fmt(c.saldo_jun)}</span>
    </div>`;
  }).join('');

  // Select clientes
  const sel = document.getElementById('ger-sel-cliente');
  sel.innerHTML = clientesArr.slice(0,50).map((c,i) =>
    `<option value="${i}">${c.nombre} — venta ${fmt(c.total_venta)} · saldo ${fmt(c.saldo_jun)} · ratio ${c.ratio.toFixed(1)}x</option>`
  ).join('');
  sel._data = clientesArr;
  gerUpdateDetalle();

  // Top productos
  const topProd = Object.entries(_gerData.productos)
    .map(([art,d])=>({art,...d}))
    .filter(p=>p.venta>100000)
    .sort((a,b)=>b.venta-a.venta).slice(0,10);
  if(document.getElementById('ger-chart-prod')) {
    _gerCharts.prod = new Chart(document.getElementById('ger-chart-prod'), {
      type:'bar', indexAxis:'y',
      data:{labels:topProd.map(p=>p.art.slice(0,30)),
        datasets:[
          {label:'Venta',data:topProd.map(p=>Math.round(p.venta/1000)),backgroundColor:'#D85A30',borderRadius:3,barThickness:14},
          {label:'Margen',data:topProd.map(p=>Math.round(p.margen/1000)),backgroundColor:'#1D9E75',borderRadius:3,barThickness:14},
        ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10},color:textColor,boxWidth:10}},
          tooltip:{callbacks:{label:c=>' $'+c.parsed.x.toFixed(0)+'K'}}},
        scales:{x:{ticks:{color:textColor,font:{size:10},callback:v=>'$'+v+'K'},grid:{color:gridColor}},
          y:{ticks:{color:textColor,font:{size:9}},grid:{display:false}}}}
    });
  }
}

function gerVista(v, btn) {
  _gerVista = v;
  document.querySelectorAll('#inf-sec-gerencial .btn.sm').forEach(b => {
    b.style.background=''; b.style.color='';
  });
  if(btn){btn.style.background='var(--P)';btn.style.color='#fff';}
  gerUpdateDetalle();
}

function gerUpdateDetalle() {
  const sel = document.getElementById('ger-sel-cliente');
  if(!sel||!sel._data) return;
  const c = sel._data[parseInt(sel.value)];
  if(!c) return;
  const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)';
  const textColor = isDark?'#aaa':'#777';
  const ordenMeses = ['Ene','Feb','Mar','Abr','May','Jun'];
  const mesesDisp = ordenMeses.filter(m=>c.ventas[m]||c.saldos[m]);

  if(_gerDetalleChart){try{_gerDetalleChart.destroy();}catch(e){}}

  const datasets = [];
  if(_gerVista==='saldo'||_gerVista==='ambos') {
    datasets.push({label:'Saldo',data:mesesDisp.map(m=>Math.round((c.saldos[m]||0)/1000)),
      borderColor:'#D85A30',backgroundColor:'rgba(216,90,48,0.08)',
      borderWidth:2,pointRadius:4,pointBackgroundColor:'#D85A30',fill:_gerVista==='saldo',tension:0.3});
  }
  if(_gerVista==='venta'||_gerVista==='ambos') {
    datasets.push({label:'Venta',data:mesesDisp.map(m=>Math.round((c.ventas[m]||0)/1000)),
      borderColor:'#378ADD',backgroundColor:'rgba(55,138,221,0.08)',
      borderWidth:2,pointRadius:4,pointBackgroundColor:'#378ADD',fill:_gerVista==='venta',tension:0.3,
      borderDash:_gerVista==='ambos'?[5,3]:[]});
  }

  _gerDetalleChart = new Chart(document.getElementById('ger-chart-detalle'), {
    type:'line', data:{labels:mesesDisp,datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:datasets.length>1,position:'bottom',labels:{font:{size:10},color:textColor,boxWidth:10}},
        tooltip:{callbacks:{label:c=>' $'+c.parsed.y.toFixed(0)+'K'}}},
      scales:{x:{ticks:{color:textColor,font:{size:11}},grid:{display:false}},
        y:{ticks:{color:textColor,font:{size:10},callback:v=>'$'+v+'K'},grid:{color:gridColor}}}}
  });

  const fmt = n => n>=1000000?'$'+(n/1000000).toFixed(1)+'M':'$'+(n/1000).toFixed(0)+'K';
  document.getElementById('ger-detalle-info').textContent =
    `Venta total: ${fmt(c.total_venta)} · Saldo actual: ${fmt(c.saldo_jun)} · Ratio: ${c.ratio.toFixed(1)}x`;
}

// ─── DASHBOARD ───
function renderDash(){
  const hoy=hoyLocal();
  const pedPend=_pedidos.filter(p=>p.estado==='pendiente').length;
  const remHoy=_remitos.filter(r=>r.fecha===hoy);
  const ventaHoy=remHoy.reduce((a,r)=>a+(r.total||0),0);
  const deudaTotal=_clientes.reduce((a,c)=>a+(c.saldo>0?c.saldo:0),0);
  const vencidos=_clientes.filter(c=>{
    if((c.saldo||0)<=0)return false;
    const d=diasDesde(c.ultimo_remito);
    return d!==null&&d>(c.condicion_pago||0)+5;
  });
  document.getElementById('d-ped').textContent=pedPend;
  document.getElementById('d-venta').textContent=fmt(ventaHoy);
  document.getElementById('d-deuda').textContent=fmt(deudaTotal);
  document.getElementById('d-venc').textContent=vencidos.length;
  const lr=_remitos.slice(0,6);
  document.getElementById('d-rem-list').innerHTML=lr.length?lr.map(r=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--brd);font-size:12px"><span style="font-weight:500">${r.cliente}</span><span style="color:var(--txt2)">${r.fecha}</span><span style="color:var(--P);font-weight:600">${fmt(r.total)}</span></div>`).join(''):'<div class="empty">Sin remitos aún</div>';
  document.getElementById('d-venc-list').innerHTML=vencidos.length?vencidos.slice(0,5).map(c=>{const d=diasDesde(c.ultimo_remito);return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--brd);font-size:12px"><span style="font-weight:500">${c.nombre}</span><span class="b bD">${d}d</span><span style="color:var(--D);font-weight:600">${fmt(c.saldo)}</span></div>`;}).join(''):'<div class="empty">✅ Ninguna cuenta vencida</div>';
  renderDashCharts();
}

// ─── INFORMES ───
function initInformes(){
  infTab('ventas');
  const hoy=hoyLocal();
  const hace30=new Date(Date.now()-30*864e5).toISOString().split('T')[0];
  ['inf-desde','inf-vd-desde','inf-com-desde','desc-cli-desde','desc-pro-desde','desc-ctdo-desde'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=hace30;});
  ['inf-hasta','inf-vd-hasta','inf-com-hasta','desc-cli-hasta','desc-pro-hasta','desc-ctdo-hasta'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=hoy;});
  ['cmgp-desde','cmgc-desde'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=hace30;});
  ['cmgp-hasta','cmgc-hasta'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=hoy;});
  setTimeout(()=>{const btn=document.getElementById('inf-tab-ventas');if(btn)btn.focus();},50);
}

async function informeVentas(){
  const desde=document.getElementById('inf-desde').value;
  const hasta=document.getElementById('inf-hasta').value;
  const {data}=await sb.from('remitos').select('*').gte('fecha',desde).lte('fecha',hasta);
  const el=document.getElementById('inf-ventas-res');
  if(!data||!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin remitos en ese período</div>';return;}
  const total=data.reduce((a,r)=>a+r.total,0);
  const porDia={};
  data.forEach(r=>{porDia[r.fecha]=(porDia[r.fecha]||0)+r.total;});
  el.innerHTML=`<div style="background:var(--PL);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between">
    <span><b>${data.length}</b> remitos</span><span style="font-size:18px;font-weight:700;color:var(--PD)">${fmt(total)}</span>
  </div>
  <div style="font-size:12px;color:var(--txt2);margin-bottom:6px">Por día:</div>
  ${Object.entries(porDia).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10).map(([d,t])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--brd);font-size:12px"><span>${d}</span><span style="font-weight:600">${fmt(t)}</span></div>`).join('')}`;
  renderInfVentasChart(data);
}

async function informeVendedor(){
  const desde=document.getElementById('inf-vd-desde').value;
  const hasta=document.getElementById('inf-vd-hasta').value;
  const {data}=await sb.from('remitos').select('*').gte('fecha',desde).lte('fecha',hasta);
  const el=document.getElementById('inf-vd-res');
  if(!data||!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin remitos en ese período</div>';return;}
  const porVen={};
  data.forEach(r=>{const v=r.vendedor||'Sin asignar';if(!porVen[v])porVen[v]={total:0,cant:0};porVen[v].total+=r.total;porVen[v].cant++;});
  el.innerHTML=Object.entries(porVen).sort((a,b)=>b[1].total-a[1].total).map(([v,d])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--brd);font-size:13px"><span><b>${v}</b> <span style="color:var(--txt2);font-size:11px">${d.cant} rem.</span></span><span style="font-weight:700;color:var(--P)">${fmt(d.total)}</span></div>`).join('');
}

async function informeDeuda(){
  const dias=parseInt(document.getElementById('inf-dias').value)||0;
  const data=_clientes.filter(c=>{
    if((c.saldo||0)<=0)return false;
    const d=diasDesde(c.ultimo_remito);
    return d!==null&&d>=dias;
  }).sort((a,b)=>b.saldo-a.saldo);
  const el=document.getElementById('inf-deuda-res');
  if(!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin clientes con deuda en esos parámetros</div>';return;}
  const totalDeuda=data.reduce((a,c)=>a+c.saldo,0);
  el.innerHTML=`<div style="background:var(--DL);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between">
    <span><b>${data.length}</b> clientes</span><span style="font-size:16px;font-weight:700;color:var(--D)">${fmt(totalDeuda)}</span>
  </div>
  ${data.slice(0,20).map(c=>{const d=diasDesde(c.ultimo_remito);return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px"><span><b>${c.nombre}</b> <span style="color:var(--txt2)">${c.localidad}</span></span><span><span class="b ${d>(c.condicion_pago||0)+5?'bD':'bW'}" style="margin-right:6px">${d}d</span><b style="color:var(--D)">${fmt(c.saldo)}</b></span></div>`;}).join('')}`;
}

async function informeInactivos(){
  const dias=parseInt(document.getElementById('inf-inact').value)||30;
  const data=_clientes.filter(c=>{
    const d=diasDesde(c.ultimo_remito);
    return d===null||d>=dias;
  }).sort((a,b)=>(diasDesde(b.ultimo_remito)||9999)-(diasDesde(a.ultimo_remito)||9999));
  const el=document.getElementById('inf-inact-res');
  if(!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Todos los clientes compraron recientemente</div>';return;}
  el.innerHTML=`<div style="background:var(--WL);border-radius:8px;padding:8px 12px;margin-bottom:8px"><b>${data.length}</b> clientes sin compras hace más de ${dias} días</div>
  ${data.slice(0,20).map(c=>{const d=diasDesde(c.ultimo_remito);return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px"><span><b>${c.nombre}</b> <span style="color:var(--txt2)">${c.localidad} · ${c.vendedor||'—'}</span></span><span class="b bW">${d!==null?d+'d':'nunca'}</span></div>`;}).join('')}`;
}

function informeSinCompras(){
  const dias=parseInt(document.getElementById('inf-sin').value)||30;
  const data=_clientes.filter(c=>{
    const d=diasDesde(c.ultimo_remito);
    return d===null||d>=dias;
  }).sort((a,b)=>(diasDesde(b.ultimo_remito)||9999)-(diasDesde(a.ultimo_remito)||9999));
  const el=document.getElementById('inf-sin-res');
  if(!el)return;
  if(!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Todos los clientes compraron recientemente</div>';return;}
  el.innerHTML=`<div style="background:var(--WL);border-radius:8px;padding:8px 12px;margin-bottom:8px"><b>${data.length}</b> clientes sin compras hace más de ${dias} días</div>
  ${data.slice(0,50).map(c=>{const d=diasDesde(c.ultimo_remito);return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px"><span><b>${c.nombre}</b> <span style="color:var(--txt2)">${c.localidad||''} · ${c.vendedor||'—'}</span></span><span class="b bW">${d!==null?d+'d':'nunca'}</span></div>`;}).join('')}`;
}

async function informeProductos(){
  const {data}=await sb.from('remitos').select('items,fecha').order('fecha',{ascending:false}).limit(200);
  const el=document.getElementById('inf-pro-res');
  if(!data||!data.length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin datos</div>';return;}
  const prod={};
  data.forEach(r=>(r.items||[]).forEach(it=>{
    if(!prod[it.nom])prod[it.nom]={cant:0,total:0};
    prod[it.nom].cant+=it.cant;
    prod[it.nom].total+=it.precio*it.cant*(1-it.dto/100);
  }));
  el.innerHTML=`<div style="font-size:12px;color:var(--txt2);margin-bottom:8px">Basado en últimos 200 remitos</div>`+
  Object.entries(prod).sort((a,b)=>b[1].total-a[1].total).slice(0,15).map(([nom,d])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--brd);font-size:12px"><span><b>${nom}</b></span><span style="color:var(--P);font-weight:600">${fmt(d.total)}</span></div>`).join('');
}

async function informeComisiones(){
  const desde=document.getElementById('inf-com-desde').value;
  const hasta=document.getElementById('inf-com-hasta').value;
  const pctVen=parseFloat(document.getElementById('inf-com-pct-ven').value)||0;
  const pctCob=parseFloat(document.getElementById('inf-com-pct-cob').value)||0;
  const el=document.getElementById('inf-com-res');

  const [{data:rems},{data:cobs}]=await Promise.all([
    sb.from('remitos').select('vendedor,total,fecha').gte('fecha',desde).lte('fecha',hasta),
    sb.from('cobros').select('vendedor,importe,fecha').gte('fecha',desde).lte('fecha',hasta)
  ]);

  // Agrupar por vendedor
  const vens={};
  (rems||[]).forEach(r=>{
    const v=r.vendedor||'Sin asignar';
    if(!vens[v])vens[v]={ventas:0,cobranza:0};
    vens[v].ventas+=r.total||0;
  });
  (cobs||[]).forEach(c=>{
    const v=c.vendedor||'Sin asignar';
    if(!vens[v])vens[v]={ventas:0,cobranza:0};
    vens[v].cobranza+=c.importe||0;
  });

  if(!Object.keys(vens).length){el.innerHTML='<div style="color:var(--txt2);font-size:12px">Sin datos en ese período</div>';return;}

  el.innerHTML=`
    <div style="font-size:12px;color:var(--txt2);margin-bottom:8px">${desde} al ${hasta} · Ventas: ${pctVen}% · Cobranza: ${pctCob}%</div>
    ${Object.entries(vens).map(([v,d])=>{
      const comVen=d.ventas*(pctVen/100);
      const comCob=d.cobranza*(pctCob/100);
      const total=comVen+comCob;
      return `<div class="card" style="margin-bottom:8px">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px">${v}</div>
        <div class="g2" style="gap:8px">
          <div style="font-size:12px">
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd)">
              <span>Ventas</span><span style="font-weight:600">${fmt(d.ventas)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd)">
              <span>Comisión ventas (${pctVen}%)</span><span style="color:var(--P);font-weight:600">${fmt(comVen)}</span>
            </div>
          </div>
          <div style="font-size:12px">
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd)">
              <span>Cobranza</span><span style="font-weight:600">${fmt(d.cobranza)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--brd)">
              <span>Comisión cobranza (${pctCob}%)</span><span style="color:var(--P);font-weight:600">${fmt(comCob)}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--PL);border-radius:6px;padding:8px 12px;margin-top:8px">
          <span style="font-weight:600">Total comisión</span>
          <span style="font-size:18px;font-weight:700;color:var(--PD)">${fmt(total)}</span>
        </div>
      </div>`;
    }).join('')}
  `;
}

// ─── EXPORTAR TODO ───
async function exportarTodo(){
  if(!confirm('¿Exportar todos los datos a Excel/CSV?'))return;
  await cargarTodo();
  const hoy=new Date().toLocaleDateString('es-AR').replace(/\//g,'-');
  const datos={
    [`clientes_${hoy}.csv`]:[
      ['Código','Nombre','Dirección','Localidad','Teléfono','Zona','Vendedor','Descuento%','Saldo','Cond.Pago','Total Comprado','Último Remito'],
      ..._clientes.map(c=>[c.codigo||'',c.nombre||'',c.direccion||'',c.localidad||'',c.telefono||'',c.zona||'',c.vendedor||'',c.descuento||0,c.saldo||0,c.condicion_pago||0,c.total_comprado||0,c.ultimo_remito||''])
    ].map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n'),
    [`productos_${hoy}.csv`]:[
      ['Código','Nombre','Proveedor','Categoría','Unidad','Costo','Precio','IVA%','Dto%','Stock'],
      ..._productos.map(p=>[p.codigo||'',p.nombre||'',p.proveedor_nom||'',p.rubro||'',p.unidad||'',p.costo||0,p.precio||0,p.iva||21,p.descuento||0,p.stock||0])
    ].map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n'),
    [`remitos_${hoy}.csv`]:[
      ['Nro','Fecha','Cliente','Localidad','Vendedor','Total','Cobrado','Saldo Pendiente'],
      ..._remitos.map(r=>['R-'+String(r.id).padStart(4,'0'),r.fecha||'',r.cliente||'',r.localidad||'',r.vendedor||'',r.total||0,r.cobrado?'SI':'NO',r.saldo_pendiente||r.total||0])
    ].map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n'),
    [`cobros_${hoy}.csv`]:[
      ['Fecha','Cliente','Forma','Efectivo','Transferencia','Cheque','Retenciones','Total','Reparto','Vendedor'],
      ..._cobros.map(c=>[c.fecha||'',c.cliente||'',c.forma||'',c.efectivo||0,c.transferencia||0,(c.cheque_propio||0)+(c.cheque_terceros||0),(c.retencion_ganancias||0)+(c.retencion_ing_brutos||0)+(c.retencion_otras||0),c.importe||0,c.reparto||'',c.vendedor||''])
    ].map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n'),
  };
  for(const [nombre,contenido] of Object.entries(datos)){
    const blob=new Blob(['\uFEFF'+contenido],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=nombre;
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await new Promise(r=>setTimeout(r,400));
  }
  alert(`✅ Exportados 4 archivos:\n• clientes (${_clientes.length})\n• productos (${_productos.length})\n• remitos (${_remitos.length})\n• cobros (${_cobros.length})\n\nAbrís cada uno con Excel.`);
}

// ─── RENDICIÓN ───
// ─── STOCK Y MERMA ───
let _conteoActual = {};

function iniciarConteo(){
  _conteoActual={};
  document.getElementById('stock-conteo-section').style.display='block';
  document.getElementById('stock-historial').style.display='none';
  document.getElementById('stock-informe').style.display='none';
  
  // Poblar proveedor selector
  const provs=[...new Set(_productos.map(p=>p.proveedor_nom).filter(Boolean))].sort();
  const sel=document.getElementById('stock-prov');
  sel.innerHTML='<option value="">Todos los proveedores</option>';
  provs.forEach(pv=>{const o=document.createElement('option');o.value=pv;o.textContent=pv;sel.appendChild(o);});
  
  renderConteo();
}

function filtrarConteo(){renderConteo();}

function renderConteo(){
  const q=(document.getElementById('stock-q').value||'').toLowerCase();
  const cat=document.getElementById('stock-cat').value;
  const prov=document.getElementById('stock-prov').value;
  const rubro=document.getElementById('stock-rubro')?.value||'';
  // Poblar rubros dinámicamente
  const selRubro=document.getElementById('stock-rubro');
  if(selRubro && selRubro.options.length<=1){
    const rubros=[...new Set(_productos.map(p=>p.rubro||'').filter(Boolean))].sort();
    rubros.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;selRubro.appendChild(o);});
  }
  
  let data=_productos.filter(p=>{
    const okQ=!q||(p.nombre||'').toLowerCase().includes(q)||(p.codigo||'').toString().includes(q);
    const okC=!cat||(p.rubro||'').toUpperCase()===cat;
    const okRubro=!rubro||(p.rubro||'')===rubro;;
    const okP=!prov||(p.proveedor_nom||'')===prov;
    return okQ&&okC&&okP&&okRubro;
  });

  const tbody=document.getElementById('stock-tbody');
  tbody.innerHTML=data.map(p=>{
    const stockSistema=p.stock||0;
    const fisico=_conteoActual[p.id]!==undefined?_conteoActual[p.id]:'';
    const diff=fisico!==''?parseFloat(fisico)-stockSistema:'';
    const pctMerma=diff!==''&&stockSistema>0?((diff/stockSistema)*100).toFixed(1):'';
    const colorDiff=diff===''?'':diff<0?'color:var(--D);font-weight:600':diff>0?'color:var(--A)':'color:var(--P)';
    return `<tr>
      <td style="font-weight:500">${p.nombre}</td>
      <td style="font-size:11px;color:var(--txt2)">${p.proveedor_nom||'—'}</td>
      <td>${p.unidad||''}</td>
      <td style="text-align:right;font-weight:600">${fmtN(stockSistema,2)}</td>
      <td style="text-align:center">
        <input type="number" value="${fisico}" min="0" step="0.01" placeholder="0"
          style="width:90px;padding:4px 7px;border:1px solid var(--brd);border-radius:6px;text-align:center;font-size:13px;${diff<0&&diff!==''?'border-color:var(--D)':''}"
          onchange="_conteoActual[${p.id}]=parseFloat(this.value)||0;renderConteo()">
      </td>
      <td style="text-align:right;${colorDiff}">${diff!==''?(diff>0?'+':'')+fmtN(diff,2):'—'}</td>
      <td style="text-align:right;${diff<0?'color:var(--D)':''}">${pctMerma!==''?pctMerma+'%':'—'}</td>
    </tr>`;
  }).join('');
}

function cancelarConteo(){
  _conteoActual={};
  document.getElementById('stock-conteo-section').style.display='none';
  document.getElementById('stock-historial').style.display='block';
  document.getElementById('stock-informe').style.display='none'; 
}

function verInformeStockAntes(){
  const diffs=_productos.filter(p=>_conteoActual[p.id]!==undefined).map(p=>{
    const fisico=_conteoActual[p.id];
    const sistema=p.stock||0;
    const diff=fisico-sistema;
    return {...p, fisico, sistema, diff, pctMerma: sistema>0?(diff/sistema*100):0};
  }).filter(p=>p.diff!==0).sort((a,b)=>a.diff-b.diff);

  if(!diffs.length){alert('No hay diferencias para mostrar.');return;}

  const mermas=diffs.filter(p=>p.diff<0);
  const sobrantes=diffs.filter(p=>p.diff>0);
  const totalMermaKg=mermas.reduce((a,p)=>a+Math.abs(p.diff),0);

  const el=document.getElementById('stock-informe');
  el.style.display='block';
  el.innerHTML=`<div class="card" style="margin-top:12px">
    <div style="font-weight:600;font-size:14px;margin-bottom:12px">📊 Resumen de diferencias</div>
    <div class="g2" style="margin-bottom:12px">
      <div class="stat"><div class="n" style="color:var(--D)">${mermas.length}</div><div class="l">Productos con merma</div></div>
      <div class="stat"><div class="n" style="color:var(--D)">${fmtN(totalMermaKg,2)} kg/un</div><div class="l">Total merma</div></div>
    </div>
    ${mermas.length?`<div style="font-weight:600;margin-bottom:8px;color:var(--D)">⬇️ Mermas (menos de lo esperado):</div>
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Producto</th><th>Proveedor</th><th style="text-align:right">Sistema</th><th style="text-align:right">Físico</th><th style="text-align:right">Diferencia</th><th style="text-align:right">% Merma</th></tr></thead>
      <tbody>${mermas.map(p=>`<tr>
        <td>${p.nombre}</td><td style="font-size:11px;color:var(--txt2)">${p.proveedor_nom||''}</td>
        <td style="text-align:right">${fmtN(p.sistema,2)}</td>
        <td style="text-align:right">${fmtN(p.fisico,2)}</td>
        <td style="text-align:right;color:var(--D);font-weight:600">${fmtN(p.diff,2)}</td>
        <td style="text-align:right;color:var(--D)">${Math.abs(p.pctMerma).toFixed(1)}%</td>
      </tr>`).join('')}</tbody>
    </table>`:''}
    ${sobrantes.length?`<div style="font-weight:600;margin-bottom:8px;color:var(--A)">⬆️ Sobrantes (más de lo esperado):</div>
    <table class="tbl">
      <thead><tr><th>Producto</th><th style="text-align:right">Sistema</th><th style="text-align:right">Físico</th><th style="text-align:right">Diferencia</th></tr></thead>
      <tbody>${sobrantes.map(p=>`<tr>
        <td>${p.nombre}</td>
        <td style="text-align:right">${fmtN(p.sistema,2)}</td>
        <td style="text-align:right">${fmtN(p.fisico,2)}</td>
        <td style="text-align:right;color:var(--A);font-weight:600">+${fmtN(p.diff,2)}</td>
      </tr>`).join('')}</tbody>
    </table>`:''}
    <button class="btn A" onclick="imprimirStock()" style="margin-top:12px">🖨️ Imprimir informe</button>
  </div>`;
}

async function guardarConteo() {
  if (!Object.keys(_conteoActual).length) { alert('No ingresaste ningún stock físico.'); return; }
  
  let actualizados = 0;
  let diferenciaTotal = 0;
  
  for (const [prodId, fisico] of Object.entries(_conteoActual)) {
    const prod = _productos.find(p => p.id === parseInt(prodId));
    const sistema = prod?.stock || 0;
    const diff = fisico - sistema;
    diferenciaTotal += diff;
    
    await sb.from('productos').update({ stock: fisico }).eq('id', parseInt(prodId));
    actualizados++;
  }
  
  // Guardar el registro del conteo en el historial
  await sb.from('conteos_stock').insert({
    fecha: hoyLocal(),
    usuario: usuarioActual?.nombre || 'Sistema',
    productos_ajustados: actualizados,
    diferencia_total: diferenciaTotal
  });
  
  await cargarProductos();
  verInformeStockAntes();
  document.getElementById('stock-conteo-section').style.display = 'none';
  alert(`✅ Stock actualizado para ${actualizados} productos.`);
  renderProductos();
  cargarHistorialStock(); // Recargar historial
}

function imprimirStock(){
  const body=document.getElementById('stock-informe').innerHTML;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Informe de Stock</title><style>body{font-family:Arial;padding:20px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ddd}th{background:#f5f5f5}@media print{button{display:none}}</style></head><body><h2>Distribuidora Lila — Informe de Stock ${new Date().toLocaleDateString('es-AR')}</h2>${body}</body></html>`);
  w.document.close();w.print();
}

// ─── NAVEGACIÓN CON FLECHAS EN BUSCADOR DE STOCK ───
let _stockIdx = -1;

function navStockBusq(e) {
  const rows = document.querySelectorAll('#stock-tbody tr');
  if (!rows.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _stockIdx = Math.min(_stockIdx + 1, rows.length - 1);
    rows.forEach((r, i) => r.style.background = i === _stockIdx ? 'var(--PL)' : '');
    rows[_stockIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _stockIdx = Math.max(_stockIdx - 1, 0);
    rows.forEach((r, i) => r.style.background = i === _stockIdx ? 'var(--PL)' : '');
    rows[_stockIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_stockIdx >= 0 && rows[_stockIdx]) {
      const inp = rows[_stockIdx].querySelector('input[type="number"]');
      if (inp) { inp.focus(); inp.select(); }
    }
    _stockIdx = -1;
  }
}

function navInfTabs(e){
  const tabs=['ventas','descuentos','clientes','productos','comisiones'];
  const btns=tabs.map(t=>document.getElementById('inf-tab-'+t));
  const idx=btns.indexOf(document.activeElement);
  if(idx<0)return;
  if(e.key==='ArrowRight'){e.preventDefault();const next=btns[(idx+1)%btns.length];next.focus();next.click();}
  if(e.key==='ArrowLeft'){e.preventDefault();const prev=btns[(idx-1+btns.length)%btns.length];prev.focus();prev.click();}
  if(e.key==='Tab'){e.preventDefault();
    // Ir al primer campo de la sección activa
    const sec=document.querySelector('[id^="inf-sec-"]:not([style*="display: none"]):not([style*="display:none"])');
    if(sec){const first=sec.querySelector('input,button,select');if(first)first.focus();}
  }
}

function infTab(tab){
  const tabs=['ventas','descuentos','clientes','productos','comisiones','gerencial','comisiones2','cmg-prod','cmg-cli','financiamiento','precios','historico'];
  if(tab==='gerencial') setTimeout(()=>cargarGerencialSupabase(), 100);
  if(tab==='historico') setTimeout(()=>informeHistoricoChart(), 150);
  tabs.forEach(t=>{
    const el=document.getElementById('inf-sec-'+t);
    if(el)el.style.display=t===tab?'block':'none';
    const btn=document.getElementById('inf-tab-'+t);
    if(btn){
      btn.style.background=t===tab?'var(--P)':'';
      btn.style.color=t===tab?'#fff':'';
      btn.tabIndex=t===tab?0:-1;
    }
  });
}

function informeFinanciamiento(){
  const el=document.getElementById('inf-fin-res');
  if(!el)return;
  const provsConPlazo=_proveedores.filter(p=>p.plazo_pago_dias!=null);
  if(!provsConPlazo.length){
    el.innerHTML='<div class="empty">Ningún proveedor tiene definido el plazo de pago en días.<br>Editá los proveedores en <b>Maestros → Proveedores</b> para completar el campo "Plazo días".</div>';
    return;
  }
  // Plazo promedio clientes ponderado por total comprado
  const cliActivos=_clientes.filter(c=>(c.total_comprado||0)>0);
  const totalComp=cliActivos.reduce((a,c)=>a+(c.total_comprado||0),0);
  const plazoProm=Math.round(totalComp>0
    ?cliActivos.reduce((a,c)=>a+(c.condicion_pago||0)*(c.total_comprado||0),0)/totalComp
    :cliActivos.reduce((a,c)=>a+(c.condicion_pago||0),0)/(cliActivos.length||1));
  const plazoPmProv=Math.round(provsConPlazo.reduce((a,p)=>a+(p.plazo_pago_dias||0),0)/provsConPlazo.length);
  const balNeto=plazoPmProv-plazoProm;
  const filas=provsConPlazo.sort((a,b)=>b.plazo_pago_dias-a.plazo_pago_dias).map(p=>{
    const d=(p.plazo_pago_dias||0)-plazoProm;
    const badge=d>0?'<span class="b bP">✅ Nos financia</span>':d<0?'<span class="b bD">⚠️ Financiamos</span>':'<span class="b bW">= Equilibrio</span>';
    return `<tr>
      <td style="font-weight:600">${p.nombre}</td>
      <td style="text-align:center">${p.plazo_pago_dias}d</td>
      <td style="text-align:center">${plazoProm}d</td>
      <td style="text-align:center;font-weight:700;color:${d>0?'var(--P)':d<0?'var(--D)':'var(--txt)'}">${d>0?'+':''}${d}d</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
  el.innerHTML=`
    <div class="g2" style="margin-bottom:14px">
      <div class="stat"><div class="n">${plazoProm}d</div><div class="l">Plazo promedio a clientes (ponderado)</div></div>
      <div class="stat"><div class="n" style="color:${balNeto>=0?'var(--P)':'var(--D)'}">${balNeto>=0?'+':''}${balNeto}d</div><div class="l">Balance neto · ${balNeto>=0?'proveedores te financian':'estás financiando clientes'}</div></div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Proveedor</th><th style="text-align:center">Plazo prov.</th><th style="text-align:center">Plazo clientes</th><th style="text-align:center">Diferencia</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${provsConPlazo.length<_proveedores.length?`<div style="font-size:11px;color:var(--txt2);margin-top:8px">⚠️ ${_proveedores.length-provsConPlazo.length} proveedor(es) sin plazo definido — no incluidos en el análisis.</div>`:''}
  `;
}

async function informePrecios(){
  const el=document.getElementById('inf-prec-res');
  if(!el)return;
  el.innerHTML='<div class="loading">Calculando...</div>';

  const desde=document.getElementById('prec-desde')?.value||'';
  const hasta=document.getElementById('prec-hasta')?.value||'';
  const hoy=hoyLocal();
  const hace30=new Date(Date.now()-30*864e5).toISOString().split('T')[0];
  const fd=desde||hace30, fh=hasta||hoy;

  // Ventas del período
  const rems=_remitos.filter(r=>!r.anulado&&r.fecha>=fd&&r.fecha<=fh);
  const totalVentas=rems.reduce((a,r)=>a+(r.total||0),0);

  // Gastos fijos y variables (de localStorage _gf)
  const gfActivos=_gf.filter(g=>g.activo!==false&&g.importe>0);
  const TIPO_VARIABLE='Combustible y Lubricante';
  const totalGF=gfActivos.filter(g=>g.tipo!==TIPO_VARIABLE).reduce((a,g)=>a+g.importe,0);
  const totalGV=gfActivos.filter(g=>g.tipo===TIPO_VARIABLE).reduce((a,g)=>a+g.importe,0);
  const pctGF=totalVentas>0?(totalGF/totalVentas):0;
  const pctGV=totalVentas>0?(totalGV/totalVentas):0;
  const pctTotal=pctGF+pctGV;

  // Ventas por producto en el período
  const ventasProd={};
  rems.forEach(r=>(r.items||[]).forEach(it=>{
    const k=it.nom||(it.id?String(it.id):'?');
    if(!ventasProd[k])ventasProd[k]={importe:0,cant:0,id:it.id};
    const neto=it.precio*it.cant*(1-(it.dto||0)/100);
    ventasProd[k].importe+=neto;ventasProd[k].cant+=it.cant;
  }));

  // Construir tabla por producto
  const precCat=document.getElementById('prec-cat')?.value||'';
  const precSubcat=document.getElementById('prec-subcat')?.value||'';
  const prods=_productos.filter(p=>p.precio>0&&(!precCat||(p.rubro||'')===precCat)&&(!precSubcat||(p.linea||'')===precSubcat));
  const rows=prods.map(p=>{
    const costo=p.costo||0;const precio=p.precio||0;
    const mReal=precio>0?((precio-costo)/precio*100):0;
    const mObj=p.margen_objetivo||0;
    // Gastos imputados al producto (proporcional a ventas del producto vs total)
    const vProd=ventasProd[p.nombre]?.importe||0;
    const pctProd=totalVentas>0?(vProd/totalVentas):0;
    const gfPorProd=pctProd*totalGF+pctProd*totalGV; // $ gastos imputados
    // Costo de gastos por unidad vendida
    const cantVendida=ventasProd[p.nombre]?.cant||0;
    const gfPorUnidad=cantVendida>0?(gfPorProd/cantVendida):(precio*pctTotal);
    const costoTotal=costo+gfPorUnidad;
    const mConGastos=precio>0?((precio-costoTotal)/precio*100):0;
    const cubre=mConGastos>=0;
    const dif=Math.round((mReal-mObj)*10)/10;
    const precioSug=mObj>0&&mObj<100?Math.ceil(costo/(1-mObj/100)):0;
    const subirEn=precioSug>precio?precioSug-precio:0;
    return {p,costo,precio,mReal:Math.round(mReal*10)/10,mObj,dif,costoTotal:Math.round(costoTotal*100)/100,mConGastos:Math.round(mConGastos*10)/10,cubre,precioSug,subirEn,cantVendida,vProd};
  }).sort((a,b)=>a.dif-b.dif);

  // KPIs
  const sinMargen=rows.filter(r=>r.mReal<0).length;
  const bajoObj=rows.filter(r=>r.mReal>=0&&r.dif<-5).length;
  const cercaObj=rows.filter(r=>r.mReal>=0&&r.dif>=-5&&r.dif<0).length;
  const enObj=rows.filter(r=>r.dif>=0).length;
  const sinCostoReal=rows.filter(r=>!r.cubre).length;

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">
      <div class="stat"><div class="n" style="color:var(--P)">${enObj}</div><div class="l">✅ En objetivo</div></div>
      <div class="stat"><div class="n" style="color:var(--W)">${cercaObj}</div><div class="l">⚠️ Cerca (≤5%)</div></div>
      <div class="stat"><div class="n" style="color:var(--D)">${bajoObj}</div><div class="l">🔴 Bajo objetivo</div></div>
      <div class="stat"><div class="n" style="color:var(--D)">${sinMargen}</div><div class="l">📉 A pérdida</div></div>
      <div class="stat"><div class="n" style="color:${sinCostoReal>0?'var(--D)':'var(--P)'}">${sinCostoReal}</div><div class="l">🏭 No cubre gastos</div></div>
    </div>

    ${totalVentas>0?`<div class="card" style="margin-bottom:12px;background:var(--bg2)">
      <div style="font-weight:600;font-size:12px;margin-bottom:8px">📊 Gastos fijos prorrateados — período ${fd} al ${fh}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
        <span>Ventas período: <b>${fmt(totalVentas)}</b></span>
        <span>GF fijos/mes: <b style="color:var(--D)">${fmt(totalGF)}</b> (<b>${(pctGF*100).toFixed(1)}%</b> s/ventas)</span>
        <span>Combustible: <b style="color:var(--W)">${fmt(totalGV)}</b> (<b>${(pctGV*100).toFixed(1)}%</b>)</span>
        <span>Total carga: <b style="color:var(--D)">${(pctTotal*100).toFixed(1)}%</b> sobre precio de venta</span>
      </div>
    </div>`:'<div class="empty" style="margin-bottom:12px">Sin ventas en el período — el prorrateo de gastos no está disponible. Ajustá las fechas.</div>'}

    <div class="tbl-wrap"><table class="tbl" style="font-size:12px">
      <thead><tr>
        <th>Producto</th><th>Costo</th><th>Precio</th>
        <th>Marg. real</th><th>Marg. obj</th><th>Estado</th>
        <th>GF/unidad</th><th>Costo total</th><th>Marg. c/GF</th>
        <th>Precio sug.</th>
      </tr></thead>
      <tbody>
      ${rows.map(({p,costo,precio,mReal,mObj,dif,costoTotal,mConGastos,cubre,precioSug,subirEn,cantVendida})=>{
        const badge=mReal<0?'<span class="b bD">📉</span>':dif<-5?'<span class="b bD">🔴</span>':dif<0?'<span class="b bW">⚠️</span>':'<span class="b bP">✅</span>';
        const gfUn=cantVendida>0?Math.round((costoTotal-costo)*100)/100:(Math.round(precio*pctTotal*100)/100);
        return `<tr style="${!cubre?'background:var(--DL)':''}">
          <td style="font-weight:600">${p.nombre}</td>
          <td>${fmt(costo)}</td>
          <td style="font-weight:600">${fmt(precio)}</td>
          <td style="font-weight:700;color:${mReal<0?'var(--D)':mReal<mObj?'var(--W)':'var(--P)'}">${mReal}%</td>
          <td style="color:var(--txt2)">${mObj>0?mObj+'%':'—'}</td>
          <td>${badge} ${dif!==0&&mObj>0?`<span style="font-size:10px;color:var(--txt2)">${dif>0?'+':''}${dif}%</span>`:''}</td>
          <td style="color:var(--txt2)">${gfUn>0?fmt(gfUn):'—'}</td>
          <td style="font-weight:600;color:${!cubre?'var(--D)':'var(--txt)'}">${fmt(costoTotal)}</td>
          <td style="font-weight:700;color:${mConGastos<0?'var(--D)':mConGastos<5?'var(--W)':'var(--P)'}">${mConGastos}%</td>
          <td style="${subirEn>0?'font-weight:700;color:var(--A)':'color:var(--txt2)'}">${subirEn>0?'+'+fmt(subirEn):'OK'}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>
    ${rows.some(r=>r.subirEn>0)?`
    <div class="card" style="margin-top:12px;background:var(--WL)">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">💡 Productos que necesitan ajuste de precio</div>
      ${rows.filter(r=>r.subirEn>0).map(({p,precio,precioSug,subirEn,mObj})=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--brd);font-size:13px">
          <span><b>${p.nombre}</b></span>
          <span style="color:var(--txt2)">${fmt(precio)} → <b style="color:var(--P)">${fmt(precioSug)}</b> (+${fmt(subirEn)} para recuperar ${mObj}% de margen)</span>
        </div>`).join('')}
    </div>`:''}
  `;
}

function informeDescuentosPor(grupo,desdeId,hastaId,resId){
  const desde=document.getElementById(desdeId)?.value;
  const hasta=document.getElementById(hastaId)?.value;
  const res=document.getElementById(resId);
  if(!res)return;
  const rems=_remitos.filter(r=>(!desde||r.fecha>=desde)&&(!hasta||r.fecha<=hasta));
  const totales={};let totalDesc=0,totalBruto=0;
  rems.forEach(r=>{
    (r.items||[]).forEach(it=>{
      const bruto=it.precio*it.cant;
      const desc=bruto*(it.dto||0)/100;
      if(desc<=0)return;
      totalDesc+=desc;totalBruto+=bruto;
      const key=grupo==='cliente'?r.cliente||'Sin cliente':it.nom||'Sin nombre';
      totales[key]=(totales[key]||0)+desc;
    });
  });
  if(!Object.keys(totales).length){res.innerHTML='<div style="color:var(--txt2);font-style:italic">Sin descuentos en el período</div>';return;}
  const filas=Object.entries(totales).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${k}</td><td style="text-align:right;color:var(--D)">${fmt(v)}</td><td style="text-align:right;color:var(--txt2)">${totalBruto>0?(v/totalBruto*100).toFixed(1)+'%':'—'}</td></tr>`).join('');
  res.innerHTML=`<div style="margin-bottom:8px;display:flex;gap:14px"><div><div style="font-size:10px;color:var(--txt2)">Total</div><div style="font-size:16px;font-weight:700;color:var(--D)">${fmt(totalDesc)}</div></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${grupo==='cliente'?'Cliente':'Producto'}</th><th style="text-align:right">Descuento</th><th style="text-align:right">% s/bruto</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

function informeDescuentosContado(){
  const desde=document.getElementById('desc-ctdo-desde')?.value;
  const hasta=document.getElementById('desc-ctdo-hasta')?.value;
  const res=document.getElementById('desc-ctdo-res');
  if(!res)return;
  const rems=_remitos.filter(r=>(!desde||r.fecha>=desde)&&(!hasta||r.fecha<=hasta));
  let totalDesc=0,totalVentas=0;
  const filas=rems.filter(r=>{
    const desc=(r.items||[]).reduce((a,it)=>a+(it.precio*it.cant*(it.dto||0)/100),0);
    return desc>0;
  }).map(r=>{
    const bruto=(r.items||[]).reduce((a,it)=>a+it.precio*it.cant,0);
    const desc=bruto-r.total;
    totalDesc+=desc;totalVentas+=bruto;
    return `<tr><td>${r.fecha}</td><td>${r.cliente}</td><td style="text-align:right">${fmt(bruto)}</td><td style="text-align:right;color:var(--D)">${fmt(desc)}</td><td style="text-align:right;color:var(--txt2)">${bruto>0?(desc/bruto*100).toFixed(1)+'%':'—'}</td></tr>`;
  }).join('');
  res.innerHTML=`<div style="margin-bottom:8px;display:flex;gap:14px"><div><div style="font-size:10px;color:var(--txt2)">Total descuentos</div><div style="font-size:16px;font-weight:700;color:var(--D)">${fmt(totalDesc)}</div></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Cliente</th><th style="text-align:right">Bruto</th><th style="text-align:right">Descuento</th><th style="text-align:right">%</th></tr></thead><tbody>${filas||'<tr><td colspan="5" style="text-align:center;color:var(--txt2)">Sin datos</td></tr>'}</tbody></table></div>`;
}

// ─── CMG POR PRODUCTO ───
async function informeCMGProductos(){
  const desde = document.getElementById('cmgp-desde').value;
  const hasta = document.getElementById('cmgp-hasta').value;
  const cmgCat = document.getElementById('cmgp-cat')?.value||'';
  const cmgSubcat = document.getElementById('cmgp-subcat')?.value||'';
  const el = document.getElementById('cmgp-res');
  el.innerHTML = '<div class="loading">Calculando...</div>';

  const {data:rems} = await sb.from('remitos').select('items,fecha,vendedor').gte('fecha', desde).lte('fecha', hasta);
  if(!rems || !rems.length){ el.innerHTML = '<div class="empty">Sin datos en ese período</div>'; return; }

  // Acumular por producto
  const prods = {};
  rems.forEach(r => {
    (r.items||[]).forEach(it => {
      const nom = it.nom||'Sin nombre';
      const prod = _productos.find(p => p.id === it.id || p.nombre === nom);
      if(cmgCat && (prod?.rubro||'') !== cmgCat) return;
      if(cmgSubcat && (prod?.linea||'') !== cmgSubcat) return;
      const costo = prod?.costo || 0;
      const precio = it.precio || 0;
      const cant = it.cant || 0;
      const dto = it.dto || 0;
      const venta = precio * cant * (1 - dto/100);
      const costoTotal = costo * cant;
      const cmg = venta - costoTotal;

      if(!prods[nom]) prods[nom] = {venta:0, costo:0, cmg:0, cant:0, unidad: prod?.unidad||''};
      prods[nom].venta += venta;
      prods[nom].costo += costoTotal;
      prods[nom].cmg += cmg;
      prods[nom].cant += cant;
    });
  });

  const arr = Object.entries(prods).map(([nom, d]) => ({
    nom, ...d,
    pct: d.venta > 0 ? (d.cmg / d.venta * 100) : 0
  })).sort((a,b) => b.cmg - a.cmg);

  const totalVenta = arr.reduce((a,x) => a+x.venta, 0);
  const totalCMG = arr.reduce((a,x) => a+x.cmg, 0);
  const pctTotal = totalVenta > 0 ? totalCMG/totalVenta*100 : 0;

  const sinCosto = arr.filter(x => x.costo === 0).length;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="stat"><div class="n">${fmt(totalVenta)}</div><div class="l">Venta total</div></div>
      <div class="stat"><div class="n" style="color:var(--D)">${fmt(totalVenta - totalCMG)}</div><div class="l">Costo total</div></div>
      <div class="stat"><div class="n" style="color:var(--P)">${fmt(totalCMG)}</div><div class="l">CMG total</div></div>
      <div class="stat"><div class="n" style="color:var(--P)">${pctTotal.toFixed(1)}%</div><div class="l">% CMG</div></div>
    </div>
    ${sinCosto > 0 ? `<div style="background:var(--WL);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--W);margin-bottom:10px">⚠️ ${sinCosto} producto(s) sin costo cargado — su CMG puede ser incorrecto. Cargá el costo en el maestro de productos.</div>` : ''}
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Producto</th>
        <th style="text-align:right">Cant.</th>
        <th style="text-align:right">Venta</th>
        <th style="text-align:right">Costo</th>
        <th style="text-align:right">CMG $</th>
        <th style="text-align:right">CMG %</th>
        <th style="text-align:right">% s/total</th>
      </tr></thead>
      <tbody>
        ${arr.map(x => {
          const color = x.pct >= 20 ? 'var(--P)' : x.pct >= 10 ? 'var(--W)' : 'var(--D)';
          const pctTotal2 = totalCMG > 0 ? x.cmg/totalCMG*100 : 0;
          return `<tr>
            <td style="font-weight:500">${x.nom}</td>
            <td style="text-align:right;color:var(--txt2)">${x.cant.toFixed(1)} ${x.unidad}</td>
            <td style="text-align:right">${fmt(x.venta)}</td>
            <td style="text-align:right;color:var(--txt2)">${x.costo > 0 ? fmt(x.costo) : '<span style="color:var(--W)">sin costo</span>'}</td>
            <td style="text-align:right;font-weight:600;color:${color}">${fmt(x.cmg)}</td>
            <td style="text-align:right;font-weight:700;color:${color}">${x.pct.toFixed(1)}%</td>
            <td style="text-align:right">
              <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
                <div style="height:6px;width:${Math.max(4,Math.min(80, pctTotal2*2))}px;background:${color};border-radius:3px"></div>
                <span style="font-size:11px;color:var(--txt2)">${pctTotal2.toFixed(1)}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="background:var(--PL);font-weight:700">
          <td>TOTAL</td>
          <td></td>
          <td style="text-align:right">${fmt(totalVenta)}</td>
          <td style="text-align:right">${fmt(totalVenta - totalCMG)}</td>
          <td style="text-align:right;color:var(--P)">${fmt(totalCMG)}</td>
          <td style="text-align:right;color:var(--P)">${pctTotal.toFixed(1)}%</td>
          <td></td>
        </tr>
      </tfoot>
    </table></div>`;
  renderCMGChart(arr, totalCMG);
}

// ─── CMG POR CLIENTE ───
async function informeCMGClientes(){
  const desde = document.getElementById('cmgc-desde').value;
  const hasta = document.getElementById('cmgc-hasta').value;
  const listaSimId = document.getElementById('cmgc-lista-sim')?.value||'';
  const listaSim = listaSimId?_listasPrecios.find(l=>l.id==listaSimId):null;
  const el = document.getElementById('cmgc-res');
  el.innerHTML = '<div class="loading">Calculando...</div>';

  const {data:rems} = await sb.from('remitos').select('*').gte('fecha', desde).lte('fecha', hasta);
  if(!rems || !rems.length){ el.innerHTML = '<div class="empty">Sin datos en ese período</div>'; return; }

  const clis = {};
  rems.forEach(r => {
    const cid = r.cliente_id;
    const nom = r.cliente || 'Sin nombre';
    if(!clis[cid]) clis[cid] = {nom, venta:0, costo:0, cmg:0, ventaSim:0, cmgSim:0, productos:{}, remitos:0};
    clis[cid].remitos++;

    (r.items||[]).forEach(it => {
      const prod = _productos.find(p => p.id === it.id || p.nombre === it.nom);
      const costo = prod?.costo || 0;
      const precio = it.precio || 0;
      const cant = it.cant || 0;
      const dto = it.dto || 0;
      const venta = precio * cant * (1 - dto/100);
      const costoTotal = costo * cant;
      const cmg = venta - costoTotal;
      const nomProd = it.nom || 'Sin nombre';

      clis[cid].venta += venta;
      clis[cid].costo += costoTotal;
      clis[cid].cmg += cmg;

      if(listaSim && prod){
        const precioSim = getPrecioLista(prod.id, listaSimId) || precio;
        const ventaSim = precioSim * cant * (1 - dto/100);
        clis[cid].ventaSim += ventaSim;
        clis[cid].cmgSim += ventaSim - costoTotal;
      } else {
        clis[cid].ventaSim += venta;
        clis[cid].cmgSim += cmg;
      }

      if(!clis[cid].productos[nomProd]) clis[cid].productos[nomProd] = {venta:0, costo:0, cmg:0, cant:0};
      clis[cid].productos[nomProd].venta += venta;
      clis[cid].productos[nomProd].costo += costoTotal;
      clis[cid].productos[nomProd].cmg += cmg;
      clis[cid].productos[nomProd].cant += cant;
    });
  });

  const arr = Object.entries(clis).map(([cid, d]) => ({
    cid, ...d,
    pct: d.venta > 0 ? d.cmg/d.venta*100 : 0,
    pctSim: d.ventaSim > 0 ? d.cmgSim/d.ventaSim*100 : 0
  })).sort((a,b) => b.cmg - a.cmg);

  const totalVenta = arr.reduce((a,x) => a+x.venta, 0);
  const totalCMG = arr.reduce((a,x) => a+x.cmg, 0);
  const totalCMGSim = arr.reduce((a,x) => a+x.cmgSim, 0);
  const pctTotal = totalVenta > 0 ? totalCMG/totalVenta*100 : 0;

  window._cmgcData = arr;

  const simBadge = listaSim ? `<span style="background:var(--PL);color:var(--PD);font-size:11px;border-radius:4px;padding:1px 6px;margin-left:6px">sim: ${listaSim.nombre}</span>` : '';

  const rows = arr.map((x, idx) => {
    const color = x.pct >= 20 ? 'var(--P)' : x.pct >= 10 ? 'var(--W)' : 'var(--D)';
    const colorSim = x.pctSim >= 20 ? 'var(--P)' : x.pctSim >= 10 ? 'var(--W)' : 'var(--D)';
    const diffCMG = x.cmgSim - x.cmg;
    const simCol = listaSim ? `
      <div style="text-align:right;min-width:80px">
        <div style="font-size:11px;color:var(--txt2)">CMG sim.</div>
        <div style="font-weight:700;color:${colorSim}">${fmt(x.cmgSim)}</div>
        <div style="font-size:10px;color:${diffCMG>=0?'var(--P)':'var(--D)'}">${diffCMG>=0?'+':''}${fmt(diffCMG)}</div>
      </div>` : '';
    return `<div class="cmgc-card" style="border:1px solid var(--brd);border-radius:8px;margin-bottom:8px">
      <div onclick="toggleCMGCliente(${idx},this)" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;background:var(--bg2);border-radius:8px;user-select:none">
        <div>
          <span style="font-weight:600;font-size:13px">${x.nom}</span>
          <span style="font-size:11px;color:var(--txt2);margin-left:8px">${x.remitos} remito(s)</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;text-align:right;flex-wrap:wrap">
          <div><div style="font-size:11px;color:var(--txt2)">Venta</div><div style="font-weight:600">${fmt(x.venta)}</div></div>
          <div><div style="font-size:11px;color:var(--txt2)">Costo</div><div style="font-weight:600;color:var(--D)">${fmt(x.costo)}</div></div>
          <div><div style="font-size:11px;color:var(--txt2)">CMG</div><div style="font-weight:700;color:${color}">${fmt(x.cmg)}</div></div>
          <div><div style="font-size:11px;color:var(--txt2)">%CMG</div><div style="font-weight:700;color:${color}">${x.pct.toFixed(1)}%</div></div>
          ${simCol}
          <span class="cmgc-arrow" style="color:var(--txt2);font-size:18px;line-height:1;transition:transform .2s">▸</span>
        </div>
      </div>
      <div class="cmgc-detalle" style="display:none;border-top:1px solid var(--brd)"></div>
    </div>`;
  }).join('');

  const simTotal = listaSim ? `<div class="stat"><div class="n" style="color:var(--PD)">${fmt(totalCMGSim)}</div><div class="l">CMG simulado${simBadge}</div></div>` : '';

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="stat"><div class="n">${arr.length}</div><div class="l">Clientes activos</div></div>
      <div class="stat"><div class="n">${fmt(totalVenta)}</div><div class="l">Venta total</div></div>
      <div class="stat"><div class="n" style="color:var(--P)">${fmt(totalCMG)}</div><div class="l">CMG total</div></div>
      <div class="stat"><div class="n" style="color:var(--P)">${pctTotal.toFixed(1)}%</div><div class="l">% CMG promedio</div></div>
      ${simTotal}
    </div>
    ${rows}`;
}

function toggleCMGCliente(idx, headerEl){
  const card = headerEl.closest('.cmgc-card');
  if(!card) return;
  const detalle = card.querySelector('.cmgc-detalle');
  const arrow = card.querySelector('.cmgc-arrow');
  if(!detalle) return;

  const open = detalle.style.display !== 'none';
  if(open){
    detalle.style.display = 'none';
    if(arrow) arrow.style.transform = '';
    headerEl.style.borderRadius = '8px';
    return;
  }

  // Construir el detalle si no está generado aún
  if(!detalle.innerHTML){
    const x = window._cmgcData && window._cmgcData[idx];
    if(!x){ detalle.style.display = 'block'; return; }
    const prods = Object.entries(x.productos).sort((a,b) => b[1].cmg - a[1].cmg);
    if(!prods.length){
      detalle.innerHTML = '<div class="empty" style="margin:12px">Sin detalle de productos</div>';
    } else {
      const filas = prods.map(([nom, d]) => {
        const pp = d.venta > 0 ? d.cmg/d.venta*100 : 0;
        const cc = pp >= 20 ? 'var(--P)' : pp >= 10 ? 'var(--W)' : 'var(--D)';
        return `<tr>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);font-weight:500">${nom}</td>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--txt2)">${d.cant%1===0?d.cant:d.cant.toFixed(2)}</td>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right">${fmt(d.venta)}</td>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right;color:var(--D)">${fmt(d.costo)}</td>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right;font-weight:600;color:${cc}">${fmt(d.cmg)}</td>
          <td style="padding:5px 8px;border-bottom:0.5px solid var(--brd);text-align:right;color:${cc}">${pp.toFixed(1)}%</td>
        </tr>`;
      }).join('');
      detalle.innerHTML = `<div style="padding:10px 14px">
        <div style="font-size:11px;font-weight:600;color:var(--txt2);text-transform:uppercase;margin-bottom:8px">Detalle por producto (${prods.length})</div>
        <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--bg2)">
            <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--brd)">Producto</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">Cant.</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">Venta</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">Costo</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">CMG $</th>
            <th style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--brd)">CMG %</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table></div>
      </div>`;
    }
  }
  detalle.style.display = 'block';
  if(arrow) arrow.style.transform = 'rotate(90deg)';
  headerEl.style.borderRadius = '8px 8px 0 0';
}

// ─── IMPORTADOR HISTÓRICO FOXPRO ───
let _impPeriodos = { ventas: [], saldos: [], resultado: [] };

async function initImportarHistorico() {
  await cargarPeriodosImport();
  renderSelectoresPeriodo();
  renderSelectorCruzado();
  renderDashboardEvolucion('todo');
}

async function cargarPeriodosImport() {
  const [v, s, r] = await Promise.all([
    sb.from('importaciones_ventas').select('periodo').order('periodo'),
    sb.from('importaciones_saldos').select('periodo').order('periodo'),
    sb.from('importaciones_resultado').select('periodo').order('periodo'),
  ]);
  const ordCrono = (a,b) => periodoKey(a).localeCompare(periodoKey(b));
  _impPeriodos.ventas = [...new Set((v.data||[]).map(x=>x.periodo))].sort(ordCrono);
  _impPeriodos.saldos = [...new Set((s.data||[]).map(x=>x.periodo))].sort(ordCrono);
  _impPeriodos.resultado = [...new Set((r.data||[]).map(x=>x.periodo))].sort(ordCrono);
}

// Normaliza cualquier forma de escribir un período a "MM-AAAA". Devuelve null si no se puede interpretar.
// Acepta: "Mayo 2026", "05-2026", "05 2026", "5/2026", "2026-05", "05.2026"
function normalizarPeriodo(txt) {
  if (!txt) return null;
  const t = String(txt).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // saca tildes
  const meses = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  let mm = 0, aaaa = 0, m;
  if ((m = t.match(/^([a-z]+)[\s\-\/]+(\d{4})$/))) {            // "mayo 2026"
    mm = meses[m[1]] || 0; aaaa = parseInt(m[2]);
  } else if ((m = t.match(/^(\d{1,2})[\s\-\/\.]+(\d{4})$/))) {  // "05-2026", "5/2026", "05 2026"
    mm = parseInt(m[1]); aaaa = parseInt(m[2]);
  } else if ((m = t.match(/^(\d{4})[\s\-\/\.]+(\d{1,2})$/))) {  // "2026-05"
    aaaa = parseInt(m[1]); mm = parseInt(m[2]);
  }
  if (mm < 1 || mm > 12 || aaaa < 2020 || aaaa > 2035) return null;
  return String(mm).padStart(2, '0') + '-' + aaaa;
}

// Clave ordenable "AAAA-MM" para cualquier período (MM-AAAA nuevo o "Mayo 2026" legado). Lo no interpretable va al final.
function periodoKey(p) {
  const n = normalizarPeriodo(p);
  if (!n) return '9999-99 ' + String(p);
  return n.slice(3) + '-' + n.slice(0, 2);
}

// Valida que el Excel sea un ranking de VENTAS POR CLIENTE y no otro reporte (ej: ranking de productos).
function validarRankingClientes(rows) {
  const cab = rows.slice(0, 12).map(r => (r || []).join(' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')).join(' | ');
  // Marcadores de ranking de PRODUCTOS (reporte "resultado"): rechazar
  const marcasProducto = ['kilos', 'venta neta', 'costo', 'diferencia', '% margen', 'cantidad'];
  const encontradas = marcasProducto.filter(mk => cab.includes(mk));
  if (encontradas.length >= 2) {
    return { ok: false, motivo: 'El archivo parece un ranking de PRODUCTOS (encabezados: ' + encontradas.join(', ') + '). Elegí el tipo "Resultado / CMG por producto" o cargá el ranking de clientes correcto.' };
  }
  // Marcador esperado del ranking de clientes: "Cpra Total" / "Compra"
  if (!cab.includes('cpra') && !cab.includes('compra')) {
    return { ok: false, motivo: 'No se encontró la columna "Cpra Total" en los encabezados. Verificá que sea el ranking de ventas por cliente del FoxPro.' };
  }
  return { ok: true };
}

async function importarHistorico() {
  const fileEl = document.getElementById('imp-file');
  const tipo = document.getElementById('imp-tipo').value;
  const periodo = document.getElementById('imp-periodo').value.trim();
  const status = document.getElementById('imp-status');

  if (!fileEl.files.length) { alert('Seleccioná un archivo Excel'); return; }
  if (!tipo) { alert('Seleccioná el tipo de archivo'); return; }
  if (!periodo) { alert('Ingresá el período (ej: Mayo 2026 o 05-2026)'); return; }

  // Normalizar SIEMPRE a MM-AAAA: una sola etiqueta posible por mes
  const periodoNorm = normalizarPeriodo(periodo);
  if (!periodoNorm) {
    alert('No pude interpretar el período "' + periodo + '".\nEscribilo como "05-2026" o "Mayo 2026".');
    return;
  }

  // Si el mes ya existe para este tipo, avisar que se va a PISAR (no apilar)
  if ((_impPeriodos[tipo] || []).some(p => normalizarPeriodo(p) === periodoNorm)) {
    if (!confirm('El período ' + periodoNorm + ' ya tiene datos importados de "' + ({ventas:'Ventas por cliente',saldos:'Saldos',resultado:'Resultado/CMG'}[tipo]) + '".\n\nSe van a REEMPLAZAR por los del archivo nuevo. ¿Continuar?')) return;
  }

  const file = fileEl.files[0];
  status.textContent = 'Leyendo archivo...';
  status.style.color = 'var(--txt2)';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      let registros = [];

      if (tipo === 'ventas') {
        // Rechazar archivos que no sean el ranking de ventas por cliente
        const val = validarRankingClientes(rows);
        if (!val.ok) throw new Error(val.motivo);
        // Encabezado filas 1-5, datos desde fila 6 (índice 5)
        // Columnas: Código | Descripción (cliente) | Cpra Total
        for (let i = 5; i < rows.length; i++) {
          const r = rows[i];
          const cod = String(r[0]||'').trim();
          const nombre = String(r[1]||'').trim();
          const monto = parseFloat(String(r[2]||'').replace(',','.')) || 0;
          if (!cod || !nombre || monto <= 0) continue;
          registros.push({ periodo: periodoNorm, codigo_cliente: cod, nombre_cliente: nombre, monto_vendido: monto });
        }
        if (!registros.length) throw new Error('El archivo no tiene filas válidas de clientes (Código | Cliente | Cpra Total desde la fila 6). No se importó nada.');
        // Pisar el mes: borrar la etiqueta normalizada Y cualquier variante vieja del mismo mes
        const variantes = [...new Set([periodoNorm, ...(_impPeriodos.ventas||[]).filter(p => normalizarPeriodo(p) === periodoNorm)])];
        await sb.from('importaciones_ventas').delete().in('periodo', variantes);
        const { error } = await sb.from('importaciones_ventas').insert(registros);
        if (error) throw error;

      } else if (tipo === 'saldos') {
        // Datos desde fila 3 (índice 2)
        // Columnas: Código | Cliente | Dirección | Localidad | Saldo
        for (let i = 2; i < rows.length; i++) {
          const r = rows[i];
          const cod = String(r[0]||'').trim();
          const nombre = String(r[1]||'').trim();
          const direccion = String(r[2]||'').trim();
          const localidad = String(r[3]||'').trim();
          const saldo = parseFloat(String(r[4]||'').replace(',','.')) || 0;
          if (!cod || !nombre) continue;
          registros.push({ periodo: periodoNorm, codigo_cliente: cod, nombre_cliente: nombre, direccion, localidad, saldo });
        }
        if (!registros.length) throw new Error('El archivo no tiene filas válidas de saldos. No se importó nada.');
        const variantesS = [...new Set([periodoNorm, ...(_impPeriodos.saldos||[]).filter(p => normalizarPeriodo(p) === periodoNorm)])];
        await sb.from('importaciones_saldos').delete().in('periodo', variantesS);
        const { error } = await sb.from('importaciones_saldos').insert(registros);
        if (error) throw error;

      } else if (tipo === 'resultado') {
        // Datos desde fila 12 (índice 11)
        // Columnas: Código | Descripción | Cantidad | Kilos | Venta Neta | Costo | Diferencia | % margen
        for (let i = 11; i < rows.length; i++) {
          const r = rows[i];
          const cod = String(r[0]||'').trim();
          const descripcion = String(r[1]||'').trim();
          const cantidad = parseFloat(String(r[2]||'').replace(',','.')) || 0;
          const kilos = parseFloat(String(r[3]||'').replace(',','.')) || 0;
          const venta_neta = parseFloat(String(r[4]||'').replace(',','.')) || 0;
          const costo = parseFloat(String(r[5]||'').replace(',','.')) || 0;
          const diferencia = parseFloat(String(r[6]||'').replace(',','.')) || 0;
          const pct_margen = parseFloat(String(r[7]||'').replace(',','.').replace('%','')) || 0;
          if (!cod || !descripcion || venta_neta <= 0) continue;
          registros.push({ periodo: periodoNorm, codigo_producto: cod, descripcion, cantidad, kilos, venta_neta, costo, diferencia, pct_margen });
        }
        if (!registros.length) throw new Error('El archivo no tiene filas válidas de productos. No se importó nada.');
        const variantesR = [...new Set([periodoNorm, ...(_impPeriodos.resultado||[]).filter(p => normalizarPeriodo(p) === periodoNorm)])];
        await sb.from('importaciones_resultado').delete().in('periodo', variantesR);
        const { error } = await sb.from('importaciones_resultado').insert(registros);
        if (error) throw error;
      }

      // Total importado para contrastar contra el control del FoxPro
      const campoTotal = { ventas: 'monto_vendido', saldos: 'saldo', resultado: 'venta_neta' }[tipo];
      const totalImp = registros.reduce((a, r) => a + (r[campoTotal] || 0), 0);
      status.textContent = `✅ ${registros.length} registros importados para ${periodoNorm} — Total: $${totalImp.toLocaleString('es-AR', {maximumFractionDigits: 0})} (verificá contra el control del FoxPro)`;
      status.style.color = 'var(--P)';
      document.getElementById('imp-file').value = '';

      await cargarPeriodosImport();
      renderSelectoresPeriodo();
      renderSelectorCruzado();
      renderDashboardEvolucion('todo');
      renderImpPreview(tipo, registros.slice(0, 5));

    } catch(err) {
      status.textContent = '❌ Error: ' + (err.message || JSON.stringify(err));
      status.style.color = 'var(--D)';
    }
  };
  reader.readAsBinaryString(file);
}

function renderSelectoresPeriodo() {
  const tipo = document.getElementById('imp-comp-tipo')?.value || 'ventas';
  const periodos = _impPeriodos[tipo] || [];
  const selA = document.getElementById('imp-per-a');
  const selB = document.getElementById('imp-per-b');
  if (!selA || !selB) return;

  const prevA = selA.value, prevB = selB.value;
  const opts = '<option value="">— Seleccionar —</option>' +
    periodos.map(p => `<option value="${p}">${p}</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;

  if (periodos.length >= 2) {
    selA.value = (prevA && periodos.includes(prevA)) ? prevA : periodos[0];
    selB.value = (prevB && periodos.includes(prevB) && prevB !== selA.value) ? prevB : periodos[periodos.length - 1];
  } else if (periodos.length === 1) {
    selA.value = periodos[0];
  }
}

function renderImpPreview(tipo, rows) {
  const el = document.getElementById('imp-preview');
  if (!el || !rows.length) return;
  let headers, cells;
  if (tipo === 'ventas') {
    headers = ['Código', 'Cliente', 'Monto vendido'];
    cells = r => [r.codigo_cliente, r.nombre_cliente, fmt(r.monto_vendido)];
  } else if (tipo === 'saldos') {
    headers = ['Código', 'Cliente', 'Localidad', 'Saldo'];
    cells = r => [r.codigo_cliente, r.nombre_cliente, r.localidad, fmt(r.saldo)];
  } else {
    headers = ['Código', 'Descripción', 'Venta Neta', 'Costo', '% Margen'];
    cells = r => [r.codigo_producto, r.descripcion, fmt(r.venta_neta), fmt(r.costo), _fmtPct(r.pct_margen)];
  }
  el.innerHTML = `<div style="font-size:12px;color:var(--txt2);margin-bottom:6px">Vista previa — primeros ${rows.length} registros</div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${cells(r).map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function _fmtPct(v) {
  if (!v && v !== 0) return '—';
  const n = parseFloat(v);
  return (Math.abs(n) <= 1 ? (n*100).toFixed(1) : n.toFixed(1)) + '%';
}

async function compararPeriodos() {
  const tipo = document.getElementById('imp-comp-tipo').value;
  const perA = document.getElementById('imp-per-a').value;
  const perB = document.getElementById('imp-per-b').value;
  const el = document.getElementById('imp-comp-result');

  if (!perA || !perB) { el.innerHTML = '<div class="empty">Seleccioná dos períodos para comparar</div>'; return; }
  if (perA === perB) { el.innerHTML = '<div class="empty">Los períodos deben ser distintos</div>'; return; }

  el.innerHTML = '<div class="loading">Cargando...</div>';

  const tabla = 'importaciones_' + tipo;
  const [resA, resB] = await Promise.all([
    sb.from(tabla).select('*').eq('periodo', perA),
    sb.from(tabla).select('*').eq('periodo', perB),
  ]);

  const dA = resA.data || [], dB = resB.data || [];

  if (tipo === 'ventas') _impRenderCompVentas(el, dA, perA, dB, perB);
  else if (tipo === 'saldos') _impRenderCompSaldos(el, dA, perA, dB, perB);
  else _impRenderCompResultado(el, dA, perA, dB, perB);
}

function _impRenderCompVentas(el, dA, perA, dB, perB) {
  const mapA = {}, mapB = {};
  dA.forEach(r => mapA[r.codigo_cliente] = r);
  dB.forEach(r => mapB[r.codigo_cliente] = r);
  const claves = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();
  const totalA = dA.reduce((a,r) => a + r.monto_vendido, 0);
  const totalB = dB.reduce((a,r) => a + r.monto_vendido, 0);
  const diff = totalB - totalA;
  const pct = totalA ? (diff/totalA*100) : 0;

  el.innerHTML = `
  <div class="g3" style="margin-bottom:14px">
    <div class="stat"><div class="n">${fmt(totalA)}</div><div class="l">${perA}</div></div>
    <div class="stat"><div class="n">${fmt(totalB)}</div><div class="l">${perB}</div></div>
    <div class="stat"><div class="n" style="color:${diff>=0?'var(--P)':'var(--D)'}">${diff>=0?'+':''}${fmt(diff)}</div><div class="l">${pct>=0?'+':''}${pct.toFixed(1)}% variación</div></div>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Código</th><th>Cliente</th>
      <th style="text-align:right">${perA}</th>
      <th style="text-align:right">${perB}</th>
      <th style="text-align:right">Diferencia</th>
      <th style="text-align:right">%</th>
    </tr></thead>
    <tbody>
    ${claves.map(cod => {
      const a = mapA[cod]?.monto_vendido || 0;
      const b = mapB[cod]?.monto_vendido || 0;
      if (a === 0 && b === 0) return '';
      const d = b - a;
      const p = a ? (d/a*100) : null;
      const nombre = (mapA[cod]||mapB[cod])?.nombre_cliente || '';
      return `<tr style="${d<0?'background:var(--DL)':d>0?'background:var(--PL)':''}">
        <td style="font-size:11px;color:var(--txt2)">${cod}</td>
        <td style="font-weight:500">${nombre}</td>
        <td style="text-align:right">${a?fmt(a):'—'}</td>
        <td style="text-align:right">${b?fmt(b):'—'}</td>
        <td style="text-align:right;font-weight:600;color:${d>=0?'var(--P)':'var(--D)'}">${d>=0?'+':''}${fmt(d)}</td>
        <td style="text-align:right;font-size:11px;color:var(--txt2)">${p!==null?(p>=0?'+':'')+p.toFixed(1)+'%':'nuevo'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>
  <div style="font-size:11px;color:var(--txt2);margin-top:8px">${claves.filter(c=>(mapA[c]?.monto_vendido||0)+(mapB[c]?.monto_vendido||0)>0).length} clientes · Verde = subió · Rojo = bajó</div>`;
  renderImpHistChart(dA, perA, dB, perB);
}

function _impRenderCompSaldos(el, dA, perA, dB, perB) {
  const mapA = {}, mapB = {};
  dA.forEach(r => mapA[r.codigo_cliente] = r);
  dB.forEach(r => mapB[r.codigo_cliente] = r);
  const claves = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();
  const totalA = dA.reduce((a,r) => a + r.saldo, 0);
  const totalB = dB.reduce((a,r) => a + r.saldo, 0);
  const diff = totalB - totalA;

  el.innerHTML = `
  <div class="g3" style="margin-bottom:14px">
    <div class="stat"><div class="n">${fmt(totalA)}</div><div class="l">Deuda total ${perA}</div></div>
    <div class="stat"><div class="n">${fmt(totalB)}</div><div class="l">Deuda total ${perB}</div></div>
    <div class="stat"><div class="n" style="color:${diff<=0?'var(--P)':'var(--D)'}">${diff>=0?'+':''}${fmt(diff)}</div><div class="l">${diff<=0?'Deuda bajó':'Deuda subió'}</div></div>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Código</th><th>Cliente</th><th>Localidad</th>
      <th style="text-align:right">Saldo ${perA}</th>
      <th style="text-align:right">Saldo ${perB}</th>
      <th style="text-align:right">Diferencia</th>
    </tr></thead>
    <tbody>
    ${claves.map(cod => {
      const rA = mapA[cod], rB = mapB[cod];
      const sA = rA?.saldo || 0, sB = rB?.saldo || 0;
      if (sA === 0 && sB === 0) return '';
      const d = sB - sA;
      const nombre = (rA||rB)?.nombre_cliente || '';
      const loc = (rA||rB)?.localidad || '';
      return `<tr style="${d>0?'background:var(--DL)':d<0?'background:var(--PL)':''}">
        <td style="font-size:11px;color:var(--txt2)">${cod}</td>
        <td style="font-weight:500">${nombre}</td>
        <td style="font-size:12px;color:var(--txt2)">${loc}</td>
        <td style="text-align:right">${sA?fmt(sA):'—'}</td>
        <td style="text-align:right">${sB?fmt(sB):'—'}</td>
        <td style="text-align:right;font-weight:600;color:${d<=0?'var(--P)':'var(--D)'}">${d>=0?'+':''}${fmt(d)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>
  <div style="font-size:11px;color:var(--txt2);margin-top:8px">Verde = saldo bajó (cobró) · Rojo = saldo subió</div>`;
}

function _impRenderCompResultado(el, dA, perA, dB, perB) {
  const mapA = {}, mapB = {};
  dA.forEach(r => mapA[r.codigo_producto] = r);
  dB.forEach(r => mapB[r.codigo_producto] = r);
  const claves = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();
  const totalVA = dA.reduce((a,r) => a+r.venta_neta, 0);
  const totalVB = dB.reduce((a,r) => a+r.venta_neta, 0);
  const totalDA = dA.reduce((a,r) => a+r.diferencia, 0);
  const totalDB = dB.reduce((a,r) => a+r.diferencia, 0);
  const diffV = totalVB - totalVA;
  const diffD = totalDB - totalDA;

  el.innerHTML = `
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="n">${fmt(totalVA)}</div><div class="l">Venta neta ${perA}</div></div>
    <div class="stat"><div class="n">${fmt(totalVB)}</div><div class="l">Venta neta ${perB}</div></div>
    <div class="stat"><div class="n" style="color:${diffV>=0?'var(--P)':'var(--D)'}">${diffV>=0?'+':''}${fmt(diffV)}</div><div class="l">Δ Venta</div></div>
    <div class="stat"><div class="n" style="color:${diffD>=0?'var(--P)':'var(--D)'}">${diffD>=0?'+':''}${fmt(diffD)}</div><div class="l">Δ Margen</div></div>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Código</th><th>Descripción</th>
      <th style="text-align:right">Venta ${perA}</th><th style="text-align:right">% Mgn</th>
      <th style="text-align:right">Venta ${perB}</th><th style="text-align:right">% Mgn</th>
      <th style="text-align:right">Δ Venta</th>
    </tr></thead>
    <tbody>
    ${claves.map(cod => {
      const rA = mapA[cod], rB = mapB[cod];
      const vA = rA?.venta_neta||0, vB = rB?.venta_neta||0;
      if (vA===0 && vB===0) return '';
      const dV = vB - vA;
      const desc = (rA||rB)?.descripcion||'';
      return `<tr style="${dV<0?'background:var(--DL)':dV>0?'background:var(--PL)':''}">
        <td style="font-size:11px;color:var(--txt2)">${cod}</td>
        <td style="font-weight:500;font-size:12px">${desc}</td>
        <td style="text-align:right">${vA?fmt(vA):'—'}</td>
        <td style="text-align:right;font-size:11px;color:var(--txt2)">${rA?_fmtPct(rA.pct_margen):'—'}</td>
        <td style="text-align:right">${vB?fmt(vB):'—'}</td>
        <td style="text-align:right;font-size:11px;color:var(--txt2)">${rB?_fmtPct(rB.pct_margen):'—'}</td>
        <td style="text-align:right;font-weight:600;color:${dV>=0?'var(--P)':'var(--D)'}">${dV>=0?'+':''}${fmt(dV)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>
  <div style="font-size:11px;color:var(--txt2);margin-top:8px">Verde = vendió más · Rojo = vendió menos vs ${perA}</div>`;
}

function renderSelectorCruzado() {
  const perVentas = new Set(_impPeriodos.ventas);
  const perSaldos = new Set(_impPeriodos.saldos);
  const ordCrz = (a,b) => periodoKey(a).localeCompare(periodoKey(b));
  const comunes = [...perVentas].filter(p => perSaldos.has(p)).sort(ordCrz);
  const todos = [...new Set([..._impPeriodos.ventas, ..._impPeriodos.saldos])].sort(ordCrz);
  const opciones = comunes.length ? comunes : todos;
  const sel = document.getElementById('imp-cruz-per');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccionar —</option>' +
    opciones.map(p => {
      const aviso = !comunes.includes(p) ? ' ⚠ datos incompletos' : '';
      return `<option value="${p}"${p===prev?' selected':''}>${p}${aviso}</option>`;
    }).join('');
}

async function verVistaCruzada() {
  const periodo = document.getElementById('imp-cruz-per').value;
  const orden = document.getElementById('imp-cruz-orden').value;
  const el = document.getElementById('imp-cruz-result');
  if (!periodo) { el.innerHTML = '<div class="empty">Seleccioná un período</div>'; return; }

  el.innerHTML = '<div class="loading">Cargando...</div>';

  const [resV, resS] = await Promise.all([
    sb.from('importaciones_ventas').select('*').eq('periodo', periodo),
    sb.from('importaciones_saldos').select('*').eq('periodo', periodo),
  ]);

  const dataV = resV.data || [], dataS = resS.data || [];
  if (!dataV.length && !dataS.length) {
    el.innerHTML = '<div class="empty">No hay datos de ventas ni saldos para este período</div>';
    return;
  }

  // Normalizar nombre para join (puede que códigos difieran entre archivos)
  const normKey = n => (n||'').trim().toUpperCase().replace(/\s+/g,' ');

  // Agregar por nombre_cliente (más robusto que código que puede diferir)
  const mapV = {}, mapS = {};
  dataV.forEach(r => {
    const key = normKey(r.nombre_cliente) || r.codigo_cliente;
    if (!mapV[key]) mapV[key] = { nombre: r.nombre_cliente||'', cod: r.codigo_cliente||'', vendido: 0 };
    mapV[key].vendido += (r.monto_vendido || 0);
  });
  dataS.forEach(r => {
    const key = normKey(r.nombre_cliente) || r.codigo_cliente;
    if (!mapS[key]) mapS[key] = { nombre: r.nombre_cliente||'', cod: r.codigo_cliente||'', saldo: 0 };
    mapS[key].saldo += (r.saldo || 0);
  });

  const claves = [...new Set([...Object.keys(mapV), ...Object.keys(mapS)])];
  let filas = claves.map(key => {
    const v = mapV[key], s = mapS[key];
    const nombre = (v||s)?.nombre || key;
    const cod = (v||s)?.cod || '';
    const vendido = v?.vendido || 0;
    const saldo = s?.saldo || 0;
    const rot = vendido > 0 ? (saldo / vendido * 100) : (saldo > 0 ? 9999 : 0);
    return { cod, nombre, vendido, saldo, rot };
  });

  if (orden === 'saldo') filas.sort((a,b) => b.saldo - a.saldo);
  else if (orden === 'rot') filas.sort((a,b) => b.rot - a.rot);
  else filas.sort((a,b) => b.vendido - a.vendido);

  const totalVendido = filas.reduce((a,r) => a + r.vendido, 0);
  const totalSaldo = filas.reduce((a,r) => a + r.saldo, 0);
  const rotGlobal = totalVendido > 0 ? (totalSaldo / totalVendido * 100) : 0;
  const conRiesgo = filas.filter(r => r.rot > 70).length;

  el.innerHTML = `
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="n">${fmt(totalVendido)}</div><div class="l">Total vendido</div></div>
    <div class="stat"><div class="n" style="color:var(--D)">${fmt(totalSaldo)}</div><div class="l">Saldo total adeudado</div></div>
    <div class="stat"><div class="n" style="color:${rotGlobal<30?'var(--P)':rotGlobal<70?'var(--W)':'var(--D)'}">${rotGlobal.toFixed(1)}%</div><div class="l">Rotación global</div></div>
    <div class="stat"><div class="n" style="color:${conRiesgo?'var(--D)':'var(--P)'}">${conRiesgo}</div><div class="l">Clientes en riesgo (&gt;70%)</div></div>
  </div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th>Código</th><th>Cliente</th>
      <th style="text-align:right">Vendido</th>
      <th style="text-align:right">Saldo</th>
      <th style="text-align:right">Rotación</th>
      <th>Estado</th>
    </tr></thead>
    <tbody>
    ${filas.map(r => {
      const rotStr = r.rot >= 9999 ? '∞' : r.rot.toFixed(1) + '%';
      const color = r.rot === 0 ? 'var(--P)' : r.rot < 30 ? 'var(--P)' : r.rot < 70 ? 'var(--W)' : 'var(--D)';
      const badge = r.rot === 0
        ? '<span class="b bP">Sin deuda</span>'
        : r.rot < 30 ? '<span class="b bP">OK</span>'
        : r.rot < 70 ? '<span class="b bW">Atención</span>'
        : '<span class="b bD">Riesgo</span>';
      const rowBg = r.rot >= 9999 || r.rot > 70 ? 'background:var(--DL)' : r.rot === 0 ? 'background:var(--PL)' : '';
      return `<tr style="${rowBg}">
        <td style="font-size:11px;color:var(--txt2)">${r.cod}</td>
        <td style="font-weight:500">${r.nombre}</td>
        <td style="text-align:right">${r.vendido ? fmt(r.vendido) : '—'}</td>
        <td style="text-align:right;font-weight:${r.saldo?'600':'400'};color:${r.saldo?'var(--D)':'var(--txt2)'}">${r.saldo ? fmt(r.saldo) : '—'}</td>
        <td style="text-align:right;font-weight:600;color:${color}">${rotStr}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>
  <div style="font-size:11px;color:var(--txt2);margin-top:8px">
    Rotación = saldo ÷ vendido × 100 &nbsp;·&nbsp;
    <span style="color:var(--P)">Verde &lt;30%</span> &nbsp;·&nbsp;
    <span style="color:var(--W)">Amarillo 30–70%</span> &nbsp;·&nbsp;
    <span style="color:var(--D)">Rojo &gt;70% o sin ventas registradas</span>
  </div>`;
}

// ─── FIN TESORERÍA ──────────────────────────────────────────

// ─── GRÁFICOS DASHBOARD ─────────────────────────────────────
const _dashCharts = {};

function renderDashCharts() {
  if (typeof Chart === 'undefined') return;
  const COLORS = ['#1a7a52','#1a5fa8','#c47a00','#c0392b','#8e44ad','#16a085','#e67e22','#2980b9'];

  // Ventas últimos 6 meses
  const meses = [];
  const hoy = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    meses.push({ key, label: d.toLocaleDateString('es-AR',{month:'short',year:'2-digit'}), total: 0 });
  }
  (_remitos||[]).forEach(r => {
    const key = (r.fecha||'').substring(0, 7);
    const m = meses.find(x => x.key === key);
    if (m) m.total += (r.total || 0);
  });
  const ctxV = document.getElementById('dash-chart-ventas');
  if (ctxV) {
    _dashCharts.ventas?.destroy();
    _dashCharts.ventas = new Chart(ctxV, {
      type: 'line',
      data: {
        labels: meses.map(m => m.label),
        datasets: [{ label: 'Ventas', data: meses.map(m => m.total),
          borderColor: '#1a7a52', backgroundColor: 'rgba(26,122,82,.1)',
          tension: .3, fill: true, pointRadius: 4, pointBackgroundColor: '#1a7a52' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => '$' + Math.round(v/1000) + 'k' } } }
      }
    });
  }

  // Participación por zona
  const zonas = {};
  (_remitos||[]).forEach(r => {
    const cli = (_clientes||[]).find(c => c.id === r.cliente_id);
    const z = cli?.zona || 'Sin zona';
    zonas[z] = (zonas[z] || 0) + (r.total || 0);
  });
  const zonKeys = Object.keys(zonas).sort((a,b) => zonas[b]-zonas[a]).slice(0,8);
  const zonLabels = zonKeys.map(z => z === 'Sin zona' ? z : nombreZona(z));
  const ctxZ = document.getElementById('dash-chart-zonas');
  if (ctxZ) {
    _dashCharts.zonas?.destroy();
    _dashCharts.zonas = new Chart(ctxZ, {
      type: 'doughnut',
      data: {
        labels: zonLabels,
        datasets: [{ data: zonKeys.map(z => zonas[z]),
          backgroundColor: COLORS.slice(0, zonLabels.length), borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } }
      }
    });
  }
}

// ─── GRÁFICOS INFORMES ──────────────────────────────────────
const _infCharts = {};

function renderInfVentasChart(data) {
  if (typeof Chart === 'undefined' || !data?.length) return;
  const clientes = {};
  data.forEach(r => { clientes[r.cliente] = (clientes[r.cliente]||0) + (r.total||0); });
  const top10 = Object.entries(clientes).sort((a,b) => b[1]-a[1]).slice(0,10);
  const wrap = document.getElementById('inf-chart-ventas-wrap');
  if (wrap) wrap.style.display = 'block';
  const ctx = document.getElementById('inf-chart-ventas-cli');
  if (!ctx) return;
  _infCharts.ventas?.destroy();
  _infCharts.ventas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(([n]) => n.length > 22 ? n.substring(0,22)+'…' : n),
      datasets: [{ label: 'Venta', data: top10.map(([,v]) => v),
        backgroundColor: 'rgba(26,122,82,.75)', borderColor: '#1a7a52', borderWidth: 1 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => '$' + Math.round(v/1000) + 'k' } } }
    }
  });
}

function renderCMGChart(arr, totalCMG) {
  if (typeof Chart === 'undefined' || !arr?.length) return;
  const COLORS = ['#1a7a52','#1a5fa8','#c47a00','#c0392b','#8e44ad','#16a085','#e67e22','#2980b9','#27ae60','#f39c12'];
  const top10 = arr.filter(x => x.cmg > 0).slice(0, 10);
  if (!top10.length) return;
  const wrap = document.getElementById('cmgp-chart-wrap');
  if (wrap) wrap.style.display = 'block';
  const ctx = document.getElementById('cmgp-chart');
  if (!ctx) return;
  _infCharts.cmgp?.destroy();
  _infCharts.cmgp = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top10.map(x => x.nom.length > 25 ? x.nom.substring(0,25)+'…' : x.nom),
      datasets: [{ data: top10.map(x => Math.round(x.cmg)),
        backgroundColor: COLORS.slice(0, top10.length), borderWidth: 1 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.raw)} (${totalCMG>0?(c.raw/totalCMG*100).toFixed(1):'—'}%)` } }
      }
    }
  });
}

function renderImpHistChart(dA, perA, dB, perB) {
  if (typeof Chart === 'undefined') return;
  const mapA = {}, mapB = {};
  dA.forEach(r => { mapA[r.codigo_cliente] = r.monto_vendido; });
  dB.forEach(r => { mapB[r.codigo_cliente] = r.monto_vendido; });
  const allCodes = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];
  const top10 = allCodes.sort((a,b) => ((mapA[b]||0)+(mapB[b]||0))-((mapA[a]||0)+(mapB[a]||0))).slice(0,10);
  const labels = top10.map(c => {
    const r = dA.find(x=>x.codigo_cliente===c) || dB.find(x=>x.codigo_cliente===c);
    const nom = (r?.nombre_cliente||c);
    return nom.length > 22 ? nom.substring(0,22)+'…' : nom;
  });
  const wrap = document.getElementById('imp-chart-wrap');
  if (wrap) wrap.style.display = 'block';
  const ctx = document.getElementById('imp-chart-comparacion');
  if (!ctx) return;
  _infCharts.hist?.destroy();
  _infCharts.hist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: perA, data: top10.map(c => mapA[c]||0),
          backgroundColor: 'rgba(26,122,82,.7)', borderColor: '#1a7a52', borderWidth: 1 },
        { label: perB, data: top10.map(c => mapB[c]||0),
          backgroundColor: 'rgba(26,95,168,.7)', borderColor: '#1a5fa8', borderWidth: 1 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { ticks: { callback: v => '$' + Math.round(v/1000) + 'k' } } }
    }
  });
}

// ─── DASHBOARD EVOLUCIÓN HISTÓRICA ───────────────────────────
let _dashEvolChart = null;

async function renderDashboardEvolucion(filtro){
  filtro = filtro || 'todo';
  // Highlight active button
  ['2025','2026','6m','todo'].forEach(k=>{
    const b=document.getElementById('dashbtn-'+k);
    if(b){b.style.background=k===filtro?'var(--P)':'';b.style.color=k===filtro?'#fff':'';}
  });
  const tabla=document.getElementById('dash-evol-tabla');
  const wrap=document.getElementById('dash-evol-chart-wrap');
  if(tabla)tabla.innerHTML='<div class="loading">Cargando...</div>';

  // Fetch all periods data
  const [resV,resS,resR]=await Promise.all([
    sb.from('importaciones_ventas').select('periodo,monto_vendido'),
    sb.from('importaciones_saldos').select('periodo,saldo'),
    sb.from('importaciones_resultado').select('periodo,venta_neta,diferencia'),
  ]);

  // Aggregate by period
  const agg={};
  const ensure=p=>{if(!agg[p])agg[p]={periodo:p,ventas:0,saldos:0,cmg:0,venta_neta:0};};
  (resV.data||[]).forEach(r=>{ensure(r.periodo);agg[r.periodo].ventas+=(r.monto_vendido||0);});
  (resS.data||[]).forEach(r=>{ensure(r.periodo);agg[r.periodo].saldos+=(r.saldo||0);});
  (resR.data||[]).forEach(r=>{ensure(r.periodo);agg[r.periodo].venta_neta+=(r.venta_neta||0);agg[r.periodo].cmg+=(r.diferencia||0);});

  // Orden cronológico real: soporta "05-2026", "Mayo 2026" y cualquier variante que entienda normalizarPeriodo
  let periodos=Object.values(agg).sort((a,b)=>periodoKey(a.periodo).localeCompare(periodoKey(b.periodo)));

  // Apply filter
  if(filtro==='2025')periodos=periodos.filter(p=>p.periodo.includes('2025'));
  else if(filtro==='2026')periodos=periodos.filter(p=>p.periodo.includes('2026'));
  else if(filtro==='6m')periodos=periodos.slice(-6);

  if(!periodos.length){
    if(tabla)tabla.innerHTML='<div class="empty">Sin datos para el filtro seleccionado. Importá períodos primero.</div>';
    if(wrap)wrap.style.display='none';
    return;
  }

  // Chart
  if(wrap)wrap.style.display='block';
  if(typeof Chart!=='undefined'){
    if(_dashEvolChart){_dashEvolChart.destroy();_dashEvolChart=null;}
    const ctx=document.getElementById('dash-evol-chart')?.getContext('2d');
    if(ctx){
      const sets=[];
      const hasVentas=periodos.some(p=>p.ventas>0);
      const hasSaldos=periodos.some(p=>p.saldos>0);
      const hasCMG=periodos.some(p=>p.cmg>0);
      if(hasVentas)sets.push({label:'Ventas',data:periodos.map(p=>Math.round(p.ventas)),borderColor:'#1a7a52',backgroundColor:'rgba(26,122,82,0.1)',tension:0.3,fill:false,pointRadius:4});
      if(hasSaldos)sets.push({label:'Saldos adeudados',data:periodos.map(p=>Math.round(p.saldos)),borderColor:'#c0392b',backgroundColor:'rgba(192,57,43,0.08)',tension:0.3,fill:false,pointRadius:4});
      if(hasCMG)sets.push({label:'CMG (resultado)',data:periodos.map(p=>Math.round(p.cmg)),borderColor:'#1a5fa8',backgroundColor:'rgba(26,95,168,0.08)',tension:0.3,fill:false,pointRadius:4});
      _dashEvolChart=new Chart(ctx,{type:'line',data:{labels:periodos.map(p=>p.periodo),datasets:sets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{y:{ticks:{callback:v=>v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v}}}}});
    }
  }

  // Tabla resumen
  const totalV=periodos.reduce((a,p)=>a+p.ventas,0);
  const totalS=periodos.reduce((a,p)=>a+p.saldos,0);
  const totalC=periodos.reduce((a,p)=>a+p.cmg,0);
  if(tabla){
    tabla.innerHTML=`
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Período</th><th style="text-align:right">Ventas</th><th style="text-align:right">Saldos</th><th style="text-align:right">CMG</th><th style="text-align:right">% CMG</th></tr></thead>
      <tbody>
      ${periodos.map((p,i)=>{
        const pctCmg=p.ventas>0?(p.cmg/p.ventas*100):0;
        const prev=periodos[i-1];
        const delta=prev&&prev.ventas>0?Math.round((p.ventas-prev.ventas)/prev.ventas*100):null;
        return `<tr>
          <td style="font-weight:600">${p.periodo}</td>
          <td style="text-align:right">${p.ventas?fmt(p.ventas):'—'} ${delta!==null?`<span style="font-size:10px;color:${delta>=0?'var(--P)':'var(--D)'}">${delta>0?'+':''}${delta}%</span>`:''}</td>
          <td style="text-align:right;color:${p.saldos>0?'var(--D)':'var(--txt2)'}">${p.saldos?fmt(p.saldos):'—'}</td>
          <td style="text-align:right;color:var(--P)">${p.cmg?fmt(p.cmg):'—'}</td>
          <td style="text-align:right;font-weight:600;color:${pctCmg>=20?'var(--P)':pctCmg>0?'var(--W)':'var(--txt2)'}">${pctCmg>0?pctCmg.toFixed(1)+'%':'—'}</td>
        </tr>`;
      }).join('')}
      </tbody>
      <tfoot><tr style="background:var(--PL);font-weight:700">
        <td>TOTAL</td>
        <td style="text-align:right">${fmt(totalV)}</td>
        <td style="text-align:right;color:var(--D)">${fmt(totalS)}</td>
        <td style="text-align:right;color:var(--P)">${fmt(totalC)}</td>
        <td style="text-align:right;color:var(--P)">${totalV>0?(totalC/totalV*100).toFixed(1)+'%':'—'}</td>
      </tr></tfoot>
    </table></div>`;
  }
}

// ─── GRÁFICO HISTÓRICO FOXPRO ────────────────────────────────
let _histData = null;
let _histGastos = null;

async function informeHistoricoChart(anioFiltro) {
  if (typeof Chart === 'undefined') return;
  const statusEl = document.getElementById('inf-hist-status');
  const set = t => { if (statusEl) statusEl.textContent = t; };

  set('Cargando datos...');

  // Cargar ambas fuentes en paralelo (solo la primera vez)
  if (!_histData || !_histGastos) {
    const [resImp, resGas] = await Promise.all([
      sb.from('importaciones_resultado').select('periodo, venta_neta, costo, diferencia'),
      sb.from('gastos').select('fecha, importe')
    ]);
    if (resImp.error && resImp.error.code === '42P01') {
      set('Tabla importaciones_resultado no existe. Importá datos primero.'); return;
    }
    if (!resImp.data?.length) {
      set('Sin datos importados. Importá archivos FoxPro desde Importar Histórico.'); return;
    }
    _histData   = resImp.data;
    _histGastos = resGas.data || [];
  }

  // Gastos agrupados por mes (YYYY-MM)
  const gastosPorMes = {};
  _histGastos.forEach(g => {
    const mes = (g.fecha || '').substring(0, 7);
    if (mes) gastosPorMes[mes] = (gastosPorMes[mes] || 0) + (g.importe || 0);
  });

  // Botones de filtro de año
  const años = [...new Set(_histData.map(r => (r.periodo||'').substring(0,4)).filter(Boolean))].sort();
  const añosEl = document.getElementById('inf-hist-años');
  if (añosEl) {
    añosEl.innerHTML = años.map(a =>
      `<button class="btn sm${anioFiltro===a?' P':''}" onclick="informeHistoricoChart('${a}')" style="font-size:11px">${a}</button>`
    ).join('');
  }
  const allBtn = document.getElementById('inf-hist-all');
  if (allBtn) { allBtn.style.background = anioFiltro ? '' : 'var(--P)'; allBtn.style.color = anioFiltro ? '' : '#fff'; }

  // Filtrar por año si aplica
  const datos = anioFiltro ? _histData.filter(r => (r.periodo||'').startsWith(anioFiltro)) : _histData;

  // Agrupar importaciones por período
  const byPer = {};
  datos.forEach(r => {
    const p = r.periodo;
    if (!p) return;
    if (!byPer[p]) byPer[p] = { venta: 0, costo: 0, cmg: 0 };
    byPer[p].venta += (r.venta_neta  || 0);
    byPer[p].costo += (r.costo       || 0);
    byPer[p].cmg   += (r.diferencia  || 0);
  });

  const periodos = Object.keys(byPer).sort();
  if (!periodos.length) { set('Sin datos para el período seleccionado.'); return; }

  const ventas   = periodos.map(p => byPer[p].venta);
  const costos   = periodos.map(p => byPer[p].costo);
  const cmgs     = periodos.map(p => byPer[p].cmg);
  const gastos   = periodos.map(p => gastosPorMes[p] || 0);
  const netos    = periodos.map((p, i) => cmgs[i] - gastos[i]);
  const pctNeto  = periodos.map((p, i) => ventas[i] > 0 ? netos[i] / ventas[i] * 100 : 0);

  const hayGastos = gastos.some(g => g > 0);

  const labels = periodos.map(p => {
    const [y, m] = p.split('-');
    if (!y || !m) return p;
    return new Date(+y, +m-1, 1).toLocaleDateString('es-AR', { month:'short', year:'2-digit' });
  });

  const periMin = periodos[0], periMax = periodos[periodos.length-1];
  set(`${periodos.length} período${periodos.length!==1?'s':''} · ${periMin} → ${periMax}${!hayGastos?' · (sin gastos registrados en Contabilidad para este rango)':''}`);

  // Renderizar gráfico
  const ctx = document.getElementById('inf-hist-chart');
  if (!ctx) return;
  _infCharts.historico?.destroy();

  const pctLabel = hayGastos ? 'Resultado % (s/venta)' : 'CMG % (s/venta)';
  const pctData  = hayGastos ? pctNeto : periodos.map((p,i) => ventas[i]>0 ? cmgs[i]/ventas[i]*100 : 0);

  _infCharts.historico = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Venta neta',
          data: ventas,
          borderColor: '#1a5fa8', tension: .3, pointRadius: 4,
          fill: false, yAxisID: 'y', borderWidth: 2
        },
        {
          label: 'Costo mercadería',
          data: costos,
          borderColor: '#c0392b', tension: .3, pointRadius: 4,
          fill: false, yAxisID: 'y', borderWidth: 2
        },
        {
          label: 'CMG ($)',
          data: cmgs,
          borderColor: '#1a7a52', tension: .3, pointRadius: 4,
          fill: false, yAxisID: 'y', borderWidth: 2
        },
        ...(hayGastos ? [{
          label: 'Gastos (Contabilidad)',
          data: gastos,
          borderColor: '#8e44ad', tension: .3, pointRadius: 4,
          fill: false, yAxisID: 'y', borderWidth: 2, borderDash: [5, 3]
        },
        {
          label: 'Resultado neto',
          data: netos,
          borderColor: '#c47a00', backgroundColor: 'rgba(196,122,0,.08)',
          tension: .3, pointRadius: 5, fill: true, yAxisID: 'y', borderWidth: 3
        }] : []),
        {
          label: pctLabel,
          data: pctData,
          borderColor: hayGastos ? '#c47a00' : '#888',
          tension: .3, pointRadius: 3, fill: false,
          yAxisID: 'y2', borderWidth: 1.5, borderDash: [6, 4]
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: c => c.dataset.yAxisID === 'y2'
              ? `  ${c.dataset.label}: ${c.raw.toFixed(1)}%`
              : `  ${c.dataset.label}: ${fmt(c.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,.04)' } },
        y: {
          type: 'linear', position: 'left',
          ticks: { callback: v => '$' + (Math.abs(v)>=1e6 ? (v/1e6).toFixed(1)+'M' : Math.round(v/1000)+'k') },
          grid: { color: 'rgba(0,0,0,.06)' }
        },
        y2: {
          type: 'linear', position: 'right',
          ticks: { callback: v => v.toFixed(0)+'%' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  // KPIs resumen
  const totVenta  = ventas.reduce((a,v)=>a+v,0);
  const totCosto  = costos.reduce((a,v)=>a+v,0);
  const totCMG    = cmgs.reduce((a,v)=>a+v,0);
  const totGastos = gastos.reduce((a,v)=>a+v,0);
  const totNeto   = totCMG - totGastos;
  const pctNetoTot = totVenta > 0 ? totNeto/totVenta*100 : 0;
  const kpisEl = document.getElementById('inf-hist-kpis');
  if (kpisEl) kpisEl.innerHTML = `
    <div class="stat"><div class="n" style="font-size:15px">${fmt(totVenta)}</div><div class="l">Venta total</div></div>
    <div class="stat"><div class="n" style="font-size:15px;color:var(--D)">${fmt(totCosto)}</div><div class="l">Costo mercadería</div></div>
    <div class="stat"><div class="n" style="font-size:15px;color:var(--P)">${fmt(totCMG)}</div><div class="l">CMG total</div></div>
    ${hayGastos ? `
    <div class="stat"><div class="n" style="font-size:15px;color:#8e44ad">${fmt(totGastos)}</div><div class="l">Gastos período</div></div>
    <div class="stat"><div class="n" style="font-size:15px;font-weight:800;color:${totNeto>=0?'var(--P)':'var(--D)'}">${fmt(totNeto)}</div><div class="l">Resultado neto</div></div>
    <div class="stat"><div class="n" style="font-size:15px;color:${pctNetoTot>=10?'var(--P)':pctNetoTot>=0?'var(--W)':'var(--D)'}">${pctNetoTot.toFixed(1)}%</div><div class="l">Margen neto</div></div>
    ` : `
    <div class="stat"><div class="n" style="font-size:15px;color:var(--W)">—</div><div class="l" style="color:var(--W)">Sin gastos en Contabilidad</div></div>
    `}`;

  // Tabla detalle por período (CON SCROLL)
  const tablaEl = document.getElementById('inf-hist-tabla');
  if (tablaEl) {
    tablaEl.innerHTML = `
      <details>
        <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--txt2);padding:6px 0">📋 Ver tabla por período</summary>
        <div style="max-height:400px; overflow-y:auto; overflow-x:auto; border:1px solid var(--brd); border-radius:8px; margin-top:8px; padding:4px;">
          <table class="tbl" style="min-width:600px;">
            <thead>
              <tr>
                <th>Período</th>
                <th style="text-align:right">Venta neta</th>
                <th style="text-align:right">Costo merc.</th>
                <th style="text-align:right">CMG $</th>
                ${hayGastos ? '<th style="text-align:right">Gastos</th><th style="text-align:right">Resultado neto</th><th style="text-align:right">Margen neto %</th>' : '<th style="text-align:right">CMG %</th>'}
              </tr>
            </thead>
            <tbody>
              ${periodos.map((p,i)=>{
                const pn = hayGastos ? pctNeto[i] : (ventas[i]>0?cmgs[i]/ventas[i]*100:0);
                const color = pn>=10?'var(--P)':pn>=0?'var(--W)':'var(--D)';
                return `<tr>
                  <td style="font-weight:600">${p}</td>
                  <td style="text-align:right">${fmt(ventas[i])}</td>
                  <td style="text-align:right;color:var(--txt2)">${fmt(costos[i])}</td>
                  <td style="text-align:right;color:var(--P)">${fmt(cmgs[i])}</td>
                  ${hayGastos
                    ? `<td style="text-align:right;color:#8e44ad">${gastos[i]?fmt(gastos[i]):'—'}</td>
                       <td style="text-align:right;font-weight:700;color:${color}">${fmt(netos[i])}</td>
                       <td style="text-align:right;font-weight:700;color:${color}">${pn.toFixed(1)}%</td>`
                    : `<td style="text-align:right;font-weight:700;color:${color}">${pn.toFixed(1)}%</td>`}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }
}
