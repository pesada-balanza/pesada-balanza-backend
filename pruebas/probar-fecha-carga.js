'use strict';
/**
 * QUÉ DÍA CARGA EL CAMIÓN
 *
 * Hasta ahora el ticket nacía siempre con la fecha del día en que alguien lo
 * tipeaba. GENERAL no tenía cómo dejar preparados los camiones de mañana ni los
 * de la semana: si los cargaba antes, quedaban con la fecha de ese día.
 *
 * Ahora `fecha` es el día en que CARGA el camión, lo elige GENERAL entre hoy y
 * los 7 días siguientes, y el ticket le aparece al balancero recién ese día.
 * Cuándo se tipeó no se perdió: sigue en `creadoEn`.
 *
 * Las cuatro cosas que pueden salir mal:
 *
 *  1. QUE APAREZCA ANTES DE TIEMPO. Es lo más fácil de romper y lo más dañino:
 *     la cuenta de vigencia sólo mira hacia atrás, así que una fecha futura le
 *     da negativo y pasa como vigente. Sin la línea que los saltea, dejar
 *     preparada la semana le llena el patio al balancero HOY con los camiones
 *     de los siete días.
 *
 *  2. QUE LA ELIJA QUIEN NO DEBE. Sólo el código GENERAL de carga. Un balancero
 *     puede mandar el dato igual —la pantalla no es la única puerta—, y el
 *     servidor lo tiene que ignorar.
 *
 *  3. QUE ENTRE CUALQUIER FECHA. Para adelante hay tope de 7 días. Para atrás
 *     la pantalla no la ofrece, pero sí puede LLEGAR una y es legítima: una
 *     pesada cargada sin señal el jueves que el teléfono sube el lunes trae el
 *     jueves. Rechazarla dejaría la cola trabada para siempre.
 *
 *  4. QUE EL AVISO DE REPETIDO MIRE EL DÍA EQUIVOCADO. "Repetido" pasó a
 *     significar repetido EN SU DÍA DE CARGA. Comparando contra hoy, dos
 *     tickets para el mismo lunes no se avisan nunca.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3214';

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
/** Hoy más `n` días (n negativo = para atrás), con el mismo criterio que la app. */
function diaMas(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}
const HOY = diaMas(0);
const registros = () => baseFalsa.collection('registros');
const leer = (id) => registros().docs.find((d) => String(d._id) === String(id));

const MATACO = '5679';
const GENERAL_CARGA = '56781';
const GENERAL_OBSERVA = '12341';
const CAMPO = 'El Mataco - SACHAYOJ - SE';

/** El cuerpo de una pesada nueva. `fechaCarga` sólo si se pasa. */
function pesada(extra) {
  return Object.assign({
    cargaPara: 'AMH', socio: '',
    transporte: 'Ciriaci', chofer: 'R. GÓMEZ', patentes: 'AC 884 TF',
    campo: CAMPO, brutoEstimado: 52500, tara: '',
  }, extra || {});
}

/** Entra con un código, dejando el nombre del día puesto. */
async function entrar(codigo, nombre) {
  cookies = {};
  // upsert y no insert: a lo largo de la prueba se entra y se sale varias veces
  // con el mismo código, y el día ya quedó puesto la primera vez.
  await baseFalsa.collection('app_dias').updateOne(
    { codigoIngreso: codigo, fecha: HOY },
    { $set: { nombre } },
    { upsert: true }
  );
  return ir('POST', '/app/api/ingreso', { code: codigo });
}

/** Los camiones que el balancero ve en su patio, por número de ticket. */
async function patio() {
  const r = await ir('GET', '/app/api/patio');
  return ((r.json && r.json.datos && r.json.datos.camiones) || []).map((c) => c.nro);
}

