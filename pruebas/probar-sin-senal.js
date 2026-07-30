'use strict';
/**
 * Prueba en navegador de verdad: cargar sin señal, imprimir sin señal, y que
 * al volver la conexión se suba solo sin duplicar. Además, ancho de 360 px.
 */
const path = require('path');
const { buscarChromium } = require('./buscar-chromium');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = '3196';

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
require.cache[rutaNotif].exports = { resolverNombreCodigo: notifReal.resolverNombreCodigo, notificar: () => {} };

require(path.join(PROY, 'app.js'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}
const registros = () => baseFalsa.collection('registros').docs;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await esperar(1200);
  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });

  // 360 px: el mínimo que tiene que andar según el handoff
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
  });
  const pg = await ctx.newPage();
  const erroresJs = [];
  pg.on('pageerror', (e) => erroresJs.push(e.message));

  console.log('\n── Ingreso y arranque del día (360 px de ancho)');
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  for (const d of ['5', '6', '7', '9']) await pg.click('[data-tecla="' + d + '"]');
  await pg.click('#entrar');
  await pg.waitForURL('**/app/dia', { timeout: 10000 });
  ok('el ingreso con teclado propio entra', pg.url().indexOf('/app/dia') !== -1, pg.url());

  await pg.fill('#nombre', 'Juan Sosa');
  await pg.click('#empezar');
  await pg.waitForURL('**/app/patio', { timeout: 10000 });
  ok('el nombre del día lleva al patio', pg.url().indexOf('/app/patio') !== -1);

  const desborde = await pg.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('a 360 px no se va de ancho', desborde <= 2, desborde + 'px');

  console.log('\n── Reserva de números al abrir con señal');
  await esperar(1200);
  let reservados = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.numeros') || '[]'));
  ok('el teléfono guardó números reservados', reservados.length >= 3, JSON.stringify(reservados));

  console.log('\n── Cargar una pesada SIN SEÑAL');
  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'networkidle' });
  await pg.fill('#patentes', 'SS 123 AA');
  await pg.fill('#chofer', 'Sin Senal');
  await pg.fill('#transporte', 'Ciriaci');
  await pg.selectOption('#campo', 'El Mataco - SACHAYOJ - SE');

  const antes = registros().length;
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await pg.waitForTimeout(200);

  const textoBoton = await pg.textContent('[data-necesita-internet]').catch(() => '');
  ok('sin señal la app se muestra SIN SEÑAL', (await pg.textContent('[data-conexion]')).indexOf('SIN SEÑAL') !== -1);

  await pg.click('#guardar');
  await pg.waitForTimeout(700);

  ok('la pesada NO llegó al servidor (no hay señal)', registros().length === antes, registros().length);
  const cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('quedó guardada en la cola del teléfono', cola.length === 1 && cola[0].datos.patentes === 'SS 123 AA',
    JSON.stringify(cola).slice(0, 250));
  ok('usó un número reservado', !!cola[0].datos.nro, JSON.stringify(cola[0].datos.nro));
  ok('tiene su id local (para no duplicarse)', !!cola[0].localId);
  const nroUsado = cola[0].datos.nro;

  console.log('\n── El patio la muestra con el chip SIN SUBIR');
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(600);
  const htmlPatio = await pg.content();
  ok('el patio se ve sin señal (lo sirve el service worker)', /Patio/.test(htmlPatio), htmlPatio.slice(0, 200));
  ok('aparece la pesada guardada en el teléfono', /SS 123 AA/.test(htmlPatio));
  ok('con el chip SIN SUBIR', /SIN SUBIR/i.test(htmlPatio));
  ok('avisa "1 pesada guardada en el teléfono"', /1 pesada guardada/.test(htmlPatio), '');

  console.log('\n── Imprimir sin señal');
  await pg.addInitScript(() => { window.print = function () { window.__imprimio = true; }; });
  await pg.goto(BASE + '/app/imprimir?locales=' + encodeURIComponent(cola[0].localId), { waitUntil: 'domcontentloaded' })
    .catch(() => {});
  await pg.waitForTimeout(900);
  const htmlTk = await pg.content();
  ok('el ticket se dibuja sin señal', /SS 123 AA/.test(htmlTk), htmlTk.slice(0, 300));
  ok('con el número que tenía reservado', htmlTk.indexOf(nroUsado) !== -1, nroUsado);
  ok('avisa que se armó con los datos del teléfono', /datos del teléfono/.test(htmlTk));

  console.log('\n── Vuelve internet: se sube sola');
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pg.waitForTimeout(300);
  await ctx.setOffline(false);
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await pg.waitForTimeout(2500);

  ok('la pesada llegó al servidor', registros().length === antes + 1, registros().length);
  const subida = registros()[registros().length - 1];
  ok('con los datos correctos', subida && subida.patentes === 'SS 123 AA' && subida.chofer === 'Sin Senal',
    JSON.stringify(subida || {}).slice(0, 250));
  ok('conservó el número reservado', subida && subida.nroApp === nroUsado, (subida || {}).nroApp + ' vs ' + nroUsado);
  ok('quedó el nombre del día como usuario', subida && subida.usuario === 'Juan Sosa', (subida || {}).usuario);

  const colaDespues = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la cola quedó vacía', colaDespues.length === 0, JSON.stringify(colaDespues));

  console.log('\n── No se duplica si se reintenta');
  await pg.evaluate((item) => {
    localStorage.setItem('pesada.cola', JSON.stringify([item]));
  }, cola[0]);
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await pg.waitForTimeout(2000);
  ok('reenviarla NO crea otro registro', registros().length === antes + 1, registros().length);
  const colaFinal = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('y la cola se limpia igual', colaFinal.length === 0, JSON.stringify(colaFinal));

  console.log('\n── Pedir anulación sin señal queda apagado');
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await pg.waitForTimeout(300);
  const botones = await pg.$$('[data-necesita-internet]');
  if (botones.length) {
    const clase = await botones[0].getAttribute('class');
    const texto = await botones[0].textContent();
    const apagado = await botones[0].isDisabled();
    ok('el botón se ve apagado, no se esconde', /btn-apagado/.test(clase || '') && apagado, clase);
    ok('con el motivo "necesita internet" debajo', /necesita internet/.test(texto || ''), texto);
  } else {
    ok('hay botones que necesitan internet', false, 'no se encontró ninguno');
  }
  await ctx.setOffline(false);

  ok('sin errores de JavaScript en toda la corrida', erroresJs.length === 0, erroresJs.join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
