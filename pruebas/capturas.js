'use strict';
/**
 * Levanta la app con datos de ejemplo y saca capturas de las pantallas a
 * 390 × 844 (el teléfono del handoff) para compararlas con el diseño.
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
process.env.PORT = '3197';

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

function hoy() { return new Date().toISOString().split('T')[0]; }
function ayer() { return new Date(Date.now() - 86400000).toISOString().split('T')[0]; }

/* ── Datos de ejemplo, parecidos a los del diseño ─────────────────────── */
async function sembrar() {
  const R = baseFalsa.collection('registros');
  let n = 0;
  const nuevo = (o) => {
    n++;
    return Object.assign({
      idTicket: n, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
      pesadaPara: 'CAMIONES', anulado: false, modificaciones: 0, confirmada: false,
      origen: 'app', cargadoPor: 'Juan Sosa', appImpreso: true,
      creadoEn: new Date(Date.now() - 3600000 * (12 - n)),
    }, o);
  };

  // El Mataco (5679) — cerrados
  const cerrados = [
    { patentes: 'AC 884 TF', transporte: 'Ciriaci', chofer: 'R. Gómez', grano: 'SOJA', lote: ['El 44'], neto: 36900 },
    { patentes: 'HJ 210 QW', transporte: 'Sonzogni', chofer: 'M. Díaz', grano: 'SOJA', lote: ['El 44'], neto: 31240 },
    { patentes: 'AF 902 LK', transporte: 'Avelleira', chofer: 'J. Pérez', grano: 'SOJA', lote: ['El Ombú'], neto: 28500 },
    { patentes: 'AB 123 CD', transporte: 'Ciriaci', chofer: 'L. Ruiz', grano: 'MAIZ', lote: ['La Loma'], neto: 29800 },
    { patentes: 'KT 551 MB', transporte: 'Sonzogni', chofer: 'A. Vera', grano: 'MAIZ', lote: ['La Loma'], neto: 30100 },
    { patentes: 'OP 774 RS', transporte: 'Ciriaci', chofer: 'D. Molina', grano: 'TRIGO', lote: ['El 44'], neto: 23140 },
  ];
  for (const c of cerrados) {
    await R.insertOne(nuevo(Object.assign({}, c, {
      campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
      pesadaPara: 'REGULADA', confirmada: true,
      brutoEstimado: 52500, tara: 15600, netoEstimado: 36900,
      brutoLote: c.neto + 15600, bruto: c.neto + 15600,
      cargoDe: 'SILOBOLSA', silobolsa: '12',
      fechaTaraFinal: hoy(), fechaRegulada: hoy(),
      nroApp: '1-000' + n,
    })));
  }

  // El Mataco — abiertos
  await R.insertOne(nuevo({
    patentes: 'LM 336 VT', transporte: 'Avelleira', chofer: 'S. Ojeda',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 52500, tara: 15600, netoEstimado: 36900,
    fechaTaraFinal: ayer(), fecha: ayer(), nroApp: '1-0007', appImpreso: true,
  }));
  await R.insertOne(nuevo({
    patentes: 'TR 445 KL', transporte: 'Ciriaci', chofer: 'P. Núñez',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 55000, tara: 0, netoEstimado: 55000, nroApp: '1-0008',
  }));
  await R.insertOne(nuevo({
    patentes: 'ZX 990 PQ', transporte: 'Sonzogni', chofer: 'H. Vega',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 45000, tara: 14200, netoEstimado: 30800,
    fechaTaraFinal: hoy(), nroApp: '1-0009', appImpreso: false,
  }));

  // La Pradera (5680)
  for (const c of [
    { patentes: 'QW 111 AS', transporte: 'Ciriaci', chofer: 'F. Lugo', neto: 28560 },
    { patentes: 'ER 222 DF', transporte: 'Avelleira', chofer: 'C. Sosa', neto: 29120 },
  ]) {
    await R.insertOne(nuevo(Object.assign({}, c, {
      campo: 'La Pradera - ARBOL BLANCO - SE', codigoIngreso: '5680',
      usuario: 'M. Rivero', cargadoPor: 'M. Rivero',
      pesadaPara: 'REGULADA', confirmada: true, grano: 'MAIZ', lote: ['La Loma'],
      brutoEstimado: 45000, tara: 14000, netoEstimado: 31000,
      brutoLote: c.neto + 14000, bruto: c.neto + 14000,
      cargoDe: 'SILOBOLSA', silobolsa: '4',
      fechaTaraFinal: hoy(), fechaRegulada: hoy(), nroApp: '1-00' + (10 + n),
    })));
  }
  // Camión repetido en La Pradera
  await R.insertOne(nuevo({
    patentes: 'AC 884 TF', transporte: 'Sonzogni', chofer: 'R. Gómez',
    campo: 'La Pradera - ARBOL BLANCO - SE', codigoIngreso: '5680',
    usuario: 'M. Rivero', cargadoPor: 'M. Rivero',
    brutoEstimado: 45000, tara: 0, netoEstimado: 45000, nroApp: '1-0044',
  }));

  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: hoy(), nombre: 'Juan Sosa' });
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: ayer(), nombre: 'D. Ferreyra' });
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5680', fecha: hoy(), nombre: 'M. Rivero' });

  const abierto = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0044');
  await baseFalsa.collection('app_pedidos').insertOne({
    registroId: abierto._id, idTicket: abierto.idTicket, nro: '1-0044',
    patentes: 'AC 884 TF', codigoIngreso: '5680', balanza: 'La Pradera',
    tipo: 'ANULACION', motivo: 'Cargué la tara del acoplado equivocado, el camión ya salió.',
    pedidoPor: 'M. Rivero', estado: 'PENDIENTE', creadoEn: new Date(),
  });

  await baseFalsa.collection('app_contadores').insertOne({ _id: 'nroApp', seq: 44 });
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
  await sembrar();
  fs.mkdirSync(SALIDA, { recursive: true });

  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });

  async function sesion(code) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    });
    const pg = await ctx.newPage();
    await pg.goto(BASE + '/app/ingreso');
    await pg.evaluate(async (c) => {
      await fetch('/app/api/ingreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
    }, code);
    return { ctx, pg };
  }

  const errores = [];
  async function capturar(pg, url, nombre, antes) {
    pg.once('pageerror', (e) => errores.push(nombre + ': ' + e.message));
    await pg.goto(BASE + url, { waitUntil: 'networkidle' });
    if (antes) await antes(pg);
    await pg.waitForTimeout(250);
    const alto = await pg.evaluate(() => document.body.scrollHeight);
    await pg.setViewportSize({ width: 390, height: Math.max(844, Math.min(alto + 20, 2400)) });
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: SALIDA + '/' + nombre + '.png' });
    const anchoScroll = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (anchoScroll > 2) errores.push(nombre + ': la página se va de ancho (' + anchoScroll + 'px)');
    await pg.setViewportSize({ width: 390, height: 844 });
    console.log('  · ' + nombre);
  }

  console.log('\nCapturas del balancero (El Mataco):');
  {
    // El ingreso se captura SIN sesión (con sesión redirige al patio)
    const ctxLimpio = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    });
    const pgLimpio = await ctxLimpio.newPage();
    await capturar(pgLimpio, '/app/ingreso', '01-ingreso-6a', async (p) => {
      await p.click('[data-tecla="5"]'); await p.click('[data-tecla="6"]');
      await p.click('[data-tecla="7"]'); await p.click('[data-tecla="9"]');
    });
    await ctxLimpio.close();

    const { ctx, pg } = await sesion('5679');
    await capturar(pg, '/app/dia', '02-nombre-del-dia-6b');
    await capturar(pg, '/app/patio', '03-patio-1a');
    await capturar(pg, '/app/nueva-pesada', '04-nueva-pesada');
    const abierto = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0008');
    await capturar(pg, '/app/tara-final/' + abierto._id, '05-tara-final');
    await capturar(pg, '/app/tara-final/' + abierto._id, '06-recordatorio-impresion-5e', async (p) => {
      await p.evaluate(() => { document.getElementById('modal-imprimir').hidden = false; });
    });
    const conTF = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0009');
    await capturar(pg, '/app/regulada/' + conTF._id, '07-regulada');
    const cerrado = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0001');
    await capturar(pg, '/app/registro/' + cerrado._id, '08-detalle-ticket-7d');
    await capturar(pg, '/app/registro/' + cerrado._id, '09-anular-general-6d', async (p) => {
      await p.evaluate(() => { document.getElementById('modal-anular').hidden = false; });
      await p.click('#modal-anular [data-tecla="1"]');
      await p.click('#modal-anular [data-tecla="2"]');
      await p.click('#modal-anular [data-tecla="3"]');
    });
    await capturar(pg, '/app/pedir/' + conTF._id + '?tipo=anulacion', '10-pedir-anulacion-6e');

    // Patio sin señal (7a)
    await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    await pg.evaluate(() => {
      window.localStorage.setItem('pesada.cola', JSON.stringify([
        { localId: 'a', tipo: 'pesada', datos: { patentes: 'NN 555 XY', transporte: 'Ciriaci', chofer: 'A. Luna', nro: '1-0045' } },
        { localId: 'b', tipo: 'pesada', datos: { patentes: 'MM 777 ZZ', transporte: 'Sonzogni', chofer: 'B. Paz', nro: '1-0046' } },
        { localId: 'c', tipo: 'tara-final', datos: {} },
      ]));
      window.dispatchEvent(new Event('offline'));
    });
    await pg.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await pg.waitForTimeout(400);
    const alto = await pg.evaluate(() => document.body.scrollHeight).catch(() => 844);
    await pg.setViewportSize({ width: 390, height: Math.max(844, Math.min(alto + 20, 2400)) });
    await pg.screenshot({ path: SALIDA + '/12-patio-sin-senal-7a.png' });
    console.log('  · 12-patio-sin-senal-7a');
    await ctx.setOffline(false);
    await ctx.close();
  }

  console.log('\nCapturas de GENERAL:');
  {
    const { ctx, pg } = await sesion('12341');
    await capturar(pg, '/app/general', '13-resumen-general-8a');
    await capturar(pg, '/app/general/balanza/5679', '14-detalle-balanza-8c');
    await capturar(pg, '/app/general/pedidos', '15-pedidos-general-6f');
    await capturar(pg, '/app/general/repetidos', '16-camiones-repetidos');
    await ctx.close();
  }

  console.log('\nTicket imprimible:');
  {
    const ctx = await browser.newContext({
      viewport: { width: 900, height: 600 },
      extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    });
    const pg = await ctx.newPage();
    await pg.goto(BASE + '/app/ingreso');
    await pg.evaluate(async () => {
      await fetch('/app/api/ingreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '5679' }),
      });
    });
    // Bloquear el print automático para poder ver la pantalla
    await pg.addInitScript(() => { window.print = function () {}; });
    const tf = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0009');
    const cerrado = baseFalsa.collection('registros').docs.find((d) => d.nroApp === '1-0001');
    await pg.goto(BASE + '/app/imprimir?ids=' + tf._id, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: SALIDA + '/17-ticket-tara-final-5a.png', fullPage: true });
    console.log('  · 17-ticket-tara-final-5a');
    await pg.goto(BASE + '/app/imprimir?ids=' + cerrado._id, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: SALIDA + '/18-ticket-completo-5a.png', fullPage: true });
    console.log('  · 18-ticket-completo-5a');

    // Medida real del ticket, en cm
    const medida = await pg.evaluate(() => {
      const t = document.querySelector('.tk');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { ancho: r.width / 96 * 2.54, alto: r.height / 96 * 2.54 };
    });
    console.log('\nMedida del ticket: ' + medida.ancho.toFixed(2) + ' × ' + medida.alto.toFixed(2) + ' cm (objetivo 19 × 4,5)');
    if (Math.abs(medida.ancho - 19) > 0.1 || Math.abs(medida.alto - 4.5) > 0.1) {
      errores.push('el ticket no mide 19 × 4,5 cm');
    }

    // Hoja con 6 tickets (agrupado)
    const seis = baseFalsa.collection('registros').docs.slice(0, 6).map((d) => String(d._id)).join(',');
    await pg.goto(BASE + '/app/imprimir?ids=' + seis, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: SALIDA + '/19-hoja-6-tickets.png', fullPage: true });
    console.log('  · 19-hoja-6-tickets');
    const cuantasHojas = await pg.evaluate(() => document.querySelectorAll('.tk-hoja').length);
    const cuantosTk = await pg.evaluate(() => document.querySelectorAll('.tk').length);
    console.log('  → ' + cuantosTk + ' tickets en ' + cuantasHojas + ' hoja(s)');
    if (cuantosTk !== 6 || cuantasHojas !== 1) errores.push('el agrupado de a 6 por hoja no salió');
    await ctx.close();
  }

  await browser.close();

  console.log('\n════════════════════════════════════════');
  if (errores.length) {
    console.log('  PROBLEMAS:');
    errores.forEach((e) => console.log('   - ' + e));
  } else {
    console.log('  Sin errores de JS ni desbordes de ancho');
  }
  console.log('  Capturas en ' + SALIDA);
  console.log('════════════════════════════════════════');
  process.exit(errores.length ? 1 : 0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
