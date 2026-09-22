# ERP Distribuidora Lila — Documentación técnica

**Propósito de este documento:** que cualquier programador (o asistente de IA) pueda entender, mantener y continuar este sistema sin ayuda de quien lo hizo.
**Última actualización:** 22/09/2026 — versión app `20260922-01`.

---

## Qué es

Sistema de gestión interno de Distribuidora Lila (distribuidora de alimentos, Argentina). Cubre: clientes, pedidos, remitos, cobranzas, hoja de ruta de reparto, zonas, listas de precios, gastos, contabilidad simple (mayor, estado de resultado), resultado mensual gerencial, cheques en cartera, e importación de datos históricos desde el sistema de facturación FoxPro (que sigue siendo el sistema fiscal).

---

## Arquitectura

Un archivo `index.html` que contiene el HTML y CSS, más **8 módulos JavaScript** en la carpeta `js/`. Sin frameworks, sin build, sin npm. Se edita con cualquier editor de texto.

- **Base de datos:** Supabase (PostgreSQL administrado). La app consulta directo con supabase-js desde el navegador.
- **Hosting:** GitHub Pages del repo `alexisscopetta2026/lila-distribuidora`. Subir archivos al repo = deploy (tarda 1–3 minutos).
- **PWA:** `manifest.json` + `sw.js` (service worker, cache network-first).

### Versionado — IMPORTANTE

Al cambiar cualquier archivo JS o el `index.html` hay que actualizar la versión en **tres lugares**:

1. `APP_VERSION` en `js/app.js`
2. `CACHE_VERSION` en `sw.js`
3. El `?v=AAAAMMDD-NN` de los 8 `<script src="js/...">` en `index.html`

Formato `AAAAMMDD-NN` (ej: `20260922-01`). Sin esto el service worker puede seguir sirviendo JS viejo hasta 10 minutos aunque el HTML ya se haya refrescado.

### Módulos JS (`js/`)

| Archivo | Contenido |
|---|---|
| `app.js` | Config Supabase, login/auth, estado global, navegación (go + History API), breadcrumb, sistema de refresco en vivo, utilidades (fmt, toast, esc, q) |
| `maestros.js` | Clientes, productos, proveedores, zonas, listas de precios |
| `ventas.js` | Pedidos, remito rápido, notas de crédito/débito, venta móvil, swipe pedido |
| `tesoreria.js` | Cobros, cheques en cartera, caja, rendición, cobranza móvil |
| `contabilidad.js` | Gastos, gastos fijos, comisiones, mayor/resultado, comprobantes de compra, resultado mensual FoxPro |
| `informes.js` | Dashboard, reportes, comparativos, stock, módulo gerencial |
| `logistica.js` | Cargas, remitos de despacho, hoja de ruta |
| `movil_header_observer.js` | Observer que oculta el topbar duplicado en pantallas móviles de vendedor |

---

## Acceso a los datos

- **Proyecto Supabase:** `ixniwmrjawlbpksdmbfo.supabase.co` (cuenta del dueño).
- La clave que figura en el código (`sb_publishable_...`) es la clave **pública** — está bien que esté visible. La clave secreta (`service_role`) **nunca va en el código** y nunca estuvo.
- **Autenticación:** Supabase Auth con usuarios (emails `usuario@lila.local`). El mapeo usuario→rol está en la constante `USUARIOS` de `js/app.js`. Roles: `vendedor` / `repartidor` / `admin` (`esAdmin`, `rol_original`, `dualRolMovil`). Los admins pueden alternar rol vendedor↔repartidor en el celular.
- **Seguridad de datos:** RLS (Row Level Security) en todas las tablas con política "solo usuarios logueados" (rol `authenticated`), anon revocado.
- **Storage:** bucket `comprobantes` (público) para comprobantes de transferencia. Tiene RLS propia con política `authenticated` (insert/select/update/delete sobre `bucket_id = 'comprobantes'`).

