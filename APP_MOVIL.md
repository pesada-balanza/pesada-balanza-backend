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

Arriba a la derecha de todas las pantallas hay un botón **Salir**, y hace **una
sola cosa**: pregunta y sale. Antes abría una hoja intermedia con dos opciones
—"Balanza y turno" y "Salir de la app"— y la opción de salir terminaba estando en
tres lugares distintos, con un botón que decía "Salir" y no salía.

**"Balanza y turno" ya no existe** (`/app/balanza` redirige al patio o al
resumen). Se sacó porque casi todo lo que tenía adentro estaba duplicado:

| Lo que tenía | Dónde está ahora |
| --- | --- |
| Cambiar de balanza | es **salir** y poner el otro código: el mismo botón con otro nombre |
| Cambiar quién está en la balanza | en el **patio**, tocando el nombre de arriba a la izquierda |
| Buscar un ticket | en el patio, el resumen y la lista de una balanza |
| Resumen y pedidos (GENERAL) | el resumen es su pantalla de inicio, y ahí está el botón de **Pedidos** |
| Lista de "puede hacer" | se sacó: era informativa, se leía una vez |
| **Versión de la app** | al final del **patio** y del **resumen** (ver más abajo) |

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

Al final del **patio** y del **resumen del día** hay un bloque
**"Versión de la app"** que muestra dos cosas: la versión que tiene guardada **ese
teléfono** y la que está sirviendo el **servidor**. Si no coinciden, aparece el
botón **"Actualizar la app"**, que baja la versión nueva y recarga. No se pierde
nada de lo cargado: las pesadas sin subir viven aparte.

En el **patio** el bloque va en modo discreto: ahí se trabaja todo el día, así que
**solo aparece si hay algo que hacer** —el teléfono quedó atrasado, o todavía no
guardó la app y por lo tanto no va a abrir sin señal—. Si está al día no se ve. En
el resumen se ve siempre.

Sirve para no adivinar. Después de un deploy, en vez de suponer que el teléfono
se actualizó, se abre el patio y, si hace falta actualizar, lo dice solo.

Un teléfono con una versión anterior a la v5 no sabe contestar qué versión tiene:
en ese caso el bloque dice "una versión vieja" y ofrece actualizar igual.

También se puede ver desde cualquier navegador, abriendo
`https://<el-dominio>/app/sw.js`: en las primeras líneas está el
`VERSION = 'pesada-app-vN'` que sirve el servidor en este momento.

**Al subir cambios de la app**, hay que subir el número de versión que está
arriba de `app-movil-estaticos/sw.js` (`pesada-app-v6`, `v7`, …). Eso hace que
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
2. **Por email** — solo si los avisos por evento están prendidos, que **hoy no lo
   están** (ver más abajo). Con los avisos apagados, el camino es el de la app.

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

## El CTG

El CTG (Código de Trazabilidad de Granos) se guarda en el campo **`cp`**, el
mismo de la web, y sale en la columna CP del Excel y en el renglón "CP / CTG" del
ticket impreso.

Es un paso **posterior a la regulada**: el número viene con la carta de porte, que
se emite cuando el camión sale. Al pesar todavía no existe, así que el ticket se
cierra sin él y el CTG se carga después.

### Cómo se llega

Cuando se cierra la regulada el camión **sale del patio**, así que sin un aviso el
paso no existiría: nadie se acuerda y no habría cómo llegar al ticket. Hay tres
accesos:

1. **En el patio**, un aviso "**N tickets sin CTG**" con los números y un botón
   "Cargar". Desaparece solo cuando no queda ninguno.
2. **En el ticket**, el renglón "CP / CTG" se ve vacío con un "Cargar" al lado, y
   además hay un botón grande **"Cargar el CTG"**.
3. **La pantalla `/app/ctg`**, con la lista de los que esperan: patente, número,
   grano, neto y fecha de la regulada, cada uno con su campo y su botón.

