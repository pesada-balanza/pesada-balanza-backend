/* =====================================================================
 * ENVIADOR DEL FLUJO DE FONDOS POR WHATSAPP
 * =====================================================================
 * Genera las dos proyecciones (AMH y Agroindustrial) con sonda.js y las
 * manda por WhatsApp a los números de destinatarios.js, **de lunes a
 * viernes**.
 *
 * Los mensajes LLEGAN 09:00 y 17:30. El cron dispara 5 minutos antes
 * (08:55 y 17:25) porque generar las dos proyecciones tarda eso.
 *
 * ── NO TOCA worker.js ─────────────────────────────────────────────────
 * Este programa es independiente del worker de balanza. Se vincula al
 * MISMO número de WhatsApp pero como un SEGUNDO DISPOSITIVO: usa su propia
 * carpeta de sesión (.wwebjs_auth de acá adentro) y su propio panel, en el
 * puerto 3200 en vez del 3100. Los dos pueden correr a la vez.
 *
 * WhatsApp admite hasta 4 dispositivos vinculados por teléfono, así que hay
 * que escanear el QR una vez más, con la misma línea de la empresa.
 *
 * Uso:
 *   node enviar.js              → arranca y queda corriendo (09:00 y 17:30)
 *   node enviar.js --ahora      → además genera y envía apenas conecta
 *   node enviar.js --probar     → manda un texto de prueba y no genera nada
 *   node enviar.js --grupos     → lista los grupos y sus IDs, y termina
 *
 * Panel de control: http://localhost:3200
 * ===================================================================== */

const http = require('http');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const { generar, sesionViva, SALIDA } = require('./sonda');
const destinatarios = require('./destinatarios');

/* ---------------------------------------------
 * RED DE SEGURIDAD: que ningún error suelto tumbe el programa.
 * -------------------------------------------*/
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : reason;
  console.error('[Aviso] Error no manejado (el enviador sigue vivo):', msg);
});
process.on('uncaughtException', (err) => {
  console.error('[Aviso] Excepción no capturada (el enviador sigue vivo):', err && err.message ? err.message : err);
});

/* ---------------------------------------------
 * CONFIG
 * -------------------------------------------*/
const PORT = parseInt(process.env.PUERTO || '3200', 10);
// Carpeta de sesión PROPIA: es lo que lo hace un segundo dispositivo
// vinculado, independiente del worker de balanza.
const DATA_PATH = path.join(__dirname, '.wwebjs_auth');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const DELAY_MS = parseInt(process.env.DELAY_MS || '3000', 10);

// Horarios en formato "minuto hora". Generar tarda unos 5 minutos, así que
// disparando a las 09:00 los mensajes llegan cerca de las 09:05. Si los
// querés EN MANO a las 09:00, poné '55 8,25 17'.
const HORARIOS = (process.env.HORARIOS || '55 8,25 17').split(',').map(s => s.trim()).filter(Boolean);

// Días en que se envía, en formato cron (0=domingo ... 6=sábado).
// '1-5' = lunes a viernes. Para volver a todos los días:  set DIAS=*
const DIAS = process.env.DIAS || '1-5';
const NOMBRE_DIAS = DIAS === '1-5' ? 'de lunes a viernes'
  : DIAS === '*' ? 'todos los días'
  : `días cron "${DIAS}"`;

// Cuántos minutos ANTES de cada envío se verifica que la sesión de Google
// siga viva. La sesión vence cada tantas semanas; avisar con este margen deja
// tiempo de correr "node sonda.js --login" y que el reporte salga a horario.
// Con 0 se desactiva el chequeo previo.
const MINUTOS_CHEQUEO = parseInt(process.env.MINUTOS_CHEQUEO || '25', 10);

// Cuánto se espera a que WhatsApp conecte antes de dar el envío por perdido.
// En esta PC conectar tarda entre 5 y 12 minutos, así que un margen corto
// hace fracasar envíos que en realidad iban a salir. Más vale tarde que nunca.
const ESPERA_WHATSAPP_MS = parseInt(process.env.ESPERA_WHATSAPP || '15', 10) * 60 * 1000;

// Los PDF quedan en salida/. Se borran los más viejos que esto: son datos
// financieros, no conviene que se acumulen para siempre en el disco.
const DIAS_RETENCION = parseInt(process.env.DIAS_RETENCION || '30', 10);

const MIME_PDF = 'application/pdf';

/* ---------------------------------------------
 * VERSIÓN DE WHATSAPP WEB
 * -------------------------------------------*/
