# App móvil "Pesada de Balanza"

App instalable en el teléfono para los balanceros, más un resumen del día para
GENERAL. Vive entera bajo `/app` y **no toca la web actual**.

Diseño de referencia: `design_handoff_app_movil_balanza/`.

---

## Cómo se prende y se apaga

La app está detrás de una variable de entorno. Es una llave de luz:

| `APP_MOVIL` | Qué pasa |
| --- | --- |
| sin definir, o cualquier otro valor | La app **no existe**: todo `/app` da 404 y la web funciona exactamente como hoy. |
| `1` | La app queda disponible en `https://<el-dominio>/app` |

En Render: **Environment → Add Environment Variable** → `APP_MOVIL` = `1`.
Se prende y se apaga sin volver a subir código.

---

## Cómo se instala en los teléfonos

Se manda el link `https://<el-dominio>/app` por WhatsApp y cada uno lo agrega a
la pantalla de inicio.

- **Android / Chrome**: al abrir el link aparece solo el cartel "Instalar app" o
  "Agregar a pantalla de inicio". Si no aparece, está en el menú de tres puntos.
- **iPhone / Safari**: no hay cartel. Hay que ir al botón **Compartir** (el
  cuadradito con la flecha para arriba) → **Agregar a pantalla de inicio**.

Una vez agregada, abre como una app: sin barra del navegador.

---

## Cómo se usa

1. **Ingreso**: se pone el código de la balanza una sola vez. Queda abierta en
   ese teléfono (30 días, y se renueva cada vez que se usa).
2. **Nombre del día**: la primera vez de cada día pide el nombre de quien está
   en la balanza. Ese nombre queda en todos los tickets de ese día y es lo que
   aparece en la columna **Usuario** de Ver Registros.
3. **Patio**: los camiones en curso, cada uno con un botón grande con el paso
   que falta. Abajo, "＋ Nueva pesada".
4. Los tres pasos siguen siendo los mismos: **CAMIONES → TARA FINAL → REGULADA**.
   El **campo** elegido en Camiones se ve en las tres pantallas, y en la
   **regulada se puede corregir** con el botón "Cambiar" (la web también lo
   permite). Al cambiarlo hay que elegir de nuevo el grano y el lote, porque los
   del campo anterior ya no corresponden.
5. Al guardar la **tara final** aparece el recordatorio para imprimir el ticket
   del chofer. Si se elige "Más tarde", queda avisado en el patio hasta que se
   imprima.

**GENERAL** entra con el código `12341` y ve el resumen del día de todas las
balanzas, autoriza las anulaciones y corrige. Con ese código **no se cargan
pesadas**: las pesadas se cargan con el código de la balanza, que es lo que
define de quién es cada ticket. En el resumen hay un botón que lleva derecho a
poner el código de una balanza.

### Salir o cambiar de código

Arriba a la derecha de todas las pantallas hay un botón **Salir**. Abre un menú
con dos opciones, y nada más:

- **Balanza y turno** — ahí adentro está todo junto: cambiar de balanza (poniendo
  el código de la otra) y cambiar quién está en la balanza hoy.
- **Salir de la app** — cierra la sesión y vuelve a pedir el código.

Al cambiar de código o al salir, la app **tira las pantallas que tenía
guardadas**: son de la sesión anterior y sin señal mostrarían el patio de otra
balanza. Las pesadas sin subir no se tocan.

Poner un código **necesita internet una vez**: el código se revisa en el
servidor. Si no hay señal la pantalla lo dice, y el número escrito no se pierde.

Si quedaron pesadas sin subir, la app avisa y no deja cambiar de código hasta
que se suban: si no, se perderían.

---

## El ticket del chofer

- Mide **19 × 4,5 cm**, sobre hoja **A4 vertical** con 1 cm de margen.
- Entran **6 tickets por hoja**, pegados: la línea punteada que cierra uno es la
  que abre el siguiente.
- Lo normal es imprimir de uno. Si quedaron varios pendientes, se agrupan.
- Al imprimir, elegir **A4**, **tamaño real (100 %)** y sin márgenes agregados
  por la impresora, para que la medida salga exacta.
- Los renglones punteados son para completar a mano lo que todavía no está.
- El número del ticket **no es el código de la balanza** y el código no se
  imprime nunca.

### Compartir el PDF

Cuando el ticket ya tiene la **regulada** cargada, en el detalle aparece
**"Compartir el PDF"**. Se toca y se abre el menú de compartir del teléfono
(WhatsApp, mail, lo que tenga). El archivo es del tamaño exacto del ticket,
19 × 4,5 cm, y pesa unos 3 KB.

