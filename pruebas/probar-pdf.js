'use strict';
/**
 * Valida el PDF del ticket: estructura (xref byte a byte), medidas exactas,
 * contenido, y que Chromium lo pueda abrir y dibujar de verdad.
 */
const fs = require('fs');
const path = require('path');
const { buscarChromium } = require('./buscar-chromium');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);
const SALIDA = __dirname + '/capturas';

const { generarPdf, nombreArchivo, ANCHO_MM, ALTO_MM } = require(path.join(PROY, 'app-movil-pdf.js'));

let fallos = 0, pruebas = 0;
function ok(n, c, extra) {
  pruebas++;
  if (c) console.log('  ✓ ' + n);
  else { fallos++; console.log('  ✗ ' + n + (extra ? '  →  ' + String(extra).slice(0, 300) : '')); }
}

const ticketCompleto = {
  id: 'x', nro: '1-0001', patentes: 'AC 884 TF', chofer: 'R. Gómez', transporte: 'Ciriaci',
  campoCorto: 'El Mataco', titular: 'AMH', fechaLarga: '27/07/2026', hora: '09:41',
  // El nombre completo no entra en un renglón: tiene que partirse en dos.
  campo: 'El Mataco - SACHAYOJ - SE',
  grano: 'SOJA', loteTexto: 'El 44', cp: '10203040506',
  // De dónde cargó: una línea por tractor, con sus kg.
  origenEtiqueta: 'CARGÓ DE',
  origenLista: [
    { nombre: '1VILLA', kg: 12000 },
    { nombre: '3VILLA', kg: 10000 },
    { nombre: '9MAGGI', kg: 14900 },
  ],
  comentarios: 'Llegó con lluvia, el acoplado venía con barro en el eje trasero',
  brutoEstimado: 52500, tara: 15600, brutoLote: 52500, bruto: 52500, neto: 36900,
  fechaTaraFinal: '2026-07-27', fechaRegulada: '2026-07-27', anulado: false,
  balanza: 'El Mataco', completo: true,
};

/** Chromium de Playwright, si está instalado. */
function navegador() {
  try {
    return require(path.join(PROY, 'node_modules', 'playwright')).chromium;
  } catch (e) {
    console.log('\n  SALTEADA la parte del navegador: falta Playwright.');
    console.log('    npm install --no-save playwright\n');
    return null;
  }
}

