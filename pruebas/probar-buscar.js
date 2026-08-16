'use strict';
/**
 * Buscar un ticket y moverse entre días.
 *
 * Lo que se comprueba, que es exactamente lo que se pidió: que desde un código
 * de "ver registros" se puedan ver los tickets anteriores, filtrar por día y
 * buscar por patente o por chofer. Y que cada código siga viendo SOLO su
 * balanza (el 12341, todas), incluso al abrir un ticket por su dirección.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3207';

const { BaseFalsa, ObjectId } = require('./doble-mongo');
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

/* ── Stub de mongoose ──────────────────────────────────────────────────── */
const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

/* ── No mandar emails de verdad ────────────────────────────────────────── */
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
  // Cada "dispositivo" con su IP: el servidor limita 10 ingresos cada 15 min.
  if (opciones.desde) headers['X-Forwarded-For'] = opciones.desde;
  const ck = cabeceraCookie();
  if (ck) headers.Cookie = ck;
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

/* ── Fechas ───────────────────────────────────────────────────────────── */
function ymd(d) { return d.toISOString().slice(0, 10); }
function haceDias(n) { return ymd(new Date(Date.now() - n * 24 * 60 * 60 * 1000)); }

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Cómo se tiene que ver un día en pantalla: "domingo 09/08/26". */
function diaConFecha(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00Z');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const aa = String(d.getUTCFullYear()).slice(2);
  return DIAS_SEMANA[d.getUTCDay()] + ' ' + dd + '/' + mm + '/' + aa;
}

const HOY = haceDias(0);
const AYER = haceDias(1);

/* ── Tickets de mentira, puestos directo en la base ───────────────────── */
let proximoId = 1000;