async function main() {
  await new Promise((r) => setTimeout(r, 1300));

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. LA PANTALLA: EL CAMPO ES SÓLO DE GENERAL
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El campo del día sólo aparece con el código GENERAL');

  let r = await entrar(MATACO, 'Juan Sosa');
  ok('la balanza entra', r.estado === 200, r.texto.slice(0, 120));

  r = await ir('GET', '/app/nueva-pesada');
  ok('al balancero la pantalla NO le trae el campo del día',
    r.texto.indexOf('name="fechaCarga"') === -1);
  ok('ni la pregunta', r.texto.indexOf('¿Qué día carga?') === -1);
  ok('ni el renglón de aviso', r.texto.indexOf('id="aviso-fecha"') === -1);
  // Ni el javascript que lo maneja: el campo no existe, así que ese código no
  // tiene nada que hacer en el teléfono del balancero.
  ok('ni el código que lo maneja', r.texto.indexOf('revisarFecha') === -1);

  r = await entrar(GENERAL_CARGA, 'Matías H');
  ok('GENERAL entra', r.estado === 200, r.texto.slice(0, 120));

  r = await ir('GET', '/app/nueva-pesada');
  const html = r.texto;
  ok('a GENERAL sí le trae el campo', html.indexOf('name="fechaCarga"') !== -1);
  ok('con hoy primero y marcado como tal',
    html.indexOf('<option value="' + HOY + '">hoy — ') !== -1);
  ok('y con los 7 días siguientes', html.indexOf('value="' + diaMas(7) + '"') !== -1);
  ok('ni uno más: el octavo no está', html.indexOf('value="' + diaMas(8) + '"') === -1);
  ok('ni uno para atrás', html.indexOf('value="' + diaMas(-1) + '"') === -1);
  const cuantas = (html.match(/<option value="20\d\d-/g) || []).length;
  ok('son exactamente 8 opciones', cuantas === 8, cuantas);

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. SE GUARDA EL DÍA ELEGIDO, NO EL DÍA EN QUE SE TIPEÓ
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El ticket queda con el día de carga');

  const lunes = diaMas(4);
  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: lunes, patentes: 'AA 111 AA' }));
  ok('GENERAL carga un camión para dentro de 4 días', r.estado === 200, r.texto.slice(0, 200));
  const precargado = leer(r.json.id);
  ok('el ticket queda con ESA fecha', precargado.fecha === lunes, precargado.fecha);
  ok('y no con la de hoy', precargado.fecha !== HOY, precargado.fecha);
  ok('cuándo se tipeó no se pierde: queda en creadoEn',
    ymd(new Date(precargado.creadoEn)) === HOY, String(precargado.creadoEn));
  ok('y se derivó a la balanza del campo, no al código de GENERAL',
    precargado.codigoIngreso === MATACO, precargado.codigoIngreso);

  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: HOY, patentes: 'AA 222 AA' }));
  const deHoy = leer(r.json.id);
  ok('eligiendo hoy queda con hoy', deHoy.fecha === HOY, deHoy.fecha);

  r = await ir('POST', '/app/api/pesada', pesada({ patentes: 'AA 333 AA' }));
  ok('sin mandar nada, también queda con hoy', leer(r.json.id).fecha === HOY);

  /* ═══════════════════════════════════════════════════════════════════════
   * 3. LOS TOPES
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Qué fechas entran y cuáles no');

  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: diaMas(7), patentes: 'AA 444 AA' }));
  ok('el séptimo día entra', r.estado === 200, r.texto.slice(0, 200));

  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: diaMas(8), patentes: 'AA 555 AA' }));
  ok('el octavo lo rechaza el servidor', r.estado === 400, r.estado + ' ' + r.texto.slice(0, 160));
  ok('y el mensaje dice el tope real', /7 días/.test(r.texto), r.texto.slice(0, 160));

  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: 'lunes', patentes: 'AA 666 AA' }));
  ok('una fecha que no es fecha se rechaza', r.estado === 400, r.estado);

  /* La cola sin señal: esto NO es alguien eligiendo el pasado, es una pesada
     vieja que recién ahora se pudo subir. La fecha que trae es la buena. */
  const jueves = diaMas(-4);
  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: jueves, patentes: 'AA 777 AA' }));
  ok('una pesada demorada en la cola entra con su fecha vieja', r.estado === 200,
    r.texto.slice(0, 200));
  const demorado = leer(r.json.id);
  ok('y queda con el día en que cargó de verdad', demorado.fecha === jueves, demorado.fecha);

  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: diaMas(-31), patentes: 'AA 888 AA' }));
  ok('pero una fecha absurda no entra', r.estado === 400, r.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * 4. UN BALANCERO NO ELIGE EL DÍA
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El balancero no puede elegir el día aunque lo mande');

  await entrar(MATACO, 'Juan Sosa');
  r = await ir('POST', '/app/api/pesada', pesada({ fechaCarga: diaMas(3), patentes: 'BB 111 BB' }));
  ok('la pesada se guarda igual', r.estado === 200, r.texto.slice(0, 200));
  ok('pero con la fecha de hoy: el dato se ignora', leer(r.json.id).fecha === HOY,
    leer(r.json.id).fecha);

  /* ═══════════════════════════════════════════════════════════════════════
   * 5. EL PATIO: NO ANTES DE TIEMPO
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El precargado no aparece hasta su día');

  const enPatio = await patio();
  ok('el camión de hoy está en el patio', enPatio.indexOf(deHoy.nroApp) !== -1,
    JSON.stringify(enPatio));
  ok('el precargado para dentro de 4 días NO está',
    enPatio.indexOf(precargado.nroApp) === -1, JSON.stringify(enPatio));
  /* El de la cola demorada tampoco, pero por el motivo contrario: cargó hace
     cuatro días, así que ya venció. Antes de este cambio ese ticket entraba con
     la fecha del día en que se subía y aparecía como si el camión estuviera en
     el patio. */
  ok('el demorado tampoco está: cargó hace cuatro días y ya venció',
    enPatio.indexOf(demorado.nroApp) === -1, JSON.stringify(enPatio));

  /* Del patio no se llega, pero desde Buscar sí: tampoco se puede empezar a
     cerrar antes de tiempo. Sin esto se podría pesar vacío un camión que
     todavía no vino y dejarle una tara final anterior a su día de carga. */
  r = await ir('GET', '/app/tara-final/' + precargado._id);
  ok('la pantalla de tara final de un preparado no deja seguir',
    /Todavía no/.test(r.texto), r.texto.slice(0, 200));
  r = await ir('POST', '/app/api/tara-final', {
    id: String(precargado._id), taraNueva: 15600,
  });
  ok('y el servidor tampoco, aunque se mande a mano', r.estado === 400,
    r.estado + ' ' + r.texto.slice(0, 160));
  ok('el ticket sigue sin tara final', !leer(precargado._id).fechaTaraFinal);

  /* Llega el día: lo único que cambia es la fecha del ticket. */
  precargado.fecha = HOY;
  const ahora = await patio();
  ok('cuando llega su día, aparece solo', ahora.indexOf(precargado.nroApp) !== -1,
    JSON.stringify(ahora));
  ok('y aparece como pendiente de TARA FINAL, igual que cualquiera',
    ((await ir('GET', '/app/api/patio')).json.datos.camiones
      .find((c) => c.nro === precargado.nroApp) || {}).paso === 'TARA_FINAL');
  precargado.fecha = lunes;

  /* ═══════════════════════════════════════════════════════════════════════
   * 6. EL AVISO DE REPETIDO MIRA EL DÍA DE CARGA
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Repetido quiere decir repetido en SU día');

  // Un camión ya cargado para el lunes en OTRA balanza.
  registros().docs.push({
    _id: new ObjectId(), idTicket: 900, nroApp: '9-0900', origen: 'app',
    fecha: lunes, pesadaPara: 'CAMIONES', patentes: 'ZZ 999 ZZ',
    campo: 'Charata - CHARATA - CH', codigoIngreso: '5680',
    anulado: false, confirmada: false, creadoEn: new Date(),
  });

  await entrar(GENERAL_CARGA, 'Matías H');
  r = await ir('GET', '/app/api/repetido?patentes=ZZ+999+ZZ&campo=' +
    encodeURIComponent(CAMPO) + '&fechaCarga=' + lunes);
  ok('preparando el mismo camión para el mismo lunes, avisa',
    !!(r.json && r.json.repetido), r.texto.slice(0, 200));

  r = await ir('GET', '/app/api/repetido?patentes=ZZ+999+ZZ&campo=' +
    encodeURIComponent(CAMPO) + '&fechaCarga=' + HOY);
  ok('pero para hoy no avisa: es otro día, es otro viaje',
    !(r.json && r.json.repetido), r.texto.slice(0, 200));

  /* ═══════════════════════════════════════════════════════════════════════
   * 7. EL AVISO DE CAMIONES PREPARADOS
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El aviso de camiones preparados');

  // Uno para mañana, que es el caso que el aviso nombra distinto.
  await entrar(GENERAL_CARGA, 'Matías H');
  await ir('POST', '/app/api/pesada', pesada({ fechaCarga: diaMas(1), patentes: 'DD 111 DD' }));

  /* Lo esperado se calcula de la base y no se escribe a mano: así la prueba no
     se rompe cada vez que una sección de arriba agrega un camión más. */
  const futuros = registros().docs.filter((d) =>
    d.pesadaPara === 'CAMIONES' && !d.anulado && !d.confirmada && d.fecha > HOY);
  const diasFuturos = Array.from(new Set(futuros.map((d) => d.fecha))).sort();
  ok('hay camiones preparados para más de un día', diasFuturos.length > 1, diasFuturos.join());

  r = await ir('GET', '/app/general');
  ok('el código que carga ve el aviso',
    r.texto.indexOf(futuros.length + ' camiones preparados') !== -1, r.texto.length);
  ok('y nombra a mañana como "mañana", no con el día de la semana',
    r.texto.indexOf('mañana: ') !== -1);


  for (const f of diasFuturos) {
    const cuantos = futuros.filter((d) => d.fecha === f).length;
    const etiqueta = f === diaMas(1) ? 'mañana' : null;
    ok('dice cuántos hay para el ' + (etiqueta || f),
      etiqueta ? r.texto.indexOf('mañana: ' + cuantos) !== -1
               : new RegExp('\\w+ \\d+: ' + cuantos).test(r.texto), f + ' × ' + cuantos);
  }

  await entrar(GENERAL_OBSERVA, 'Matías H');
  r = await ir('GET', '/app/general');
  ok('el código que mira también lo ve',
    r.texto.indexOf(futuros.length + ' camiones preparados') !== -1);

  /* "En curso" cuenta lo que está pasando AHORA. Un camión preparado para el
     lunes no está en curso, y contarlo ahí dejaba el resumen diciendo un número
     que no se podía cruzar con nada: el patio mostraba menos camiones. */
  const abiertosHoy = registros().docs.filter((d) =>
    d.pesadaPara === 'CAMIONES' && !d.anulado && !d.confirmada &&
    d.fecha <= HOY && d.fecha >= diaMas(-2));
  // En el HTML dice "En curso"; las mayúsculas que se ven las pone el CSS.
  const enCurso = />En curso<[\s\S]{0,600}?dato-xg">(\d+)</.exec(r.texto);
  ok('"En curso" no cuenta los preparados',
    enCurso && Number(enCurso[1]) === abiertosHoy.length,
    (enCurso ? enCurso[1] : 'sin número') + ' vs ' + abiertosHoy.length +
      ' (futuros: ' + futuros.length + ')');

  await entrar(MATACO, 'Juan Sosa');
  r = await ir('GET', '/app/general');
  ok('al balancero NO le aparece', r.texto.indexOf('preparados') === -1);
  const suPatio = await ir('GET', '/app/patio');
  ok('ni en su patio', suPatio.texto.indexOf('preparados') === -1);

  /* Que se vaya solo cuando no queda ninguno: un aviso que queda pegado se
     vuelve parte del fondo y deja de avisar. */
  const guardadas = futuros.map((d) => d.fecha);
  futuros.forEach((d) => { d.anulado = true; });
  await entrar(GENERAL_OBSERVA, 'Matías H');
  r = await ir('GET', '/app/general');
  ok('sin ninguno preparado, el aviso no está', r.texto.indexOf('preparados') === -1);
  futuros.forEach((d, i) => { d.anulado = false; d.fecha = guardadas[i]; });

  /* ═══════════════════════════════════════════════════════════════════════
   * 8. EN UN NAVEGADOR DE VERDAD
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('La pantalla en el teléfono');

  let chromium = null;
  try { chromium = require(path.join(PROY, 'node_modules', 'playwright')).chromium; } catch (e) { /* sin navegador */ }
  if (!chromium) {
    console.log('  … SALTEADA la parte del navegador (falta Playwright)');
  } else {
    const navegador = await chromium.launch({ executablePath: buscarChromium() || undefined });
    const ctx = await navegador.newContext({
      viewport: { width: 360, height: 760 },
      extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    });
    const pg = await ctx.newPage();
    const errores = [];
    pg.on('pageerror', (e) => errores.push(e.message));

    await pg.goto(BASE + '/app/ingreso', { waitUntil: 'networkidle' });
    await pg.evaluate(async (codigo) => {
      await fetch('/app/api/ingreso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codigo }),
      });
    }, GENERAL_CARGA);

    await pg.goto(BASE + '/app/nueva-pesada', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);

    ok('con hoy elegido el renglón de aviso está vacío',
      (await pg.textContent('#aviso-fecha')).trim() === '');

    await pg.selectOption('#fechaCarga', diaMas(4));
    await pg.waitForTimeout(250);
    const aviso = (await pg.textContent('#aviso-fecha')).trim();
    ok('al elegir otro día avisa a quién le va a aparecer',
      /^Le aparece al balancero el \w+\.$/.test(aviso), aviso);

    await pg.selectOption('#fechaCarga', HOY);
    await pg.waitForTimeout(250);
    ok('y volviendo a hoy el renglón se vacía',
      (await pg.textContent('#aviso-fecha')).trim() === '');

    // Se carga un camión entero desde la pantalla, para el día siguiente.
    await pg.selectOption('#fechaCarga', diaMas(1));
    await pg.fill('#patentes', 'CC 123 CC');
    await pg.fill('#chofer', 'DESDE LA PANTALLA');
    await pg.fill('#transporte', 'Ciriaci');
    await pg.selectOption('#campo', CAMPO);
    await pg.waitForTimeout(250);
    await pg.click('#guardar');
    await pg.waitForTimeout(1500);

    const desdePantalla = registros().docs.find((d) => d.patentes === 'CC 123 CC');
    ok('el camión cargado desde la pantalla se guarda', !!desdePantalla);
    ok('con el día que se eligió ahí', desdePantalla && desdePantalla.fecha === diaMas(1),
      desdePantalla && desdePantalla.fecha);

    ok('la pantalla no tiró ningún error de javascript', errores.length === 0, errores.join(' | '));
    await navegador.close();
  }

  console.log('\n════════════════════════════════════════');
  if (fallos) console.log('  ' + fallos + ' FALLAS de ' + pruebas);
  else console.log('  TODO BIEN — ' + pruebas + ' comprobaciones');
  console.log('════════════════════════════════════════\n');
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
