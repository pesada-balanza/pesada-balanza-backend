'use strict';

/**
 * api-externa.js — LECTURA de los camiones pesados, para otros programas
 * =============================================================================
 * Existe para que el programa de cartas de porte arme cada carta con los datos
 * ya pesados, en vez de que alguien los vuelva a tipear mirando la pantalla.
 *
 * ▸ SOLO LEE. No hay forma de escribir, modificar ni borrar nada desde acá.
 *   Aunque el token se filtre, lo peor que puede pasar es que alguien vea los
 *   pesos de los últimos 30 días; no que toque la base.
 *
 * ▸ POR QUÉ UNA API Y NO LA BASE DIRECTO. Dar la cadena de conexión de Mongo
 *   sería más rápido de armar y mucho peor: quien la tiene puede leer, cambiar
 *   y borrar cualquier cosa; la contraseña vive adentro de un programa que no
 *   controlamos; cada PC nueva hay que habilitarla por IP en Atlas —ya pasó con
 *   el worker de WhatsApp al cambiar de máquina—; una consulta mal hecha desde
 *   afuera puede trabar la base en plena descarga; y los nombres de los campos
 *   pasarían a ser un contrato que no se puede tocar más.
 *
 *   Acá los nombres son PROPIOS DE LA API y no los de la base a propósito: el
 *   CTG sale como `ctg` aunque adentro se llame `cp`. Así se puede renombrar lo
 *   de adentro sin romperle nada a nadie.
 *
 * ▸ APAGADA POR DEFECTO. Sin la variable API_EXTERNA_TOKEN no existe ni la
 *   dirección: responde 404 como cualquier página que no está. Mismo criterio
 *   que APP_MOVIL y WEB_ANTERIOR.
 *
 * ▸ EL TOKEN NO VA EN EL CÓDIGO. Este repositorio es PÚBLICO. Se carga en
 *   Render → el servicio → Environment → Environment Variables.
 *
 * La especificación para quien programa del otro lado está en API_EXTERNA.md.
 */

const express = require('express');
const crypto = require('crypto');

/** Hasta dónde se puede mirar para atrás. Acordado con el uso: 30 días. */
const DIAS_VENTANA = 30;

/** Tope de camiones por respuesta. 30 días dan ~1.400; 5.000 deja aire. */
const MAXIMO_CAMIONES = 5000;

/**
 * Largo mínimo del token. Con menos, un token se adivina probando. Si el que
 * está configurado es más corto, la API NO se enciende: es preferible que no
 * ande y se note, a que ande mal y no se note.
 */
const LARGO_MINIMO_TOKEN = 24;

/** Pedidos por minuto y por IP. Es una integración, no un sitio público. */
const PEDIDOS_POR_MINUTO = 60;

