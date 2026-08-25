# Handoff: App móvil "Pesada de Balanza"

## Resumen

App instalable en el teléfono para los balanceros, que reemplaza el uso de la web
actual **en el momento de cargar pesadas**, y un resumen para el usuario GENERAL
(dueño / oficina). Resuelve tres dolores del sistema web vigente:

1. Scrolleo excesivo para encontrar el camión y el paso que falta.
2. Dos accesos distintos (uno para cargar, otro para ver).
3. No se puede trabajar sin señal en el galpón / a campo.

El flujo del negocio **no cambia**: sigue siendo la cadena
`CAMIONES → TARA FINAL → REGULADA`, sobre los mismos datos.

## Regla de oro de este desarrollo

**La web actual sigue funcionando y en producción durante todo el desarrollo.**
Nada de lo que se construya puede alterar las rutas, vistas ni reportes existentes.

Estrategia acordada con el usuario:

- Trabajar en una **rama aparte** (sugerido: `app-movil`) del repo
  `pesada-balanza-backend`.
- Las pantallas nuevas viven bajo un prefijo propio: `/app/...`.
  Nada por fuera de `/app` se modifica.
- **Misma base de datos MongoDB, mismas colecciones, mismos documentos.** Los
  tickets cargados desde la app tienen que aparecer en `Ver Registros`, en el
  Excel y en el mail automático de las 19hs, sin ningún cambio en ese código.
- Los reportes por email y la hoja "IMPRIMIR" siguen funcionando igual, porque
  leen los mismos datos.
- Se publica en el mismo Render. Mientras se prueba, conviene que `/app` esté
  detrás de un flag de entorno (ej. `APP_MOVIL=1`) para poder apagarlo sin
  redeploy de la web.

Se debe poder usar la app y la web **el mismo día, sobre la misma balanza**, sin
que se pisen los datos.

## Sobre los archivos de diseño

Los archivos de este paquete son **referencias de diseño hechas en HTML**:
prototipos que muestran el aspecto y el comportamiento buscados, **no código para
copiar y pegar** a producción.

La tarea es **recrear estas pantallas dentro del entorno que el proyecto ya
tiene**: Node + Express + EJS + Bootstrap 5, vistas en `views/`, estáticos en
`public/`, sesión con `express-session` + `connect-mongo`. No introducir React ni
un build nuevo: las pantallas nuevas deben ser vistas EJS (o HTML estático servido
desde `public/app/`) con el CSS propio que haga falta.

Recomendación: la app móvil es una **PWA** (manifest + service worker) servida
desde `/app`, para que se pueda "agregar a inicio" y funcionar sin conexión.

## Fidelidad

**Alta (hi-fi).** Colores, tipografías, espaciados, jerarquía y textos exactos
están definidos en el HTML de referencia y en la sección "Tokens" de este
documento. Recrear la UI fielmente, adaptando solo lo necesario a Bootstrap /
CSS propio.

Los teléfonos maquetados son de **390 × 844 px** (iPhone estándar). Todo debe
funcionar de 360 px de ancho para arriba.

---

## Pantallas

Las referencias visuales están en `Pesada de Balanza.dc.html`, organizadas en
"turnos" (iteraciones), del más nuevo arriba al más viejo abajo. Cada opción
tiene un id visible: `8a`, `7c`, `6b`, `5a`, etc. Abajo se cita el id que hay que
mirar para cada pantalla.

### 1. Ingreso por código — ref. `6a`

- **Propósito**: entrar a la app. El código identifica **la balanza**, no a la
  persona (así funciona hoy: `codigosIngreso` en `app.js`).
- **Layout**: pantalla oscura (`#1b1a17`), título grande arriba, 6 casilleros de
  código, botón "Entrar", y **teclado numérico propio** abajo (no el del
  sistema), botones de 58 px de alto mínimo, para dedo con guante.
- Se ingresa **una sola vez**: la sesión queda abierta en ese teléfono
  (la cookie de sesión actual dura 8 h; para la app conviene extenderla o
  renovarla en cada uso).