Antes de la regulada el botón no aparece: en ese momento el ticket todavía no
tiene todos los pesos, y lo que corresponde es imprimirlo en papel para el
chofer. Si alguien entra a la dirección del PDF antes de tiempo, la app lo
explica en vez de dar un archivo a medias.

En las computadoras y en los teléfonos que no saben compartir archivos, el
botón descarga el PDF y se comparte a mano desde los archivos. Sin señal queda
apagado con el motivo, como los demás.

El PDF se genera sin ninguna librería: el ticket es solo texto y líneas, así
que `app-movil-pdf.js` lo escribe directo, con las fuentes que todo lector de
PDF ya trae. Por eso `package.json` sigue sin cambiar.

---

## Sin señal

Se puede cerrar **el ticket completo**: CAMIONES, TARA FINAL y REGULADA, más
imprimir el ticket del chofer y ver el día en curso. Todo queda guardado en el
teléfono con el chip `SIN SUBIR` y **se sube solo** cuando vuelve internet, sin
que nadie haga nada.

Funciona en los dos casos:

- **Un camión que se cargó sin señal.** El teléfono no conoce todavía el número
  interno que le va a poner la base, así que la tara final y la regulada quedan
  apuntando al camión por su identificador local. Cuando la cola se sube, va
  primero la pesada y después sus pasos, en orden, sobre el mismo ticket.
- **Un camión que se cargó con señal más temprano** y ahora no hay conexión. Sus
  datos salen de la última foto del patio que guardó el teléfono.

En los dos casos el botón del paso que falta lleva a la pantalla `/app/local`,
que el teléfono dibuja solo con lo que tiene guardado. Al volver la señal, la
pantalla normal vuelve sola.

Para que esto ande, la app deja preparado en el teléfono (cuando hay señal):
números de ticket reservados, la lista de campos con su siembra y contratistas,
y las pantallas que va a necesitar. Se hace de fondo, sin que nadie lo pida.

No se puede: pedir una anulación o una corrección (hay que avisarle a GENERAL),
ni entrar con otro código. Los botones se muestran apagados con el motivo
"necesita internet" debajo.

Y si se llega a una pantalla que **sí** necesita servidor (el detalle de un
ticket viejo, la bandeja de GENERAL), la app lo dice con un cartel. Nunca deja un
botón que parece no hacer nada.

**Numeración**: el número lo da siempre la base de datos, nunca el teléfono.
Para poder trabajar sin señal, el teléfono pide de antemano unos números
reservados y los va usando. Un número reservado que no se usa queda quemado: no
se reasigna. Igual que un ticket anulado.

### El aviso de pesadas sin subir

Va **arriba de todas las pantallas** y con **cualquier código** — el de una
balanza o el de mirar —, coincida o no el nombre del balancero. Dice cuántas hay
y de cuándo son:

| Cuándo | Cómo se ve |
| --- | --- |
| del día | franja ámbar: "se suben solas cuando vuelva internet" |
| de ayer | franja ámbar, diciendo de cuándo quedaron |
| **2 días o más** | **franja roja**: "buscá señal hoy" |

Es lo único que la app no puede recuperar sola: si el teléfono se rompe o se
cambia de código, eso se pierde. Por eso el aviso no se puede pasar por alto y no
depende de quién esté mirando el teléfono.

---

### Actualizar la app NO borra lo que quedó pendiente

Son dos cosas distintas y se guardan en dos lugares distintos:

| | Dónde vive | Qué pasa al actualizar |
| --- | --- | --- |
| Las pesadas sin subir, los números reservados, los datos para imprimir y las tablas de campos | en la memoria del teléfono (`localStorage`) | **no se toca nada** |
| Las pantallas, el CSS y el JS | en la copia del service worker | se reemplazan por los nuevos |

O sea: si el balancero cargó tres pesadas sin señal y mientras tanto se subió una
versión nueva de la app, las tres siguen ahí con su mismo número y se suben igual
cuando vuelve internet. La actualización cambia la app, no los datos.

Además, si la actualización se baja a medias (media señal en el campo), **falla a
propósito** y el teléfono se queda con la versión anterior, que funciona. Nunca
se borra la copia vieja antes de comprobar que la nueva está completa.

Esto está probado a propósito en `pruebas/probar-liviana.js`: se carga una pesada
sin señal, se borra **todo** lo guardado de pantallas (el peor caso posible) y se
comprueba que la pesada siga entera, con su número, y que se suba al volver
internet.

