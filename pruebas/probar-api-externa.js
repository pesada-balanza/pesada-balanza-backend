'use strict';
/**
 * La API de solo lectura para el programa de cartas de porte.
 *
 * Lo que más importa acá es lo que NO puede hacer: es una puerta abierta a
 * internet en el servidor que está en uso. Se comprueba que sin token no
 * entregue nada, que no se pueda escribir por ninguna vía, que no deje ver más
 * atrás de la ventana acordada y que no se le escapen datos internos.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3215';
// 64 caracteres, como el que va a ir en Render.
process.env.API_EXTERNA_TOKEN = 'a'.repeat(64);

const { BaseFalsa, ObjectId } = require('./doble-mongo');
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
const TOKEN = process.env.API_EXTERNA_TOKEN;
let fallos = 0;
let pruebas = 0;

function ok(nombre, condicion, extra) {
  pruebas++;
  if (condicion) console.log('  ✓ ' + nombre);
  else { fallos++; console.log('  ✗ ' + nombre + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}
function seccion(t) { console.log('\n── ' + t); }

const ymd = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => ymd(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
const HOY = haceDias(0);

async function pedir(url, opciones = {}) {
  const headers = {};
  if (opciones.token !== null) headers.Authorization = 'Bearer ' + (opciones.token || TOKEN);
  if (opciones.cuerpo) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method: opciones.metodo || 'GET',
    headers,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    redirect: 'manual',
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* html */ }
  return { estado: res.status, texto, json, tipo: res.headers.get('content-type') || '' };
}

