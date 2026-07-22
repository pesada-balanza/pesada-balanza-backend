# Worker de WhatsApp — Reporte diario de Pesada Balanza

Este programa envía el **reporte diario por WhatsApp**, un Excel distinto para
cada usuario observador, a las **19:00** (hora Argentina).

Es **independiente** del sistema principal (el que está en Render). Corre en una
**PC de la oficina que quede siempre prendida**, parecido a dejar WhatsApp Web
abierto, pero automático: escaneás el QR **una sola vez** y se queda conectado.

> No afecta al sistema de balanza: vive en su propia carpeta y Render lo ignora.

---

## Qué necesitás en esa PC

1. **Node.js 20 o superior** — https://nodejs.org (bajá la versión "LTS").
2. **Google Chrome** instalado (recomendado; si no, el programa baja su propio
   navegador la primera vez, que pesa más).
3. Conexión a internet.
4. El **número de WhatsApp de la empresa** (la línea que hoy no se usa) a mano,
   con el celular disponible para escanear el QR.

---

## Instalación (una sola vez)

1. Copiá la carpeta `whatsapp-worker` a la PC de la oficina.
2. Abrí una terminal **dentro de esa carpeta**.
3. Creá el archivo de configuración:
   - Copiá `.env.example` y renombralo a `.env`.
   - Abrí `.env` y pegá en `MONGODB_URI` la misma cadena de conexión que usa
     Render (Render → tu servicio → *Environment* → `MONGODB_URI`).
   - Si tenés Chrome instalado, podés descomentar `CHROMIUM_PATH` y poner su
     ruta (más liviano que bajar otro navegador).
4. Instalá las dependencias:
   ```
   npm install
   ```

## Vincular la línea de WhatsApp (una sola vez)

1. Arrancá el programa:
   ```
   npm start
   ```
2. Va a aparecer un **QR** en la terminal, y también en el navegador entrando a
   **http://localhost:3100**.
3. En el celular de la línea de la empresa: WhatsApp → **Dispositivos
   vinculados** → **Vincular un dispositivo** → escaneá el QR.
4. Cuando diga **"Conectado y listo"**, ya está. La sesión queda guardada en
   esta PC; no hay que volver a escanear salvo que la cierres desde el celular.

## Uso diario

- Dejá el programa **corriendo** y la PC **prendida**. Manda solo a las 19:00.
- Para revisar el estado o **enviar una prueba** cuando quieras, entrá a
  **http://localhost:3100** y usá el botón *"Enviar reporte de prueba ahora"*.
- Para probar desde la terminal apenas conecta:
  ```
  npm run enviar-ahora
  ```

## Cambiar los destinatarios

Editá el archivo **`lineas.js`** (tiene instrucciones adentro). Cada código de
observación (12341, 1235, …, 1241) tiene su lista de números. Guardá y reiniciá
el programa.

## IMPORTANTE: activar cada destinatario (una sola vez)

Por seguridad, WhatsApp **sólo entrega** los reportes a quien **ya tiene una
conversación** con la línea que envía. A un número "nuevo", el programa puede
decir "OK" pero el mensaje **no llega**.

Por eso, cada destinatario nuevo tiene que **activarse una vez**:

- **Lo más simple:** pedile a cada persona que le mande **un mensaje cualquiera
  (un "hola")** a la línea que envía. Con eso queda activada para siempre.
- **Alternativa:** desde la línea que envía, escribile vos a cada uno y esperá
  que te **respondan** (que haya ida y vuelta).

Después de eso, el reporte diario les llega solo. Si algún día un destinatario
deja de recibir, probablemente haya que reactivar la conversación.

## Para que arranque solo al prender la PC (opcional, recomendado)

Así no dependés de acordarte de abrirlo:

- **Windows**: instalá PM2 (`npm install -g pm2 pm2-windows-startup`), luego
  `pm2 start worker.js --name whatsapp` y `pm2 save`. O creá una tarea en el
  *Programador de tareas* que ejecute `npm start` en esta carpeta al iniciar
  sesión.
- **Linux/Mac**: usá PM2 (`pm2 start worker.js --name whatsapp && pm2 save &&
  pm2 startup`) o un servicio de systemd.

## Problemas frecuentes

- **"WhatsApp no conectado"** al enviar: todavía no escaneaste el QR o se cerró
  la sesión. Entrá a http://localhost:3100 y escaneá de nuevo.
- **Un número aparece "salteado"**: ese número no tiene WhatsApp o está mal
  escrito en `lineas.js`. Corregilo y reiniciá.
- **Se cerró la sesión sola**: alguien la desvinculó desde el celular
  (WhatsApp → Dispositivos vinculados). Volvé a escanear el QR.
- **La PC se apagó/reinició**: volvé a arrancar el programa (`npm start`); la
  sesión sigue guardada, no hay que re-escanear.
