// =====================================================================
// INFORMES → 💵 FONDOS — evolución de Caja / Banco mes a mes
// Distribuidora Lila
// =====================================================================
// Lee lo que ya quedó guardado en `movimientos_mayores` cada vez que se
// procesan los Excel de Mayores (Informes → Mayores → Procesar). No hay
// que volver a subir nada: el informe se arma con todos los meses que
// estén en la base.
//
// Cruce entre cuentas (por número de asiento, dentro del mismo mes):
//   · Ingreso a Caja/Banco cuyo asiento también está en el HABER de
//     11201 Deudores por Ventas  → "Cobranza de clientes".
//   · Egreso de Caja/Banco cuyo asiento también está en el DEBE de
//     21101 Proveedores           → "Pago a proveedores".
//   · Asiento que está en Caja Y en Banco → transferencia entre ellas
//     (depósito / extracción). Si se mira "Caja + Banco" se descuenta,
//     porque no es plata que entra ni sale de la empresa.
//   · Todo lo demás → "Otros ingresos" / "Otros egresos".
//
// OJO saldo: el mayor de FoxPro de cada mes viene con "Saldo Apertura
// 0,00", así que acá NO hay saldo real de caja: se muestra el neto de
// cada mes (entró − salió) y el acumulado dentro del rango elegido.
// =====================================================================

const _FON_CAJA  = '11101 Caja';
const _FON_BANCO = '11102 Banco Macro Cta. Cte.';
const _FON_DEU   = '11201 Deudores por Ventas';
const _FON_PROV  = '21101 Proveedores';
const _FON_MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

let _fonCache = null;   // { periodos:[...], filas:[...] }
let _fonChart = null;

// "MM-AAAA" → número ordenable AAAAMM
function _fonKey(p){ const [m,a] = String(p).split('-'); return (+a)*100 + (+m); }
function _fonLabel(p){ const [m,a] = String(p).split('-'); return _FON_MESES[(+m)-1] + ' ' + String(a).slice(2); }

// Supabase devuelve como máximo 1000 filas por consulta: paginar.
// Se ordena por id para que la paginación no saltee ni repita filas; si
// la tabla no tuviera columna id, se ordena por varias columnas.
async function _fonTraer(cuentas){
  const PAG = 1000;
  const consulta = (desde, porId) => {
    let q = sb.from('movimientos_mayores')
      .select('periodo,cuenta,asiento,concepto,debe,haber')
      ;
    if (cuentas) q = q.in('cuenta', cuentas);
    q = porId ? q.order('id', { ascending: true })
              : q.order('periodo').order('cuenta').order('fecha').order('asiento').order('debe').order('haber').order('concepto');
    return q.range(desde, desde + PAG - 1);
  };
  for (const porId of [true, false]) {
    const out = [];
    let fallo = null;
    for (let desde = 0; ; desde += PAG) {
      const { data, error } = await consulta(desde, porId);
      if (error) { fallo = error; break; }
      out.push(...(data || []));
      if (!data || data.length < PAG) break;
    }
    if (!fallo) return out;
    if (!porId) throw fallo;          // ya probamos las dos formas
    console.warn('movimientos_mayores sin id, ordenando por columnas:', fallo.message);
  }
}

async function fonInit(forzar){
  const st = document.getElementById('fon-status');
  try {
    if (!_fonCache || forzar) {
      if (st) st.textContent = '⏳ Cargando movimientos guardados…';
      const filas = await _fonTraer(null); // todas las cuentas: sirven para clasificar los "otros"
      const periodos = [...new Set(filas.map(f => f.periodo))].sort((a,b) => _fonKey(a) - _fonKey(b));
      _fonCache = { periodos, filas };
    }
    const { periodos } = _fonCache;
    const selD = document.getElementById('fon-desde');
    const selH = document.getElementById('fon-hasta');
    const prevD = selD.value, prevH = selH.value;
    const opts = periodos.map(p => `<option value="${p}">${_fonLabel(p)}</option>`).join('');
    selD.innerHTML = opts; selH.innerHTML = opts;
    if (!periodos.length) {
      if (st) st.textContent = '';
      document.getElementById('fon-res').innerHTML =
        '<div class="empty">Todavía no hay meses guardados. Subilos en Informes → 📊 Mayores → Procesar.</div>';
      return;
    }
    // Por defecto: desde Julio 2026 (o el primero que haya) hasta el último.
    const def = periodos.find(p => _fonKey(p) >= 202607) || periodos[0];
    selD.value = periodos.includes(prevD) ? prevD : def;
    selH.value = periodos.includes(prevH) ? prevH : periodos[periodos.length - 1];
    if (st) st.textContent = `${periodos.length} mes(es) en la base: ${periodos.map(_fonLabel).join(', ')}`;
    fonRender();
  } catch (e) {
    console.error(e);
    if (st) st.textContent = '❌ Error al cargar: ' + (e.message || e);
  }
}