- El código **nunca se muestra** en otra pantalla ni en el ticket impreso.
- Los códigos se pueden **renovar**: el viejo deja de servir, la app pide el
  nuevo y no se pierde nada de lo cargado.
- Mantener el rate limiting de login que ya existe (`rateLimitLogin`).

### 2. Nombre del día — ref. `6b`

- **Propósito**: saber quién cargó cada ticket sin agregar otra contraseña.
- **Cuándo**: en el **primer ingreso de cada día** con ese código. Una vez por
  día y por balanza.
- Campo de texto "Nombre y apellido" + chips con los **últimos nombres usados en
  esa balanza** para tocar en vez de escribir. Botón "Empezar el día".
- Ese nombre se guarda en **cada ticket** que se registre ese día y aparece en el
  resumen de GENERAL. Se puede cambiar a mitad del día desde el encabezado del
  Patio (si toma la balanza otra persona).

### 3. Patio (pantalla principal) — ref. `1a`, y estados en `7a` y `7c`

- **Propósito**: ver los camiones en curso y llegar en un toque al paso que falta.
- Tarjetas de camión, una por camión abierto, con: **patente** (mono, 19 px),
  número de ticket, transporte · chofer · campo, chips de estado, y **un botón
  grande con el paso que falta** ("Cargar tara final" / "Cargar regulada").
- Encabezado: nombre de la balanza + estado de conexión + nombre del día.
- Botón fijo abajo: "＋ Nueva pesada".
- Franjas de aviso arriba de la lista, cuando corresponde (ver "Avisos").

### 4. Nueva pesada (CAMIONES) / Tara final / Regulada

- Formularios de un solo paso por pantalla, campos de 54 px de alto mínimo.
- Reutilizar la lógica y validaciones del backend actual
  (`views/registro.ejs`, `confirmar-tara-final.ejs`, `confirmar-regulada.ejs`),
  incluida la asignación automática de usuario de balanza según el Campo
  (`campoUsuario` en `app.js`).
- **Novedad**: el balancero registra los tres tickets. Antes CAMIONES lo cargaba
  el usuario GENERAL.
- Autocompletar patentes, choferes, transportes, campos, lotes y contratistas
  con lo ya cargado en la base (hoy hay contratistas y tractores en
  `Tablets 25-26.xlsx`).

### 5. Recordatorio de impresión del ticket — ref. `5e` y `5f`

- **Al guardar TARA FINAL** aparece una hoja modal:
  - "TARA FINAL GUARDADA" / "Imprimí el ticket 1-0001 para el chofer" /
    "AC 884 TF · R. Gómez. Se corta y se entrega al chofer."
  - Botones: **"Imprimir ahora"** (negro, 54 px) y **"Más tarde"** (texto gris).
  - **No hay "Compartir PDF" en este momento**: el ticket de tara final solo se
    imprime. Compartir PDF se habilita **después de la REGULADA**, cuando el
    ticket está completo.
- Si elige "Más tarde":
  - Franja ámbar arriba del Patio: "2 tickets sin imprimir · 1-0001 · 1-0000"
    con botón "Imprimir".
  - Chip `TICKET SIN IMPRIMIR` en la tarjeta del camión.
  - No bloquea nada; el recordatorio vuelve hasta que se imprima.

### 6. Ticket para el chofer (PDF imprimible) — ref. `5a` (formato elegido)

**Medidas exactas**: banda de **19 cm de ancho × 4,5 cm de alto**, sobre hoja A4
vertical (21 × 29,7 cm), con **1 cm de margen** a cada lado y 1 cm arriba y abajo.

- 27,7 cm útiles / 4,5 cm = **6 tickets por hoja** (sobran 0,7 cm).
- Los tickets van **pegados**: la línea punteada que cierra uno es la que abre el
  siguiente. No dejar espacio entre tickets.
- Línea punteada al pie con la leyenda "CORTAR AQUÍ" (7 px, letter-spacing .24em,
  color `#c2beb5`).