### Y cuando vuelve la señal, sí se limpia

Lo que se borra es lo que ya no hace falta, no la actualización:

- **La pesada de la cola**: se borra en el momento en que el servidor la acepta.
  Si el servidor la rechaza por un motivo real (dato inválido, ticket vencido)
  también sale de la cola y la app avisa que hay que cargarla de nuevo.
- **La copia del ticket para imprimir**: cuando la pesada se sube, la copia que
  estaba guardada con el identificador local se reemplaza por una sola con el id
  de la base. Antes quedaban las dos.
- **Los tickets viejos**: al abrir la app se tiran los de más de 7 días (el ticket
  vence a los 5) y se guardan como máximo 30. Los de pesadas que todavía no se
  subieron **nunca** se tocan, pasen los días que pasen.

O sea que el teléfono no va juntando cosas para siempre.

---

## Cuánto pesa

Pensada para teléfonos de gama media y señal mala. Todo lo que manda la app viaja
comprimido (con el `zlib` que ya trae Node, sin agregar ninguna librería):

| | Por la red |
| --- | --- |
| Primera vez (todo: pantallas + CSS + JS + tablas) | **~48 KB** |
| Después, abrir una pantalla | 2 a 6 KB |
| La pantalla más pesada (regulada) | 5,6 KB |
| Sin señal | 0 KB (se dibuja con lo guardado) |

Para comparar: una sola foto de celular pesa 20 veces más que la app entera.

Las **sugerencias** para autocompletar (patentes, choferes, transportes) salen de
los **últimos 300 tickets**, que son más o menos los últimos 10 a 12 días de
trabajo. Es un autocompletado, no un padrón: lo que sirve es lo que está entrando
estos días. Un camión que no vino en dos semanas se escribe a mano una vez y
vuelve solo a la lista.

La compresión aplica **solo a `/app`**: la web sigue exactamente como estaba.
`pruebas/probar-liviana.js` le pone un tope de peso a cada pantalla, así que si
alguna se agranda de más, la prueba lo avisa antes de subirlo.

---

## Cómo está aislada de la web

- Todo el código de la app está en `app-movil.js`, `app-movil-pdf.js`,
  `views/app/` y `app-movil-estaticos/`. Ningún archivo de la web se modificó.
- En `app.js` hay **un solo bloque** que engancha la app, y solo si
  `APP_MOVIL=1`.
- Los estáticos de la app viven en `app-movil-estaticos/` y **no** en `public/`,
  a propósito: así el `express.static` de la web no los sirve y todo queda
  detrás de la llave.
- La app no usa Bootstrap ni el layout de la web: tiene su propio CSS.
- No agrega ninguna librería nueva: `package.json` no cambió.

### Cómo saber si un teléfono está al día

En **Balanza y turno**, abajo, hay un bloque **"Versión de la app"** que muestra
dos cosas: la versión que tiene guardada **ese teléfono** y la que está sirviendo
el **servidor**. Si no coinciden, aparece el botón **"Actualizar la app"**, que
baja la versión nueva y recarga. No se pierde nada de lo cargado: las pesadas sin
subir viven aparte.

Sirve para no adivinar. Después de un deploy, en vez de suponer que el teléfono
se actualizó, se entra ahí y se ve.

Un teléfono con una versión anterior a la v5 no sabe contestar qué versión tiene:
en ese caso el bloque dice "una versión vieja" y ofrece actualizar igual.

También se puede ver desde cualquier navegador, abriendo
`https://<el-dominio>/app/sw.js`: en las primeras líneas está el
`VERSION = 'pesada-app-vN'` que sirve el servidor en este momento.

**Al subir cambios de la app**, hay que subir el número de versión que está
arriba de `app-movil-estaticos/sw.js` (`pesada-app-v5`, `v6`, …). Eso hace que
los teléfonos descarten las **pantallas** que tenían guardadas y tomen las
nuevas. Las pesadas pendientes y los números reservados no se tocan (ver
"Actualizar la app NO borra lo que quedó pendiente", más arriba).

### De quién es cada ticket

El `codigoIngreso` del registro es lo que define en qué tabla aparece el ticket y
en qué balanza se puede seguir cargando. La app lo asigna así:

| Con qué código se carga CAMIONES | De quién queda el ticket |
| --- | --- |
| el de una **balanza** (5679, 5680, …) | de **esa balanza**, sin importar qué campo se eligió |
| el **general de carga** (56781) | de la balanza que le corresponde al campo (planilla de siembra) |

