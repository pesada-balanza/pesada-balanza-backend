'use strict';

/**
 * app-movil-pdf.js — Genera el PDF del ticket (formato 5a del handoff).
 * =============================================================================
 * POR QUÉ ESTÁ ESCRITO A MANO: el ticket es solo texto y líneas rectas, y un PDF
 * con texto y líneas se puede escribir directamente. Así la app no agrega
 * ninguna librería al proyecto (nada de pdfkit ni puppeteer), que era una de las
 * condiciones para no tocar el deploy de la web.
 *
 * Se usan las fuentes base del formato PDF (Helvetica y Courier), que todo lector
 * de PDF ya trae, así que no hay nada que incrustar y el archivo pesa ~3 KB.
 *
 * La hoja mide exactamente 19 × 4,5 cm: el PDF ES el ticket. Se comparte después
 * de la REGULADA, cuando ya están todos los pesos.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * MEDIDAS
 * El PDF mide en puntos (1 pt = 1/72 pulgada). Se trabaja en milímetros y en
 * coordenadas con el origen arriba a la izquierda, como en el CSS, y se
 * convierte al final (el PDF tiene el origen abajo a la izquierda).
 * ═════════════════════════════════════════════════════════════════════════ */

const MM = 72 / 25.4; // 1 mm en puntos
const ANCHO_MM = 190; // 19 cm
const ALTO_MM = 45; //  4,5 cm

const pt = (mm) => mm * MM;

/* ═══════════════════════════════════════════════════════════════════════════
 * FUENTES  (anchos oficiales de las fuentes base del PDF, por 1000 unidades)
 * ═════════════════════════════════════════════════════════════════════════ */

const ANCHOS_HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const ANCHOS_HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// F1 Helvetica · F2 Helvetica-Bold · F3 Courier · F4 Courier-Bold
const FUENTES = {
  F1: { nombre: 'Helvetica', anchos: ANCHOS_HELVETICA, fijo: 0 },
  F2: { nombre: 'Helvetica-Bold', anchos: ANCHOS_HELVETICA_BOLD, fijo: 0 },
  F3: { nombre: 'Courier', anchos: null, fijo: 600 },
  F4: { nombre: 'Courier-Bold', anchos: null, fijo: 600 },
};

/**
 * Pasa el texto a WinAnsi (la codificación que declaran las fuentes). Cubre los
 * acentos y la ñ del castellano. Los caracteres tipográficos que no están en
 * Latin-1 (guion largo, comillas curvas, puntos suspensivos) se mapean a su
 * lugar en WinAnsi.
 */
const ESPECIALES = {
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2026: 0x85, // …
  0x20ac: 0x80, // €
};

function aWinAnsi(texto) {
  const bytes = [];
  const s = String(texto == null ? '' : texto);
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c > 0xffff) i++; // par surrogate: no entra en WinAnsi
    if (ESPECIALES[c] !== undefined) bytes.push(ESPECIALES[c]);
    else if (c >= 0x20 && c <= 0xff) bytes.push(c);
    else if (c === 0x09) bytes.push(0x20);
    else bytes.push(0x3f); // '?'
  }
  return Buffer.from(bytes);
}

/** Ancho del texto en milímetros, con el espaciado entre letras incluido. */
function medir(texto, clave, tamano, espaciado) {
  const f = FUENTES[clave];
  const bytes = aWinAnsi(texto);
  let unidades = 0;
  for (const b of bytes) {
    if (f.fijo) unidades += f.fijo;
    else if (b >= 32 && b <= 126) unidades += f.anchos[b - 32];
    else unidades += 556; // acentos y demás: ancho de letra común
  }
  const anchoPt = (unidades / 1000) * tamano + (espaciado || 0) * bytes.length;
  return anchoPt / MM;
}

