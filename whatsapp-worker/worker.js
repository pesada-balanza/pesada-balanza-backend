/* =====================================================================
 * WORKER DE WHATSAPP — Reporte diario de Pesada Balanza
 * =====================================================================
 * Programa INDEPENDIENTE del sistema principal. Corre en una PC de la
 * oficina siempre prendida (como dejar WhatsApp Web abierto, pero
 * automático). Se conecta a la MISMA base de datos que la app de Render,
 * arma un Excel por cada usuario observador y lo envía por WhatsApp a las
 * líneas configuradas en lineas.js, todos los días a las 19:00.
 *
 * NO forma parte del deploy de Render: vive en su propia carpeta con su
 * propio package.json, así el sistema de balanza no se ve afectado.
 *
 * Uso:
 *   node worker.js                → arranca y queda corriendo (cron 19:00)
 *   node worker.js --enviar-ahora → envía una vez de inmediato y sigue corriendo
 *
 * Mientras corre, abrí http://localhost:3100 para ver el QR (primera vez),
 * el estado de conexión y un botón para enviar una prueba.
 * ===================================================================== */

require('dotenv').config();
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const lineas = require('./lineas');
const { generarWorkbookReporte, ymd, MIME_XLSX } = require('./reporteExcel');

/* ---------------------------------------------
 * RED DE SEGURIDAD: que ningún error suelto tumbe el worker.
 * Un tropiezo de WhatsApp/Chrome puede lanzar un error "por fuera" del
 * try/catch normal. Sin esto, Node cerraría todo el programa. Con esto,
 * lo anotamos y el worker sigue vivo para el próximo envío.
 * -------------------------------------------*/
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : reason;
  console.error('[Aviso] Error no manejado (el worker sigue vivo):', msg);
});
process.on('uncaughtException', (err) => {
  console.error('[Aviso] Excepción no capturada (el worker sigue vivo):', err && err.message ? err.message : err);
});

/* ---------------------------------------------
 * CONFIG
 * -------------------------------------------*/
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = parseInt(process.env.WWEBJS_PORT || '3100', 10);
const DATA_PATH = process.env.WWEBJS_DATA_PATH || path.join(__dirname, '.wwebjs_auth');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
// Milisegundos de espera entre mensaje y mensaje (evita parecer spam)
const DELAY_MS = parseInt(process.env.WWEBJS_DELAY_MS || '3000', 10);

if (!MONGODB_URI) {
  console.error('ERROR: falta la variable MONGODB_URI (ponela en un archivo .env). Abortando.');
  process.exit(1);
}

// Mapeo código de observación → código de ingreso (igual que app.js).
// El GENERAL (12341) ve todos los registros; el resto sólo los de su ingreso.
const ingresoAObservacion = {
  '56781': '12341',
  '5679':  '1235',
  '5680':  '1236',
  '5681':  '1237',
  '5682':  '1238',
  '5683':  '1239',
  '5684':  '1240',
  '5685':  '1241',
};

// Nombre de la balanza por código de observación (para el nombre del archivo
// y el texto del mensaje). Editá acá si cambia algún nombre.
const NOMBRES_BALANZA = {
  '12341': 'GENERAL',
  '1235':  'EL MATACO',
  '1236':  'LA PRADERA',
  '1237':  'EL C1',
  '1238':  'EL WICHI',
  '1239':  'EL BUFALO',
  '1240':  'QUIMILI',
  '1241':  'DON PACO-PASCUAL',
};

/** Nombre de balanza apto para nombre de archivo (sin caracteres inválidos). */
function nombreBalanza(obsCode) {
  const base = NOMBRES_BALANZA[obsCode] || obsCode;
  return String(base).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').trim();
}

/* ---------------------------------------------
 * ESTADO (para la página web de control)
 * -------------------------------------------*/
let estado = 'iniciando';          // iniciando | esperando_qr | conectando | listo | desconectado
let ultimoQrDataUrl = null;        // QR como imagen (data URL) para mostrar en el navegador
let ultimoResumen = null;          // resumen del último envío
let enviando = false;
let numeroConectado = null;        // número de la línea con la que se vinculó (quién ENVÍA)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------
 * WHATSAPP CLIENT (con recuperación automática)
 * -------------------------------------------*/
