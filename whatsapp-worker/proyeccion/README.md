# Flujo de Fondos — envío automático por WhatsApp

Genera las proyecciones financieras de las dos empresas desde la app de Google
(*Flujo de Fondos*) y las manda por WhatsApp en PDF, **a las 09:00 y 17:30, de
lunes a viernes**, a los números de `destinatarios.js`.

> **No toca el worker de balanza.** Es un programa aparte, con su propia sesión
> de WhatsApp y su propio panel. Los dos corren a la vez.

---

## Cómo funciona

No hay integración con Google: el programa **usa la app como la usaría una
persona**. Abre Chrome con una sesión guardada de `tableros@amh.com.ar`, hace
click en "Generar proyección", espera a que carguen los datos, y arma el PDF.

```
09:00 / 17:30  (lunes a viernes)
  └─ Chrome (perfil dedicado, oculto)
       ├─ AMH             → click Generar → esperar datos → PDF
       └─ Agroindustrial  → click solapa → Generar → esperar datos → PDF
  └─ WhatsApp (segundo dispositivo vinculado)
       └─ los dos PDF a los 4 destinatarios
```

Tarda unos 5 minutos: cada proyección demora entre 1 y 3 minutos en cargar,
según cómo ande Google ese día. Por eso disparando a las 09:00 los mensajes
llegan cerca de las 09:05.

## Los archivos

| Archivo | Qué es |
|---|---|
| `enviar.js` | El programa que queda corriendo: cron, WhatsApp, panel web |
| `sonda.js` | Toda la parte de generar los PDF. Se puede usar solo, sin enviar nada |
| `destinatarios.js` | **Los números.** Es el único archivo que se toca seguido |
| `iniciar.bat` | Arranque con reinicio automático, para el Programador de tareas |
| `.perfil-chrome/` | Sesión de Google. Si se borra, hay que volver a loguearse |
| `.wwebjs_auth/` | Sesión de WhatsApp. Si se borra, hay que re-escanear el QR |
| `salida/` | Los PDF generados. Se borran solos a los 30 días |

## Uso diario

Nada: queda corriendo y manda solo. Para ver cómo viene, entrá a
**http://localhost:3200** (estado, y un botón para generar y enviar a pedido).

## Comandos

```bat
node enviar.js              arranca y queda corriendo (08:30 y 17:30)
node enviar.js --ahora      además genera y envía apenas conecta
node enviar.js --probar     manda un texto de prueba, no genera nada
node enviar.js --grupos     lista los grupos de WhatsApp y sus IDs

node sonda.js --generar     genera los PDF y NO manda nada  ← para probar formato
node sonda.js --mirar       revisa que la sesión de Google siga viva
node sonda.js --login       volver a iniciar sesión en Google (si venció)
```

### Probar sin molestar a nadie

```bat
set SOLO_A=3482000111
node enviar.js --ahora
```

Manda todo a ese único número. Verificá que el arranque diga
`⚠️ MODO PRUEBA (SOLO_A)`; si dice `4 números`, el `set` no quedó.

⚠️ La variable vive sólo en esa ventana **y sólo mientras el proceso viva**. Un
proceso arrancado con `SOLO_A` lo mantiene para *todos* sus envíos, incluidos
los de las 08:30 y 17:30. Para producción, arrancá con `iniciar.bat`.

### Perillas (sin tocar código)

```bat
set FUENTE=13        tamaño de letra de la tabla (12 por defecto)
set APAISADA=1       hojas horizontales en vez de verticales
set HORARIOS=55 8,25 17    otros horarios ("minuto hora", separados por coma)
set DIAS=*           qué días se envía (1-5 = lunes a viernes, por defecto)
set MIN_FILAS=60     filas nuevas para dar la proyección por cargada (80)
set SOLO_A=...       mandar todo a un único número
```

## Los guardas

Están puestos porque un flujo de fondos equivocado es peor que uno que no llega:

- **No manda PDF vacíos.** Cuenta las filas antes y después de generar; si no
  aparecieron al menos 80 nuevas, no genera nada y avisa.
- **No confunde empresas.** Las dos tablas tienen las mismas 101 filas y el
  mismo tamaño, así que se compara el **nombre de la empresa en pantalla**. Si
  los dos PDF salieran con el mismo nombre, no manda ninguno.
- **No se queda callado.** Si algo falla, manda un WhatsApp a los números de
  `avisos` diciendo que hay que hacerlo a mano.
- **Fecha visible.** Cada hoja lleva empresa y fecha/hora en el encabezado, para
  que nadie confunda la proyección de hoy con la de ayer.

## Mantenimiento: renovar la sesión de Google (cada ~2 semanas)

La sesión de Google **vence sola cada dos semanas aproximadamente** (comprobado:
12/08 → 26/08 → 09/09). Cuando eso pasa, el reporte no se puede generar.

**Te vas a enterar por WhatsApp**, 25 minutos antes del envío, con un aviso al
número de `avisos`. Si actuás dentro de esa ventana, el reporte sale igual.

Los tres pasos, en una ventana **nueva** de `cmd` (el enviador puede seguir
corriendo, está ocioso entre envíos):

```bat
cd /d C:\whatsapp-worker\proyeccion
node sonda.js --login
```

Se abre un Chrome. Iniciá sesión con **tableros@amh.com.ar**, abrí el Flujo de
Fondos hasta que cargue, y **cerrá la ventana**.