/** Recorta el texto para que entre en `anchoMm`, agregando … si sobra. */
function recortar(texto, clave, tamano, espaciado, anchoMm) {
  let s = String(texto == null ? '' : texto);
  if (!anchoMm || medir(s, clave, tamano, espaciado) <= anchoMm) return s;
  while (s.length > 1 && medir(s + '…', clave, tamano, espaciado) > anchoMm) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

/* ═══════════════════════════════════════════════════════════════════════════
 * COLORES (los mismos del diseño)
 * ═════════════════════════════════════════════════════════════════════════ */

const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v) => (v / 255).toFixed(3);
  return c((n >> 16) & 255) + ' ' + c((n >> 8) & 255) + ' ' + c(n & 255);
};

const TINTA = rgb('#1b1a17');
const LABEL = rgb('#8f8b82');
const SUAVE = rgb('#6f6c64');
const LINEA = rgb('#d8d5ce');
const PUNTEADO = rgb('#a8a49b');
const CORTE = rgb('#c2beb5');
const ANULADO = rgb('#8f2f22');

/* ═══════════════════════════════════════════════════════════════════════════
 * LIENZO: acumula las órdenes de dibujo del PDF
 * ═════════════════════════════════════════════════════════════════════════ */

function crearLienzo() {
  const ordenes = [];

  /** Convierte una Y con origen arriba a la Y del PDF (origen abajo). */
  const y = (mm) => pt(ALTO_MM - mm);

  function escapar(buf) {
    const out = [];
    for (const b of buf) {
      if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); // ( ) \
      out.push(b);
    }
    return Buffer.from(out).toString('latin1');
  }

  return {
    /**
     * texto(xMm, yMm, str, opciones)
     * opciones: { fuente, tamano, color, espaciado, alinear, anchoMm }
     *   alinear: 'izq' (por defecto) | 'der' | 'centro'
     *   anchoMm: si se pasa, recorta el texto para que entre
     */
    texto(xMm, yMm, str, op) {
      const o = op || {};
      const clave = o.fuente || 'F1';
      const tamano = o.tamano || 9;
      const esp = o.espaciado || 0;
      let s = String(str == null ? '' : str);
      if (!s) return;
      if (o.anchoMm) s = recortar(s, clave, tamano, esp, o.anchoMm);

      let x = xMm;
      if (o.alinear === 'der' || o.alinear === 'centro') {
        const ancho = medir(s, clave, tamano, esp);
        x = o.alinear === 'der' ? xMm - ancho : xMm - ancho / 2;
      }

      ordenes.push(
        'BT ' + (o.color || TINTA) + ' rg /' + clave + ' ' + tamano + ' Tf ' +
        (esp ? esp.toFixed(3) + ' Tc ' : '0 Tc ') +
        pt(x).toFixed(2) + ' ' + y(yMm).toFixed(2) + ' Td (' + escapar(aWinAnsi(s)) + ') Tj ET'
      );
    },

    /** Línea horizontal. tipo: 'solida' | 'punteada' | 'rayada' */
    linea(x1Mm, x2Mm, yMm, op) {
      const o = op || {};
      const guion =
        o.tipo === 'punteada' ? '[0.8 1.4] 0 d ' : o.tipo === 'rayada' ? '[2.4 1.8] 0 d ' : '[] 0 d ';
      ordenes.push(
        (o.color || LINEA) + ' RG ' + (o.grosor || 0.4).toFixed(2) + ' w ' + guion +
        pt(x1Mm).toFixed(2) + ' ' + y(yMm).toFixed(2) + ' m ' +
        pt(x2Mm).toFixed(2) + ' ' + y(yMm).toFixed(2) + ' l S [] 0 d'
      );
    },

    /** Línea vertical. */
    lineaVertical(xMm, y1Mm, y2Mm, op) {
      const o = op || {};
      ordenes.push(
        (o.color || LINEA) + ' RG ' + (o.grosor || 0.4).toFixed(2) + ' w [] 0 d ' +
        pt(xMm).toFixed(2) + ' ' + y(y1Mm).toFixed(2) + ' m ' +
        pt(xMm).toFixed(2) + ' ' + y(y2Mm).toFixed(2) + ' l S'
      );
    },

    contenido() {
      return ordenes.join('\n');
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DIBUJO DEL TICKET  (mismo reparto que ticket.css / formato 5a)
 * ═════════════════════════════════════════════════════════════════════════ */

// Columnas, en milímetros
const IZQ_X = 4.8;
const IZQ_ANCHO = 35;
const DIV_IZQ = IZQ_X + IZQ_ANCHO; // 39.8
const CEN_X = DIV_IZQ + 4; // 43.8
const DER_X = ANCHO_MM - 4.8 - 46; // 139.2
const DIV_DER = DER_X;
const DER_TEXTO = DER_X + 3.7; // 142.9
const DER_FIN = ANCHO_MM - 4.8; // 185.2
const CEN_FIN = DER_X - 4; // 135.2
const CEN_ANCHO = CEN_FIN - CEN_X; // 91.4
const CEN_COL = (CEN_ANCHO - 2 * 3.7) / 3; // 28.0
const ARRIBA = 3.4;
const ABAJO = 38;
const CORTE_Y = 40;

const T = {
  establecimiento: { fuente: 'F2', tamano: 12 },
  titular: { fuente: 'F3', tamano: 6.75, color: SUAVE, espaciado: 0.4 },
  label: { fuente: 'F3', tamano: 6, color: LABEL, espaciado: 0.6 },
  numero: { fuente: 'F4', tamano: 19.5 },
  fecha: { fuente: 'F3', tamano: 6.75, color: SUAVE },
  patente: { fuente: 'F4', tamano: 9.75 },
  chofer: { fuente: 'F2', tamano: 10.5 },
  valor: { fuente: 'F1', tamano: 9 },
  pesoNombre: { fuente: 'F1', tamano: 7.5, color: SUAVE },
  pesoValor: { fuente: 'F4', tamano: 9 },
  netoLabel: { fuente: 'F4', tamano: 8.25, espaciado: 0.6 },
  netoValor: { fuente: 'F4', tamano: 11.25 },
  firma: { fuente: 'F3', tamano: 5.25, color: LABEL, espaciado: 0.5 },
  corte: { fuente: 'F3', tamano: 5.25, color: CORTE, espaciado: 1.3 },
};

const miles = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Math.round(v).toLocaleString('es-AR');
};

/** Un dato del bloque del centro: etiqueta arriba, valor abajo (o renglón). */
function dato(L, x, yLabel, yValor, etiqueta, valor, estilo, anchoMm) {
  L.texto(x, yLabel, etiqueta, T.label);
  if (valor === null || valor === undefined || String(valor) === '') {
    L.linea(x, x + anchoMm, yValor + 0.6, { tipo: 'punteada', color: PUNTEADO });
  } else {
    L.texto(x, yValor, valor, Object.assign({ anchoMm }, estilo));
  }
}

/** Una fila de peso a la derecha: nombre a la izquierda, kilos a la derecha. */
function peso(L, y, nombre, valor) {
  L.texto(DER_TEXTO, y, nombre, T.pesoNombre);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) {
    L.linea(DER_FIN - 18, DER_FIN, y + 0.6, { tipo: 'punteada', color: PUNTEADO });
  } else {
    L.texto(DER_FIN, y, miles(valor) + ' kg', Object.assign({ alinear: 'der' }, T.pesoValor));
  }
}

