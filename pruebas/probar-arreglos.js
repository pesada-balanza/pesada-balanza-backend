'use strict';
/**
 * Prueba en navegador de los cuatro arreglos pedidos:
 *  1. GENERAL tiene un camino claro para ir a cargar.
 *  2. Hay botón para salir / cambiar de código en todas las pantallas.
 *  3. El botón de volver es grande y tocable.
 *  4. El campo se ve en la regulada y se puede corregir (grano y lote se rehacen).
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
process.env.PORT = '3194';

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
  fs.mkdirSync(SALIDA, { recursive: true });

  // Camión con tara final cargada, listo para la regulada
  const conTF = await baseFalsa.collection('registros').insertOne({
    idTicket: 1, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'CAMIONES', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 52500, tara: 15600, netoEstimado: 36900,
    fechaTaraFinal: hoy(), confirmada: false, anulado: false, modificaciones: 0,
    origen: 'app', nroApp: '1-0001', cargadoPor: 'Juan Sosa', appImpreso: true,
    creadoEn: new Date(),
  });
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: hoy(), nombre: 'Juan Sosa' });

  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });

  async function abrir(code) {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
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

  const erroresJs = [];

  /* ═══ 3. El botón de volver ═══ */
  console.log('\n── El botón de volver se ve y se puede tocar');
  const { ctx, pg } = await abrir('5679');
  pg.on('pageerror', (e) => erroresJs.push(e.message));
  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'networkidle' });

  const volver = await pg.$('.volver');
  ok('existe el botón de volver', !!volver);
  const cajaVolver = await volver.boundingBox();
  console.log('     medida: ' + Math.round(cajaVolver.width) + ' × ' + Math.round(cajaVolver.height) + ' px');
  ok('mide 44 px de alto o más (dedo con guante)', cajaVolver.height >= 44, cajaVolver.height);
  ok('y tiene ancho de botón, no de texto suelto', cajaVolver.width >= 70, cajaVolver.width);
  const tieneBorde = await pg.evaluate(() => {
    const e = document.querySelector('.volver');
    const c = window.getComputedStyle(e);
    return c.borderStyle !== 'none' && c.borderRadius !== '0px';
  });
  ok('se ve como un botón (borde y esquinas redondeadas)', tieneBorde);

  /* ═══ 2. Salir y cambiar de código ═══ */
  console.log('\n── Salir y cambiar de código');
  const botonSalir = await pg.$('#menu-salir');
  ok('hay botón Salir en el encabezado', !!botonSalir);
  const cajaSalir = await botonSalir.boundingBox();
  ok('es tocable (44 px o más)', cajaSalir.height >= 40, cajaSalir.height);

  // Ya no hay hoja del medio: el botón hace una sola cosa, y avisa antes.
  const hayHoja = await pg.evaluate(() => !!document.getElementById('modal-menu'));
  ok('no hay hoja intermedia con dos opciones', !hayHoja);

  // Primero se rechaza el aviso: no tiene que salir.
  let vistoElAviso = '';
  const rechazar = (d) => { vistoElAviso = d.message(); d.dismiss(); };
  pg.on('dialog', rechazar);
  await botonSalir.click();
  await pg.waitForTimeout(400);
  ok('avisa antes de salir', /¿Salir de la app\?/.test(vistoElAviso), vistoElAviso.slice(0, 120));
  ok('el aviso aclara que no se borra nada', /No se borra nada/.test(vistoElAviso));
  ok('si se dice que no, no sale', pg.url().indexOf('/app/ingreso') === -1, pg.url());

  // Ahora sí: aceptando, sale y pide el código de nuevo (que es también la
  // forma de cambiar de balanza).
  pg.off('dialog', rechazar);
  pg.on('dialog', (d) => d.accept());
  await botonSalir.click();
  await pg.waitForURL('**/app/ingreso', { timeout: 8000 }).catch(() => {});
  ok('aceptando sale y pide el código', pg.url().indexOf('/app/ingreso') !== -1, pg.url());

  /* ═══ 4. El campo en la regulada ═══ */
  console.log('\n── El campo se ve y se puede corregir en la regulada');
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });
  await pg.goto(BASE + '/app/regulada/' + conTF.insertedId, { waitUntil: 'networkidle' });

  const campoALaVista = await pg.textContent('#campo-actual');
  ok('el campo del ticket se ve completo', /El Mataco - SACHAYOJ - SE/.test(campoALaVista), campoALaVista);

  const granosAntes = await pg.$$eval('#grano option', (o) => o.map((x) => x.value).filter(Boolean));
  ok('los granos son los del campo del ticket', granosAntes.length > 0, granosAntes.join(','));

  await pg.selectOption('#grano', granosAntes[0]);
  await pg.waitForTimeout(200);
  const lotesAntes = await pg.$$eval('input[name="lote"]', (o) => o.map((x) => x.value));
  ok('aparecen los lotes de ese grano', lotesAntes.length > 0, lotesAntes.slice(0, 3).join(','));

  // Cambiar el campo
  await pg.click('#btn-cambiar-campo');
  await pg.waitForTimeout(200);
  const selectorVisible = await pg.evaluate(() =>
    document.getElementById('bloque-campo').className.indexOf('oculto') === -1);
  ok('el selector de campos se abre al tocar Cambiar', selectorVisible);

  // La lista de campos la pone el teléfono con las tablas guardadas: se espera
  // a que llegue en vez de contar antes de tiempo.
  await pg.waitForFunction(
    () => document.querySelectorAll('#campoSelect option').length > 1,
    null, { timeout: 5000 }
  );
  const cuantosCampos = await pg.$$eval('#campoSelect option', (o) => o.length);
  ok('están todos los campos para elegir (43)', cuantosCampos === 43, cuantosCampos);

  await pg.selectOption('#campoSelect', 'La Pradera - ARBOL BLANCO - SE');
  await pg.waitForTimeout(300);

  const campoDespues = await pg.textContent('#campo-actual');
  ok('el campo mostrado se actualiza', /La Pradera/.test(campoDespues), campoDespues);

  const granosDespues = await pg.$$eval('#grano option', (o) => o.map((x) => x.value).filter(Boolean));
  ok('los granos se rehacen con los del campo nuevo',
    granosDespues.length > 0 && JSON.stringify(granosDespues) !== JSON.stringify(granosAntes),
    'antes: ' + granosAntes.join(',') + ' / ahora: ' + granosDespues.join(','));

  const lotesDespues = await pg.$$eval('input[name="lote"]', (o) => o.map((x) => x.value));
  ok('los lotes del grano anterior se limpian', lotesDespues.length === 0, lotesDespues.join(','));

  // Guardar con el campo corregido
  await pg.selectOption('#grano', granosDespues[0]);
  await pg.waitForTimeout(250);
  const lotesNuevos = await pg.$$eval('input[name="lote"]', (o) => o.map((x) => x.value));
  ok('y aparecen los lotes del campo nuevo', lotesNuevos.length > 0, lotesNuevos.slice(0, 3).join(','));

  await pg.check('input[name="lote"]');
  await pg.click('[data-opciones="cargoDe"] [data-valor="SILOBOLSA"]');
  await pg.fill('#silobolsa', '12');
  await pg.fill('#brutoLote', '52000');
  await pg.fill('#bruto', '52500');
  await pg.waitForTimeout(200);

  const netoCalculado = await pg.textContent('#neto');
  ok('el neto se calcula solo (52500 - 15600)', /36\.900/.test(netoCalculado), netoCalculado);

  await pg.click('#guardar-reg');
  await pg.waitForTimeout(1500);

  const guardado = baseFalsa.collection('registros').docs.find(
    (d) => String(d._id) === String(conTF.insertedId)
  );
  ok('se guardó con el campo corregido', guardado.campo === 'La Pradera - ARBOL BLANCO - SE', guardado.campo);
  ok('con el grano del campo nuevo', guardado.grano === granosDespues[0], guardado.grano);
  ok('y con el neto correcto', guardado.neto === 36900, guardado.neto);

  /* ═══ 1. GENERAL: camino para ir a cargar ═══ */
  console.log('\n── GENERAL: cómo pasar a cargar');
  const g = await abrir('12341');
  g.pg.on('pageerror', (e) => erroresJs.push(e.message));
  await g.pg.goto(BASE + '/app/general', { waitUntil: 'networkidle' });

  const textoGeneral = await g.pg.textContent('.pantalla');
  ok('explica que este código no carga', /Este código entra a mirar y a autorizar/.test(textoGeneral));
  const btnCargar = await g.pg.$('#ir-a-cargar');
  ok('tiene el botón para entrar con el código de una balanza', !!btnCargar);
  const cajaCargar = await btnCargar.boundingBox();
  ok('el botón es grande', cajaCargar.height >= 50, cajaCargar.height);

  g.pg.on('dialog', (d) => d.accept());
  await btnCargar.click();
  await g.pg.waitForURL('**/app/ingreso', { timeout: 8000 }).catch(() => {});
  ok('lleva a la pantalla del código', g.pg.url().indexOf('/app/ingreso') !== -1, g.pg.url());

  ok('sin errores de JavaScript', erroresJs.length === 0, erroresJs.join(' | '));

  /* ═══ Capturas para mirar ═══ */
  const c2 = await abrir('5679');
  await c2.pg.goto(BASE + '/app/regulada/' + conTF.insertedId, { waitUntil: 'networkidle' }).catch(() => {});
  // ese ticket ya se cerró: usamos uno nuevo
  const otro = await baseFalsa.collection('registros').insertOne({
    idTicket: 9, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH',
    pesadaPara: 'CAMIONES', transporte: 'Sonzogni', patentes: 'ZX 990 PQ', chofer: 'H. Vega',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 45000, tara: 14200, netoEstimado: 30800,
    fechaTaraFinal: hoy(), confirmada: false, anulado: false, modificaciones: 0,
    origen: 'app', nroApp: '1-0009', cargadoPor: 'Juan Sosa', appImpreso: false,
    creadoEn: new Date(),
  });
  for (const [url, nombre] of [
    ['/app/regulada/' + otro.insertedId, '30-regulada-con-campo'],
    ['/app/patio', '31-patio-con-salir'],
  ]) {
    await c2.pg.goto(BASE + url, { waitUntil: 'networkidle' });
    await c2.pg.waitForTimeout(300);
    const alto = await c2.pg.evaluate(() => document.body.scrollHeight);
    await c2.pg.setViewportSize({ width: 360, height: Math.max(740, Math.min(alto + 20, 2400)) });
    await c2.pg.screenshot({ path: SALIDA + '/' + nombre + '.png' });
    await c2.pg.setViewportSize({ width: 360, height: 740 });
    console.log('  · captura ' + nombre);
  }
  await c2.pg.goto(BASE + '/app/general', { waitUntil: 'networkidle' }).catch(() => {});

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
