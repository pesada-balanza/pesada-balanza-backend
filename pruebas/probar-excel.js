'use strict';
/**
 * Exportar a Excel desde la app.
 *
 * Es el mismo archivo que da el botón "Exportar a Excel" de la web —las mismas
 * hojas, armadas por la misma función—, disponible ahora en el resumen del día:
 * para GENERAL y para los códigos que entran a ver los registros.
 *
 * Lo que más importa acá es el permiso: un código de ver registros tiene que
 * sacar SU balanza y nada más. Ya hubo un agujero de ese tipo (ver
 * probar-buscar.js), así que se comprueba abriendo el .xlsx y leyendo las filas,
 * no mirando el HTML.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = process.env.PORT || '3209';

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

const ExcelJS = require(path.join(PROY, 'node_modules', 'exceljs'));

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

/** Baja el .xlsx de verdad y lo abre, para leer lo que tiene adentro. */
async function bajarExcel(url) {
  const headers = { 'X-Forwarded-Proto': 'https' };
  const ck = cabeceraCookie();
  if (ck) headers.Cookie = ck;
  const res = await fetch(BASE + url, { headers, redirect: 'manual' });
  if (res.status !== 200) {
    return { estado: res.status, ubicacion: res.headers.get('location'), libro: null };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  return {
    estado: 200,
    tipo: res.headers.get('content-type') || '',
    nombre: res.headers.get('content-disposition') || '',
    bytes: buffer.length,
    libro,
  };
}

/** Los valores de una columna (por su encabezado) en una hoja. */
function columna(hoja, encabezado) {
  const fila1 = hoja.getRow(1);
  let col = 0;
  fila1.eachCell((celda, n) => { if (String(celda.value) === encabezado) col = n; });
  if (!col) return null;
  const valores = [];
  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const v = fila.getCell(col).value;
    valores.push(v);
  });
  return valores;
}

/** Las patentes de la hoja Registros, sin la fila del total. */
function patentesDe(libro) {
  const hoja = libro.getWorksheet('Registros');
  if (!hoja) return [];
  return (columna(hoja, 'Patentes') || []).filter((v) => v && String(v).trim() !== '');
}

function ok(nombre, condicion, extra) {
  pruebas++;
  if (condicion) console.log('  ✓ ' + nombre);
  else { fallos++; console.log('  ✗ ' + nombre + (extra ? '  →  ' + String(extra).slice(0, 400) : '')); }
}
function seccion(t) { console.log('\n── ' + t); }