Un campo mal elegido se corrige en la regulada, y el ticket **no cambia de
dueño**. Lo que no puede pasar es que el ticket salte a otra tabla y el balancero
que lo cargó lo pierda de vista.

> **Ojo, acá la app es distinta de la web.** En la web (`app.js`, `/guardar-tara`)
> el campo manda siempre: un ticket tipeado en 5683 con un campo de 5679 queda de
> 5679. Y la lista "Patentes con TARA pendiente" de la web **no filtra por
> código**, así que cualquier balanza ve y puede cerrar la tara final de otra.
> En la app cada balanza ve y cierra **solo lo suyo**, en los tres pasos.

### Cuando el balancero pide una anulación o una corrección

Los accesos a "Pedir corrección a GENERAL" y "Pedir anulación a GENERAL" son
**enlaces comunes**, no botones con JavaScript. Antes eran
`<button onclick="location.href=…">` —los únicos tres lugares de la app que
dependían de un `onclick` escrito en el HTML— y en algún teléfono el toque no
hacía nada. Un enlace lo abre el navegador solo, sin que tenga que correr ningún
script. Si no hay señal, quien avisa es la pantalla del pedido.


El balancero escribe el motivo (obligatorio) y GENERAL lo ve por **dos caminos
distintos**, que existen los dos:

1. **En la app** — le aparece en **"Para revisar"**, arriba de la pantalla de
   inicio de GENERAL, y desde ahí entra a la bandeja de pedidos, lee el motivo y
   decide. Es el camino principal: no depende del email.
2. **Por email** — a la misma casilla que ya recibe los avisos de TARA FINAL y
   REGULADA (`EMAIL_TO`). Sirve para enterarse sin tener la app abierta.

El aviso dice si es una **anulación** o una **corrección** (antes cualquier
pedido se anunciaba como "de anulación"), y el email lleva el **motivo escrito**,
quién lo pidió y de qué balanza es. Sin eso GENERAL no tiene con qué decidir.

### Los datos

Los tickets se guardan en la **misma colección `registros`**, con los mismos
nombres de campo que usa la web. Por eso aparecen solos en **Ver Registros**, en
el **Excel** y en el **mail de las 19 hs**, sin ningún cambio en ese código.

Campos que la app **agrega** al registro (opcionales; la web los ignora):

| Campo | Para qué |
| --- | --- |
| `origen: 'app'` | marca que se cargó desde el teléfono |
| `nroApp` | el número que se imprime en el ticket (`1-0001`) |
| `cargadoPor` | el nombre del día |
| `appImpreso` | si el ticket ya se imprimió |
| `appLocalId` | id que trajo el teléfono, para no duplicar al sincronizar |
| `appTaraFinalPor` / `appReguladaPor` | quién cargó cada paso |

Colecciones **nuevas**, propias de la app (la web no las mira):

| Colección | Qué guarda |
| --- | --- |
| `app_dias` | el nombre de quien está en cada balanza, por día |
| `app_pedidos` | pedidos de anulación y de corrección, y qué decidió GENERAL |
| `app_contadores` | el contador de la numeración `1-0001` |
| `app_numeros` | números reservados y usados |
| `app_localids` | ids locales ya procesados (para no duplicar pesadas) |

Las anulaciones y las ediciones de observaciones se registran en
`registros_auditoria`, la misma colección que ya usa la web.

---

## El acumulado de campaña en el mail de las 19 hs

El Excel que llega todos los días a las 19 hs tiene una **hoja más**:
**"Acumulado campaña"**. Las hojas de siempre (Registros, IMPRIMIR, Cargas SOCIO)
no se tocaron.

Muestra cuántos kilos salieron de cada lote **desde que arrancó la campaña**:

```
ACUMULADO DE CAMPAÑA 25/26
Del 2025-09-01 al 2026-07-31
9 tickets con regulada cerrada          TOTAL (toneladas)   296,660

Campo                          Lote             Grano  Tickets  Neto (kg)  Neto (t)
Charata - CHARATA - CH         Lote 3 Charata   MAIZ         2      62.320    62,320
El Mataco - SACHAYOJ - SE      Lote 1           SOJA         2      62.040    62,040
El Mataco - SACHAYOJ - SE      Lote 2           SOJA         1      36.800    36,800
Panuncio - ARBOL BLANCO - SE   Lote 3 + Lote 4  SOJA         1      37.720    37,720
TOTAL                                                        9     296.660   296,660

Por grano                                    Tickets  Neto (kg)  Neto (t)
SOJA                                               6     203.560   203,560
MAIZ                                               3      93.100    93,100
```