Entrando **desde un ticket** (accesos 1 y 2) se muestra **solo ese ticket**, no la
lista entera: el que viene de un ticket quiere cargarle el CTG a ese. Si hay más
esperando, abajo aparece "Ver los otros N que esperan el CTG". Y el **Volver**
vuelve al ticket, no al inicio: la pantalla acepta un `volver` en la dirección,
que solo se respeta si apunta adentro de `/app` (un botón "Volver" que se va del
sistema sería una puerta para engañar a alguien). Si ese ticket ya no espera CTG
—lo cargaron, o se pasó el plazo— se cae a la lista completa en vez de mostrar una
pantalla vacía.

### Las reglas (las mismas que la web)

| | |
| --- | --- |
| Cuándo | solo tickets con la **regulada cerrada**, no anulados |
| Plazo | hasta **1 día después** de la regulada |
| Formato | numérico, hasta **11 dígitos** (el campo solo acepta números) |
| Una sola vez | cargado el CTG, el acceso desaparece. Para **cambiarlo** se usa "Editar observaciones", que sí consume una de las 2 modificaciones |
| Cupo | cargarlo **no** consume modificaciones |
| Auditoría | entrada `tipoOperacion: 'CTG'` con `origen: 'app-movil'` |

### Si la fecha de la regulada está adelantada

Pasó de verdad, con un registro editado a mano en la base: `fechaRegulada` quedó
en **2026-12-20** cuando el ticket era de 2025. Eso hacía que el ticket
apareciera en el aviso "sin CTG" **y al guardar se rechazara por plazo**: un aviso
que no se podía sacar de encima nunca.

La causa era que la lista usaba `ticketVigente()`, que solo controla que la fecha
**no sea vieja**: una fecha posterior a hoy da una diferencia negativa y pasa el
control. El guardado, en cambio, usa `dentroDelPlazoCtg()`, que sí exige que no
sea futura. Ahora **la lista usa la misma regla que el guardado**, así que los dos
coinciden siempre.

Y si alguien igual intenta cargarlo, el mensaje dice que **la fecha está
adelantada y el dato está mal cargado**, con la fecha que tiene. Antes decía
"venció el plazo", que manda a buscar otra cosa. El ticket no se esconde ni se
borra: se abre igual desde Ver Registros o desde el buscador, solo deja de
aparecer en un aviso que no se podía resolver.

**No hay nada que validar al cargar.** Ni la app ni la web dejan escribir esa
fecha: las dos ponen `fechaRegulada` con la fecha del día en que se guarda. La
única forma de que quede adelantada es editar el registro a mano en la base. Y en
la práctica tampoco tiene sentido: el CTG sale de una carta de porte emitida en
ARCA, que no se puede confeccionar con fecha futura.

Qué afecta y qué no: `fechaRegulada` define **el plazo del CTG**. En qué día suma
el ticket lo define `fecha`, así que el resumen del día y el acumulado de campaña
no se mueven por esto.

La web sigue con su propia regla (`ticketVigente` en `/registrar-cp`), así que
**desde la web ese ticket sí acepta el CP**. No se tocó a propósito.

### Quién puede

- El **balancero**, solo los tickets de su balanza. Es donde el chofer entrega la
  carta de porte, que es donde está el número.
- **GENERAL**, los de todas las balanzas.

### Sin señal

Se puede cargar igual: queda en la cola del teléfono con el chip `SIN SUBIR` y
sube cuando vuelve internet. La pantalla `/app/ctg` la guarda el service worker,
así que sin señal se ve la última lista y el número se tipea normal.

El plazo se mide contra el **momento en que el balancero lo tipeó** (el teléfono
lo manda en `cargadoEn`), no contra cuándo llegó al servidor: si no, una cola que
sube dos días después se rechazaría sola. Al dato del teléfono no se le cree
cualquier cosa: una fecha futura, o de más de 5 días atrás, se descarta y se usa
la de hoy, así no se puede estirar el plazo.

Si la cola reintenta y el CTG ya está cargado **con el mismo número**, el servidor
contesta bien para que no quede trabada. Si es otro número, avisa que hay que
corregirlo por observaciones.