---

## Tablas principales (schema public)

- **Operativas:** `clientes`, `pedidos`, `remitos`, `cobros`, `productos`, `zonas`, `hoja_ruta`, `cargas`, `listas_precios`, `lista_precios_items`, `proveedores`, `comprobantes_compras`, `pagos_proveedores`, `notas_credito`, `movimientos_bancarios`, `vendedores`, `gastos_reparto`, `cheques`.
- **Contables:** `gastos`, `asientos`, `asientos_detalle`.
- **Gerenciales:** `resultado_mensual`, `resultado_mensual_gastos`.
- **Históricas importadas del FoxPro:** `importaciones_ventas`, `importaciones_saldos`, `importaciones_resultado`, `importaciones_ventas_respaldo` (1.931 filas, **NO borrar**).

### Convenciones de datos

- **Períodos:** siempre `"MM-AAAA"` (ej: `02-2026`). Función `normalizarPeriodo()` en `js/app.js` convierte cualquier variante.
- **Fechas:** siempre `"YYYY-MM-DD"` en ISO. Para "hoy" en hora local usar `hoyLocal()` (no `toISOString()` que da UTC y rompe en Argentina después de las 21hs).
- **Códigos de cliente/proveedor:** la columna `codigo` es `integer` en `clientes` (no text). Al hacer JOIN contra `importaciones_saldos.codigo_cliente` (text) hay que castear con `::text` o `::integer` según el caso.
- **`cobros.carga_id`:** se guarda cuando el cobro se hace desde el celu con una carga activa seleccionada. Sirve para vincular el cobro a una carga sin necesitar `hoja_ruta`.
- **`gastos_reparto.carga_id`:** mismo criterio, se setea al cargar un gasto desde "Mi ruta de hoy" con carga activa.
- **`remitos.saldo_pendiente`:** cuando es `null` se interpreta como `= total` (para compatibilidad con datos viejos). Se setea a `total` al crear remitos nuevos (post fix 2026-09-10).
- **`cheques`:** origen (`cobro_id` + `cliente_id`), estado (`en_cartera` / `entregado_a_proveedor` / `depositado` / `rechazado`), destino (`pago_proveedor_id` + `proveedor_id`).

---

## Flujo de datos con FoxPro

FoxPro factura; una vez por mes se exporta:
- **"Ranking de cantidades vendidas"** (columnas Código | Descripción | Cpra Total, datos desde la fila 6) → tipo "Ventas por cliente".
- **"Saldos de cuentas"** (columnas Código | Cliente | Dirección | Localidad | Saldo, datos desde la fila 3) → tipo "Saldos".
- **"Resultado"** (columnas Código | Descripción | Cantidad | Kilos | Venta Neta | Costo | Diferencia | % margen, datos desde la fila 12) → tipo "Resultado / CMG por producto".

Se importan por la app en **Informes → Importar histórico FoxPro**. El importador valida que sea un ranking de clientes, normaliza el período y **pisa el mes si ya existe**. Controles: el total importado debe coincidir con el control del FoxPro (~1–2% de tolerancia por descuentos).

### Actualización de saldos de clientes

Una vez por mes el contador pasa el Excel de saldos. Se importa con el tipo "Saldos de cuentas" y después, con SQL, se actualiza `clientes.saldo` desde `importaciones_saldos`. **Siempre hacer backup antes** (`CREATE TABLE clientes_saldos_backup_YYYYMMDD AS SELECT ... FROM clientes`). El total del backup debe coincidir con el total del Excel al finalizar.

Cuidado con **códigos duplicados** en `clientes` (mismo código, nombres con Ñ vs caracteres corruptos): hay que resolver esos casos antes de aplicar el UPDATE masivo.

---

## Navegación

### History API

Cada `go(panel)` empuja un estado al historial del navegador con `history.pushState`. El botón "atrás" del navegador/celular funciona como una app nativa: cierra modales y overlays primero, después navega entre paneles. Al llegar al panel base (dash o vendedor-home), sale del sitio.

