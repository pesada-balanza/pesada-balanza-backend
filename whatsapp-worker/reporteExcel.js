/* =====================================================================
 * GENERADOR DE EXCEL DEL REPORTE DIARIO (para el worker de WhatsApp)
 * =====================================================================
 * Replica exactamente las hojas del reporte diario que hoy se manda por
 * email desde app.js (Registros + IMPRIMIR + Cargas SOCIO), para que el
 * archivo que llega por WhatsApp sea idéntico al del email.
 *
 * Si algún día cambiás las columnas en app.js, actualizá también acá.
 * ===================================================================== */

const ExcelJS = require('exceljs');

const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Fecha en formato YYYY-MM-DD (igual que app.js). */
const ymd = (d) => d.toISOString().split('T')[0];

/** Aplana arrays (lote/contratista/tractor) a string legible (igual que app.js). */
function flat(v) {
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}

// Columnas de la hoja "Registros" (idénticas a app.js › generarExcelReporteDiario)
const COLUMNS_REGISTROS = [
  { header: 'ID Ticket',       key: 'idTicket',       width: 10 },
  { header: 'Fecha',           key: 'fecha',          width: 15 },
  { header: 'Usuario',         key: 'usuario',        width: 15 },
  { header: 'Carga Para',      key: 'cargaPara',      width: 15 },
  { header: 'Socio',           key: 'socio',          width: 15 },
  { header: 'Pesada Para',     key: 'pesadaPara',     width: 15 },
  { header: 'Transporte',      key: 'transporte',     width: 15 },
  { header: 'Patentes',        key: 'patentes',       width: 15 },
  { header: 'Chofer',          key: 'chofer',         width: 15 },
  { header: 'Bruto Estimado',  key: 'brutoEstimado',  width: 16 },
  { header: 'Tara',            key: 'tara',           width: 10 },
  { header: 'Neto Estimado',   key: 'netoEstimado',   width: 16 },
  { header: 'Campo',           key: 'campo',          width: 18 },
  { header: 'Grano',           key: 'grano',          width: 12 },
  { header: 'Lote',            key: 'lote',           width: 18 },
  { header: 'Cargo De',        key: 'cargoDe',        width: 15 },
  { header: 'Silobolsa',       key: 'silobolsa',      width: 15 },
  { header: 'Contratista',     key: 'contratista',    width: 15 },
  { header: 'Tractor',         key: 'tractor',        width: 15 },
  { header: 'Bruto LOTE',      key: 'brutoLote',      width: 14 },
  { header: 'Comentarios',     key: 'comentarios',    width: 28 },
  { header: 'Bruto Regulado',  key: 'bruto',          width: 16 },
  { header: 'Neto',            key: 'neto',           width: 15 },
  { header: 'Bruto LOTE - Bruto Regulado', key: 'difBrutoLoteBruto', width: 22 },
  { header: 'Anulado',         key: 'anulado',        width: 10 },
  { header: 'Confirmada CAMIONES', key: 'confirmada', width: 14 },
];

// Columnas de la hoja "IMPRIMIR" (subset para impresión, idéntico a app.js)
const COLUMNS_IMPRIMIR = [
  { header: 'ID Ticket', key: 'idTicket', width: 10 },
  { header: 'Fecha', key: 'fecha', width: 15 },
  { header: 'Carga Para', key: 'cargaPara', width: 15 },
  { header: 'Socio', key: 'socio', width: 15 },
  { header: 'Transporte', key: 'transporte', width: 15 },
  { header: 'Patentes', key: 'patentes', width: 15 },
  { header: 'Chofer', key: 'chofer', width: 15 },
  { header: 'Campo', key: 'campo', width: 18 },
  { header: 'Grano', key: 'grano', width: 12 },
  { header: 'Lote', key: 'lote', width: 18 },
  { header: 'Silobolsa', key: 'silobolsa', width: 15 },
  { header: 'Contratista', key: 'contratista', width: 15 },
  { header: 'Tara', key: 'tara', width: 10 },
  { header: 'Bruto LOTE', key: 'brutoLote', width: 14 },
  { header: 'Bruto Regulado', key: 'bruto', width: 16 },
  { header: 'Neto', key: 'neto', width: 15 },
  { header: 'CP', key: 'cp', width: 14 },
  { header: 'Comentarios', key: 'comentarios', width: 28 },
];