---

## Ver los registros de otros días y buscar un ticket

Antes las pantallas de "ver registros" mostraban **solo el día de hoy**: no había
cómo mirar atrás ni cómo encontrar un camión puntual. Ahora hay dos formas, y las
dos están en **todos los códigos de ver registros** (`1235` … `1241` y el `12341`),
y también en los códigos de balanza.

### Moverse entre días

Arriba del resumen (`/app/general`) y de la lista de una balanza
(`/app/general/balanza/:codigo`) hay una barra:

```
QUIMILI
martes 11/08/26                        ← siempre HOY, no cambia

‹        lunes 10/08/26        ›        ← el día que se está mirando
[ 📅  dd/mm/aaaa ]  [ Ir ]
```

- Arriba a la izquierda, abajo del nombre de la balanza, va **siempre la fecha de
  hoy**: es la referencia y no se mueve. El día que se está mirando lo dice la
  barra.
- Las **flechas** van un día atrás o un día adelante. La de adelante queda
  apagada estando en hoy: adelante no hay registros.
- El **campo de fecha** salta a un día puntual, con tope en hoy. Arranca **vacío**
  y con el ícono de calendario: se elige el día, aparece, y se toca **Ir**. El
  ícono que dibuja el navegador se esconde y se estira invisible sobre toda la
  caja, así queda uno solo y tocar en cualquier parte abre el calendario.

Los días se escriben **`lunes 10/08/26`**: el día de la semana ayuda a ubicarse y
la fecha completa saca la duda de qué mes o año es.

No lleva JavaScript: son enlaces y un formulario `GET`, así que funciona igual en
un teléfono viejo. Todo pasa por el `?fecha=YYYY-MM-DD` que ya usaban las dos
pantallas.

### Buscar un ticket

`/app/buscar` — **un solo campo**, porque en un teléfono un campo se usa mucho
mejor que tres. Se escribe lo que se tenga a mano y se busca en todo lo que puede
coincidir:

| Se escribe | Encuentra |
| --- | --- |
| `AF593JO`, `af 593 jo` | la **patente**, aunque esté guardada con espacios de más (`"AC642HV      AF593JO "`) |
| `gomez`, `NÚÑEZ` | el **chofer**, sin importar mayúsculas ni acentos |
| `ciriaci` | el **transporte** |
| `4-0012`, `1043` | el **número de ticket** (`nroApp` o `idTicket`) |

Abajo del campo, el rango de días en chips: **Hoy · Ayer · 7 días · 30 días ·
Toda la campaña**. Por omisión, 30 días. "Toda la campaña" usa el mismo corte del
1 de septiembre que el acumulado del mail (`rangoCampana`, que viene de `app.js`).

Cada resultado es una tarjeta con patente, transporte y chofer, número, campo,
grano, lote, neto y fecha, más un chip cuando hace falta: `ANULADO`,
`En camiones`, `Sin regular` o `Falta CTG`. Se toca y abre el ticket.

Se muestran hasta **100** resultados, los más nuevos primero; si hay más, lo
avisa y pide afinar la búsqueda o acortar el rango.

Todo va por `GET`, así que el botón "atrás" del teléfono vuelve a la búsqueda
anterior y la dirección se puede compartir.

### Quién ve qué

Cada código ve **solo su balanza**; el `12341` ve todas (y a él, además, se le
muestra de qué balanza es cada resultado). Eso vale tanto para el buscador como
para abrir un ticket por su dirección: al revisarlo se encontró que un código de
observación podía abrir `/app/registro/:id` de otra balanza porque el permiso se
resolvía con `s.codigoIngreso`, que en esos códigos no existe. Ahora lo resuelve
`balanzaDeLaSesion()`, que sale de las balanzas visibles, y ese ticket da **404**.

### Imprimir los tickets de un día

