// ─── APP: config, auth, estado global, navegación y utilidades compartidas ───

// ─── SUPABASE CONFIG ───
const SB_URL = 'https://ixniwmrjawlbpksdmbfo.supabase.co';

const SB_KEY = 'sb_publishable_PAsjtdtFMb7Q7ZBUe-SQ6A_BnzZC-wQ';

const sb = supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lila-auth' }
});

// Si falla la renovación automática del token (sesión vieja/corrupta tras un
// "borrar caché" parcial, o token ya usado), Supabase cierra la sesión sola.
// Sin este listener la app seguía "andando" con la sesión rota: las consultas
// a las tablas fallaban en silencio (ej: zonas quedaban vacías sin ningún aviso).
sb.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT' && usuarioActual){
    usuarioActual=null;
    localStorage.removeItem('lila-sesion');
    alert('Tu sesión expiró. Volvé a iniciar sesión.');
    location.reload();
  }
});

// ─── USUARIOS ───
// Las contraseñas ya NO viven acá: las valida Supabase Auth.
// Esta lista solo mapea usuario → email y define el rol dentro de la app.
const EMAIL_DOMINIO = 'lila.local';

 // los emails son internos, no reciben correo
// dualRolMovil: true → en el celular puede alternar Vendedor/Repartidor con
// el botón "Cambiar a..." en vez de tener un solo rol fijo.
const USUARIOS = [
  {user:'mauricio',  nombre:'Mauricio',  rol:'vendedor',    rol_original:'admin', dualRolMovil:true},
  {user:'alexis',    nombre:'Alexis',    rol:'vendedor',    esAdmin:true,         dualRolMovil:true},
  {user:'franco',    nombre:'Franco',    rol:'vendedor',    vendedor:'Franco'},
  {user:'david',     nombre:'David',     rol:'vendedor',    vendedor:'David',     dualRolMovil:true},
  {user:'emiliano',  nombre:'Emiliano',  rol:'repartidor',  vendedor:'Emiliano'},
  {user:'gaston',    nombre:'Gastón',    rol:'repartidor',  vendedor:'Gastón'},
];

const emailDe = u => u.user + '@' + EMAIL_DOMINIO;

const usuarioPorEmail = em => USUARIOS.find(x => emailDe(x) === String(em||'').toLowerCase());

// Pantallas por rol
const MENUS_ADMIN=['dash','pedidos','pedido-movil','carga','remitos','cobranza','tesoreria','cheques','cuentas','clientes','maestro-proveedores','listas-precios','productos','remito-rapido','nc','rendicion','stock','informes','comisiones','contrib-zona','saldos-zona','gastos-fijos','contabilidad','exportar','importar-historico'];

const MENUS_VENDEDOR=['vendedor-home','pedidos','pedido-movil','cobranza','cuentas'];

const MENUS_REPARTIDOR=['vendedor-home','cobranza','hoja-ruta','nc'];

let usuarioActual = null;

// ─── ESTADO LOCAL ───
let _clientes=[], _productos=[], _pedidos=[], _remitos=[], _cobros=[], _cargas=[];

let _cliPg=1, _proPg=1, _remPg=1, _cobPg=1, _ccPg=1;

const PP=200;

// ─── VERSIONADO / AUTO-ACTUALIZACIÓN ───
const APP_VERSION = '20260728-07';

// IMPORTANTE: al hacer deploy, actualizar APP_VERSION aquí, CACHE_VERSION en
// sw.js, Y el ?v= de cada <script src="js/..."> en index.html (sin eso el
// navegador puede seguir sirviendo JS viejo hasta 10 min por el cache-control
// de GitHub Pages, aunque el HTML ya se haya refrescado).
document.addEventListener('DOMContentLoaded', function(){
  const vEl=document.getElementById('top-version');
  if(vEl) vEl.textContent='v'+APP_VERSION;
});
function actualizarApp(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(reg?.waiting)reg.waiting.postMessage({type:'SW_SKIP_WAITING'});
    });
  }
  location.reload();
}

async function initVersionCheck(){
  let _updateReady=false;
  let _bgDesde=0;

  // Recarga silenciosa: si hay diferencia de versión, recargar directamente.
  // APP_VERSION vive en js/app.js, no en index.html — hay que traer ese
  // archivo puntual (bypaseando cache) para poder comparar la versión real.
  const _autoReload=async()=>{
    try{
      const url=new URL('js/app.js?_v='+Date.now(),location.href).href;
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)return;
      const txt=await r.text();
      const m=txt.match(/APP_VERSION\s*=\s*'([^']+)'/);
      if(m&&m[1]&&m[1]!==APP_VERSION)location.reload();
    }catch{}
  };

  // El SW avisa cuando activó una versión nueva
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',e=>{
      if(e.data?.type==='SW_ACTUALIZADO'){
        _updateReady=true;
        // Si la app está en fondo (celular bloqueado), recargar ya
        if(document.hidden)location.reload();
      }
    });
  }

  // Gestión de fondo/frente
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      _bgDesde=Date.now();
      // Recargar en fondo si hay update pendiente
      if(_updateReady)setTimeout(()=>location.reload(),400);
    } else {
      // Volviendo al frente: si había update listo → recargar antes de que el usuario haga nada
      if(_updateReady){location.reload();return;}
      // Si estuvo más de 1 minuto en fondo → verificar versión en servidor
      if(_bgDesde&&Date.now()-_bgDesde>60000)_autoReload();
    }
  });

  // Verificar al iniciar y cada 15 minutos
  _autoReload();
  setInterval(_autoReload,15*60*1000);

  // Forzar update del SW por las dudas
  if(!('serviceWorker' in navigator))return;
  try{
    const reg=await navigator.serviceWorker.getRegistration('/lila-distribuidora/');
    if(reg)reg.update().catch(()=>{});
  }catch(e){}
}

// ─── LOGIN ───
// ─── LOGIN AUTOMÁTICO POR URL ───
(function(){
  const params = new URLSearchParams(window.location.search);
  // Limpiar param _v (cache-bust post-actualización) sin afectar el historial
  if(params.get('_v')) history.replaceState(null,'',location.pathname);
  const v = params.get('v') || params.get('user');
  if(v){
    const found = USUARIOS.find(x => x.user === v.toLowerCase() || (x.vendedor||'').toLowerCase() === v.toLowerCase());
    if(found){
      // Solo precarga el usuario; la contraseña la escribe cada uno
      // (si ya hay sesión guardada de Supabase, entra directo igual por la auto-sesión)
      document.addEventListener('DOMContentLoaded', ()=>{
        document.getElementById('login-user').value = found.user;
        const pw = document.getElementById('login-pass');
        if(pw) pw.focus();
      });
    }
  }
})();

async function doLogin(){
  const u=document.getElementById('login-user').value.trim().toLowerCase();
  const p=document.getElementById('login-pass').value;
  const err=document.getElementById('login-err');
  const found=USUARIOS.find(x=>x.user===u);
  if(!found){err.textContent='Usuario o contraseña incorrectos';return;}
  err.textContent='Verificando...';
  // Autenticación REAL contra Supabase Auth (la contraseña se valida en el servidor)
  const {error}=await sb.auth.signInWithPassword({email:emailDe(found),password:p});
  if(error){
    err.textContent = /invalid/i.test(error.message||'')
      ? 'Usuario o contraseña incorrectos'
      : 'No se pudo iniciar sesión: '+(error.message||'error de conexión');
    return;
  }
  err.textContent='';
  entrarApp(found);
}

