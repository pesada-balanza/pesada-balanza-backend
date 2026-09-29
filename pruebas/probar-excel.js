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
/** dd/mm/aaaa, como lo escribe el encabezado del Excel de "Ver datos". */
const fechaLarga = (f) => String(f).split('-').reverse().join('/');
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
  // Tipeado mal y con un nombre que nunca estuvo en la lista: los dos tienen
  // que salir con el socio de la lista, o la hoja "Cargas SOCIO" se filtra en
  // pedazos igual que antes.
  meterTicket({ patentes: 'QUI 444 DD', cargaPara: 'SOCIO', socio: 'PROVOINVEST' });
  meterTicket({ patentes: 'QUI 555 EE', cargaPara: 'SOCIO', socio: 'ESTABLECIMIENTO DOBLE CERO' });
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
  ok('el resumen de GENERAL trae el botón', /id="abrir-excel"/.test(r.texto), r.estado);
  ok('está después de "Buscar un ticket"',
    r.texto.indexOf('/app/buscar') < r.texto.indexOf('abrir-excel'));
  ok('es un solo botón: no hay uno aparte para el rango',
    !/Exportar un rango de fechas/.test(r.texto));
  ok('y abre el desde–hasta', /id="caja-excel"/.test(r.texto) && /id="ex-desde"/.test(r.texto));
  ok('las fechas vienen puestas en el día que se está mirando',
    (r.texto.match(new RegExp('id="ex-desde" value="' + HOY + '"')) || []).length === 1, HOY);

  // El error del iPhone: con la app agregada a la pantalla de inicio, un enlace
  // común a un archivo la reemplaza por la vista previa y hay que cerrarla para
  // volver. El archivo se baja a memoria y se entrega; no se navega nunca.
  ok('NO hay un enlace que navegue al archivo',
    !/href="\/app\/excel/.test(r.texto), (r.texto.match(/href="\/app\/excel[^"]*"/) || [''])[0]);
  ok('el archivo lo entrega App.compartir', /App\.compartir\(/.test(r.texto));

  r = await ir('GET', '/app/general?fecha=' + AYER);
  ok('al moverse de día, las fechas siguen al día mirado',
    (r.texto.match(new RegExp('id="ex-desde" value="' + AYER + '"')) || []).length === 1, AYER);

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.7.0.2' });
  ok('el código de ver registros entra', r.estado === 200, r.texto.slice(0, 150));
  r = await ir('GET', '/app/general');
  ok('y también tiene el botón', /id="abrir-excel"/.test(r.texto), r.estado);

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

  /* El socio sale con el nombre de la lista, no como lo tipeó el balancero:
     "PROVINVEST" y "PROVOINVEST" son ProvInvest, y "ESTABLECIMIENTO DOBLE CERO"
     es Fermanelli. Si no, esta hoja se filtra en pedazos. */
  const hojaSocio = ex.libro.getWorksheet('Cargas SOCIO');
  const colSocio = (hojaSocio.getRow(1).values || []).indexOf('Socio');
  const socios = [];
  hojaSocio.eachRow((fila, i) => { if (i > 1) socios.push(String(fila.getCell(colSocio).value || '')); });
  ok('el socio sale con el nombre de la lista',
    socios.indexOf('ProvInvest') !== -1 && socios.indexOf('Fermanelli') !== -1, socios.join(' | '));
  ok('y no como se tipeó',
    !socios.some((x) => /PROVINVEST|PROVOINVEST|DOBLE CERO/.test(x)), socios.join(' | '));
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
   * EL EXCEL DE "VER DATOS"
   *
   * Es otro archivo y otro botón: baja lo que se está mirando en la pantalla
   * de datos —con sus cortes y sus filtros encadenados—, no el listado de
   * registros. Lo que más importa es que sume EXACTAMENTE lo mismo que la
   * pantalla de la que salió: si no, no hay forma de saber cuál de los dos
   * miente. Por eso los dos salen de la misma función, `armarDatos`.
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('El Excel de "Ver datos"');

  // Día propio, para no mover los totales que se comprueban más arriba.
  const DIA_VD = haceDias(3);
  const vd = (extra) => meterTicket(Object.assign(
    { fecha: DIA_VD, fechaTaraFinal: DIA_VD, fechaRegulada: DIA_VD, grano: 'MAIZ' }, extra));
  // Un viaje que salió de DOS bolsas: es el caso que la hoja de detalle tiene
  // que dejar claro, porque ocupa dos renglones con un solo neto.
  vd({ patentes: 'VD 001 AA', lote: 'Lote 5', neto: 31200,
    cargoDe: 'SILOBOLSA', silobolsa: '17 · 16',
    silobolsas: [{ nro: '17', kg: 20000 }, { nro: '16', kg: 11200 }] });
  vd({ patentes: 'VD 002 BB', lote: 'Lote 5', neto: 30000,
    cargoDe: 'SILOBOLSA', silobolsa: '17', silobolsas: [{ nro: '17', kg: 30000 }] });
  // De otra balanza: el código de Quimili no lo tiene que sacar nunca.
  vd({ patentes: 'VD 003 CC', neto: 50000, codigoIngreso: '5679',
    campo: 'La Pradera - ARBOL BLANCO - SE' });

  cookies = {};
  r = await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.7.1.1' });
  ok('el código de ver registros entra', r.estado === 200, r.texto.slice(0, 150));

  const unDia = 'desde=' + DIA_VD + '&hasta=' + DIA_VD;
  const cortesVD = '&corte=grano&corte=silobolsa';
  const filtroMaiz = '&f=' + encodeURIComponent('grano:MAIZ');

  r = await ir('GET', '/app/datos?' + unDia + cortesVD + filtroMaiz);
  ok('la pantalla de datos ofrece el botón', /id="abrir-excel"/.test(r.texto), r.estado);
  ok('está entre los cortes y la lista, no al pie',
    r.texto.indexOf('Sumar otro corte') < r.texto.indexOf('abrir-excel') &&
    r.texto.indexOf('abrir-excel') < r.texto.indexOf('Por grano'),
    r.texto.indexOf('Sumar otro corte') + ' / ' + r.texto.indexOf('abrir-excel') +
    ' / ' + r.texto.indexOf('Por grano'));
  ok('avisa que vienen las dos hojas', /Hoja <b>Datos<\/b>/.test(r.texto) && /Hoja <b>Tickets<\/b>/.test(r.texto));
  // El error del iPhone otra vez: un enlace a un archivo reemplaza la app.
  ok('NO hay un enlace que navegue al archivo',
    !/href="\/app\/datos\/excel/.test(r.texto), (r.texto.match(/href="\/app\/datos\/excel[^"]*"/) || [''])[0]);
  ok('el archivo lo entrega App.compartir', /App\.compartir\(/.test(r.texto));
  // 20.000 + 11.200 + 30.000 = 61.200. El de la otra balanza no entra.
  ok('la pantalla suma 61.200', /61\.200/.test(r.texto), (r.texto.match(/dato-xg">[^<]*/) || [''])[0]);
  ok('y no sacó el de la otra balanza', !/111\.200/.test(r.texto));

  // Sin renglones no hay nada que exportar: el botón no se dibuja.
  const rVacio = await ir('GET', '/app/datos?desde=1999-01-01&hasta=1999-01-02&corte=grano');
  ok('sin renglones no aparece el botón', !/id="abrir-excel"/.test(rVacio.texto), rVacio.estado);

  ex = await bajarExcel('/app/datos/excel?' + unDia + cortesVD + filtroMaiz);
  ok('el archivo baja', ex.estado === 200, ex.estado);
  const hojasVD = ex.libro ? ex.libro.worksheets.map((h) => h.name) : [];
  ok('trae las hojas Datos y Tickets',
    hojasVD.indexOf('Datos') !== -1 && hojasVD.indexOf('Tickets') !== -1, hojasVD.join(' | '));

  if (ex.libro && ex.libro.getWorksheet('Datos')) {
    const hd = ex.libro.getWorksheet('Datos');
    const titulos = (hd.getRow(8).values || []).slice(1).map(String);
    ok('una columna por corte, no el texto pegado con "·"',
      titulos[0] === 'Grano' && titulos[1] === 'Silobolsa', titulos.join(' | '));
    ok('y las columnas de números al lado',
      titulos.indexOf('Neto (kg)') !== -1 && titulos.indexOf('Neto (t)') !== -1 &&
      titulos.indexOf('%') !== -1 && titulos.indexOf('Último registro') !== -1, titulos.join(' | '));
    ok('el encabezado deja escrito el filtro aplicado',
      String(hd.getCell('B4').value).indexOf('Grano: MAIZ') !== -1, hd.getCell('B4').value);
    ok('y el período', String(hd.getCell('B2').value).indexOf(DIA_VD.slice(8)) !== -1, hd.getCell('B2').value);

    // Los renglones, sin el encabezado ni la fila TOTAL ni los avisos del pie.
    const colNeto = titulos.indexOf('Neto (kg)') + 1;
    const cuerpo = [];
    hd.eachRow((fila, n) => {
      if (n <= 8) return;
      const v = fila.getCell(colNeto).value;
      if (typeof v === 'number') cuerpo.push({ n, clave: String(fila.getCell(2).value), kg: v });
    });
    const renglones = cuerpo.filter((f) => String(hd.getRow(f.n).getCell(1).value) !== 'TOTAL');
    const filaTot = cuerpo.find((f) => String(hd.getRow(f.n).getCell(1).value) === 'TOTAL');
    ok('el total del archivo es el mismo que el de la pantalla',
      filaTot && filaTot.kg === 61200, filaTot ? filaTot.kg : '(sin fila TOTAL)');
    ok('y los renglones suman ese total',
      renglones.reduce((a, f) => a + f.kg, 0) === 61200,
      renglones.map((f) => f.clave + '=' + f.kg).join(' | '));
    ok('cada bolsa se lleva SUS kg, no la mitad del viaje',
      renglones.some((f) => /^17/.test(f.clave) && f.kg === 50000) &&
      renglones.some((f) => /^16/.test(f.clave) && f.kg === 11200),
      renglones.map((f) => f.clave + '=' + f.kg).join(' | '));
    ok('el de la otra balanza no está', !renglones.some((f) => f.kg === 50000 && /Pradera/.test(f.clave)));
    ok('avisa en la hoja cómo leer la columna Camiones',
      /suma de la columna puede dar más/.test(JSON.stringify(hd.getSheetValues())));
  }

  if (ex.libro && ex.libro.getWorksheet('Tickets')) {
    const ht = ex.libro.getWorksheet('Tickets');
    const patentesDet = (columna(ht, 'Patentes') || []).map(String);
    ok('el viaje de dos bolsas ocupa dos renglones',
      patentesDet.filter((p) => p === 'VD 001 AA').length === 2, patentesDet.join(' | '));
    const kgDet = columna(ht, 'kg del renglón').filter((v) => typeof v === 'number');
    ok('la hoja de detalle suma lo mismo que la de arriba',
      kgDet.reduce((a, b) => a + b, 0) === 61200, kgDet.join(' + '));
    const netos = columna(ht, 'Neto del viaje').filter((v) => typeof v === 'number');
    ok('el neto del viaje va repetido al lado, sin sumarse dos veces',
      netos.filter((v) => v === 31200).length === 2 &&
      kgDet.indexOf(20000) !== -1 && kgDet.indexOf(11200) !== -1,
      'netos: ' + netos.join(' | ') + '  ·  kg: ' + kgDet.join(' | '));
    ok('y la otra balanza tampoco aparece acá', patentesDet.indexOf('VD 003 CC') === -1);
  }

  /* El nombre: se acumulan en Descargas, así que tiene que decir de qué es sin
     abrirlo. El campo va por su nombre corto, no con el establecimiento y la
     provincia pegados atrás. */
  ok('el nombre lleva la fecha y el filtro',
    ex.nombre.indexOf('VerDatos-' + DIA_VD.slice(2) + '-maiz.xlsx') !== -1, ex.nombre);

  const exDos = await bajarExcel('/app/datos/excel?' + unDia + cortesVD + filtroMaiz +
    '&f=' + encodeURIComponent('campo:Quimili - QUIMILI - SE'));
  ok('con dos filtros, los dos van en el nombre',
    exDos.nombre.indexOf('-maiz-quimili.xlsx') !== -1, exDos.nombre);

  const exRango = await bajarExcel('/app/datos/excel?desde=' + DIA_VD + '&hasta=' + HOY + cortesVD + filtroMaiz);
  ok('un rango de varios días lo dice en el nombre',
    exRango.estado === 200 && /VerDatos-\d\d-\d\d-\d\d-al-[\d-]+-maiz\.xlsx/.test(exRango.nombre),
    exRango.nombre);

  const exSinFiltro = await bajarExcel('/app/datos/excel?' + unDia + '&corte=grano');
  ok('sin filtros el nombre es solo la fecha',
    exSinFiltro.nombre.indexOf('VerDatos-' + DIA_VD.slice(2) + '.xlsx') !== -1, exSinFiltro.nombre);

  // El permiso, que es donde esta clase de pantalla ya se nos escapó una vez.
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: GENERAL }, { desde: '10.7.1.2' });
  const exGen = await bajarExcel('/app/datos/excel?' + unDia + cortesVD + filtroMaiz);
  const hojaGen = exGen.libro && exGen.libro.getWorksheet('Tickets');
  ok('GENERAL sí saca las dos balanzas',
    hojaGen && (columna(hojaGen, 'Patentes') || []).map(String).indexOf('VD 003 CC') !== -1,
    hojaGen ? (columna(hojaGen, 'Patentes') || []).join(' | ') : exGen.estado);

  // Un corte inventado y un filtro roto no pueden tirar abajo la descarga.
  const exRaro = await bajarExcel('/app/datos/excel?' + unDia + '&corte=inventado&f=sinDosPuntos');
  ok('un corte inventado no rompe el archivo', exRaro.estado === 200, exRaro.estado);

  /* ── El botón pide LO QUE SE ESTÁ MIRANDO ────────────────────────────────
   *
   * Acá se nos escapó una vez: la dirección del archivo se armaba a mano con
   * `<%= %>`, que escapa cada "&" a "&amp;". Adentro de un <script> el
   * navegador NO deshace las entidades, así que el pedido salía con los
   * parámetros llamados "amp;desde", "amp;hasta", "amp;corte" y el servidor
   * los ignoraba: el archivo venía del día de hoy, sin cortes ni filtros.
   *
   * Las pruebas de arriba no lo agarraron porque pegaban contra la ruta con
   * una dirección limpia, que es lo único que la ruta ve. El agujero estaba en
   * la PANTALLA. Por eso ahora se comprueba también de ese lado. */
  cookies = {};
  await ir('POST', '/app/api/ingreso', { code: VER_QUIMILI }, { desde: '10.7.1.3' });

  const variosDias = 'desde=' + DIA_VD + '&hasta=' + HOY + cortesVD + filtroMaiz;
  r = await ir('GET', '/app/datos?' + variosDias);
  const scripts = (r.texto.match(/<script[\s\S]*?<\/script>/g) || []).join('\n');
  ok('la pantalla no deja direcciones con &amp; adentro del <script>',
    scripts.indexOf('&amp;') === -1,
    (scripts.match(/[^\s'"]*&amp;[^\s'"]*/) || [''])[0]);
  ok('el botón pide la MISMA dirección con la que se pidió la pantalla',
    /window\.location\.search/.test(r.texto), '(no usa location.search)');

  // Y de punta a punta: el archivo de esa dirección tiene que decir lo mismo
  // que la pantalla, con varios días, dos cortes y un filtro puestos.
  const totalPantalla = ((r.texto.match(/dato-xg">([^<]*)/) || [])[1] || '').replace(/\./g, '');
  const exIgual = await bajarExcel('/app/datos/excel?' + variosDias);
  const hojaIgual = exIgual.libro && exIgual.libro.getWorksheet('Datos');
  ok('y ese archivo trae los mismos días, no solo hoy',
    hojaIgual && String(hojaIgual.getCell('B2').value).indexOf(fechaLarga(DIA_VD)) !== -1,
    hojaIgual ? hojaIgual.getCell('B2').value : exIgual.estado);
  ok('con los mismos cortes',
    hojaIgual && String(hojaIgual.getCell('B5').value) === 'Grano · Silobolsa',
    hojaIgual ? hojaIgual.getCell('B5').value : '');
  ok('con el mismo filtro',
    hojaIgual && String(hojaIgual.getCell('B4').value).indexOf('Grano: MAIZ') !== -1,
    hojaIgual ? hojaIgual.getCell('B4').value : '');
  ok('y con el mismo total que la pantalla',
    hojaIgual && String(hojaIgual.getCell('B6').value) === totalPantalla,
    (hojaIgual ? hojaIgual.getCell('B6').value : '?') + ' vs ' + totalPantalla);

  // El service worker no lo puede guardar: es un archivo y cambia todo el día.
  r = await ir('GET', '/app/sw.js');
  ok('el service worker no guarda /app/datos/excel', /'\/app\/datos\/excel'/.test(r.texto));

  /* ═══════════════════════════════════════════════════════════════════════
   * SIN SESIÓN
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('Sin sesión');
  cookies = {};
  ex = await bajarExcel('/app/excel?desde=' + HOY);
  ok('sin código no se baja nada',
    ex.estado === 302 && ex.ubicacion === '/app/ingreso', ex.estado + ' ' + ex.ubicacion);

  ex = await bajarExcel('/app/datos/excel?desde=' + HOY + '&corte=grano');
  ok('el de "Ver datos" tampoco',
    ex.estado === 302 && ex.ubicacion === '/app/ingreso', ex.estado + ' ' + ex.ubicacion);

  /* ═══════════════════════════════════════════════════════════════════════
   * LA WEB SIGUE IGUAL
   * ═════════════════════════════════════════════════════════════════════ */
  seccion('La web anterior: cerrada, y su Excel intacto si se reabre');

  // Cerrada, no entra nadie: ni el código de mirar ni el de GENERAL.
  cookies = {};
  for (const code of [VER_QUIMILI, GENERAL]) {
    const r2 = await fetch(BASE + '/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': '10.7.9.' + code.slice(-1),
      },
      body: 'code=' + code + '&redirect=/tabla',
      redirect: 'manual',
    });
    ok('la web anterior no deja entrar con ' + code, r2.status === 410, r2.status);
  }
  const exCerrado = await bajarExcel('/export');
  ok('y su Excel tampoco se baja', exCerrado.estado === 410, exCerrado.estado);

  // Se abre a mano para comprobar que el refactor no la rompió: el día que se
  // reabra, su Excel tiene que dar lo mismo que antes.
  process.env.WEB_ANTERIOR = '1';

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
  delete process.env.WEB_ANTERIOR;

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR EN LA PRUEBA:', e);
  process.exit(1);
});