function _fonCalcular(periodo, filasMes, vista){
  const asientosCobranza = new Set(filasMes.filter(f => f.cuenta === _FON_DEU  && f.haber > 0).map(f => f.asiento));
  const asientosPagoProv = new Set(filasMes.filter(f => f.cuenta === _FON_PROV && f.debe  > 0).map(f => f.asiento));
  const asCaja  = new Set(filasMes.filter(f => f.cuenta === _FON_CAJA ).map(f => f.asiento));
  const asBanco = new Set(filasMes.filter(f => f.cuenta === _FON_BANCO).map(f => f.asiento));
  const esTransf = a => asCaja.has(a) && asBanco.has(a);
  // Para los "otros": ¿con qué otra cuenta se cruza el asiento? (ej. 50203
  // Combustible, 50305 Descuentos). Si hay, se agrupa por esa cuenta; si no,
  // por el concepto del movimiento.
  const principales = new Set([_FON_CAJA, _FON_BANCO, _FON_DEU, _FON_PROV]);
  const contraCuenta = {};
  for (const f of filasMes) {
    if (principales.has(f.cuenta)) continue;
    if (!contraCuenta[f.asiento]) contraCuenta[f.asiento] = f.cuenta;
  }
  const claveOtro = f => contraCuenta[f.asiento]
    ? '📒 ' + contraCuenta[f.asiento].replace(/^[\d-]+\s*/, '')
    : (f.concepto || '(sin concepto)');

  const cuentas = vista === 'caja' ? [_FON_CAJA] : vista === 'banco' ? [_FON_BANCO] : [_FON_CAJA, _FON_BANCO];
  const r = { periodo, cobranzas:0, otrosIng:0, pagosProv:0, otrosEgr:0, transfIn:0, transfOut:0, n:0, otrosEgrDet:{}, otrosIngDet:{} };

  for (const f of filasMes) {
    if (!cuentas.includes(f.cuenta)) continue;
    r.n++;
    const d = +f.debe || 0, h = +f.haber || 0;
    const transf = esTransf(f.asiento);
    if (d > 0) {
      if (transf) r.transfIn += d;
      else if (asientosCobranza.has(f.asiento)) r.cobranzas += d;
      else { r.otrosIng += d; const k = claveOtro(f); r.otrosIngDet[k] = (r.otrosIngDet[k]||0) + d; }
    }
    if (h > 0) {
      if (transf) r.transfOut += h;
      else if (asientosPagoProv.has(f.asiento)) r.pagosProv += h;
      else { r.otrosEgr += h; const k = claveOtro(f); r.otrosEgrDet[k] = (r.otrosEgrDet[k]||0) + h; }
    }
  }
  // Caja + Banco: las transferencias entre ellas se anulan (no cuentan).
  const contarTransf = vista !== 'ambas';
  r.ingresos = r.cobranzas + r.otrosIng + (contarTransf ? r.transfIn  : 0);
  r.egresos  = r.pagosProv + r.otrosEgr + (contarTransf ? r.transfOut : 0);
  r.neto = r.ingresos - r.egresos;
  return r;
}