function entrarApp(found){
  usuarioActual=found;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('app').style.flexDirection='column';
  document.getElementById('top-usuario').textContent=found.nombre+' ('+found.rol+')';
  document.getElementById('top-fecha').textContent=new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
  ['np-fecha','cob-fecha','nc-fecha'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=new Date().toISOString().split('T')[0];});
  
  // Aplicar permisos de navegación
  const sidebar=document.getElementById('sidebar');
  const btnMenu=document.getElementById('btn-menu');
  cerrarMenu();
  const esMovil=found.rol==='vendedor'||found.rol==='repartidor';
  if(esMovil){
    if(sidebar)sidebar.style.display='none';
    if(btnMenu)btnMenu.style.display='none';
    document.querySelector('[data-p="vendedor-home"]').style.display='flex';
    // Si es admin en modo vendedor, mostrar botón para volver al admin
    if(found.rol_original==='admin' || found.user==='mauricio' || found.esAdmin){
      const btnAdmin = document.getElementById('btn-volver-admin');
      if(btnAdmin) btnAdmin.style.display='flex';
    }
    // Dual rol (vendedor/repartidor) en el mismo celular: mostrar el toggle
    if(found.dualRolMovil){
      const btnRol=document.getElementById('btn-cambiar-rol-movil');
      if(btnRol){btnRol.style.display='flex';actualizarBtnRolMovil();}
    }
  } else {
    if(sidebar)sidebar.style.display='';
    if(btnMenu)btnMenu.style.display='';
  }

  // Si es móvil (vendedor o repartidor), ir directo a home
  if(esMovil){
    cargarTodo().then(()=>{initVersionCheck();go('vendedor-home');});
  } else {
    cargarTodo().then(()=>{
      initVersionCheck();
      // Limpiar estado del sidebar
      document.querySelectorAll('.sidebar-group').forEach(g=>{
        g.classList.remove('open','active');
        const chev=g.querySelector('.sidebar-group-btn span');
        if(chev)chev.textContent='▶';
        const items=g.querySelector('.sidebar-items');
        if(items)items.style.display='';
      });
      document.querySelectorAll('.sidebar-item,.sidebar-dash').forEach(b=>b.classList.remove('on'));
      const dashBtn=document.querySelector('.sidebar-dash[data-p="dash"]');
      if(dashBtn){dashBtn.classList.add('on');}
      go('dash');
      initSidebarKeyNav();
      focoHamburguesa();
    });
  }
}

async function logout(){
  usuarioActual=null;
  try{ await sb.auth.signOut(); }catch(e){}
  localStorage.removeItem('lila-sesion'); // limpia restos del sistema viejo
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app').style.display='none';
}

// ─── AUTO-SESIÓN ───
// Si Supabase tiene una sesión guardada válida, entra directo sin pedir contraseña.
document.addEventListener('DOMContentLoaded', async function(){
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return;
    const found = usuarioPorEmail(session.user?.email);
    if(!found){ await sb.auth.signOut(); return; }
    entrarApp(found);
  }catch(e){ /* sin sesión o sin conexión: queda la pantalla de login */ }
});

// ─── CARGA INICIAL ───
async function recargarTodo(){
  const btn = document.querySelector('[onclick="recargarTodo()"]');
  if(btn){btn.textContent='⏳ Cargando...';btn.disabled=true;}
  await cargarTodo();
  if(btn){btn.textContent='🔄 Actualizar';btn.disabled=false;}
  go(_panelActual||'dash');
}

async function cargarTodo(){
  // Guardar HTML original del panel pedido-movil
  const pmPanel = document.getElementById('p-pedido-movil');
  if(pmPanel && !window._pmPanelOriginal) window._pmPanelOriginal = pmPanel.innerHTML;
  await Promise.all([cargarClientes(),cargarProductos(),cargarPedidos(),cargarRemitos(),cargarCobros(),cargarCargas(),cargarGastos(),cargarProveedores(),cargarZonas(),cargarComprobantes(),cargarListasPrecios(),cargarNCs()]);
  renderDash();renderPedidos();renderClientes();renderProductos();renderProveedores();renderRemitos();renderCobros();renderCC();renderCargas();renderGastos();renderNCs();
  poblarZonas();
  // Asegurar que el panel activo sea el correcto
  if(!document.querySelector('.panel.on'))go('dash');
}

// ─── HELPERS ───
function fmt(n){return '$'+(Math.round(n||0)).toLocaleString('es-AR');}

function fmtN(n,d=2){return (n||0).toFixed(d);}

function cerrar(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('on');
  // Mover foco fuera del modal para desbloquear scroll en mobile
  const active=document.activeElement;
  if(active&&el.contains(active))active.blur();
}

function diasDesde(fecha){if(!fecha)return null;return Math.floor((new Date()-new Date(fecha))/(864e5));}

