'use strict';
/**
 * El reporte por email de las 19 hs.
 *
 * Lo que importa acá es que la hoja nueva de ACUMULADO DE CAMPAÑA sume bien y,
 * sobre todo, que **no pueda romper el reporte de todos los días**: si el
 * acumulado falla, el Excel se tiene que mandar igual con sus hojas de siempre.
 *
 * La prueba abre el Excel generado y lee las celdas: no se fía de que el código
 * "parezca" correcto.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
process.env.APP_MOVIL = '1';
process.env.PORT = '3195';
// Campaña fija, para que la prueba dé lo mismo cualquier día del año.
process.env.CAMPANA_DESDE = '2025-09-01';
// Datos de email de mentira: hacen falta para que el reporte se arme, pero
// nodemailer está reemplazado más abajo y nunca se manda nada.
process.env.EMAIL_USER = 'prueba@ejemplo.local';
process.env.EMAIL_PASS = 'no-es-real';
process.env.EMAIL_TO = 'destino@ejemplo.local';

const { BaseFalsa } = require('./doble-mongo');
const baseFalsa = new BaseFalsa();

const session = require(path.join(PROY, 'node_modules', 'express-session'));
const rutaCM = require.resolve(path.join(PROY, 'node_modules', 'connect-mongo'));
require.cache[rutaCM] = { id: rutaCM, filename: rutaCM, loaded: true, exports: { create: () => new session.MemoryStore() } };

const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

// nodemailer: nunca se manda un mail de verdad. Se guarda lo que se hubiera
// mandado, para poder revisarlo. Se reemplaza ANTES de cargar notificaciones.js,
// que toma su nodemailer al cargarse: así también se puede revisar el cuerpo de
// los avisos que manda ese módulo.
const rutaMailer = require.resolve(path.join(PROY, 'node_modules', 'nodemailer'));
const enviados = [];
require.cache[rutaMailer] = {
  id: rutaMailer, filename: rutaMailer, loaded: true,
  exports: {
    createTransport: () => ({
      sendMail: async (msj) => { enviados.push(msj); return { messageId: 'de-prueba' }; },
    }),
  },
};

// notificaciones.js se carga de verdad (para poder probar cómo arma los avisos),
// pero app.js recibe una versión que no manda nada, así que los tickets de las
// otras pruebas no ensucian la lista.
const rutaNotif = require.resolve(path.join(PROY, 'notificaciones.js'));
const notificaciones = require(rutaNotif);
require.cache[rutaNotif].exports = {
  resolverNombreCodigo: notificaciones.resolverNombreCodigo,
  notificar: () => {},
};

const app = require(path.join(PROY, 'app.js'));
const ExcelJS = require(path.join(PROY, 'node_modules', 'exceljs'));

let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().split('T')[0];

/** Los datos de prueba: dos campañas, para comprobar que el corte funciona. */
async function sembrarDatos() {
  const col = baseFalsa.collection('registros');
  const hoy = ymd(new Date());
  const ayer = ymd(new Date(Date.now() - 24 * 60 * 60 * 1000));
  let id = 1;

  const reg = (extra) => col.insertOne(Object.assign({
    idTicket: id++, usuario: 'Juan Sosa', cargaPara: 'AMH', socio: '',
    transporte: 'Ciriaci', patentes: 'AA ' + id + ' ZZ', chofer: 'Chofer',
    anulado: false, modificaciones: 0, confirmada: true, codigoIngreso: '5679',
  }, extra));

  // ── Campaña en curso (desde 2025-09-01) ──
  // El Mataco / Lote 1 / SOJA: dos tickets → 30.000 + 20.000 = 50.000
  await reg({ fecha: '2026-05-10', pesadaPara: 'REGULADA', campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'], neto: 30000 });
  await reg({ fecha: ayer,         pesadaPara: 'REGULADA', campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'], neto: 20000 });
  // El Mataco / Lote 2 / MAIZ: 15.000
  await reg({ fecha: hoy,          pesadaPara: 'REGULADA', campo: 'El Mataco - SACHAYOJ - SE', grano: 'MAIZ', lote: ['Lote 2'], neto: 15000 });
  // Carga mezclada de dos lotes: NO se reparte, va como "Lote 3 + Lote 4"
  await reg({ fecha: hoy,          pesadaPara: 'REGULADA', campo: 'Panuncio - ARBOL BLANCO - SE', grano: 'SOJA', lote: ['Lote 3', 'Lote 4'], neto: 25000 });

  // ── Cosas que NO tienen que sumar ──
  // anulado
  await reg({ fecha: hoy, pesadaPara: 'REGULADA', campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'], neto: 99000, anulado: true });
  // todavía sin regulada (camión abierto)
  await reg({ fecha: hoy, pesadaPara: 'CAMIONES', campo: 'El Mataco - SACHAYOJ - SE', brutoEstimado: 52500, tara: 0, netoEstimado: 52500 });
  // campaña anterior (antes del 1-9-2025)
  await reg({ fecha: '2025-06-15', pesadaPara: 'REGULADA', campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: ['Lote 1'], neto: 77000 });

  return { hoy, ayer };
}

/** Lee una hoja del Excel como matriz de valores simples. */
function celdas(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: true }, (fila) => {
    const f = [];
    fila.eachCell({ includeEmpty: true }, (c) => {
      let v = c.value;
      if (v && typeof v === 'object' && 'result' in v) v = v.result;   // fórmulas
      f.push(v === null || v === undefined ? '' : v);
    });
    out.push(f);
  });
  return out;
}

async function main() {
  await esperar(1000);
  await sembrarDatos();

  console.log('\n── El reporte se manda y trae la hoja nueva');
  await app.enviarReporteDiario();
  ok('se mandó un mail', enviados.length === 1, enviados.length);
  const mail = enviados[0];
  ok('con el Excel adjunto', !!(mail && mail.attachments && mail.attachments[0]), JSON.stringify(Object.keys(mail || {})));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(mail.attachments[0].content);
  const hojas = wb.worksheets.map((w) => w.name);
  console.log('     hojas: ' + hojas.join(' · '));

  ok('siguen estando las hojas de siempre',
    hojas.includes('Registros') && hojas.includes('IMPRIMIR') && hojas.includes('Cargas SOCIO'),
    hojas.join(', '));
  ok('y se agregó "Acumulado campaña"', hojas.includes('Acumulado campaña'), hojas.join(', '));
  ok('y también "Todos los registros"', hojas.includes('Todos los registros'), hojas.join(', '));

  /* ═══════════════════════════════════════════════════════════════════════
   * LA HOJA CON TODOS LOS REGISTROS DESDE EL 1-4-2026
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Todos los registros desde el 1-4-2026');
  ok('la fecha de corte por defecto es el 1 de abril de 2026',
    app.desdeRegistros() === '2026-04-01', app.desdeRegistros());

  const wsTodos = wb.getWorksheet('Todos los registros');
  const mTodos = celdas(wsTodos);
  const textoTodos = mTodos.map((f) => f.join(' | ')).join('\n');

  ok('tiene las mismas columnas que la hoja del día',
    mTodos[0].join('|') === celdas(wb.getWorksheet('Registros'))[0].join('|'),
    JSON.stringify(mTodos[0].slice(0, 5)));

  // Filas de datos: sin el encabezado ni la fila de TOTAL
  const filasTodos = mTodos.filter((f, i) =>
    i > 0 && String(f[0]) !== 'TOTAL Neto (toneladas)' && f[0] !== '');
  ok('trae los 6 tickets desde el 1-4-2026', filasTodos.length === 6, filasTodos.length + ' → ' + textoTodos.slice(0, 200));

  ok('incluye uno de mayo, que NO está en la hoja del día',
    /2026-05-10/.test(textoTodos) && !/2026-05-10/.test(celdas(wb.getWorksheet('Registros')).map((f) => f.join(' ')).join('\n')));
  ok('deja afuera el de junio de 2025', !/2025-06-15/.test(textoTodos));

  ok('incluye los anulados, con su marca', /ANULADO/.test(textoTodos), textoTodos.slice(0, 200));
  ok('y a los anulados les pone el neto en negativo, como la hoja del día',
    filasTodos.some((f) => f.includes('ANULADO') && f.some((v) => v === -99000)),
    JSON.stringify(filasTodos.find((f) => f.includes('ANULADO')) || []));

  ok('también trae la fila de TOTAL Neto',
    mTodos.some((f) => String(f[0]) === 'TOTAL Neto (toneladas)'), JSON.stringify(mTodos[mTodos.length - 1]));

  ok('el cuerpo del mail nombra la hoja y cuántos tickets trae',
    /Todos los registros/.test(mail.html) && /6 tickets cargados desde el 2026-04-01/.test(mail.html),
    (mail.html.match(/Todos los registros[^<]*/) || [''])[0]);

  console.log('\n── El acumulado suma lo que corresponde');
  const ws = wb.getWorksheet('Acumulado campaña');
  const m = celdas(ws);
  const texto = m.map((f) => f.join(' | ')).join('\n');

  ok('dice de qué campaña es', /ACUMULADO DE CAMPAÑA 25\/26/.test(String(m[0][0])), String(m[0][0]));
  ok('dice desde cuándo cuenta', /2025-09-01/.test(String(m[1][0])), String(m[1][0]));

  // 30.000 + 20.000 + 15.000 + 25.000 = 90.000 kg = 90 t
  const filaTotalArriba = m[2];
  ok('el total de arriba está en toneladas y da 90',
    Number(filaTotalArriba[4]) === 90, JSON.stringify(filaTotalArriba));
  ok('cuenta 4 tickets con regulada cerrada',
    /4 tickets con regulada cerrada/.test(String(filaTotalArriba[0])), String(filaTotalArriba[0]));

  // Detalle por lote
  const detalle = m.filter((f) => f[0] === 'El Mataco - SACHAYOJ - SE' || f[0] === 'Panuncio - ARBOL BLANCO - SE');
  const buscar = (campo, lote) => detalle.find((f) => f[0] === campo && f[1] === lote);

  const mataco1 = buscar('El Mataco - SACHAYOJ - SE', 'Lote 1');
  ok('El Mataco / Lote 1 junta los dos tickets: 50.000 kg',
    mataco1 && Number(mataco1[3]) === 2 && Number(mataco1[4]) === 50000, JSON.stringify(mataco1));
  ok('y lo muestra también en toneladas (50)', mataco1 && Number(mataco1[5]) === 50, JSON.stringify(mataco1));

  const mataco2 = buscar('El Mataco - SACHAYOJ - SE', 'Lote 2');
  ok('El Mataco / Lote 2 (MAIZ): 15.000 kg',
    mataco2 && mataco2[2] === 'MAIZ' && Number(mataco2[4]) === 15000, JSON.stringify(mataco2));

  const mezcla = buscar('Panuncio - ARBOL BLANCO - SE', 'Lote 3 + Lote 4');
  ok('una carga de dos lotes NO se reparte: figura como "Lote 3 + Lote 4"',
    mezcla && Number(mezcla[4]) === 25000, JSON.stringify(mezcla));

  ok('el ticket ANULADO no suma (no aparecen 99.000)', texto.indexOf('99000') === -1);
  ok('el camión sin regulada no suma (no aparecen 52.500)', texto.indexOf('52500') === -1);
  ok('la campaña anterior no suma (no aparecen 77.000)', texto.indexOf('77000') === -1);

  const filaTotal = m.find((f) => f[0] === 'TOTAL');
  ok('la fila TOTAL del detalle da 90.000 kg', filaTotal && Number(filaTotal[4]) === 90000, JSON.stringify(filaTotal));
  ok('y 90 toneladas', filaTotal && Number(filaTotal[5]) === 90, JSON.stringify(filaTotal));

  console.log('\n── El resumen por grano');
  const iGrano = m.findIndex((f) => f[0] === 'Por grano');
  ok('hay un bloque "Por grano"', iGrano !== -1);
  const granos = {};
  for (let i = iGrano + 1; i < m.length; i++) {
    if (!m[i][0]) continue;
    granos[String(m[i][0])] = Number(m[i][4]);
  }
  // SOJA: 30.000 + 20.000 + 25.000 = 75.000 · MAIZ: 15.000
  ok('SOJA acumula 75.000 kg', granos.SOJA === 75000, JSON.stringify(granos));
  ok('MAIZ acumula 15.000 kg', granos.MAIZ === 15000, JSON.stringify(granos));

  console.log('\n── El cuerpo del mail adelanta el acumulado');
  ok('el mail dice las toneladas de la campaña', /90,000 toneladas|90\.000 toneladas/.test(mail.html),
    (mail.html.match(/Acumulado[^<]*/) || [''])[0]);
  ok('y nombra la campaña 25/26', /25\/26/.test(mail.html));

  console.log('\n── Las hojas de siempre no se tocaron');
  const wsReg = wb.getWorksheet('Registros');
  const mReg = celdas(wsReg);
  ok('la hoja Registros conserva su encabezado', mReg[0][0] === 'ID Ticket', JSON.stringify(mReg[0].slice(0, 4)));
  ok('y su fila de TOTAL Neto (toneladas)',
    mReg.some((f) => String(f[0]) === 'TOTAL Neto (toneladas)'), JSON.stringify(mReg[mReg.length - 1]));
  ok('la hoja Registros NO tiene el título del acumulado',
    !mReg.some((f) => /ACUMULADO DE CAMPAÑA/.test(String(f[0]))));

  /* ═══════════════════════════════════════════════════════════════════════
   * LO MÁS IMPORTANTE: si el acumulado falla, el reporte se manda igual
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Si el acumulado falla, el reporte sale igual');
  const findReal = baseFalsa.collection('registros').find.bind(baseFalsa.collection('registros'));
  let vueltas = 0;
  baseFalsa.collection('registros').find = function (filtro, opciones) {
    // Solo se rompe la consulta del acumulado (la que filtra por pesadaPara
    // REGULADA con rango de fechas), no la del reporte diario.
    vueltas++;
    if (filtro && filtro.pesadaPara === 'REGULADA' && filtro.fecha && filtro.fecha.$gte) {
      throw new Error('falla a propósito');
    }
    return findReal(filtro, opciones);
  };

  enviados.length = 0;
  await app.enviarReporteDiario();
  baseFalsa.collection('registros').find = findReal;

  ok('se intentó armar el acumulado', vueltas > 0, vueltas);
  ok('el mail se mandó igual', enviados.length === 1, enviados.length);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(enviados[0].attachments[0].content);
  const hojas2 = wb2.worksheets.map((w) => w.name);
  ok('con las hojas de siempre completas',
    hojas2.includes('Registros') && hojas2.includes('IMPRIMIR') && hojas2.includes('Cargas SOCIO'),
    hojas2.join(', '));
  ok('sin la hoja del acumulado (falló, y se avisó por consola)',
    !hojas2.includes('Acumulado campaña'), hojas2.join(', '));
  ok('y el cuerpo del mail no habla de la campaña', !/Acumulado de la campaña/.test(enviados[0].html));
  // Las dos hojas extra son independientes: que falle una no se lleva la otra.
  ok('pero la hoja de todos los registros sigue estando',
    hojas2.includes('Todos los registros'), hojas2.join(', '));

  console.log('\n── El corte de campaña (1 de septiembre)');
  delete process.env.CAMPANA_DESDE;
  ok('en julio de 2026, la campaña arrancó el 1-9-2025',
    app.rangoCampana('2026-07-31').desde === '2025-09-01', app.rangoCampana('2026-07-31').desde);
  ok('y se llama 25/26', app.rangoCampana('2026-07-31').etiqueta === '25/26', app.rangoCampana('2026-07-31').etiqueta);
  ok('en septiembre de 2026 ya es la campaña siguiente',
    app.rangoCampana('2026-09-01').desde === '2026-09-01' &&
    app.rangoCampana('2026-09-01').etiqueta === '26/27', JSON.stringify(app.rangoCampana('2026-09-01')));
  ok('en agosto de 2026 todavía es la 25/26',
    app.rangoCampana('2026-08-31').etiqueta === '25/26', app.rangoCampana('2026-08-31').etiqueta);
  process.env.CAMPANA_DESDE = '2024-09-01';
  ok('CAMPANA_DESDE manda si está puesta',
    app.rangoCampana('2026-07-31').desde === '2024-09-01', app.rangoCampana('2026-07-31').desde);

  /* ═══════════════════════════════════════════════════════════════════════
   * EL AVISO A GENERAL DE UN PEDIDO
   * -----------------------------------------------------------------------
   * Antes el mail de un pedido de anulación/corrección decía "Nuevo registro
   * grabado" y NO traía el motivo, que es lo único que GENERAL necesita leer
   * para decidir.
   * ═════════════════════════════════════════════════════════════════════ */
  console.log('\n── Con el interruptor APAGADO no sale ningún aviso por evento');
  delete process.env.AVISOS_POR_TICKET;
  enviados.length = 0;
  await notificaciones.notificar({
    tipo: 'TARA FINAL', patentes: 'AA 111 BB', idTicket: '1-0001',
    fecha: '2026-08-10', codigoIngreso: '5684', tara: 13920,
  });
  await notificaciones.notificar({
    tipo: 'REGULADA', patentes: 'AA 111 BB', idTicket: '1-0001',
    fecha: '2026-08-10', codigoIngreso: '5684', neto: 36140,
  });
  await notificaciones.notificar({
    tipo: 'PEDIDO DE ANULACIÓN', patentes: 'AA 111 BB', idTicket: '1-0001',
    fecha: '2026-08-10', codigoIngreso: '5684', motivo: 'algo', pedidoPor: 'Matias',
  });
  await esperar(400);
  ok('TARA FINAL no manda correo', enviados.length === 0, JSON.stringify(enviados.map((e) => e.subject)));
  ok('REGULADA tampoco', enviados.length === 0);
  ok('el pedido de anulación tampoco', enviados.length === 0);

  console.log('\n── Pero el reporte de las 19 hs sigue saliendo igual');
  enviados.length = 0;
  await app.enviarReporteDiario();
  ok('el reporte de las 19 hs se manda', enviados.length === 1, enviados.length);
  ok('y sigue llevando el Excel adjunto',
    !!(enviados[0] && enviados[0].attachments && enviados[0].attachments[0]));
  ok('con el asunto de siempre', /Reporte diario/.test((enviados[0] || {}).subject || ''),
    (enviados[0] || {}).subject);

  console.log('\n── El interruptor se puede volver a prender');
  process.env.AVISOS_POR_TICKET = '1';

  console.log('\n── El aviso a GENERAL de un pedido de anulación');
  enviados.length = 0;
  await notificaciones.notificar({
    tipo: 'PEDIDO DE ANULACIÓN',
    patentes: 'AD 602 RB',
    idTicket: '1-0003',
    fecha: '2026-07-31',
    codigoIngreso: '5682',
    pedidoPor: 'Juan Sosa',
    motivo: 'Cargué la tara del acoplado equivocado, el camión ya salió.',
  });
  await esperar(300);

  ok('se manda un mail del pedido', enviados.length === 1, enviados.length);
  const av = enviados[0] || { subject: '', html: '' };
  ok('el asunto dice que es un pedido de anulación',
    /PEDIDO DE ANULACIÓN/.test(av.subject), av.subject);
  ok('y de qué balanza viene (5682 = EL WICHI)', /EL WICHI/.test(av.subject), av.subject);
  ok('el cuerpo trae el MOTIVO escrito',
    /acoplado equivocado/.test(av.html), (av.html.match(/Motivo[\s\S]{0,160}/) || [''])[0]);
  ok('trae quién lo pidió', /Juan Sosa/.test(av.html));
  ok('trae el número del ticket', /1-0003/.test(av.html));
  ok('NO dice "Nuevo registro grabado" (no es un registro, es un pedido)',
    !/Nuevo registro grabado/.test(av.html));
  ok('dice que lo resuelve GENERAL', /lo resuelve GENERAL/.test(av.html));
  ok('y dónde resolverlo en la app', /Para revisar/.test(av.html));

  console.log('\n── Los avisos de siempre no cambian');
  enviados.length = 0;
  await notificaciones.notificar({
    tipo: 'REGULADA', patentes: 'AC 884 TF', idTicket: '1-0001',
    fecha: '2026-07-31', codigoIngreso: '5679', neto: 36900,
    campo: 'El Mataco - SACHAYOJ - SE', grano: 'SOJA', lote: 'Lote 1',
  });
  await esperar(300);
  const avReg = enviados[0] || { subject: '', html: '' };
  ok('el aviso de REGULADA sigue diciendo "Nuevo registro grabado"',
    /Nuevo registro grabado/.test(avReg.html));
  ok('y no le aparecen filas de pedido', !/Motivo|Lo pidió/.test(avReg.html));
  ok('con su asunto de siempre', /REGULADA/.test(avReg.subject) && /EL MATACO/.test(avReg.subject), avReg.subject);

  // Se deja como queda en producción: apagado.
  delete process.env.AVISOS_POR_TICKET;
  enviados.length = 0;
  await notificaciones.notificar({
    tipo: 'REGULADA', patentes: 'ZZ 999 ZZ', idTicket: '1-0002',
    fecha: '2026-08-10', codigoIngreso: '5684', neto: 1,
  });
  await esperar(300);
  ok('apagándolo de nuevo, deja de mandar', enviados.length === 0, enviados.length);

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR EN LA PRUEBA:', e); process.exit(1); });