- Lo normal es imprimir **de uno** (un camión = un ticket). Si quedaron varios
  pendientes, se agrupan de a 6 en una hoja.

**Estructura en tres bloques** (izquierda / centro / derecha):

- **Izquierda (132 px de ancho, separada por línea vertical `#d8d5ce`)**:
  - Arriba: **nombre del establecimiento correspondiente al código usado**
    (ej. "El Mataco"), 16 px semibold; debajo "AMH" o "Socio <Nombre>", 9 px mono.
    **No mostrar el código de acceso** (es secreto) ni la leyenda "único original".
  - Abajo: "TICKET Nº" (8 px mono, letter-spacing .1em, `#8f8b82`) y el número en
    26 px mono; fecha y hora abajo (9 px mono).
- **Centro (grilla de 3 columnas)**: PATENTES (mono 13 px) · **CHOFER (14 px,
  peso 700 — es el dato que más se busca)** · TRANSPORTE · CAMPO ·
  GRANO · LOTE (punteado) · CP / CTG (punteado) · **OBSERVACIONES (punteado, a
  todo el ancho)**.
  Etiquetas: 8 px mono, letter-spacing .1em, `#8f8b82`.
- **Derecha (176 px, separada por línea vertical)**, en este orden:
  1. **Bruto estimado** — el elegido al cargar CAMIONES (45.000 / 52.500 / 55.000)
  2. **Tara final** — ej. 15.600
  3. **Bruto lote** — **vacío / punteado** cuando se imprime en tara final
  4. **Bruto regulado** — vacío / punteado
  5. **NETO** — recuadro con borde superior 1,5 px negro, valor punteado
  6. Línea de firma: "FIRMA CHOFER"

Los renglones punteados (`1px dotted #a8a49b`) son para completar a mano lo que
todavía no está: al momento de la tara final faltan grano/lote, CP, bruto lote,
bruto regulado y neto.

**Numeración**:
- **Un solo ticket por camión: el original.** No hay copia ni duplicado.
- Se numera **al crearse** (en CAMIONES) y el **mismo número** viaja por TARA
  FINAL y REGULADA.
- Los tickets de la app arrancan en **`1-0001`** para no pisar los ya cargados
  desde la web.
- **El número lo da la base de datos, no el teléfono** (contador atómico en Mongo
  o índice único). Esto es crítico porque la app funciona sin conexión.
- Un ticket **anulado quema su número**: no se reutiliza nunca.

### 7. Anular un registro — ref. `6d`, `6e`, `6f`

**Regla que se mantiene del sistema actual**: solo el usuario GENERAL (código de
observación `12341`) puede anular. El balancero no.

Flujo completo:

1. **GENERAL está en el patio** (`6d`): el balancero toca "Anular", se abre un
   modal que pide el **código GENERAL** con el mismo teclado del ingreso. Botón
   rojo `#8f2f22` "Anular registro". Queda asentado quién anuló y cuándo. El
   ticket **no desaparece**: se marca `ANULADO` en los registros y su número no
   se vuelve a usar.
2. **GENERAL no está** (`6e`): pasa a **"Pedir anulación"**, con **motivo escrito
   obligatorio** (textarea). Botón "Enviar pedido a GENERAL".
3. **GENERAL recibe** (`6f`): aviso en el teléfono + lista de "Pedidos de
   anulación" con patente, número, balanza, motivo textual, quién y cuándo, y dos
   botones: **Anular** (rojo) / **Rechazar**. Queda constancia de quién decidió.
   Rechazado vuelve al balancero con el ticket vigente y el motivo a la vista.
4. Mientras el pedido está pendiente, el ticket **sigue vigente y sigue contando
   en el resumen**. Chips: `ANULACIÓN PEDIDA` y, si no se envió, `SIN ENVIAR`.
5. **Sin conexión NO se puede pedir la anulación.** El botón se muestra
   **apagado** (fondo `#f4f2ed`, texto `#a8a49b`) con el motivo escrito debajo:
   "necesita internet". No se esconde el botón.