// Popup liviano de "ver detalle" (mismo estilo que verRemitoEnCobro), reutilizable para cobro/NC/comprobante
function popupDetalle(titulo,subtitulo,bodyHTML){
  document.getElementById('detalle-popup')?.remove();
  const ov=document.createElement('div');
  ov.id='detalle-popup';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9990;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--bg);border-radius:12px;padding:20px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.25)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="font-size:16px;font-weight:700;color:var(--P)">${titulo}</span>
      <button onclick="document.getElementById('detalle-popup').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt2);line-height:1">✕</button>
    </div>
    ${subtitulo?`<div style="font-size:12px;color:var(--txt2);margin-bottom:12px">${subtitulo}</div>`:''}
    ${bodyHTML}
    <div style="text-align:center;margin-top:14px">
      <button id="detalle-popup-cerrar" onclick="document.getElementById('detalle-popup').remove()" class="btn" style="padding:8px 28px">Cerrar</button>
    </div>
  </div>`;
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();ov.remove();}});
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('detalle-popup-cerrar')?.focus(),30);
}

// ─── TECLA F8: Grabar / Grabar e imprimir / Solo imprimir ───
// Vale para cualquier formulario de carga, tenga o no comprobante imprimible.
// "imprimir" queda en null en los formularios que no generan nada imprimible
// (ahí el cartel solo ofrece Grabar). "editId" es el id del campo hidden que
// indica edición de un registro ya guardado (si no hay, o si no hay imprimir,
// "Solo imprimir" no tiene sentido y no se muestra).
const _F8_FORMS={
  'm-comprobante':{guardar:()=>guardarComprobante(),imprimir:id=>imprimirComprobante(id),editId:'comp-edit-id'},
  'cob-form-inline':{guardar:()=>guardarCobro(),imprimir:id=>imprimirRecibo(id),editId:null},
  'm-nc':{guardar:()=>guardarNC(),imprimir:id=>imprimirNC(id),editId:null},
  'm-nd':{guardar:()=>guardarND(),imprimir:id=>imprimirNC(id),editId:null},
  'm-pedido':{guardar:()=>guardarPedido(),imprimir:null,editId:null},
  'm-cliente':{guardar:()=>guardarCliente(),imprimir:null,editId:null},
  'm-producto':{guardar:()=>guardarProducto(),imprimir:null,editId:null},
  'm-proveedor':{guardar:()=>guardarProveedor(),imprimir:null,editId:null},
  'm-zona':{guardar:()=>guardarZona(),imprimir:null,editId:null},
  'm-gasto':{guardar:()=>guardarGasto(),imprimir:null,editId:null},
  'm-comp-ajuste':{guardar:()=>guardarAjusteComp(),imprimir:null,editId:null},
  'm-carga':{guardar:()=>guardarCarga(),imprimir:null,editId:null},
  'p-remito-rapido':{guardar:()=>emitirRemitoRapido(),imprimir:()=>imprimirRemito(),editId:null},
  'tp-pagos':{guardar:()=>guardarPago(),imprimir:null,editId:null},
  'tp-concil':{guardar:()=>guardarMovBanc(),imprimir:null,editId:null},
  'stock-conteo-section':{guardar:()=>guardarConteo(),imprimir:null,editId:null},
};
let _f8Cfg=null;

function _f8AbrirPopup(cfg){
  _f8Cfg=cfg;
  const idExistente=cfg.editId?document.getElementById(cfg.editId)?.value:'';
  const body=`<div id="f8-botonera" style="display:flex;flex-direction:column;gap:10px;margin-top:6px" onkeydown="_f8Nav(event)">
    <button class="btn P" style="padding:14px;font-size:14px" onclick="_f8Ejecutar('grabar')">💾 Grabar</button>
    ${cfg.imprimir?`<button class="btn P" style="padding:14px;font-size:14px" onclick="_f8Ejecutar('grabarImprimir')">💾🖨️ Grabar e imprimir</button>`:''}
    ${cfg.imprimir&&idExistente?`<button class="btn" style="padding:14px;font-size:14px" onclick="_f8Ejecutar('soloImprimir')">🖨️ Solo imprimir</button>`:''}
  </div>`;
  popupDetalle('¿Qué querés hacer? (F8)','',body);
  // Foco en el primer botón para poder elegir con flechas ↑↓ + Enter, sin mouse
  setTimeout(()=>document.querySelector('#f8-botonera button')?.focus(),30);
}

function _f8Nav(e){
  if(e.key==='Escape'){e.stopPropagation();document.getElementById('detalle-popup')?.remove();return;}
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();
  e.stopPropagation();
  const btns=[...document.querySelectorAll('#f8-botonera button')];
  const idx=btns.indexOf(document.activeElement);
  const next=e.key==='ArrowDown'?Math.min(idx+1,btns.length-1):Math.max(idx-1,0);
  btns[next]?.focus();
}

async function _f8Ejecutar(accion){
  document.getElementById('detalle-popup')?.remove();
  if(!_f8Cfg)return;
  if(accion==='soloImprimir'){
    const id=_f8Cfg.editId?parseInt(document.getElementById(_f8Cfg.editId)?.value):null;
    if(id&&_f8Cfg.imprimir)_f8Cfg.imprimir(id);
    return;
  }
  const id=await _f8Cfg.guardar();
  if(accion==='grabarImprimir'&&id&&_f8Cfg.imprimir)_f8Cfg.imprimir(id);
}

document.addEventListener('keydown',e=>{
  if(e.key!=='F8')return;
  for(const contId in _F8_FORMS){
    const cont=document.getElementById(contId);
    if(!cont)continue;
    // Los modales .mbg son position:fixed → offsetParent siempre da null, hay que mirar la clase .on.
    // El resto (secciones inline como cob-form-inline) se ocultan/muestran con display, ahí sí sirve offsetParent.
    const visible=cont.classList.contains('mbg')?cont.classList.contains('on'):cont.offsetParent!==null;
    if(!visible)continue;
    e.preventDefault();
    _f8AbrirPopup(_F8_FORMS[contId]);
    return;
  }
});

// Autofiltro por columna: soporta texto libre (includes) y comparación numérica (>500, <=100, etc.)
function matchFiltroCol(valor,filtro){
  filtro=(filtro||'').trim();
  if(!filtro)return true;
  const op=filtro.match(/^(>=|<=|>|<)\s*([\d.,]+)$/);
  if(op){
    const num=parseFloat((valor??'').toString().replace(/[^\d.,-]/g,'').replace(',','.'))||0;
    const ref=parseFloat(op[2].replace(',','.'))||0;
    if(op[1]==='>')return num>ref;
    if(op[1]==='<')return num<ref;
    if(op[1]==='>=')return num>=ref;
    return num<=ref;
  }
  return (valor??'').toString().toLowerCase().includes(filtro.toLowerCase());
}

function poblarSelectValores(id,valores,formatearTexto){
  const sel=document.getElementById(id);
  if(!sel||sel.options.length>1)return;
  const vals=[...new Set(valores)].filter(Boolean).sort();
  vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=formatearTexto?formatearTexto(v):v;sel.appendChild(o);});
}

// Nombre real de la zona (ej. "Arequito") en vez del código (ej. "Z2"), con fallback si no tiene descripción cargada
function nombreZona(codigo){
  const z=(_zonas||[]).find(x=>x.codigo===codigo);
  return z?.descripcion||('Zona '+codigo);
}

function poblarSelectZona(id){
  poblarSelectValores(id,_clientes.map(c=>c.zona||''),nombreZona);
}

function toast(msg,tipo='ok',ms=2800){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;color:#fff;pointer-events:none;transition:opacity .4s;background:${tipo==='err'?'var(--D)':'var(--P)'}`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},ms);
}

function pag(elId,total,cur,fn){
  const pages=Math.ceil(total/PP)||1;
  const el=document.getElementById(elId);if(!el)return;
  if(pages<=1){el.innerHTML='';return;}
  let h='';for(let i=1;i<=pages;i++){h+=`<button class="${i===cur?'on':''}" onclick="(${fn.toString()})(${i})">${i}</button>`;}
  el.innerHTML=h;
}

// ─── BÚSQUEDA GENÉRICA POR CÓDIGO ───
// Mapeo: prefijo modal → {selCli, selPro, campoNombre, campoCodPro, campoNomPro, foco siguiente}
// Nota: se arma en una función (no en un const de nivel superior) porque selCli/selCliNC/selCliCob/selCliRR/selCliND/selPro/selProNC/selProRR
// se definen en ventas.js y tesoreria.js, que cargan después de app.js. Evaluar el mapa al momento de usarlo evita el ReferenceError.
function _getModalMap(){
  return {
    'np':  {selCli: selCli,    selPro: selPro,    qCli:'np-cli-q',  idCli:'np-cli-id',  codCli:'np-cli-cod',  qPro:'np-pro-q',  codPro:'np-cod',  focoCliTras:'np-cod',  focoProTras:'np-cant'},
    'nc':  {selCli: selCliNC,  selPro: selProNC,  qCli:'nc-cli-q',  idCli:'nc-cli-id',  codCli:'nc-cli-cod',  qPro:'nc-pro-q',  codPro:'nc-cod',  focoCliTras:'nc-cod',  focoProTras:'nc-cant'},
    'cob': {selCli: selCliCob, selPro: null,       qCli:'cob-cli-q', idCli:'cob-cli-id', codCli:'cob-cli-cod', qPro:null,        codPro:null,      focoCliTras:'cob-ven-nom', focoProTras:null},
    'rr':  {selCli: selCliRR,  selPro: selProRR,  qCli:'rr-cli-q',  idCli:'rr-cli-id',  codCli:'rr-cli-cod',  qPro:'rr-pro-q',  codPro:'rr-cod',  focoCliTras:'rr-cod',  focoProTras:'rr-cant'},
    'nd':  {selCli: selCliND,  selPro: null,       qCli:'nd-cli-q',  idCli:'nd-cli-id',  codCli:'nd-cli-cod',  qPro:null,        codPro:null,      focoCliTras:'nd-importe', focoProTras:null},
  };
}

