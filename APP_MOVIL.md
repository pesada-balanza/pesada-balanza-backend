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
5. Al guardar la **tara final** aparece el recordatorio para imprimir el ticket
   del chofer. Si se elige "Más tarde", queda avisado en el patio hasta que se
   imprima.

**GENERAL** entra con el código `12341` y ve el resumen del día de todas las
balanzas, autoriza las anulaciones y corrige. GENERAL no carga pesadas.

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

---

## Sin señal

Se puede: cargar CAMIONES, TARA FINAL y REGULADA, imprimir el ticket y ver el
día en curso. Las pesadas quedan guardadas en el teléfono con el chip
`SIN SUBIR` y **se suben solas** cuando vuelve internet, sin que nadie haga nada.

No se puede: pedir una anulación o una corrección (hay que avisarle a GENERAL).
El botón se muestra apagado con el motivo "necesita internet" debajo.

**Numeración**: el número lo da siempre la base de datos, nunca el teléfono.
Para poder trabajar sin señal, el teléfono pide de antemano unos números
reservados y los va usando. Un número reservado que no se usa queda quemado: no
se reasigna. Igual que un ticket anulado.

---

## Cómo está aislada de la web

- Todo el código de la app está en `app-movil.js`, `views/app/` y
  `app-movil-estaticos/`. Ningún archivo de la web se modificó.
- En `app.js` hay **un solo bloque** que engancha la app, y solo si
  `APP_MOVIL=1`.
- Los estáticos de la app viven en `app-movil-estaticos/` y **no** en `public/`,
  a propósito: así el `express.static` de la web no los sirve y todo queda
  detrás de la llave.
- La app no usa Bootstrap ni el layout de la web: tiene su propio CSS.
- No agrega ninguna librería nueva: `package.json` no cambió.

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
  resumen principal; esta quedó para después.
- Compartir el PDF del ticket después de la regulada.