### 8. Corregir un dato — ref. `7d`

- Pesos y datos del viaje quedan **fijos** una vez guardados: se muestran con un
  chip 🔒 "fijo" (`#a8a49b` sobre `#f4f2ed`).
- Lo único que el balancero edita después son las **observaciones / comentarios**
  (ya existe `editar-comentarios` en el backend, con su límite de 2
  modificaciones y ventana de 1 día — respetarlo).
- Cualquier otra corrección se **pide a GENERAL**: botón con borde negro "Pedir
  corrección a GENERAL". Mismo mecanismo que el pedido de anulación. Queda
  registrado quién pidió y quién corrigió.
- **No poner textos explicativos en la pantalla**: la interfaz muestra el candado
  y el botón, sin párrafos de ayuda.

### 9. Sin conexión — ref. `7a`

- **Se puede**: cargar CAMIONES, TARA FINAL y REGULADA; imprimir / generar el
  PDF del ticket; ver el día en curso.
- **No se puede**: pedir anulación ni pedir corrección (necesitan avisar a
  GENERAL), y ver registros históricos que no estén descargados.
- Encabezado muestra "SIN SEÑAL" (`#8f5514`).
- Franja ámbar: "3 pesadas guardadas en el teléfono / Seguí cargando normal. Se
  suben solas cuando vuelva internet."
- Chip `SIN SUBIR` en cada tarjeta pendiente.
- **Ni bien vuelve la conexión se sincroniza solo**, sin que el usuario haga
  nada, y aparece confirmación verde: "Volvió internet — 3 pesadas subidas".
  El chip `SIN SUBIR` desaparece solo.
- Implementación sugerida: cola local (IndexedDB) + service worker con
  background sync; cada pesada con un id local propio (idempotencia: reenviar la
  misma pesada no debe duplicarla).

### 10. Aviso de camión repetido — ref. `7b`

- Al cargar una patente que **ya se registró hoy en otra balanza**, modal:
  "CAMIÓN REPETIDO HOY / AC 884 TF ya se cargó hoy en La Pradera / Ticket 1-0044,
  a las 07:20, por M. Rivero. Fijate que no sea el mismo viaje cargado dos veces."
- Botones: "Ver el otro ticket" (borde) y "Es otro viaje, seguir" (negro).
  **No bloquea la carga** — puede ser un segundo viaje real.
- El mismo aviso le llega a GENERAL.
- **Si en ese momento no había señal** no se puede detectar: no sale aviso, y la
  coincidencia aparece después en el **resumen del día de GENERAL**, marcada para
  revisar.

### 11. Camiones sin regular — ref. `7c`

- Franja ámbar arriba del Patio: "2 camiones sin regular / quedaron de ayer ·
  1-0001 · 1-0002" con botón "Ver".
- Chip `SIN REGULAR DE AYER` en cada tarjeta.
- El camión **no se archiva** hasta que se carga la REGULADA.

### 12. Resumen del día — GENERAL — ref. `8a` (elegido)

Orden vertical exacto:

1. Encabezado: "GENERAL · TODAS LAS BALANZAS" / "Hoy, lunes 27".
2. Dos KPIs lado a lado: **NETO DEL DÍA** (312.480 · "kg · 11 camiones") y
   **EN CURSO** (4 · "sin cerrar ahora"). Valor en 26 px mono.
3. Bloque ámbar **"Para revisar · 3"**, una línea por tema con botón "Ver":
   pedidos de anulación, camiones repetidos en dos balanzas, sin regular de ayer.
   **Este bloque desaparece cuando está limpio.**
4. **Por balanza**: nombre + "nombre del día · N camiones" + neto (16 px mono).
   **Tocable** → abre el detalle (`8c`).
5. **Por grano**: cada grano con su total (16 px mono) y debajo, indentados con
   borde izquierdo `2px #eeece6`, los **lotes** con sus kilos y cantidad de
   camiones. Cuando el grano tiene un solo lote, el lote va como línea gris sin
   repetir el kilaje.