const ymd = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => ymd(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
const HOY = haceDias(0);
const AYER = haceDias(1);

let proximo = 5000;
function meterTicket(extra) {
  const id = proximo++;
  const doc = Object.assign({
    _id: new ObjectId(),
    idTicket: id, nroApp: '1-' + id, origen: 'app', fecha: HOY,
    usuario: 'Juan Carlos Fantin', cargadoPor: 'Juan Carlos Fantin',
    pesadaPara: 'REGULADA', cargaPara: 'AMH', socio: '',
    transporte: 'ISIDORI JUAN WALTER', chofer: 'POGONZA MARTIN',
    patentes: 'RSN508 KSS684', campo: 'Quimili - QUIMILI - SE',
    grano: 'SOJA', lote: 'Lote Moriconi 2 y 3',
    brutoEstimado: 45000, tara: 14740, netoEstimado: 30260,
    brutoLote: 46060, bruto: 45000, neto: 30260, cp: '10134354744',
    cargoDe: 'SILOBOLSA', silobolsa: '18', contratista: '', tractor: '',
    comentarios: '', codigoIngreso: '5684',
    fechaTaraFinal: HOY, fechaRegulada: HOY, anulado: false,
    confirmada: true, modificaciones: 0, creadoEn: new Date(),
  }, extra || {});
  baseFalsa.collection('registros').docs.push(doc);
  return doc;
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  const QUIMILI = '5684';        // carga en Quimili
  const VER_QUIMILI = '1240';    // ve los registros de Quimili
  const GENERAL = '12341';

  // Quimili: dos de hoy y uno de ayer.
  meterTicket({ patentes: 'QUI 111 AA' });
  meterTicket({ patentes: 'QUI 222 BB', cargaPara: 'SOCIO', socio: 'PROVINVEST' });
  meterTicket({ patentes: 'QUI 333 CC', fecha: AYER, fechaTaraFinal: AYER, fechaRegulada: AYER });
  // Otra balanza, que el código de Quimili NO tiene que ver nunca.
  meterTicket({
    patentes: 'OTR 999 ZZ', codigoIngreso: '5679',
    campo: 'La Pradera - ARBOL BLANCO - SE',
  });
  // Un anulado: en la web sale con el neto en negativo.
  meterTicket({ patentes: 'ANU 000 UL', anulado: true, neto: 30260 });

  await baseFalsa.collection('app_dias').insertOne({ codigoIngreso: QUIMILI, fecha: HOY, nombre: 'Mateo' });

  /* ═══════════════════════════════════════════════════════════════════════
   * EL BOTÓN ESTÁ DONDE SE PIDIÓ
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El botón, abajo de "Buscar un ticket"');

  cookies = {};
  let r = await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.7.0.1' });
  ok('GENERAL entra', r.estado === 200, r.texto.slice(0, 150));

  r = await ir('GET', '/app/general');
  ok('el resumen de GENERAL trae el botón', /\/app\/excel\?desde=/.test(r.texto), r.estado);
  ok('está después de "Buscar un ticket"',
    r.texto.indexOf('/app/buscar') < r.texto.indexOf('/app/excel'));
  ok('y también el rango de fechas', /Exportar un rango de fechas/.test(r.texto));
  ok('el botón exporta el día que se está mirando',
    r.texto.indexOf('/app/excel?desde=' + HOY) !== -1, HOY);

  r = await ir('GET', '/app/general?fecha=' + AYER);
  ok('al moverse de día, el botón sigue al día mirado',
    r.texto.indexOf('/app/excel?desde=' + AYER) !== -1, AYER);

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.7.0.2' });
  ok('el código de ver registros entra', r.estado === 200, r.texto.slice(0, 150));
  r = await ir('GET', '/app/general');
  ok('y también tiene el botón', /\/app\/excel\?desde=/.test(r.texto), r.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * EL ARCHIVO: ES EL MISMO REPORTE DE LA WEB
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El archivo que baja');

  let ex = await bajarExcel('/app/excel?desde=' + HOY);
  ok('baja un archivo', ex.estado === 200, ex.estado);
  ok('es un xlsx', /spreadsheetml/.test(ex.tipo || ''), ex.tipo);
  ok('con el nombre y la fecha adentro',
    (ex.nombre || '').indexOf('registros-' + HOY + '.xlsx') !== -1, ex.nombre);
  ok('y pesa algo', ex.bytes > 3000, ex.bytes);

  const hojas = ex.libro.worksheets.map((h) => h.name);
  ok('trae la hoja Registros', hojas.indexOf('Registros') !== -1, hojas.join(' | '));
  ok('trae la hoja IMPRIMIR', hojas.indexOf('IMPRIMIR') !== -1, hojas.join(' | '));
  ok('trae la hoja Cargas SOCIO', hojas.indexOf('Cargas SOCIO') !== -1, hojas.join(' | '));
  ok('y una hoja por campo', hojas.some((n) => /Quimili/.test(n)), hojas.join(' | '));

  const registrosHoja = ex.libro.getWorksheet('Registros');
  const encabezados = [];
  registrosHoja.getRow(1).eachCell((c) => encabezados.push(String(c.value)));
  ok('las columnas son las de la web',
    encabezados.indexOf('ID Ticket') !== -1 && encabezados.indexOf('Bruto Regulado') !== -1 &&
    encabezados.indexOf('Neto') !== -1 && encabezados.indexOf('CP') !== -1 &&
    encabezados.indexOf('Bruto LOTE - Bruto Regulado') !== -1,
    encabezados.join(' | '));

  const netos = columna(registrosHoja, 'Neto') || [];
  ok('el anulado va con el neto en negativo, como en la web',
    netos.indexOf(-30260) !== -1, JSON.stringify(netos));
  ok('la hoja termina con el total de neto',
    (columna(registrosHoja, 'Patentes') || []).length < netos.length ||
      registrosHoja.getRow(registrosHoja.rowCount).values.some((v) => /TOTAL/i.test(String(v))),
    registrosHoja.getRow(registrosHoja.rowCount).values.join(' | '));

  /* ═══════════════════════════════════════════════════════════════════════
   * PERMISOS: CADA CÓDIGO EXPORTA LO QUE VE
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Cada código exporta solo su balanza');

  // Seguimos con el código de ver registros de Quimili
  ex = await bajarExcel('/app/excel?desde=' + HOY);
  let patentes = patentesDe(ex.libro).map(String);
  ok('el de Quimili saca sus tickets', patentes.indexOf('QUI 111 AA') !== -1, patentes.join(' | '));
  ok('y NO el de la otra balanza',
    patentes.indexOf('OTR 999 ZZ') === -1, patentes.join(' | '));
  ok('tampoco aparece en las hojas por campo',
    !ex.libro.worksheets.some((h) => /Pradera/.test(h.name)),
    ex.libro.worksheets.map((h) => h.name).join(' | '));

  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.7.0.3' });
  ex = await bajarExcel('/app/excel?desde=' + HOY);
  patentes = patentesDe(ex.libro).map(String);
  ok('GENERAL saca las dos balanzas',
    patentes.indexOf('QUI 111 AA') !== -1 && patentes.indexOf('OTR 999 ZZ') !== -1,
    patentes.join(' | '));

  // El código de la balanza (el que carga) también entra al resumen por /app/general?
  // No: va al patio. Pero la dirección del Excel no puede quedar abierta.
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: QUIMILI }, { desde: '10.7.0.4' });
  ex = await bajarExcel('/app/excel?desde=' + HOY);
  patentes = ex.libro ? patentesDe(ex.libro).map(String) : [];
  ok('el código de la balanza saca solo la suya',
    ex.estado === 200 && patentes.indexOf('OTR 999 ZZ') === -1, patentes.join(' | '));

  /* ═══════════════════════════════════════════════════════════════════════
   * EL RANGO DE FECHAS
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El rango de fechas');

  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.7.0.5' });

  ex = await bajarExcel('/app/excel?desde=' + HOY);
  patentes = patentesDe(ex.libro).map(String);
  ok('un solo día trae solo ese día', patentes.indexOf('QUI 333 CC') === -1, patentes.join(' | '));

  ex = await bajarExcel('/app/excel?desde=' + AYER + '&hasta=' + HOY);
  patentes = patentesDe(ex.libro).map(String);
  ok('el rango trae los dos días',
    patentes.indexOf('QUI 111 AA') !== -1 && patentes.indexOf('QUI 333 CC') !== -1,
    patentes.join(' | '));
  ok('y el nombre del archivo lo dice',
    (ex.nombre || '').indexOf('registros-' + AYER + '-a-' + HOY + '.xlsx') !== -1, ex.nombre);

  ex = await bajarExcel('/app/excel?desde=' + HOY + '&hasta=' + AYER);
  patentes = patentesDe(ex.libro).map(String);
  ok('un rango al revés se da vuelta en vez de venir vacío',
    patentes.indexOf('QUI 333 CC') !== -1, patentes.join(' | '));

  ex = await bajarExcel('/app/excel?desde=cualquier-cosa');
  ok('una fecha inventada cae en hoy, no falla', ex.estado === 200, ex.estado);

  ex = await bajarExcel('/app/excel?desde=1999-01-01&hasta=1999-01-02');
  ok('un rango sin registros baja igual, vacío',
    ex.estado === 200 && patentesDe(ex.libro).length === 0, ex.estado);

  /* ═══════════════════════════════════════════════════════════════════════
   * SIN SESIÓN
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Sin sesión');
  cookies = {};
  ex = await bajarExcel('/app/excel?desde=' + HOY);
  ok('sin código no se baja nada',
    ex.estado === 302 && ex.ubicacion === '/app/ingreso', ex.estado + ' ' + ex.ubicacion);

  /* ═══════════════════════════════════════════════════════════════════════
   * LA WEB SIGUE IGUAL
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('La web no se tocó');

  // El /export de la web usa su propia sesión: se entra como siempre.
  cookies = {};
  const login = await fetch(BASE + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-For': '10.7.0.9',
    },
    body: 'code=' + VER_QUIMILI + '&redirect=/tabla',
    redirect: 'manual',
  });
  guardarCookies(login);
  ok('se entra a la web con el código de observación',
    login.status === 302 && login.headers.get('location') === '/tabla',
    login.status + ' ' + login.headers.get('location'));

  const exWeb = await bajarExcel('/export?from=' + HOY + '&to=' + HOY);
  ok('el botón de la web sigue bajando su Excel', exWeb.estado === 200, exWeb.estado);
  if (exWeb.libro) {
    const hojasWeb = exWeb.libro.worksheets.map((h) => h.name);
    ok('con las mismas hojas que antes',
      hojasWeb.indexOf('Registros') !== -1 && hojasWeb.indexOf('IMPRIMIR') !== -1 &&
      hojasWeb.indexOf('Cargas SOCIO') !== -1, hojasWeb.join(' | '));
    const pWeb = patentesDe(exWeb.libro).map(String);
    ok('y sigue respetando el permiso por balanza',
      pWeb.indexOf('QUI 111 AA') !== -1 && pWeb.indexOf('OTR 999 ZZ') === -1, pWeb.join(' | '));
  }

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