function meterTicket(extra) {
  const id = proximoId++;
  const doc = Object.assign(
    {
      _id: new ObjectId(),
      idTicket: id,
      nroApp: '4-' + String(id).slice(-4),
      origen: 'app',
      fecha: HOY,
      // Así se guardan de verdad: dos patentes en un campo, con espacios de más.
      patentes: 'AC642HV      AF593JO ',
      chofer: 'Ramón Gómez',
      transporte: 'Ciriaci',
      campo: 'Quimili - QUIMILI - SE',
      grano: 'MAÍZ',
      lote: 'L1',
      neto: 30000,
      netoEstimado: 30000,
      tara: 15000,
      codigoIngreso: '5684',
      fechaTaraFinal: HOY,
      fechaRegulada: HOY,
    },
    extra || {}
  );
  baseFalsa.collection('registros').docs.push(doc);
  return doc;
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  const QUIMILI = '5684';       // carga
  const VER_QUIMILI = '1240';   // solo mira Quimili
  const VER_TODO = '12341';     // GENERAL: mira todas

  /* Escenario: Quimili con tickets de hoy, ayer y de hace 10 días, y un
     ticket de OTRA balanza que el 1240 no tiene que ver nunca. */
  const hoyQuimili = meterTicket({ chofer: 'Ramón Gómez', patentes: 'AC642HV      AF593JO ' });
  const ayerQuimili = meterTicket({
    fecha: AYER, fechaTaraFinal: AYER, fechaRegulada: AYER,
    patentes: 'AD 111 ZZ', chofer: 'Sergio Páez', neto: 27000, lote: 'L2',
  });
  const viejoQuimili = meterTicket({
    fecha: haceDias(10), fechaTaraFinal: haceDias(10), fechaRegulada: haceDias(10),
    patentes: 'AE 222 YY', chofer: 'Marta Núñez', neto: 25000,
  });
  const ajeno = meterTicket({
    codigoIngreso: '5679', campo: 'El Mataco - SACHAYOJ - SE',
    patentes: 'ZZ 999 ZZ', chofer: 'Ajeno Total',
  });
  const anulado = meterTicket({
    patentes: 'AN 000 UL', chofer: 'Anulado Pérez', anulado: true,
  });
  const sinCtg = meterTicket({ patentes: 'CT 111 GG', chofer: 'Falta Ctg' });
  meterTicket({ patentes: 'AB 555 CD', chofer: 'Sin Regular', fechaRegulada: undefined, neto: 0 });

  /* ═══════════════════════════════════════════════════════════════════════
   * MOVERSE ENTRE DÍAS (lo que antes no se podía)
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Moverse entre días con el código de ver registros');

  cookies = {};
  let r = await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.9.0.1' });
  ok('el código de ver registros entra', r.estado === 200 && r.json.destino === '/app/general', r.texto.slice(0, 150));

  r = await ir('GET', '/app/general');
  ok('el resumen abre y dice qué balanza mira', r.estado === 200 && /Quimili/.test(r.texto), r.estado);
  ok('trae la barra de días', /nav-dias/.test(r.texto));
  ok('la flecha de ayer apunta al día anterior',
    r.texto.indexOf('/app/general?fecha=' + AYER) !== -1, AYER);
  ok('la flecha de adelante está apagada estando en hoy', /nd-apagada/.test(r.texto));
  ok('el día se escribe con día de semana y fecha ("' + diaConFecha(HOY) + '")',
    r.texto.indexOf(diaConFecha(HOY)) !== -1, diaConFecha(HOY));
  ok('el campo de fecha tiene tope en hoy', new RegExp('max="' + HOY + '"').test(r.texto));
  ok('el campo de fecha arranca vacío (no repite el día que se mira)',
    !/name="fecha"[^>]*value=/.test(r.texto), (r.texto.match(/<input type="date"[^>]*>/) || [''])[0]);
  ok('el campo de fecha muestra el ícono de calendario', /class="nd-icono"/.test(r.texto));
  ok('ya no está el botón Hoy', !/>Hoy</.test(r.texto));
  ok('desde el resumen se llega al buscador', /href="\/app\/buscar"/.test(r.texto));
  // Va pegado a los números del día, arriba del bloque de "¿Vas a cargar…?".
  ok('el botón de buscar está arriba del bloque de cargar una pesada',
    r.texto.indexOf('href="/app/buscar"') < r.texto.indexOf('¿Vas a cargar una pesada?'),
    r.texto.indexOf('href="/app/buscar"') + ' / ' + r.texto.indexOf('¿Vas a cargar una pesada?'));
  ok('y abajo de la tarjeta de Por grano',
    r.texto.indexOf('Por grano') < r.texto.indexOf('href="/app/buscar"'));

  // La fecha aparece UNA sola vez como día que se mira; arriba va la de hoy.
  const vecesHoy = (r.texto.match(new RegExp(diaConFecha(HOY), 'g')) || []).length;
  ok('estando en hoy la fecha sale dos veces: arriba (hoy) y en la barra', vecesHoy === 2, vecesHoy);

  r = await ir('GET', '/app/general?fecha=' + AYER);
  ok('el resumen de ayer abre', r.estado === 200, r.estado);
  ok('estando en ayer aparece la flecha de adelante',
    r.texto.indexOf('/app/general?fecha=' + HOY) !== -1);
  ok('arriba a la izquierda sigue la fecha de HOY, no la que se está mirando',
    r.texto.indexOf('class="t-pantalla-g">' + diaConFecha(HOY)) !== -1, diaConFecha(HOY));
  ok('la barra muestra el día que se está mirando', r.texto.indexOf(diaConFecha(AYER)) !== -1, diaConFecha(AYER));
  ok('el neto de ayer es el del ticket de ayer', /27\.000/.test(r.texto), r.texto.slice(0, 60));

  r = await ir('GET', '/app/general/balanza/' + QUIMILI + '?fecha=' + AYER);
  ok('la lista de la balanza de ayer abre', r.estado === 200 && /AD 111 ZZ/.test(r.texto), r.estado);
  ok('la lista también trae la barra de días', /nav-dias/.test(r.texto));
  ok('la flecha de la lista lleva al día anterior de la misma balanza',
    r.texto.indexOf('/app/general/balanza/' + QUIMILI + '?fecha=' + haceDias(2)) !== -1);
  ok('no muestra el ticket de hoy al mirar ayer', !/AC642HV/.test(r.texto));
  ok('el "volver" de la lista dice a dónde vuelve, no repite el día',
    /class="texto">Resumen</.test(r.texto));
  ok('en la lista, el botón de buscar está arriba de los camiones',
    r.texto.indexOf('href="/app/buscar"') !== -1 &&
    r.texto.indexOf('href="/app/buscar"') < r.texto.indexOf('/app/registro/'),
    r.texto.indexOf('href="/app/buscar"') + ' / ' + r.texto.indexOf('/app/registro/'));
  const vecesAyer = (r.texto.match(new RegExp(diaConFecha(AYER), 'g')) || []).length;
  ok('el día que se mira sale una sola vez en la lista', vecesAyer === 1, vecesAyer);

  r = await ir('GET', '/app/general/balanza/5679');
  ok('el 1240 no puede mirar la lista de otra balanza',
    /Sin permiso/.test(r.texto) || r.estado === 403, r.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * IMPRIMIR LOS TICKETS DEL DÍA QUE SE ESTÁ MIRANDO
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Imprimir los tickets del día observado');

  r = await ir('GET', '/app/general/balanza/' + QUIMILI + '?fecha=' + AYER);
  ok('la lista del día ofrece imprimirlo',
    r.texto.indexOf('/app/imprimir-dia/' + QUIMILI + '?fecha=' + AYER) !== -1, AYER);

  r = await ir('GET', '/app/general?fecha=' + AYER);
  ok('el resumen también, porque este código ve una sola balanza',
    r.texto.indexOf('/app/imprimir-dia/' + QUIMILI + '?fecha=' + AYER) !== -1);

  r = await ir('GET', '/app/imprimir-dia/' + QUIMILI + '?fecha=' + AYER);
  ok('imprimir el día lleva a la hoja de impresión', r.estado === 302 && /\/app\/imprimir\?ids=/.test(r.ubicacion || ''), r.estado + ' ' + r.ubicacion);
  ok('con el ticket de ese día', decodeURIComponent(r.ubicacion || '').indexOf(String(ayerQuimili._id)) !== -1, r.ubicacion);
  ok('y no con los de otros días',
    decodeURIComponent(r.ubicacion || '').indexOf(String(hoyQuimili._id)) === -1, r.ubicacion);
  ok('y vuelve al día que se estaba mirando',
    decodeURIComponent(r.ubicacion || '').indexOf('volver=/app/general/balanza/' + QUIMILI + '?fecha=' + AYER) !== -1,
    r.ubicacion);

  // Un anulado no se le entrega a nadie
  r = await ir('GET', '/app/imprimir-dia/' + QUIMILI);
  const idsHoy = decodeURIComponent(r.ubicacion || '');
  ok('el día de hoy también se imprime', r.estado === 302 && idsHoy.indexOf(String(hoyQuimili._id)) !== -1, r.ubicacion);
  ok('los anulados quedan afuera', idsHoy.indexOf(String(anulado._id)) === -1, r.ubicacion);
  ok('los que todavía no cerraron la regulada SÍ entran (van con renglones punteados)',
    idsHoy.indexOf(String(sinCtg._id)) !== -1);

  // Y la hoja de impresión de verdad puede leer esos tickets con este código:
  // antes /app/api/tickets miraba s.codigoIngreso, que en un código de ver
  // registros no existe, y la hoja salía vacía.
  r = await ir('GET', '/app/api/tickets?ids=' + ayerQuimili._id);
  ok('el código de ver registros puede leer el ticket para imprimirlo',
    r.estado === 200 && r.json && r.json.tickets.length === 1, r.texto.slice(0, 150));

  r = await ir('GET', '/app/api/tickets?ids=' + ajeno._id);
  ok('pero no el de otra balanza', r.json && r.json.tickets.length === 0, r.texto.slice(0, 150));

  r = await ir('GET', '/app/imprimir-dia/5679');
  ok('no puede imprimir el día de otra balanza', /Sin permiso/.test(r.texto), r.estado);

  r = await ir('GET', '/app/imprimir-dia/' + QUIMILI + '?fecha=2020-01-01');
  ok('un día sin tickets lo dice, no manda a una hoja vacía',
    /No hay tickets ese día/.test(r.texto), r.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * BUSCADOR
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Buscar por patente, chofer y número');

  r = await ir('GET', '/app/buscar');
  ok('el buscador abre sin escribir nada', r.estado === 200 && /Buscar un ticket/.test(r.texto), r.estado);
  ok('avisa que hace falta internet', /[Hh]ace falta internet/.test(r.texto));
  ok('dice que busca en su balanza', /registros de tu balanza/.test(r.texto));
  ok('trae los cinco rangos',
    /Hoy<\/a>/.test(r.texto) && /Ayer<\/a>/.test(r.texto) && /7 días/.test(r.texto) &&
    /30 días/.test(r.texto) && /Toda la campaña/.test(r.texto));

  // Patente escrita sin los espacios de más con que está guardada
  r = await ir('GET', '/app/buscar?q=AF593JO');
  ok('encuentra por patente aunque esté guardada con espacios irregulares',
    r.estado === 200 && r.texto.indexOf('/app/registro/' + hoyQuimili._id) !== -1, r.estado);

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('af 593 jo'));
  ok('la patente se encuentra en minúscula y con espacios puestos por el usuario',
    r.texto.indexOf('/app/registro/' + hoyQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=gomez');
  ok('encuentra el chofer sin acentos ni mayúsculas (gomez → Ramón Gómez)',
    r.texto.indexOf('/app/registro/' + hoyQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('NÚÑEZ') + '&rango=30');
  ok('encuentra el chofer escrito con acento', r.texto.indexOf('/app/registro/' + viejoQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=ciriaci&rango=30');
  ok('encuentra por transporte', /Ciriaci/.test(r.texto) && /\/app\/registro\//.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent(hoyQuimili.nroApp));
  ok('encuentra por número de ticket', r.texto.indexOf('/app/registro/' + hoyQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=NO-EXISTE-ESTO');
  ok('sin resultados lo dice y no muestra tarjetas', /Sin resultados/.test(r.texto) && !/\/app\/registro\//.test(r.texto));

  /* ── Rangos ─────────────────────────────────────────────────────────── */
  seccion('Rangos de días del buscador');

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Núñez') + '&rango=hoy');
  ok('el rango Hoy no trae un ticket de hace 10 días', !/\/app\/registro\//.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Núñez') + '&rango=campana');
  ok('"Toda la campaña" sí lo trae',
    r.texto.indexOf('/app/registro/' + viejoQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Páez') + '&rango=ayer');
  ok('el rango Ayer trae solo el de ayer',
    r.texto.indexOf('/app/registro/' + ayerQuimili._id) !== -1);

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Gómez') + '&rango=ayer');
  ok('el rango Ayer no trae el de hoy', !/\/app\/registro\//.test(r.texto));

  r = await ir('GET', '/app/buscar?q=gomez&rango=inventado');
  ok('un rango inventado no rompe: se cae a 30 días', r.estado === 200 && /\/app\/registro\//.test(r.texto), r.estado);

  /* ── Chips de estado ────────────────────────────────────────────────── */
  seccion('Estado de cada ticket en los resultados');

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Anulado Pérez'));
  ok('un ticket anulado sale marcado ANULADO', /ANULADO/.test(r.texto), r.texto.slice(0, 80));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Falta Ctg'));
  ok('un ticket cerrado sin CTG avisa "Falta CTG"', /Falta CTG/.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Sin Regular'));
  ok('un ticket sin regular sale marcado', /Sin regular|En camiones/.test(r.texto));

  /* ── Alcance: cada código ve solo lo suyo ───────────────────────────── */
  seccion('Cada código ve solo su balanza');

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Ajeno') + '&rango=campana');
  ok('el 1240 NO encuentra el ticket de El Mataco', !/\/app\/registro\//.test(r.texto));

  r = await ir('GET', '/app/buscar?q=ZZ999ZZ&rango=campana');
  ok('tampoco por la patente del ticket ajeno', !/\/app\/registro\//.test(r.texto));

  // El agujero que había: abrir el ticket de otra balanza por su dirección.
  r = await ir('GET', '/app/registro/' + ajeno._id);
  ok('el 1240 no puede abrir el ticket de otra balanza (404)', r.estado === 404, r.estado);
  ok('y no se le escapa la patente en la respuesta', !/ZZ 999 ZZ/.test(r.texto));

  r = await ir('GET', '/app/registro/' + hoyQuimili._id);
  ok('pero sí abre el de su propia balanza', r.estado === 200 && /AC642HV/.test(r.texto), r.estado);

  /* ── GENERAL ve todo ────────────────────────────────────────────────── */
  seccion('GENERAL busca en todas las balanzas');

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: VER_TODO }, { desde: '10.9.0.2' });
  ok('el código general de ver registros entra', r.estado === 200, r.texto.slice(0, 150));

  r = await ir('GET', '/app/buscar');
  ok('a GENERAL le dice que busca en todas las balanzas', /todas las balanzas/.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Ajeno') + '&rango=campana');
  ok('GENERAL sí encuentra el ticket de El Mataco',
    r.texto.indexOf('/app/registro/' + ajeno._id) !== -1);
  ok('y le muestra de qué balanza es', /El Mataco/.test(r.texto));

  r = await ir('GET', '/app/buscar?q=gomez');
  ok('GENERAL también encuentra los de Quimili',
    r.texto.indexOf('/app/registro/' + hoyQuimili._id) !== -1);

  /* ── El tope de resultados ──────────────────────────────────────────── */
  seccion('El tope de 100 resultados');

  for (let i = 0; i < 130; i++) {
    meterTicket({ patentes: 'MU ' + String(100 + i) + ' CH', chofer: 'Muchos Tickets' });
  }
  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Muchos Tickets'));
  const tarjetas = (r.texto.match(/\/app\/registro\//g) || []).length;
  ok('muestra 100 y no más', tarjetas === 100, tarjetas);
  ok('avisa que hay más y que se afine la búsqueda', /Primeros 100/.test(r.texto) && /afin/.test(r.texto));

  /* ── El código de una balanza también puede buscar ──────────────────── */
  seccion('El balancero también puede buscar');

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: QUIMILI }, { desde: '10.9.0.3' });
  ok('el código de la balanza entra', r.estado === 200, r.texto.slice(0, 150));
  await ir('POST', '/app/api/dia', { nombre: 'Juan Sosa' });

  r = await ir('GET', '/app/patio');
  ok('el patio ofrece buscar un ticket', /href="\/app\/buscar"/.test(r.texto));

  ok('el patio trae el bloque de versión de la app al final',
    /Versión de la app/.test(r.texto) && /id="v-actualizar"/.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Núñez') + '&rango=campana');
  ok('el balancero encuentra su ticket de hace 10 días',
    r.texto.indexOf('/app/registro/' + viejoQuimili._id) !== -1);
  ok('vuelve al patio, no al resumen', /href="\/app\/patio" class="volver"/.test(r.texto));

  r = await ir('GET', '/app/buscar?q=' + encodeURIComponent('Ajeno') + '&rango=campana');
  ok('el balancero tampoco ve el ticket de otra balanza', !/\/app\/registro\//.test(r.texto));

  /* ── Sin sesión ─────────────────────────────────────────────────────── */
  seccion('Sin sesión no se busca nada');
  cookies = {};
  r = await ir('GET', '/app/buscar?q=gomez');
  ok('sin código, el buscador manda al ingreso', r.estado === 302 && r.ubicacion === '/app/ingreso', r.ubicacion);

  /* ── El service worker no guarda el buscador ────────────────────────── */
  seccion('Sin señal el buscador lo dice, no muestra resultados viejos');
  r = await ir('GET', '/app/sw.js');
  ok('el service worker no guarda /app/buscar', /SIN_GUARDAR/.test(r.texto) && /'\/app\/buscar'/.test(r.texto));
  ok('tiene el mensaje propio del buscador sin señal', /El buscador necesita internet/.test(r.texto));
  ok('la versión subió', /pesada-app-v18/.test(r.texto));

  /* ═══════════════════════════════════════════════════════════════════════
   * "PARA REVISAR": EL AVISO Y LA PANTALLA TIENEN QUE IR JUNTOS
   * -------------------------------------------------------------------------
   * El aviso de "sin regular de días anteriores" aparece en el resumen de
   * CUALQUIER código, pero las pantallas eran solo de GENERAL: el botón "Ver"
   * terminaba en "Sin permiso". Ahora las abre cualquiera, cada uno con lo suyo.
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Para revisar: el aviso lleva a una pantalla que se puede abrir');

  // Un camión de Quimili con la tara final de ayer y sin regular, y otro igual
  // en la otra balanza, que el código de Quimili no tiene que ver.
  meterTicket({
    patentes: 'SR 111 QU', chofer: 'Sin Regular Quimili', codigoIngreso: '5684',
    fecha: AYER, fechaTaraFinal: AYER, fechaRegulada: undefined,
    pesadaPara: 'CAMIONES', neto: 0, confirmada: false,
  });
  meterTicket({
    patentes: 'SR 222 AJ', chofer: 'Sin Regular Ajeno', codigoIngreso: '5679',
    campo: 'El Mataco - SACHAYOJ - SE',
    fecha: AYER, fechaTaraFinal: AYER, fechaRegulada: undefined,
    pesadaPara: 'CAMIONES', neto: 0, confirmada: false,
  });

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.9.3.1' });
  ok('entra el código de ver registros', r.estado === 200, r.texto.slice(0, 150));

  r = await ir('GET', '/app/general');
  const avisa = /sin regular de días anteriores/.test(r.texto);
  ok('el resumen avisa que hay camiones sin regular', avisa, r.estado);
  ok('y el aviso apunta a la pantalla', /\/app\/general\/sin-regular/.test(r.texto));

  r = await ir('GET', '/app/general/sin-regular');
  ok('la pantalla ABRE (antes decía "Sin permiso")',
    r.estado === 200 && !/Sin permiso/.test(r.texto), r.estado);
  ok('muestra el camión de su balanza', /SR 111 QU/.test(r.texto));
  ok('y NO el de la otra balanza', !/SR 222 AJ/.test(r.texto));

  r = await ir('GET', '/app/general/repetidos');
  ok('la de repetidos también abre', r.estado === 200 && !/Sin permiso/.test(r.texto), r.estado);
  ok('y tampoco muestra la otra balanza', !/Ajeno Total/.test(r.texto));

  // Los pedidos siguen siendo cosa de GENERAL: la bandeja es suya y él los
  // resuelve. Entonces el aviso también es suyo — al resto no se le muestra un
  // "Ver" que no puede abrir.
  await baseFalsa.collection('app_pedidos').insertOne({
    registroId: hoyQuimili._id, nro: hoyQuimili.nroApp, patentes: hoyQuimili.patentes,
    codigoIngreso: '5684', tipo: 'ANULACION', motivo: 'se cargó dos veces',
    pedidoPor: 'Mateo', estado: 'PENDIENTE', creadoEn: new Date(),
  });

  r = await ir('GET', '/app/general');
  ok('al que solo mira NO se le avisa de los pedidos',
    !/pedido de anulación/.test(r.texto), (r.texto.match(/\d+ pedidos? de [a-z]+/) || [''])[0]);
  ok('y por lo tanto no hay ningún "Ver" que no se pueda abrir',
    !/\/app\/general\/pedidos/.test(r.texto));

  r = await ir('GET', '/app/general/pedidos');
  ok('la bandeja sigue siendo solo de GENERAL', r.estado !== 200 || /Sin permiso/.test(r.texto), r.estado);

  // GENERAL sí ve todo.
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: VER_TODO }, { desde: '10.9.3.2' });
  r = await ir('GET', '/app/general');
  ok('a GENERAL sí se le avisa de los pedidos', /pedido de anulación/.test(r.texto), r.estado);
  ok('y el aviso lo lleva a la bandeja', /\/app\/general\/pedidos/.test(r.texto));

  r = await ir('GET', '/app/general/sin-regular');
  ok('GENERAL ve los sin regular de las dos balanzas',
    /SR 111 QU/.test(r.texto) && /SR 222 AJ/.test(r.texto), r.estado);
  r = await ir('GET', '/app/general/pedidos');
  ok('y su bandeja abre con los botones',
    r.estado === 200 && /se cargó dos veces/.test(r.texto) && /data-decidir="/.test(r.texto), r.estado);

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