function ajustarDrop(inputEl,dropEl){
  const rect=inputEl.getBoundingClientRect();
  const spaceBelow=window.innerHeight-rect.bottom;
  if(spaceBelow<230&&rect.top>spaceBelow){
    dropEl.style.top='auto';dropEl.style.bottom='100%';
  } else {
    dropEl.style.top='100%';dropEl.style.bottom='auto';
  }
}

function volverAdmin(){
  // Cambiar rol temporalmente a admin
  if(usuarioActual) usuarioActual.rol = 'admin';
  const sidebar = document.getElementById('sidebar');
  if(sidebar) sidebar.style.display = '';
  const btnMenu = document.getElementById('btn-menu');
  if(btnMenu) btnMenu.style.display = '';
  document.querySelector('[data-p="vendedor-home"]').style.display = 'none';
  const btnAdmin = document.getElementById('btn-volver-admin');
  if(btnAdmin) btnAdmin.style.display = 'none';
  go('dash');
  initSidebarKeyNav();
  focoHamburguesa();
}

// Alternar Vendedor/Repartidor en el mismo celular (mauricio, alexis, david:
// dualRolMovil=true en USUARIOS). Reutiliza tal cual toda la UI que ya
// distingue por usuarioActual.rol, sin tocar ningún otro chequeo del código.
function toggleRolMovil(){
  if(!usuarioActual)return;
  usuarioActual.rol = usuarioActual.rol==='repartidor'?'vendedor':'repartidor';
  actualizarBtnRolMovil();
  renderVendedorHome();
  if(usuarioActual.rol==='repartidor')cargarHojaRutaRepartidor();
  toast(`📲 Ahora estás como ${usuarioActual.rol==='repartidor'?'Repartidor':'Vendedor'}`);
}

function actualizarBtnRolMovil(){
  const btn=document.getElementById('btn-cambiar-rol-movil');
  if(!btn)return;
  const esRep=usuarioActual?.rol==='repartidor';
  btn.textContent=esRep?'🔄 Cambiar a Vendedor':'🔄 Cambiar a Repartidor';
}

function toggleNavGroup(grupo){
  const existing=document.getElementById('nav-floating-dropdown');
  const wasOpen=document.querySelector('.nav-group.open')?.id==='ng-'+grupo;
  document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('open'));
  if(existing)existing.remove();
  if(wasOpen)return;

  const ng=document.getElementById('ng-'+grupo);
  if(!ng)return;
  const btn=ng.querySelector('.nav-btn');
  const dropdown=ng.querySelector('.nav-dropdown');
  if(!btn||!dropdown)return;

  // Calcular posición real del botón en pantalla
  const btnRect=btn.getBoundingClientRect();
  const topPos=btnRect.bottom>0&&btnRect.bottom<200?btnRect.bottom:72;
  const leftPos=btnRect.left>0?btnRect.left:0;

  const f=document.createElement('div');
  f.id='nav-floating-dropdown';
  f.setAttribute('role','menu');
  f.style.cssText=`position:fixed;top:${topPos}px;left:${leftPos}px;background:#0f5438;min-width:200px;border-radius:0 0 8px 8px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:99999;overflow:hidden`;

  const items=[];
  dropdown.querySelectorAll('button').forEach(b=>{
    const nb=document.createElement('button');
    nb.textContent=b.textContent;
    nb.setAttribute('role','menuitem');
    nb.setAttribute('tabindex','0');
    nb.onclick=()=>{
      if(b.onclick)b.onclick();
      cerrarNavDropdown();
    };
    nb.onkeydown=navDropdownKeydown;
    nb.style.cssText='display:block;width:100%;padding:11px 18px;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.85);font-size:13px;cursor:pointer;text-align:left;font-family:inherit;outline:none';
    nb.onmouseenter=()=>{nb.style.background='rgba(255,255,255,.15)';nb.focus();};
    nb.onmouseleave=()=>nb.style.background='none';
    f.appendChild(nb);
    items.push(nb);
  });

  document.body.appendChild(f);
  ng.classList.add('open');
  // Foco al primer item usando requestAnimationFrame
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      const first=document.querySelector('#nav-floating-dropdown button');
      if(first)first.focus();
    });
  });
}

function navDropdownKeydown(e){
  const f=document.getElementById('nav-floating-dropdown');
  if(!f)return;
  const items=[...f.querySelectorAll('button')];
  const idx=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();items[(idx+1)%items.length].focus();}
  else if(e.key==='ArrowUp'){e.preventDefault();items[(idx-1+items.length)%items.length].focus();}
  else if(e.key==='Enter'){e.preventDefault();document.activeElement.click();}
  else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();cerrarNavDropdown();focusNavBtn();}
}

function cerrarNavDropdown(){
  document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('open'));
  const f=document.getElementById('nav-floating-dropdown');if(f)f.remove();
}

function focusNavBtn(){
  const active=document.querySelector('.nav-group.active .nav-btn')||document.querySelector('.nav-btn');
  if(active)active.focus();
}

// Navegación horizontal por los botones del nav con flechas
document.addEventListener('keydown',e=>{
  const navBtns=[...document.querySelectorAll('.nav-btn, .nav button[data-p]')].filter(b=>b.offsetParent!==null);
  const idx=navBtns.indexOf(document.activeElement);
  if(idx>=0){
    if(e.key==='ArrowRight'){e.preventDefault();navBtns[(idx+1)%navBtns.length].focus();}
    else if(e.key==='ArrowLeft'){e.preventDefault();navBtns[(idx-1+navBtns.length)%navBtns.length].focus();}
    else if(e.key==='ArrowDown'){
      e.preventDefault();
      const grupo=navBtns[idx].closest('.nav-group')?.id?.replace('ng-','');
      if(grupo)toggleNavGroup(grupo);
      else navBtns[idx].click();
    }
    // Enter lo maneja el onclick del botón directamente — no interceptar
  }
  if(e.key==='Escape'){
    // Si hay modal abierto, cerrarlo y devolver foco al buscador activo
    const modalAbierto=document.querySelector('.mbg.on');
    if(modalAbierto){modalAbierto.classList.remove('on');_focusActiveSearch();return;}
    // Si hay buscador F3 abierto, cerrarlo
    const f3=document.getElementById('f3-modal');
    if(f3&&f3.style.display!=='none'){f3Cerrar();return;}
    // Si hay un acordeón del sidebar abierto, colapsarlo primero
    const sidebarGroupOpen=document.querySelector('.sidebar-group.open');
    if(sidebarGroupOpen){toggleSidebar(sidebarGroupOpen.id.replace('sg-',''));return;}
    // Retroceso general: cerrar el menú hamburguesa (si está abierto) y volver al menú principal
    const esMovilNav=usuarioActual?.rol==='vendedor'||usuarioActual?.rol==='repartidor';
    const home=esMovilNav?'vendedor-home':'dash';
    const sidebarAbierto=document.getElementById('sidebar')?.classList.contains('open');
    const panelActual=document.querySelector('.panel.on')?.id?.replace('p-','');
    if(sidebarAbierto)cerrarMenu();
    if(panelActual&&panelActual!==home)go(home);
    // Punto de partida: en escritorio, Escape siempre termina con foco en la hamburguesa
    if(!esMovilNav)focoHamburguesa();
  }
});

