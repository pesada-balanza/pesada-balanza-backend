'use strict';
/**
 * Lo que reportó Matías: sin señal se podía cargar CAMIONES pero no seguir con
 * TARA FINAL ni REGULADA. Esta prueba hace el ticket COMPLETO en modo avión,
 * imprime, y después prende los datos y verifica que todo suba en orden, sobre
 * un solo registro y con los números correctos.
 */
const path = require('path');
const { buscarChromium } = require('./buscar-chromium');
const fs = require('fs');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);
const SALIDA = __dirname + '/capturas';

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = '3193';

const { BaseFalsa } = require('./doble-mongo');
const baseFalsa = new BaseFalsa();

const session = require(path.join(PROY, 'node_modules', 'express-session'));
const rutaCM = require.resolve(path.join(PROY, 'node_modules', 'connect-mongo'));
require.cache[rutaCM] = { id: rutaCM, filename: rutaCM, loaded: true, exports: { create: () => new session.MemoryStore() } };

const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

const rutaNotif = require.resolve(path.join(PROY, 'notificaciones.js'));
const notifReal = require(rutaNotif);
const emails = [];
require.cache[rutaNotif].exports = {
  resolverNombreCodigo: notifReal.resolverNombreCodigo,
  notificar: (o) => emails.push(o),
};

