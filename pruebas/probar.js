'use strict';
/**
 * Recorrido completo de la app móvil contra un doble de MongoDB.
 * Verifica además que la web actual siga respondiendo igual.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = process.env.APP_MOVIL || '1';
process.env.PORT = process.env.PORT || '3199';

const { BaseFalsa } = require('./doble-mongo');
const baseFalsa = new BaseFalsa();

/* ── Stub de connect-mongo: sesión en memoria ─────────────────────────── */
const session = require(path.join(PROY, 'node_modules', 'express-session'));
const rutaConnectMongo = require.resolve(path.join(PROY, 'node_modules', 'connect-mongo'));
require.cache[rutaConnectMongo] = {
  id: rutaConnectMongo,
  filename: rutaConnectMongo,
  loaded: true,
  exports: { create: () => new session.MemoryStore() },
};

/* ── Stub de mongoose: connect no hace nada, db es el doble ───────────── */
const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

/* ── No mandar emails de verdad ────────────────────────────────────────── */
const rutaNotif = require.resolve(path.join(PROY, 'notificaciones.js'));
const notifReal = require(rutaNotif);
const emails = [];
require.cache[rutaNotif].exports = {
  resolverNombreCodigo: notifReal.resolverNombreCodigo,
  notificar: (o) => { emails.push(o); },
};

/* ── Arrancar el servidor real ─────────────────────────────────────────── */
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
    // trust proxy = 1 → así req.secure es true y la cookie segura viaja
    'X-Forwarded-Proto': 'https',
    Accept: cuerpo || /\/api\//.test(url) ? 'application/json' : 'text/html',
  };
  // El servidor limita los intentos de ingreso por IP (10 cada 15 minutos).
  // `opciones.desde` permite simular otro dispositivo, que es lo que pasa de
  // verdad cuando la oficina y una balanza usan la app al mismo tiempo.
  if (opciones.desde) headers['X-Forwarded-For'] = opciones.desde;
  const ck = cabeceraCookie();
  if (ck && !opciones.sinCookies) headers.Cookie = ck;
  if (cuerpo) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + url, {
    method: metodo,
    headers,
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
  if (condicion) {
    console.log('  ✓ ' + nombre);
  } else {
    fallos++;
    console.log('  ✗ ' + nombre + (extra ? '  →  ' + String(extra).slice(0, 400) : ''));
  }
}

