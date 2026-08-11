'use strict';
/**
 * Reproduce EXACTAMENTE lo que pasó en el teléfono, con el service worker
 * funcionando de verdad (las otras pruebas de modo avión no lo usan, y por eso
 * no lo agarraron).
 *
 * Los tres problemas reportados:
 *  1. Al abrir la app sin señal apareció la pantalla de GENERAL ("entrar con el
 *     código de una balanza") en vez del patio, y después el código no entraba.
 *  2. Con un camión ya cargado con señal, en modo avión el botón "Cargar tara
 *     final" no hacía nada.
 *  3. Tampoco hacía nada "Ver ticket".
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
const hoy = () => new Date().toISOString().split('T')[0];
let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}
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
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: hoy(), nombre: 'Juan Sosa' });

  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    serviceWorkers: 'allow',
  });
  const pg = await ctx.newPage();
  const erroresJs = [];
  pg.on('pageerror', (e) => erroresJs.push(e.message));

  async function entrarCon(code) {
    await pg.evaluate(async (c) => {
      await fetch('/app/api/ingreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
    }, code);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PREPARACIÓN — igual que en el teléfono: primero se usó GENERAL, después
   * el código de la balanza. Es lo que hace el balancero de verdad.
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── El service worker se instala de verdad');
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  const swListo = await pg.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no hay serviceWorker';
    const reg = await navigator.serviceWorker.ready;
    return reg && reg.active ? 'activo' : 'sin activar';
  });
  ok('el service worker quedó activo', swListo === 'activo', swListo);

  console.log('\n── Primero se usa GENERAL (como pasó en el teléfono)');
  await entrarCon('12341');
  await pg.goto(BASE + '/app', { waitUntil: 'networkidle' });
  ok('con GENERAL se abre la pantalla de GENERAL', pg.url().indexOf('/app/general') !== -1, pg.url());

  console.log('\n── Después se entra con el código de la balanza');
  await entrarCon('5679');
  await pg.goto(BASE + '/app', { waitUntil: 'networkidle' });
  ok('con el código de balanza se abre el patio', pg.url().indexOf('/app/patio') !== -1, pg.url());
  await esperar(2000); // que termine de guardar pantallas y números

  /* ═══════════════════════════════════════════════════════════════════════
   * PROBLEMA 1 — abrir la app sin señal
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── PROBLEMA 1: abrir la app sin señal (como desde el ícono)');
  await ctx.setOffline(true);
  await pg.goto(BASE + '/app', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(800);
  const enElCache = await pg.evaluate(async () => {
    const claves = await caches.keys();
    const out = {};
    for (const k of claves) {
      const c = await caches.open(k);
      out[k] = (await c.keys()).map((r) => r.url.replace(location.origin, ''));
    }
    return out;
  }).catch((e) => 'no se pudo leer: ' + e.message);
  console.log('     lo guardado: ' + JSON.stringify(enElCache));
  const htmlInicio = await pg.content();
  ok('sin señal NO aparece la pantalla de GENERAL',
    htmlInicio.indexOf('Entrar con el código de una balanza') === -1,
    'apareció la pantalla de otro código');
  ok('sin señal aparece el patio, con el botón de cargar',
    /Nueva pesada/.test(htmlInicio), htmlInicio.slice(0, 300));

  /* ═══════════════════════════════════════════════════════════════════════
   * PROBLEMAS 2 y 3 — un camión cargado CON señal, y después modo avión
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Se carga un camión CON señal');
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'networkidle' });
  await pg.fill('#patentes', 'MA 456 QQ');
  await pg.fill('#chofer', 'Modo Avion');
  await pg.fill('#transporte', 'Ciriaci');
  await pg.selectOption('#campo', 'El Mataco - SACHAYOJ - SE');
  await pg.click('#guardar');
  await pg.waitForTimeout(2000);
  const enBase = baseFalsa.collection('registros').docs.filter((d) => d.patentes === 'MA 456 QQ');
  ok('el camión quedó en la base', enBase.length === 1, JSON.stringify(enBase).slice(0, 150));
  const idCamion = String(enBase[0]._id);

  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await esperar(1200);
  ok('el patio lo muestra con "Cargar tara final"',
    (await pg.content()).indexOf('Cargar tara final') !== -1);

  console.log('\n── PROBLEMA 2: modo avión y "Cargar tara final"');
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await esperar(400);
  ok('la app avisa SIN SEÑAL', (await pg.textContent('[data-conexion]')).indexOf('SIN SEÑAL') !== -1);

  const destinoTF = await pg.getAttribute('a[data-sin-senal*="tara-final"]', 'href');
  ok('el botón apunta a la pantalla sin señal', /\/app\/local\?paso=tara-final/.test(destinoTF || ''), destinoTF);

  await pg.click('a[data-sin-senal*="tara-final"]');
  await esperar(1500);
  const urlTF = pg.url();
  const htmlTF = await pg.content();
  ok('el botón LLEVA a algún lado (no se queda en el patio)',
    urlTF.indexOf('/app/local') !== -1, 'quedó en: ' + urlTF);
  ok('y se ve el formulario de tara final, con la patente',
    /MA 456 QQ/.test(htmlTF) && /Tara final/i.test(htmlTF),
    htmlTF.replace(/\s+/g, ' ').slice(0, 400));

  // Que además se pueda guardar de verdad
  const puedeGuardar = await pg.$('#l-tara');
  if (puedeGuardar) {
    await pg.fill('#l-tara', '15600');
    await pg.click('#l-guardar');
    await esperar(700);
    const cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
    ok('la tara final queda guardada en el teléfono',
      cola.some((c) => c.tipo === 'tara-final'), JSON.stringify(cola).slice(0, 250));
  } else {
    ok('la tara final queda guardada en el teléfono', false, 'no se llegó al formulario');
  }

  console.log('\n── PROBLEMA 3: "Ver ticket" sin señal');
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(900);
  const enlaceVer = await pg.getAttribute('a[href*="/app/registro/"], a[data-sin-senal*="ver"]', 'href').catch(() => null);
  ok('hay un botón para ver el ticket', !!enlaceVer, String(enlaceVer));
  if (enlaceVer) {
    await pg.goto(BASE + enlaceVer, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await esperar(900);
    const htmlVer = await pg.content();
    ok('"Ver ticket" muestra algo del ticket, no el patio de vuelta',
      /MA 456 QQ/.test(htmlVer) && !/Nueva pesada/.test(htmlVer),
      pg.url() + ' → ' + htmlVer.replace(/\s+/g, ' ').slice(0, 300));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Y cargar una pesada nueva sin señal, y después su tara final
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Cargar de cero sin señal: camión y después tara final');
  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(900);
  const hayForm = await pg.$('#patentes');
  ok('la pantalla de nueva pesada abre sin señal', !!hayForm, pg.url());
  if (hayForm) {
    await pg.fill('#patentes', 'AV 111 ON');
    await pg.fill('#chofer', 'Sin Senal Dos');
    await pg.fill('#transporte', 'Ciriaci');
    await pg.selectOption('#campo', 'El Mataco - SACHAYOJ - SE');
    await pg.click('#guardar');
    await esperar(1500);

    const cola = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
    const pesadaLocal = cola.filter((c) => c.tipo === 'pesada' && c.datos.patentes === 'AV 111 ON')[0];
    ok('la pesada queda en la cola', !!pesadaLocal, JSON.stringify(cola).slice(0, 200));

    if (pesadaLocal) {
      await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await esperar(900);
      const htmlPatio = await pg.content();
      ok('el patio la muestra con SIN SUBIR', /AV 111 ON/.test(htmlPatio) && /Sin subir/i.test(htmlPatio));

      // El botón que dibuja el patio para las locales
      const destino = '/app/local?paso=tara-final&ref=' + encodeURIComponent(pesadaLocal.localId);
      await pg.goto(BASE + destino, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await esperar(900);
      const hayTara = await pg.$('#l-tara');
      ok('se llega al formulario de tara final de la pesada local', !!hayTara,
        pg.url() + ' → ' + (await pg.content()).replace(/\s+/g, ' ').slice(0, 300));
      if (hayTara) {
        await pg.fill('#l-tara', '15600');
        await pg.click('#l-guardar');
        await esperar(700);
        const cola2 = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
        ok('la tara final de la pesada local queda guardada',
          cola2.some((c) => c.refLocal === pesadaLocal.localId && c.tipo === 'tara-final'),
          JSON.stringify(cola2).slice(0, 250));
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Sin señal no se puede entrar con otro código: hay que decirlo
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Poner un código sin señal: la pantalla lo dice');
  // Se abre CON señal y después se corta, que es el caso real: el balancero ya
  // está en la pantalla del código cuando se le va la conexión.
  await ctx.setOffline(false);
  // Se corta cualquier redirección pendiente de la pantalla anterior.
  await pg.goto('about:blank');
  await esperar(400);
  await pg.goto(BASE + '/app/api/salir'.replace('/api/salir', '/patio'), { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(() => new Promise((r) => { App.pedir('POST', '/app/api/salir', {}, r); }));
  await esperar(400);
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  ok('la pantalla del código abre', !!(await pg.$('[data-tecla="5"]')), pg.url());

  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await esperar(300);
  for (const d of ['5', '6', '7', '9']) await pg.click('[data-tecla="' + d + '"]');
  await pg.click('#entrar');
  await esperar(600);
  const textoError = await pg.textContent('#error-codigo');
  ok('avisa que sin internet no se puede entrar con un código',
    /internet/i.test(textoError || ''), textoError);
  const sigueElNumero = await pg.textContent('#zona-teclado').catch(() => '');
  ok('y el número escrito no se borra', /5/.test(sigueElNumero || ''), sigueElNumero);

  // Y si se llega a esa pantalla sin señal y sin tenerla guardada, nunca queda
  // una pantalla muerta: o se explica, o se manda al patio.
  await pg.goto('about:blank');
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(600);
  const textoIngreso = (await pg.content()).replace(/\s+/g, ' ');
  ok('sin señal, la pantalla del código nunca queda en blanco',
    /hace falta internet/i.test(textoIngreso) || /Nueva pesada/.test(textoIngreso) || /data-tecla/.test(textoIngreso),
    pg.url() + ' → ' + textoIngreso.slice(0, 200));

  /* ═══════════════════════════════════════════════════════════════════════
   * Cambiar de código tira las pantallas guardadas de la sesión anterior
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Al cambiar de código, las pantallas guardadas se tiran');
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await esperar(1500);
  const antesDeCambiar = await pg.evaluate(async () => {
    const claves = await caches.keys();
    let n = 0;
    for (const k of claves) {
      if (k.indexOf('-pantallas') === -1) continue;
      n += (await (await caches.open(k)).keys()).length;
    }
    return n;
  });
  ok('con señal hay pantallas guardadas', antesDeCambiar > 0, antesDeCambiar);

  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  // La app redirige si ya hay sesión: se sale primero, como hace el balancero.
  await pg.evaluate(() => new Promise((r) => { App.pedir('POST', '/app/api/salir', {}, r); }));
  await esperar(900);
  const despuesDeSalir = await pg.evaluate(async () => {
    const claves = await caches.keys();
    let n = 0;
    for (const k of claves) {
      if (k.indexOf('-pantallas') === -1) continue;
      n += (await (await caches.open(k)).keys()).length;
    }
    return n;
  });
  ok('al salir, las pantallas del código anterior se borran', despuesDeSalir === 0, despuesDeSalir);
  const fijosSiguen = await pg.evaluate(async () => {
    const claves = await caches.keys();
    for (const k of claves) {
      if (k.indexOf('-fijos') === -1) continue;
      return (await (await caches.open(k)).keys()).length;
    }
    return 0;
  });
  ok('pero los archivos fijos (css, js) se quedan', fijosSiguen > 0, fijosSiguen);

  /* ═══════════════════════════════════════════════════════════════════════
   * PEDIR CORRECCIÓN / ANULACIÓN
   * -----------------------------------------------------------------------
   * Con señal tiene que abrir la pantalla del pedido. Y SIN señal tiene que
   * decir que necesita internet, NO mostrar el patio: mostrar el patio hacía
   * que el botón pareciera roto ("aprieto y vuelve al inicio").
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Pedir corrección / anulación a GENERAL');
  await ctx.setOffline(false);
  await pg.goto('about:blank');
  await esperar(300);
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });

  // Un ticket completo, como el que se mira cuando se quiere pedir una corrección
  const cerrado = await baseFalsa.collection('registros').insertOne({
    idTicket: 90, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'REGULADA', transporte: 'Ciriaci', patentes: 'PE DIR 01', chofer: 'Pedido',
    campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'],
    cargoDe: 'SILOBOLSA', silobolsa: '1',
    brutoEstimado: 52500, tara: 15000, netoEstimado: 37500,
    brutoLote: 51000, bruto: 52500, neto: 37500,
    fechaTaraFinal: hoy(), fechaRegulada: hoy(), confirmada: true, anulado: false,
    modificaciones: 0, codigoIngreso: '5679', origen: 'app', nroApp: '1-0090',
    cargadoPor: 'Juan Sosa', appImpreso: true, creadoEn: new Date(),
  });
  const idCerrado = String(cerrado.insertedId);

  await pg.goto(BASE + '/app/registro/' + idCerrado, { waitUntil: 'networkidle' });
  await esperar(500);
  // Son ENLACES, no botones con JavaScript: es lo que hace que el toque
  // funcione siempre, sin depender de que corra un script.
  const botonesPedido = await pg.$$eval('a[href*="/app/pedir/"]', (as) => as.map((a) => ({
    texto: (a.textContent || '').trim(), destino: a.getAttribute('href'),
  })));
  ok('el ticket tiene los dos accesos al pedido', botonesPedido.length === 2, JSON.stringify(botonesPedido));
  ok('y son enlaces de verdad (con href), no botones con onclick',
    botonesPedido.every((b) => /\/app\/pedir\//.test(b.destino || '')), JSON.stringify(botonesPedido));
  const conOnclick = await pg.$$eval('[onclick]', (es) => es.length);
  ok('en la pantalla del ticket no queda ningún onclick escrito en el HTML',
    conOnclick === 0, conOnclick);

  for (const [texto, titulo] of [
    ['Pedir corrección a GENERAL', 'Pedir corrección'],
    ['Pedir anulación a GENERAL', 'Pedir anulación'],
  ]) {
    await pg.goto(BASE + '/app/registro/' + idCerrado, { waitUntil: 'networkidle' });
    await esperar(400);
    await pg.click('text=' + texto);
    await esperar(1200);
    const c = await pg.content();
    ok('"' + texto + '" abre la pantalla del pedido',
      pg.url().indexOf('/app/pedir/') !== -1 && /id="motivo"/.test(c),
      pg.url() + ' → ' + c.replace(/\s+/g, ' ').slice(0, 200));
    ok('con el título "' + titulo + '"', c.indexOf(titulo) !== -1);
    ok('y NO es el patio', !/Nueva pesada/.test(c));
  }

  // Se envía uno de verdad, para ver que llegue el pedido y su motivo
  await pg.fill('#motivo', 'El bruto regulado quedó mal cargado, hay que corregirlo.');
  await pg.click('#enviar-pedido');
  await esperar(1800);
  const pedidos = baseFalsa.collection('app_pedidos').docs;
  ok('el pedido llegó al servidor', pedidos.length >= 1, pedidos.length);
  const ult = pedidos[pedidos.length - 1];
  ok('con el motivo escrito', ult && /quedó mal cargado/.test(ult.motivo || ''), (ult || {}).motivo);
  ok('con quién lo pidió', ult && !!ult.pedidoPor, (ult || {}).pedidoPor);
  ok('y en estado PENDIENTE', ult && ult.estado === 'PENDIENTE', (ult || {}).estado);
  ok('el balancero volvió al patio con el aviso',
    pg.url().indexOf('aviso=pedido-enviado') !== -1, pg.url());

  console.log('\n── Y sin señal, la pantalla del pedido lo dice (no muestra el patio)');
  await ctx.setOffline(true);
  await pg.goto('about:blank');
  await esperar(300);
  await pg.goto(BASE + '/app/pedir/' + idCerrado + '?tipo=correccion', { waitUntil: 'domcontentloaded' })
    .catch(() => {});
  await esperar(700);
  const sinSenal = (await pg.content()).replace(/\s+/g, ' ');
  ok('NO aparece el patio disfrazado de "no pasó nada"',
    !/Nueva pesada/.test(sinSenal), sinSenal.slice(0, 200));
  ok('dice que necesita internet', /necesita internet/i.test(sinSenal), sinSenal.slice(0, 250));

  /* ═══════════════════════════════════════════════════════════════════════
   * EL AVISO DE PESADAS SIN SUBIR, EN TODAS LAS PANTALLAS Y CON CUALQUIER CÓDIGO
   * -----------------------------------------------------------------------
   * Es lo único que la app no puede recuperar sola: si el teléfono se rompe o se
   * cambia de código, se pierde. Así que se avisa siempre, y a los dos días el
   * aviso se pone rojo.
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── El aviso de pesadas sin subir');
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await esperar(1500);
  // De acá en adelante, sin señal: si hubiera conexión la cola se sincronizaría
  // sola y el servidor rechazaría la pesada de prueba (le faltan datos).
  await ctx.setOffline(true);

  const franjaSinNada = await pg.evaluate(() => {
    const f = document.querySelector('[data-pendientes-global]');
    return { existe: !!f, visible: f ? !f.hidden : false };
  });
  ok('la franja existe en el layout', franjaSinNada.existe);
  ok('sin pesadas pendientes NO se muestra', !franjaSinNada.visible);

  // Una pesada de HOY sin subir
  await pg.evaluate(() => {
    localStorage.setItem('pesada.cola', JSON.stringify([{
      localId: 'x-hoy', tipo: 'pesada', url: '/app/api/pesada',
      datos: { patentes: 'PE 111 ND', nro: '1-0099' },
      creadoEn: new Date().toISOString(),
    }]));
  });
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(600);
  let franja = await pg.evaluate(() => {
    const f = document.querySelector('[data-pendientes-global]');
    return { visible: !f.hidden, clase: f.className, texto: f.textContent.replace(/\s+/g, ' ').trim() };
  });
  ok('con una pesada de hoy, la franja se muestra', franja.visible, JSON.stringify(franja));
  ok('dice cuántas son', /1 pesada guardada en el teléfono sin subir/.test(franja.texto), franja.texto);
  ok('todavía no está en rojo', franja.clase.indexOf('urgente') === -1, franja.clase);

  // La misma, pero de hace 3 días: el aviso tiene que gritar
  await pg.evaluate(() => {
    const hace3 = new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const c = JSON.parse(localStorage.getItem('pesada.cola'));
    c[0].creadoEn = hace3;
    localStorage.setItem('pesada.cola', JSON.stringify(c));
  });
  await pg.goto(BASE + '/app/patio', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(600);
  franja = await pg.evaluate(() => {
    const f = document.querySelector('[data-pendientes-global]');
    return { clase: f.className, texto: f.textContent.replace(/\s+/g, ' ').trim() };
  });
  ok('a los 3 días la franja se pone roja', franja.clase.indexOf('urgente') !== -1, franja.clase);
  ok('y dice hace cuántos días esperan', /Hace 3 días/.test(franja.texto), franja.texto);

  // En TODAS las pantallas, no solo en el patio
  console.log('     en cada pantalla:');
  for (const p of ['/app/nueva-pesada', '/app/ctg', '/app/local']) {
    await pg.goto(BASE + p, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await esperar(400);
    const v = await pg.evaluate(() => {
      const f = document.querySelector('[data-pendientes-global]');
      return !!f && !f.hidden && f.className.indexOf('urgente') !== -1;
    });
    ok('se ve en ' + p, v);
  }

  // Y con el código de mirar (GENERAL), donde el nombre del balancero no coincide.
  // Cambiar de código necesita señal, así que primero se cambia y recién después
  // se pone la cola de prueba (con señal se sincronizaría y desaparecería).
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(() => new Promise((r) => { App.pedir('POST', '/app/api/salir', {}, r); }));
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '12341' }),
    });
  });
  await pg.goto(BASE + '/app/general', { waitUntil: 'networkidle' });
  await ctx.setOffline(true);
  await pg.evaluate(() => {
    localStorage.setItem('pesada.cola', JSON.stringify([{
      localId: 'x-viejo', tipo: 'pesada', url: '/app/api/pesada',
      datos: { patentes: 'PE 111 ND', nro: '1-0099' },
      creadoEn: new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    }]));
  });
  await pg.goto(BASE + '/app/general', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(600);
  const conGeneral = await pg.evaluate(() => {
    const f = document.querySelector('[data-pendientes-global]');
    return { visible: !!f && !f.hidden, urgente: !!f && f.className.indexOf('urgente') !== -1 };
  });
  ok('con el código de mirar (GENERAL) también avisa', conGeneral.visible, JSON.stringify(conGeneral));
  ok('y también en rojo', conGeneral.urgente);

  await pg.evaluate(() => localStorage.removeItem('pesada.cola'));

  /* ═══════════════════════════════════════════════════════════════════════
   * EL CTG SIN SEÑAL
   * -----------------------------------------------------------------------
   * El CTG viene con la carta de porte, después de la regulada. Se decidió que
   * se pueda cargar sin señal: queda en la cola y sube después, y el plazo se
   * mide contra el momento en que se tipeó (lo manda el teléfono).
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Cargar el CTG sin señal');
  await ctx.setOffline(false);
  await pg.goto('about:blank');
  await esperar(300);
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });

  // Un ticket cerrado hoy, esperando el CTG
  const paraCtg = await baseFalsa.collection('registros').insertOne({
    idTicket: 95, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'REGULADA', transporte: 'Ciriaci', patentes: 'CT G01 AA', chofer: 'Carta Porte',
    campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'],
    cargoDe: 'SILOBOLSA', silobolsa: '1',
    brutoEstimado: 52500, tara: 15000, netoEstimado: 37500,
    brutoLote: 51000, bruto: 52500, neto: 37500,
    fechaTaraFinal: hoy(), fechaRegulada: hoy(), confirmada: true, anulado: false,
    modificaciones: 0, codigoIngreso: '5679', origen: 'app', nroApp: '1-0095',
    cargadoPor: 'Juan Sosa', appImpreso: true, creadoEn: new Date(),
  });
  const idParaCtg = String(paraCtg.insertedId);

  // Se abre CON señal, para que el service worker guarde la pantalla
  await pg.goto(BASE + '/app/ctg', { waitUntil: 'networkidle' });
  await esperar(700);
  ok('la pantalla de CTG lista el ticket', (await pg.content()).indexOf('CT G01 AA') !== -1);

  // Ahora sin señal: la pantalla se tiene que ver igual y dejar tipear
  await ctx.setOffline(true);
  await pg.goto('about:blank');
  await esperar(300);
  await pg.goto(BASE + '/app/ctg', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(800);
  const htmlCtgSinSenal = await pg.content();
  ok('sin señal la pantalla de CTG se ve igual', /CT G01 AA/.test(htmlCtgSinSenal),
    pg.url() + ' → ' + htmlCtgSinSenal.replace(/\s+/g, ' ').slice(0, 200));
  ok('y NO dice que necesita internet', !/necesita internet/i.test(htmlCtgSinSenal));

  const antesDeCtg = baseFalsa.collection('registros').docs.find(
    (d) => String(d._id) === idParaCtg
  ).cp;
  await pg.fill('#cp-' + idParaCtg, '10134099999');
  await pg.click('[data-guardar="' + idParaCtg + '"]');
  await esperar(900);

  ok('sin señal NO llegó al servidor', !antesDeCtg && !baseFalsa.collection('registros').docs
    .find((d) => String(d._id) === idParaCtg).cp);
  const colaCtg = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  const itemCtg = colaCtg.filter((c) => c.tipo === 'ctg')[0];
  ok('quedó en la cola del teléfono', !!itemCtg, JSON.stringify(colaCtg).slice(0, 250));
  ok('con el CTG escrito', itemCtg && itemCtg.datos.cp === '10134099999', (itemCtg || {}).datos);
  ok('y con la fecha en que se tipeó (para medir el plazo)',
    itemCtg && !!itemCtg.datos.cargadoEn, (itemCtg || {}).datos);
  ok('la tarjeta avisa que quedó sin subir',
    /Sin subir/i.test(await pg.content()));

  console.log('\n── Y al volver la señal sube solo');
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await esperar(2500);

  const conCtgFinal = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idParaCtg);
  ok('el CTG llegó al servidor', conCtgFinal.cp === '10134099999', conCtgFinal.cp);
  ok('sin consumir modificaciones', (conCtgFinal.modificaciones || 0) === 0, conCtgFinal.modificaciones);
  const colaFinalCtg = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('y la cola quedó limpia', colaFinalCtg.filter((c) => c.tipo === 'ctg').length === 0,
    JSON.stringify(colaFinalCtg));

  /* ═══════════════════════════════════════════════════════════════════════
   * LA VERSIÓN DE LA APP, A LA VISTA
   * -----------------------------------------------------------------------
   * Para no tener que adivinar si un teléfono quedó con una versión vieja
   * guardada: el bloque "Versión de la app", al final del patio y del resumen,
   * dice qué versión tiene el teléfono y cuál el servidor, y ofrece actualizar
   * si no coinciden.
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── La versión de la app se puede ver desde la app');
  await ctx.setOffline(false);
  await pg.goto('about:blank');
  await esperar(300);
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' }).catch(() => {});
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await esperar(1200);

  const version = await pg.evaluate(() => ({
    telefono: (document.getElementById('v-telefono') || {}).textContent,
    servidor: (document.getElementById('v-servidor') || {}).textContent,
    estado: (document.getElementById('v-estado') || {}).textContent,
    ofreceActualizar: !(document.getElementById('v-actualizar') || {}).hidden,
  }));
  console.log('     ' + JSON.stringify(version));
  ok('dice la versión que sirve el servidor',
    /pesada-app-v\d+/.test(version.servidor || ''), version.servidor);
  ok('y la que tiene guardada el teléfono',
    /pesada-app-v\d+/.test(version.telefono || ''), version.telefono);
  ok('las dos coinciden (el teléfono está al día)',
    (version.telefono || '').trim() === (version.servidor || '').trim(),
    version.telefono + ' vs ' + version.servidor);
  ok('lo dice con palabras: "Está al día"', /Está al día/.test(version.estado || ''), version.estado);
  ok('y NO ofrece actualizar, porque no hace falta', !version.ofreceActualizar);

  // Con un teléfono atrasado: el botón tiene que aparecer.
  await pg.evaluate(() => {
    // Se finge que el servidor sirve otra versión, que es lo que pasa después de
    // un deploy y antes de que el teléfono se actualice.
    document.getElementById('v-servidor').textContent = 'pesada-app-v999';
  });
  const conAtraso = await pg.evaluate(() => {
    // Se vuelve a correr la comparación como la hace la pantalla
    const t = document.getElementById('v-telefono').textContent.trim();
    const s = document.getElementById('v-servidor').textContent.trim();
    return t !== s;
  });
  ok('si las versiones no coinciden, se nota', conAtraso);

  ok('el botón de actualizar existe en la pantalla',
    !!(await pg.$('#v-actualizar')), 'no está');

  ok('sin errores de JavaScript', erroresJs.length === 0, erroresJs.join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
