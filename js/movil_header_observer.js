// =====================================================================
// MODO MÓVIL VENDEDOR — detecta cuándo ocultar el topbar duplicado
// Distribuidora Lila
// =====================================================================
// Qué hace: pone la clase "modo-movil-vendedor" en <body> cuando la
// pantalla activa es una de las de vendedor por celular (Inicio,
// Pedido, Cobranza). El CSS de movil_mejoras.css usa esa clase para
// ocultar el topbar de arriba.
//
// Por qué con un MutationObserver y no tocando go(): así no hace
// falta encontrar y modificar la función real que cambia de pantalla
// (go(), en app.js) — esto es 100% aditivo.
//
// NOTA IMPORTANTE — sobre p-cobranza:
// cob-movil (el div interno) NO cambia su propio style cuando el
// usuario navega FUERA de cobranza — el que cambia es el panel padre
// (#p-cobranza, que pierde/genera la clase .on). Por eso también
// observamos #p-cobranza, y usamos offsetParent !== null para chequear
// visibilidad real (que sí da null cuando algún ancestro tiene
// display:none).
// =====================================================================

function _actualizarModoMovilVendedor() {
  const pVendHome = document.getElementById('p-vendedor-home');
  const pPedidoMovil = document.getElementById('p-pedido-movil');
  const cobMovil = document.getElementById('cob-movil');

  const vendHomeVisible = pVendHome && pVendHome.classList.contains('on');
  const pedidoMovilVisible = pPedidoMovil && pPedidoMovil.classList.contains('on');
  // offsetParent === null cuando el elemento (o un ancestro) tiene
  // display:none. Más robusto que getComputedStyle para este caso.
  const cobMovilVisible = cobMovil && cobMovil.offsetParent !== null;

  const debeOcultarHeader = vendHomeVisible || pedidoMovilVisible || cobMovilVisible;
  document.body.classList.toggle('modo-movil-vendedor', debeOcultarHeader);
}

(function initObservadorModoMovil() {
  // Observamos también #p-cobranza (el panel padre), porque cob-movil
  // por sí solo no cambia su style al salir de la pantalla — el que
  // cambia es el padre al perder/generar .on.
  const objetivos = ['p-vendedor-home', 'p-pedido-movil', 'cob-movil', 'p-cobranza']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!objetivos.length) return;

  const obs = new MutationObserver(_actualizarModoMovilVendedor);
  objetivos.forEach(el => obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));

  _actualizarModoMovilVendedor(); // estado inicial
})();