function _focusActiveSearch(){
  const panel=document.querySelector('.panel.on');if(!panel)return;
  const map={
    'p-cuentas':'cc-q','p-clientes':'cli-q','p-productos':'pro-q',
    'p-remitos':'rem-q','p-maestro-proveedores':'prov-q','p-cobranza':'cob-q',
    'p-contabilidad':'gas-q','p-compras':'comp-q'
  };
  const id=map[panel.id];
  if(id){const el=document.getElementById(id);if(el)setTimeout(()=>el.focus(),30);}
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.nav-group')&&!e.target.closest('#nav-floating-dropdown'))cerrarNavDropdown();
});

// ─── NAVEGACIÓN GENÉRICA EN LISTAS/TABLAS ───
const _tblNav={};

function _navMark(items,idx){
  items.forEach((r,i)=>{
    const on=i===idx;
    r.style.background=on?'var(--PL)':'';
    r.style.boxShadow=on?'inset 3px 0 0 var(--P)':'';
    r.style.outline=on?'1px solid var(--P)':'';
  });
}

function navTablaGen(e,listId,selector,enterFn){
  if(!['ArrowDown','ArrowUp','Tab','Enter','Escape'].includes(e.key))return;
  const items=[...document.querySelectorAll('#'+listId+' '+selector)].filter(el=>!el.querySelector('[colspan]'));
  if(!items.length)return;
  if(_tblNav[listId]===undefined)_tblNav[listId]=-1;
  let idx=_tblNav[listId];
  if(e.key==='ArrowDown'||e.key==='Tab'){
    e.preventDefault();idx=Math.min(idx+1,items.length-1); // sin loop
  }else if(e.key==='ArrowUp'){
    e.preventDefault();idx=Math.max(idx-1,0); // sin loop
  }else if(e.key==='Enter'&&idx>=0&&enterFn){
    e.preventDefault();enterFn(items[idx]);
    _tblNav[listId]=-1;_navMark(items,-1);return;
  }else if(e.key==='Escape'){
    if(_tblNav[listId]>=0)e.stopPropagation();
    _tblNav[listId]=-1;_navMark(items,-1);return;
  }else return;
  _tblNav[listId]=idx;
  _navMark(items,idx);
  if(idx>=0)items[idx]?.scrollIntoView({block:'nearest'});
}

function resetNav(listId){
  _tblNav[listId]=-1;
  document.querySelectorAll('#'+listId+' tr').forEach(r=>{r.style.background='';r.style.boxShadow='';r.style.outline='';});
}

function navCC(e){navTablaGen(e,'cc-tbody','tr',r=>r.click());}

function navCliTabla(e){navTablaGen(e,'cli-tbody','tr',r=>{
  // Enter abre historial del cliente (última acción = 📋)
  const btns=[...r.querySelectorAll('button.btn')];
  const b=btns[btns.length-1];if(b)b.click();
});}