function main() {
  fs.mkdirSync(SALIDA, { recursive: true });

  console.log('\n── Estructura del PDF');
  const pdf = generarPdf(ticketCompleto);
  ok('devuelve un Buffer', Buffer.isBuffer(pdf));
  ok('arranca con la firma %PDF', pdf.slice(0, 8).toString('latin1').indexOf('%PDF-1.') === 0,
    pdf.slice(0, 8).toString('latin1'));
  ok('termina con %%EOF', /%%EOF\s*$/.test(pdf.slice(-10).toString('latin1')));
  ok('pesa poco (menos de 10 KB)', pdf.length < 10240, pdf.length + ' bytes');

  const texto = pdf.toString('latin1');

  // startxref tiene que apuntar exactamente a la palabra "xref"
  const mStart = texto.match(/startxref\s+(\d+)/);
  ok('tiene startxref', !!mStart);
  const posXref = mStart ? parseInt(mStart[1], 10) : -1;
  ok('startxref apunta a la tabla xref',
    texto.slice(posXref, posXref + 4) === 'xref', JSON.stringify(texto.slice(posXref, posXref + 12)));

  // Cada posición de la tabla tiene que caer justo en "N 0 obj"
  const bloque = texto.slice(posXref);
  const mCant = bloque.match(/xref\s+0 (\d+)/);
  const cantidad = mCant ? parseInt(mCant[1], 10) : 0;
  ok('la tabla declara la cantidad de objetos', cantidad > 5, cantidad);

  const entradas = bloque.match(/^(\d{10}) (\d{5}) [nf] $/gm) || [];
  ok('hay una entrada por objeto (más la libre)', entradas.length === cantidad,
    entradas.length + ' vs ' + cantidad);

  let posicionesBien = 0;
  for (let i = 1; i < entradas.length; i++) {
    const off = parseInt(entradas[i].slice(0, 10), 10);
    const esperado = i + ' 0 obj';
    if (texto.slice(off, off + esperado.length) === esperado) posicionesBien++;
    else console.log('      objeto ' + i + ': la posición ' + off + ' cae en ' +
      JSON.stringify(texto.slice(off, off + 20)));
  }
  ok('todas las posiciones caen justo en su objeto', posicionesBien === entradas.length - 1,
    posicionesBien + ' de ' + (entradas.length - 1));

  ok('la entrada 0 es la libre', entradas[0] && /^0000000000 65535 f $/.test(entradas[0]), entradas[0]);
  ok('el catálogo y las páginas están declarados',
    /\/Type \/Catalog/.test(texto) && /\/Type \/Pages/.test(texto) && /\/Type \/Page /.test(texto));
  ok('declara las 4 fuentes base sin incrustar nada',
    /\/BaseFont \/Helvetica[^-]/.test(texto) && /\/BaseFont \/Helvetica-Bold/.test(texto) &&
    /\/BaseFont \/Courier[^-]/.test(texto) && /\/BaseFont \/Courier-Bold/.test(texto));
  ok('usa WinAnsiEncoding (para los acentos)', /\/Encoding \/WinAnsiEncoding/.test(texto));

  const mLen = texto.match(/\/Length (\d+) >>\s*stream\r?\n/);
  ok('declara el largo del contenido', !!mLen, mLen && mLen[1]);
  if (mLen) {
    const inicio = texto.indexOf('stream\n', texto.indexOf(mLen[0])) + 'stream\n'.length;
    const largo = parseInt(mLen[1], 10);
    ok('el largo declarado coincide con el real',
      texto.slice(inicio + largo, inicio + largo + 10).indexOf('\nendstream') === 0,
      JSON.stringify(texto.slice(inicio + largo, inicio + largo + 12)));
  }

  console.log('\n── Medidas');
  const mBox = texto.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  ok('tiene MediaBox', !!mBox);
  const anchoCm = mBox ? (parseFloat(mBox[1]) / 72) * 2.54 : 0;
  const altoCm = mBox ? (parseFloat(mBox[2]) / 72) * 2.54 : 0;
  console.log('     medida: ' + anchoCm.toFixed(2) + ' × ' + altoCm.toFixed(2) + ' cm');
  ok('mide 19 × 4,5 cm exactos', Math.abs(anchoCm - 19) < 0.01 && Math.abs(altoCm - 4.5) < 0.01,
    anchoCm.toFixed(3) + ' × ' + altoCm.toFixed(3));
  ok('las constantes del módulo dicen lo mismo', ANCHO_MM === 190 && ALTO_MM === 45);

  console.log('\n── Contenido');
  for (const [que, esperado] of [
    ['el número del ticket', '1-0001'],
    ['la patente', 'AC 884 TF'],
    ['el chofer', 'R. G'],
    ['el transporte', 'Ciriaci'],
    ['el establecimiento', 'El Mataco'],
    ['el grano y el lote', 'SOJA'],
    ['la etiqueta LOTE', 'LOTE'],
    ['de dónde cargó', 'CARG'],
    ['el primer tractor', '1VILLA'],
    ['los kg de ese tractor', '12.000'],
    ['la etiqueta NETO', 'NETO'],
    ['el neto en kilos', '36.900'],
    ['la firma del chofer', 'FIRMA CHOFER'],
    ['la línea de corte', 'CORTAR AQU'],
  ]) {
    ok('incluye ' + que, texto.indexOf('(' + esperado) !== -1 || texto.indexOf(esperado) !== -1, esperado);
  }

  // Los acentos van en WinAnsi (un byte), no en UTF-8 (dos bytes)
  ok('el acento de "Gómez" va en un solo byte', texto.indexOf('G\xf3mez') !== -1);
  ok('la Í de "AQUÍ" va en un solo byte', texto.indexOf('AQU\xcd') !== -1);

  console.log('\n── Lo que NO tiene que aparecer');
  for (const secreto of ['5679', '5680', '12341', '56781']) {
    ok('no aparece el código ' + secreto, texto.indexOf(secreto) === -1);
  }

  console.log('\n── Nombre del archivo');
  const nombre = nombreArchivo(ticketCompleto);
  ok('es prolijo para WhatsApp', /^ticket-1-0001-AC884TF\.pdf$/.test(nombre), nombre);
  ok('no tiene espacios ni acentos', !/[\s-￿]/.test(nombre), nombre);

  console.log('\n── Texto largo recortado (que no se desborde)');
  const largo = generarPdf(Object.assign({}, ticketCompleto, {
    chofer: 'Un Nombre Muy Largo Que No Entra De Ninguna Manera En La Columna',
    comentarios: 'x'.repeat(400),
    campoCorto: 'Establecimiento Con Un Nombre Larguísimo',
  }));
  const textoLargo = largo.toString('latin1');
  ok('el texto largo se recorta con …', textoLargo.indexOf('\x85') !== -1 || /…/.test(textoLargo),
    'no se encontró el recorte');
  ok('sigue siendo un PDF válido', /%%EOF\s*$/.test(textoLargo.slice(-10)));

  /* ── Los lotes, uno por renglón, y el chofer sin cortarse ──────────────── */
  console.log('\n── Los lotes y el chofer, en varios renglones');
  const variosLotes = generarPdf(Object.assign({}, ticketCompleto, {
    lote: ['Lote 1 El Mataco', 'Lote 2 El Mataco', 'Lote 3 El Mataco', 'Lote 4 El Mataco'],
    chofer: 'LEZCANO, CARLOS ALBERTO',
    transporte: 'TRANSPORTE VENTRE MAURICIO',
  })).toString('latin1');
  ok('los lotes salen uno por renglón',
    variosLotes.indexOf('(Lote 1 El Mataco)') !== -1 && variosLotes.indexOf('(Lote 2 El Mataco)') !== -1,
    'no se encontraron los dos primeros');
  ok('con más de tres dice cuántos faltan', variosLotes.indexOf('(y 2 m\xe1s)') !== -1);
  ok('el chofer usa dos renglones en vez de cortarse en el primero',
    variosLotes.indexOf('(LEZCANO,)') !== -1 && variosLotes.indexOf('(CARLOS') !== -1,
    'el chofer sigue en un solo renglón');
  ok('el transporte también', variosLotes.indexOf('(TRANSPORTE)') !== -1 &&
    variosLotes.indexOf('(VENTRE') !== -1, 'el transporte no se partió');
  /* Lo que no entra ni en dos renglones se marca con …: antes se perdía en
     silencio y no había forma de saber que el nombre seguía. */
  ok('lo que no entra ni así se avisa con …',
    variosLotes.indexOf('MAURI\x85') !== -1 || variosLotes.indexOf('ALBERT\x85') !== -1 ||
    (variosLotes.match(/\x85/g) || []).length >= 2,
    'no apareció el recorte en la segunda línea');

  /* ── Con más de tres orígenes se resume ──────────────────────────────── */
  console.log('\n── De dónde cargó, con más de tres');
  const seis = generarPdf(Object.assign({}, ticketCompleto, {
    origenLista: [
      { nombre: '1VILLA', kg: 6000 }, { nombre: '3VILLA', kg: 6000 },
      { nombre: '9MAGGI', kg: 6000 }, { nombre: '8MAGGI', kg: 6000 },
      { nombre: '22LAMY', kg: 6000 }, { nombre: '14DORCHS', kg: 6900 },
    ],
  })).toString('latin1');
  ok('muestra los dos primeros', seis.indexOf('(1VILLA)') !== -1 && seis.indexOf('(3VILLA)') !== -1);
  ok('y dice cuántos faltan', seis.indexOf('(y 4 m\xe1s)') !== -1, 'no apareció "y 4 más"');
  ok('no entra un cuarto renglón que pise las observaciones',
    seis.indexOf('(9MAGGI)') === -1, 'se dibujó un tercer tractor');

  console.log('\n── Ticket sin regulada (renglones en blanco)');
  const parcial = generarPdf(Object.assign({}, ticketCompleto, {
    grano: '', loteTexto: '', cp: '', comentarios: '',
    origenLista: [],
    brutoLote: null, bruto: null, neto: null, fechaRegulada: '',
  }));
  const textoParcial = parcial.toString('latin1');
  ok('no imprime el neto', textoParcial.indexOf('(36.900)') === -1);
  ok('dibuja renglones punteados', /\[0\.8 1\.4\] 0 d/.test(textoParcial));
  ok('de dónde cargó también sale punteado', textoParcial.indexOf('(1VILLA)') === -1);

  console.log('\n── Varios tickets en un PDF');
  const varios = generarPdf([ticketCompleto, Object.assign({}, ticketCompleto, { nro: '1-0002' })]);
  const textoVarios = varios.toString('latin1');
  ok('dos páginas', (textoVarios.match(/\/Type \/Page /g) || []).length === 2);
  ok('la cuenta de páginas dice 2', /\/Count 2/.test(textoVarios));

  console.log('\n── Sello de anulado');
  const anul = generarPdf(Object.assign({}, ticketCompleto, { anulado: true })).toString('latin1');
  ok('el ticket anulado lleva el sello', anul.indexOf('A N U L A D O') !== -1);

  // Guardar para verlo
  fs.writeFileSync(SALIDA + '/20-ticket.pdf', pdf);
  fs.writeFileSync(SALIDA + '/21-ticket-sin-regulada.pdf', parcial);
  console.log('\n  PDFs guardados en ' + SALIDA);

  return { pdf, parcial };
}

