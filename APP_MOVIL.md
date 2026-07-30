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

No se puede: pedir una anulación o una corrección (hay que avisarle a GENERAL).
El botón se muestra apagado con el motivo "necesita internet" debajo.

**Numeración**: el número lo da siempre la base de datos, nunca el teléfono.
Para poder trabajar sin señal, el teléfono pide de antemano unos números
reservados y los va usando. Un número reservado que no se usa queda quemado: no
se reasigna. Igual que un ticket anulado.

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
  vence a los 5) y se guardan como máximo 60. Los de pesadas que todavía no se
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

**Al subir cambios de la app**, hay que subir el número de versión que está
arriba de `app-movil-estaticos/sw.js` (`pesada-app-v3`, `v4`, …). Eso hace que
los teléfonos descarten las **pantallas** que tenían guardadas y tomen las
nuevas. Las pesadas pendientes y los números reservados no se tocan (ver
"Actualizar la app NO borra lo que quedó pendiente", más arriba).

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

### Reglas del sistema actual que se respetan tal cual

- Solo **GENERAL** (`12341`) puede anular. El balancero pide, con motivo escrito.
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