- `_navPanelActual`, `_navDesdePopstate`, `_navInicializado`: estado interno.
- `_navCerrarCapaSuperior()`: orden de cierre F3 → modal → sidebar.
- MutationObservers sobre modales (`.mbg`) y F3 para empujar/consumir estados.

### Breadcrumb (migas de pan)

En vista PC, el topbar muestra en el centro la ruta de navegación:
`Maestros › Clientes` o `Informes › Centro de informes › Mayores`.

- Mapas: `_BC_GRUPOS`, `_BC_PANELES`, `_BC_PANEL_A_GRUPO`, `_BC_SUB` en `app.js`.
- Cada función que cambia tab llama a `setBreadcrumbSub(prefix, key)` (`infTab`, `contTab`, `tesoTab`, `lpTab`).
- Al cambiar de panel, `limpiarBreadcrumbSub()` resetea el 3er nivel.
- Los emojis van con `filter:brightness(0) invert(1)` para verse blancos.

### Actualización en vivo

Botón 🔄 en el topbar + auto-refresco cada 25s en paneles que se suscriben con `registrarRefresco('panel', asyncFn)`:

- `rendicion`: recarga cobros + hojas de ruta + gastos.
- `cobranza-hoy`: recarga cobros.
- `carga`: recarga pedidos pendientes (solo en la vista nueva de carga).

El auto-refresco se pausa cuando la pestaña está en background.

### Atajos de teclado (PC)

- `F2`: buscador de cliente/proveedor.
- `F3`: buscador global (clientes, productos, remitos).
- `F8`: grabar / grabar e imprimir / solo imprimir.
- `Escape`: retroceso (cierra modal → sidebar → vuelve al panel base).
- `Inicio`: ver detalle del comprobante en el input activo.
- `↑↓`: navegar filas de tablas/autocompletar.
- `←→`: mover entre inputs.

---

## Cómo hacer un cambio

1. Clonar el repo o descargar los archivos a modificar.
2. Editar el archivo JS correspondiente al módulo (ver tabla arriba) o `index.html` para cambios de estructura/CSS.
3. Actualizar `APP_VERSION` en `js/app.js`, `CACHE_VERSION` en `sw.js`, y los 8 `?v=` en `index.html`.
4. Subir al repo por la web de GitHub o `git push`.
5. Los celulares toman la versión nueva al reabrir la app con conexión.

---

## Copias de seguridad (IMPORTANTE)

Los datos viven solo en Supabase. Hacer backup periódico:

- **Automático:** Supabase → Database → Backups (plan gratuito: diario, 7 días).
- **Manual:** SQL Editor → `SELECT * FROM tabla` → Download CSV. Recomendado 1 vez por mes, guardar en pendrive/Drive de la empresa.
- **Antes de cualquier operación masiva** (UPDATE/DELETE por SQL): crear tabla de backup con `CREATE TABLE xxx_backup_YYYYMMDD AS SELECT * FROM xxx`.

---

## Historial de decisiones relevantes