GENERAL **no carga nada**: solo mira, autoriza anulaciones y corrige.

### 13. Detalle de una balanza — ref. `8c`

- Se abre tocando la balanza en `8a`. Encabezado: "‹ Hoy, lunes 27" / nombre de
  la balanza / "nombre del día · N camiones" / neto total a la derecha.
- Lista de tarjetas, una por camión: patente (16 px mono), transporte · chofer,
  grano · lote, y a la derecha el **neto** (17 px mono) con la etiqueta "NETO".
- Los que **faltan regular** llevan chip ámbar `SIN REGULAR` y **no suman al
  total**.
  > **Cambió en el uso.** Un chip único mezclaba dos estados: al camión que
  > todavía no volvió a pesar vacío le falta la **tara final**, no la regulada.
  > Lo implementado usa `FALTA TARA FINAL` / `FALTA REGULADA` y agrega arriba la
  > cuenta de cada uno. Ver *"Falta la tara final o falta la regulada"* en
  > `APP_MOVIL.md`.

### 14. Acumulado (opcional) — ref. `8b`

Vista de campaña: neto acumulado en tarjeta negra, selector Campaña / Mes /
Semana / Hoy, totales por lote (con barra de proporción), por transporte, y botón
"Descargar planilla". **No fue la elegida como resumen principal** (se eligió
`8a`); dejarla para una segunda etapa.

---

## Permisos (resumen)

| Acción | Balancero | GENERAL |
| --- | --- | --- |
| Registrar CAMIONES / TARA FINAL / REGULADA | Sí | Sí |
| Imprimir el ticket | Sí | Sí |
| Editar observaciones / comentarios | Sí (con el límite actual) | Sí |
| Ver registros de sus balanzas | Sí | Todas |
| Corregir pesos o datos del viaje | No — los pide | Sí |
| Anular un registro | No — lo pide | Sí |
| Ver resumen de todas las balanzas | No | Sí |

---

## Comportamiento e interacciones

- **Navegación**: Patio como raíz. Cada tarjeta lleva al paso que falta. Volver
  siempre con "‹" arriba a la izquierda, nunca solo con el gesto del sistema.
- **Áreas táctiles**: mínimo 44 px; los botones principales, 54-60 px.
- **Modales**: hoja inferior con radio 22 px, fondo `rgba(27,26,23,.42)` detrás.
- **Estados de carga**: al guardar sin conexión, confirmar de inmediato en local
  (no dejar spinner esperando al servidor).
- **Errores**: mensaje en criollo, en la misma pantalla, sin tecnicismos.
- Nada de animaciones decorativas: la app se usa a la intemperie y apurado.

## Estado a manejar

- Balanza activa (del código ingresado) y nombre del día.
- Lista de camiones abiertos, con el paso que falta.
- Cola de pesadas sin subir + estado de conexión.
- Tickets sin imprimir (persistente entre sesiones).
- Pedidos de anulación / corrección pendientes y su estado.
- Último número de ticket **siempre del servidor**.

## Tokens

**Colores**

| Uso | Hex |
| --- | --- |
| Fondo de pantalla | `#f8f7f4` |
| Tinta / botón principal | `#1b1a17` |
| Texto secundario | `#5f5c55` |
| Texto terciario | `#7a776e` |
| Etiquetas mono | `#8f8b82` |
| Borde de tarjeta | `#e4e1da` |
| Borde fuerte / divisor | `#dcd9d2` |
| Divisor suave | `#eeece6` |
| Superficie gris | `#f4f2ed` |
| Punteado del ticket | `#a8a49b` |
| Aviso — fondo | `#fbf1e2` |
| Aviso — borde | `#e8d4b4` |
| Aviso — texto | `#7a5514` / `#8f5514` |
| OK — fondo / borde / texto | `#e7efe9` / `#c6dccd` / `#1f5c3d` |
| Destructivo | `#8f2f22` |

**Tipografía**