let proximo = 4000;
function meter(extra) {
  const id = proximo++;
  baseFalsa.collection('registros').docs.push(Object.assign({
    _id: new ObjectId(), idTicket: id, nroApp: '1-' + id, origen: 'app',
    fecha: HOY, fechaTaraFinal: HOY, fechaRegulada: HOY, pesadaPara: 'REGULADA',
    confirmada: true, anulado: false, codigoIngreso: '5679',
    campo: 'La Porfía - ARBOL BLANCO - SE', grano: 'MAIZ', lote: ['Lote 5 La Porfía'],
    cargaPara: 'AMH', socio: '', transporte: 'Serden', chofer: 'R. Gómez',
    patentes: 'JWE798    KMT629 ', cargoDe: 'SILOBOLSA',
    silobolsas: [{ nro: '17', kg: 29420 }],
    tara: 15550, brutoLote: 45000, bruto: 45000, neto: 29420,
    cp: '10135350561', comentarios: '',
  }, extra || {}));
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  meter({ patentes: 'JWE798    KMT629 ' });
  meter({ codigoIngreso: '5684', campo: 'Quimili - QUIMILI - SE', patentes: 'QUI 111 AA' });
  meter({ cargaPara: 'SOCIO', socio: 'PROVOINVEST', patentes: 'SOC 222 BB' });
  // Uno que cargó de dos contratistas, para ver el reparto por tractor.
  meter({
    patentes: 'TRA 333 CC', cargoDe: 'CONTRATISTA', silobolsas: [],
    contratista: ['Villa Marcelo', 'Maggi Javier'], tractor: ['1VILLA', '9MAGGI'],
    tractores: [
      { tractor: '1VILLA', contratista: 'Villa Marcelo', kg: 18000 },
      { tractor: '9MAGGI', contratista: 'Maggi Javier', kg: 11420 },
    ],
  });
  // Nada de esto puede salir.
  meter({ patentes: 'ANU 000 UL', anulado: true });
  meter({ patentes: 'ABI 000 ER', fechaRegulada: undefined, pesadaPara: 'TARA FINAL' });
  // Más viejo que la ventana de 30 días.
  const VIEJO = haceDias(45);
  meter({ patentes: 'VIE 000 JO', fecha: VIEJO, fechaRegulada: VIEJO, fechaTaraFinal: VIEJO });

  /* ═══ El token ═══ */
  seccion('Sin el token no sale nada');

  let r = await pedir('/api/externo/camiones', { token: null });
  ok('sin token: 401', r.estado === 401, r.estado);
  ok('y no se filtra ningún dato', !/JWE798/.test(r.texto), r.texto.slice(0, 120));

  r = await pedir('/api/externo/camiones', { token: 'a'.repeat(63) });
  ok('con un token más corto: 401', r.estado === 401, r.estado);
  r = await pedir('/api/externo/camiones', { token: 'b'.repeat(64) });
  ok('con un token del mismo largo pero distinto: 401', r.estado === 401, r.estado);
  ok('el error no dice si falta el token o si está mal',
    r.json && r.json.error === 'No autorizado.', r.json && r.json.error);

  r = await pedir('/api/externo/ping');
  ok('con el token correcto, el ping responde', r.estado === 200 && r.json && r.json.ok, r.estado);

  /* ═══ Qué devuelve ═══ */
  seccion('Los camiones pesados');

  r = await pedir('/api/externo/camiones');
  ok('la lista abre', r.estado === 200 && r.json && r.json.ok, r.estado);
  const cam = (r.json && r.json.camiones) || [];
  const pats = cam.map((c) => c.patentes);
  ok('trae los camiones con la regulada cerrada', pats.indexOf('JWE798 KMT629') !== -1, pats.join(' | '));
  ok('las patentes vienen sin los espacios de más',
    pats.indexOf('JWE798 KMT629') !== -1 && !/ {2}/.test(pats.join('')), JSON.stringify(pats));
  ok('NO trae el anulado', pats.indexOf('ANU 000 UL') === -1, pats.join(' | '));
  ok('NO trae el que no cerró la regulada', pats.indexOf('ABI 000 ER') === -1, pats.join(' | '));
  ok('trae TODAS las balanzas, no una sola',
    pats.indexOf('QUI 111 AA') !== -1 && pats.indexOf('JWE798 KMT629') !== -1, pats.join(' | '));

  const uno = cam.find((c) => c.patentes === 'JWE798 KMT629') || {};
  ok('el CTG sale como "ctg", no como "cp"',
    uno.ctg === '10135350561' && uno.cp === undefined, JSON.stringify(uno.ctg));
  ok('trae los pesos que hacen falta para la carta',
    uno.tara === 15550 && uno.bruto === 45000 && uno.neto === 29420,
    [uno.tara, uno.bruto, uno.neto].join(' / '));
  ok('trae el campo, el grano y los lotes',
    uno.campo === 'La Porfía - ARBOL BLANCO - SE' && uno.grano === 'MAIZ' &&
    Array.isArray(uno.lotes) && uno.lotes[0] === 'Lote 5 La Porfía', JSON.stringify(uno.lotes));
  ok('dice de qué balanza salió, por su nombre', uno.balanza === 'El Mataco', uno.balanza);
  ok('el que cargó de silobolsa no trae tractores',
    Array.isArray(uno.tractores) && uno.tractores.length === 0, JSON.stringify(uno.tractores));

  /* El viaje que cargó de contratistas trae cuántos kg puso cada TRACTOR, con
     el contratista al lado. Lo de cada contratista es la suma de sus
     tractores: no viene calculado, para no tener el mismo dato dos veces. */
  const deContratistas = cam.find((c) => c.patentes === 'TRA 333 CC') || {};
  ok('el que cargó de contratistas trae el reparto por tractor',
    (deContratistas.tractores || []).length === 2, JSON.stringify(deContratistas.tractores));
  ok('con el contratista de cada tractor',
    deContratistas.tractores[0].tractor === '1VILLA' &&
    deContratistas.tractores[0].contratista === 'Villa Marcelo',
    JSON.stringify(deContratistas.tractores));
  ok('y los kg suman el neto del viaje',
    deContratistas.tractores.reduce((a, t) => a + t.kg, 0) === deContratistas.neto,
    JSON.stringify(deContratistas.tractores) + ' vs ' + deContratistas.neto);
  ok('y no trae silobolsas', (deContratistas.silobolsas || []).length === 0);
  ok('el socio sale enderezado al de la lista',
    (cam.find((c) => c.patentes === 'SOC 222 BB') || {}).socio === 'ProvInvest',
    JSON.stringify(cam.find((c) => c.patentes === 'SOC 222 BB')));

  /* Lo interno no se expone: con eso se arma el contrato que después no se
     puede cambiar, y el código de la balanza es una credencial. */
  const crudo = JSON.stringify(cam);
  ok('no expone el _id de Mongo', !/"_id"/.test(crudo));
  ok('no expone el código de la balanza', !/5679|5684/.test(crudo), (crudo.match(/56\d\d/g) || []).join());
  ok('no expone los nombres internos de los campos',
    !/"cp"|"codigoIngreso"|"pesadaPara"|"netoEstimado"/.test(crudo));

  /* ═══ Los camiones en curso ═══
   *
   * Van por una dirección aparte de los terminados. Lo que más importa es que
   * no se puedan confundir: estos tienen la tara PESADA pero el bruto y el
   * neto son ESTIMADOS, porque el camión no se subió cargado todavía. */
  seccion('Los camiones en curso (tara final puesta, falta regular)');

  // Con la tara final puesta y esperando la regulada.
  meter({ patentes: 'ENC 001 AA', chofer: 'Espera Regular',
    pesadaPara: 'TARA FINAL', fechaRegulada: undefined,
    tara: 15000, brutoEstimado: 45000, netoEstimado: 30000,
    neto: undefined, bruto: undefined, cp: '' });
  // Ídem pero de otra balanza: tienen que salir los dos.
  meter({ patentes: 'ENC 002 BB', chofer: 'Otra Balanza', codigoIngreso: '5684',
    campo: 'Quimili - QUIMILI - SE', pesadaPara: 'TARA FINAL', fechaRegulada: undefined,
    tara: 14000, brutoEstimado: 45000, netoEstimado: 31000,
    neto: undefined, bruto: undefined, cp: '' });
  // Todavía NO pesó la tara: no corresponde a esta lista.
  meter({ patentes: 'ENC 003 CC', chofer: 'Sin Tara Aun',
    pesadaPara: 'CAMIONES', fechaTaraFinal: undefined, fechaRegulada: undefined,
    neto: undefined, bruto: undefined, cp: '' });
  // Anulado esperando regular: tampoco.
  meter({ patentes: 'ENC 004 DD', pesadaPara: 'TARA FINAL',
    fechaRegulada: undefined, anulado: true, neto: undefined, cp: '' });

  r = await pedir('/api/externo/en-curso');
  ok('la lista de en curso abre', r.estado === 200 && r.json && r.json.ok, r.estado);
  const enc = (r.json && r.json.camiones) || [];
  const pEnc = enc.map((c) => c.patentes);
  ok('trae los que ya pesaron la tara y esperan regular',
    pEnc.indexOf('ENC 001 AA') !== -1, pEnc.join(' | '));
  ok('de todas las balanzas', pEnc.indexOf('ENC 002 BB') !== -1, pEnc.join(' | '));
  ok('NO trae el que todavía no pesó la tara',
    pEnc.indexOf('ENC 003 CC') === -1, pEnc.join(' | '));
  ok('NO trae el anulado', pEnc.indexOf('ENC 004 DD') === -1, pEnc.join(' | '));
  ok('NO trae los que ya cerraron la regulada',
    pEnc.indexOf('JWE798 KMT629') === -1, pEnc.join(' | '));

  const unEnc = enc.find((c) => c.patentes === 'ENC 001 AA') || {};
  /* La razón de ser de todo esto: en /camiones el neto está PESADO; acá es
     un supuesto. Si el campo se llamara igual, un tablero que sume los dos
     listados mezclaría kilos reales con kilos inventados sin notarlo. */
  ok('NO existe un campo "neto" en los en curso',
    unEnc.neto === undefined && unEnc.bruto === undefined,
    JSON.stringify(Object.keys(unEnc)));
  ok('los supuestos se llaman "estimado" y lo dicen',
    unEnc.netoEstimado === 30000 && unEnc.brutoEstimado === 45000,
    unEnc.netoEstimado + ' / ' + unEnc.brutoEstimado);
  ok('la tara sí está pesada y viene', unEnc.tara === 15000, unEnc.tara);
  ok('tampoco traen ctg, que todavía no puede existir', unEnc.ctg === undefined);

  /* Para un tablero: cuándo se le vence el plazo a cada uno. */
  ok('dice hasta qué día se puede cerrar la regulada',
    unEnc.venceEl === ymd(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)),
    unEnc.venceEl + ' (fechaTaraFinal ' + unEnc.fechaTaraFinal + ')');
  ok('y marca si ya se le pasó el plazo', unEnc.vencido === false, unEnc.vencido);

  // Uno al que ya se le venció: lo tiene que mostrar, pero marcado.
  const VIEJO_TF = haceDias(9);
  meter({ patentes: 'ENC 005 EE', chofer: 'Se Le Vencio',
    fecha: VIEJO_TF, fechaTaraFinal: VIEJO_TF, fechaRegulada: undefined,
    pesadaPara: 'TARA FINAL', neto: undefined, bruto: undefined, cp: '' });
  r = await pedir('/api/externo/en-curso');
  const vencido = ((r.json && r.json.camiones) || []).find((c) => c.patentes === 'ENC 005 EE');
  ok('un ticket al que se le pasó el plazo sale marcado como vencido',
    vencido && vencido.vencido === true, vencido && (vencido.venceEl + ' · vencido=' + vencido.vencido));

  // Y lo de siempre: sin token no sale nada.
  r = await pedir('/api/externo/en-curso', { token: null });
  ok('los en curso también piden token', r.estado === 401, r.estado);

  /* ═══ La ventana de 30 días ═══ */
  seccion('No se puede mirar más atrás de 30 días');

  ok('lo de hace 45 días no aparece', pats.indexOf('VIE 000 JO') === -1, pats.join(' | '));
  // Se vuelve a pedir: entre medio se consultaron los en curso, y `r` quedó
  // apuntando a ESA respuesta. Mirar la vieja daría un verde que no significa nada.
  r = await pedir('/api/externo/camiones');
  ok('la respuesta dice desde cuándo se puede mirar',
    r.json.ventanaDesde === haceDias(30), r.json.ventanaDesde + ' vs ' + haceDias(30));

  r = await pedir('/api/externo/camiones?desde=2020-01-01&hasta=' + HOY);
  ok('pedir el año pasado no falla: recorta a la ventana',
    r.estado === 200 && r.json.desde === haceDias(30), r.json && r.json.desde);
  ok('y tampoco deja ver lo viejo por esa vía',
    (r.json.camiones || []).every((c) => c.patentes !== 'VIE 000 JO'));

  r = await pedir('/api/externo/camiones?desde=' + HOY + '&hasta=' + haceDias(5));
  ok('un rango al revés se da vuelta, como en el Excel',
    r.estado === 200 && r.json.desde === haceDias(5) && r.json.hasta === HOY,
    r.json && (r.json.desde + ' a ' + r.json.hasta));

  r = await pedir('/api/externo/camiones?desde=cualquier-cosa&hasta=');
  ok('una fecha inventada no rompe nada', r.estado === 200 && r.json.ok, r.estado);

  r = await pedir('/api/externo/camiones?hasta=' + haceDias(-5));
  ok('una fecha futura se recorta a hoy', r.json && r.json.hasta === HOY, r.json && r.json.hasta);

  /* ═══ Lo que NO puede hacer ═══ */
  seccion('Solo lee: no hay forma de escribir');

  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const rr = await pedir('/api/externo/camiones', { metodo, cuerpo: { neto: 1 } });
    ok(metodo + ' no existe', rr.estado === 404, rr.estado);
  }
  const antes = baseFalsa.collection('registros').docs.length;
  await pedir('/api/externo/camiones/1-4000', { metodo: 'DELETE' });
  ok('no se borró ningún ticket',
    baseFalsa.collection('registros').docs.length === antes, antes);

  r = await pedir('/api/externo/inventado');
  ok('una dirección que no existe responde JSON, no el HTML del sitio',
    r.estado === 404 && r.json && r.json.ok === false, r.estado + ' ' + r.tipo);

  /* ═══ La app y la web siguen igual ═══ */
  seccion('No toca nada de lo que ya andaba');

  r = await pedir('/app/ingreso', { token: null });
  ok('la app móvil sigue abriendo', r.estado === 200, r.estado);
  r = await pedir('/api/externo/camiones', { token: null });
  ok('y la API externa sigue pidiendo token', r.estado === 401, r.estado);

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