let client = null;          // se (re)crea desde crearClient()
let reiniciando = false;    // evita reinicios superpuestos

/** Borra la carpeta de sesión (cuando quedó corrupta). */
function borrarSesion() {
  try {
    fs.rmSync(DATA_PATH, { recursive: true, force: true });
    console.log('[WhatsApp] Sesión anterior borrada (se pedirá QR nuevo).');
  } catch (err) {
    console.error('[WhatsApp] No se pudo borrar la sesión:', err.message);
  }
}

/** Crea un cliente nuevo con todos sus eventos enganchados. */
function crearClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
    puppeteer: {
      headless: true,
      executablePath: CHROMIUM_PATH,   // undefined = usa el Chrome descargado por puppeteer
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  c.on('qr', async (qr) => {
    estado = 'esperando_qr';
    try { ultimoQrDataUrl = await qrcode.toDataURL(qr); } catch (_) { ultimoQrDataUrl = null; }
    console.log('\n[WhatsApp] Escaneá este QR con la línea de la empresa');
    console.log('           (WhatsApp › Dispositivos vinculados › Vincular dispositivo).');
    console.log(`           También podés abrirlo en el navegador: http://localhost:${PORT}\n`);
    qrcodeTerminal.generate(qr, { small: true });
  });

  c.on('loading_screen', () => { estado = 'conectando'; });
  c.on('authenticated', () => { estado = 'conectando'; ultimoQrDataUrl = null; });

  c.on('ready', () => {
    estado = 'listo';
    ultimoQrDataUrl = null;
    try { numeroConectado = (c.info && c.info.wid) ? c.info.wid.user : null; } catch (_) { numeroConectado = null; }
    console.log(`[WhatsApp] Conectado y listo. ENVÍA desde la línea: ${numeroConectado || 'desconocida'}.`);
    console.log('[WhatsApp] La sesión quedó guardada; no hace falta re-escanear salvo que la cierres.');
  });

  c.on('auth_failure', (msg) => {
    estado = 'desconectado';
    console.error('[WhatsApp] Falló la autenticación:', msg);
    // Credenciales inválidas → sesión corrupta: reiniciar borrándola.
    reiniciarWhatsApp(true);
  });

  c.on('disconnected', (reason) => {
    estado = 'desconectado';
    console.warn('[WhatsApp] Desconectado:', reason, '- reintentando reconexión...');
    reiniciarWhatsApp(false);
  });

  return c;
}

/**
 * Arranca (o reinicia) el cliente de WhatsApp con recuperación:
 *  - Si falla por sesión corrupta, la borra y vuelve a pedir QR.
 *  - Nunca cierra el programa; reintenta con espera.
 * @param {boolean} borrar  true para borrar la sesión antes de reintentar
 */
async function reiniciarWhatsApp(borrar = false) {
  if (reiniciando) return;
  reiniciando = true;
  try {
    estado = 'conectando';
    if (client) { try { await client.destroy(); } catch (_) {} }
    if (borrar) borrarSesion();
    client = crearClient();
    await client.initialize();
    reiniciando = false;
  } catch (err) {
    reiniciando = false;
    const msg = err && err.message ? err.message : String(err);
    console.error('[WhatsApp] Error al inicializar:', msg);
    // Estos errores suelen indicar sesión/estado corrupto → conviene borrar.
    const corrupta = /Execution context was destroyed|Protocol error|Target closed|Session closed/i.test(msg);
    console.log(`[WhatsApp] Reintentando en 15 segundos${corrupta ? ' (borrando sesión corrupta)' : ''}...`);
    setTimeout(() => reiniciarWhatsApp(corrupta), 15000);
  }
}

/* ---------------------------------------------
 * NÚMEROS
 * -------------------------------------------*/
/** Deja sólo dígitos y garantiza el prefijo 54 (Argentina). */
function normalizarNumero(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  if (!n) return null;
  if (!n.startsWith('54')) n = '54' + n;
  return n;
}

