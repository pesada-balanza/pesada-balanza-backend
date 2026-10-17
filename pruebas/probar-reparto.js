'use strict';
/**
 * REPARTIR LOS KG DEL VIAJE ENTRE LOS TRACTORES
 *
 * Un camión se carga en el lote con las tolvas de uno o varios contratistas.
 * Hasta ahora el ticket decía quiénes habían cargado pero no cuánto puso cada
 * uno: los 30.900 kg quedaban en un solo bulto. Ahora se reparten igual que los
 * silobolsas — el último es el resto, así la suma cierra sola y nunca queda un
 * viaje con kg sin imputar.
 *
 * Acá se comprueban las tres cosas que pueden salir mal:
 *
 *  1. QUE LA SUMA CIERRE. En el teléfono y en el servidor, porque la cola sin
 *     señal reenvía lo que tenga guardado y ahí no hay pantalla que controle.
 *
 *  2. QUE SIGA CERRANDO DESPUÉS. Corregir la tara cambia el neto. Antes de
 *     esto, el reparto se quedaba como estaba y el ticket terminaba con kg que
 *     no eran de nadie: con la tara de 15.600 a 15.100 el neto pasaba a 31.400
 *     y las bolsas seguían sumando 30.900. Pasaba con los silobolsas, en
 *     producción, y nadie lo veía.
 *
 *  3. QUE LA PANTALLA HAGA LA CUENTA SOLA. Al tildar otro tractor, el que venía
 *     siendo el resto tiene que quedarse con los kg que mostraba. Si no,
 *     agregar un tractor borraría lo ya repartido.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3212';

const { BaseFalsa, ObjectId } = require('./doble-mongo');
const { buscarChromium } = require('./buscar-chromium');
const baseFalsa = new BaseFalsa();

const session = require(path.join(PROY, 'node_modules', 'express-session'));
const rutaCM = require.resolve(path.join(PROY, 'node_modules', 'connect-mongo'));
require.cache[rutaCM] = {
  id: rutaCM, filename: rutaCM, loaded: true,
  exports: { create: () => new session.MemoryStore() },
};

const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

const rutaNotif = require.resolve(path.join(PROY, 'notificaciones.js'));
const notifReal = require(rutaNotif);
require.cache[rutaNotif].exports = {
  resolverNombreCodigo: notifReal.resolverNombreCodigo,
  notificar: () => {},
};

require(path.join(PROY, 'app.js'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
let cookies = {};
let fallos = 0;
let pruebas = 0;

function guardarCookies(res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    cookies[par.slice(0, i)] = par.slice(i + 1);
  }
}
function cabeceraCookie() {
  return Object.keys(cookies).map((k) => k + '=' + cookies[k]).join('; ');
}

async function ir(metodo, url, cuerpo) {
  const headers = {
    'X-Forwarded-Proto': 'https',
    Accept: cuerpo || /\/api\//.test(url) ? 'application/json' : 'text/html',
  };
  const ck = cabeceraCookie();
  if (ck) headers.Cookie = ck;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method: metodo, headers,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    redirect: 'manual',
  });
  guardarCookies(res);
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* html */ }
  return { estado: res.status, ubicacion: res.headers.get('location'), texto, json };
}

function ok(nombre, condicion, extra) {
  pruebas++;
  if (condicion) console.log('  ✓ ' + nombre);
  else { fallos++; console.log('  ✗ ' + nombre + (extra ? '  →  ' + String(extra).slice(0, 400) : '')); }
}
function seccion(t) { console.log('\n── ' + t); }

const ymd = (d) => d.toISOString().slice(0, 10);
const HOY = ymd(new Date());
const registros = () => baseFalsa.collection('registros');
const leer = (id) => registros().docs.find((d) => String(d._id) === String(id));
const sumaKg = (lista) => (lista || []).reduce((a, b) => a + (Number(b.kg) || 0), 0);

const MATACO = '5679';
const GENERAL = '12341';