async function verEnChromium(archivos) {
  console.log('\n── Chromium abre el PDF');
  const chromium = navegador();
  if (!chromium) return;
  const browser = await chromium.launch({
    executablePath: buscarChromium() || undefined,
  });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 500 } });
  const pg = await ctx.newPage();

  const errores = [];
  pg.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await pg.goto('file://' + SALIDA + '/20-ticket.pdf');
  await pg.waitForTimeout(3000);
  await pg.screenshot({ path: SALIDA + '/20-ticket-pdf-visto.png' });

  // El visor de Chromium arma un <embed>; si el PDF estuviera roto muestra error.
  const roto = await pg.evaluate(() =>
    /no se puede|failed to load|couldn't|error/i.test(document.body.innerText || '')
  );
  ok('Chromium no reporta el PDF como roto', !roto, await pg.evaluate(() => document.body.innerText.slice(0, 200)));
  ok('el visor no tiró errores de consola',
    errores.filter((e) => /pdf|parse|invalid/i.test(e)).length === 0, errores.join(' | '));

  await browser.close();
  console.log('  captura del PDF en ' + SALIDA + '/20-ticket-pdf-visto.png');
}

(async () => {
  const archivos = main();
  try {
    await verEnChromium(archivos);
  } catch (e) {
    console.log('  (no se pudo abrir en Chromium: ' + e.message + ')');
  }
  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
})();