El total también va en el **cuerpo del mail**, para verlo sin abrir el adjunto.

### Qué cuenta y qué no

- **Solo tickets con la regulada cerrada.** Son los únicos que tienen el neto real
  pesado. Un camión que todavía está en CAMIONES o TARA FINAL no suma: sumaría un
  estimado, no un peso.
- **Los anulados quedan afuera.**
- **Una carga de varios lotes NO se reparte.** Si un ticket trae "Lote 3" y
  "Lote 4", el neto no se divide entre los dos (sería inventar un número): figura
  junto como `Lote 3 + Lote 4`, y así se ve que fue una carga mezclada.

### Desde cuándo cuenta

La campaña agrícola no coincide con el año calendario, así que el corte es el
**1 de septiembre**: la campaña 25/26 va del 1-9-2025 al 31-8-2026. Se puede fijar
a mano con la variable de entorno `CAMPANA_DESDE` (formato `2025-09-01`), por
ejemplo si se quiere arrancar el acumulado en otra fecha.

### Si el acumulado falla, el reporte sale igual

La hoja se arma al final y dentro de su propio `try/catch`. Si algo fallara
(una consulta, un dato raro), se anota el motivo en el log del servidor y **el
mail se manda igual con las hojas de siempre**. El reporte diario es lo que no se
puede perder; el acumulado es información agregada.

Está probado a propósito: `pruebas/probar-reporte-email.js` rompe el acumulado y
verifica que el Excel llegue completo sin esa hoja.

### Reglas del sistema actual que se respetan tal cual

- Solo **GENERAL** (`12341`) puede anular, y **desde su propia sesión**. El
  balancero toca "Pedir anulación a GENERAL" y escribe el motivo; GENERAL la
  resuelve desde su pantalla. En la balanza no hay ningún botón para anular ni
  ningún lugar donde tipear el código de GENERAL: ese código no tiene que
  circular por las balanzas. Los pedidos necesitan internet: sin señal el
  botón se muestra apagado con el motivo debajo.
- Un ticket anulado **no se borra**: se marca `anulado` y su número no se reusa.
- Las observaciones se editan hasta **2 veces** y hasta **1 día** después de la
  regulada.
- El ticket de CAMIONES sirve **1 día** para la tara final; el de tara final,
  **5 días** para la regulada.
- La balanza del ticket la define el **campo** elegido (tabla `campoUsuario`).
- La regulada la carga **el mismo operador** que cargó la tara final.
- Rate limiting en el ingreso: 10 intentos cada 15 minutos por IP.

---

## Direcciones

**Balancero**

| Dirección | Pantalla |
| --- | --- |
| `/app/ingreso` | ingreso por código |
| `/app/dia` | nombre del día |
| `/app/patio` | patio (pantalla principal) |
| `/app/nueva-pesada` | CAMIONES |
| `/app/tara-final/:id` | tara final |
| `/app/regulada/:id` | regulada |
| `/app/registro/:id` | detalle del ticket |
| `/app/pedir/:id?tipo=anulacion\|correccion` | pedido a GENERAL |
| `/app/imprimir?ids=…` | hoja de impresión del ticket |
| `/app/ticket-pdf/:id` | PDF del ticket (solo con la regulada cargada) |
| `/app/local?paso=…` | seguir un ticket sin señal (la dibuja el teléfono) |
| `/app/balanza` | balanza y turno · salir |

**GENERAL**

| Dirección | Pantalla |
| --- | --- |
| `/app/general` | resumen del día |
| `/app/general/balanza/:codigo` | detalle de una balanza |
| `/app/general/pedidos` | pedidos de anulación y corrección |
| `/app/general/repetidos` | camiones repetidos en dos balanzas |
| `/app/general/sin-regular` | camiones que quedaron sin regular |

---

## Si algo sale mal

1. Poner `APP_MOVIL` en `0` en Render. La app desaparece y la web sigue igual.
2. Nada de lo cargado se pierde: los tickets están en `registros`, junto con los
   de la web.
3. Si un teléfono tiene pesadas sin subir, **no borrar la app ni los datos del
   navegador**: conectarlo a internet y esperar a que suban solas. La pantalla
   "Balanza y turno" avisa si quedan pendientes antes de dejar salir.

## Segunda etapa (queda pendiente del handoff)

- Vista de **Acumulado** de campaña (`8b` del diseño). Se eligió `8a` como
  resumen principal. La idea es no hacer una pantalla nueva sino agregarle una
  hoja al Excel que ya sale por mail, con el acumulado por lote, por grano y por
  transporte.
