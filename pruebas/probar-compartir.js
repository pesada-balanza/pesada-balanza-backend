'use strict';
/**
 * Prueba en navegador del botón "Compartir el PDF": que prepare el archivo al
 * abrir la pantalla, que lo entregue al sistema como PDF, y que si el teléfono
 * no sabe compartir archivos lo descargue.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = '3195';

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
const hoy = () => new Date().toISOString().split('T')[0];
let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}

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

  // Un ticket cerrado (con regulada) y uno abierto
  const R = baseFalsa.collection('registros');
  const cerrado = await R.insertOne({
    idTicket: 1, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'REGULADA', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 52500, tara: 15600, netoEstimado: 36900,
    grano: 'SOJA', lote: ['El 44'], cargoDe: 'SILOBOLSA', silobolsa: '12',
    brutoLote: 52500, bruto: 52500, neto: 36900,
    fechaTaraFinal: hoy(), fechaRegulada: hoy(), confirmada: true,
    anulado: false, modificaciones: 0,
    origen: 'app', nroApp: '1-0001', cargadoPor: 'Juan Sosa', appImpreso: true,
    creadoEn: new Date(),
  });
  const abierto = await R.insertOne({
    idTicket: 2, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'CAMIONES', transporte: 'Ciriaci', patentes: 'TR 445 KL', chofer: 'P. Núñez',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 55000, tara: 0, netoEstimado: 55000,
    confirmada: false, anulado: false, modificaciones: 0,
    origen: 'app', nroApp: '1-0002', cargadoPor: 'Juan Sosa', appImpreso: false,
    creadoEn: new Date(),
  });
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: hoy(), nombre: 'Juan Sosa' });

  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    acceptDownloads: true,
  });
  const pg = await ctx.newPage();
  const erroresJs = [];
  pg.on('pageerror', (e) => erroresJs.push(e.message));

  await pg.goto(BASE + '/app/ingreso');
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });

  console.log('\n── El botón aparece solo cuando está la regulada');
  await pg.goto(BASE + '/app/registro/' + abierto.insertedId, { waitUntil: 'networkidle' });
  ok('en un ticket sin regulada NO aparece', (await pg.$('#compartir-pdf')) === null);
  ok('pero sí se puede imprimir', (await pg.content()).indexOf('Imprimir el ticket') !== -1);

  // Simular un teléfono que sabe compartir archivos
  await pg.addInitScript(() => {
    window.__compartido = null;
    navigator.canShare = function (d) {
      return !!(d && d.files && d.files.length && d.files[0].type === 'application/pdf');
    };
    navigator.share = function (d) {
      window.__compartido = {
        nombre: d.files[0].name,
        tipo: d.files[0].type,
        tamano: d.files[0].size,
        titulo: d.title,
        texto: d.text,
      };
      return Promise.resolve();
    };
  });

  console.log('\n── Compartir en un teléfono que sabe compartir archivos');
  await pg.goto(BASE + '/app/registro/' + cerrado.insertedId, { waitUntil: 'networkidle' });
  ok('el botón está', (await pg.$('#compartir-pdf')) !== null);
  await pg.waitForTimeout(900); // deja que prepare el archivo de antemano

  await pg.click('#compartir-pdf');
  await pg.waitForTimeout(600);

  const compartido = await pg.evaluate(() => window.__compartido);
  ok('se entregó el archivo al sistema', !!compartido, JSON.stringify(compartido));
  if (compartido) {
    ok('es un PDF', compartido.tipo === 'application/pdf', compartido.tipo);
    ok('con nombre prolijo', /^ticket-1-0001\.pdf$/.test(compartido.nombre), compartido.nombre);
    ok('pesa algo razonable', compartido.tamano > 1000 && compartido.tamano < 20000, compartido.tamano);
    ok('el texto que acompaña dice número, patente y neto',
      /1-0001/.test(compartido.texto) && /AC 884 TF/.test(compartido.texto) && /36\.900/.test(compartido.texto),
      compartido.texto);
    ok('el título es reconocible', /Ticket 1-0001/.test(compartido.titulo), compartido.titulo);
  }

  console.log('\n── Compartir fue instantáneo (el archivo ya estaba listo)');
  const tiempo = await pg.evaluate(async () => {
    window.__compartido = null;
    var t0 = performance.now();
    document.getElementById('compartir-pdf').click();
    // Si el archivo ya estaba preparado, share() se llama en el mismo toque.
    return { ya: window.__compartido !== null, ms: performance.now() - t0 };
  });
  ok('se comparte en el mismo toque (clave para el Safari del iPhone)', tiempo.ya === true,
    JSON.stringify(tiempo));

  console.log('\n── Teléfono/navegador que NO sabe compartir archivos');
  const ctx2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    acceptDownloads: true,
  });
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + '/app/ingreso');
  await pg2.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });
  await pg2.addInitScript(() => {
    try { delete navigator.share; } catch (e) {}
    try { delete navigator.canShare; } catch (e) {}
    navigator.share = undefined;
    navigator.canShare = undefined;
  });
  await pg2.goto(BASE + '/app/registro/' + cerrado.insertedId, { waitUntil: 'networkidle' });
  await pg2.waitForTimeout(900);

  const descarga = pg2.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await pg2.click('#compartir-pdf');
  const bajado = await descarga;
  ok('cae en descargar el PDF', !!bajado, 'no se disparó la descarga');
  if (bajado) {
    ok('con el nombre correcto', /^ticket-1-0001\.pdf$/.test(bajado.suggestedFilename()),
      bajado.suggestedFilename());
  }
  await ctx2.close();

  console.log('\n── Sin señal, el botón queda apagado');
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await pg.waitForTimeout(300);
  const btn = await pg.$('#compartir-pdf');
  const clase = await btn.getAttribute('class');
  const texto = await btn.textContent();
  ok('se muestra apagado, no se esconde', /btn-apagado/.test(clase || '') && (await btn.isDisabled()), clase);
  ok('con el motivo "necesita internet"', /necesita internet/.test(texto || ''), texto);
  await ctx.setOffline(false);

  ok('sin errores de JavaScript', erroresJs.length === 0, erroresJs.join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
