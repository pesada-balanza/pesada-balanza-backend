'use strict';
/**
 * diagnostico.js — por qué WhatsApp se queda en "conectando"
 *
 * No manda nada ni toca la sesión. Abre el cliente igual que el worker y va
 * diciendo, con la hora, en qué paso está. Correr con los otros programas
 * CERRADOS:
 *
 *   cd /d C:\whatsapp-worker
 *   node diagnostico.js
 *
 * Se corta solo a los 3 minutos. Para salir antes, Ctrl+C.
 */

const fs = require('fs');
const path = require('path');

const hora = () => new Date().toLocaleTimeString('es-AR');
const log = (...a) => console.log(`[${hora()}]`, ...a);

console.log('='.repeat(64));
console.log(' DIAGNÓSTICO DE CONEXIÓN A WHATSAPP');
console.log('='.repeat(64));

/* ── 1. Qué está instalado ─────────────────────────────────────────────── */
log('Node:', process.version, '| carpeta:', process.cwd());

let wwebVersion = '(no se pudo leer)';
try {
  wwebVersion = require('whatsapp-web.js/package.json').version;
} catch (e) { wwebVersion = 'ERROR: ' + e.message; }
log('whatsapp-web.js:', wwebVersion);

try {
  log('puppeteer:', require('puppeteer/package.json').version);
} catch (e) { log('puppeteer: ERROR —', e.message); }

/* ── 2. Estado del parche __x_id ───────────────────────────────────────── */
// Es lo único que el worker MODIFICA adentro de node_modules. Si quedó mal,
// rompe a los dos programas a la vez, porque comparten node_modules.
let archivoUtils = null;
try {
  archivoUtils = path.join(path.dirname(require.resolve('whatsapp-web.js')),
    'src', 'util', 'Injected', 'Utils.js');
  const src = fs.readFileSync(archivoUtils, 'utf8');
  const parchado = src.includes('delete message.__x_id');
  log('Utils.js:', parchado ? 'PARCHADO' : 'sin parchar', '—', src.length, 'bytes');

  // ¿Sigue siendo JavaScript válido? Si no, el parche lo rompió.
  try {
    new (require('vm').Script)(src, { filename: archivoUtils });
    log('Utils.js: sintaxis VÁLIDA ✓');
  } catch (err) {
    log('Utils.js: ⚠ SINTAXIS ROTA →', err.message);
    log('   Esto lo explica todo. Arreglo: borrar node_modules y npm install.');
  }

  if (parchado) {
    const i = src.indexOf('delete message.__x_id');
    const desde = src.lastIndexOf('\n', src.lastIndexOf('\n', i - 1) - 1) + 1;
    console.log('   ── dónde quedó el parche ──');
    console.log(src.slice(desde, src.indexOf('\n', i + 60)).split('\n').map(l => '   ' + l).join('\n'));
  }
} catch (e) {
  log('Utils.js: no se pudo revisar —', e.message);
}

/* ── 3. La sesión guardada ─────────────────────────────────────────────── */
const carpetaSesion = path.join(process.cwd(), '.wwebjs_auth');
if (fs.existsSync(carpetaSesion)) {
  let archivos = 0;
  const contar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) contar(path.join(d, e.name)); else archivos++;
    }
  };
  try { contar(carpetaSesion); } catch (_) {}
  log('.wwebjs_auth: existe,', archivos, 'archivos');
  // Si Chrome quedó abierto, deja este candado y el próximo arranque se cuelga.
  for (const lock of ['SingletonLock', 'SingletonCookie', 'lockfile']) {
    const p = path.join(carpetaSesion, 'session', lock);
    if (fs.existsSync(p)) log('   ⚠ hay un candado de Chrome:', lock);
  }
} else {
  log('.wwebjs_auth: NO existe → va a pedir QR');
}

/* ── 4. Intento de conexión, paso a paso ───────────────────────────────── */
/* La MISMA versión fija que usan los dos programas. Si el diagnóstico probara
   otra cosa, no probaría nada. Para tantear una distinta sin tocar archivos:
     set WEB_VERSION=2.3000.1046901975-alpha
     node diagnostico.js
   y con `auto` deja que cargue la última, que es lo que se queda en 99%. */
let WEB_VERSION = '(sin fijar)';
let webVersionCache;
try {
  ({ WEB_VERSION, webVersionCache } = require('./version-web'));
} catch (e) {
  log('⚠ No encontré version-web.js — se prueba sin fijar versión.');
}
log('WhatsApp Web fijada en:', WEB_VERSION);
log('Abriendo el cliente... (hasta 3 minutos)');

const { Client, LocalAuth } = require('whatsapp-web.js');
const cliente = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache,
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

// Cada evento, con la hora: así se ve EN QUÉ PASO se queda clavado.
cliente.on('loading_screen', (p, m) => log(`· cargando WhatsApp Web: ${p}% ${m || ''}`));
cliente.on('qr', () => log('· PIDE QR → la sesión guardada ya no sirve, hay que re-vincular'));
cliente.on('authenticated', () => log('· autenticado ✓'));
cliente.on('auth_failure', (m) => log('· ⚠ FALLÓ LA AUTENTICACIÓN:', m));
cliente.on('change_state', (s) => log('· estado:', s));
cliente.on('disconnected', (r) => log('· ⚠ desconectado:', r));
cliente.on('ready', async () => {
  log('· LISTO ✓✓✓  la conexión funciona.');
  try { log('  línea:', cliente.info && cliente.info.wid && cliente.info.wid.user); } catch (_) {}
  log('Conclusión: WhatsApp conecta bien. Si el worker igual se traba, el');
  log('problema no es la conexión. Ctrl+C para salir.');
});

cliente.initialize().catch((err) => {
  log('· ⚠ ERROR AL INICIALIZAR:', err && err.message ? err.message : err);
  log('  (este es el mensaje que el worker se estaba comiendo)');
});

setTimeout(() => {
  console.log('\n' + '='.repeat(64));
  log('Se acabaron los 3 minutos. Mandá TODO lo de arriba en una captura.');
  console.log('='.repeat(64));
  process.exit(0);
}, 180000);
