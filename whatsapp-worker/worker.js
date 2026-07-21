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
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const lineas = require('./lineas');
const { generarWorkbookReporte, ymd, MIME_XLSX } = require('./reporteExcel');

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

/* ---------------------------------------------
 * ESTADO (para la página web de control)
 * -------------------------------------------*/
let estado = 'iniciando';          // iniciando | esperando_qr | conectando | listo | desconectado
let ultimoQrDataUrl = null;        // QR como imagen (data URL) para mostrar en el navegador
let ultimoResumen = null;          // resumen del último envío
let enviando = false;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------
 * WHATSAPP CLIENT
 * -------------------------------------------*/
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
  puppeteer: {
    headless: true,
    executablePath: CHROMIUM_PATH,   // undefined = usa el Chromium que trae whatsapp-web.js
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', async (qr) => {
  estado = 'esperando_qr';
  try { ultimoQrDataUrl = await qrcode.toDataURL(qr); } catch (_) { ultimoQrDataUrl = null; }
  console.log('\n[WhatsApp] Escaneá este QR con la línea de la empresa');
  console.log('           (WhatsApp › Dispositivos vinculados › Vincular dispositivo).');
  console.log(`           También podés abrirlo en el navegador: http://localhost:${PORT}\n`);
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('loading_screen', () => { estado = 'conectando'; });
client.on('authenticated', () => { estado = 'conectando'; ultimoQrDataUrl = null; });

client.on('ready', () => {
  estado = 'listo';
  ultimoQrDataUrl = null;
  console.log('[WhatsApp] Conectado y listo. La sesión quedó guardada; no hace falta re-escanear salvo que la cierres.');
});

client.on('auth_failure', (msg) => {
  estado = 'desconectado';
  console.error('[WhatsApp] Falló la autenticación:', msg);
});

client.on('disconnected', (reason) => {
  estado = 'desconectado';
  console.warn('[WhatsApp] Desconectado:', reason, '- intentando reconectar...');
  client.initialize().catch(err => console.error('[WhatsApp] Error al reinicializar:', err.message));
});

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
  try {
    const id = await client.getNumberId(n);
    return id ? id._serialized : null;
  } catch (err) {
    console.error(`[WhatsApp] Error al resolver ${raw}:`, err.message);
    return null;
  }
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
      const workbook = generarWorkbookReporte(registros);
      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const filename = `reporte_${obsCode}_${hoy}.xlsx`;
      const media = new MessageMedia(MIME_XLSX, base64, filename);
      const caption =
        `*Pesada Balanza* — Reporte diario ${hoy}\n` +
        `${registros.length} ticket${registros.length !== 1 ? 's' : ''} de las últimas 24 hs.`;

      for (const numero of numeros) {
        const chatId = await resolverChatId(numero);
        if (!chatId) {
          salteados++;
          detalle.push(`⚠️ ${obsCode} → ${numero}: sin WhatsApp / número inválido`);
          console.warn(`[Envío] ${obsCode} → ${numero}: sin WhatsApp, salteado.`);
          continue;
        }
        try {
          await client.sendMessage(chatId, media, { caption });
          enviados++;
          detalle.push(`✅ ${obsCode} → ${numero} (${registros.length} tickets)`);
          console.log(`[Envío] ${obsCode} → ${numero}: OK (${registros.length} tickets)`);
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
    ${qrBloque}
    ${estado === 'listo' ? `<form method="POST" action="/enviar"><button type="submit">Enviar reporte de prueba ahora</button></form>` : ''}
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
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(paginaHtml());
});

/* ---------------------------------------------
 * ARRANQUE
 * -------------------------------------------*/
async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log('[Mongo] Conectado a la base de datos.');

  server.listen(PORT, () => {
    console.log(`[Web] Panel de control en http://localhost:${PORT}`);
  });

  console.log('[WhatsApp] Inicializando cliente...');
  await client.initialize();

  // Cron: todos los días a las 19:00 hora de Argentina
  cron.schedule('0 19 * * *', () => {
    console.log('[Cron] 19:00 — disparando reporte diario por WhatsApp.');
    enviarReportes().catch(err => console.error('[Cron] Error:', err.message));
  }, { timezone: 'America/Argentina/Buenos_Aires' });
  console.log('[Cron] Programado el envío diario a las 19:00 (hora Argentina).');

  // Envío inmediato opcional para probar
  if (process.argv.includes('--enviar-ahora')) {
    console.log('[Inicio] --enviar-ahora detectado: se enviará apenas WhatsApp esté listo.');
    const timer = setInterval(async () => {
      if (estado === 'listo') {
        clearInterval(timer);
        await enviarReportes();
      }
    }, 3000);
  }
}

main().catch(err => {
  console.error('[Fatal] No se pudo arrancar el worker:', err.message);
  process.exit(1);
});