- Texto: `'Helvetica Neue', Helvetica, Arial, sans-serif`.
- Números, patentes, códigos, etiquetas: `ui-monospace, Menlo, monospace`.
- Escala usada: 34 px título de sección · 24-25 px título de pantalla ·
  19-22 px dato destacado · 15-17 px cuerpo fuerte · 13-14 px cuerpo ·
  11-12 px auxiliar · 8-9 px etiqueta mono (letter-spacing .1-.12em, mayúsculas).

**Radios**: 34 px marco del teléfono · 22 px modal · 16 px tarjeta ·
14-15 px botón · 999 px chip.

**Sombras**: `0 18px 40px -24px rgba(27,26,23,.45)` (elevación de pantalla) ·
`0 20px 44px -20px rgba(27,26,23,.5)` (modal).

**Espaciado**: 20 px márgenes laterales de pantalla · 12-13 px entre tarjetas ·
9-11 px interno de tarjeta.

## Assets

Ninguno. El diseño no usa imágenes ni íconos externos; los pocos glifos
(`✓ ✕ ‹ 🔒 ＋ ⌫`) son caracteres de texto. Si se quiere un logo en el ticket, hay
que pedírselo al usuario.

## Instalación en los teléfonos

Se acordó: pasar el **link por WhatsApp** y que cada uno lo abra y elija
"Agregar a inicio". Hay teléfonos Android nuevos y viejos, y también iPhone.

- Android/Chrome muestra el cartel de instalación solo si hay `manifest.json` +
  service worker + HTTPS (Render ya da HTTPS).
- iOS/Safari **no** muestra cartel: hay que hacerlo desde el botón Compartir →
  "Agregar a pantalla de inicio". Conviene preparar un instructivo corto de dos
  capturas para mandar junto al link.
- Soportar Android viejos: nada de sintaxis JS moderna sin transpilar, y probar
  en un WebView antiguo.

## Archivos de este paquete

- `Pesada de Balanza.dc.html` — todas las pantallas maquetadas, por turnos
  (`8a`, `8c`, `7a`-`7d`, `6a`-`6f`, `5a`-`5f`, y turnos anteriores con el
  historial de exploración). **Es la referencia visual principal.** Abrir en el
  navegador.
- `support.js` — runtime necesario para que ese HTML se vea. No es parte del
  producto; no copiarlo al proyecto.

## Repositorio de destino

- `repo: pesada-balanza/pesada-balanza-backend`, rama base `main`.
- Stack: Node + Express 
 + EJS (`express-ejs-layouts`) + Mongoose/MongoDB Atlas +
  Bootstrap 5 local en `public/`, sesión en Mongo, `node-cron` para el mail de
  las 19hs, `exceljs` para los reportes.
- Archivos clave a leer antes de empezar: `app.js` (rutas, códigos, tabla
  `campoUsuario`, anulación restringida a GENERAL, generación de Excel),
  `notificaciones.js`, `views/registro.ejs`, `views/tabla.ejs`,
  `views/confirmar-tara-final.ejs`, `views/confirmar-regulada.ejs`,
  `views/editar-comentarios.ejs`, `RESUMEN_PARA_CONTINUAR.md`.

## Orden sugerido de implementación

1. Rama `app-movil` + esqueleto de la PWA en `/app` (manifest, service worker,
   layout móvil) detrás de flag de entorno.
2. Ingreso por código + nombre del día + sesión persistente.
3. Patio y los tres formularios, escribiendo en las colecciones existentes, con
   numeración `1-0001` desde el servidor.
4. Ticket PDF 19 × 4,5 cm + recordatorio de impresión y pendientes.
5. Cola sin conexión y sincronización automática.
6. Pedidos de anulación y corrección + bandeja de GENERAL.
7. Avisos: camión repetido, sin regular de ayer.
8. Resumen del día de GENERAL (`8a`) y detalle por balanza (`8c`).

## Sobre el usuario

Matías no programa. Explicarle todo en criollo, sin tecnicismos, y avisarle qué se
va a subir antes de subirlo.