module.exports = function crearApiExterna(deps) {
  const { colRegistros, ymd, nombreBalanza, normalizarCampo, normalizarSocio } = deps;

  const router = express.Router();
  const token = String(process.env.API_EXTERNA_TOKEN || '').trim();

  if (!token) {
    console.log('[API externa] APAGADA. Para encenderla, cargá API_EXTERNA_TOKEN en Render.');
    return null;
  }
  if (token.length < LARGO_MINIMO_TOKEN) {
    console.error(`[API externa] APAGADA: el token tiene ${token.length} caracteres y el mínimo ` +
      `son ${LARGO_MINIMO_TOKEN}. Generá uno largo (por ejemplo: openssl rand -hex 32).`);
    return null;
  }
  const tokenBuf = Buffer.from(token, 'utf8');

  /**
   * Compara el token sin filtrar por el tiempo que tarda.
   *
   * Un `===` común corta en la primera letra distinta, y midiendo cuánto tarda
   * se puede ir adivinando el token letra por letra. `timingSafeEqual` siempre
   * tarda lo mismo. Exige el mismo largo, así que eso se mira antes.
   */
  function tokenValido(recibido) {
    const buf = Buffer.from(String(recibido || ''), 'utf8');
    if (buf.length !== tokenBuf.length) return false;
    try {
      return crypto.timingSafeEqual(buf, tokenBuf);
    } catch (_) {
      return false;
    }
  }

  /** Saca el token de `Authorization: Bearer <token>`. */
  function tokenDelPedido(req) {
    const cab = String(req.get('authorization') || '');
    const m = /^Bearer\s+(.+)$/i.exec(cab.trim());
    return m ? m[1].trim() : '';
  }

  const golpes = new Map();   // ip → { hasta, cuantos }

  function limitar(req, res, next) {
    const ip = req.ip || 'sin-ip';
    const ahora = Date.now();
    const v = golpes.get(ip);
    if (!v || ahora > v.hasta) {
      golpes.set(ip, { hasta: ahora + 60000, cuantos: 1 });
    } else if (++v.cuantos > PEDIDOS_POR_MINUTO) {
      return res.status(429).json({ ok: false, error: 'Demasiados pedidos. Esperá un minuto.' });
    }
    // Que el mapa no crezca para siempre con IPs que no vuelven.
    if (golpes.size > 500) {
      for (const [k, x] of golpes) if (ahora > x.hasta) golpes.delete(k);
    }
    return next();
  }

  function exigirToken(req, res, next) {
    if (!tokenValido(tokenDelPedido(req))) {
      // Sin detalles: decir "falta el token" o "el token está mal" le confirma
      // a quien prueba cuál de las dos cosas le falta.
      console.warn(`[API externa] Pedido rechazado desde ${req.ip}.`);
      return res.status(401).json({ ok: false, error: 'No autorizado.' });
    }
    return next();
  }

  /** Fecha YYYY-MM-DD válida, o null. */
  function fechaValida(v) {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) ? s : null;
  }

  /**
   * El rango que se va a consultar, siempre adentro de la ventana de 30 días.
   *
   * Sin fechas, los últimos 30 días. Con fechas, lo pedido RECORTADO a la
   * ventana: pedir el año pasado no devuelve vacío ni falla, devuelve lo que sí
   * se puede ver. Al revés se da vuelta, como en el Excel.
   */
  function rangoPedido(query) {
    const hoy = ymd(new Date());
    const tope = ymd(new Date(Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000));
    let desde = fechaValida(query.desde) || tope;
    let hasta = fechaValida(query.hasta) || hoy;
    if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }
    if (desde < tope) desde = tope;
    if (hasta > hoy) hasta = hoy;
    return { desde, hasta, tope };
  }

  /** Lo que la API promete devolver. Los nombres son de la API, no de la base. */
  function comoCamion(r) {
    return {
      ticket: r.nroApp || String(r.idTicket || ''),
      fecha: r.fecha || '',
      fechaRegulada: r.fechaRegulada || '',
      balanza: nombreBalanza(r.codigoIngreso) || '',
      cargaPara: r.cargaPara || '',
      socio: r.cargaPara === 'SOCIO' ? normalizarSocio(r.socio) : '',
      transporte: r.transporte || '',
      patentes: String(r.patentes || '').replace(/\s+/g, ' ').trim(),
      chofer: r.chofer || '',
      campo: normalizarCampo(r.campo) || '',
      grano: r.grano || '',
      lotes: Array.isArray(r.lote) ? r.lote : (r.lote ? [String(r.lote)] : []),
      cargoDe: r.cargoDe || '',
      silobolsas: Array.isArray(r.silobolsas)
        ? r.silobolsas.map((b) => ({ nro: String((b && b.nro) || ''), kg: Number((b && b.kg) || 0) }))
        : [],
      tara: Number(r.tara) || 0,
      brutoLote: Number(r.brutoLote) || 0,
      bruto: Number(r.bruto) || 0,
      neto: Number(r.neto) || 0,
      // `cp` adentro; acá sale con el nombre que usa todo el mundo.
      ctg: String(r.cp || ''),
      comentarios: r.comentarios || '',
    };
  }

  /**
   * GET /api/externo/camiones?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
   *
   * Los camiones con la REGULADA CERRADA, de todas las balanzas. Solo esos:
   * hasta que la regulada no se cierra no hay neto pesado, y una carta de porte
   * armada con un neto estimado estaría mal.
   */
  router.get('/camiones', limitar, exigirToken, async (req, res) => {
    try {
      const { desde, hasta, tope } = rangoPedido(req.query);

      const docs = await colRegistros()
        .find(
          {
            fecha: { $gte: desde, $lte: hasta },
            anulado: { $ne: true },
            fechaRegulada: { $exists: true },
          },
          {
            projection: {
              nroApp: 1, idTicket: 1, fecha: 1, fechaRegulada: 1, codigoIngreso: 1,
              cargaPara: 1, socio: 1, transporte: 1, patentes: 1, chofer: 1,
              campo: 1, grano: 1, lote: 1, cargoDe: 1, silobolsas: 1,
              tara: 1, brutoLote: 1, bruto: 1, neto: 1, cp: 1, comentarios: 1,
            },
            sort: { idTicket: 1 },
            limit: MAXIMO_CAMIONES + 1,
          }
        )
        .toArray();

      const truncado = docs.length > MAXIMO_CAMIONES;
      const camiones = docs.slice(0, MAXIMO_CAMIONES).map(comoCamion);

      console.log(`[API externa] ${camiones.length} camiones de ${desde} a ${hasta} ` +
        `para ${req.ip}${truncado ? ' (cortado por el tope)' : ''}.`);

      return res.json({
        ok: true,
        desde,
        hasta,
        // Para que del otro lado sepan que no es un error que falte lo viejo.
        ventanaDesde: tope,
        total: camiones.length,
        truncado,
        generado: new Date().toISOString(),
        camiones,
      });
    } catch (err) {
      console.error('[API externa] Error al listar camiones:', err.message);
      return res.status(500).json({ ok: false, error: 'Error interno.' });
    }
  });

  /** Para probar la conexión y el token sin traerse datos. */
  router.get('/ping', limitar, exigirToken, (req, res) => {
    res.json({ ok: true, servicio: 'pesada-balanza', ventanaDias: DIAS_VENTANA,
      ahora: new Date().toISOString() });
  });

  /* Cualquier otra dirección abajo de /api/externo no existe. Sin esto, un
     error de tipeo devolvería el HTML de la página de error del sitio, que a un
     programa que espera JSON lo confunde. */
  router.use((req, res) => res.status(404).json({ ok: false, error: 'No existe.' }));

  console.log(`[API externa] ENCENDIDA en /api/externo (solo lectura, ${DIAS_VENTANA} días).`);
  return router;
};

module.exports.DIAS_VENTANA = DIAS_VENTANA;
module.exports.MAXIMO_CAMIONES = MAXIMO_CAMIONES;
module.exports.LARGO_MINIMO_TOKEN = LARGO_MINIMO_TOKEN;
