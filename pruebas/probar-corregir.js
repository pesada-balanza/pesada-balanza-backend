'use strict';
/**
 * Corregir los datos de un ticket: SOLO GENERAL.
 *
 * El balancero no corrige datos — no es que se le venza un plazo, es que no
 * puede. Cuando encuentra un error pide la corrección y GENERAL la aplica.
 * Antes ese circuito quedaba cortado: el pedido llegaba y lo único que se podía
 * hacer era rechazarlo.
 *
 * Se comprueba el recorrido completo (el balancero pide → GENERAL corrige → el
 * pedido queda resuelto), que el balancero NO pueda corregir por ningún camino,
 * y las reglas heredadas de la web: máximo 2 correcciones y hasta 1 día.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3208';

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

async function ir(metodo, url, cuerpo, opciones = {}) {
  const headers = {
    'X-Forwarded-Proto': 'https',
    Accept: cuerpo || /\/api\//.test(url) ? 'application/json' : 'text/html',
  };
  if (opciones.desde) headers['X-Forwarded-For'] = opciones.desde;
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
const pedidos = () => baseFalsa.collection('app_pedidos');
const auditoria = () => baseFalsa.collection('registros_auditoria');

/** Un ticket con la tara final cargada y SIN regulada: el caso real. */
function meterTicket(extra) {
  const doc = Object.assign({
    _id: new ObjectId(),
    idTicket: 87, nroApp: '1-0087', origen: 'app', fecha: HOY,
    usuario: 'Juan Carlos Fantin', cargadoPor: 'Juan Carlos Fantin',
    pesadaPara: 'CAMIONES', cargaPara: 'AMH', socio: '',
    transporte: 'DONADIO, PABLO ANDRÉS 20-35748635-2', chofer: 'SANTOS, CRISTIAN',
    patentes: 'AG485ZJ AF856EZ', campo: 'Cejolao - CEJOLAO - SE',
    brutoEstimado: 52500, tara: 16400, netoEstimado: 36100,
    cargoDe: '', silobolsa: '', contratista: '', tractor: '', comentarios: '',
    codigoIngreso: '5684', fechaTaraFinal: HOY, anulado: false,
    confirmada: false, modificaciones: 0, creadoEn: new Date(),
  }, extra || {});
  registros().docs.push(doc);
  return doc;
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  const QUIMILI = '5684';
  const GENERAL = '12341';
  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: QUIMILI, fecha: HOY, nombre: 'Mateo' });

  /* ═══════════════════════════════════════════════════════════════════════
   * EL BALANCERO PIDE (no corrige)
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El balancero pide la corrección, no la hace');

  const t = meterTicket();
  const id = String(t._id);

  cookies = {};
  let r = await ir('POST', '/app/api/ingreso', { code: QUIMILI }, { desde: '10.8.0.1' });
  ok('la balanza entra', r.estado === 200, r.texto.slice(0, 120));

  r = await ir('GET', '/app/registro/' + id);
  ok('el ticket abre', r.estado === 200 && /AG485ZJ/.test(r.texto), r.estado);
  ok('al balancero NO se le ofrece corregir', !/\/app\/corregir\//.test(r.texto));
  ok('sí se le ofrece pedirlo a GENERAL', /\/app\/pedir\/[^"]*tipo=correccion/.test(r.texto));

  r = await ir('POST', '/app/api/pedido', { id, tipo: 'correccion', motivo: 'tara 15880' });
  ok('el pedido se manda', r.estado === 200, r.texto.slice(0, 200));

  // Y por la puerta de atrás tampoco
  r = await ir('GET', '/app/corregir/' + id);
  ok('la balanza no puede abrir la pantalla de corregir', r.estado !== 200, r.estado);
  r = await ir('POST', '/app/api/corregir/' + id, { patentes: 'XX 111 XX', chofer: 'Otro', tara: '1000' });
  ok('ni guardar una corrección', r.estado !== 200, r.estado + ' ' + r.texto.slice(0, 120));
  const sinTocar = registros().docs.find((d) => String(d._id) === id);
  ok('el ticket quedó igual', sinTocar.tara === 16400 && sinTocar.patentes === 'AG485ZJ AF856EZ', sinTocar.tara);

  /* ═══════════════════════════════════════════════════════════════════════
   * GENERAL CORRIGE
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('GENERAL corrige');

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.8.0.2' });
  ok('GENERAL entra', r.estado === 200, r.texto.slice(0, 120));

  r = await ir('GET', '/app/general/pedidos');
  ok('ve el pedido de corrección', r.estado === 200 && /tara 15880/.test(r.texto), r.estado);
  ok('y ahora tiene el botón de corregir',
    r.texto.indexOf('href="/app/corregir/' + id + '"') !== -1,
    (r.texto.match(/\/app\/corregir\/[a-z0-9]*/) || [''])[0]);

  r = await ir('GET', '/app/registro/' + id);
  ok('desde el ticket también', r.texto.indexOf('/app/corregir/' + id) !== -1);

  r = await ir('GET', '/app/corregir/' + id);
  ok('la pantalla de corregir abre', r.estado === 200 && /Corregir los datos/.test(r.texto), r.estado);
  ok('trae el motivo del pedido a la vista', /tara 15880/.test(r.texto));
  ok('trae los datos actuales cargados', /value="AG485ZJ AF856EZ"/.test(r.texto) && /value="16400"/.test(r.texto));
  ok('los brutos se muestran fijos, sin campo para editarlos',
    /fijo/.test(r.texto) && !/name="bruto"/.test(r.texto) && !/name="brutoEstimado"/.test(r.texto));

  // La corrección que pidió el balancero
  r = await ir('POST', '/app/api/corregir/' + id, {
    patentes: 'AG485ZJ AF856EZ', chofer: 'SANTOS, CRISTIAN', tara: '15880',
    cargoDe: '', comentarios: 'Tara corregida a pedido de Mateo',
  });
  ok('la corrección se guarda', r.estado === 200 && r.json.ok === true, r.texto.slice(0, 250));

  const corregido = registros().docs.find((d) => String(d._id) === id);
  ok('la tara quedó en 15.880', corregido.tara === 15880, corregido.tara);
  ok('y el neto estimado se recalculó (52.500 − 15.880 = 36.620)',
    corregido.netoEstimado === 36620, corregido.netoEstimado);
  ok('el bruto estimado NO se tocó', corregido.brutoEstimado === 52500, corregido.brutoEstimado);
  ok('quedaron las observaciones', /a pedido de Mateo/.test(corregido.comentarios), corregido.comentarios);
  ok('sumó una modificación', corregido.modificaciones === 1, corregido.modificaciones);

  const audit = auditoria().docs.filter((a) => String(a.registroId) === id && a.tipoOperacion === 'MODIFICACION');
  ok('quedó auditoría de la modificación', audit.length === 1, audit.length);
  ok('con lo que había antes', audit[0] && audit[0].camposAnteriores.tara === 16400, JSON.stringify(audit[0] || {}).slice(0, 200));
  ok('y lo que quedó', audit[0] && audit[0].camposNuevos.tara === 15880);
  ok('anotada como GENERAL y desde la app',
    audit[0] && audit[0].usuario === 'GENERAL' && audit[0].origen === 'app-movil');

  const pedidoCerrado = pedidos().docs.find((p) => String(p.registroId) === id);
  ok('el pedido quedó resuelto solo, sin cerrarlo a mano',
    pedidoCerrado.estado === 'CORREGIDO', pedidoCerrado.estado);
  ok('con constancia de quién lo resolvió', pedidoCerrado.resueltoPor === 'GENERAL');

  r = await ir('GET', '/app/general/pedidos');
  ok('en la lista aparece como Corregido', /Corregido/.test(r.texto));

  /* ── El que pidió la corrección tiene que enterarse ───────────────────── */
  // Sin el cartel veía los datos nuevos y nada que dijera que cambiaron. Si el
  // ticket ya estaba impreso y en la mano del chofer, no se daba cuenta.
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: QUIMILI }, { desde: '10.8.0.3' });
  r = await ir('GET', '/app/registro/' + id);
  ok('el balancero ve que GENERAL corrigió el ticket',
    /GENERAL corrigió el ticket/.test(r.texto), r.estado);
  ok('y qué se cambió, en castellano',
    /Cambió .*la tara/.test(r.texto), (r.texto.match(/Cambió [^<]*/) || [''])[0]);
  ok('sin nombrar los netos, que se recalculan solos',
    !/netoEstimado/.test(r.texto) && !/Cambió[^<]*el neto/.test(r.texto),
    (r.texto.match(/Cambió [^<]*/) || [''])[0]);
  ok('con el motivo que él mismo había puesto', /tara 15880/.test(r.texto));
  // El pedido quedó cerrado, así que si hace falta puede pedir otra cosa.
  ok('y puede volver a pedir si todavía hay algo mal',
    /Pedir corrección a GENERAL/.test(r.texto));

  // Se vuelve a GENERAL: lo que sigue son sus pantallas.
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.8.0.4' });
  ok('y ya no está entre los pendientes', !/tara 15880[\s\S]{0,400}Rechazar/.test(r.texto));

  /* ═══════════════════════════════════════════════════════════════════════
   * VALIDACIONES
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Lo que no se acepta');

  // Cada rechazo sobre su propio ticket: si alguno pasara igual, no contamina el
  // siguiente ni gasta modificaciones que después confundan el diagnóstico.
  let n = 200;
  const nuevoTicket = () => {
    n += 1;
    return String(meterTicket({ idTicket: n, nroApp: '1-0' + n, patentes: 'AA 111 BB' })._id);
  };

  r = await ir('POST', '/app/api/corregir/' + nuevoTicket(), { patentes: '', chofer: 'X', tara: '16000' });
  ok('una patente vacía se rechaza', r.estado === 400 && /patente/.test(r.json.error), r.texto.slice(0, 150));

  r = await ir('POST', '/app/api/corregir/' + nuevoTicket(), { patentes: 'AA 111 BB', chofer: '', tara: '16000' });
  ok('un chofer vacío se rechaza', r.estado === 400 && /chofer/.test(r.json.error), r.texto.slice(0, 150));

  r = await ir('POST', '/app/api/corregir/' + nuevoTicket(), { patentes: 'AA 111 BB', chofer: 'X', tara: 'abc' });
  ok('una tara que no es número se rechaza', r.estado === 400 && /número/.test(r.json.error), r.texto.slice(0, 200));

  r = await ir('POST', '/app/api/corregir/' + nuevoTicket(), { patentes: 'AA 111 BB', chofer: 'X', tara: '55000' });
  ok('una tara fuera de rango se rechaza', r.estado === 400 && /Tara/.test(r.json.error), r.texto.slice(0, 200));

  // 25.000 entra en el rango de una tara pero supera el bruto estimado de 52.500?
  // no: se usa un ticket con bruto chico para probar justamente ese control.
  const idBrutoChico = String(meterTicket({
    idTicket: 299, nroApp: '1-0299', patentes: 'GG 777 HH', brutoEstimado: 20000, netoEstimado: 3600,
  })._id);
  r = await ir('POST', '/app/api/corregir/' + idBrutoChico, { patentes: 'GG 777 HH', chofer: 'X', tara: '25000' });
  ok('una tara mayor que el bruto se rechaza', r.estado === 400 && /bruto/.test(r.json.error), r.texto.slice(0, 200));

  const t2 = meterTicket({ idTicket: 88, nroApp: '1-0088', patentes: 'AA 111 BB' });
  const id2 = String(t2._id);
  r = await ir('POST', '/app/api/corregir/' + id2, {
    patentes: t2.patentes, chofer: t2.chofer, tara: String(t2.tara), cargoDe: '', comentarios: '',
  });
  ok('si no cambia nada, no se gasta una modificación',
    r.estado === 200 && r.json.sinCambios === true, r.texto.slice(0, 150));
  ok('y el contador quedó en cero',
    registros().docs.find((d) => String(d._id) === id2).modificaciones === 0);

  /* ═══════════════════════════════════════════════════════════════════════
   * UN TICKET QUE TODAVÍA NO PASÓ POR LA TARA FINAL
   * ---------------------------------------------------------------------
   * En el paso CAMIONES la tara es una ESTIMACIÓN y es opcional: la web y la
   * app la dejan vacía. La corrección la exigía igual, con el mínimo de 1.000,
   * así que un ticket cargado sin tara estimada no se podía corregir en NADA
   * —ni la patente, que es lo que se suele pedir—.
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Corregir antes de la tara final');

  /** Ticket en el paso CAMIONES: sin tara final y sin tara estimada. */
  const enCamiones = (extra) => meterTicket(Object.assign({
    fechaTaraFinal: undefined, tara: 0, netoEstimado: 52500, confirmada: false,
  }, extra || {}));

  const tc = enCamiones({ idTicket: 374, nroApp: '1-0374', patentes: 'NEQ734 EDL759' });
  const idc = String(tc._id);

  r = await ir('GET', '/app/corregir/' + idc);
  ok('la pantalla abre igual', r.estado === 200 && /Corregir los datos/.test(r.texto), r.estado);
  ok('y dice que la tara estimada es opcional', /Tara estimada \(kg\) · opcional/.test(r.texto));
  ok('el campo NO arranca en 0 (el camión no pesa cero)',
    !/id="tara"[^>]*value="0"/.test(r.texto), (r.texto.match(/id="tara"[^>]*>/) || [''])[0]);
  ok('del lado del teléfono la tara tampoco es obligatoria',
    /var taraEsReal = false/.test(r.texto));

  // Lo que no se podía hacer: corregir la patente sin tocar la tara.
  r = await ir('POST', '/app/api/corregir/' + idc, {
    patentes: 'NEQ734 JMV977', chofer: 'FRANZOY FABRICIO', tara: '',
  });
  ok('se corrige la patente con la tara vacía', r.estado === 200 && r.json.ok === true, r.texto.slice(0, 200));
  const corr = registros().docs.find((d) => String(d._id) === idc);
  ok('la patente quedó cambiada', corr.patentes === 'NEQ734 JMV977', corr.patentes);
  ok('y la tara sigue sin cargarse', (Number(corr.tara) || 0) === 0, corr.tara);
  ok('el neto estimado sigue siendo el bruto estimado',
    Number(corr.netoEstimado) === 52500, corr.netoEstimado);
  ok('gastó una sola corrección', corr.modificaciones === 1, corr.modificaciones);

  // Y si se sabe la tara estimada, se puede escribir.
  const tc2 = enCamiones({ idTicket: 375, nroApp: '1-0375', patentes: 'HH 888 II' });
  r = await ir('POST', '/app/api/corregir/' + String(tc2._id), {
    patentes: 'HH 888 II', chofer: tc2.chofer, tara: '15000',
  });
  ok('también se puede cargar la tara estimada', r.estado === 200 && r.json.ok === true, r.texto.slice(0, 200));
  const corr2 = registros().docs.find((d) => String(d._id) === String(tc2._id));
  ok('queda guardada', Number(corr2.tara) === 15000, corr2.tara);
  ok('y recalcula el neto estimado', Number(corr2.netoEstimado) === 52500 - 15000, corr2.netoEstimado);

  // Abrir y guardar sin tocar nada no gasta una corrección: antes la tara
  // vacía contra el 0 guardado se leía como un cambio.
  const tc3 = enCamiones({ idTicket: 376, nroApp: '1-0376', patentes: 'II 999 JJ' });
  r = await ir('POST', '/app/api/corregir/' + String(tc3._id), {
    patentes: 'II 999 JJ', chofer: tc3.chofer, tara: '', cargoDe: '', comentarios: '',
  });
  ok('sin tocar nada no cuenta como corrección',
    r.estado === 200 && r.json.sinCambios === true, r.texto.slice(0, 200));
  ok('el contador quedó en cero',
    registros().docs.find((d) => String(d._id) === String(tc3._id)).modificaciones === 0);

  // Opcional no es "cualquier cosa": los topes siguen valiendo.
  const tc4 = enCamiones({ idTicket: 377, nroApp: '1-0377', patentes: 'JJ 000 KK' });
  r = await ir('POST', '/app/api/corregir/' + String(tc4._id), {
    patentes: 'JJ 000 KK', chofer: 'X', tara: '55000',
  });
  ok('una tara estimada fuera de rango se rechaza igual',
    r.estado === 400 && /Tara/.test(r.json.error), r.texto.slice(0, 200));

  // Con la tara final cargada sigue siendo obligatoria: es un peso real.
  const tcf = meterTicket({ idTicket: 378, nroApp: '1-0378', patentes: 'KK 111 LL' });
  r = await ir('POST', '/app/api/corregir/' + String(tcf._id), {
    patentes: 'KK 111 LL', chofer: 'X', tara: '',
  });
  ok('con la tara final cargada, vacía no se acepta',
    r.estado === 400 && /tara/i.test(r.json.error), r.texto.slice(0, 200));
  r = await ir('GET', '/app/corregir/' + String(tcf._id));
  ok('y ahí la pantalla la pide sin el "opcional"',
    /Tara \(kg\)/.test(r.texto) && !/· opcional/.test(r.texto),
    (r.texto.match(/for="tara"[\s\S]{0,60}/) || [''])[0]);
  ok('del lado del teléfono también', /var taraEsReal = true/.test(r.texto));

  /* ── El máximo de 2, como en la web ─────────────────────────────────── */
  seccion('Las reglas que ya tenía la web');

  const t3 = meterTicket({ idTicket: 89, nroApp: '1-0089', patentes: 'BB 222 CC', modificaciones: 2 });
  const id3 = String(t3._id);
  r = await ir('GET', '/app/corregir/' + id3);
  ok('con 2 correcciones ya hechas, la pantalla lo dice', /Ya se corrigió dos veces/.test(r.texto), r.estado);
  r = await ir('POST', '/app/api/corregir/' + id3, { patentes: 'ZZ 999 ZZ', chofer: 'X', tara: '15000' });
  ok('y no deja guardar una tercera', r.estado === 400 && /2 veces/.test(r.json.error), r.texto.slice(0, 180));

  const t4 = meterTicket({
    idTicket: 90, nroApp: '1-0090', patentes: 'CC 333 DD',
    fecha: '2020-01-01', fechaTaraFinal: '2020-01-01',
  });
  const id4 = String(t4._id);
  r = await ir('GET', '/app/corregir/' + id4);
  ok('un ticket viejo no se corrige: el plazo venció', /plazo venció/.test(r.texto), r.estado);
  r = await ir('POST', '/app/api/corregir/' + id4, { patentes: 'ZZ 999 ZZ', chofer: 'X', tara: '15000' });
  ok('y tampoco por la API', r.estado === 400 && /plazo/.test(r.json.error), r.texto.slice(0, 180));

  const t5 = meterTicket({ idTicket: 91, nroApp: '1-0091', patentes: 'DD 444 EE', anulado: true });
  r = await ir('GET', '/app/corregir/' + String(t5._id));
  ok('un ticket anulado no se corrige', /anulado/i.test(r.texto), r.estado);

  /* ── Un ticket con la regulada cerrada: el plazo cuenta desde ahí ────── */
  const t6 = meterTicket({
    idTicket: 92, nroApp: '1-0092', patentes: 'EE 555 FF',
    pesadaPara: 'REGULADA', fecha: '2020-01-01', fechaTaraFinal: '2020-01-01',
    fechaRegulada: HOY, bruto: 52000, neto: 35600, grano: 'MAIZ', lote: ['Lote 1'],
  });
  const id6 = String(t6._id);
  r = await ir('GET', '/app/corregir/' + id6);
  ok('con la regulada de hoy sí se corrige, aunque la tara final sea vieja',
    r.estado === 200 && /Corregir los datos/.test(r.texto), r.estado);
  r = await ir('POST', '/app/api/corregir/' + id6, {
    patentes: 'EE 555 FF', chofer: t6.chofer, tara: '16000', cargoDe: '', comentarios: '',
  });
  ok('y ahí el neto real también se recalcula (52.000 − 16.000)',
    r.estado === 200 && registros().docs.find((d) => String(d._id) === id6).neto === 36000,
    registros().docs.find((d) => String(d._id) === id6).neto);

  /* ── Cargó de: silobolsa y contratista ──────────────────────────────── */
  seccion('Cargó de');

  const t7 = meterTicket({ idTicket: 93, nroApp: '1-0093', patentes: 'FF 666 GG' });
  const id7 = String(t7._id);
  r = await ir('POST', '/app/api/corregir/' + id7, {
    patentes: 'FF 666 GG', chofer: t7.chofer, tara: '16000',
    cargoDe: 'SILOBOLSA', silobolsa: 'Silobolsa 9', contratista: 'No', tractor: 'No', comentarios: '',
  });
  const conSilo = registros().docs.find((d) => String(d._id) === id7);
  ok('con silobolsa se guarda el número', r.estado === 200 && conSilo.silobolsa === 'Silobolsa 9', conSilo.silobolsa);
  ok('y no queda contratista colgado', conSilo.contratista === '' && conSilo.tractor === '',
    conSilo.contratista + '/' + conSilo.tractor);

  r = await ir('POST', '/app/api/corregir/' + id7, {
    patentes: 'FF 666 GG', chofer: t7.chofer, tara: '16000',
    cargoDe: 'CONTRATISTA', silobolsa: 'Silobolsa 9', contratista: 'Contratista X', tractor: 'TRACTOR 1', comentarios: '',
  });
  const conContr = registros().docs.find((d) => String(d._id) === id7);
  ok('al pasar a contratista, el silobolsa se limpia', r.estado === 200 && conContr.silobolsa === '', conContr.silobolsa);
  ok('y quedan contratista y tractor', conContr.contratista === 'Contratista X' && conContr.tractor === 'TRACTOR 1');

  /* ── Sin sesión ─────────────────────────────────────────────────────── */
  seccion('Sin sesión');
  cookies = {};
  r = await ir('GET', '/app/corregir/' + id);
  ok('sin código no se entra', r.estado === 302 && r.ubicacion === '/app/ingreso', r.ubicacion);
  r = await ir('POST', '/app/api/corregir/' + id, { patentes: 'X', chofer: 'X', tara: '1' });
  ok('ni se guarda', r.estado === 401 || r.estado === 302, r.estado);

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