function navRemitos(e){navTablaGen(e,'rem-tbody','tr',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

function navCobros(e){navTablaGen(e,'cob-tbody','tr',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

function navProductos(e){navTablaGen(e,'pro-tbody','tr',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

function navProveedores(e){navTablaGen(e,'prov-tbody','tr',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

function navGastos(e){navTablaGen(e,'gas-tbody','tr',null);}

function navPedidos(e){navTablaGen(e,'ped-lista','.ccard',r=>{const b=r.querySelector('button.btn');if(b)b.click();});}

// ─── CERRAR DROPS ───
document.addEventListener('click',e=>{
  const hide=id=>{const el=document.getElementById(id);if(el)el.style.display='none';};
  if(!e.target.closest('#np-cli-q')&&!e.target.closest('#np-cli-drop'))hide('np-cli-drop');
  if(!e.target.closest('#np-pro-q')&&!e.target.closest('#np-pro-drop'))hide('np-pro-drop');
  if(!e.target.closest('#cob-cli-q')&&!e.target.closest('#cob-cli-drop'))hide('cob-cli-drop');
  if(!e.target.closest('#rr-cli-q')&&!e.target.closest('#rr-cli-drop'))hide('rr-cli-drop');
  if(!e.target.closest('#rr-cod')&&!e.target.closest('#rr-pro-drop'))hide('rr-pro-drop');
  if(!e.target.closest('#nc-cli-q')&&!e.target.closest('#nc-cli-drop'))hide('nc-cli-drop');
  if(!e.target.closest('#nc-pro-q')&&!e.target.closest('#nc-pro-drop'))hide('nc-pro-drop');
  if(!e.target.closest('#hr-cli-q')&&!e.target.closest('#hr-cli-drop'))hide('hr-cli-drop');
});

function go(p){
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('active'));
  const panel=document.getElementById('p-'+p);
  if(panel)panel.classList.add('on');
  actualizarNavActivo(p);
  // Cerrar dropdowns
  document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('open'));
  // Si el usuario se va de Remito rápido a otro lado, cancelar la
  // facturación secuencial por carga en curso (evita que un remito suelto
  // más tarde siga saltando al próximo cajón de una carga ya abandonada).
  if(p!=='remito-rapido'&&typeof _facturandoCargaId!=='undefined'&&_facturandoCargaId)cancelarFacturarCarga();
  if(p==='remito-rapido')initRR();
  if(p==='informes')initInformes();
  if(p==='rendicion')initRendicion();
  if(p==='saldos-zona')initSaldosZona();
  if(p==='cobranza'){
    if(usuarioActual?.rol==='vendedor'||usuarioActual?.rol==='repartidor'){
      document.getElementById('cob-movil').style.display='block';
      document.getElementById('cob-form-inline').style.display='none';
      limpiarCobMovil();
      cargarHojaRutaRepartidor();
    } else {
      document.getElementById('cob-movil').style.display='none';
      document.getElementById('cob-form-inline').style.display='block';
      limpiarModalCobro();
      // "Imputar al guardar" solo tiene sentido para admin: es quien recibe el
      // pago directo, sin la rendición física vendedor/repartidor → oficina.
      const esAdminCob=usuarioActual?.esAdmin||usuarioActual?.rol==='admin'||usuarioActual?.rol_original==='admin';
      const wrapImp=document.getElementById('cob-imputar-wrap');
      if(wrapImp)wrapImp.style.display=esAdminCob?'block':'none';
    }
  }
  if(p==='vendedor-home'){
    const s=document.getElementById('vh-saludo');
    const f=document.getElementById('vh-fecha');
    if(s&&usuarioActual)s.textContent='Hola, '+usuarioActual.nombre+'!';
    if(f)f.textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
    renderVendedorHome();
  }
  if(p==='contabilidad'){contTab(_pendingContTab||'gastos');_pendingContTab=null;}
  if(p==='nc')renderNCs();
  if(p==='hoja-ruta')hrInit();
  if(p==='cuentas'){const _ccf=document.getElementById('cc-f');if(_ccf)_ccf.value='';const _ccq=document.getElementById('cc-q');if(_ccq)_ccq.value='';_ccPg=1;Promise.all([cargarRemitos(),cargarCobros(),cargarClientes()]).then(()=>{renderCC();});setTimeout(()=>{const q=document.getElementById('cc-q');if(q)q.focus();},100);}
  if(p==='clientes'){setTimeout(()=>{const q=document.getElementById('cli-q');if(q)q.focus();},100);}
  if(p==='productos'){setTimeout(()=>{const q=document.getElementById('pro-q');if(q)q.focus();},100);}
  if(p==='remitos'){setTimeout(()=>{const q=document.getElementById('rem-q');if(q)q.focus();},100);}
  if(p==='maestro-proveedores'){setTimeout(()=>{const q=document.getElementById('prov-q');if(q)q.focus();},100);}
  if(p==='pedidos'){
    // Para vendedores sin admin: usar la vista móvil unificada (hoy)
    if((usuarioActual?.rol==='vendedor'||usuarioActual?.rol==='repartidor')&&!usuarioActual?.esAdmin&&usuarioActual?.rol_original!=='admin'){
      verMisPedidosHoy();
      return;
    }
    const bv=document.getElementById('pedidos-btn-volver-movil');
    const bd=document.getElementById('btn-nuevo-pedido-desk');
    if(bv) bv.style.display='none';
    if(bd) bd.style.display=(usuarioActual?.esAdmin||usuarioActual?.rol==='admin')?'inline-flex':'none';
    setTimeout(()=>{const q=document.getElementById('ped-q');if(q)q.focus();},100);
  }
  if(p==='listas-precios')initListasPrecios();
  if(p==='maestro-proveedores')renderProveedores();
  if(p==='comisiones')initComisiones();
  if(p==='contrib-zona')initContribZona();
  if(p==='gastos-fijos')initGastosFijos();
  if(p==='zonas'){renderZonas();setTimeout(()=>{const q=document.getElementById('zona-q');if(q)q.focus();},100);}
  if(p==='importar-historico')initImportarHistorico();
  if(p==='tesoreria')initTesoreria();
  if(p==='cheques')renderChequesCartera();
  if(p==='compras'){renderComprobantes();setTimeout(()=>{const q=document.getElementById('comp-q');if(q)q.focus();},100);}
  if(p==='remitos'){const f=document.getElementById('rem-grupo-fecha');if(f&&!f.value)f.value=new Date().toISOString().split('T')[0];}
  // Actualizar sidebar activo
  document.querySelectorAll('.sidebar-item,.sidebar-dash').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll(`[data-p="${p}"]`).forEach(b=>b.classList.add('on'));
  document.querySelectorAll('.sidebar-group').forEach(g=>g.classList.remove('active'));
  const grupoMap={
    'clientes':'maestros','cuentas':'maestros','productos':'maestros','stock':'maestros','maestro-proveedores':'maestros','listas-precios':'maestros',
    'pedidos':'ventas','pedido-movil':'ventas','carga':'ventas','remitos':'ventas','remito-rapido':'ventas','nc':'ventas',
    'cobranza':'tesoreria','rendicion':'tesoreria','tesoreria':'tesoreria','cheques':'tesoreria','contabilidad':'tesoreria',
    'informes':'informes','comisiones':'informes','contrib-zona':'informes','gastos-fijos':'informes','importar-historico':'informes'
  };
  const g=grupoMap[p];
  if(g){const sg=document.getElementById('sg-'+g);if(sg)sg.classList.add('active');}
}

// ─── MENÚ HAMBURGUESA (mostrar/ocultar sidebar) ───
// Punto de partida para navegar sin mouse: foco inicial al entrar y destino
// final de Escape. No hace nada si la hamburguesa está oculta (vista móvil).
function focoHamburguesa(){
  const btn=document.getElementById('btn-menu');
  if(btn&&btn.style.display!=='none')btn.focus();
}

// Flechas arriba/abajo entre ítems del sidebar mientras está abierto. Se
// registra una sola vez (no depende de qué camino de login lo abrió).
let _sidebarKeyNavInit=false;
function initSidebarKeyNav(){
  if(_sidebarKeyNavInit)return;
  _sidebarKeyNavInit=true;
  document.getElementById('sidebar')?.addEventListener('keydown',function(e){
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    e.preventDefault();
    const btns=[...this.querySelectorAll('.sidebar-dash,.sidebar-group-btn,.sidebar-item')]
      .filter(b=>b.style.display!=='none');
    const idx=btns.indexOf(document.activeElement);
    if(idx===-1)return;
    const next=e.key==='ArrowDown'?btns[idx+1]:btns[idx-1];
    if(next)next.focus();
  });
}

function abrirMenu(){
  const sidebar=document.getElementById('sidebar');
  if(sidebar){sidebar.classList.add('open');sidebar.removeAttribute('inert');}
  document.getElementById('sidebar-overlay')?.classList.add('open');
  const btn=document.getElementById('btn-menu');
  if(btn){btn.setAttribute('aria-expanded','true');btn.textContent='✕';}
  setTimeout(()=>{
    const first=sidebar?.querySelector('.sidebar-dash:not([style*="display:none"])');
    if(first)first.focus();
  },260);
}
function cerrarMenu(){
  const sidebar=document.getElementById('sidebar');
  const teniaFoco=sidebar?.contains(document.activeElement);
  if(sidebar){sidebar.classList.remove('open');sidebar.setAttribute('inert','');}
  document.getElementById('sidebar-overlay')?.classList.remove('open');
  const btn=document.getElementById('btn-menu');
  if(btn){
    btn.setAttribute('aria-expanded','false');
    btn.textContent='☰';
    if(teniaFoco)btn.focus();
  }
}
function toggleMenu(){
  document.getElementById('sidebar')?.classList.contains('open')?cerrarMenu():abrirMenu();
}
document.addEventListener('DOMContentLoaded',()=>{
  // Cerrar el menú al elegir un ítem de navegación (no al abrir/cerrar un grupo)
  document.getElementById('sidebar')?.addEventListener('click',e=>{
    if(e.target.closest('.sidebar-item,.sidebar-dash'))cerrarMenu();
  });
  // Tecla Inicio en cualquier lugar de una fila de Comprobantes de compra: ver ese comprobante
  document.getElementById('comp-tbody')?.addEventListener('keydown',e=>{
    if(e.key!=='Home')return;
    const tr=e.target.closest('tr[data-comp-id]');if(!tr)return;
    e.preventDefault();
    verComprobanteCompra(parseInt(tr.dataset.compId));
  });
});

function toggleSidebar(grupo){
  const sg=document.getElementById('sg-'+grupo);
  if(!sg)return;
  const open=sg.classList.contains('open');
  // Cerrar todos
  document.querySelectorAll('.sidebar-group').forEach(g=>{
    g.classList.remove('open');
    const chev=g.querySelector('.sidebar-group-btn span');
    if(chev)chev.textContent='▶';
  });
  if(!open){
    sg.classList.add('open');
    const chev=document.getElementById('sc-'+grupo);
    if(chev)chev.textContent='▼';
    // Foco al primer item
    const first=sg.querySelector('.sidebar-item');
    if(first)setTimeout(()=>first.focus(),50);
  }
}

// Navegación teclado en sidebar
document.addEventListener('keydown',e=>{
  const active=document.activeElement;
  // Lista de todos los botones de grupo (módulos) visibles
  const allGroups=[...document.querySelectorAll('.sidebar-group-btn,.sidebar-dash')].filter(b=>b.offsetParent);

  if(active?.classList.contains('sidebar-group-btn')||active?.classList.contains('sidebar-dash')){
    const idx=allGroups.indexOf(active);
    if(e.key==='ArrowDown'){
      e.preventDefault();
      // Saltar al siguiente módulo
      if(idx<allGroups.length-1)allGroups[idx+1].focus();
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      if(idx>0)allGroups[idx-1].focus();
    }
    if(e.key==='Enter'){
      e.preventDefault();
      const grupo=active.closest('.sidebar-group')?.id?.replace('sg-','');
      if(grupo){
        // Si está cerrado, abrirlo y bajar al primer item
        const sg=document.getElementById('sg-'+grupo);
        if(!sg.classList.contains('open')){
          toggleSidebar(grupo);
        } else {
          // Si ya está abierto, bajar a items
          const first=sg.querySelector('.sidebar-item');
          if(first)first.focus();
        }
      } else {
        // Es el Dashboard u otro botón directo
        active.click();
      }
    }
  }

  if(active?.classList.contains('sidebar-item')){
    const items=[...active.closest('.sidebar-items').querySelectorAll('.sidebar-item')];
    const idx=items.indexOf(active);
    if(e.key==='ArrowDown'){
      e.preventDefault();
      if(idx<items.length-1)items[idx+1].focus();
      else{
        // Último item — cerrar grupo y ir al siguiente módulo
        const currentGroup=active.closest('.sidebar-group');
        const groupBtn=currentGroup?.querySelector('.sidebar-group-btn');
        const groupIdx=allGroups.indexOf(groupBtn);
        toggleSidebar(currentGroup.id.replace('sg-',''));
        if(groupIdx>=0&&groupIdx<allGroups.length-1)allGroups[groupIdx+1].focus();
      }
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      if(idx>0)items[idx-1].focus();
      else{const btn=active.closest('.sidebar-group')?.querySelector('.sidebar-group-btn');if(btn)btn.focus();}
    }
    if(e.key==='Enter'){e.preventDefault();active.click();}
    if(e.key==='Escape'){
      const grupo=active.closest('.sidebar-group')?.id?.replace('sg-','');
      if(grupo)toggleSidebar(grupo);
      const btn=active.closest('.sidebar-group')?.querySelector('.sidebar-group-btn');
      if(btn)btn.focus();
    }
  }
});

// ─── BUSCADOR GLOBAL F3 ───
let _f3Tab = 'todo';

let _f3Idx = -1;

document.addEventListener('keydown', function(e){
  if(e.key === 'F3'){
    e.preventDefault();
    f3Abrir();
  }
  if(e.key === 'Escape'){
    const f3 = document.getElementById('f3-modal');
    if(f3 && f3.style.display !== 'none'){f3Cerrar();return;}
    const openModal = document.querySelector('.mbg.on');
    if(openModal){cerrar(openModal.id);return;}
  }
});

function f3Abrir(){
  const modal = document.getElementById('f3-modal');
  modal.style.display = 'flex';
  const input = document.getElementById('f3-input');
  input.value = '';
  input.focus();
  _f3Idx = -1;
  f3Buscar();
}

function f3Cerrar(){
  document.getElementById('f3-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function(){
  const f3m = document.getElementById('f3-modal');
  if(f3m) f3m.addEventListener('click', function(e){ if(e.target === this) f3Cerrar(); });
});

function f3SetTab(tab){
  _f3Tab = tab;
  _f3Idx = -1;
  ['todo','clientes','productos','remitos'].forEach(t=>{
    const btn = document.getElementById('f3-tab-'+t);
    if(btn){ btn.style.background = t===tab ? 'var(--P)' : ''; btn.style.color = t===tab ? '#fff' : ''; }
  });
  f3Buscar();
}

function f3Buscar(){
  const q = (document.getElementById('f3-input').value||'').toLowerCase().trim();
  const el = document.getElementById('f3-resultados');
  _f3Idx = -1;
  
  if(q.length < 1){
    el.innerHTML = '<div style="color:var(--txt2);text-align:center;padding:20px;font-size:13px">Escribí para buscar...</div>';
    return;
  }
  
  let html = '';
  let count = 0;
  
  // Clientes
  if(_f3Tab === 'todo' || _f3Tab === 'clientes'){
    const clis = (_clientes||[]).filter(c=>
      (c.nombre||'').toLowerCase().includes(q) || 
      String(c.codigo||'').includes(q) ||
      (c.telefono||'').includes(q)
    ).slice(0,8);
    if(clis.length){
      html += '<div style="font-size:11px;font-weight:600;color:var(--txt2);padding:4px 8px;text-transform:uppercase">Clientes</div>';
      clis.forEach(c=>{
        html += `<div class="f3-item" data-type="cliente" data-id="${c.id}" 
          style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:6px;cursor:pointer"
          onmouseenter="f3Hover(this)" onclick="f3Seleccionar('cliente',${c.id})">
          <div>
            <div style="font-size:13px;font-weight:600">${c.nombre}</div>
            <div style="font-size:11px;color:var(--txt2)">${c.localidad||''} · ${c.telefono||''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:var(--D)">${fmt(c.saldo||0)}</div>
            <div style="font-size:10px;color:var(--txt2)">saldo</div>
          </div>
        </div>`;
        count++;
      });
    }
  }
  
  // Productos
  if(_f3Tab === 'todo' || _f3Tab === 'productos'){
    const pros = (_productos||[]).filter(p=>
      (p.nombre||'').toLowerCase().includes(q) || 
      String(p.codigo||'').includes(q)
    ).slice(0,8);
    if(pros.length){
      html += '<div style="font-size:11px;font-weight:600;color:var(--txt2);padding:4px 8px;text-transform:uppercase;margin-top:4px">Productos</div>';
      pros.forEach(p=>{
        html += `<div class="f3-item" data-type="producto" data-id="${p.id}"
          style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:6px;cursor:pointer"
          onmouseenter="f3Hover(this)" onclick="f3Seleccionar('producto',${p.id})">
          <div>
            <div style="font-size:13px;font-weight:600">${p.nombre}</div>
            <div style="font-size:11px;color:var(--txt2)">Cód: ${p.codigo||'-'} · ${p.rubro||''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600">${fmt(p.precio||0)}</div>
            <div style="font-size:10px;color:var(--txt2)">stock: ${p.stock||0}</div>
          </div>
        </div>`;
        count++;
      });
    }
  }
  
  // Remitos
  if(_f3Tab === 'todo' || _f3Tab === 'remitos'){
    const rems = (_remitos||[]).filter(r=>{
      const cli = (_clientes||[]).find(c=>c.id===r.cliente_id);
      return (cli?.nombre||'').toLowerCase().includes(q) || String(r.id||'').includes(q) || String(r.numero||'').includes(q);
    }).slice(0,6);
    if(rems.length){
      html += '<div style="font-size:11px;font-weight:600;color:var(--txt2);padding:4px 8px;text-transform:uppercase;margin-top:4px">Remitos</div>';
      rems.forEach(r=>{
        const cli = (_clientes||[]).find(c=>c.id===r.cliente_id);
        html += `<div class="f3-item" data-type="remito" data-id="${r.id}"
          style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:6px;cursor:pointer"
          onmouseenter="f3Hover(this)" onclick="f3Seleccionar('remito',${r.id})">
          <div>
            <div style="font-size:13px;font-weight:600">R-${String(r.id).padStart(4,'0')} · ${cli?.nombre||'-'}</div>
            <div style="font-size:11px;color:var(--txt2)">${r.fecha} · ${r.cobrado?'✓ cobrado':'pendiente'}</div>
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--D)">${fmt(r.total||0)}</div>
        </div>`;
        count++;
      });
    }
  }
  
  if(!count){
    html = '<div style="color:var(--txt2);text-align:center;padding:20px;font-size:13px">Sin resultados para "'+q+'"</div>';
  }
  
  el.innerHTML = html;
}

function f3Hover(el){
  document.querySelectorAll('.f3-item').forEach(e=>e.style.background='');
  el.style.background = 'var(--bg2)';
  _f3Idx = Array.from(el.parentElement.querySelectorAll('.f3-item')).indexOf(el);
}

function f3NavKey(e){
  const items = document.querySelectorAll('.f3-item');
  if(e.key==='ArrowDown'){ e.preventDefault(); _f3Idx=Math.min(_f3Idx+1,items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); _f3Idx=Math.max(_f3Idx-1,0); }
  else if(e.key==='Enter' && _f3Idx>=0){ items[_f3Idx]?.click(); return; }
  items.forEach((el,i)=>el.style.background=i===_f3Idx?'var(--bg2)':'');
  items[_f3Idx]?.scrollIntoView({block:'nearest'});
}

function f3Seleccionar(tipo, id){
  f3Cerrar();
  if(tipo==='cliente'){
    go('clientes');
    setTimeout(()=>{
      const q = document.getElementById('cli-q');
      const c = (_clientes||[]).find(x=>x.id===id);
      if(q && c){ q.value=c.nombre; renderClientes(); }
    },300);
  } else if(tipo==='producto'){
    go('productos');
    setTimeout(()=>{
      const q = document.getElementById('pro-q');
      const p = (_productos||[]).find(x=>x.id===id);
      if(q && p){ q.value=p.nombre; renderProductos(); }
    },300);
  } else if(tipo==='remito'){
    go('remitos');
    setTimeout(()=>{
      const r = (_remitos||[]).find(x=>x.id===id);
      const cli = (_clientes||[]).find(c=>c.id===r?.cliente_id);
      if(cli){
        const q = document.getElementById('rem-q');
        if(q){ q.value=cli.nombre; renderRemitos(); }
      }
    },300);
  }
}

// ─── NAVEGACIÓN GLOBAL POR TECLADO (FoxPro-style) ────────────────────────────
function _navGetFocusables(from){
  if(from.closest('.drop'))return[];
  const scope=from.closest('.mbg')||from.closest('.panel')||document.body;
  const sel='input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"])';
  const all=[...scope.querySelectorAll(sel)].filter(el=>el.offsetParent!==null&&!el.closest('.drop'));
  const wi=all.filter(el=>el.tabIndex>0).sort((a,b)=>a.tabIndex-b.tabIndex);
  const wo=all.filter(el=>!(el.tabIndex>0));
  return[...wi,...wo];
}

function _navNext(el){const ls=_navGetFocusables(el);const i=ls.indexOf(el);if(i>=0&&i<ls.length-1){const nx=ls[i+1];nx.focus();try{nx.select();}catch(x){}}}

function _navPrev(el){const ls=_navGetFocusables(el);const i=ls.indexOf(el);if(i>0){const pv=ls[i-1];pv.focus();try{pv.select();}catch(x){}}}

function _popupDetalleProducto(p){
  document.getElementById('_gl-det-popup')?.remove();
  const ov=document.createElement('div');
  ov.id='_gl-det-popup';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=`<div style="background:var(--bg);border-radius:14px;padding:24px;max-width:460px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:16px;font-weight:700">${p.nombre}</span>
      <button onclick="document.getElementById('_gl-det-popup').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--txt2);line-height:1">✕</button>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      ${p.codigo!=null?`<tr><td style="color:var(--txt2);padding:5px 0;width:130px">Código</td><td style="font-weight:700">${p.codigo}</td></tr>`:''}
      <tr><td style="color:var(--txt2);padding:5px 0">Unidad</td><td>${p.unidad||p.un||'—'}</td></tr>
      <tr><td style="color:var(--txt2);padding:5px 0">Precio</td><td style="font-weight:700;color:var(--P);font-size:15px">${fmt(p.precio||0)}</td></tr>
      ${p.precio_kg?`<tr><td style="color:var(--txt2);padding:5px 0">Precio KG</td><td style="font-weight:700">${fmt(p.precio_kg)}</td></tr>`:''}
      ${p.iva?`<tr><td style="color:var(--txt2);padding:5px 0">IVA</td><td>${p.iva}%</td></tr>`:''}
      ${p.categoria?`<tr><td style="color:var(--txt2);padding:5px 0">Categoría</td><td>${p.categoria}</td></tr>`:''}
      ${p.proveedor?`<tr><td style="color:var(--txt2);padding:5px 0">Proveedor</td><td>${p.proveedor}</td></tr>`:''}
    </table>
    <div style="text-align:center;margin-top:16px"><button onclick="document.getElementById('_gl-det-popup').remove()" class="btn" style="padding:8px 28px">Cerrar</button></div>
  </div>`;
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  document.body.appendChild(ov);
  setTimeout(()=>ov.querySelector('button')?.focus(),50);
}

function _verDetalleDesdeInput(el){
  const fid=el.id||'';
  const val=(el.value||'').trim();
  if(!val)return;
  // Helper: busca campo oculto complementario (*-id) para el campo actual
  const _hid=(suf='')=>{
    for(const s of['-q','-cod','-nom','-nro','-label','-nombre','-search']){
      if(fid.endsWith(s)){const h=document.getElementById(fid.slice(0,-s.length)+suf);if(h?.value)return h.value;}
    }
    return '';
  };
  // CLIENTE (campo contiene "cli" pero no "prov")
  if(/cli/.test(fid)&&!/prov/.test(fid)){
    const hid=_hid('-id');
    const c=(hid&&_clientes.find(x=>String(x.id)===String(hid)))
           ||_clientes.find(x=>String(x.codigo)===val)
           ||_clientes.find(x=>x.nombre.toLowerCase()===val.toLowerCase());
    if(c){histCliente(c.id);return;}
  }
  // CLIENTE en cob-q y cc-q (campos de búsqueda de cliente sin "cli" en el ID)
  if(fid==='cob-q'){
    const hid=document.getElementById('cob-cli-id')?.value;
    const c=(hid&&_clientes.find(x=>String(x.id)===String(hid)))||_clientes.find(x=>x.nombre.toLowerCase().startsWith(val.toLowerCase()));
    if(c){histCliente(c.id);return;}
  }
  if(fid==='cc-q'){
    const c=_clientes.find(x=>x.nombre.toLowerCase().startsWith(val.toLowerCase())||String(x.codigo)===val);
    if(c){histCliente(c.id);return;}
  }
  // PRODUCTO por código exacto (rr-cod, np-cod, etc.)
  if(/\bcod\b/.test(fid)&&!/cli|prov|rem/.test(fid)){
    const p=_productos.find(x=>String(x.codigo)===val);
    if(p){_popupDetalleProducto(p);return;}
  }
  // PRODUCTO por campo de búsqueda (rr-pro-q, np-pro-q, etc.)
  if(/pro/.test(fid)&&!/prov|cli/.test(fid)){
    const hid=_hid('-id');
    const p=(hid&&_productos.find(x=>String(x.id)===String(hid)))
            ||(_rrProTemp&&fid.startsWith('rr')&&_rrProTemp)
            ||_productos.find(x=>x.nombre.toLowerCase().startsWith(val.toLowerCase()));
    if(p){_popupDetalleProducto(p);return;}
  }
  // REMITO por número
  if(/rem/.test(fid)){
    const rid=val.replace(/^R-0*/i,'');
    const r=_remitos.find(x=>String(x.id)===rid);
    if(r){verRemito(r.id);return;}
  }
}

document.addEventListener('keydown',function(e){
  if(e.defaultPrevented)return;
  const el=e.target;
  const tag=el.tagName;
  if(tag!=='INPUT'&&tag!=='SELECT')return;
  if(el.closest('.drop'))return;
  if(e.key==='ArrowRight'&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();_navNext(el);return;}
  if(e.key==='ArrowLeft'&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();_navPrev(el);return;}
  if(e.key==='Home'){_verDetalleDesdeInput(el);}
});
