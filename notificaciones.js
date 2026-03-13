/**
 * notificaciones.js
 * Envía avisos por email (nodemailer/Gmail) y WhatsApp (CallMeBot)
 * cuando se graba un ticket de TARA FINAL o REGULADA.
 *
 * Variables de entorno requeridas:
 *   EMAIL_USER      → cuenta Gmail remitente, ej: tucuenta@gmail.com
 *   EMAIL_PASS      → App Password de Gmail (16 chars, sin espacios)
 *   EMAIL_TO        → destinatarios separados por coma, ej: a@x.com,b@y.com
 *
 *   WHATSAPP_RECIPIENTS → lista "phone:apikey" separados por coma
 *                         ej: 5491112345678:abc123,5491187654321:xyz456
 *                         Cada destinatario debe haber activado CallMeBot
 *                         enviando "I allow callmebot to send me messages"
 *                         al +1 (202) 858-1acceso de CallMeBot una sola vez.
 *                         Instrucciones: https://www.callmebot.com/blog/free-api-whatsapp-messages/
 */

'use strict';

const nodemailer = require('nodemailer');
const https = require('https');

/* ─────────────────────────────────────────────────────────────
 * Helpers internos
 * ───────────────────────────────────────────────────────────── */

/**
 * Parsea la variable WHATSAPP_RECIPIENTS en un array de objetos {phone, apikey}
 */
function parsearDestinatariosWA() {
  const raw = (process.env.WHATSAPP_RECIPIENTS || '').trim();
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(par => {
    const [phone, apikey] = par.split(':');
    return { phone: (phone || '').trim(), apikey: (apikey || '').trim() };
  }).filter(d => d.phone && d.apikey);
}

/**
 * Envía un mensaje WhatsApp vía CallMeBot a un destinatario.
 * No lanza excepción — sólo loguea si falla, para no interrumpir el flujo principal.
 */
function enviarWA(phone, apikey, mensaje) {
  return new Promise((resolve) => {
    const texto = encodeURIComponent(mensaje);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${texto}&apikey=${apikey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`[Notif WA] Error para ${phone}: HTTP ${res.statusCode} – ${data}`);
        }
        resolve();
      });
    }).on('error', (err) => {
      console.error(`[Notif WA] Error de red para ${phone}:`, err.message);
      resolve();
    });
  });
}

/**
 * Envía email vía Gmail.
 * Si EMAIL_USER / EMAIL_PASS / EMAIL_TO no están configurados, sólo loguea y omite.
 */
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
 * @param {'TARA FINAL'|'REGULADA'} opts.tipo   Tipo de ticket completado
 * @param {string}  opts.patentes               Patente(s) del vehículo
 * @param {string}  opts.idTicket               ID del ticket
 * @param {string}  opts.fecha                  Fecha del registro (ej: 2025-03-13)
 * @param {number}  [opts.tara]                 Peso tara en kg (opcional)
 * @param {number}  [opts.bruto]                Peso bruto en kg (opcional)
 * @param {number}  [opts.neto]                 Peso neto en kg (opcional)
 * @param {string}  [opts.campo]                Campo (solo REGULADA)
 * @param {string}  [opts.grano]                Grano (solo REGULADA)
 * @param {string}  [opts.lote]                 Lote (solo REGULADA)
 * @param {string}  [opts.usuario]              Usuario que grabó
 */
async function notificar(opts) {
  try {
    const { tipo, patentes, idTicket, fecha, tara, bruto, neto, campo, grano, lote, usuario } = opts;

    // ── Texto plano (WhatsApp)
    let lineas = [
      `✅ Nuevo ticket ${tipo} grabado`,
      `📋 ID: ${idTicket}`,
      `🚛 Patente: ${patentes}`,
      `📅 Fecha: ${fecha}`,
    ];
    if (usuario)   lineas.push(`👤 Usuario: ${usuario}`);
    if (tara  != null) lineas.push(`⚖️ Tara: ${tara} kg`);
    if (bruto != null) lineas.push(`⬆️ Bruto: ${bruto} kg`);
    if (neto  != null) lineas.push(`📦 Neto: ${neto} kg`);
    if (campo)     lineas.push(`🌾 Campo: ${campo}`);
    if (grano)     lineas.push(`🌱 Grano: ${grano}`);
    if (lote)      lineas.push(`📍 Lote: ${lote}`);

    const mensajeWA = lineas.join('\n');

    // ── HTML para email
    const filas = lineas.map(l => `<tr><td>${l}</td></tr>`).join('');
    const cuerpoHtml = `
      <h2 style="color:#2c7be5">Pesada Balanza – ${tipo} grabado</h2>
      <table cellpadding="6" style="font-size:15px;border-collapse:collapse">
        ${filas}
      </table>
    `;

    // ── Enviar en paralelo (no bloqueante)
    const promesas = [];

    // Email
    promesas.push(enviarEmail(`[Pesada Balanza] ${tipo} – Patente ${patentes}`, cuerpoHtml));

    // WhatsApp
    const destinatariosWA = parsearDestinatariosWA();
    for (const d of destinatariosWA) {
      promesas.push(enviarWA(d.phone, d.apikey, mensajeWA));
    }

    // Disparamos sin esperar — no queremos que un error de notificación
    // bloquee la respuesta al usuario
    Promise.all(promesas).catch(err => {
      console.error('[Notif] Error inesperado en notificaciones:', err.message);
    });

  } catch (err) {
    console.error('[Notif] Error al construir notificación:', err.message);
  }
}

module.exports = { notificar };