/**
 * Agrega una fila a la hoja calculando difBrutoLoteBruto, aplanando arrays
 * y marcando en rojo/negrita el Neto de los tickets anulados.
 * (Réplica de addRowToSheetDiario de app.js.)
 */
function addRow(targetSheet, r) {
  const netoExport = r.anulado && typeof r.neto === 'number'
    ? -Math.abs(r.neto)
    : r.neto;
  const nBrutoLote = Number(r.brutoLote);
  const nBruto = Number(r.bruto);
  const difBrutoLoteBruto =
    (typeof r.brutoLote !== 'undefined' && r.brutoLote !== null && r.brutoLote !== '' &&
     typeof r.bruto     !== 'undefined' && r.bruto     !== null && r.bruto     !== '' &&
     !Number.isNaN(nBrutoLote) && !Number.isNaN(nBruto))
      ? (nBrutoLote - nBruto)
      : '';
  const row = targetSheet.addRow({
    ...r,
    lote:        flat(r.lote),
    contratista: flat(r.contratista),
    tractor:     flat(r.tractor),
    neto: netoExport,
    difBrutoLoteBruto,
    anulado: r.anulado ? 'ANULADO' : '',
  });
  if (r.anulado && netoExport != null) {
    const cell = row.getCell('neto');
    cell.font = { bold: true, color: { argb: 'FFCC0000' } };
  }
}

/**
 * Configura una hoja para imprimir en A4 (horizontal, ajustada al ancho de
 * la página, con la fila de títulos repetida en cada página impresa).
 */
function configurarA4(ws) {
  ws.pageSetup = {
    paperSize: 9,              // 9 = A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,             // todo el ancho en una sola página
    fitToHeight: 0,            // alto: tantas páginas como haga falta
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.pageSetup.printTitlesRow = '1:1';   // repetir encabezado en cada página
}

/**
 * Construye el workbook completo (Registros + IMPRIMIR + Cargas SOCIO) a
 * partir de una lista de registros ya filtrada.
 * @param {Array} registros
 * @returns {ExcelJS.Workbook}
 */
function generarWorkbookReporte(registros) {
  const workbook = new ExcelJS.Workbook();

  // ── Hoja Registros ──
  const sheet = workbook.addWorksheet('Registros');
  sheet.columns = COLUMNS_REGISTROS;
  sheet.getRow(1).font = { bold: true };
  registros.forEach(r => addRow(sheet, r));

  // ── Hoja IMPRIMIR ──
  const sheetImprimir = workbook.addWorksheet('IMPRIMIR');
  sheetImprimir.columns = COLUMNS_IMPRIMIR;
  sheetImprimir.getRow(1).font = { bold: true };
  registros.forEach(r => addRow(sheetImprimir, r));

  // ── Hoja Cargas SOCIO (ordenada por fecha y luego por campo) ──
  const registrosSocio = registros
    .filter(r => r.cargaPara === 'SOCIO')
    .sort((a, b) => {
      const fechaCmp = (a.fecha || '').localeCompare(b.fecha || '');
      if (fechaCmp !== 0) return fechaCmp;
      return (a.campo || '').localeCompare(b.campo || '');
    });

  const sheetSocio = workbook.addWorksheet('Cargas SOCIO');
  sheetSocio.columns = COLUMNS_REGISTROS.map(c => ({ header: c.header, key: c.key, width: c.width }));
  sheetSocio.getRow(1).font = { bold: true };
  registrosSocio.forEach(r => addRow(sheetSocio, r));

  // Configurar TODAS las hojas para impresión en A4
  workbook.worksheets.forEach(configurarA4);

  return workbook;
}

module.exports = { generarWorkbookReporte, ymd, flat, MIME_XLSX };