/**
 * Dibuja el ticket. `t` es el objeto que arma `vistaRegistro` en app-movil.js.
 */
function dibujarTicket(t) {
  const L = crearLienzo();

  /* ── Divisores de las tres columnas ── */
  L.lineaVertical(DIV_IZQ, ARRIBA - 0.6, ABAJO);
  L.lineaVertical(DIV_DER, ARRIBA - 0.6, ABAJO);

  /* ── Izquierda: establecimiento, titular, número y fecha ──
     El código de la balanza NO se imprime nunca. */
  L.texto(IZQ_X, 7.6, t.campoCorto || t.balanza || '', Object.assign({ anchoMm: 31 }, T.establecimiento));
  L.texto(IZQ_X, 11.2, t.titular || 'AMH', Object.assign({ anchoMm: 31 }, T.titular));

  L.texto(IZQ_X, 27, 'TICKET Nº', T.label);
  L.texto(IZQ_X, 33.8, t.nro || '', Object.assign({ anchoMm: 31 }, T.numero));
  const fechaHora = (t.fechaLarga || '') + (t.hora ? ' · ' + t.hora : '');
  L.texto(IZQ_X, 37.2, fechaHora, Object.assign({ anchoMm: 31 }, T.fecha));

  /* ── Centro: datos del viaje, tres columnas ── */
  const cx = [CEN_X, CEN_X + CEN_COL + 3.7, CEN_X + 2 * (CEN_COL + 3.7)];

  dato(L, cx[0], 6.4, 10.6, 'PATENTES', t.patentes, T.patente, CEN_COL);
  dato(L, cx[1], 6.4, 10.6, 'CHOFER', t.chofer, T.chofer, CEN_COL);
  dato(L, cx[2], 6.4, 10.6, 'TRANSPORTE', t.transporte, T.valor, CEN_COL);

  const granoLote = [t.grano, t.loteTexto].filter(Boolean).join(' · ');
  dato(L, cx[0], 18, 22.2, 'CAMPO', t.campoCorto, T.valor, CEN_COL);
  dato(L, cx[1], 18, 22.2, 'GRANO · LOTE', granoLote, T.valor, CEN_COL);
  dato(L, cx[2], 18, 22.2, 'CP / CTG', t.cp, T.valor, CEN_COL);

  dato(L, cx[0], 29.5, 33.7, 'OBSERVACIONES', t.comentarios, T.valor, CEN_ANCHO);

  /* ── Derecha: los pesos ── */
  peso(L, 6.8, 'Bruto estimado', t.brutoEstimado);
  peso(L, 10.7, 'Tara final', t.fechaTaraFinal ? t.tara : null);
  peso(L, 14.6, 'Bruto lote', t.brutoLote);
  peso(L, 18.5, 'Bruto regulado', t.bruto);

  L.linea(DER_TEXTO, DER_FIN, 25.5, { color: TINTA, grosor: 0.6 });
  L.texto(DER_TEXTO, 29.8, 'NETO', T.netoLabel);
  if (t.neto === null || t.neto === undefined || t.neto === '') {
    L.linea(DER_FIN - 25, DER_FIN, 30.4, { tipo: 'punteada', color: PUNTEADO });
  } else {
    L.texto(DER_FIN, 29.8, miles(t.neto), Object.assign({ alinear: 'der' }, T.netoValor));
  }

  L.linea(DER_TEXTO, DER_FIN, 35, { color: LABEL, grosor: 0.4 });
  L.texto(DER_TEXTO, 37.6, 'FIRMA CHOFER', T.firma);

  /* ── Franja de corte ── */
  L.linea(0, ANCHO_MM, CORTE_Y, { tipo: 'rayada', color: PUNTEADO });
  L.texto(ANCHO_MM / 2, 43.2, 'CORTAR AQUÍ', Object.assign({ alinear: 'centro' }, T.corte));

  /* ── Sello de anulado, si corresponde ── */
  if (t.anulado) {
    L.texto(CEN_X + 18, 26, 'A N U L A D O', {
      fuente: 'F2', tamano: 26, color: ANULADO, espaciado: 2,
    });
  }

  return L.contenido();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ARMADO DEL ARCHIVO PDF
 * ═════════════════════════════════════════════════════════════════════════ */

function textoPdf(s) {
  return Buffer.from(s, 'latin1');
}

/**
 * Genera el PDF de uno o varios tickets (una hoja por ticket, del tamaño exacto
 * del ticket). Devuelve un Buffer listo para mandar por HTTP.
 */
function generarPdf(tickets, meta) {
  const lista = Array.isArray(tickets) ? tickets : [tickets];
  if (!lista.length) throw new Error('No hay tickets para el PDF');

  const objetos = []; // { cuerpo: Buffer }
  const agregar = (cuerpo) => {
    objetos.push(Buffer.isBuffer(cuerpo) ? cuerpo : textoPdf(cuerpo));
    return objetos.length; // el número del objeto (arranca en 1)
  };

  // Las fuentes base: no hace falta incrustar nada.
  const numFuentes = {};
  const clavesFuente = Object.keys(FUENTES);

  // Orden de los objetos: 1 catálogo, 2 páginas, luego fuentes, luego los
  // contenidos y las páginas, y al final los datos del documento.
  const numCatalogo = agregar('<< /Type /Catalog /Pages 2 0 R >>');
  const numPaginas = agregar('PLACEHOLDER_PAGES');

  clavesFuente.forEach((clave) => {
    numFuentes[clave] = agregar(
      '<< /Type /Font /Subtype /Type1 /BaseFont /' + FUENTES[clave].nombre +
      ' /Encoding /WinAnsiEncoding >>'
    );
  });

  const recursos =
    '<< /Font << ' +
    clavesFuente.map((c) => '/' + c + ' ' + numFuentes[c] + ' 0 R').join(' ') +
    ' >> >>';

  const numsPagina = [];
  for (const t of lista) {
    const contenido = textoPdf(dibujarTicket(t));
    const numContenido = agregar(
      Buffer.concat([
        textoPdf('<< /Length ' + contenido.length + ' >>\nstream\n'),
        contenido,
        textoPdf('\nendstream'),
      ])
    );
    const numPagina = agregar(
      '<< /Type /Page /Parent ' + numPaginas + ' 0 R' +
      ' /MediaBox [0 0 ' + pt(ANCHO_MM).toFixed(2) + ' ' + pt(ALTO_MM).toFixed(2) + ']' +
      ' /Resources ' + recursos +
      ' /Contents ' + numContenido + ' 0 R >>'
    );
    numsPagina.push(numPagina);
  }

  // Ahora sí se puede escribir el objeto de páginas
  objetos[numPaginas - 1] = textoPdf(
    '<< /Type /Pages /Kids [' + numsPagina.map((n) => n + ' 0 R').join(' ') + ']' +
    ' /Count ' + numsPagina.length + ' >>'
  );

  // Datos del documento
  const titulo = (meta && meta.titulo) || ('Ticket ' + (lista[0].nro || ''));
  const numInfo = agregar(
    Buffer.concat([
      textoPdf('<< /Title ('),
      textoPdf(aWinAnsi(titulo).toString('latin1').replace(/([()\\])/g, '\\$1')),
      textoPdf(') /Producer (Pesada de Balanza) /Creator (Pesada de Balanza) >>'),
    ])
  );

  /* ── Serializar con la tabla de posiciones (xref) ── */
  const partes = [textoPdf('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let posicion = partes[0].length;
  const posiciones = [];

  objetos.forEach((cuerpo, i) => {
    const encabezado = textoPdf(i + 1 + ' 0 obj\n');
    const cierre = textoPdf('\nendobj\n');
    posiciones.push(posicion);
    partes.push(encabezado, cuerpo, cierre);
    posicion += encabezado.length + cuerpo.length + cierre.length;
  });

  const inicioXref = posicion;
  let xref = 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n';
  for (const p of posiciones) {
    xref += String(p).padStart(10, '0') + ' 00000 n \n';
  }
  xref +=
    'trailer\n<< /Size ' + (objetos.length + 1) +
    ' /Root ' + numCatalogo + ' 0 R' +
    ' /Info ' + numInfo + ' 0 R >>\n' +
    'startxref\n' + inicioXref + '\n%%EOF\n';

  partes.push(textoPdf(xref));
  return Buffer.concat(partes);
}

/** Nombre de archivo prolijo para compartir por WhatsApp. */
function nombreArchivo(tickets) {
  const lista = Array.isArray(tickets) ? tickets : [tickets];
  if (lista.length === 1) {
    const t = lista[0];
    const partes = ['ticket', t.nro || '', (t.patentes || '').replace(/\s+/g, '')];
    return partes.filter(Boolean).join('-').replace(/[^\w.-]/g, '') + '.pdf';
  }
  return 'tickets-' + lista.length + '.pdf';
}

module.exports = { generarPdf, nombreArchivo, ANCHO_MM, ALTO_MM };