/** Ticket con la TARA FINAL puesta y sin regulada: el que se va a cerrar. */
function conTaraFinal(extra) {
  const doc = Object.assign({
    _id: new ObjectId(),
    idTicket: 500, nroApp: '1-0500', origen: 'app', fecha: HOY,
    usuario: 'Juan Sosa', cargadoPor: 'Juan Sosa',
    pesadaPara: 'CAMIONES', cargaPara: 'AMH', socio: '',
    transporte: 'Ciriaci', chofer: 'R. GÓMEZ', patentes: 'AC 884 TF',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: MATACO,
    brutoEstimado: 46500, tara: 15600, netoEstimado: 30900,
    cargoDe: '', silobolsa: '', contratista: [], tractor: [], comentarios: '',
    fechaTaraFinal: HOY, anulado: false, confirmada: false,
    modificaciones: 0, creadoEn: new Date(),
  }, extra || {});
  registros().docs.push(doc);
  return doc;
}

/** Ticket YA REGULADO, para probar la corrección. */
function yaRegulado(extra) {
  return conTaraFinal(Object.assign({
    pesadaPara: 'REGULADA', confirmada: true, fechaRegulada: HOY,
    grano: 'SOJA', lote: ['Lote 1 El Mataco'],
    brutoLote: 46500, bruto: 46500, neto: 30900,
  }, extra || {}));
}

/** El cuerpo de una regulada que cargó de contratistas. */
function reguladaDe(id, tractores) {
  return {
    id, campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1 El Mataco'],
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'],
    tractor: tractores.map((t) => t.tractor),
    tractores,
    brutoLote: 46500, bruto: 46500, confirmarTara: 'SI', comentarios: '',
  };
}