En la lista de una balanza, abajo de los camiones, está **"Imprimir los tickets
del día"**: arma una sola hoja con todos los tickets del día que se está mirando,
sin tener que entrar de a uno. En el **resumen** aparece el mismo botón cuando el
código ve una sola balanza (o sea, en todos menos el `12341`, que entra por la
balanza que quiera).

- Los **anulados quedan afuera**: un ticket anulado no se le entrega a nadie.
- Los que todavía no cerraron la regulada **sí entran**, con los renglones
  punteados para completar a mano, que es para lo que están.
- Entran **6 por hoja A4**, hasta **120 tickets** por vez (20 hojas). Si un día
  tuviera más, la app lo dice en vez de recortar callado.
- Al terminar, el botón de volver lleva **al mismo día** que se estaba mirando.

Cada código imprime **solo su balanza**. Al revisar esto apareció otro resto del
mismo problema de permisos: `/app/api/tickets` —lo que la hoja usa para traer los
datos— miraba `s.codigoIngreso`, que en un código de ver registros no existe, así
que la hoja salía vacía. Ahora usa `balanzaDeLaSesion()`, igual que el resto.

### Sin señal

El buscador **necesita internet**: los tickets de días anteriores están en el
servidor, no en el teléfono. El service worker **no lo guarda** a propósito
(`SIN_GUARDAR`): mostrar sin señal la respuesta de una búsqueda vieja sería
mentirle al balancero. Sin conexión la pantalla lo dice, con el camino de vuelta
al patio, igual que las demás.

---

## Los correos: solo el de las 19 hs

Salía **un correo por cada tara final y cada regulada** —dos por camión— más uno
por cada pedido de anulación o corrección, a las cuatro direcciones de
`EMAIL_TO`. En plena descarga era un correo por minuto y no se leía ninguno.

Se apagaron. Ahora el único correo que sale es el **reporte de las 19 hs**.

| | |
| --- | --- |
| Lugares que mandan correo en todo el proyecto | **2**: el reporte de las 19 hs (`app.js`) y los avisos por evento (`notificaciones.js`) |
| Destinatarios | los dos usan `EMAIL_TO`. Sin `cc`, sin `bcc`, sin `replyTo` |
| Direcciones escritas en el código | ninguna: están todas en `EMAIL_TO` |
| Otros canales | **WhatsApp**: `whatsapp-worker/`, un programa aparte que manda el reporte de las 19 hs a 18 números escritos en `whatsapp-worker/lineas.js`. **No manda nada por ticket** y no se toca con este interruptor. |

### Quiénes reciben el reporte de las 19 hs

**Por correo**: las direcciones **no están en el repositorio**. Viven en la
variable `EMAIL_TO` de Render (separadas por coma), nunca se subieron a git y no
hay ningún `.env` versionado. Para verlas hay dos caminos:

1. **Render** → el servicio → **Environment** → `EMAIL_TO`.
2. La casilla de Gmail que figura en `EMAIL_USER` → **Enviados** → abrir
   cualquier "[Pesada Balanza] Reporte diario" y mirar el **Para**.

**Por WhatsApp**: eso sí está en el repositorio, en `whatsapp-worker/lineas.js`,
y va por código de observación (cada uno recibe su balanza; el `12341`, todo):

| Código | Balanzas | Números |
| --- | --- | --- |
| `12341` GENERAL | todas | 3482-640795 · 3482-444432 · 3482-308290 |
| `1235` | Charata / El 44 / El Mataco / La Porfía / Panuncio / Tierra Negra | 3482-318493 · 3841-437666 · 3482-639085 |
| `1236` | La Pradera | 3482-532094 · 3482-318492 |
| `1237` | El 90 / El C1 / Grifa / Hidalgo | 3482-304051 · 3482-629969 |
| `1238` | Aguero / Ferulo / Martinoli / Poncho Perdido / Wichí | 3482-639085 · 3482-533112 |
| `1239` | Doble Cero / El Búfalo / La Juanita / Martina | 3482-650071 · 3482-629969 |
| `1240` | Amamá / Avelleira / Cejolao / Quimilí | 3482-629969 · 3482-318486 |
| `1241` | Don Paco / Don Pascual / Gioda | 3482-532094 · 3482-308290 |