- **2026-07-16:** importador normaliza períodos y valida tipo de archivo.
- **2026-07-16/18:** migración de login local hardcodeado a Supabase Auth + RLS en todas las tablas.
- **2026-07-18:** estilo "alto contraste" global; pantalla Resultado Mensual con manejo por teclado.
- **2026-07-23:** modularización en 7 archivos `js/` — 519 declaraciones, `index.html` pasó de 748 KB a 192 KB.
- **2026-07-25:** sidebar hamburguesa, autofiltros en grillas, tecla F8 para grabar/imprimir, Escape como retroceso, filtro por zona en pedido móvil, vínculo cobro→carga_id para rendición de reparto.
- **2026-09-10:** fix crítico de remitos duplicados en cargas (doble emisión + pesaje). Idempotencia, guard contra doble-toque, deduplicación por `pedido_id`. Limpieza de 15 remitos duplicados y recálculo de saldos de 8 clientes.
- **2026-09-11:** Mi Ruta móvil rediseño — acordeones por carga + buscador, botones colapsables (Agregar cliente / Gastos), fix de filtro por fecha. Se sacó el botón "Hoja de ruta" del home vendedor (solo repartidor).
- **2026-09-14:** History API implementada (botón atrás del navegador funciona como app nativa). Nuevo módulo de Cheques en Cartera (tabla `cheques` + alta automática al cobrar con cheque + vinculación a pagos a proveedor). Sub-paneles de cobranza móvil (Cuenta corriente / Mis cobranzas) como pantallas propias.
- **2026-09-15:** ajustes en cobranza PC — scroll en formulario, panel de cheque sin desborde, inputs de importe vacíos con step=1, comprobante de transferencia con botón único. Imputación automática FIFO + botón "✓ Todo" en móvil.
- **2026-09-16:** Cargas PC — scroll en nueva carga + filtro por fecha de pedido (default hoy) + ajustes de impresión de hoja de carga. Buscadores con match exacto por código (Cuentas corrientes, Clientes, Proveedores).
- **2026-09-17:** Fix id duplicado (`cobm-paso-cliente` → `pm-paso-cliente` en pedido móvil). Vinculación `gastos_reparto.carga_id`. Filtro de cargas por defecto en hoy. Sistema de actualización en vivo (botón 🔄 + auto-refresco cada 25s en Rendición y Cobranza Hoy).
- **2026-09-18:** Rendición — grilla debajo de la tarjeta seleccionada (antes aparecía al final), acordeón "Cobros sin hoja de ruta", filtro por defecto en hoy, hora del cobro en la grilla, grilla compactada de 12 a 8 columnas.
- **2026-09-21:** Cobranza móvil — acordeones por zona, chips por rol (`Todos` / `Con deuda` / `Ruta de hoy`), búsqueda sin ocultar acordeones, `capture=environment` para cámara en comprobantes, fix overlay huérfano. Actualización masiva de saldos de clientes desde Excel FoxPro (521 clientes). Breadcrumb en topbar (3 niveles con tabs). Admins ven todos los clientes en cobranza móvil. Rendición: columna "Saldo inicial → final" del cliente. Cobros con número de rendición salen del acordeón "sin hoja de ruta".
- **2026-09-22:** Mejoras móvil vendedor — ocultar topbar duplicado en Inicio/Pedido/Cobranza (`movil_header_observer.js`), letra más grande, listas planas sin borde de card, swipe para retroceder en Pedido y Cobranza móvil.

---

## Pendientes conocidos

- **Fix 3 (Rendición):** agrupar cobros por `carga_id` en lugar de mostrarlos sueltos en "Cobros sin hoja de ruta". Existen 2 opciones: nueva sección "Cargas del día" (más completa) o botón de backfill que crea las hojas de ruta faltantes (más simple). Documentado en detalle en el chat de la sesión del 2026-09-21.
- **Resultado neto por carga:** falta implementar la fórmula `total_facturado − devoluciones (notas de crédito) − gastos_reparto.filter(carga_id)`. La base ya está lista (gastos_reparto.carga_id existe desde 2026-09-17).
- **Clientes históricos con saldo 0:** hay ~135 clientes del FoxPro con saldo 0 que no están en la base. No se crearon para no poblar con fantasmas. Si en algún momento se necesitan, se importan.
- **Comisión por ventas (módulo Comisiones 2):** tiene bugs conocidos en el cálculo.

---

## Contacto de contexto

Dueños/operación: **Mauricio (admin)** y **Alexis (admin técnico)**. El sistema se desarrolló iterativamente con asistencia de IA (Claude, de Anthropic); ante dudas sobre el código, cualquier sesión de Claude u otro asistente puede analizarlo leyendo este archivo y los archivos `js/`.