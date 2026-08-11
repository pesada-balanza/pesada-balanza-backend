'use strict';
/**
 * Dos cosas que importan para usarla en el campo, con teléfonos de gama media:
 *
 *  1. QUE SEA LIVIANA. Todo lo que manda la app viaja comprimido y cada pantalla
 *     se mantiene por debajo de un peso máximo. Si alguien agranda una pantalla
 *     sin darse cuenta, esta prueba lo avisa.
 *
 *  2. QUE ACTUALIZAR NO BORRE LO PENDIENTE. Las pesadas que quedaron guardadas
 *     en el teléfono por falta de señal, los números reservados y los datos de
 *     los tickets viven en localStorage, y la actualización de la app solo
 *     reemplaza pantallas y archivos. Acá se comprueba a propósito: se borra
 *     TODO lo guardado de pantallas (el peor caso de una actualización) y las
 *     pesadas pendientes tienen que seguir ahí y subirse cuando vuelve internet.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { buscarChromium } = require('./buscar-chromium');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = '3198';

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
const registros = () => baseFalsa.collection('registros').docs;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

let cookies = '';

/**
 * Pide una dirección con node:http (y NO con fetch) porque fetch descomprime
 * solo y entonces no se puede medir lo que realmente viaja por la red.
 */
function pedir(url, opciones) {
  const o = opciones || {};
  return new Promise((resolver, rechazar) => {
    const cab = {
      'X-Forwarded-Proto': 'https',
      'Accept-Encoding': o.comprimir === false ? 'identity' : 'gzip, deflate',
    };
    if (cookies) cab.Cookie = cookies;
    const cuerpo = o.cuerpo ? JSON.stringify(o.cuerpo) : null;
    if (cuerpo) {
      cab['Content-Type'] = 'application/json';
      cab['Content-Length'] = Buffer.byteLength(cuerpo);
    }
    const req = http.request(BASE + url, { method: cuerpo ? 'POST' : 'GET', headers: cab }, (res) => {
      for (const c of res.headers['set-cookie'] || []) cookies = c.split(';')[0];
      const trozos = [];
      res.on('data', (t) => trozos.push(t));
      res.on('end', () => {
        const bytes = Buffer.concat(trozos);
        let texto = '';
        try {
          texto = res.headers['content-encoding'] === 'gzip'
            ? zlib.gunzipSync(bytes).toString('utf8')
            : bytes.toString('utf8');
        } catch (e) {
          texto = '[no se pudo descomprimir: ' + e.message + ']';
        }
        resolver({
          estado: res.statusCode,
          bytes: bytes.length,
          tipo: res.headers['content-type'] || '',
          codificacion: res.headers['content-encoding'] || '',
          vary: res.headers['vary'] || '',
          texto,
        });
      });
    });
    req.on('error', rechazar);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
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
  await esperar(1200);

  const conTF = await baseFalsa.collection('registros').insertOne({
    idTicket: 1, fecha: hoy(), usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    pesadaPara: 'CAMIONES', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    campo: 'El Mataco - SACHAYOJ - SE', codigoIngreso: '5679',
    brutoEstimado: 52500, tara: 15600, netoEstimado: 36900,
    fechaTaraFinal: hoy(), confirmada: false, anulado: false, modificaciones: 0,
    origen: 'app', nroApp: '1-0001', cargadoPor: 'Juan Sosa', appImpreso: true,
    creadoEn: new Date(),
  });
  // Bastante historia para que las sugerencias tengan de dónde salir
  for (let i = 0; i < 1800; i++) {
    await baseFalsa.collection('registros').insertOne({
      idTicket: 100 + i, fecha: hoy(), patentes: 'AA ' + (100 + i) + ' ZZ',
      chofer: 'Chofer ' + i, transporte: 'Transporte ' + (i % 40),
      pesadaPara: 'REGULADA', codigoIngreso: '5679', anulado: false,
    });
  }
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: '5679', fecha: hoy(), nombre: 'Juan Sosa' });
  await pedir('/app/api/ingreso', { cuerpo: { code: '5679' } });

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. TODO VIAJA COMPRIMIDO
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Todo lo que manda la app viaja comprimido');

  // Máximo que puede pesar cada cosa POR LA RED. Son topes holgados: hoy cada
  // una está bastante abajo. Si alguna los pasa, conviene revisar por qué.
  const TOPES = [
    ['/app/patio', 'patio', 5],
    ['/app/nueva-pesada', 'nueva pesada', 7],
    ['/app/regulada/' + conTF.insertedId, 'regulada', 9],
    ['/app/registro/' + conTF.insertedId, 'detalle', 5],
    ['/app/local', 'pantalla sin señal', 8],
    ['/app/ctg', 'cargar CTG', 6],
    ['/app/buscar', 'buscar un ticket', 4],
    // El caso más pesado del buscador: el tope de 100 resultados.
    ['/app/buscar?q=Chofer&rango=30', 'buscar con 100 resultados', 9],
    ['/app/api/tablas', 'tablas (campos, siembra, contratistas)', 5],
    ['/app/api/sugerencias', 'sugerencias', 3],
    ['/app/estatico/app.js', 'app.js', 11],
    ['/app/estatico/app.css', 'app.css', 7],
    ['/app/estatico/ticket.js', 'ticket.js', 5],
    ['/app/estatico/ticket.css', 'ticket.css', 4],
    ['/app/sw.js', 'service worker', 4],
  ];

  let totalCon = 0;
  let totalSin = 0;
  for (const [url, nombre, tope] of TOPES) {
    const con = await pedir(url);
    const sin = await pedir(url, { comprimir: false });
    totalCon += con.bytes;
    totalSin += sin.bytes;

    ok(nombre + ' llega comprimido', con.codificacion === 'gzip',
      'content-encoding: ' + (con.codificacion || 'ninguno'));
    ok(nombre + ' pesa menos de ' + tope + ' KB (' + kb(con.bytes) + ')', con.bytes < tope * 1024, kb(con.bytes));
    ok(nombre + ' comprimido dice lo mismo que sin comprimir', con.texto === sin.texto,
      'con: ' + con.texto.length + ' / sin: ' + sin.texto.length);
  }

  ok('el ahorro total de la primera vez es de más del 60%',
    totalCon < totalSin * 0.4, kb(totalSin) + ' → ' + kb(totalCon));
  console.log('     primera vez: ' + kb(totalSin) + ' sin comprimir → ' + kb(totalCon) + ' comprimido');

  // Las pantallas tienen que seguir siendo HTML: si al comprimir se perdiera el
  // tipo, el teléfono ofrecería descargar un archivo en vez de abrir la pantalla.
  const patio = await pedir('/app/patio');
  ok('las pantallas siguen siendo HTML al comprimirse', /text\/html/.test(patio.tipo), patio.tipo);
  ok('avisa que la respuesta depende de si el teléfono acepta comprimido',
    /accept-encoding/i.test(patio.vary), patio.vary);
  const css = await pedir('/app/estatico/app.css');
  ok('el css sigue siendo css', /text\/css/.test(css.tipo), css.tipo);
  const tablas = await pedir('/app/api/tablas');
  ok('los datos siguen siendo JSON válido', (() => {
    try { return JSON.parse(tablas.texto).ok === true; } catch (e) { return false; }
  })(), tablas.tipo);

  // Un teléfono viejo que no sepa comprimido tiene que recibir todo igual.
  const viejo = await pedir('/app/patio', { comprimir: false });
  ok('un teléfono que no acepta comprimido recibe la pantalla igual',
    viejo.estado === 200 && !viejo.codificacion && /Patio/.test(viejo.texto), viejo.estado + ' ' + viejo.codificacion);

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. LA WEB NO SE TOCA
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── La compresión es solo de la app: la web queda igual');
  const web = await pedir('/');
  ok('la web NO manda comprimido (sigue como siempre)', !web.codificacion,
    'content-encoding: ' + (web.codificacion || 'ninguno'));
  ok('y la web carga bien', web.estado === 200 && web.texto.length > 500, web.estado + ' / ' + web.texto.length);
  const tabla = await pedir('/tabla');
  ok('las otras pantallas de la web tampoco cambian', !tabla.codificacion,
    'content-encoding: ' + (tabla.codificacion || 'ninguno'));

  /* ═══════════════════════════════════════════════════════════════════════
   * 3. EL SERVICE WORKER NO PUEDE TOCAR LO GUARDADO
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── El service worker no puede borrar las pesadas pendientes');
  const fuenteSw = fs.readFileSync(path.join(PROY, 'app-movil-estaticos', 'sw.js'), 'utf8');
  // Se miran las líneas de código, no los comentarios: el archivo NOMBRA
  // localStorage al explicar de quién es cada cosa, pero no lo usa.
  const codigoSw = fuenteSw
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  ok('el service worker no usa localStorage en ninguna línea de código',
    codigoSw.indexOf('localStorage') === -1,
    (codigoSw.split('\n').filter((l) => l.indexOf('localStorage') !== -1)[0] || '').trim());
  ok('ningún archivo de la app borra lo guardado de golpe',
    ['app.js', 'sw.js', 'ticket.js'].every((f) => {
      const t = fs.readFileSync(path.join(PROY, 'app-movil-estaticos', f), 'utf8');
      return t.indexOf('localStorage.clear') === -1;
    }));
  ok('solo borra copias suyas (caches.delete de versiones viejas)',
    /caches\.delete/.test(fuenteSw) &&
    /k === CACHE_FIJOS \|\| k === CACHE_PANTALLAS/.test(fuenteSw));
  ok('separa los archivos fijos de las pantallas, para poder tirar solo las pantallas',
    /CACHE_FIJOS/.test(fuenteSw) && /CACHE_PANTALLAS/.test(fuenteSw));
  ok('antes de borrar la copia vieja comprueba que la nueva esté completa',
    /cache\.match\('\/app\/estatico\/app\.js'\)/.test(fuenteSw) && /if \(!estaCompleta\) return null/.test(fuenteSw));
  ok('si la descarga queda a medias NO toma el relevo (addAll + skipWaiting juntos)',
    /addAll\([\s\S]{0,400}skipWaiting\(\)/.test(fuenteSw));

  /* ═══════════════════════════════════════════════════════════════════════
   * 4. EN UN NAVEGADOR DE VERDAD: ACTUALIZAR NO PIERDE NADA
   * ═════════════════════════════════════════════════════════════════════ */
  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({ executablePath: buscarChromium() || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
  });
  const pg = await ctx.newPage();
  const erroresJs = [];
  pg.on('pageerror', (e) => erroresJs.push(e.message));

  console.log('\n── Se carga una pesada sin señal y después se "actualiza" la app');
  await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
  await pg.evaluate(async () => {
    await fetch('/app/api/ingreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '5679' }),
    });
  });
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await esperar(1500);

  await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'networkidle' });
  await pg.fill('#patentes', 'UP 777 DT');
  await pg.fill('#chofer', 'Antes De Actualizar');
  await pg.fill('#transporte', 'Ciriaci');
  await pg.selectOption('#campo', 'El Mataco - SACHAYOJ - SE');

  const antes = registros().length;
  await ctx.setOffline(true);
  await pg.evaluate(() => window.dispatchEvent(new Event('offline')));
  await pg.waitForTimeout(200);
  await pg.click('#guardar');
  await pg.waitForTimeout(700);

  const guardadoAntes = await pg.evaluate(() => ({
    cola: JSON.parse(localStorage.getItem('pesada.cola') || '[]'),
    numeros: JSON.parse(localStorage.getItem('pesada.numeros') || '[]'),
    tickets: JSON.parse(localStorage.getItem('pesada.tickets') || '{}'),
    tablas: JSON.parse(localStorage.getItem('pesada.tablas') || 'null'),
  }));
  ok('la pesada quedó en la cola del teléfono', guardadoAntes.cola.length === 1, guardadoAntes.cola.length);
  ok('no llegó al servidor (no hay señal)', registros().length === antes, registros().length);
  ok('hay números reservados guardados', guardadoAntes.numeros.length > 0, guardadoAntes.numeros.length);
  ok('hay tablas guardadas para trabajar sin señal', !!guardadoAntes.tablas);

  // ESTA ES LA PRUEBA: se borra TODO lo que guarda el service worker (pantallas,
  // css, js). Es el peor caso posible de una actualización.
  const cachesBorrados = await pg.evaluate(async () => {
    const claves = await caches.keys();
    for (const k of claves) await caches.delete(k);
    return claves.length;
  });
  ok('se borró todo lo que guarda el service worker (' + cachesBorrados + ' copia/s)', cachesBorrados > 0, cachesBorrados);

  const guardadoDespues = await pg.evaluate(() => ({
    cola: JSON.parse(localStorage.getItem('pesada.cola') || '[]'),
    numeros: JSON.parse(localStorage.getItem('pesada.numeros') || '[]'),
    tickets: JSON.parse(localStorage.getItem('pesada.tickets') || '{}'),
    tablas: JSON.parse(localStorage.getItem('pesada.tablas') || 'null'),
  }));
  ok('la pesada pendiente SIGUE ahí después de la actualización',
    guardadoDespues.cola.length === 1 && guardadoDespues.cola[0].datos.patentes === 'UP 777 DT',
    JSON.stringify(guardadoDespues.cola).slice(0, 200));
  ok('con su mismo id local (así no se duplica al subir)',
    guardadoDespues.cola[0].localId === guardadoAntes.cola[0].localId);
  ok('con su mismo número reservado',
    guardadoDespues.cola[0].datos.nro === guardadoAntes.cola[0].datos.nro,
    guardadoDespues.cola[0].datos.nro);
  ok('los números reservados siguen ahí',
    guardadoDespues.numeros.length === guardadoAntes.numeros.length, guardadoDespues.numeros.length);
  ok('los datos de los tickets para imprimir siguen ahí',
    Object.keys(guardadoDespues.tickets).length === Object.keys(guardadoAntes.tickets).length,
    Object.keys(guardadoDespues.tickets).length);
  ok('las tablas para trabajar sin señal siguen ahí', !!guardadoDespues.tablas);

  console.log('\n── Y cuando vuelve internet se sube igual');
  await ctx.setOffline(false);
  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  await pg.waitForTimeout(2500);

  ok('la pesada que había quedado pendiente llegó al servidor',
    registros().length === antes + 1, registros().length);
  const subida = registros()[registros().length - 1];
  ok('con los datos correctos', subida && subida.patentes === 'UP 777 DT',
    JSON.stringify(subida || {}).slice(0, 200));
  ok('y con el número que tenía reservado antes de actualizar',
    subida && subida.nroApp === guardadoAntes.cola[0].datos.nro,
    (subida || {}).nroApp + ' vs ' + guardadoAntes.cola[0].datos.nro);
  const colaFinal = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.cola') || '[]'));
  ok('la cola quedó vacía', colaFinal.length === 0, JSON.stringify(colaFinal));

  /* ═══════════════════════════════════════════════════════════════════════
   * 5. UNA VEZ SUBIDO, EL TELÉFONO SE LIMPIA
   * -----------------------------------------------------------------------
   * Que la cola se vacíe no alcanza: el ticket también quedaba guardado para
   * poder imprimirlo, y eso se iba juntando sin parar.
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Una vez subido, el teléfono no se queda con copias de más');
  const localIdSubido = guardadoAntes.cola[0].localId;
  const idServidor = String(subida._id);

  const ticketsFinal = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.tickets') || '{}'));
  ok('la copia con el id local se borró al subirse',
    !ticketsFinal[localIdSubido], 'sigue estando: ' + localIdSubido);
  ok('y quedó una sola, con el id de la base', !!ticketsFinal[idServidor], Object.keys(ticketsFinal).join(', '));
  ok('con su número de ticket', ticketsFinal[idServidor] && ticketsFinal[idServidor].nro === subida.nroApp,
    (ticketsFinal[idServidor] || {}).nro + ' vs ' + subida.nroApp);
  ok('cada ticket guardado sabe cuándo se guardó (para poder limpiarlo)',
    Object.keys(ticketsFinal).every((k) => !!ticketsFinal[k].guardadoEn),
    JSON.stringify(ticketsFinal).slice(0, 200));

  // Se plantan tickets viejos y de más, y se comprueba que al abrir se limpien.
  await pg.evaluate(() => {
    const tickets = JSON.parse(localStorage.getItem('pesada.tickets') || '{}');
    const ahora = new Date().getTime();
    const unDia = 24 * 60 * 60 * 1000;
    // Tres de hace 20 días: no sirven más (el ticket vence a los 5).
    for (let i = 0; i < 3; i++) {
      tickets['viejo-' + i] = { id: 'viejo-' + i, nro: '9-000' + i, guardadoEn: ahora - 20 * unDia };
    }
    // Y 50 de ayer: más de los que tiene sentido guardar.
    for (let i = 0; i < 50; i++) {
      tickets['ayer-' + i] = { id: 'ayer-' + i, nro: '8-00' + i, guardadoEn: ahora - unDia };
    }
    localStorage.setItem('pesada.tickets', JSON.stringify(tickets));
  });
  const antesDeLimpiar = await pg.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('pesada.tickets') || '{}')).length);
  ok('se plantaron 53 tickets de prueba (3 viejos + 50 de ayer)', antesDeLimpiar >= 53, antesDeLimpiar);

  await pg.goto(BASE + '/app/patio', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
  const despuesDeLimpiar = await pg.evaluate(() => JSON.parse(localStorage.getItem('pesada.tickets') || '{}'));
  const claves = Object.keys(despuesDeLimpiar);
  ok('al abrir la app se tiran los de más de 7 días',
    claves.every((k) => k.indexOf('viejo-') === -1), claves.filter((k) => k.indexOf('viejo-') === 0).join(', '));
  ok('y no se guardan más de 30', claves.length <= 30, claves.length);
  ok('el más nuevo se conserva', claves.length > 0);

  ok('sin errores de JavaScript en toda la corrida', erroresJs.length === 0, erroresJs.join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