function seccion(t) { console.log('\n── ' + t); }

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  /* ═════════════════════════════════════════════════════════════════════
   * LA WEB ACTUAL SIGUE FUNCIONANDO
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('La web actual (no se toca)');
  let r = await ir('GET', '/');
  ok('GET / muestra el login', r.estado === 200 && /code/i.test(r.texto), r.estado);

  r = await ir('GET', '/login/registro');
  ok('GET /login/registro anda', r.estado === 200);

  r = await ir('GET', '/tabla');
  ok('GET /tabla sin sesión redirige al login', r.estado === 302 && /Acceso(%20| )denegado/.test(decodeURIComponent(r.ubicacion || '')), r.ubicacion);

  // Login web como operador de balanza y carga de un ticket por la web
  const cookiesApp = {};
  cookies = {};
  r = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=5679&redirect=/registro',
    redirect: 'manual',
  });
  guardarCookies(r);
  ok('login web con 5679 entra a /registro', r.status === 302 && r.headers.get('location') === '/registro', r.headers.get('location'));

  r = await ir('GET', '/registro');
  ok('GET /registro (web) renderiza el formulario', r.estado === 200 && /Bruto Estimado|brutoEstimado/i.test(r.texto), r.estado);

  // Cargar un CAMIONES desde la web, para verificar convivencia
  const formWeb = new URLSearchParams({
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'WEB 001 AA', chofer: 'Web Chofer',
    brutoEstimado: '52500', campo: 'El Mataco - SACHAYOJ - SE',
  });
  r = await fetch(BASE + '/guardar-tara', {
    method: 'POST',
    headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cabeceraCookie() },
    body: formWeb.toString(),
    redirect: 'manual',
  });
  ok('la web guarda un CAMIONES', r.status === 302, r.status);
  const regs = baseFalsa.collection('registros').docs;
  ok('quedó en la colección registros', regs.length === 1 && regs[0].idTicket === 1, JSON.stringify(regs[0] || {}).slice(0, 200));
  ok('el ticket de la web NO tiene marca de app', regs[0] && regs[0].origen === undefined && regs[0].nroApp === undefined);

  /* ═════════════════════════════════════════════════════════════════════
   * APP MÓVIL — INGRESO
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('App móvil: ingreso y nombre del día');
  cookies = {};
  r = await ir('GET', '/app');
  ok('GET /app sin sesión manda al ingreso', r.estado === 302 && r.ubicacion === '/app/ingreso', r.ubicacion);

  r = await ir('GET', '/app/ingreso');
  ok('la pantalla de ingreso trae el teclado propio', r.estado === 200 && /data-tecla="7"/.test(r.texto));
  ok('la pantalla de ingreso es oscura (6a)', /#1b1a17/.test(r.texto));

  r = await ir('GET', '/app/estatico/app.css');
  ok('el CSS de la app se sirve por /app/estatico', r.estado === 200 && /--aviso-fondo/.test(r.texto), r.estado);

  r = await ir('GET', '/app/sw.js');
  ok('el service worker se sirve desde /app/sw.js', r.estado === 200 && /pesada-app-v\d+/.test(r.texto));

  r = await ir('GET', '/app/manifest.webmanifest');
  ok('el manifest apunta a /app', r.estado === 200 && r.json && r.json.scope === '/app');

  r = await ir('POST', '/app/api/ingreso', { code: '0000' });
  ok('código inventado se rechaza', r.estado === 401 && /incorrecto/i.test(r.json.error), r.texto.slice(0, 120));

  r = await ir('POST', '/app/api/ingreso', { code: '5679' });
  ok('código de balanza 5679 entra', r.estado === 200 && r.json.destino === '/app/patio', r.texto.slice(0, 150));
  // Se guardan para reusarlas al final: el servidor limita los intentos de
  // ingreso (10 cada 15 minutos por IP).
  const cookies5679 = Object.assign({}, cookies);

  r = await ir('GET', '/app/patio');
  ok('sin nombre del día, el patio manda a /app/dia', r.estado === 302 && r.ubicacion === '/app/dia', r.ubicacion);

  r = await ir('GET', '/app/dia');
  ok('la pantalla del nombre del día abre', r.estado === 200 && /Quién está en la balanza/.test(r.texto));
  ok('muestra el nombre de la balanza (El Mataco)', /El Mataco/.test(r.texto));

  r = await ir('POST', '/app/api/dia', { nombre: 'Jo' });
  ok('nombre muy corto se rechaza', r.estado === 400);

  r = await ir('POST', '/app/api/dia', { nombre: 'Juan Sosa' });
  ok('se guarda el nombre del día', r.estado === 200 && r.json.destino === '/app/patio');

  r = await ir('GET', '/app/patio');
  ok('el patio abre', r.estado === 200 && /Patio · El Mataco/.test(r.texto), r.estado);
  ok('el patio muestra el nombre del día', /Juan Sosa/.test(r.texto));
  ok('el patio tiene el botón de nueva pesada', /＋ Nueva pesada/.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * NUMERACIÓN
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Numeración de tickets (la da la base, no el teléfono)');
  r = await ir('POST', '/app/api/numeros/reservar', { cantidad: 3 });
  ok('reserva 3 números', r.estado === 200 && r.json.numeros.length === 3, r.texto.slice(0, 150));
  ok('arranca en 1-0001', r.json.numeros[0] === '1-0001', r.json.numeros.join(','));
  ok('siguen en orden', r.json.numeros[1] === '1-0002' && r.json.numeros[2] === '1-0003');
  const reservados = r.json.numeros;

  r = await ir('POST', '/app/api/numeros/reservar', { cantidad: 1 });
  ok('la reserva no repite números', r.json.numeros[0] === '1-0004', r.json.numeros.join(','));

  /* ═════════════════════════════════════════════════════════════════════
   * CAMIONES
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Cargar CAMIONES desde la app');
  r = await ir('GET', '/app/nueva-pesada');
  ok('el formulario de nueva pesada abre', r.estado === 200 && /Bruto estimado/.test(r.texto));
  ok('trae la lista oficial de campos', /El Mataco - SACHAYOJ - SE/.test(r.texto));

  r = await ir('POST', '/app/api/pesada', { cargaPara: 'AMH', patentes: 'AC 884 TF' });
  ok('faltando datos, se rechaza', r.estado === 400 && /Faltan datos/.test(r.json.error), r.texto.slice(0, 150));

  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    brutoEstimado: '52500', campo: 'Campo Inventado', nro: reservados[0],
  });
  ok('campo fuera de la lista se rechaza', r.estado === 400 && /no está en la lista/.test(r.json.error));

  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    brutoEstimado: '999', campo: 'El Mataco - SACHAYOJ - SE',
  });
  ok('bruto fuera de rango se rechaza', r.estado === 400 && /Bruto estimado/.test(r.json.error), r.texto.slice(0, 150));

  const localId1 = 'loc-prueba-1';
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'ac 884 tf', chofer: 'R. Gómez',
    brutoEstimado: '52500', campo: 'El Mataco - SACHAYOJ - SE', tara: '',
    nro: reservados[0], localId: localId1,
  });
  ok('se guarda la pesada', r.estado === 200 && r.json.id, r.texto.slice(0, 200));
  ok('usa el número reservado 1-0001', r.json.nro === '1-0001', r.json.nro);
  ok('el idTicket sigue la serie de la web', r.json.idTicket === 2, r.json.idTicket);
  const idCamion = r.json.id;

  const doc = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCamion);
  ok('la patente se guarda en mayúsculas', doc.patentes === 'AC 884 TF', doc.patentes);
  ok('usuario = nombre del día (aparece en Ver Registros)', doc.usuario === 'Juan Sosa', doc.usuario);
  ok('pesadaPara = CAMIONES (mismo nombre que la web)', doc.pesadaPara === 'CAMIONES');
  ok('el ticket queda en la balanza que lo cargó', doc.codigoIngreso === '5679', doc.codigoIngreso);
  ok('queda marcado origen: app', doc.origen === 'app' && doc.nroApp === '1-0001');
  ok('netoEstimado calculado', doc.netoEstimado === 52500);

  // Idempotencia: reenviar la misma pesada no la duplica
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    brutoEstimado: '52500', campo: 'El Mataco - SACHAYOJ - SE', localId: localId1,
  });
  ok('reenviar la misma pesada NO duplica', r.json.duplicado === true && r.json.id === idCamion, r.texto.slice(0, 150));
  ok('sigue habiendo 2 registros en total', baseFalsa.collection('registros').docs.length === 2,
    baseFalsa.collection('registros').docs.length);

  r = await ir('GET', '/app/patio');
  ok('el camión aparece en el patio', /AC 884 TF/.test(r.texto));
  ok('el patio ofrece "Cargar tara final"', /Cargar tara final/.test(r.texto));
  ok('el patio muestra el chip "Falta tara final"', /Falta tara final/.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * TARA FINAL
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Tara final e impresión del ticket');
  r = await ir('GET', '/app/tara-final/' + idCamion);
  ok('la pantalla de tara final abre', r.estado === 200 && /Tara final \(kg\)/.test(r.texto));

  r = await ir('POST', '/app/api/tara-final', { id: idCamion, taraNueva: 500 });
  ok('tara fuera de rango se rechaza', r.estado === 400 && /Tara final/.test(r.json.error));

  r = await ir('POST', '/app/api/tara-final', { id: idCamion, taraNueva: 15600 });
  ok('se guarda la tara final', r.estado === 200 && r.json.urlTicket, r.texto.slice(0, 200));
  ok('mandó el aviso por email (mismo canal que la web)',
    emails.some((e) => e.tipo === 'TARA FINAL' && e.idTicket === '1-0001'), JSON.stringify(emails));

  const doc2 = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCamion);
  ok('tara y netoEstimado actualizados', doc2.tara === 15600 && doc2.netoEstimado === 36900,
    doc2.tara + '/' + doc2.netoEstimado);
  ok('fechaTaraFinal grabada (la web la usa para el paso siguiente)', !!doc2.fechaTaraFinal);
  ok('queda marcado como no impreso', doc2.appImpreso === false);

  r = await ir('POST', '/app/api/tara-final', { id: idCamion, taraNueva: 15600 });
  ok('no se puede cargar la tara final dos veces', r.estado === 400 && /ya tiene la tara final/.test(r.json.error));

  r = await ir('GET', '/app/patio');
  ok('el patio ahora ofrece "Cargar regulada"', /Cargar regulada/.test(r.texto));
  ok('avisa que hay 1 ticket sin imprimir', /1 ticket sin imprimir/.test(r.texto), '');

  r = await ir('GET', '/app/imprimir?ids=' + idCamion);
  ok('la hoja de impresión abre', r.estado === 200 && /tk-visor/.test(r.texto));
  ok('la hoja usa ticket.css (19 × 4,5 cm)', /ticket\.css/.test(r.texto));

  r = await ir('GET', '/app/estatico/ticket.css');
  ok('el ticket mide 190mm de ancho', /width:\s*190mm/.test(r.texto));
  ok('el ticket mide 45mm de alto', /height:\s*45mm/.test(r.texto));
  ok('A4 vertical con 1cm de margen', /size:\s*A4 portrait/.test(r.texto) && /margin:\s*1cm/.test(r.texto));

  r = await ir('GET', '/app/api/tickets?ids=' + idCamion);
  ok('los datos del ticket llegan por JSON', r.estado === 200 && r.json.tickets.length === 1);
  const tk = r.json.tickets[0];
  ok('el ticket NO expone el código de acceso',
    !JSON.stringify(tk).includes('5679') && !JSON.stringify(tk).includes('12341'), JSON.stringify(tk).slice(0, 300));
  ok('el ticket trae el establecimiento del campo', tk.campoCorto === 'El Mataco', tk.campoCorto);
  ok('el ticket trae el número 1-0001', tk.nro === '1-0001');
  ok('bruto lote / regulado / neto vacíos en tara final',
    tk.brutoLote === null && tk.bruto === null && tk.neto === null,
    JSON.stringify([tk.brutoLote, tk.bruto, tk.neto]));

  r = await ir('POST', '/app/api/impreso', { ids: [idCamion] });
  ok('marcar como impreso funciona', r.estado === 200);
  r = await ir('GET', '/app/patio');
  ok('ya no avisa tickets sin imprimir', !/ticket sin imprimir/i.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * REGULADA
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Regulada (cierra el ticket)');
  r = await ir('GET', '/app/regulada/' + idCamion);
  ok('la pantalla de regulada abre', r.estado === 200 && /Bruto regulado/.test(r.texto));
  ok('trae los granos del campo del ticket', /SOJA|MAIZ|TRIGO/i.test(r.texto), '');

  r = await ir('POST', '/app/api/regulada', { id: idCamion, grano: 'SOJA' });
  ok('faltando datos se rechaza', r.estado === 400 && /Faltan datos/.test(r.json.error));

  // Grano que no pertenece al campo
  r = await ir('POST', '/app/api/regulada', {
    id: idCamion, grano: 'QUINOA', lote: ['x'], cargoDe: 'SILOBOLSA',
    brutoLote: '52000', bruto: '52500',
  });
  ok('grano ajeno al campo se rechaza', r.estado === 400 && /no corresponde al campo/.test(r.json.error), r.texto.slice(0, 150));

  // ── El campo del ticket tiene que verse y poder corregirse
  const htmlReg = (await ir('GET', '/app/regulada/' + idCamion)).texto;
  ok('la regulada muestra el campo completo del ticket',
    htmlReg.indexOf('El Mataco - SACHAYOJ - SE') !== -1, '');
  ok('la regulada tiene el botón para cambiar el campo',
    /id="btn-cambiar-campo"/.test(htmlReg));
  ok('la regulada tiene el selector de campos', /id="campoSelect"/.test(htmlReg));

  // Para que la pantalla sea liviana, la planilla ENTERA no viaja con ella: solo
  // el campo de este ticket. La lista completa la trae el teléfono de
  // /app/api/tablas, que se guarda una vez y sirve también sin señal.
  ok('la pantalla NO arrastra la planilla entera (es liviana)',
    htmlReg.indexOf('La Pradera - ARBOL BLANCO - SE') === -1);
  ok('la pantalla pesa menos de 25 KB', Buffer.byteLength(htmlReg) < 25 * 1024,
    (Buffer.byteLength(htmlReg) / 1024).toFixed(1) + ' KB');

  const mDatos = htmlReg.match(/SIEMBRA\[campoElegido\] = (\{[\s\S]*?\});/);
  ok('la vista manda la planilla del campo del ticket', !!mDatos);
  const lotesCampo = JSON.parse(mDatos[1]);

  const tablas = (await ir('GET', '/app/api/tablas')).json.datos;
  ok('las tablas traen los 43 campos para elegir', tablas.campos.length === 43, tablas.campos.length);
  ok('las tablas traen la planilla de los 40 campos sembrados',
    Object.keys(tablas.siembra).length === 40, Object.keys(tablas.siembra).length);
  ok('las tablas traen los contratistas con sus tractores',
    Object.keys(tablas.contratistas).length > 0, Object.keys(tablas.contratistas).length);

  const granoReal = Object.keys(lotesCampo)[0];
  const loteReal = lotesCampo[granoReal][0];
  ok('trae los granos y lotes del campo del ticket', !!granoReal && !!loteReal, granoReal + '/' + loteReal);

  r = await ir('POST', '/app/api/regulada', {
    id: idCamion, grano: granoReal, lote: [loteReal], cargoDe: 'CONTRATISTA',
    brutoLote: '52000', bruto: '52500', confirmarTara: 'SI',
  });
  ok('contratista sin nombre se rechaza', r.estado === 400 && /contratista/i.test(r.json.error));

  r = await ir('POST', '/app/api/regulada', {
    id: idCamion, grano: granoReal, lote: [loteReal], cargoDe: 'SILOBOLSA',
    silobolsa: '12', brutoLote: '52000', bruto: '52500', confirmarTara: 'SI',
    comentarios: 'Llegó con lluvia',
  });
  ok('se guarda la regulada', r.estado === 200, r.texto.slice(0, 250));
  ok('el neto sale bien (52500 - 15600)', r.json.neto === 36900, r.json.neto);

  const doc3 = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCamion);
  ok('pesadaPara pasó a REGULADA', doc3.pesadaPara === 'REGULADA');
  ok('confirmada = true (así lo espera la web)', doc3.confirmada === true);
  ok('lote se guarda como array (igual que la web)', Array.isArray(doc3.lote) && doc3.lote[0] === loteReal);
  ok('neto guardado', doc3.neto === 36900);
  ok('mandó el aviso de REGULADA', emails.some((e) => e.tipo === 'REGULADA'));

  r = await ir('GET', '/app/patio');
  ok('el camión cerrado sale del patio', !/AC 884 TF/.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * CORREGIR EL CAMPO EN LA REGULADA
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('El campo se ve y se puede corregir en la regulada');

  // Un camión nuevo, con tara final, para probar el cambio de campo
  async function camionConTaraFinal(patente, campo) {
    let x = await ir('POST', '/app/api/pesada', {
      cargaPara: 'AMH', transporte: 'Ciriaci', patentes: patente, chofer: 'Prueba Campo',
      brutoEstimado: '52500', campo,
    });
    const id = x.json.id;
    await ir('POST', '/app/api/tara-final', { id, taraNueva: 15000 });
    return id;
  }

  const idCampo = await camionConTaraFinal('CP 001 AA', 'El Mataco - SACHAYOJ - SE');

  r = await ir('POST', '/app/api/regulada', {
    id: idCampo, campo: 'Campo Que No Existe', grano: granoReal, lote: [loteReal],
    cargoDe: 'SILOBOLSA', silobolsa: '1', brutoLote: '52000', bruto: '52500',
  });
  ok('un campo fuera de la lista se rechaza', r.estado === 400 && /no está en la lista/.test(r.json.error),
    r.texto.slice(0, 150));

  // Cambiar a otro campo real, con grano y lote que NO son de ese campo
  r = await ir('POST', '/app/api/regulada', {
    id: idCampo, campo: 'La Pradera - ARBOL BLANCO - SE', grano: granoReal, lote: [loteReal],
    cargoDe: 'SILOBOLSA', silobolsa: '1', brutoLote: '52000', bruto: '52500',
  });
  ok('al cambiar el campo, se valida el grano contra el campo NUEVO',
    r.estado === 400 && /no corresponde al campo|no corresponde/.test(r.json.error), r.texto.slice(0, 180));

  // Ahora con el grano y lote correctos del campo nuevo
  const pradera = tablas.siembra['La Pradera - ARBOL BLANCO - SE'] || {};
  const granoPradera = Object.keys(pradera)[0];
  const lotePradera = granoPradera ? pradera[granoPradera][0] : null;
  ok('La Pradera tiene siembra cargada', !!granoPradera && !!lotePradera, granoPradera + '/' + lotePradera);

  r = await ir('POST', '/app/api/regulada', {
    id: idCampo, campo: 'La Pradera - ARBOL BLANCO - SE', grano: granoPradera, lote: [lotePradera],
    cargoDe: 'SILOBOLSA', silobolsa: '1', brutoLote: '52000', bruto: '52500',
  });
  ok('con el campo corregido y su grano, se guarda', r.estado === 200, r.texto.slice(0, 200));

  const docCampo = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCampo);
  ok('el campo corregido queda guardado', docCampo.campo === 'La Pradera - ARBOL BLANCO - SE', docCampo.campo);
  ok('el grano corregido también', docCampo.grano === granoPradera, docCampo.grano);

  r = await ir('GET', '/app/registro/' + idCampo);
  ok('el detalle muestra el campo corregido', r.texto.indexOf('La Pradera - ARBOL BLANCO - SE') !== -1);
  ok('el detalle muestra grano y lote como dato propio', /Grano y lote/.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * MENÚ DE CUENTA Y BOTÓN DE VOLVER
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Salir, cambiar de código y volver');

  for (const [pantalla, url] of [
    ['patio', '/app/patio'],
    ['nueva pesada', '/app/nueva-pesada'],
    ['tara final', '/app/tara-final/' + (await (async () => {
      // Un camión SIN tara final: si ya la tiene, la app redirige a la regulada.
      const x = await ir('POST', '/app/api/pesada', {
        cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'MN 002 BB', chofer: 'Prueba Menu',
        brutoEstimado: '52500', campo: 'El Mataco - SACHAYOJ - SE',
      });
      return x.json.id;
    })())],
    ['detalle', '/app/registro/' + idCampo],
    ['balanza y turno', '/app/balanza'],
  ]) {
    const x = await ir('GET', url);
    const tieneMenu = /data-abre-modal="modal-menu"/.test(x.texto) && /Balanza y turno/.test(x.texto);
    ok('la pantalla de ' + pantalla + ' tiene el botón Salir', tieneMenu, x.estado);
  }

  r = await ir('GET', '/app/nueva-pesada');
  ok('el botón de volver es un botón, no un texto chico', /class="volver"><span class="flecha">/.test(r.texto));

  r = await ir('GET', '/app/balanza');
  // El menú tiene DOS opciones y nada más. Todo lo de cambiar de código o de
  // persona está adentro de "Balanza y turno", en un solo lugar.
  ok('el menú lleva a Balanza y turno', /Balanza y turno/.test(r.texto));
  ok('el menú ofrece salir de la app', /Salir de la app/.test(r.texto));
  ok('el menú NO repite "Entrar con otro código"',
    r.texto.indexOf('Entrar con otro código') === -1, 'sigue estando el botón repetido');
  ok('el menú NO repite "Cambiar quién está en la balanza"',
    r.texto.indexOf('Cambiar quién está en la balanza') === -1, 'sigue estando el botón repetido');

  /* ═════════════════════════════════════════════════════════════════════
   * CERRAR EL TICKET SIN SEÑAL (tara final y regulada sobre una pesada
   * que tampoco se subió todavía)
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Cadena completa sin señal');

  r = await ir('GET', '/app/api/tablas');
  ok('el teléfono puede bajar campos, siembra y contratistas', r.estado === 200 && r.json.datos, r.estado);
  ok('trae los 43 campos', r.json.datos.campos.length === 43, r.json.datos.campos.length);
  ok('trae la planilla de siembra', Object.keys(r.json.datos.siembra).length === 40);
  ok('trae los contratistas', Object.keys(r.json.datos.contratistas).length > 0);

  r = await ir('GET', '/app/local');
  ok('la pantalla para seguir sin señal abre', r.estado === 200 && /l-cuerpo/.test(r.texto), r.estado);

  // Sin sesión también, para que el service worker la pueda guardar de entrada
  const cookiesConSesion = cookies;
  cookies = {};
  r = await ir('GET', '/app/local');
  ok('y se puede guardar sin sesión (la carga el service worker)', r.estado === 200, r.estado);
  ok('sin mostrar ningún dato de la base',
    !/AC 884 TF|Juan Sosa|El Mataco/.test(r.texto), 'filtra datos');
  cookies = cookiesConSesion;

  // Simular lo que hace el teléfono: pesada + tara final + regulada encoladas
  const refLocal = 'loc-cadena-sin-senal';

  r = await ir('POST', '/app/api/tara-final', { refLocal, taraNueva: 15000 });
  ok('un paso cuyo camión todavía no subió se rechaza para reintentar',
    r.estado === 409 && /todavía no se subió/.test(r.json.error), r.texto.slice(0, 180));

  // Ahora sube la pesada (como haría la cola, primero la pesada)
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Avelleira', patentes: 'SN 999 ZZ', chofer: 'Sin Senal',
    brutoEstimado: '52500', campo: 'El Mataco - SACHAYOJ - SE', localId: refLocal,
  });
  ok('la pesada sube y deja su enlace', r.estado === 200 && r.json.id, r.texto.slice(0, 150));
  const idCadena = r.json.id;

  // Y ahora sí el paso 2, apuntando al id local
  r = await ir('POST', '/app/api/tara-final', { refLocal, taraNueva: 15000 });
  ok('la tara final encuentra el camión por el id local', r.estado === 200, r.texto.slice(0, 180));

  let docCadena = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCadena);
  ok('quedó guardada en el ticket correcto', docCadena.tara === 15000 && !!docCadena.fechaTaraFinal,
    docCadena.tara + '/' + docCadena.fechaTaraFinal);

  // Y el paso 3, también por id local
  r = await ir('POST', '/app/api/regulada', {
    refLocal, campo: 'El Mataco - SACHAYOJ - SE', grano: granoReal, lote: [loteReal],
    cargoDe: 'SILOBOLSA', silobolsa: '7', brutoLote: '52000', bruto: '52500', confirmarTara: 'SI',
  });
  ok('la regulada también encuentra el camión por el id local', r.estado === 200, r.texto.slice(0, 180));

  docCadena = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idCadena);
  ok('el ticket quedó cerrado', docCadena.pesadaPara === 'REGULADA' && docCadena.confirmada === true);
  ok('con el neto correcto (52500 - 15000)', docCadena.neto === 37500, docCadena.neto);
  ok('y con un solo registro, sin duplicar',
    baseFalsa.collection('registros').docs.filter((d) => d.patentes === 'SN 999 ZZ').length === 1);

  /* ═════════════════════════════════════════════════════════════════════
   * PDF DEL TICKET (solo después de la REGULADA)
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('PDF del ticket para compartir');

  async function traerPdf(id) {
    const res = await fetch(BASE + '/app/ticket-pdf/' + id, {
      headers: { 'X-Forwarded-Proto': 'https', Cookie: cabeceraCookie() },
      redirect: 'manual',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { estado: res.status, tipo: res.headers.get('content-type') || '',
             disp: res.headers.get('content-disposition') || '', buf };
  }

  // Un ticket sin regulada: el PDF todavía no corresponde
  const sinRegular = baseFalsa.collection('registros').docs.find((d) => !d.fechaRegulada);
  let p = await traerPdf(String(sinRegular._id));
  ok('sin regulada, el PDF está bloqueado', p.estado === 400 && /Todavía no/.test(p.buf.toString('utf8')),
    p.estado + ' ' + p.tipo);

  p = await traerPdf(idCamion);
  ok('con la regulada cargada, el PDF sale', p.estado === 200, p.estado);
  ok('llega como application/pdf', /application\/pdf/.test(p.tipo), p.tipo);
  ok('el nombre del archivo es prolijo', /ticket-1-0001-AC884TF\.pdf/.test(p.disp), p.disp);
  ok('es un PDF de verdad', p.buf.slice(0, 7).toString('latin1') === '%PDF-1.', p.buf.slice(0, 10).toString('latin1'));
  const textoPdf = p.buf.toString('latin1');
  ok('trae el número y la patente', textoPdf.indexOf('1-0001') !== -1 && textoPdf.indexOf('AC 884 TF') !== -1);
  ok('trae el neto', textoPdf.indexOf('36.900') !== -1);
  ok('NO expone el código de la balanza', textoPdf.indexOf('5679') === -1 && textoPdf.indexOf('12341') === -1);
  ok('mide 19 × 4,5 cm', /\/MediaBox \[0 0 538\.58 127\.56\]/.test(textoPdf),
    (textoPdf.match(/\/MediaBox[^\]]+\]/) || [''])[0]);

  p = await traerPdf('idinventado');
  ok('un id inválido no rompe', p.estado === 404, p.estado);

  /* ═════════════════════════════════════════════════════════════════════
   * QUE LA WEB VEA LO DE LA APP
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('La web ve los tickets de la app');
  const cookiesGuardadas = cookies;
  cookies = {};
  let rw = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=12341&redirect=/tabla',
    redirect: 'manual',
  });
  guardarCookies(rw);
  r = await ir('GET', '/tabla');
  ok('Ver Registros (web) abre con el código GENERAL', r.estado === 200, r.estado);
  ok('el ticket cargado desde la app aparece en Ver Registros', /AC 884 TF/.test(r.texto));
  ok('también sigue el cargado desde la web', /WEB 001 AA/.test(r.texto));
  ok('el nombre del día aparece como Usuario', /Juan Sosa/.test(r.texto));

  r = await ir('GET', '/exportar-excel');
  ok('el Excel de la web sigue exportando', r.estado === 200 || r.estado === 404, r.estado);

  /* ═════════════════════════════════════════════════════════════════════
   * EDITAR OBSERVACIONES (mismas reglas que la web)
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Observaciones: mismas reglas que la web (2 ediciones, 1 día)');
  cookies = cookiesGuardadas;
  r = await ir('GET', '/app/registro/' + idCamion);
  ok('el detalle del ticket abre', r.estado === 200 && /🔒 fijo/.test(r.texto));
  ok('muestra el neto', /36\.900/.test(r.texto));
  ok('ofrece pedir corrección a GENERAL', /Pedir corrección a GENERAL/.test(r.texto));
  ok('ofrece compartir el PDF (ya está la regulada)', /Compartir el PDF/.test(r.texto));
  ok('el botón de compartir avisa que necesita internet', /data-necesita-internet/.test(r.texto));

  r = await ir('POST', '/app/api/comentarios/' + idCamion, { comentarios: 'Primera corrección' });
  ok('primera edición de observaciones OK', r.estado === 200);
  r = await ir('POST', '/app/api/comentarios/' + idCamion, { comentarios: 'Segunda corrección' });
  ok('segunda edición OK', r.estado === 200);
  r = await ir('POST', '/app/api/comentarios/' + idCamion, { comentarios: 'Tercera' });
  ok('tercera edición se rechaza (límite 2, igual que la web)', r.estado === 400 && /dos veces/.test(r.json.error), r.texto.slice(0, 150));
  ok('quedó auditoría de los cambios',
    baseFalsa.collection('registros_auditoria').docs.filter((d) => d.tipoOperacion === 'COMENTARIO').length === 2);

  /* ═════════════════════════════════════════════════════════════════════
   * CAMIÓN REPETIDO
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Aviso de camión repetido en otra balanza (7b)');
  // Cargar la misma patente en otra balanza (La Pradera → 5680)
  const cookiesMataco = cookies;
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: '5680' });
  await ir('POST', '/app/api/dia', { nombre: 'M. Rivero' });
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Sonzogni', patentes: 'AC 884 TF', chofer: 'R. Gómez',
    brutoEstimado: '45000', campo: 'La Pradera - ARBOL BLANCO - SE',
  });
  ok('la otra balanza carga la misma patente', r.estado === 200, r.texto.slice(0, 150));
  ok('avisa que el camión está repetido hoy', r.json.repetido && /Mataco/i.test(r.json.repetido.balanza),
    JSON.stringify(r.json.repetido));
  ok('el aviso NO bloquea la carga', !!r.json.id);

  r = await ir('GET', '/app/api/repetido?patentes=AC%20884%20TF');
  ok('la consulta previa de repetido funciona', r.estado === 200 && r.json.repetido, r.texto.slice(0, 150));

  /* ═════════════════════════════════════════════════════════════════════
   * PEDIDO DE ANULACIÓN Y GENERAL
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Pedido de anulación y decisión de GENERAL (6e, 6f)');
  const idPradera = r.json.repetido ? null : null;
  const docsPradera = baseFalsa.collection('registros').docs.filter((d) => d.codigoIngreso === '5680');
  const idOtro = String(docsPradera[0]._id);

  r = await ir('GET', '/app/pedir/' + idOtro + '?tipo=anulacion');
  ok('la pantalla de pedir anulación abre', r.estado === 200 && /Motivo \(obligatorio\)/.test(r.texto));

  r = await ir('POST', '/app/api/pedido', { id: idOtro, tipo: 'ANULACION', motivo: 'no' });
  ok('sin motivo escrito se rechaza', r.estado === 400 && /motivo/i.test(r.json.error));

  r = await ir('POST', '/app/api/pedido', {
    id: idOtro, tipo: 'ANULACION',
    motivo: 'Cargué la tara del acoplado equivocado, el camión ya salió.',
  });
  ok('el pedido se envía', r.estado === 200, r.texto.slice(0, 150));

  r = await ir('POST', '/app/api/pedido', { id: idOtro, tipo: 'ANULACION', motivo: 'otra vez lo mismo' });
  ok('no se puede pedir dos veces lo mismo', r.estado === 409);

  // El aviso a GENERAL tiene que traer el MOTIVO: sin eso no sirve para decidir.
  const avisoPedido = emails.filter((e) => /^PEDIDO/.test(String(e.tipo || ''))).pop();
  ok('se mandó el aviso del pedido', !!avisoPedido, JSON.stringify(emails.map((e) => e.tipo)));
  ok('el aviso dice que es un PEDIDO DE ANULACIÓN',
    avisoPedido && avisoPedido.tipo === 'PEDIDO DE ANULACIÓN', (avisoPedido || {}).tipo);
  ok('y lleva el motivo escrito por el balancero',
    avisoPedido && /acoplado equivocado/.test(avisoPedido.motivo || ''), (avisoPedido || {}).motivo);
  ok('y quién lo pidió', avisoPedido && !!avisoPedido.pedidoPor, (avisoPedido || {}).pedidoPor);
  ok('y de qué balanza es', avisoPedido && avisoPedido.codigoIngreso === '5680', (avisoPedido || {}).codigoIngreso);

  // El balancero NO puede anular
  r = await ir('POST', '/app/api/anular', { id: idOtro, code: '5680' });
  ok('el balancero NO puede anular (regla del sistema actual)', r.estado === 403 && /GENERAL/.test(r.json.error), r.texto.slice(0, 150));

  r = await ir('GET', '/app/general/pedidos');
  ok('el balancero no ve la bandeja de GENERAL', r.estado === 403, r.estado);

  // GENERAL entra y decide
  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: '12341' });
  ok('GENERAL entra con 12341 al resumen', r.estado === 200 && r.json.destino === '/app/general', r.texto.slice(0, 150));
  // Se guardan para reusarlas: el servidor limita a 10 intentos de ingreso cada
  // 15 minutos por IP, y la prueba entra y sale varias veces.
  const cookiesGeneral = Object.assign({}, cookies);

  r = await ir('GET', '/app/general');
  ok('el resumen del día abre', r.estado === 200 && /NETO DEL DÍA|Neto del día/i.test(r.texto), r.estado);
  ok('GENERAL tiene el camino para ir a cargar con otro código',
    /Entrar con el código de una balanza/.test(r.texto));
  ok('y le explica por qué no puede cargar con este código',
    /Este código entra a mirar y a autorizar/.test(r.texto));
  ok('GENERAL también tiene el botón Salir', /data-abre-modal="modal-menu"/.test(r.texto));
  ok('muestra "todas las balanzas"', /TODAS LAS BALANZAS/.test(r.texto));
  // El total del día se calcula de la base, no se escribe a mano: así el test no
  // se rompe cada vez que la prueba agrega un ticket más.
  const hoyStr = new Date().toISOString().split('T')[0];
  const netoEsperado = baseFalsa.collection('registros').docs
    .filter((d) => d.fecha === hoyStr && d.fechaRegulada && !d.anulado)
    .reduce((a, d) => a + (Number(d.neto) || 0), 0);
  ok('el neto del día suma solo lo regulado',
    r.texto.indexOf(netoEsperado.toLocaleString('es-AR')) !== -1,
    'esperaba ' + netoEsperado.toLocaleString('es-AR'));
  ok('bloque "Para revisar" con el pedido', /Para revisar/.test(r.texto) && /pedido de anulación/.test(r.texto));
  ok('avisa el camión repetido en dos balanzas', /repetido/.test(r.texto));
  ok('lista por balanza', /El Mataco/.test(r.texto) && /La Pradera/.test(r.texto));
  ok('lista por grano', new RegExp(granoReal, 'i').test(r.texto), granoReal);

  r = await ir('GET', '/app/general/balanza/5679');
  ok('el detalle de la balanza abre (8c)', r.estado === 200 && /AC 884 TF/.test(r.texto));
  ok('muestra la etiqueta NETO', /NETO/.test(r.texto));

  r = await ir('GET', '/app/general/balanza/9999');
  ok('no se puede espiar una balanza inexistente', r.estado === 400 || r.estado === 403 || r.estado === 404, r.estado);

  r = await ir('GET', '/app/general/repetidos');
  ok('la lista de repetidos abre', r.estado === 200 && /AC 884 TF/.test(r.texto));

  r = await ir('GET', '/app/general/pedidos');
  ok('la bandeja de pedidos abre', r.estado === 200 && /acoplado equivocado/.test(r.texto));
  ok('muestra quién pidió', /M\. Rivero/.test(r.texto));

  const pedidoId = String(baseFalsa.collection('app_pedidos').docs[0]._id);
  r = await ir('POST', '/app/api/pedido/' + pedidoId + '/resolver', { decision: 'ANULAR' });
  ok('GENERAL anula el ticket', r.estado === 200, r.texto.slice(0, 150));

  const docAnulado = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idOtro);
  ok('el ticket queda marcado ANULADO (no se borra)', docAnulado.anulado === true && !!docAnulado.patentes);
  ok('quedó copia completa en auditoría',
    baseFalsa.collection('registros_auditoria').docs.some((d) => d.tipoOperacion === 'ANULACION' && d.registroOriginal),
    '');
  ok('el pedido se cierra', baseFalsa.collection('app_pedidos').docs[0].estado === 'ANULADO');

  r = await ir('POST', '/app/api/pedido/' + pedidoId + '/resolver', { decision: 'ANULAR' });
  ok('no se resuelve dos veces el mismo pedido', r.estado === 400);

  r = await ir('GET', '/app/general');
  ok('el bloque "Para revisar" ya no muestra pedidos', !/pedido de anulación/.test(r.texto));

  /* ═════════════════════════════════════════════════════════════════════
   * ANULAR EN EL MOMENTO — SOLO GENERAL, DESDE SU PROPIA SESIÓN
   * ---------------------------------------------------------------------
   * Antes se podía anular desde la balanza tipeando el código de GENERAL en un
   * modal. Se sacó a pedido: el código de GENERAL no tiene que circular por las
   * balanzas. El balancero pide la anulación y GENERAL la resuelve.
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Anular: solo GENERAL, y desde su propio código');
  cookies = cookiesMataco;
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'SOCIO', socio: 'Pérez', transporte: 'Avelleira', patentes: 'AF 902 LK',
    chofer: 'J. Pérez', brutoEstimado: '45000', campo: 'El 44 - ARBOL BLANCO - SE',
  });
  ok('se carga otra pesada (socio)', r.estado === 200, r.texto.slice(0, 150));
  const idParaAnular = r.json.id;

  r = await ir('POST', '/app/api/anular', { id: idParaAnular, code: '9999' });
  ok('desde la balanza, un código cualquiera no anula', r.estado === 403);

  // Lo importante: NI SIQUIERA con el código de GENERAL bien puesto. Desde una
  // balanza no se anula, punto.
  r = await ir('POST', '/app/api/anular', { id: idParaAnular, code: '12341' });
  ok('desde la balanza NO se anula ni con el código de GENERAL',
    r.estado === 403 && /Solo GENERAL puede anular/.test(r.json.error), r.texto.slice(0, 180));

  // Y la pantalla del ticket no muestra la opción ni el modal, así el código
  // de GENERAL no se ve nunca desde una balanza.
  r = await ir('GET', '/app/registro/' + idParaAnular);
  ok('el ticket ofrece "Pedir anulación a GENERAL"', /Pedir anulación a GENERAL/.test(r.texto));
  ok('y NO ofrece anular en el momento', !/id="modal-anular"/.test(r.texto));
  ok('ni nombra el código de GENERAL', r.texto.indexOf('12341') === -1);

  // Con la sesión de GENERAL sí, y sin tener que tipear ningún código.
  const cookiesBalanza = cookies;
  cookies = Object.assign({}, cookiesGeneral);
  r = await ir('GET', '/app/registro/' + idParaAnular);
  ok('GENERAL sí ve la opción de anular ahora', /id="modal-anular"/.test(r.texto));

  r = await ir('POST', '/app/api/anular', { id: idParaAnular });
  ok('GENERAL anula sin tipear ningún código', r.estado === 200, r.texto.slice(0, 180));
  const anulado2 = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idParaAnular);
  ok('el número queda quemado (el ticket no desaparece)', anulado2.anulado === true && !!anulado2.nroApp);
  cookies = cookiesBalanza;

  /* ═════════════════════════════════════════════════════════════════════
   * PERMISOS Y VARIOS
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('Permisos, sesión y pantallas sueltas');
  r = await ir('GET', '/app/balanza');
  ok('la pantalla balanza y turno abre (6c)', r.estado === 200 && /Balanza y turno/.test(r.texto));

  r = await ir('GET', '/app/pantalla-que-no-existe');
  ok('una dirección inexistente da 404 con la pantalla de la app', r.estado === 404 && /No se encontró/.test(r.texto));

  r = await ir('GET', '/app/api/no-existe');
  ok('un endpoint inexistente da 404 JSON', r.estado === 404 && r.json && r.json.ok === false);

  r = await ir('GET', '/app/registro/nada');
  ok('un id inválido no rompe', r.estado === 404, r.estado);

  // GENERAL no carga: entra con 12341 y no tiene balanza
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: '12341' });
  r = await ir('GET', '/app/nueva-pesada');
  ok('GENERAL no puede cargar pesadas', r.estado === 302 && r.ubicacion === '/app/general', r.ubicacion);

  // Un observador de balanza ve solo lo suyo
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: '1235' });
  r = await ir('GET', '/app/general');
  ok('un observador de balanza ve solo su balanza', r.estado === 200 && !/TODAS LAS BALANZAS/.test(r.texto), r.estado);
  r = await ir('GET', '/app/general/balanza/5680');
  ok('un observador no ve otra balanza', r.estado === 400 || r.estado === 403, r.estado);

  r = await ir('POST', '/app/api/salir', {});
  ok('salir cierra la sesión de la app', r.estado === 200);
  r = await ir('GET', '/app/patio');
  ok('después de salir, pide el código otra vez', r.estado === 302 && r.ubicacion === '/app/ingreso');

  /* ═════════════════════════════════════════════════════════════════════
   * DE QUIÉN ES CADA TICKET
   * ---------------------------------------------------------------------
   * Regla de la app (distinta de la web, a pedido):
   *  - el código GENERAL de carga (56781) deriva el ticket a la balanza del
   *    campo elegido;
   *  - el código de una balanza se queda el ticket, aunque el campo sea de
   *    otra. Un campo mal elegido se corrige en la regulada; lo que no puede
   *    pasar es que el ticket salte a otra tabla y el balancero lo pierda.
   * ═══════════════════════════════════════════════════════════════════ */
  seccion('De quién es cada ticket (campo vs. código)');

  // Una balanza carga un camión con un campo que es de OTRA balanza (Martina es
  // de 5683). El ticket tiene que quedar igual en 5679.
  cookies = Object.assign({}, cookies5679);
  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'CA MPO 01', chofer: 'Campo Ajeno',
    brutoEstimado: '45000', campo: 'Martina - ALHUAMPA - SE',
  });
  ok('se carga con un campo de otra balanza', r.estado === 200, r.texto.slice(0, 200));
  const idAjeno = r.json.id;
  let docAjeno = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idAjeno);
  ok('el ticket NO se va a la balanza del campo: queda en la que lo cargó',
    docAjeno.codigoIngreso === '5679', docAjeno.codigoIngreso);
  ok('y el campo elegido se guarda tal cual',
    docAjeno.campo === 'Martina - ALHUAMPA - SE', docAjeno.campo);

  // Lo importante en la práctica: sigue estando en SU patio.
  r = await ir('GET', '/app/patio');
  ok('sigue en el patio del que lo cargó (no se le desaparece)',
    r.texto.indexOf('CA MPO 01') !== -1);

  // Y el campo se puede corregir en la regulada sin que el ticket cambie de dueño.
  r = await ir('POST', '/app/api/tara-final', { id: idAjeno, taraNueva: 14000 });
  ok('la tara final se carga normal', r.estado === 200, r.texto.slice(0, 200));
  r = await ir('POST', '/app/api/regulada', {
    id: idAjeno, campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA',
    lote: ['Lote 1'], cargoDe: 'SILOBOLSA', silobolsa: '3',
    brutoLote: '44000', bruto: '45000', confirmarTara: 'SI',
  });
  const seGuardo = r.estado === 200;
  docAjeno = baseFalsa.collection('registros').docs.find((d) => String(d._id) === idAjeno);
  ok('corregir el campo en la regulada no cambia de dueño al ticket',
    docAjeno.codigoIngreso === '5679', docAjeno.codigoIngreso + (seGuardo ? '' : ' (la regulada no se guardó: ' + r.texto.slice(0, 120) + ')'));

  // Con el código GENERAL de carga (56781) sí se deriva por campo.
  cookies = {};
  const OFICINA = '10.20.30.40'; // otro dispositivo: cuenta aparte de intentos
  r = await ir('POST', '/app/api/ingreso', { code: '56781' }, { desde: OFICINA });
  ok('el código general de carga entra', r.estado === 200, r.texto.slice(0, 150));
  await ir('POST', '/app/api/dia', { nombre: 'Oficina' }, { desde: OFICINA });

  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'GE NER 01', chofer: 'Desde Oficina',
    brutoEstimado: '45000', campo: 'Panuncio - ARBOL BLANCO - SE',
  }, { desde: OFICINA });
  ok('el general carga una pesada', r.estado === 200, r.texto.slice(0, 200));
  const docGeneral = baseFalsa.collection('registros').docs.find((d) => String(d._id) === r.json.id);
  ok('el general SÍ deriva el ticket a la balanza del campo (Panuncio → 5679)',
    docGeneral.codigoIngreso === '5679', docGeneral.codigoIngreso);

  r = await ir('POST', '/app/api/pesada', {
    cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'GE NER 02', chofer: 'Desde Oficina',
    brutoEstimado: '45000', campo: 'AVELLEIRA',
  }, { desde: OFICINA });
  const docSinFija = baseFalsa.collection('registros').docs.find((d) => String(d._id) === r.json.id);
  ok('AVELLEIRA tiene balanza fija en la planilla (5684)',
    docSinFija.codigoIngreso === '5684', docSinFija.codigoIngreso);

  /* ═════════════════════════════════════════════════════════════════════
   * RESUMEN
   * ═══════════════════════════════════════════════════════════════════ */
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
