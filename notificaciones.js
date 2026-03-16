/**
 * notificaciones.js
 * Envía avisos por email (nodemailer/Gmail) cuando se graba
 * un ticket de TARA FINAL o REGULADA.
 *
 * Variables de entorno requeridas:
 *   EMAIL_USER  → cuenta Gmail remitente, ej: tucuenta@gmail.com
 *   EMAIL_PASS  → App Password de Gmail (16 chars, sin espacios)
 *   EMAIL_TO    → destinatarios separados por coma, ej: a@x.com,b@y.com
 */

'use strict';

const nodemailer = require('nodemailer');

/* ─────────────────────────────────────────────────────────────
 * Mapeo de códigos de ingreso → nombre del puesto/campo
 * ───────────────────────────────────────────────────────────── */
const CODIGOS_NOMBRE = {
  '56781': 'GENERAL',
  '5679':  'EL MATACO',
  '5680':  'LA PRADERA',
  '5681':  'EL C1',
  '5682':  'EL WICHI',
  '5683':  'LA JUANITA',
  '5684':  'QUIMILI',
  '5685':  'NASICH',
};

function resolverNombreCodigo(codigo) {
  if (!codigo) return '';
  return CODIGOS_NOMBRE[String(codigo).trim()] || String(codigo).trim();
}

/* ─────────────────────────────────────────────────────────────
 * Envío de email
 * ───────────────────────────────────────────────────────────── */
async function enviarEmail(asunto, cuerpoHtml) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const to   = process.env.EMAIL_TO;

  if (!user || !pass || !to) {
    console.warn('[Notif Email] Variables EMAIL_USER / EMAIL_PASS / EMAIL_TO no configuradas. Se omite email.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Pesada Balanza" <${user}>`,
      to,
      subject: asunto,
      html: cuerpoHtml,
    });
    console.log(`[Notif Email] Email enviado a: ${to}`);
  } catch (err) {
    console.error('[Notif Email] Error al enviar email:', err.message);
  }
}

/* ─────────────────────────────────────────────────────────────
 * Función principal de notificación
 * ───────────────────────────────────────────────────────────── */

/**
 * @param {object} opts
 * @param {'TARA FINAL'|'REGULADA'} opts.tipo         Tipo de ticket completado
 * @param {string}  opts.patentes                     Patente(s) del vehículo
 * @param {string}  opts.idTicket                     ID del ticket
 * @param {string}  opts.fecha                        Fecha del registro (ej: 2025-03-13)
 * @param {string}  [opts.codigoIngreso]              Código que grabó el ticket
 * @param {number}  [opts.tara]                       Peso tara en kg
 * @param {number}  [opts.bruto]                      Peso bruto en kg
 * @param {number}  [opts.neto]                       Peso neto en kg
 * @param {string}  [opts.campo]                      Campo (solo REGULADA)
 * @param {string}  [opts.grano]                      Grano (solo REGULADA)
 * @param {string}  [opts.lote]                       Lote (solo REGULADA)
 */
async function notificar(opts) {
  try {
    const { tipo, patentes, idTicket, fecha, codigoIngreso, tara, bruto, neto, campo, grano, lote } = opts;

    const origen = resolverNombreCodigo(codigoIngreso);

    // ── Filas de la tabla HTML
    const filas = [
      ['Ticket',   tipo],
      ['ID',       idTicket],
      ['Patente',  patentes],
      ['Fecha',    fecha],
      origen ? ['Origen', origen] : null,
      tara  != null ? ['Tara',  `${tara} kg`]  : null,
      bruto != null ? ['Bruto', `${bruto} kg`] : null,
      neto  != null ? ['Neto',  `${neto} kg`]  : null,
      campo ? ['Campo', campo] : null,
      grano ? ['Grano', grano] : null,
      lote  ? ['Lote',  lote]  : null,
    ].filter(Boolean);

    const filasHtml = filas.map(([k, v]) => `
      <tr>
        <td style="padding:6px 12px;font-weight:600;color:#555;white-space:nowrap">${k}</td>
        <td style="padding:6px 12px">${v}</td>
      </tr>`).join('');

    const cuerpoHtml = `
      <div style="font-family:Arial,sans-serif;max-width:480px">
        <h2 style="color:#2c7be5;margin-bottom:4px">Pesada Balanza</h2>
        <p style="color:#888;margin-top:0">Nuevo registro grabado</p>
        <table cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;width:100%;font-size:15px;border:1px solid #e0e0e0;border-radius:6px">
          ${filasHtml}
        </table>
      </div>
    `;

    const asunto = `[Pesada Balanza] ${tipo}${origen ? ' – ' + origen : ''} – Patente ${patentes}`;

    // Disparamos sin esperar para no bloquear la respuesta al usuario
    enviarEmail(asunto, cuerpoHtml).catch(err => {
      console.error('[Notif] Error inesperado:', err.message);
    });

  } catch (err) {
    console.error('[Notif] Error al construir notificación:', err.message);
  }
}

module.exports = { notificar, resolverNombreCodigo };