Son **13 números distintos** en **18 envíos** (algunos reciben más de un código).
Ese worker corre en una PC, no en Render: si está apagada, no sale el WhatsApp,
pero el correo sale igual.

El interruptor es **`AVISOS_POR_TICKET`**: apagado si no está definido. Para
volver a prenderlos, `AVISOS_POR_TICKET=1` en Render. Se prende y se apaga sin
tocar código, y al arrancar el servidor deja dicho en el log en qué estado está:

```
[Notif Email] Avisos por ticket APAGADOS. Solo se manda el reporte de las 19 hs.
```

Lo que **no** cambia: los tickets se guardan igual, los pedidos de anulación y
corrección se registran igual y le siguen apareciendo a GENERAL en **"Para
revisar"**, y el reporte de las 19 hs sale igual con todas sus hojas.

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

---

## La hoja "Todos los registros" del mail de las 19 hs

Otra hoja más en el mismo Excel: **todos los tickets desde el 1 de abril de
2026**, uno por fila. Sirve para tener el historial completo en un solo archivo,
sin entrar al sistema.

- **Las mismas columnas** que la hoja del día, y armadas con la misma función:
  un cambio de columnas se hace en un solo lugar y las dos hojas quedan iguales.
- Ordenada por **fecha** y después por número de ticket.
- **Incluye los anulados**, con su marca `ANULADO` y el neto en negativo, igual
  que en la hoja del día: es un historial, esconderlos haría que los números no
  cierren contra el sistema.
- Encabezado congelado, para que al bajar miles de filas se siga viendo qué
  columna es cada una.
- Al final, la fila **TOTAL Neto (toneladas)**.

La fecha de corte es el **1-4-2026** y se puede cambiar sin tocar código con la
variable **`REGISTROS_DESDE`** (formato `YYYY-MM-DD`) en Render.

**Cuánto pesa**: medido con 5.985 tickets (unos 45 por día desde abril), el Excel
completo queda en **0,47 MB** y tarda **3,5 segundos** en armarse. Muy lejos del
límite de Gmail (25 MB). Una campaña entera, unos 16.000 tickets, daría alrededor
de 1,3 MB.

Como el acumulado, va en **su propio `try/catch`**: si falla, se anota en el log y
el mail sale igual con el resto. Las dos hojas extra son independientes — está
probado que si se rompe el acumulado, esta sigue estando.

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
| `/app/ctg` | tickets que esperan el CTG |
| `/app/buscar?q=…&rango=…` | buscar un ticket (patente, chofer, transporte o número) |
| `/app/imprimir-dia/:codigo?fecha=…` | todos los tickets de un día en una hoja |

**GENERAL**

| Dirección | Pantalla |
| --- | --- |
| `/app/general` | resumen del día (`?fecha=YYYY-MM-DD` para otro día) |
| `/app/general/balanza/:codigo` | detalle de una balanza (`?fecha=…`) |
| `/app/general/pedidos` | pedidos de anulación y corrección |
| `/app/general/repetidos` | camiones repetidos en dos balanzas |
| `/app/general/sin-regular` | camiones que quedaron sin regular |

---

## Si algo sale mal

1. Poner `APP_MOVIL` en `0` en Render. La app desaparece y la web sigue igual.
2. Nada de lo cargado se pierde: los tickets están en `registros`, junto con los
   de la web.
3. Si un teléfono tiene pesadas sin subir, **no borrar la app ni los datos del
   navegador**: conectarlo a internet y esperar a que suban solas. El botón
   **Salir** avisa si quedan pendientes y no deja salir hasta que se suban.

## Segunda etapa (queda pendiente del handoff)

- Vista de **Acumulado** de campaña (`8b` del diseño). Se eligió `8a` como
  resumen principal. La idea es no hacer una pantalla nueva sino agregarle una
  hoja al Excel que ya sale por mail, con el acumulado por lote, por grano y por
  transporte.