// whatsapp-web.js habla con el cliente web de Meta imitando sus estructuras
// internas. Cuando Meta lo actualiza, la librería queda desfasada y cosas
// como el listado de chats o el envío a GRUPOS empiezan a fallar con errores
// que vienen de adentro de WhatsApp ("Data passed to getter...", "r").
//
// El remedio es no dejar que cargue la última versión, sino fijar una
// conocida. Las versiones están publicadas como HTML en el repo wa-version.
//
// ⚠️ NO cambiar a la ligera. La versión de abajo está PROBADA (2026-09-18):
// con ella el envío al grupo funciona y la conexión se mantiene estable.
//
// Las que NO sirven, para no repetir la prueba:
//   2.3000.1047806989-alpha  → conecta pero se cae todo el tiempo (watchdog
//                              cada pocos minutos, estado "OPENING")
//   auto (sin fijar)         → envío a grupos falla con "Data passed to
//                              getter must include an id property"
//
// Si algún día vuelve a romperse, probar de más nueva a más vieja:
//   set WEB_VERSION=2.3000.1046901975-alpha
//   set WEB_VERSION=2.3000.1045915824-alpha
//   set WEB_VERSION=2.3000.1045303712-alpha
// Listado completo: https://github.com/wppconnect-team/wa-version/tree/main/html
const WEB_VERSION = process.env.WEB_VERSION || '2.3000.1047412487-alpha';
const webVersionCache = WEB_VERSION === 'auto' ? undefined : {
  type: 'remote',
  remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WEB_VERSION}.html`,
};

/* ---------------------------------------------
 * ESTADO (para el panel web)
 * -------------------------------------------*/
let estado = 'iniciando';     // iniciando | esperando_qr | conectando | listo | desconectado
let ultimoQrDataUrl = null;
let ultimoResumen = null;
let trabajando = false;
let numeroConectado = null;
let nombreGrupo = null;       // nombre del grupo destino, si se usa grupo
let grupoId = null;           // su ID real (xxxx@g.us), ya resuelto
let ultimoChequeo = null;     // resultado del último chequeo de sesión

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Texto comparable: sin acentos, sin espacios de más, en minúsculas. */
const normalizar = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();
// hour12:false explícito: sin esto el log muestra "04:20:58" a las 16:20,
// que para revisar a qué hora salió un envío se lee mal.
const ahoraTexto = () => new Date().toLocaleString('es-AR', { hour12: false });
const fechaLegible = () => new Date().toLocaleDateString('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

let ultimoOk = Date.now();

/** Rechaza si la promesa no se resuelve dentro de `ms`. */
function conTimeout(promesa, ms, etiqueta) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Se agotó el tiempo de ${etiqueta} (${ms} ms)`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
}

/* ---------------------------------------------
 * WHATSAPP (mismo esquema probado del worker de balanza)
 * -------------------------------------------*/
let client = null;
let reiniciando = false;

function borrarSesion() {
  try {
    fs.rmSync(DATA_PATH, { recursive: true, force: true });
    console.log('[WhatsApp] Sesión anterior borrada (se pedirá QR nuevo).');
  } catch (err) {
    console.error('[WhatsApp] No se pudo borrar la sesión:', err.message);
  }
}

function crearClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
    webVersionCache,
    puppeteer: {
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  c.on('qr', async (qr) => {
    estado = 'esperando_qr';
    ultimoOk = Date.now();
    try { ultimoQrDataUrl = await qrcode.toDataURL(qr); } catch (_) { ultimoQrDataUrl = null; }
    console.log('\n[WhatsApp] Escaneá este QR con la MISMA línea de la empresa.');
    console.log('           Queda como un SEGUNDO dispositivo vinculado; el worker de');
    console.log('           balanza sigue funcionando con el suyo.');
    console.log(`           También en el navegador: http://localhost:${PORT}\n`);
    qrcodeTerminal.generate(qr, { small: true });
  });

  /*
   * PLAN B para averiguar el ID del grupo.
   *
   * client.getChats() se rompe en algunas versiones de WhatsApp Web y
   * devuelve errores de una sola letra ("r"), así que no se puede confiar en
   * él para encontrar el grupo por nombre. Pero cada mensaje que pasa por un
   * grupo trae su ID: alcanza con que alguien escriba algo ahí.
   *
   * Se escucha 'message_create' y no 'message' porque incluye los mensajes
   * propios: así funciona si escribís en el grupo desde tu propio celular.
   */
  c.on('message_create', async (msg) => {
    try {
      const id = (msg.from && String(msg.from).endsWith('@g.us')) ? msg.from
        : (msg.to && String(msg.to).endsWith('@g.us')) ? msg.to
        : null;
      if (!id) return;

      // Si el grupo ya está resuelto no hace falta anunciar nada: este evento
      // también se dispara con los mensajes que mandamos nosotros, y ensuciaba
      // el log con una línea por cada envío.
      const cfg = destinatarios.grupo;
      if (grupoId) return;

      let nombre = '';
      try { const chat = await msg.getChat(); nombre = chat.name || ''; } catch (_) {}
      console.log(`[Grupo detectado] ${nombre ? `"${nombre}"` : '(nombre no disponible)'} → ${id}`);

      // Si es el que buscábamos por nombre, queda resuelto acá mismo.
      if (!grupoId && cfg && !String(cfg).endsWith('@g.us') && normalizar(nombre) === normalizar(cfg)) {
        grupoId = id;
        nombreGrupo = nombre;
        console.log(`[Destino] ✓ Grupo resuelto por mensaje: "${nombre}" → ${id}`);
        console.log(`[Destino]   Conviene fijarlo en destinatarios.js:  grupo: '${id}',`);
      }
    } catch (_) { /* un mensaje raro no puede tumbar nada */ }
  });

  c.on('loading_screen', () => { estado = 'conectando'; });
  c.on('authenticated', () => { estado = 'conectando'; ultimoQrDataUrl = null; });

  c.on('ready', () => {
    estado = 'listo';
    ultimoOk = Date.now();
    ultimoQrDataUrl = null;
    try { numeroConectado = (c.info && c.info.wid) ? c.info.wid.user : null; } catch (_) { numeroConectado = null; }
    console.log(`[WhatsApp] Conectado y listo. ENVÍA desde la línea: ${numeroConectado || 'desconocida'}.`);
    // Se le da un rato antes de pedir la lista de chats: apenas conecta,
    // WhatsApp todavía no la tiene cargada y la consulta falla.
    setTimeout(() => { resolverGrupo().catch(() => {}); }, 15000);
  });

  c.on('auth_failure', (msg) => {
    estado = 'desconectado';
    console.error('[WhatsApp] Falló la autenticación:', msg);
    reiniciarWhatsApp(true);
  });

  c.on('disconnected', (reason) => {
    estado = 'desconectado';
    console.warn('[WhatsApp] Desconectado:', reason, '- reintentando...');
    reiniciarWhatsApp(false);
  });

  return c;
}