require(path.join(PROY, 'app.js'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}
const registros = () => baseFalsa.collection('registros').docs;

/** Chromium de Playwright, si está instalado. */
function navegador() {
  try {
    return require(path.join(PROY, 'node_modules', 'playwright')).chromium;
  } catch (e) {
    console.log('\n  SALTEADA: falta Playwright. Instalalo con:');
    console.log('    npm install --no-save playwright\n');
    process.exit(0);
  }
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));
  fs.mkdirSync(SALIDA, { recursive: true });

  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
  });
  const pg = await ctx.newPage();
  const erroresJs = [];
  pg.on('pageerror', (e) => erroresJs.push(e.message));

  console.log('\n── Con señal: entrar y quedar listo para trabajar sin señal');
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  for (const d of ['5', '6', '7', '9']) await pg.click('[data-tecla="' + d + '"]');
  await pg.click('#entrar');
  await pg.waitForURL('**/app/dia', { timeout: 10000 });
  await pg.fill('#nombre', 'Juan Sosa');
  await pg.click('#empezar');
  await pg.waitForURL('**/app/patio', { timeout: 10000 });
  await pg.waitForTimeout(1500); // deja que reserve números y baje las tablas

  const listo = await pg.evaluate(() => ({
    numeros: JSON.parse(localStorage.getItem('pesada.numeros') || '[]').length,
    tablas: !!JSON.parse(localStorage.getItem('pesada.tablas') || 'null'),
  }));
  ok('el teléfono guardó números reservados', listo.numeros >= 3, listo.numeros);
  ok('y guardó campos, siembra y contratistas', listo.tablas === true);

  console.log('\n── MODO AVIÓN: el ticket completo en el teléfono');
  const antes = registros().length;
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));

  // ── Paso 1: CAMIONES
  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(400);
  await pg.fill('#patentes', 'AV 100 ON');
  await pg.fill('#chofer', 'Sin Senal');
  await pg.fill('#transporte', 'Ciriaci');
  await pg.selectOption('#campo', 'El Mataco - SACHAYOJ - SE');
  await pg.click('#guardar');
  await pg.waitForTimeout(1200);

  let cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la pesada queda en la cola', cola.length === 1 && cola[0].tipo === 'pesada', JSON.stringify(cola.map(c => c.tipo)));
  const refLocal = cola[0].localId;
  const nroTicket = cola[0].datos.nro;
  ok('con un número reservado', !!nroTicket, nroTicket);
  ok('nada llegó al servidor todavía', registros().length === antes, registros().length);

  // ── El patio ofrece el paso 2 (esto es lo que antes estaba trabado)
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(600);
  let html = await pg.content();
  ok('el patio muestra el camión sin subir', /AV 100 ON/.test(html));
  const enlaceTF = await pg.$('a[href*="/app/local?paso=tara-final"]');
  ok('YA NO dice "cuando se suba esta pesada": ofrece cargar la tara final', !!enlaceTF,
    /cuando se suba esta pesada/.test(html) ? 'sigue trabado' : 'sin enlace');

  const alto1 = await pg.evaluate(() => document.body.scrollHeight);
  await pg.setViewportSize({ width: 360, height: Math.max(740, Math.min(alto1 + 20, 2000)) });
  await pg.screenshot({ path: SALIDA + '/40-patio-sin-senal-paso1.png' });
  await pg.setViewportSize({ width: 360, height: 740 });

  // ── Paso 2: TARA FINAL, sin señal
  await enlaceTF.click();
  await pg.waitForTimeout(900);
  ok('la pantalla para seguir sin señal abre', pg.url().indexOf('/app/local') !== -1, pg.url());
  const htmlLocal = await pg.content();
  ok('muestra la patente de la pesada guardada', /AV 100 ON/.test(htmlLocal));
  ok('muestra el campo elegido', /El Mataco - SACHAYOJ - SE/.test(htmlLocal));
  ok('muestra el bruto estimado', /52\.500/.test(htmlLocal));

  await pg.fill('#l-tara', '15600');
  await pg.waitForTimeout(250);
  const netoEst = await pg.textContent('#l-neto');
  ok('calcula el neto estimado sin señal (52500 - 15600)', /36\.900/.test(netoEst), netoEst);

  await pg.screenshot({ path: SALIDA + '/41-tara-final-sin-senal.png' });

  await pg.click('#l-guardar');
  await pg.waitForTimeout(700);
  const modalAbierto = await pg.evaluate(() => {
    const m = document.getElementById('modal-imprimir');
    return !!m && !m.hidden;
  });
  ok('aparece el recordatorio de imprimir el ticket', modalAbierto);
  const textoModal = await pg.textContent('#modal-imprimir');
  ok('con el número del ticket', textoModal.indexOf(nroTicket) !== -1, textoModal.slice(0, 140));

  cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la tara final se encoló', cola.length === 2 && cola[1].tipo === 'tara-final',
    JSON.stringify(cola.map(c => c.tipo)));
  ok('apuntando a la pesada local', cola[1].datos.refLocal === refLocal, cola[1].datos.refLocal);

  // ── Imprimir sin señal
  await pg.addInitScript(() => { window.print = function () { window.__imprimio = true; }; });
  await pg.goto(BASE + '/app/imprimir?locales=' + encodeURIComponent(refLocal),
    { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(1200);
  const htmlTicket = await pg.content();
  ok('el ticket se imprime sin señal', /AV 100 ON/.test(htmlTicket));
  ok('con la tara final ya puesta', /15\.600/.test(htmlTicket));
  ok('y con su número', htmlTicket.indexOf(nroTicket) !== -1, nroTicket);
  await pg.screenshot({ path: SALIDA + '/42-ticket-sin-senal.png', fullPage: true });

  // ── El patio ahora ofrece el paso 3
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(600);
  html = await pg.content();
  ok('el patio ahora dice que falta la regulada', /Falta regulada/.test(html));
  ok('y muestra la tara final guardada', /15\.600 kg · guardada en el teléfono/.test(html));
  const enlaceReg = await pg.$('a[href*="/app/local?paso=regulada"]');
  ok('ofrece cargar la regulada sin señal', !!enlaceReg);

  // ── Paso 3: REGULADA, sin señal
  await enlaceReg.click();
  await pg.waitForTimeout(900);
  const htmlReg = await pg.content();
  ok('la regulada sin señal abre con los datos', /AV 100 ON/.test(htmlReg));
  ok('muestra la tara final como fija', /15\.600/.test(htmlReg) && /🔒 fijo/.test(htmlReg));

  const cuantosCampos = await pg.$$eval('#l-campo option', (o) => o.length);
  ok('trae los 43 campos guardados en el teléfono', cuantosCampos === 43, cuantosCampos);

  const granos = await pg.$$eval('#l-grano option', (o) => o.map((x) => x.value).filter(Boolean));
  ok('trae los granos del campo, sin internet', granos.length > 0, granos.join(','));

  await pg.selectOption('#l-grano', granos[0]);
  await pg.waitForTimeout(300);
  const lotes = await pg.$$eval('input[name="l-lote"]', (o) => o.map((x) => x.value));
  ok('y los lotes de ese grano', lotes.length > 0, lotes.slice(0, 3).join(','));

  await pg.check('input[name="l-lote"]');
  await pg.click('[data-opciones="l-cargoDe"] [data-valor="SILOBOLSA"]');
  await pg.waitForTimeout(250);
  const siloVisible = await pg.evaluate(() =>
    document.getElementById('l-caja-silo').className.indexOf('oculto') === -1);
  ok('al elegir Silobolsa aparece su campo (los botones quedaron enganchados)', siloVisible);

  await pg.fill('#l-silo', '12');
  await pg.fill('#l-brutoLote', '52000');
  await pg.fill('#l-bruto', '52500');
  await pg.waitForTimeout(300);
  const netoReg = await pg.textContent('#l-neto-reg');
  ok('calcula el neto sin señal', /36\.900/.test(netoReg), netoReg);

  await pg.screenshot({ path: SALIDA + '/43-regulada-sin-senal.png', fullPage: true });

  await pg.click('#l-guardar');
  await pg.waitForTimeout(1400);

  cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la regulada se encoló', cola.length === 3 && cola[2].tipo === 'regulada',
    JSON.stringify(cola.map(c => c.tipo)));
  ok('el ticket completo está en el teléfono, sin nada en el servidor',
    registros().length === antes, registros().length);

  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(600);
  html = await pg.content();
  ok('el patio lo marca como ticket completo', /Ticket completo/.test(html));

  console.log('\n── Vuelve internet: sube todo en orden');
  await ctx.setOffline(false);
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await pg.waitForTimeout(4000);

  ok('llegó UN solo registro al servidor', registros().length === antes + 1, registros().length);
  const doc = registros()[registros().length - 1];
  ok('con la patente correcta', doc.patentes === 'AV 100 ON', doc.patentes);
  ok('con el número reservado', doc.nroApp === nroTicket, doc.nroApp + ' vs ' + nroTicket);
  ok('la tara final se aplicó', doc.tara === 15600 && !!doc.fechaTaraFinal, doc.tara);
  ok('la regulada cerró el ticket', doc.pesadaPara === 'REGULADA' && doc.confirmada === true, doc.pesadaPara);
  ok('el neto quedó bien (52500 - 15600)', doc.neto === 36900, doc.neto);
  ok('el grano y el lote se guardaron', !!doc.grano && Array.isArray(doc.lote) && doc.lote.length > 0,
    doc.grano + '/' + JSON.stringify(doc.lote));
  ok('quedó el nombre del día', doc.usuario === 'Juan Sosa', doc.usuario);
  ok('se mandaron los avisos de tara final y regulada',
    emails.some((e) => e.tipo === 'TARA FINAL') && emails.some((e) => e.tipo === 'REGULADA'),
    JSON.stringify(emails.map(e => e.tipo)));

  const colaFinal = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la cola quedó vacía', colaFinal.length === 0, JSON.stringify(colaFinal.map(c => c.tipo)));

  console.log('\n── Reintento: no duplica nada');
  await pg.evaluate((items) => {
    localStorage.setItem('pesada.cola', JSON.stringify(items));
  }, cola);
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await pg.waitForTimeout(4000);
  ok('reenviar los tres pasos NO crea otro registro', registros().length === antes + 1, registros().length);
  const doc2 = registros()[registros().length - 1];
  ok('y no cambia el que ya estaba', doc2.neto === 36900 && doc2.nroApp === nroTicket,
    doc2.neto + '/' + doc2.nroApp);

  ok('sin errores de JavaScript en toda la corrida', erroresJs.length === 0, erroresJs.join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