async function main() {
  await new Promise((r) => setTimeout(r, 1300));
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: MATACO, fecha: HOY, nombre: 'Juan Sosa' });

  cookies = {};
  let r = await ir('POST', '/app/api/ingreso', { code: MATACO });
  ok('la balanza entra', r.estado === 200, r.texto.slice(0, 120));

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. LA SUMA TIENE QUE DAR EL NETO
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('La suma de los tractores da el neto');

  let t = conTaraFinal();
  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 10000 },
    { tractor: '3VILLA', contratista: 'Villa Marcelo', kg: 8000 },
    { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 12900 },
  ]));
  let g = leer(t._id);
  ok('se guarda la regulada con tres tractores', r.estado === 200, r.texto.slice(0, 200));
  ok('quedan los tres con sus kg', (g.tractores || []).length === 3,
    JSON.stringify(g.tractores));
  ok('y suman exactamente el neto', sumaKg(g.tractores) === g.neto,
    sumaKg(g.tractores) + ' vs ' + g.neto);
  ok('cada uno sabe de qué contratista es',
    g.tractores[0].contratista === 'Villa Marcelo' && g.tractores[2].contratista === 'Maggi Javier');
  ok('la lista de tractores de siempre sigue guardándose',
    JSON.stringify(g.tractor) === '["1VILLA","3VILLA","9MAGGI"]', JSON.stringify(g.tractor));
  ok('y no quedan silobolsas colgadas', JSON.stringify(g.silobolsas) === '[]');

  // Un solo tractor: se lleva todo el neto y no hay nada que tipear.
  t = conTaraFinal();
  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 30900 },
  ]));
  g = leer(t._id);
  ok('con un solo tractor se lleva todo el neto',
    r.estado === 200 && g.tractores.length === 1 && g.tractores[0].kg === 30900,
    r.texto.slice(0, 200));

  /* ── Lo que el servidor NO deja pasar ─────────────────────────────────── */
  seccion('Lo que el servidor rechaza');

  t = conTaraFinal();
  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 10000 },
    { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 5000 },
  ]));
  ok('si no llega al neto, no se guarda', r.estado === 400 && /suman/.test(r.texto), r.texto.slice(0, 200));
  ok('y el ticket queda sin cerrar', !leer(t._id).fechaRegulada);

  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 25000 },
    { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 25000 },
  ]));
  ok('si se pasa del neto, tampoco', r.estado === 400 && /suman/.test(r.texto), r.texto.slice(0, 200));

  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 30900 },
    { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 0 },
  ]));
  ok('un tractor en cero kg no se guarda', r.estado === 400 && /mayores que cero/.test(r.texto),
    r.texto.slice(0, 200));

  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 15000 },
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 15900 },
  ]));
  ok('el mismo tractor dos veces tampoco', r.estado === 400 && /repetido/.test(r.texto),
    r.texto.slice(0, 200));

  // El reparto tiene que hablar de los MISMOS tractores que se tildaron: si no,
  // el ticket diría que cargaron unos y repartiría los kg entre otros.
  r = await ir('POST', '/app/api/regulada', Object.assign(
    reguladaDe(String(t._id), [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 30900 },
    ]),
    { tractor: ['1VILLA', '9MAGGI'] }
  ));
  ok('el reparto que no coincide con los tildados se rechaza',
    r.estado === 400 && /no coincide/.test(r.texto), r.texto.slice(0, 200));

  const siete = [];
  for (let i = 1; i <= 7; i++) siete.push({ tractor: 'T' + i, contratista: 'Villa Marcelo', kg: i === 7 ? 30894 : 1 });
  r = await ir('POST', '/app/api/regulada', reguladaDe(String(t._id), siete));
  ok('más de 6 tractores en un viaje se rechaza',
    r.estado === 400 && /máximo 6/.test(r.texto), r.texto.slice(0, 200));

  /* ── La cola de un teléfono sin actualizar ────────────────────────────── */
  seccion('Un teléfono sin actualizar sigue pudiendo cerrar el ticket');

  t = conTaraFinal();
  const viejo = reguladaDe(String(t._id), [
    { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 20000 },
    { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 10900 },
  ]);
  // Un teléfono viejo manda los tractores pero no el reparto.
  delete viejo.tractores;
  r = await ir('POST', '/app/api/regulada', viejo);
  g = leer(t._id);
  ok('sin reparto, el ticket se cierra igual', r.estado === 200 && !!g.fechaRegulada, r.texto.slice(0, 200));
  ok('y queda sin reparto, no con uno inventado', JSON.stringify(g.tractores) === '[]',
    JSON.stringify(g.tractores));

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. QUE SIGA CERRANDO DESPUÉS DE UNA CORRECCIÓN
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Corregir la tara reacomoda el reparto');

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: GENERAL });
  ok('GENERAL entra', r.estado === 200, r.texto.slice(0, 120));

  // ── Tractores
  t = yaRegulado({
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'],
    tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 18000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 12900 },
    ],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15100',
    cargaPara: 'AMH', cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    comentarios: 'El acoplado estaba mal frenado.',
  });
  g = leer(t._id);
  ok('la corrección entra', r.estado === 200, r.texto.slice(0, 200));
  ok('el neto se recalcula con la tara nueva', g.neto === 31400, String(g.neto));
  ok('el primero queda como estaba', g.tractores[0].kg === 18000, String(g.tractores[0].kg));
  ok('el último absorbe la diferencia', g.tractores[1].kg === 13400, String(g.tractores[1].kg));
  ok('y la suma vuelve a dar el neto', sumaKg(g.tractores) === g.neto,
    sumaKg(g.tractores) + ' vs ' + g.neto);

  // ── Silobolsas: el mismo agujero, que existía en producción
  t = yaRegulado({
    cargoDe: 'SILOBOLSA', silobolsa: '16 · 15',
    silobolsas: [{ nro: '16', kg: 18000 }, { nro: '15', kg: 12900 }],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15100',
    cargaPara: 'AMH', cargoDe: 'SILOBOLSA', silobolsa: '16 · 15', comentarios: '',
  });
  g = leer(t._id);
  ok('con silobolsas pasa lo mismo: la última absorbe',
    r.estado === 200 && g.silobolsas[1].kg === 13400, JSON.stringify(g.silobolsas));
  ok('y las bolsas vuelven a sumar el neto', sumaKg(g.silobolsas) === g.neto,
    sumaKg(g.silobolsas) + ' vs ' + g.neto);

  // ── Cuando no hay forma de reacomodar, el reparto se borra
  t = yaRegulado({
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 29000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 1900 },
    ],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '18000',
    cargaPara: 'AMH', cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    comentarios: '',
  });
  g = leer(t._id);
  ok('si el último quedaría en negativo, el reparto se borra entero',
    r.estado === 200 && JSON.stringify(g.tractores) === '[]', JSON.stringify(g.tractores));
  ok('prefiere no tener el dato antes que tener uno inventado',
    g.neto === 28500 && !(g.tractores || []).length, String(g.neto));

  // ── Cambiar de contratista a silobolsa limpia el reparto del otro lado
  t = yaRegulado({
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo'], tractor: ['1VILLA'],
    tractores: [{ tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 30900 }],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15600',
    cargaPara: 'AMH', cargoDe: 'SILOBOLSA', silobolsa: '21', comentarios: '',
  });
  g = leer(t._id);
  ok('al pasar a silobolsa, el reparto por tractor se borra',
    r.estado === 200 && JSON.stringify(g.tractores) === '[]', JSON.stringify(g.tractores));

  // ── Si cambian el número de silobolsa a mano, el reparto deja de valer
  t = yaRegulado({
    cargoDe: 'SILOBOLSA', silobolsa: '16 · 15',
    silobolsas: [{ nro: '16', kg: 18000 }, { nro: '15', kg: 12900 }],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15600',
    cargaPara: 'AMH', cargoDe: 'SILOBOLSA', silobolsa: '17', comentarios: '',
  });
  g = leer(t._id);
  ok('cambiar el número de bolsa a mano borra el reparto viejo',
    r.estado === 200 && JSON.stringify(g.silobolsas) === '[]', JSON.stringify(g.silobolsas));

  // ── Y GENERAL puede corregir el reparto a mano
  t = yaRegulado({
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 18000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 12900 },
    ],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15600',
    cargaPara: 'AMH', cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 20000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 10900 },
    ],
    comentarios: '',
  });
  g = leer(t._id);
  ok('GENERAL puede cambiar el reparto a mano',
    r.estado === 200 && g.tractores[0].kg === 20000 && g.tractores[1].kg === 10900,
    JSON.stringify(g.tractores));

  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'AC 884 TF', chofer: 'R. GÓMEZ', tara: '15600',
    cargaPara: 'AMH', cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 20000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 5000 },
    ],
    comentarios: '',
  });
  ok('pero no uno que no cierre contra el neto',
    r.estado === 400 && /suman/.test(r.texto), r.texto.slice(0, 200));

  // ── Y ya no aplasta los contratistas múltiples a uno
  t = yaRegulado({
    cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 18000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 12900 },
    ],
  });
  r = await ir('POST', '/app/api/corregir/' + String(t._id), {
    patentes: 'XX 999 XX', chofer: 'R. GÓMEZ', tara: '15600',
    cargaPara: 'AMH', cargoDe: 'CONTRATISTA',
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    comentarios: '',
  });
  g = leer(t._id);
  ok('corregir la patente no se lleva puesto al segundo contratista',
    r.estado === 200 && g.contratista.length === 2 && g.tractor.length === 2,
    JSON.stringify(g.contratista) + ' / ' + JSON.stringify(g.tractor));

  // ── La pantalla de corregir trae las casillas y el reparto
  r = await ir('GET', '/app/corregir/' + String(t._id));
  ok('la pantalla de corregir usa casillas y no un desplegable',
    /name="contratista"[^>]*type="checkbox"|type="checkbox"[^>]*name="contratista"/.test(r.texto) ||
    /data-contratista=/.test(r.texto), r.estado);
  ok('y le llega el reparto guardado', /REPARTO_GUARDADO = \[\{/.test(r.texto), r.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * 3. EL EXCEL Y LA API
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Dónde se ve el reparto');

  r = await ir('GET', '/app/excel?desde=' + HOY + '&hasta=' + HOY);
  ok('el Excel se baja', r.estado === 200, r.estado);

  const apiExterna = require(path.join(PROY, 'api-externa.js'));
  ok('la API externa sigue apagada sin token', apiExterna({}) === null);

  /* ═══════════════════════════════════════════════════════════════════════
   * 4. LA PANTALLA HACE LA CUENTA SOLA
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('La pantalla: el último es el resto, y no se pierde al agregar otro');

  let chromium;
  try {
    chromium = require(path.join(PROY, 'node_modules', 'playwright')).chromium;
  } catch (e) {
    console.log('\n  SALTEADA: falta Playwright. Instalalo con:');
    console.log('    npm install --no-save playwright\n');
    process.exit(0);
  }

  const navegador = await chromium.launch({ executablePath: buscarChromium() || undefined });
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
  });
  const pg = await ctx.newPage();
  const errores = [];
  pg.on('pageerror', (e) => errores.push(e.message));

  const abierto = conTaraFinal({ idTicket: 900, nroApp: '1-0900' });
  await pg.goto(BASE + '/app/ingreso');
  await pg.evaluate(async (c) => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: c }),
    });
  }, MATACO);
  await pg.goto(BASE + '/app/regulada/' + String(abierto._id), { waitUntil: 'networkidle' });
  await pg.selectOption('#grano', 'SOJA');
  await pg.waitForTimeout(150);
  await pg.check('input[name="lote"]');
  await pg.fill('#brutoLote', '46500');
  await pg.fill('#bruto', '46500');
  await pg.click('[data-opciones="cargoDe"] [data-valor="CONTRATISTA"]');
  await pg.waitForTimeout(500);

  const leerFilas = () => pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('#filas-tract .fila-silo').forEach(function (f) {
      const i = f.querySelector('input');
      out.push({
        tractor: f.querySelector('.nombre-origen').childNodes[0].textContent.trim(),
        contratista: (f.querySelector('.chico') || {}).textContent || '',
        kg: i.value,
        resto: i.classList.contains('kg-resto'),
      });
    });
    return out;
  });

  ok('sin contratista elegido el bloque de kg no se ve',
    await pg.locator('#campo-kg-tract').evaluate((e) => e.className.indexOf('oculto') !== -1));

  await pg.check('input[value="Villa Marcelo"]');
  await pg.waitForTimeout(300);
  await pg.check('input[name="tractor"][value="1VILLA"]');
  await pg.waitForTimeout(300);

  let filas = await leerFilas();
  ok('con un tractor hay una sola fila y es el resto',
    filas.length === 1 && filas[0].resto, JSON.stringify(filas));
  ok('y se lleva todo el neto', filas[0].kg === '30.900', JSON.stringify(filas));
  ok('con su contratista abajo', filas[0].contratista === 'Villa Marcelo', JSON.stringify(filas));
  ok('y el aviso lo dice',
    /Se lleva todo el neto/.test(await pg.locator('#aviso-tract').innerText()));

  // Al tildar el segundo, el primero se queda con lo que mostraba: ESTE es el
  // caso que sin `congelarResto` borraría lo ya repartido.
  await pg.check('input[name="tractor"][value="3VILLA"]');
  await pg.waitForTimeout(300);
  filas = await leerFilas();
  ok('al agregar otro tractor, el primero conserva sus kg',
    filas.length === 2 && filas[0].kg === '30900' && !filas[0].resto, JSON.stringify(filas));
  ok('y el nuevo es el resto, en cero', filas[1].resto && filas[1].kg === '0',
    JSON.stringify(filas));

  // Se corrige el primero y el segundo se acomoda solo.
  await pg.fill('#filas-tract .fila-silo:nth-child(1) input', '10000');
  await pg.waitForTimeout(250);
  filas = await leerFilas();
  ok('al bajar el primero, el resto sube solo', filas[1].kg === '20.900', JSON.stringify(filas));

  // Tercero, de otro contratista.
  await pg.check('input[value="Maggi Javier"]');
  await pg.waitForTimeout(400);
  /* Rehacer la lista destilda todo: se vuelven a elegir los tres. Se tildan en
     este orden a propósito —9MAGGI ordena ANTES que 1VILLA en la lista— para
     comprobar que las filas siguen el orden en que se tildaron y no el de la
     lista: el resto tiene que quedarle a 9MAGGI, el último tildado. */
  await pg.check('input[name="tractor"][value="1VILLA"]');
  await pg.check('input[name="tractor"][value="3VILLA"]');
  await pg.check('input[name="tractor"][value="9MAGGI"]');
  await pg.waitForTimeout(300);
  filas = await leerFilas();
  ok('con tres tractores de dos contratistas hay tres filas', filas.length === 3,
    JSON.stringify(filas));
  ok('y la de Maggi dice de quién es',
    filas.some((f) => f.contratista === 'Maggi Javier'), JSON.stringify(filas));
  ok('las filas van en el orden en que se tildaron, no en el de la lista',
    filas.map((f) => f.tractor).join(',') === '1VILLA,3VILLA,9MAGGI',
    JSON.stringify(filas.map((f) => f.tractor)));
  ok('y el resto le queda al último que se tildó', filas[2].resto, JSON.stringify(filas));

  await pg.fill('#filas-tract .fila-silo:nth-child(1) input', '10000');
  await pg.fill('#filas-tract .fila-silo:nth-child(2) input', '8000');
  await pg.waitForTimeout(250);
  filas = await leerFilas();
  ok('el último es el resto de los otros dos', filas[2].kg === '12.900', JSON.stringify(filas));

  // Pasarse del neto no deja guardar.
  await pg.fill('#filas-tract .fila-silo:nth-child(1) input', '40000');
  await pg.waitForTimeout(250);
  ok('pasarse del neto lo avisa',
    /pasan el neto/.test(await pg.locator('#aviso-tract').innerText()));
  await pg.click('#guardar-reg');
  await pg.waitForTimeout(400);
  ok('y no deja guardar',
    /pasan el neto/.test(await pg.locator('#error-reg').innerText()),
    await pg.locator('#error-reg').innerText());

  // Se arregla y se guarda.
  await pg.fill('#filas-tract .fila-silo:nth-child(1) input', '10000');
  await pg.waitForTimeout(250);
  await pg.click('#guardar-reg');
  await pg.waitForTimeout(1200);
  const guardado = leer(abierto._id);
  ok('con el reparto bien, se guarda', !!guardado.fechaRegulada, JSON.stringify(guardado.tractores));
  ok('y queda lo que mostraba la pantalla',
    JSON.stringify((guardado.tractores || []).map((x) => x.tractor + ':' + x.kg + ':' + x.contratista)) ===
      '["1VILLA:10000:Villa Marcelo","3VILLA:8000:Villa Marcelo","9MAGGI:12900:Maggi Javier"]',
    JSON.stringify(guardado.tractores));
  ok('que suma el neto', sumaKg(guardado.tractores) === guardado.neto,
    sumaKg(guardado.tractores) + ' vs ' + guardado.neto);

  ok('la pantalla no tiró ningún error de javascript', errores.length === 0, errores.join(' | '));

  await navegador.close();

  console.log('\n════════════════════════════════════════');
  if (fallos) console.log('  ' + fallos + ' FALLAS de ' + pruebas);
  else console.log('  TODO BIEN — ' + pruebas + ' comprobaciones');
  console.log('════════════════════════════════════════\n');
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