async function reiniciarWhatsApp(borrar = false) {
  if (reiniciando) return;
  reiniciando = true;
  try {
    estado = 'conectando';
    if (client) { try { await client.destroy(); } catch (_) {} }
    if (borrar) borrarSesion();
    client = crearClient();
    await conTimeout(client.initialize(), 120000, 'conexión a WhatsApp');
    reiniciando = false;
  } catch (err) {
    reiniciando = false;
    const msg = err && err.message ? err.message : String(err);
    console.error('[WhatsApp] Error al inicializar:', msg);
    const corrupta = /Execution context was destroyed|Protocol error|Target closed|Session closed/i.test(msg);
    console.log(`[WhatsApp] Reintentando en 15 segundos${corrupta ? ' (borrando sesión corrupta)' : ''}...`);
    setTimeout(() => reiniciarWhatsApp(corrupta), 15000);
  }
}

/** Espera a que WhatsApp esté listo, hasta `ms`. Devuelve true/false. */
async function esperarListo(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (estado === 'listo') return true;
    await sleep(3000);
  }
  return estado === 'listo';
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
  const crudo = String(raw || '');
  if (crudo.endsWith('@g.us')) return crudo;      // ya es un grupo

  const n = normalizarNumero(crudo);
  if (!n) return null;
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

/**
 * ¿El error indica que la sesión de WhatsApp quedó rota POR DENTRO?
 *
 * Pasa cuando WhatsApp Web se recarga solo (una actualización suya) y deja
 * colgada la referencia que usa la librería. Lo traicionero es que no emite
 * ningún evento de desconexión: el programa sigue creyendo que está listo,
 * el panel se ve verde, y los envíos fallan uno por uno.
 */
const SESION_ROTA = /detached Frame|Execution context was destroyed|Target closed|Session closed|Protocol error/i;
const esSesionRota = (msg) => SESION_ROTA.test(String(msg || ''));

/** Fuerza una reconexión y espera a que vuelva a estar lista. */
async function reconectarYEsperar(ms = 3 * 60 * 1000) {
  console.warn('[WhatsApp] La sesión quedó rota por dentro. Forzando reconexión...');
  estado = 'conectando';
  try { await reiniciarWhatsApp(false); } catch (_) {}
  return esperarListo(ms);
}