/**
 * Resuelve el ID real de WhatsApp del número (maneja el "9" de celulares
 * argentinos). Devuelve null si el número no tiene WhatsApp.
 */
async function resolverChatId(raw) {
  const n = normalizarNumero(raw);
  if (!n) return null;
  // WhatsApp exige el identificador LID; el @c.us da "No LID for user".
  // Los contactos argentinos se guardan CON el 9 (+54 9 ...), así que buscamos
  // ese formato primero: suele devolver el LID correcto (el del contacto real).
  const con9 = (n.startsWith('54') && n[2] !== '9') ? '549' + n.slice(2) : n;
  const candidatos = con9 === n ? [n] : [con9, n];
  for (const c of candidatos) {
    try {
      const id = await client.getNumberId(c);
      if (id) return id._serialized;
    } catch (err) {
      console.error(`[WhatsApp] Error al resolver ${c}:`, err.message);
    }
  }
  return null;
}

/* ---------------------------------------------
 * DATOS
 * -------------------------------------------*/
/** Trae los registros de las últimas 24 hs filtrados para un código de observación. */
async function fetchRegistros(obsCode) {
  const hoy = ymd(new Date());
  const ayer = ymd(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const col = mongoose.connection.db.collection('registros');

  let registros = await col
    .find({ fecha: { $in: [hoy, ayer] } })
    .sort({ idTicket: 1 })
    .toArray();

  if (obsCode !== '12341') {
    const codigoIngreso = Object.keys(ingresoAObservacion)
      .find(k => ingresoAObservacion[k] === obsCode);
    registros = registros.filter(r => r.codigoIngreso === codigoIngreso);
  }
  return registros;
}

/* ---------------------------------------------
 * ENVÍO
 * -------------------------------------------*/
async function enviarReportes() {
  if (estado !== 'listo') {
    console.warn(`[Envío] WhatsApp no está listo (estado: ${estado}). Se omite el envío.`);
    return { ok: false, motivo: 'WhatsApp no conectado' };
  }
  if (enviando) {
    console.warn('[Envío] Ya hay un envío en curso. Se omite.');
    return { ok: false, motivo: 'Envío en curso' };
  }

  enviando = true;
  const hoy = ymd(new Date());
  const detalle = [];
  let enviados = 0, salteados = 0;

  console.log(`[Envío] Iniciando reporte diario del ${hoy}...`);
  try {
    for (const [obsCode, numeros] of Object.entries(lineas)) {
      if (!Array.isArray(numeros) || numeros.length === 0) continue;

      const registros = await fetchRegistros(obsCode);
      const nombre = NOMBRES_BALANZA[obsCode] || obsCode;
      const sinRegistros = registros.length === 0;

      // Si no hubo tickets en el día, se manda un mensaje de TEXTO avisando
      // "sin registros" en lugar de un Excel vacío.
      let contenido, opciones;
      if (sinRegistros) {
        contenido = `*Pesada Balanza* — ${nombre}: sin registros del día ${hoy}.`;
        opciones = {};
      } else {
        const workbook = generarWorkbookReporte(registros);
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const filename = `reporte_${nombreBalanza(obsCode)}_${hoy}.xlsx`;
        contenido = new MessageMedia(MIME_XLSX, base64, filename);
        opciones = { caption: `Balanza: ${nombre}` };
      }

      for (const numero of numeros) {
        const chatId = await resolverChatId(numero);
        if (!chatId) {
          salteados++;
          detalle.push(`⚠️ ${obsCode} → ${numero}: sin WhatsApp / número inválido`);
          console.warn(`[Envío] ${obsCode} → ${numero}: sin WhatsApp, salteado.`);
          continue;
        }
        try {
          const waId = String(chatId).replace('@c.us', '');
          const autoEnvio = numeroConectado && waId === numeroConectado;
          if (autoEnvio) {
            // El destinatario es la MISMA línea que envía → WhatsApp lo manda al
            // chat de "mensajes propios" y no se ve como mensaje recibido.
            salteados++;
            detalle.push(`⚠️ ${obsCode} → ${numero}: es la MISMA línea que envía, se saltea (auto-envío)`);
            console.warn(`[Envío] ${obsCode} → ${numero}: coincide con la línea que envía (${numeroConectado}), salteado.`);
            await sleep(DELAY_MS);
            continue;
          }
          await client.sendMessage(chatId, contenido, opciones);
          enviados++;
          const detTickets = sinRegistros ? 'sin registros' : `${registros.length} tickets`;
          detalle.push(`✅ ${obsCode} → ${numero} [llegó a: ${waId}] (${detTickets})`);
          console.log(`[Envío] ${obsCode} → ${numero} [WhatsApp real: ${waId}]: OK (${detTickets})`);
        } catch (err) {
          salteados++;
          detalle.push(`❌ ${obsCode} → ${numero}: ${err.message}`);
          console.error(`[Envío] ${obsCode} → ${numero}: ERROR ${err.message}`);
        }
        await sleep(DELAY_MS);
      }
    }
  } finally {
    enviando = false;
  }

  ultimoResumen = { fecha: hoy, cuando: ymd(new Date()), enviados, salteados, detalle };
  console.log(`[Envío] Terminado. Enviados: ${enviados}, salteados: ${salteados}.`);
  return { ok: true, enviados, salteados, detalle };
}

/**
 * Envía el reporte GENERAL (12341) a UN solo número, para probar sin
 * mandarle a los 17 y sin arriesgar la línea.
 */
async function enviarReporteAUno(numeroDestino) {
  if (estado !== 'listo') {
    console.warn(`[Prueba] WhatsApp no está listo (estado: ${estado}).`);
    return;
  }
  const hoy = ymd(new Date());
  const registros = await fetchRegistros('12341');   // general = todos los campos
  const workbook = generarWorkbookReporte(registros);
  const buffer = await workbook.xlsx.writeBuffer();
  const media = new MessageMedia(MIME_XLSX, Buffer.from(buffer).toString('base64'), `reporte_PRUEBA_${hoy}.xlsx`);
  const caption = `Balanza: ${NOMBRES_BALANZA['12341']} (PRUEBA)`;

  const chatId = await resolverChatId(numeroDestino);
  if (!chatId) {
    console.warn(`[Prueba] ${numeroDestino}: sin WhatsApp / número inválido.`);
    ultimoResumen = { fecha: hoy, cuando: hoy, enviados: 0, salteados: 1, detalle: [`⚠️ PRUEBA → ${numeroDestino}: sin WhatsApp / número inválido`] };
    return;
  }
  const waId = String(chatId).replace('@c.us', '');
  try {
    await client.sendMessage(chatId, media, { caption });
    console.log(`[Prueba] ${numeroDestino} [WhatsApp real: ${waId}]: OK (${registros.length} tickets)`);
    ultimoResumen = { fecha: hoy, cuando: hoy, enviados: 1, salteados: 0, detalle: [`✅ PRUEBA → ${numeroDestino} [llegó a: ${waId}] (${registros.length} tickets)`] };
  } catch (err) {
    console.error(`[Prueba] ${numeroDestino}: ERROR ${err.message}`);
    ultimoResumen = { fecha: hoy, cuando: hoy, enviados: 0, salteados: 1, detalle: [`❌ PRUEBA → ${numeroDestino}: ${err.message}`] };
  }
}

/* ---------------------------------------------
 * PÁGINA WEB DE CONTROL (QR / estado / prueba)
 * -------------------------------------------*/
function paginaHtml() {
  const etiquetas = {
    iniciando: '⏳ Iniciando...',
    esperando_qr: '📲 Esperá el QR y escanealo con la línea de la empresa',
    conectando: '🔄 Conectando...',
    listo: '✅ Conectado y listo',
    desconectado: '❌ Desconectado',
  };
  const qrBloque = (estado === 'esperando_qr' && ultimoQrDataUrl)
    ? `<p>Abrí WhatsApp en el celular de la línea de la empresa → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b> y escaneá:</p>
       <img src="${ultimoQrDataUrl}" alt="QR" style="width:280px;height:280px" />`
    : '';
  const resumenBloque = ultimoResumen
    ? `<h3>Último envío (${ultimoResumen.fecha})</h3>
       <p>Enviados: <b>${ultimoResumen.enviados}</b> · Salteados: <b>${ultimoResumen.salteados}</b></p>
       <ul>${ultimoResumen.detalle.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Worker WhatsApp — Pesada Balanza</title>
    <meta http-equiv="refresh" content="8">
    <style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#222}
    h1{color:#2c7be5}button{background:#2c7be5;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-size:15px;cursor:pointer}
    .estado{font-size:18px;margin:12px 0}</style></head><body>
    <h1>Worker WhatsApp — Pesada Balanza</h1>
    <p class="estado">Estado: <b>${etiquetas[estado] || estado}</b></p>
    ${numeroConectado ? `<p class="estado">Envía desde la línea: <b>${numeroConectado}</b></p>` : ''}
    ${qrBloque}
    ${estado === 'listo' ? `
      <form method="POST" action="/enviar-uno" style="margin:12px 0">
        <input name="numero" placeholder="Ej: 543482640795" style="padding:9px;font-size:15px;width:220px;border:1px solid #ccc;border-radius:6px" />
        <button type="submit">Probar UN número</button>
      </form>
      <form method="POST" action="/enviar" onsubmit="return confirm('Esto envía a TODOS los números configurados. ¿Continuar?')">
        <button type="submit" style="background:#888">Enviar a TODOS ahora</button>
      </form>` : ''}
    ${resumenBloque}
    <p style="color:#888;font-size:13px">La página se actualiza sola cada 8 segundos.</p>
    </body></html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/enviar') {
    enviarReportes().catch(err => console.error('[Envío] Error:', err.message));
    res.writeHead(303, { Location: '/' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/enviar-uno') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const numero = (new URLSearchParams(body).get('numero') || '').trim();
      if (numero) enviarReporteAUno(numero).catch(err => console.error('[Prueba] Error:', err.message));
      res.writeHead(303, { Location: '/' });
      res.end();
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(paginaHtml());
});

/* ---------------------------------------------
 * ARRANQUE
 * -------------------------------------------*/
async function main() {
  // 1) Base de datos (esto sí es imprescindible para funcionar)
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('[Mongo] Conectado a la base de datos.');
  } catch (err) {
    console.error('[Fatal] No se pudo conectar a la base de datos:', err.message);
    console.error('         Revisá MONGODB_URI en el archivo .env y tu conexión a internet.');
    process.exit(1);
  }

  // 2) Panel web (QR / estado / prueba)
  server.listen(PORT, () => {
    console.log(`[Web] Panel de control en http://localhost:${PORT}`);
  });

  // 3) Cron: se programa SIEMPRE, aunque WhatsApp todavía esté reconectando
  cron.schedule('0 19 * * *', () => {
    console.log('[Cron] 19:00 — disparando reporte diario por WhatsApp.');
    enviarReportes().catch(err => console.error('[Cron] Error:', err.message));
  }, { timezone: 'America/Argentina/Buenos_Aires' });
  console.log('[Cron] Programado el envío diario a las 19:00 (hora Argentina).');

  // 4) WhatsApp: arranca con recuperación automática (no bloquea ni cierra)
  console.log('[WhatsApp] Inicializando cliente...');
  reiniciarWhatsApp(false);

  // 5) Envío inmediato opcional para probar (--enviar-ahora)
  if (process.argv.includes('--enviar-ahora')) {
    console.log('[Inicio] --enviar-ahora detectado: se enviará apenas WhatsApp esté listo.');
    const timer = setInterval(() => {
      if (estado === 'listo') {
        clearInterval(timer);
        enviarReportes().catch(err => console.error('[Envío] Error:', err.message));
      }
    }, 3000);
  }
}

main().catch(err => {
  console.error('[Fatal] Error inesperado al arrancar:', err && err.message ? err.message : err);
});