Después, en `http://localhost:3200`, botón **"Verificar la sesión de Google"**:
tiene que quedar en verde. Si el envío del día ya se perdió, "Generar y enviar
ahora" lo manda.

> Si el panel no responde (`ERR_CONNECTION_REFUSED`), no es la sesión: es que el
> enviador no está corriendo. Abrí `iniciar.bat`.

## Si algo falla

| Síntoma | Qué pasa |
|---|---|
| "La sesión venció: Google pide login" | Correr `node sonda.js --login` y entrar con `tableros@amh.com.ar` |
| "la proyección no cargó datos" | La app de Google no respondió. Mirar la captura en `salida/` |
| No aparece el QR ni conecta | Borrar `.wwebjs_auth` y arrancar de nuevo: pide QR |
| Chrome no arranca / perfil ocupado | Quedó un Chrome huérfano (ver abajo) |
| "Data passed to getter must include an id property" | Envío a GRUPO roto (ver abajo) |

### Envío a grupos y la versión de WhatsApp Web

`whatsapp-web.js` imita las estructuras internas del cliente web de Meta. Cuando
Meta lo actualiza, la librería queda desfasada y empiezan a fallar cosas sueltas
—el listado de chats, el nombre de un grupo, el **envío a grupos**— con errores
que vienen de adentro de WhatsApp y no dicen nada útil (`"r"`, *"Data passed to
getter must include an id property"*, *"detached Frame"*).

Por eso **la versión del cliente web está fijada** en `enviar.js` (`WEB_VERSION`),
en vez de dejar que cargue la última. La fijada está probada: con ella el envío
al grupo funciona y la conexión se mantiene estable.

Si un día vuelve a romperse el envío al grupo, el procedimiento es probar otras
versiones, de más nueva a más vieja:

```bat
cd /d C:\whatsapp-worker\proyeccion
set WEB_VERSION=2.3000.1046901975-alpha
node enviar.js
```

Esperar `Conectado y listo`, mirar un minuto que no aparezcan `[Watchdog]`
repetidos (si aparecen, esa versión es inestable: pasar a la siguiente), y
después apretar **"Mandar mensaje de prueba al destino"** en el panel. Lo que
vale es la línea de la terminal, no si llega el mensaje:

| En la terminal | Significa |
|---|---|
| `[Envío] ...@g.us: OK` | Esa versión sirve |
| `ERROR Data passed to getter...` | No sirve, probar la siguiente |
| No aparece ninguna línea `[Envío]` | No estaba conectado; esperar y repetir |

Cuando encuentres la que anda, **dejala como valor por defecto en `enviar.js`** —
si queda sólo en un `set`, se pierde al reiniciar y la tarea programada vuelve a
usar la vieja.

Listado de versiones: https://github.com/wppconnect-team/wa-version/tree/main/html

**Cerrar Chrome huérfanos de la sonda** — sólo los de esta carpeta:

```bat
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*perfil-chrome*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```

**Nunca** uses `taskkill /F /IM chrome.exe`: mata también las dos sesiones de
WhatsApp y tu navegador personal.

---

## Decisiones de diseño

Vale la pena conocerlas antes de "mejorar" algo y romperlo.

**Por qué no se usa Apps Script.** Fue el primer plan y se descartó: Apps Script
no puede mandar por WhatsApp (no hay Node ni Chrome, y los scripts mueren a los
6 minutos), y llegar por la API oficial de Meta implica plantillas aprobadas,
número dedicado y costo por mensaje. Manejar el navegador no toca el script de
Google, así que si algo falla, falla el envío y no la herramienta.

**Por qué no se clickea "Exportar PDF" hasta el final.** Ese botón llama a
`window.print()`, que abre el diálogo del navegador — una ventana del sistema,
que Puppeteer no puede tocar. Se sustituye `window.print` por una función vacía
**antes** de clickear: la app prepara igual el contenido, no se abre nada, y el
PDF lo genera Puppeteer con el mismo motor de Chrome.

**Por qué se copia el HTML a una pestaña nueva.** La app vive dentro de un
iframe con `height:100%`. Al paginar en A4, Chrome resuelve ese 100% contra el
alto de *una* hoja y recorta el resto. Sacando el HTML del iframe, queda como
documento normal y pagina bien.

**Por qué se vuelcan los `value` a atributos.** Los saldos los escribe la app en
la *propiedad* `.value` de cada `<input>`, que no se refleja en el HTML. Sin ese
volcado, la copia salía con los campos vacíos: el PDF mostraba el total pero no
las sumas que lo componen.

**Por qué se sacan los `width` del DOM.** Los anchos fijos puestos como atributo
o estilo en línea le ganan a cualquier hoja de estilos, por más `!important` que
tenga. Con ellos puestos, la tabla salía a 2000px y había que achicarla a 0.37 —
letra de 4px. Sacándolos, entra a 733px sin achicar y la letra queda a 12px.

**Por qué una sola pestaña.** Chrome mete las pestañas del mismo origen en un
único proceso, compartiendo un hilo de JavaScript. Con cuatro copias de esta app
abiertas, el hilo se satura y Puppeteer no consigue ni clickear
(`Runtime.callFunctionOn timed out`). Cada corrida cierra las que hayan quedado.

**Por qué segundo dispositivo vinculado.** WhatsApp admite hasta 4 por teléfono.
Así este programa manda desde la misma línea de la empresa sin pelearse con el
worker de balanza, que tiene su propia sesión.