/** Manda un contenido ya armado a una lista de destinos. */
async function mandarATodos(destinos, contenido, opciones = {}) {
  const detalle = [];
  let enviados = 0, salteados = 0, rotas = 0;

  for (const destino of destinos) {
    const chatId = await resolverChatId(destino);
    if (!chatId) {
      salteados++;
      detalle.push(`⚠️ ${destino}: sin WhatsApp / número inválido`);
      console.warn(`[Envío] ${destino}: sin WhatsApp, salteado.`);
      continue;
    }
    const waId = String(chatId).replace('@c.us', '');
    if (numeroConectado && waId === numeroConectado) {
      salteados++;
      detalle.push(`⚠️ ${destino}: es la MISMA línea que envía, se saltea`);
      await sleep(DELAY_MS);
      continue;
    }
    try {
      await client.sendMessage(chatId, contenido, opciones);
      enviados++;
      detalle.push(`✅ ${destino}`);
      console.log(`[Envío] ${destino}: OK`);
    } catch (err) {
      salteados++;
      if (esSesionRota(err.message)) rotas++;
      detalle.push(`❌ ${destino}: ${err.message}`);
      console.error(`[Envío] ${destino}: ERROR ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  return { enviados, salteados, rotas, detalle };
}

/**
 * Resuelve el grupo destino al conectar, y comprueba que esta línea sea
 * miembro. Acepta tanto el ID (xxxx@g.us) como el NOMBRE del grupo.
 *
 * Se hace al arrancar y no al momento de enviar: si el nombre está mal
 * escrito o la línea salió del grupo, queremos enterarnos ahora y no a las
 * 09:00, con el envío fallando y nadie mirando.
 *
 * @returns {boolean} true si quedó resuelto
 */
async function resolverGrupo({ intentos = 4, esperaMs = 20000 } = {}) {
  const cfg = destinatarios.grupo;
  if (!cfg) return true;                       // no se usa grupo
  if (grupoId) return true;                    // ya estaba resuelto

  const norm = normalizar;

  // Si ya viene el ID exacto, se usa y listo: sendMessage no necesita el
  // listado de chats, así que no hay nada que resolver. El nombre se intenta
  // leer sólo para mostrarlo, y si no se puede, no importa — WhatsApp Web
  // tiene roto ese listado en algunas versiones y no vale trabar el envío
  // por un dato cosmético.
  if (String(cfg).endsWith('@g.us')) {
    grupoId = cfg;
    try {
      const chat = await conTimeout(client.getChatById(cfg), 20000, 'el nombre del grupo');
      nombreGrupo = chat.name || null;
      console.log(`[Destino] Grupo: "${nombreGrupo}" → ${grupoId}`);
    } catch (_) {
      console.log(`[Destino] Grupo: ${grupoId} (no se pudo leer el nombre, se manda igual)`);
    }
    return true;
  }

  /** Un intento. Lanza error si no lo consigue. */
  async function unIntento() {
    // Configurado por nombre: se busca entre los grupos de esta línea.
    const chats = await conTimeout(client.getChats(), 60000, 'la lista de chats');
    const grupos = chats.filter(c => c.isGroup);
    if (grupos.length === 0) throw new Error('WhatsApp todavía no devolvió ningún grupo');

    const iguales = grupos.filter(c => norm(c.name) === norm(cfg));
    if (iguales.length === 0) {
      const cerca = grupos.filter(c => norm(c.name).includes(norm(cfg)) || norm(cfg).includes(norm(c.name)));
      throw new Error(`no hay ningún grupo llamado "${cfg}"`
        + (cerca.length ? `. ¿Quisiste decir "${cerca.map(c => c.name).join('" / "')}"?` : ''));
    }
    if (iguales.length > 1) {
      throw new Error(`hay ${iguales.length} grupos llamados "${cfg}"; poné el ID exacto en destinatarios.js`);
    }
    grupoId = iguales[0].id._serialized;
    nombreGrupo = iguales[0].name;
  }

  let ultimo = '';
  for (let i = 1; i <= intentos; i++) {
    try {
      await unIntento();
      console.log(`[Destino] Grupo verificado: "${nombreGrupo}" → ${grupoId}`);
      return true;
    } catch (err) {
      grupoId = null;
      nombreGrupo = null;
      // WhatsApp Web devuelve errores de una sola letra cuando le pedís la
      // lista de chats antes de que termine de cargarla (código minificado).
      // No es un problema de configuración: hay que reintentar.
      const m = err && err.message ? String(err.message) : String(err);
      ultimo = m.length <= 3 ? `WhatsApp aún no tiene la lista de chats lista (error interno "${m}")` : m;
      if (i < intentos) {
        console.warn(`[Destino] Intento ${i}/${intentos}: ${ultimo}. Reintento en ${Math.round(esperaMs / 1000)}s...`);
        await sleep(esperaMs);
      }
    }
  }

  console.error(`[Destino] ⚠️  NO se pudo resolver el grupo "${cfg}" tras ${intentos} intentos.`);
  console.error(`           Último motivo: ${ultimo}`);
  console.error('');
  console.error('           SOLUCIÓN MÁS RÁPIDA: escribí cualquier mensaje en el grupo');
  console.error('           "' + cfg + '" desde tu celular. Su ID va a aparecer acá como');
  console.error('           [Grupo detectado] y queda resuelto solo, sin reiniciar nada.');
  console.error('           Después conviene copiar ese ID en destinatarios.js, así no');
  console.error('           hace falta repetirlo en cada arranque.');
  return false;
}

/**
 * A quiénes va el reporte: el grupo si está configurado, si no los números.
 *
 * SOLO_A pisa todo y manda a un único número. Sirve para probar el ciclo
 * completo sin que les llegue a los cuatro destinatarios reales:
 *   set SOLO_A=3482000111
 *   node enviar.js --ahora
 * Para volver a lo normal:  set SOLO_A=
 */
function destinos() {
  if (process.env.SOLO_A) return [process.env.SOLO_A];
  if (destinatarios.grupo) return [grupoId || destinatarios.grupo];
  return destinatarios.numeros;
}

/** ¿Estamos en modo prueba (mandando a uno solo)? */
const enPruebas = () => Boolean(process.env.SOLO_A);

/* ---------------------------------------------
 * EL TRABAJO
 * -------------------------------------------*/

/** Borra los PDF más viejos que DIAS_RETENCION. */
function limpiarViejos() {
  const limite = Date.now() - DIAS_RETENCION * 24 * 60 * 60 * 1000;
  let borrados = 0;
  try {
    for (const f of fs.readdirSync(SALIDA)) {
      if (!/\.(pdf|png)$/i.test(f)) continue;
      const ruta = path.join(SALIDA, f);
      try {
        if (fs.statSync(ruta).mtimeMs < limite) { fs.unlinkSync(ruta); borrados++; }
      } catch (_) {}
    }
  } catch (_) {}
  if (borrados) console.log(`[Limpieza] ${borrados} archivo(s) de más de ${DIAS_RETENCION} días borrados.`);
}

/**
 * Manda un texto corto al destino REAL (el grupo, o los números si no hay
 * grupo). Sirve para verificar que los mensajes llegan a donde tienen que
 * llegar, sin gastar los 5 minutos de generar los PDF.
 */
async function pruebaAlDestino() {
  if (estado !== 'listo') {
    console.warn(`[Prueba] WhatsApp no está listo (${estado}).`);
    return;
  }
  if (destinatarios.grupo && !enPruebas() && !await resolverGrupo()) {
    ultimoResumen = {
      cuando: ahoraTexto(), enviados: 0, salteados: 1,
      detalle: [`❌ no se pudo resolver el grupo "${destinatarios.grupo}"`],
    };
    return;
  }
  const texto = '✅ *Prueba del envío automático*\n\n'
    + 'Si ves este mensaje, el Flujo de Fondos de las dos empresas va a llegar acá '
    + 'a las 09:00 y a las 17:30, de lunes a viernes.\n\n'
    + `_(${ahoraTexto()})_`;
  const r = await mandarATodos(destinos(), texto);
  ultimoResumen = { cuando: ahoraTexto(), enviados: r.enviados, salteados: r.salteados, detalle: r.detalle };
  console.log(`[Prueba] Enviados: ${r.enviados}, salteados: ${r.salteados}.`);
}

/**
 * Manda el ÚLTIMO PDF ya generado al destino real, sin generar nada nuevo.
 *
 * Es para probar el envío de archivos en segundos. El botón de texto no
 * sirve para eso: mandar texto y mandar un adjunto usan caminos distintos
 * adentro de WhatsApp, y el que falla es el de los adjuntos.
 */
async function pruebaPdf() {
  if (estado !== 'listo') {
    console.warn(`[Prueba PDF] WhatsApp no está listo (${estado}).`);
    return;
  }
  let archivo;
  try {
    const pdfs = fs.readdirSync(SALIDA)
      .filter(f => /\.pdf$/i.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(SALIDA, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!pdfs.length) throw new Error('no hay ningún PDF en salida/');
    archivo = path.join(SALIDA, pdfs[0].f);
  } catch (err) {
    console.error(`[Prueba PDF] ${err.message}. Generá uno primero con "Generar y enviar ahora".`);
    ultimoResumen = { cuando: ahoraTexto(), enviados: 0, salteados: 1, detalle: [`❌ ${err.message}`] };
    return;
  }

  if (destinatarios.grupo && !enPruebas() && !await resolverGrupo()) return;

  const kb = Math.round(fs.statSync(archivo).size / 1024);
  console.log(`[Prueba PDF] Mandando ${path.basename(archivo)} (${kb} KB)...`);
  const media = new MessageMedia(MIME_PDF, fs.readFileSync(archivo).toString('base64'), path.basename(archivo));
  const r = await mandarATodos(destinos(), media, {
    caption: `Prueba de envío de archivo — ${ahoraTexto()}`,
    sendMediaAsDocument: true,
  });
  ultimoResumen = { cuando: ahoraTexto(), enviados: r.enviados, salteados: r.salteados, detalle: r.detalle };
  console.log(`[Prueba PDF] Enviados: ${r.enviados}, salteados: ${r.salteados}.`);
}

/** Avisa por WhatsApp que algo falló. El silencio no es un resultado válido. */
async function avisarFalla(motivo) {
  const avisos = destinatarios.avisos || [];
  if (!avisos.length || estado !== 'listo') {
    console.error('[Aviso] No se pudo avisar la falla por WhatsApp.');
    return;
  }
  const texto = `⚠️ *Flujo de Fondos* — no se pudo generar la proyección de las ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.\n\nMotivo: ${motivo}\n\nHay que generarla y mandarla a mano.`;
  try { await mandarATodos(avisos, texto); } catch (_) {}
}

/**
 * Resta minutos a un horario cron "minuto hora". Ej: ('55 8', 25) → '30 8'.
 */
function restarMinutos(hm, minutos) {
  const [m, h] = String(hm).trim().split(/\s+/).map(Number);
  let total = h * 60 + m - minutos;
  while (total < 0) total += 24 * 60;
  return `${total % 60} ${Math.floor(total / 60) % 24}`;
}

/** "30 8" → "08:30", para mostrarlo a una persona. */
function comoHora(hm) {
  const [m, h] = String(hm).trim().split(/\s+/).map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Verifica que la sesión de Google siga viva y avisa si no. Corre un rato
 * antes de cada envío: es la diferencia entre enterarse con tiempo de
 * arreglarlo y enterarse cuando el reporte ya no llegó.
 *
 * @param {string} horaEnvio  a qué hora saldría el envío que esto protege
 */
let chequeando = false;

async function chequearSesion(horaEnvio = '') {
  if (trabajando) {
    console.log('[Chequeo] Hay un envío en curso; se omite el chequeo.');
    return;
  }
  // Dos chequeos a la vez abren dos Chrome sobre el mismo perfil y el
  // segundo falla con "The browser is already running".
  if (chequeando) {
    console.log('[Chequeo] Ya hay un chequeo en curso; se omite.');
    return;
  }
  chequeando = true;
  try {
    await hacerChequeo(horaEnvio);
  } finally {
    chequeando = false;
  }
}

async function hacerChequeo(horaEnvio) {
  // Además de Google, se aprovecha para asegurar que WhatsApp esté conectado.
  // Conectar tarda varios minutos en esta PC: si a esta altura no está listo,
  // forzar la reconexión ahora deja media hora de margen antes del envío, en
  // vez de descubrirlo cuando ya no hay tiempo.
  if (estado !== 'listo' && !reiniciando) {
    console.warn(`[Chequeo] WhatsApp está en "${estado}". Forzando reconexión con tiempo de sobra...`);
    reiniciarWhatsApp(false);
  }

  console.log(`[Chequeo] ${ahoraTexto()} — verificando la sesión de Google...`);
  let r;
  try {
    r = await sesionViva();
  } catch (err) {
    r = { ok: false, motivo: err && err.message ? err.message : String(err) };
  }

  ultimoChequeo = { cuando: ahoraTexto(), ok: r.ok, motivo: r.motivo || null };

  if (r.ok) {
    console.log('[Chequeo] ✓ La sesión de Google está bien.');
    return;
  }

  console.error(`[Chequeo] ⚠️  ${r.motivo}`);
  const avisos = destinatarios.avisos || [];
  if (!avisos.length || estado !== 'listo') return;

  const texto = '⚠️ *Flujo de Fondos* — atención\n\n'
    + `${r.motivo}.\n\n`
    + `Si no se arregla, el reporte${horaEnvio ? ` de las ${horaEnvio}` : ''} NO va a salir.\n\n`
    + 'En la PC, en una ventana de cmd:\n'
    + '`cd /d C:\\whatsapp-worker\\proyeccion`\n'
    + '`node sonda.js --login`\n\n'
    + 'Iniciá sesión con tableros@amh.com.ar, abrí el Flujo de Fondos y cerrá la ventana.';
  try { await mandarATodos(avisos, texto); } catch (_) {}
}

/**
 * El ciclo completo: genera las dos proyecciones y las manda.
 * Si la generación falla, avisa en vez de quedarse callado.
 */
async function generarYEnviar(motivo = '') {
  if (trabajando) {
    console.warn('[Trabajo] Ya hay uno en curso. Se omite.');
    return { ok: false, motivo: 'ya hay un envío en curso' };
  }
  trabajando = true;
  const detalle = [];
  let enviados = 0, salteados = 0;

  try {
    console.log(`\n[Trabajo] ${ahoraTexto()} — generando las proyecciones ${motivo}...`);

    // Si WhatsApp todavía está reconectando, se le da un rato: generar tarda
    // unos minutos igual, no tiene sentido abortar por eso.
    if (estado !== 'listo') {
      const min = Math.round(ESPERA_WHATSAPP_MS / 60000);
      console.warn(`[Trabajo] WhatsApp no está listo (${estado}). Espero hasta ${min} minutos...`);
      if (!await esperarListo(ESPERA_WHATSAPP_MS)) {
        throw new Error(`WhatsApp no se conectó en ${min} minutos (estado: ${estado})`);
      }
      console.log('[Trabajo] WhatsApp conectó. Sigo con la generación.');
    }

    // Si el destino es un grupo, tiene que estar resuelto ANTES de generar:
    // no tiene sentido gastar 5 minutos armando los PDF para descubrir
    // después que no hay a dónde mandarlos.
    if (destinatarios.grupo && !enPruebas() && !await resolverGrupo()) {
      const m = `no se pudo resolver el grupo "${destinatarios.grupo}"`;
      await avisarFalla(m);
      ultimoResumen = { cuando: ahoraTexto(), enviados: 0, salteados: 0, detalle: [`❌ ${m}`] };
      return { ok: false, motivo: m };
    }

    let hechos, fallados = [];
    try {
      const res = await generar();      // ← toda la lógica probada de sonda.js
      hechos = res.hechos;
      fallados = res.fallados || [];
    } catch (err) {
      console.error('[Trabajo] Falló la generación:', err.message);
      await avisarFalla(err.message);
      ultimoResumen = { cuando: ahoraTexto(), enviados: 0, salteados: 0, detalle: [`❌ generación: ${err.message}`] };
      return { ok: false, motivo: err.message };
    }

    // Guarda final: dos PDF con el mismo nombre de empresa significa que el
    // cambio de solapa no funcionó. Antes de mandar números de una empresa
    // con el rótulo de la otra, se prefiere no mandar nada.
    const titulos = hechos.map(h => h.titulo).filter(Boolean);
    if (titulos.length === 2 && titulos[0] === titulos[1]) {
      const m = `las dos proyecciones salieron con el nombre "${titulos[0]}" (no cambió la solapa)`;
      console.error(`[Trabajo] ${m}. NO se envía nada.`);
      await avisarFalla(m);
      ultimoResumen = { cuando: ahoraTexto(), enviados: 0, salteados: 0, detalle: [`❌ ${m}`] };
      return { ok: false, motivo: m };
    }

    /** Manda los PDF ya generados. Se puede repetir sin volver a generar. */
    async function mandarLosPdf() {
      let env = 0, salt = 0, rot = 0;
      const det = [];
      for (const h of hechos) {
        const base64 = fs.readFileSync(h.archivo).toString('base64');
        const media = new MessageMedia(MIME_PDF, base64, path.basename(h.archivo));
        const caption = `*Flujo de Fondos* — ${h.titulo || h.empresa}\n${fechaLegible()}`;
        console.log(`[Envío] ${h.empresa} (${h.kb} KB) a ${destinos().length} destino(s)...`);
        // sendMediaAsDocument fuerza la ruta de "documento" en vez de la
        // genérica de multimedia. Para un PDF es lo correcto, y usa código
        // interno distinto — el genérico falla con "upload failed: media
        // entry was not created" según la versión de WhatsApp Web.
        const r = await mandarATodos(destinos(), media, { caption, sendMediaAsDocument: true });
        env += r.enviados; salt += r.salteados; rot += r.rotas || 0;
        det.push(...r.detalle.map(d => `${h.empresa}: ${d}`));
      }
      return { env, salt, rot, det };
    }

    let r = await mandarLosPdf();

    // Si no salió NADA y fue porque la sesión estaba rota por dentro, se
    // reconecta y se reintenta. Los PDF ya están hechos, así que reintentar
    // el envío cuesta segundos: no tiene sentido perder el reporte por esto.
    if (r.env === 0 && r.rot > 0) {
      console.warn('[Envío] Ningún mensaje salió y la sesión estaba rota. Reconectando y reintentando...');
      if (await reconectarYEsperar()) {
        if (destinatarios.grupo && !enPruebas()) { grupoId = null; await resolverGrupo(); }
        const r2 = await mandarLosPdf();
        if (r2.env > 0) {
          console.log('[Envío] ✓ El reintento funcionó.');
          r = r2;
        } else {
          r.det.push(...r2.det.map(d => `(reintento) ${d}`));
        }
      } else {
        r.det.push('❌ no se pudo reconectar a WhatsApp para reintentar');
      }
    }

    enviados += r.env;
    salteados += r.salt;
    detalle.push(...r.det);

    // Los PDF se generaron pero no llegó ninguno: hay que avisar. Hasta hoy
    // este caso quedaba sólo en la terminal.
    if (enviados === 0) {
      await avisarFalla('se generaron los dos PDF pero NO se pudo enviar ninguno. Revisá la sesión de WhatsApp en http://localhost:3200');
    }

    // Si alguna empresa no salió, hay que avisar. Que llegue una sola
    // proyección sin decir nada es el peor caso: nadie nota lo que falta.
    if (fallados.length) {
      const lista = fallados.map(f => `• ${f.empresa}: ${f.motivo}`).join('\n');
      detalle.push(...fallados.map(f => `❌ ${f.empresa}: no se pudo generar`));
      await avisarFalla(`no se pudo generar ${fallados.length === 1 ? 'una empresa' : 'algunas empresas'}:\n${lista}`);
    }

    limpiarViejos();
    ultimoResumen = { cuando: ahoraTexto(), enviados, salteados, detalle };
    console.log(`[Trabajo] Terminado. Enviados: ${enviados}, salteados: ${salteados}${fallados.length ? `, empresas sin generar: ${fallados.length}` : ''}.`);
    return { ok: true, enviados, salteados, detalle, fallados };
  } finally {
    trabajando = false;
  }
}

/* ---------------------------------------------
 * PANEL WEB
 * -------------------------------------------*/
function paginaHtml() {
  const etiquetas = {
    iniciando: '⏳ Iniciando...',
    esperando_qr: '📲 Escaneá el QR con la línea de la empresa',
    conectando: '🔄 Conectando...',
    listo: '✅ Conectado y listo',
    desconectado: '❌ Desconectado',
  };
  const qrBloque = (estado === 'esperando_qr' && ultimoQrDataUrl)
    ? `<p>WhatsApp en el celular de la empresa → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>:</p>
       <img src="${ultimoQrDataUrl}" alt="QR" style="width:280px;height:280px" />`
    : '';
  const horarios = HORARIOS.map(h => {
    const [m, hh] = h.split(' ');
    return `${hh}:${String(m).padStart(2, '0')}`;
  }).join(' y ');
  const dest = enPruebas()
    ? `<b style="color:#c60">MODO PRUEBA — sólo ${process.env.SOLO_A}</b>`
    : (destinatarios.grupo
        // Rojo SÓLO si el grupo no está resuelto, o sea si no hay a dónde
        // mandar. Que no se pueda leer el nombre no impide nada: WhatsApp Web
        // tiene roto el listado de chats, pero con el ID se manda igual.
        ? (nombreGrupo
            ? `grupo <b>${nombreGrupo}</b>`
            : (grupoId
                ? `grupo <b>${grupoId}</b> <span style="font-size:12px">(el nombre no se puede leer, no afecta el envío)</span>`
                // Mientras no esté conectado el grupo todavía no se resolvió,
                // y eso es normal: no hay que pintarlo de rojo. Sólo alarma si
                // ya conectó y aun así no se pudo resolver.
                : (estado !== 'listo'
                    ? `grupo <b>${destinatarios.grupo}</b> <span style="font-size:12px">(se resuelve al conectar)</span>`
                    : `<b style="color:#c00">grupo SIN RESOLVER: ${destinatarios.grupo}</b>`)))
        : `<b>${destinatarios.numeros.length}</b> números`);
  const chequeoBloque = ultimoChequeo
    ? (ultimoChequeo.ok
        ? `<p style="color:#282">✓ Sesión de Google verificada (${ultimoChequeo.cuando}).</p>`
        : `<p style="color:#c00">⚠️ <b>Sesión de Google con problemas</b> (${ultimoChequeo.cuando}): ${ultimoChequeo.motivo}<br>
           <span style="font-size:13px">Hay que correr <code>node sonda.js --login</code> en la PC.</span></p>`)
    : '';
  const resumenBloque = ultimoResumen
    ? `<h3>Último envío (${ultimoResumen.cuando})</h3>
       <p>Enviados: <b>${ultimoResumen.enviados}</b> · Salteados: <b>${ultimoResumen.salteados}</b></p>
       <ul>${ultimoResumen.detalle.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Flujo de Fondos — envío por WhatsApp</title>
    <meta http-equiv="refresh" content="10">
    <style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#222}
    h1{color:#2c7be5}button{background:#2c7be5;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-size:15px;cursor:pointer}
    .estado{font-size:18px;margin:12px 0}hr{border:0;border-top:1px solid #ddd;margin:24px 0}</style></head><body>
    <h1>Flujo de Fondos — WhatsApp</h1>
    <p class="estado">Estado: <b>${etiquetas[estado] || estado}</b></p>
    ${numeroConectado ? `<p class="estado">Envía desde: <b>${numeroConectado}</b></p>` : ''}
    <p style="color:#888;font-size:13px">Genera y envía a las ${horarios}, ${NOMBRE_DIAS} · destino: ${dest}<br>
    Generar tarda unos 4 minutos, así que los mensajes llegan un rato después de esa hora.</p>
    ${trabajando ? '<p style="color:#2c7be5"><b>⏳ Generando y enviando en este momento...</b></p>' : ''}
    ${chequeoBloque}
    ${qrBloque}
    ${estado === 'listo' && !trabajando ? `
      <hr>
      <form method="POST" action="/chequear" style="margin:12px 0">
        <button type="submit" style="background:#888">Verificar la sesión de Google</button>
      </form>
      <form method="POST" action="/prueba" style="margin:12px 0"
            onsubmit="return confirm('Manda un mensaje de texto corto al destino. ¿Continuar?')">
        <button type="submit" style="background:#888">Mandar mensaje de prueba al destino</button>
      </form>
      <form method="POST" action="/prueba-pdf" style="margin:12px 0"
            onsubmit="return confirm('Manda el ÚLTIMO PDF generado al destino, sin generar uno nuevo. ¿Continuar?')">
        <button type="submit" style="background:#888">Mandar el último PDF (prueba de archivo)</button>
      </form>
      <form method="POST" action="/enviar" onsubmit="return confirm('Esto genera las dos proyecciones y las envía a los destinatarios. ¿Continuar?')">
        <button type="submit">Generar y enviar ahora</button>
      </form>` : ''}
    ${resumenBloque}
    <p style="color:#888;font-size:13px">La página se actualiza sola cada 10 segundos.</p>
    </body></html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/chequear') {
    chequearSesion().catch(err => console.error('[Chequeo] Error:', err.message));
    res.writeHead(303, { Location: '/' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/prueba-pdf') {
    pruebaPdf().catch(err => console.error('[Prueba PDF] Error:', err.message));
    res.writeHead(303, { Location: '/' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/prueba') {
    pruebaAlDestino().catch(err => console.error('[Prueba] Error:', err.message));
    res.writeHead(303, { Location: '/' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/enviar') {
    generarYEnviar('(a pedido desde el panel)').catch(err => console.error('[Trabajo] Error:', err.message));
    res.writeHead(303, { Location: '/' });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(paginaHtml());
});

/* ---------------------------------------------
 * ARRANQUE
 * -------------------------------------------*/
/**
 * Se asegura de ser la única instancia, usando el puerto del panel como
 * candado: si ya está tomado, es que hay otro enviador corriendo.
 *
 * Sin esto, una segunda copia queda reintentando para siempre con
 * "The browser is already running" — Chrome no deja compartir la sesión de
 * WhatsApp. Pasa fácil: la tarea programada levanta una mientras hay otra
 * abierta a mano.
 */
function tomarPuerto() {
  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        reject(new Error(`el puerto ${PORT} ya está ocupado`));
      } else {
        reject(err);
      }
    });
    server.listen(PORT, resolve);
  });
}

async function main() {
  try {
    await tomarPuerto();
    console.log(`[Web] Panel de control en http://localhost:${PORT}`);
  } catch (err) {
    console.error(`\n⛔ Ya hay otro enviador corriendo (${err.message}).`);
    console.error('   Esta copia se cierra para no pelearse por la sesión de WhatsApp.');
    console.error('   Si querés reiniciarlo, cerrá primero la otra ventana.\n');
    process.exit(9);        // 9 = "ya había otra instancia" (lo lee iniciar.bat)
  }

  console.log(`[WhatsApp] Inicializando (segundo dispositivo vinculado, WhatsApp Web ${WEB_VERSION})...`);
  reiniciarWhatsApp(false);

  // Watchdog: si queda trabado sin llegar a "listo" ni pedir QR, reconecta.
  setInterval(() => {
    if (estado === 'listo' || estado === 'esperando_qr') { ultimoOk = Date.now(); return; }
    if (!reiniciando && (Date.now() - ultimoOk) > 4 * 60 * 1000) {
      console.warn(`[Watchdog] Sin conectar hace rato (${estado}). Forzando reconexión...`);
      ultimoOk = Date.now();
      reiniciarWhatsApp(false);
    }
  }, 30000);

  // Sonda de vida: el watchdog de arriba sólo mira el estado que el programa
  // se cree. Pero la sesión puede morir POR DENTRO sin avisar —WhatsApp Web
  // se recarga solo— y quedar "lista" con la página muerta. Se le pregunta
  // cada 5 minutos si sigue realmente conectada; así se recupera sola, mucho
  // antes de que llegue la hora del envío.
  setInterval(async () => {
    if (estado !== 'listo' || trabajando || reiniciando) return;
    try {
      const st = await conTimeout(client.getState(), 30000, 'el estado de WhatsApp');
      if (st !== 'CONNECTED') throw new Error(`devolvió "${st}"`);
    } catch (err) {
      const m = err && err.message ? err.message : String(err);
      console.warn(`[Sonda] Dice estar lista pero no responde bien (${m}). Reconectando...`);
      reiniciarWhatsApp(false);
    }
  }, 5 * 60 * 1000);

  // --grupos: lista los grupos con su ID y termina.
  if (process.argv.includes('--grupos')) {
    console.log('[Grupos] Esperando a que conecte WhatsApp...');
    if (await esperarListo(3 * 60 * 1000)) {
      const chats = await client.getChats();
      console.log('\nGrupos disponibles:\n');
      chats.filter(c => c.isGroup).forEach(g => console.log(`  ${g.id._serialized}   ${g.name}`));
      console.log('\nCopiá el ID que quieras en el campo "grupo" de destinatarios.js\n');
    } else {
      console.error('No se pudo conectar.');
    }
    process.exit(0);
  }

  // --probar: manda un texto y no genera nada. Para validar la línea.
  if (process.argv.includes('--probar')) {
    console.log('[Prueba] Esperando a que conecte WhatsApp...');
    if (await esperarListo(3 * 60 * 1000)) {
      const r = await mandarATodos(destinatarios.avisos, `Prueba del enviador de Flujo de Fondos — ${ahoraTexto()}`);
      console.log(`[Prueba] Enviados: ${r.enviados}, salteados: ${r.salteados}`);
    }
    process.exit(0);
  }

  // Cron de los envíos
  for (const hm of HORARIOS) {
    const expr = `${hm} * * ${DIAS}`;
    if (!cron.validate(expr)) {
      console.error(`[Cron] Horario inválido: "${hm}" (se ignora).`);
      continue;
    }
    cron.schedule(expr, () => {
      console.log(`[Cron] ${hm} — disparando el flujo de fondos.`);
      generarYEnviar(`(cron ${hm})`).catch(err => console.error('[Cron] Error:', err.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
  }
  console.log(`[Cron] Programado: ${HORARIOS.join(' | ')} — ${NOMBRE_DIAS} (hora Argentina).`);

  // Chequeo previo de la sesión de Google, un rato antes de cada envío.
  if (MINUTOS_CHEQUEO > 0) {
    const avisados = [];
    for (const hm of HORARIOS) {
      const antes = restarMinutos(hm, MINUTOS_CHEQUEO);
      const expr = `${antes} * * ${DIAS}`;
      if (!cron.validate(expr)) continue;
      const horaEnvio = comoHora(restarMinutos(hm, -5));   // el envío llega ~5 min después
      cron.schedule(expr, () => {
        chequearSesion(horaEnvio).catch(err => console.error('[Chequeo] Error:', err.message));
      }, { timezone: 'America/Argentina/Buenos_Aires' });
      avisados.push(comoHora(antes));
    }
    console.log(`[Chequeo] Sesión de Google verificada a las ${avisados.join(' y ')} (${MINUTOS_CHEQUEO} min antes de cada envío).`);
  }
  if (enPruebas()) {
    console.log(`[Destino] ⚠️  MODO PRUEBA (SOLO_A): todo va únicamente a ${process.env.SOLO_A}.`);
  } else {
    console.log(`[Destino] ${destinatarios.grupo ? `grupo ${destinatarios.grupo}` : `${destinatarios.numeros.length} números`}.`);
  }

  if (process.argv.includes('--ahora')) {
    console.log('[Inicio] --ahora detectado: se generará y enviará apenas WhatsApp esté listo.');
    if (await esperarListo(5 * 60 * 1000)) {
      generarYEnviar('(--ahora)').catch(err => console.error('[Trabajo] Error:', err.message));
    }
  }
}

main().catch(err => {
  console.error('[Fatal] Error al arrancar:', err && err.message ? err.message : err);
});