function fonRender(){
  if (!_fonCache) return;
  const vista = document.getElementById('fon-cuenta').value;
  const d = _fonKey(document.getElementById('fon-desde').value);
  const h = _fonKey(document.getElementById('fon-hasta').value);
  const periodos = _fonCache.periodos.filter(p => _fonKey(p) >= Math.min(d,h) && _fonKey(p) <= Math.max(d,h));
  const porMes = {};
  for (const f of _fonCache.filas) (porMes[f.periodo] ||= []).push(f);

  const meses = periodos.map(p => _fonCalcular(p, porMes[p] || [], vista));
  let acum = 0; meses.forEach(m => { acum += m.neto; m.acum = acum; });

  const tot = meses.reduce((a,m) => {
    ['cobranzas','otrosIng','pagosProv','otrosEgr','transfIn','transfOut','ingresos','egresos','neto'].forEach(k => a[k] = (a[k]||0) + m[k]);
    return a;
  }, {});
  const nombreVista = { caja:'Caja', banco:'Banco Macro', ambas:'Caja + Banco Macro' }[vista];
  const conTransf = vista !== 'ambas';
  const td  = 'padding:6px 8px;border-bottom:1px solid var(--brd);text-align:right;white-space:nowrap';
  const th  = 'padding:6px 8px;border-bottom:2px solid var(--brd);text-align:right;background:var(--bg2);position:sticky;top:0;white-space:nowrap';
  const col = n => n < 0 ? 'color:var(--D);font-weight:700' : 'color:var(--P);font-weight:700';
  const pct = (a,b) => b ? Math.round(a/b*100) + '%' : '-';

  // Otros egresos / ingresos más grandes del rango (para ver a dónde va la plata)
  const sumaDet = campo => {
    const acc = {};
    meses.forEach(m => Object.entries(m[campo]).forEach(([k,v]) => acc[k] = (acc[k]||0) + v));
    return Object.entries(acc).sort((a,b) => b[1]-a[1]).slice(0, 12);
  };
  const topEgr = sumaDet('otrosEgrDet');
  const topIng = sumaDet('otrosIngDet');
  const listaTop = (arr, total) => arr.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${arr.map(([k,v]) =>
        `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--brd)">${esc(k)}</td>
             <td style="${td};padding:4px 6px">${fmt(v)}</td>
             <td style="${td};padding:4px 6px;color:var(--txt2)">${pct(v,total)}</td></tr>`).join('')}</table>`
    : '<div style="font-size:12px;color:var(--txt2)">Sin movimientos</div>';

  document.getElementById('fon-res').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px">
      <div style="background:var(--PL);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--txt2)">Entró (${meses.length} meses)</div>
        <div style="font-size:18px;font-weight:700">${fmt(tot.ingresos)}</div>
        <div style="font-size:11px;color:var(--txt2)">${pct(tot.cobranzas, tot.ingresos)} cobranzas</div>
      </div>
      <div style="background:var(--DL);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--txt2)">Salió</div>
        <div style="font-size:18px;font-weight:700">${fmt(tot.egresos)}</div>
        <div style="font-size:11px;color:var(--txt2)">${pct(tot.pagosProv, tot.egresos)} proveedores</div>
      </div>
      <div style="background:var(--bg2);border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;color:var(--txt2)">Neto del período</div>
        <div style="font-size:18px;${col(tot.neto)}">${fmt(tot.neto)}</div>
        <div style="font-size:11px;color:var(--txt2)">promedio ${fmt(meses.length ? tot.neto/meses.length : 0)} / mes</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px;padding:10px">
      <div style="font-weight:600;margin-bottom:6px">${nombreVista} — entró, salió y neto acumulado</div>
      <div style="position:relative;height:280px"><canvas id="fon-chart"></canvas></div>
    </div>

    <div class="card" style="margin-bottom:12px;padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          <th style="${th};text-align:left">Mes</th>
          <th style="${th}">Cobranzas clientes</th>
          <th style="${th}">Otros ingresos</th>
          ${conTransf ? `<th style="${th}">Transf. recibidas</th>` : ''}
          <th style="${th}">Total entró</th>
          <th style="${th}">Pagos proveedores</th>
          <th style="${th}">Otros egresos</th>
          ${conTransf ? `<th style="${th}">Transf. enviadas</th>` : ''}
          <th style="${th}">Total salió</th>
          <th style="${th}">Neto mes</th>
          <th style="${th}">Acumulado</th>
        </tr></thead>
        <tbody>
          ${meses.map(m => `<tr>
            <td style="${td};text-align:left;font-weight:600">${_fonLabel(m.periodo)}</td>
            <td style="${td}">${fmt(m.cobranzas)}</td>
            <td style="${td}">${fmt(m.otrosIng)}</td>
            ${conTransf ? `<td style="${td};color:var(--txt2)">${fmt(m.transfIn)}</td>` : ''}
            <td style="${td};font-weight:600">${fmt(m.ingresos)}</td>
            <td style="${td}">${fmt(m.pagosProv)}</td>
            <td style="${td}">${fmt(m.otrosEgr)}</td>
            ${conTransf ? `<td style="${td};color:var(--txt2)">${fmt(m.transfOut)}</td>` : ''}
            <td style="${td};font-weight:600">${fmt(m.egresos)}</td>
            <td style="${td};${col(m.neto)}">${fmt(m.neto)}</td>
            <td style="${td};${col(m.acum)}">${fmt(m.acum)}</td>
          </tr>`).join('')}
          <tr style="background:var(--bg2)">
            <td style="${td};text-align:left;font-weight:700">TOTAL</td>
            <td style="${td};font-weight:700">${fmt(tot.cobranzas)}</td>
            <td style="${td};font-weight:700">${fmt(tot.otrosIng)}</td>
            ${conTransf ? `<td style="${td};font-weight:700">${fmt(tot.transfIn)}</td>` : ''}
            <td style="${td};font-weight:700">${fmt(tot.ingresos)}</td>
            <td style="${td};font-weight:700">${fmt(tot.pagosProv)}</td>
            <td style="${td};font-weight:700">${fmt(tot.otrosEgr)}</td>
            ${conTransf ? `<td style="${td};font-weight:700">${fmt(tot.transfOut)}</td>` : ''}
            <td style="${td};font-weight:700">${fmt(tot.egresos)}</td>
            <td style="${td};${col(tot.neto)}">${fmt(tot.neto)}</td>
            <td style="${td}"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-bottom:12px">
      <div class="card" style="padding:10px">
        <div style="font-weight:600;margin-bottom:6px">🔻 Otros egresos más grandes (no son pagos a proveedores)</div>
        ${listaTop(topEgr, tot.otrosEgr)}
      </div>
      <div class="card" style="padding:10px">
        <div style="font-weight:600;margin-bottom:6px">🔺 Otros ingresos más grandes (no son cobranzas)</div>
        ${listaTop(topIng, tot.otrosIng)}
      </div>
    </div>

    <div style="font-size:11px;color:var(--txt2);line-height:1.5">
      Cobranzas y pagos a proveedores se identifican cruzando el número de asiento con los mayores de
      Deudores por Ventas y Proveedores del mismo mes. En los "otros", 📒 indica que el asiento se cruzó con esa cuenta del mayor (combustible, descuentos, etc.).
      ${vista === 'ambas' ? 'Los depósitos y extracciones entre Caja y Banco no se cuentan, porque la plata no sale de la empresa.' : 'Las transferencias entre Caja y Banco se muestran aparte (gris).'}
      El "Acumulado" es la suma de los netos del rango elegido, <b>no el saldo real</b>: el mayor de FoxPro viene con saldo de apertura 0.
    </div>`;

  // Gráfico
  if (_fonChart) { try { _fonChart.destroy(); } catch(e){} _fonChart = null; }
  const cv = document.getElementById('fon-chart');
  if (cv && typeof Chart !== 'undefined' && meses.length) {
    _fonChart = new Chart(cv, {
      data: {
        labels: meses.map(m => _fonLabel(m.periodo)),
        datasets: [
          { type:'bar',  label:'Entró', data: meses.map(m => Math.round(m.ingresos)), backgroundColor:'rgba(26,122,82,.75)', order:2 },
          { type:'bar',  label:'Salió', data: meses.map(m => Math.round(m.egresos)),  backgroundColor:'rgba(192,57,43,.70)', order:2 },
          { type:'line', label:'Neto acumulado', data: meses.map(m => Math.round(m.acum)), borderColor:'#1a5fa8', backgroundColor:'#1a5fa8', tension:.25, pointRadius:4, order:1 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{ tooltip:{ callbacks:{ label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } } },
        scales:{ y:{ ticks:{ callback: v => '$' + (v/1e6).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' M' } } }
      }
    });
  }
}
