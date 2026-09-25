// =====================================================================
// INSTALAR APP — ícono en la pantalla de inicio del celular
// Distribuidora Lila
// =====================================================================
// Qué hace: muestra el botón "📲 Instalar app" (en el login y en el
// Inicio del vendedor) SOLO en celulares y SOLO si la app todavía no
// está instalada / abierta desde el ícono.
//
//   · Android (Chrome, Edge, Samsung): usa el aviso nativo de
//     instalación (beforeinstallprompt). Un toque y queda el ícono.
//   · iPhone (Safari): Apple no permite instalar por código, así que
//     el botón abre un cartel con los 2 pasos: Compartir → "Agregar a
//     inicio".
//   · Cualquier otro caso (el navegador todavía no ofreció instalar):
//     cartel con los pasos del menú ⋮ → "Instalar app".
//
// Una vez instalada, tocar el ícono abre la app a pantalla completa y,
// como la sesión de Supabase queda guardada (persistSession), entra
// directo sin pedir contraseña (ver AUTO-SESIÓN en app.js).
//
// 100% aditivo: no toca ninguna función existente.
// =====================================================================

(function initInstalarApp() {
  let _promptInstalacion = null;

  const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  const esCelular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || window.innerWidth <= 768;

  function yaInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.navigator.standalone === true; // iOS
  }

  function actualizarBotones() {
    const mostrar = esCelular && !yaInstalada();
    document.querySelectorAll('.btn-instalar-app').forEach(b => {
      b.style.display = mostrar ? '' : 'none';
    });
  }

  // Android/Chrome: el navegador avisa que la app se puede instalar.
  // Guardamos el evento para dispararlo cuando toquen el botón.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _promptInstalacion = e;
    actualizarBotones();
  });

  window.addEventListener('appinstalled', () => {
    _promptInstalacion = null;
    actualizarBotones();
    if (typeof toast === 'function') toast('✅ App instalada. Ya podés abrirla desde el ícono 🌸');
  });

  window.instalarApp = async function () {
    if (_promptInstalacion) {
      _promptInstalacion.prompt();
      try { await _promptInstalacion.userChoice; } catch (e) {}
      _promptInstalacion = null; // el evento se puede usar una sola vez
      actualizarBotones();
      return;
    }
    mostrarInstrucciones();
  };

  function mostrarInstrucciones() {
    document.getElementById('instalar-app-modal')?.remove();

    const pasos = esIOS
      ? `<li>Tocá el botón <b>Compartir</b> <span style="font-size:20px">⎋</span> (el cuadrado con la flecha para arriba, abajo en Safari).</li>
         <li>Bajá y tocá <b>"Agregar a inicio"</b>.</li>
         <li>Tocá <b>Agregar</b>. Listo: queda el ícono 🌸 Lila.</li>
         <li style="color:var(--txt2)">Importante: tiene que ser desde <b>Safari</b>, no desde Chrome ni desde WhatsApp.</li>`
      : `<li>Tocá el menú <b>⋮</b> (arriba a la derecha del navegador).</li>
         <li>Tocá <b>"Instalar app"</b> o <b>"Agregar a pantalla principal"</b>.</li>
         <li>Confirmá. Listo: queda el ícono 🌸 Lila.</li>
         <li style="color:var(--txt2)">Si abriste el link desde WhatsApp, primero tocá ⋮ → "Abrir en Chrome".</li>`;

    const m = document.createElement('div');
    m.id = 'instalar-app-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:flex-end;justify-content:center;';
    m.onclick = ev => { if (ev.target === m) m.remove(); };
    m.innerHTML = `
      <div style="background:var(--bg);color:var(--txt);width:100%;max-width:480px;border-radius:16px 16px 0 0;padding:22px 20px 28px;font-family:inherit;">
        <div style="font-size:19px;font-weight:700;color:var(--PD);margin-bottom:12px;">📲 Instalar Lila en el celular</div>
        <ol style="padding-left:22px;font-size:16px;line-height:1.55;display:flex;flex-direction:column;gap:8px;">${pasos}</ol>
        <div style="font-size:14px;color:var(--txt2);margin-top:14px;">Después entrás tocando el ícono, sin poner la contraseña cada vez (salvo que toques "Salir").</div>
        <button onclick="document.getElementById('instalar-app-modal').remove()"
          style="margin-top:18px;width:100%;padding:15px;background:var(--P);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;">
          Entendido
        </button>
      </div>`;
    document.body.appendChild(m);
  }

  // Pedirle al navegador que NO borre los datos de la app (donde vive la
  // sesión) cuando el celular se queda sin espacio. En Chrome con la app
  // instalada normalmente lo concede sin preguntar.
  try { navigator.storage?.persist?.(); } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', actualizarBotones);
  } else {
    actualizarBotones();
  }
})();
