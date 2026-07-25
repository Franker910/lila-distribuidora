# ERP Distribuidora Lila — Documentación técnica

**Propósito de este documento:** que cualquier programador (o asistente de IA) pueda entender, mantener y continuar este sistema sin ayuda de quien lo hizo.  
**Última actualización:** 25/07/2026 — versión app 20260725-01.

---

## Qué es

Sistema de gestión interno de Distribuidora Lila (distribuidora de alimentos, Argentina). Cubre: clientes, pedidos, remitos, cobranzas, hoja de ruta de reparto, zonas, listas de precios, gastos, contabilidad simple (mayor, estado de resultado), resultado mensual gerencial e importación de datos históricos desde el sistema de facturación FoxPro (que sigue siendo el sistema fiscal).

---

## Arquitectura

Un archivo `index.html` que contiene el HTML y CSS, más **7 módulos JavaScript** en la carpeta `js/`. Sin frameworks, sin build, sin npm. Se edita con cualquier editor de texto.

- **Base de datos:** Supabase (PostgreSQL administrado). La app consulta directo con supabase-js desde el navegador.
- **Hosting:** GitHub Pages del repo `alexisscopetta2026/lila-distribuidora`. Subir archivos al repo = deploy (tarda 1–3 minutos).
- **PWA:** `manifest.json` + `sw.js` (service worker, cache network-first). Al cambiar cualquier archivo JS o el index.html hay que actualizar la versión en **dos lugares**: `APP_VERSION` en `js/app.js` y `CACHE_VERSION` en `sw.js` (formato `AAAAMMDD-NN`).

### Módulos JS (`js/`)

| Archivo | Contenido |
|---|---|
| `app.js` | Config Supabase, login/auth, estado global, navegación, utilidades (fmt, toast, go, buscador) |
| `maestros.js` | Clientes, productos, proveedores, zonas, listas de precios |
| `ventas.js` | Pedidos, remito rápido, notas de crédito/débito, venta móvil |
| `tesoreria.js` | Cobros, cheques, caja, rendición, cobranza móvil |
| `contabilidad.js` | Gastos, gastos fijos, comisiones, mayor/resultado, comprobantes de compra, resultado mensual FoxPro |
| `informes.js` | Dashboard, reportes, comparativos, stock, módulo gerencial |
| `logistica.js` | Cargas, remitos de despacho, hoja de ruta |

---

## Acceso a los datos

- **Proyecto Supabase:** `ixniwmrjawlbpksdmbfo.supabase.co` (cuenta del dueño).
- La clave que figura en el código (`sb_publishable_...`) es la clave **pública** — está bien que esté visible. La clave secreta (`service_role`) **nunca va en el código** y nunca estuvo.
- **Autenticación:** Supabase Auth con 6 usuarios (emails `usuario@lila.local`). El mapeo usuario→rol está en la constante `USUARIOS` de `js/app.js`. Roles: `vendedor` / `repartidor` / `admin` (`esAdmin`, `rol_original`).
- **Seguridad de datos:** RLS (Row Level Security) en todas las tablas con política "solo usuarios logueados" (rol `authenticated`), anon revocado.

---

## Tablas principales (schema public)

- **Operativas:** `clientes`, `pedidos`, `remitos`, `cobros`, `productos`, `zonas`, `hoja_ruta`, `cargas`, `listas_precios`, `lista_precios_items`, `proveedores`, `comprobantes_compras`, `pagos_proveedores`, `notas_credito`, `movimientos_bancarios`, `vendedores`.
- **Contables:** `gastos`, `asientos`, `asientos_detalle`.
- **Gerenciales:** `resultado_mensual`, `resultado_mensual_gastos`.
- **Históricas importadas del FoxPro:** `importaciones_ventas`, `importaciones_saldos`, `importaciones_resultado`, `importaciones_ventas_respaldo` (1.931 filas, **NO borrar**).
- **Convención de períodos:** siempre `"MM-AAAA"` (ej: `02-2026`). La función `normalizarPeriodo()` en `js/app.js` convierte cualquier variante.

---

## Flujo de datos con FoxPro

FoxPro factura; una vez por mes se exporta el "Ranking de cantidades vendidas" (columnas Código | Descripción | Cpra Total, datos desde la fila 6) y se importa por la app en Configuración → Importar histórico. El importador valida que sea un ranking de clientes, normaliza el período y **pisa el mes si ya existe**. Controles de validación: el total importado debe coincidir con el control del FoxPro (~1–2% de tolerancia por descuentos).

---

## Cómo hacer un cambio

1. Clonar el repo o descargar los archivos a modificar.
2. Editar el archivo JS correspondiente al módulo (ver tabla arriba) o `index.html` para cambios de estructura/CSS.
3. Actualizar `APP_VERSION` en `js/app.js` y `CACHE_VERSION` en `sw.js`.
4. Subir al repo por la web de GitHub o `git push`.
5. Los celulares toman la versión nueva al reabrir la app con conexión.

---

## Copias de seguridad (IMPORTANTE)

Los datos viven solo en Supabase. Hacer backup periódico:

- **Automático:** Supabase → Database → Backups (plan gratuito: diario, 7 días).
- **Manual:** SQL Editor → `SELECT * FROM tabla` → Download CSV. Recomendado 1 vez por mes, guardar en pendrive/Drive de la empresa.

---

## Historial de decisiones relevantes

- **2026-07-16:** importador normaliza períodos y valida tipo de archivo.
- **2026-07-16/18:** migración de login local hardcodeado a Supabase Auth + RLS en todas las tablas.
- **2026-07-18:** estilo "alto contraste" global; pantalla Resultado Mensual con manejo por teclado.
- **2026-07-23:** modularización en 7 archivos `js/` — 519 declaraciones, `index.html` pasó de 748 KB a 192 KB.
- **2026-07-25:** sidebar hamburguesa, autofiltros en grillas, tecla F8 para grabar/imprimir, Escape como retroceso, filtro por zona en pedido móvil, vínculo cobro→carga_id para rendición de reparto.

---

## Contacto de contexto

Dueños/operación: Mauricio (admin) y Alexis (admin técnico). El sistema se desarrolló iterativamente con asistencia de IA (Claude, de Anthropic); ante dudas sobre el código, cualquier sesión de Claude u otro asistente puede analizarlo leyendo este archivo y los archivos `js/`.
