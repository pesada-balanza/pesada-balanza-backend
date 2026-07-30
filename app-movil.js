'use strict';

/**
 * app-movil.js — APP MÓVIL "Pesada de Balanza" (PWA)
 * =============================================================================
 * TODO lo de la app móvil vive en este archivo y cuelga del prefijo /app.
 *
 * REGLA DE ORO: la web actual no se toca.
 *  - Ninguna ruta, vista ni reporte existente se modifica.
 *  - En app.js hay un único bloque que engancha este router, y solo si la
 *    variable de entorno APP_MOVIL vale '1'. Apagada, la app no existe.
 *  - Se escribe en la MISMA colección `registros`, con los MISMOS nombres de
 *    campo que usa la web, para que los tickets cargados desde el teléfono
 *    aparezcan solos en Ver Registros, en el Excel y en el mail de las 19hs.
 *  - Los datos que solo necesita la app (nombre del día, pedidos, numeración,
 *    idempotencia) van en colecciones NUEVAS y separadas: app_dias,
 *    app_pedidos, app_contadores, app_numeros, app_localids.
 *  - Los campos que la app agrega al registro son opcionales y aditivos
 *    (nroApp, origen, cargadoPor, appImpreso, appLocalId): la web los ignora.
 *
 * Las dependencias (listas de campos, validadores, notificador) se reciben por
 * parámetro desde app.js para no duplicar datos que se desincronizarían.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { generarPdf, nombreArchivo } = require('./app-movil-pdf');

module.exports = function crearAppMovil(deps) {
  const {
    campos,
    datosSiembra,
    getContratistas,
    campoUsuario,
    codigosIngreso,
    codigosObservacion,
    ingresoAObservacion,
    ymd,
    validarNumero,
    ticketVigente,
    notificar,
    resolverNombreCodigo,
  } = deps;

  const router = express.Router();

  /* =========================================================================
   * ACCESO A COLECCIONES
   * ======================================================================= */
  const db = () => mongoose.connection.db;
  const colRegistros = () => db().collection('registros');
  const colAuditoria = () => db().collection('registros_auditoria');
  // Colecciones propias de la app móvil
  const colDias = () => db().collection('app_dias');
  const colPedidos = () => db().collection('app_pedidos');
  const colContadores = () => db().collection('app_contadores');
  const colNumeros = () => db().collection('app_numeros');
  const colLocalIds = () => db().collection('app_localids');

  /* =========================================================================
   * UTILIDADES
   * ======================================================================= */

  const CODIGO_GENERAL_INGRESO = '56781';
  const CODIGO_GENERAL_OBSERVACION = '12341';

  // Vigencias: iguales a las de la web (app.js), para no inventar reglas nuevas.
  const DIAS_CAMIONES_A_TARA_FINAL = 1;
  const DIAS_TARA_FINAL_A_REGULADA = 5;

  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /** Fecha local de Argentina en YYYY-MM-DD (el `ymd` de app.js usa UTC). */
  function hoyStr() {
    return ymd(new Date());
  }

  /** "lunes 27" a partir de YYYY-MM-DD. */
  function diaBonito(fechaStr) {
    const d = new Date(fechaStr + 'T12:00:00Z');
    return DIAS_SEMANA[d.getUTCDay()] + ' ' + d.getUTCDate();
  }

  /** "27/07" a partir de YYYY-MM-DD. */
  function fechaCorta(fechaStr) {
    const p = String(fechaStr || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : String(fechaStr || '');
  }

  /** "27/07/2026" */
  function fechaLarga(fechaStr) {
    const p = String(fechaStr || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(fechaStr || '');
  }

  /** Miles con punto, como en el diseño (312.480). */
  function kg(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return Math.round(v).toLocaleString('es-AR');
  }

  function horaCorta(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  }

  /** Nombre corto de la balanza a partir del código de ingreso. */
  function nombreBalanza(codigoIngreso) {
    const n = resolverNombreCodigo(codigoIngreso);
    if (!n) return '';
    // "EL MATACO" → "El Mataco"
    return n
      .toLowerCase()
      .split(' ')
      .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
      .join(' ');
  }

  /** Nombre del establecimiento del campo elegido: "El 44 - ARBOL BLANCO - SE" → "El 44". */
  function nombreCampoCorto(campo) {
    return String(campo || '').split(' - ')[0].trim();
  }

  function idValido(id) {
    return mongoose.Types.ObjectId.isValid(String(id || ''));
  }

  function oid(id) {
    return new mongoose.Types.ObjectId(String(id));
  }

  function fallar(res, codigo, mensaje) {
    return res.status(codigo).json({ ok: false, error: mensaje });
  }

  /** Aplana un valor que puede venir array o string (misma idea que `flat` en app.js). */
  function plano(v) {
    if (Array.isArray(v)) return v.join(', ');
    return v == null ? '' : String(v);
  }

  /** Normaliza a array limpio sin duplicados (misma idea que `toArr` en app.js). */
  function aArray(v) {
    let arr;
    if (Array.isArray(v)) arr = v;
    else if (typeof v === 'string' && v.trim() !== '') arr = [v];
    else return [];
    const out = [];
    const vistos = new Set();
    for (const x of arr) {
      const s = String(x).trim();
      if (s && !vistos.has(s)) {
        vistos.add(s);
        out.push(s);
      }
    }
    return out;
  }

  /** Normaliza una patente para comparar: sin espacios, mayúsculas. */
  function patenteClave(p) {
    return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* =========================================================================
   * NUMERACIÓN DE TICKETS DE LA APP  (1-0001, 1-0002, ...)
   * -------------------------------------------------------------------------
   * El número lo da SIEMPRE la base de datos, nunca el teléfono. Para que se
   * pueda cargar e imprimir sin señal, el teléfono pide de antemano un bloque
   * de números reservados y los va consumiendo. Un número reservado que no se
   * usa queda quemado: no se reasigna nunca (misma regla que un ticket anulado).
   * ======================================================================= */

  const NUMEROS_POR_SERIE = 9999;
  const RESERVA_MAXIMA = 10;

  function formatearNro(seq) {
    const serie = Math.floor((seq - 1) / NUMEROS_POR_SERIE) + 1;
    const num = ((seq - 1) % NUMEROS_POR_SERIE) + 1;
    return serie + '-' + String(num).padStart(4, '0');
  }

  /** Compatibilidad entre versiones del driver de Mongo (con y sin .value). */
  function docDeResultado(r) {
    if (!r) return null;
    return r.value !== undefined ? r.value : r;
  }

  /**
   * Reserva `cantidad` números de forma atómica ($inc sobre un único documento).
   * Devuelve [{ seq, nro }, ...].
   */
  async function reservarNumeros(cantidad, codigoIngreso) {
    const cant = Math.max(1, Math.min(RESERVA_MAXIMA, parseInt(cantidad, 10) || 1));
    const r = await colContadores().findOneAndUpdate(
      { _id: 'nroApp' },
      { $inc: { seq: cant } },
      { upsert: true, returnDocument: 'after' }
    );
    const doc = docDeResultado(r);
    const fin = doc && Number.isFinite(Number(doc.seq)) ? Number(doc.seq) : cant;
    const desde = fin - cant + 1;

    const numeros = [];
    const docs = [];
    for (let s = desde; s <= fin; s++) {
      const nro = formatearNro(s);
      numeros.push({ seq: s, nro });
      docs.push({
        _id: nro,
        seq: s,
        codigoIngreso: codigoIngreso || '',
        estado: 'RESERVADO',
        creadoEn: new Date(),
      });
    }
    if (docs.length) {
      try {
        await colNumeros().insertMany(docs, { ordered: false });
      } catch (err) {
        // Un número ya registrado no debe romper la reserva: el contador es la
        // fuente de verdad y de todos modos ese número no se reutiliza.
        console.warn('[app-movil] reservarNumeros:', err.message);
      }
    }
    return numeros;
  }

  /**
   * Toma el número que va a llevar un ticket nuevo.
   * Si el teléfono manda uno reservado, se valida y se marca usado.
   * Si no manda ninguno (estaba con señal), se reserva uno en el momento.
   */
  async function tomarNumero(nroPedido, codigoIngreso) {
    const nro = String(nroPedido || '').trim();
    if (nro) {
      const r = await colNumeros().findOneAndUpdate(
        { _id: nro, estado: 'RESERVADO' },
        { $set: { estado: 'USADO', usadoEn: new Date(), codigoIngreso: codigoIngreso || '' } },
        { returnDocument: 'after' }
      );
      const doc = docDeResultado(r);
      if (doc) return doc._id;
      // El número no existía o ya estaba usado: se descarta y se da uno nuevo.
    }
    const [nuevo] = await reservarNumeros(1, codigoIngreso);
    await colNumeros().updateOne(
      { _id: nuevo.nro },
      { $set: { estado: 'USADO', usadoEn: new Date() } }
    );
    return nuevo.nro;
  }

  /**
   * ID interno del ticket, con el MISMO criterio que la web (`calculateNextIdTicket`
   * en app.js): último idTicket + 1. Se conserva para que Ver Registros, el Excel
   * y el mail de las 19hs sigan ordenando igual. El número que se imprime y se le
   * entrega al chofer es `nroApp`.
   */
  async function siguienteIdTicket() {
    const ultimo = await colRegistros()
      .find({}, { projection: { idTicket: 1 } })
      .sort({ idTicket: -1 })
      .limit(1)
      .toArray();
    return ultimo.length ? parseInt(ultimo[0].idTicket, 10) + 1 : 1;
  }

  /* =========================================================================
   * ÍNDICES (una sola vez, sobre colecciones propias de la app)
   * La colección `registros` NO se toca: la idempotencia se resuelve con la
   * colección aparte app_localids.
   * ======================================================================= */
  let indicesListos = false;
  async function asegurarIndices() {
    if (indicesListos) return;
    indicesListos = true;
    try {
      await colLocalIds().createIndex({ localId: 1 }, { unique: true });
      await colDias().createIndex({ codigoIngreso: 1, fecha: 1 }, { unique: true });
      await colPedidos().createIndex({ estado: 1, creadoEn: -1 });
      await colPedidos().createIndex({ registroId: 1 });
    } catch (err) {
      console.warn('[app-movil] No se pudieron crear índices:', err.message);
    }
  }

  /* =========================================================================
   * SESIÓN DE LA APP
   * -------------------------------------------------------------------------
   * Namespace propio (`req.session.app`) para no pisar las claves que usa la
   * web (`req.session.autenticado`, `tipo`, etc.). Entrar a la app NO da acceso
   * a la web, y viceversa.
   * ======================================================================= */

  const DURACION_SESION_APP = 30 * 24 * 60 * 60 * 1000; // 30 días, renovada en cada uso

  function sesionApp(req) {
    return (req.session && req.session.app) || null;
  }

  function renovarSesion(req) {
    if (req.session && req.session.app && req.session.cookie) {
      req.session.cookie.maxAge = DURACION_SESION_APP;
    }
  }

  /** Exige sesión de app. Los endpoints /api responden JSON; las pantallas redirigen. */
  function exigirApp(req, res, next) {
    const s = sesionApp(req);
    if (!s || !s.ok) {
      if (/^\/api\//.test(req.path)) return fallar(res, 401, 'Sesión vencida. Volvé a entrar con el código.');
      return res.redirect('/app/ingreso');
    }
    renovarSesion(req);
    return next();
  }

  /** Exige rol balancero (tiene una balanza asignada y puede cargar). */
  function exigirBalancero(req, res, next) {
    const s = sesionApp(req);
    if (!s || !s.codigoIngreso) {
      if (/^\/api\//.test(req.path)) return fallar(res, 403, 'Este código no carga pesadas.');
      return res.redirect('/app/general');
    }
    return next();
  }

  /** Exige rol GENERAL (código de observación 12341). */
  function exigirGeneral(req, res, next) {
    const s = sesionApp(req);
    if (!s || !s.esGeneral) {
      if (/^\/api\//.test(req.path)) return fallar(res, 403, 'Solo GENERAL puede hacer esto.');
      return res.status(403).render('app/error', {
        layout: 'app/layout',
        titulo: 'Sin permiso',
        mensaje: 'Esta pantalla es solo para GENERAL.',
        volver: '/app',
      });
    }
    return next();
  }

  /* =========================================================================
   * NOMBRE DEL DÍA  (ref. 6b)
   * ======================================================================= */

  async function nombreDelDia(codigoIngreso, fecha) {
    const doc = await colDias().findOne({ codigoIngreso, fecha });
    return doc ? doc.nombre : '';
  }

  async function ultimosNombres(codigoIngreso, limite) {
    const docs = await colDias()
      .find({ codigoIngreso })
      .sort({ fecha: -1 })
      .limit(30)
      .toArray();
    const out = [];
    const vistos = new Set();
    for (const d of docs) {
      const n = String(d.nombre || '').trim();
      if (n && !vistos.has(n)) {
        vistos.add(n);
        out.push(n);
      }
      if (out.length >= (limite || 6)) break;
    }
    return out;
  }

  /** Exige que ya esté cargado el nombre de quien está hoy en la balanza. */
  async function exigirNombreDia(req, res, next) {
    try {
      const s = sesionApp(req);
      const nombre = await nombreDelDia(s.codigoIngreso, hoyStr());
      if (!nombre) {
        if (/^\/api\//.test(req.path)) return fallar(res, 428, 'Falta el nombre de quien está hoy en la balanza.');
        return res.redirect('/app/dia');
      }
      req.nombreDia = nombre;
      return next();
    } catch (err) {
      return siguienteError(err, req, res);
    }
  }

  function siguienteError(err, req, res) {
    console.error('[app-movil]', err);
    if (/^\/api\//.test(req.path)) return fallar(res, 500, 'Error interno. Probá de nuevo.');
    return res.status(500).render('app/error', {
      layout: 'app/layout',
      titulo: 'Algo salió mal',
      mensaje: 'No se pudo completar la operación. Probá de nuevo en un rato.',
      volver: '/app',
    });
  }

  /* =========================================================================
   * CONSULTAS DEL PATIO
   * ======================================================================= */

  /**
   * Camiones abiertos de una balanza: los que todavía no cerraron la REGULADA.
   * Respeta las vigencias de la web para no ofrecer pasos que el backend rechaza.
   */
  async function camionesAbiertos(codigoIngreso) {
    const docs = await colRegistros()
      .find({
        codigoIngreso,
        pesadaPara: 'CAMIONES',
        anulado: { $ne: true },
        confirmada: { $ne: true },
      })
      .sort({ idTicket: -1 })
      .toArray();

    const hoy = hoyStr();
    const pedidos = await pedidosPorRegistro(docs.map((d) => d._id));

    const out = [];
    for (const r of docs) {
      const tieneTaraFinal = !!r.fechaTaraFinal;
      // Sin TARA FINAL, el ticket de CAMIONES vive 1 día (regla de la web).
      if (!tieneTaraFinal && !ticketVigente(r.fecha, DIAS_CAMIONES_A_TARA_FINAL)) continue;
      // Con TARA FINAL, hay 5 días para la REGULADA (regla de la web).
      if (tieneTaraFinal && !ticketVigente(r.fecha, DIAS_TARA_FINAL_A_REGULADA)) continue;

      const pedido = pedidos[String(r._id)] || null;
      out.push({
        id: String(r._id),
        idTicket: r.idTicket,
        nro: r.nroApp || (r.idTicket != null ? String(r.idTicket) : ''),
        patentes: r.patentes || '',
        transporte: r.transporte || '',
        chofer: r.chofer || '',
        campo: r.campo || '',
        campoCorto: nombreCampoCorto(r.campo),
        brutoEstimado: r.brutoEstimado || 0,
        tara: r.tara || 0,
        fecha: r.fecha,
        fechaTaraFinal: r.fechaTaraFinal || '',
        fechaTaraFinalCorta: r.fechaTaraFinal ? fechaCorta(r.fechaTaraFinal) : '',
        paso: tieneTaraFinal ? 'REGULADA' : 'TARA_FINAL',
        sinImprimir: tieneTaraFinal && r.appImpreso !== true,
        sinRegularDeAyer: tieneTaraFinal && r.fechaTaraFinal < hoy,
        pedido: pedido ? { tipo: pedido.tipo, estado: pedido.estado, enviado: true } : null,
        origenApp: r.origen === 'app',
      });
    }
    return out;
  }

  async function pedidosPorRegistro(ids) {
    if (!ids || !ids.length) return {};
    const docs = await colPedidos()
      .find({ registroId: { $in: ids }, estado: 'PENDIENTE' })
      .toArray();
    const map = {};
    for (const p of docs) map[String(p.registroId)] = p;
    return map;
  }

  /* =========================================================================
   * ESTÁTICOS Y PWA  (todo detrás del flag, junto con el resto)
   * ======================================================================= */

  /* =========================================================================
   * COMPRIMIR LO QUE VIAJA
   * -------------------------------------------------------------------------
   * La app se usa en el campo, con señal mala y teléfonos de gama media. Todo
   * lo que manda la app es texto (HTML, CSS, JS, JSON), que comprime muy bien:
   * baja a la cuarta parte. Se usa el zlib que ya trae Node, así que no se
   * agrega ninguna librería, y solo aplica a /app: la web no se toca.
   * ======================================================================= */
  const zlib = require('zlib');
  const MINIMO_PARA_COMPRIMIR = 1024; // por debajo de 1 KB no vale la pena
  const COMPRIMIBLE = /^(text\/|application\/(json|javascript|manifest))/;

  router.use((req, res, next) => {
    const enviarOriginal = res.send.bind(res);
    res.send = function (cuerpo) {
      try {
        const acepta = String(req.headers['accept-encoding'] || '');
        // Cuando se manda una pantalla, res.render llama a send SIN haber puesto
        // todavía el Content-Type: lo pone Express después, y siempre es HTML.
        // Por eso, si no hay tipo, se asume HTML (que es lo que va a ser).
        const tipo = String(res.get('Content-Type') || 'text/html; charset=utf-8');
        if (
          typeof cuerpo === 'string' &&
          acepta.indexOf('gzip') !== -1 &&
          !res.get('Content-Encoding') &&
          COMPRIMIBLE.test(tipo) &&
          Buffer.byteLength(cuerpo) > MINIMO_PARA_COMPRIMIR
        ) {
          const comprimido = zlib.gzipSync(cuerpo);
          // El tipo se deja explícito: al mandar bytes en vez de texto, Express
          // lo pondría como "archivo para descargar" y el teléfono no la abriría.
          res.set('Content-Type', tipo);
          res.set('Content-Encoding', 'gzip');
          res.set('Vary', 'Accept-Encoding');
          res.removeHeader('Content-Length');
          return enviarOriginal(comprimido);
        }
      } catch (err) {
        // Si algo falla comprimiendo, se manda tal cual: nunca se cae por esto.
        console.warn('[app-movil] no se pudo comprimir:', err.message);
      }
      return enviarOriginal(cuerpo);
    };
    return next();
  });

  /**
   * Datos que TODAS las pantallas necesitan. Sobre todo `puedeCargar`: el
   * teléfono lo mira para reservar números de ticket de antemano, que es lo que
   * después permite cargar e imprimir sin señal. Si falta en una pantalla, la
   * reserva no se llena y la app queda sin números cuando se corta internet.
   */
  router.use((req, res, next) => {
    const s = sesionApp(req);
    res.locals.puedeCargar = !!(s && s.codigoIngreso);
    res.locals.esGeneral = !!(s && s.esGeneral);
    // Para el menú de cuenta del encabezado (sale de la sesión, sin ir a la base).
    res.locals.balanzaNombre = (s && s.balanza) || '';
    return next();
  });

  // Los estáticos de la app viven FUERA de public/ a propósito: así no los
  // sirve el express.static de la web y todo queda detrás del flag APP_MOVIL.
  const DIR_ESTATICOS = path.join(__dirname, 'app-movil-estaticos');

  // Se sirven a mano (y no con express.static) para que pasen por el comprimido
  // de arriba: los 73 KB de css y js bajan a menos de 20 KB en la primera vez.
  const TIPOS_ESTATICOS = {
    'app.css': 'text/css; charset=utf-8',
    'ticket.css': 'text/css; charset=utf-8',
    'app.js': 'application/javascript; charset=utf-8',
    'ticket.js': 'application/javascript; charset=utf-8',
  };

  router.get('/estatico/:archivo', (req, res) => {
    const tipo = TIPOS_ESTATICOS[req.params.archivo];
    if (!tipo) return res.status(404).send('no existe');
    fs.readFile(path.join(DIR_ESTATICOS, req.params.archivo), 'utf8', (err, contenido) => {
      if (err) return res.status(404).send('no existe');
      res.set('Content-Type', tipo);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(contenido);
    });
  });

  // El service worker se sirve desde /app/sw.js para que su alcance sea /app.
  router.get('/sw.js', (req, res) => {
    const archivo = path.join(DIR_ESTATICOS, 'sw.js');
    fs.readFile(archivo, 'utf8', (err, contenido) => {
      if (err) return res.status(404).send('// sin service worker');
      res.set('Content-Type', 'application/javascript; charset=utf-8');
      res.set('Service-Worker-Allowed', '/app');
      res.set('Cache-Control', 'no-cache');
      return res.send(contenido);
    });
  });

  router.get('/manifest.webmanifest', (req, res) => {
    res.set('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.json({
      name: 'Pesada de Balanza',
      short_name: 'Pesada',
      description: 'Carga de pesadas de balanza',
      start_url: '/app',
      scope: '/app',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#1b1a17',
      theme_color: '#1b1a17',
      lang: 'es-AR',
      icons: [
        { src: '/app/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/app/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    });
  });

  // Ícono generado en el servidor: el diseño no trae imágenes (ver "Assets").
  router.get('/icono.svg', (req, res) => {
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
        '<rect width="512" height="512" fill="#1b1a17"/>' +
        '<g fill="none" stroke="#f8f7f4" stroke-width="26" stroke-linecap="round">' +
        '<path d="M256 104v52"/><path d="M136 156h240"/>' +
        '<path d="M136 156 96 292a72 72 0 0 0 144 0z"/>' +
        '<path d="M376 156l-40 136a72 72 0 0 0 144 0z" transform="translate(-104 0)"/>' +
        '<path d="M256 156v252"/><path d="M180 408h152"/>' +
        '</g></svg>'
    );
  });

  /* =========================================================================
   * INGRESO POR CÓDIGO  (ref. 6a)
   * ======================================================================= */

  // Rate limiting propio para el ingreso de la app (el de la web es para su POST /).
  const intentos = new Map();
  function limitarIngreso(req, res, next) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    const ahora = Date.now();
    const VENTANA = 15 * 60 * 1000;
    const MAX = 10;
    const e = intentos.get(ip) || { n: 0, hasta: ahora + VENTANA };
    if (ahora > e.hasta) {
      e.n = 0;
      e.hasta = ahora + VENTANA;
    }
    e.n++;
    intentos.set(ip, e);
    if (e.n > MAX) {
      return fallar(res, 429, 'Demasiados intentos. Esperá 15 minutos.');
    }
    return next();
  }

  router.get('/', async (req, res) => {
    const s = sesionApp(req);
    if (!s || !s.ok) return res.redirect('/app/ingreso');
    if (s.codigoIngreso) return res.redirect('/app/patio');
    return res.redirect('/app/general');
  });

  router.get('/ingreso', (req, res) => {
    const s = sesionApp(req);
    if (s && s.ok) return res.redirect('/app');
    return res.render('app/ingreso', { layout: 'app/layout', titulo: 'Ingresar' });
  });

  router.post('/api/ingreso', limitarIngreso, async (req, res) => {
    try {
      await asegurarIndices();
      const code = String(req.body.code || '').trim();

      const esIngreso = codigosIngreso.includes(code);
      const esObservacion = codigosObservacion.includes(code);

      if (!esIngreso && !esObservacion) {
        return fallar(res, 401, 'Código incorrecto.');
      }

      const codigoIngreso = esIngreso
        ? code
        : Object.keys(ingresoAObservacion).find((k) => ingresoAObservacion[k] === code) || null;
      const codigoObservacion = esIngreso ? ingresoAObservacion[code] : code;

      req.session.app = {
        ok: true,
        // Un código de observación entra a mirar; uno de ingreso entra a cargar.
        codigoIngreso: esIngreso ? code : null,
        codigoObservacion: codigoObservacion || null,
        esGeneral: codigoObservacion === CODIGO_GENERAL_OBSERVACION,
        balanza: nombreBalanza(codigoIngreso || code),
        desde: new Date(),
      };
      renovarSesion(req);

      const destino = esIngreso ? '/app/patio' : '/app/general';
      return req.session.save((err) => {
        if (err) return fallar(res, 500, 'No se pudo abrir la sesión. Probá de nuevo.');
        return res.json({ ok: true, destino });
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  router.post('/api/salir', (req, res) => {
    if (req.session) req.session.app = null;
    return res.json({ ok: true, destino: '/app/ingreso' });
  });

  /* =========================================================================
   * NOMBRE DEL DÍA  (ref. 6b)
   * ======================================================================= */

  router.get('/dia', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const hoy = hoyStr();
      const [nombre, sugeridos] = await Promise.all([
        nombreDelDia(s.codigoIngreso, hoy),
        ultimosNombres(s.codigoIngreso, 6),
      ]);
      return res.render('app/dia', {
        layout: 'app/layout',
        titulo: 'Nombre del día',
        balanza: s.balanza,
        fechaCorta: fechaCorta(hoy),
        diaBonito: diaBonito(hoy),
        nombreActual: nombre,
        sugeridos,
        cambio: req.query.cambio === '1',
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  router.post('/api/dia', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const nombre = String(req.body.nombre || '').trim().slice(0, 60);
      if (nombre.length < 3) {
        return fallar(res, 400, 'Escribí nombre y apellido.');
      }
      const hoy = hoyStr();
      await colDias().updateOne(
        { codigoIngreso: s.codigoIngreso, fecha: hoy },
        { $set: { nombre, actualizadoEn: new Date() }, $setOnInsert: { creadoEn: new Date() } },
        { upsert: true }
      );
      return res.json({ ok: true, destino: '/app/patio', nombre });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * PATIO  (ref. 1a, 7a, 7c, 5f)
   * ======================================================================= */

  async function datosPatio(codigoIngreso, nombreDia) {
    const hoy = hoyStr();
    const camiones = await camionesAbiertos(codigoIngreso);
    const sinImprimir = camiones.filter((c) => c.sinImprimir);
    const sinRegular = camiones.filter((c) => c.sinRegularDeAyer);
    return {
      balanza: nombreBalanza(codigoIngreso),
      nombreDia: nombreDia || '',
      hoy,
      diaBonito: diaBonito(hoy),
      camiones,
      sinImprimir: sinImprimir.map((c) => ({ id: c.id, nro: c.nro })),
      sinRegular: sinRegular.map((c) => ({ id: c.id, nro: c.nro })),
      enCurso: camiones.length,
    };
  }

  router.get('/patio', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const datos = await datosPatio(s.codigoIngreso, req.nombreDia);
      return res.render('app/patio', {
        layout: 'app/layout',
        titulo: 'Patio',
        datos,
        kg,
        aviso: req.query.aviso || '',
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  // Espejo JSON del patio: sirve para refrescar sin recargar y para que el
  // teléfono guarde la última foto y pueda mostrarla sin señal.
  router.get('/api/patio', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const nombre = await nombreDelDia(s.codigoIngreso, hoyStr());
      const datos = await datosPatio(s.codigoIngreso, nombre);
      return res.json({ ok: true, datos });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * SUGERENCIAS PARA AUTOCOMPLETAR
   * ======================================================================= */

  let cacheSugerencias = { hasta: 0, datos: null };

  router.get('/api/sugerencias', exigirApp, async (req, res) => {
    try {
      if (cacheSugerencias.datos && Date.now() < cacheSugerencias.hasta) {
        return res.json({ ok: true, datos: cacheSugerencias.datos });
      }
      // Los ÚLTIMOS 300 TICKETS, que son más o menos los últimos 10 a 12 días de
      // trabajo. Es un autocompletado, no un padrón: lo que sirve es lo que está
      // entrando estos días. Un camión que no vino en dos semanas se escribe a
      // mano una vez y vuelve a la lista.
      const ULTIMOS_TICKETS = 300;
      const docs = await colRegistros()
        .find(
          {},
          {
            projection: { patentes: 1, chofer: 1, transporte: 1 },
            sort: { idTicket: -1 },
            limit: ULTIMOS_TICKETS,
          }
        )
        .toArray();

      // Del más reciente al más viejo: si hay que cortar, se cortan los viejos.
      const unicos = (clave) => {
        const vistos = new Set();
        const out = [];
        for (const d of docs) {
          const v = String(d[clave] || '').trim();
          if (!v || vistos.has(v)) continue;
          vistos.add(v);
          out.push(v);
        }
        return out.sort();
      };

      const datos = {
        patentes: unicos('patentes'),
        choferes: unicos('chofer'),
        transportes: unicos('transporte'),
        contratistas: Object.keys(getContratistas() || {}),
      };
      cacheSugerencias = { hasta: Date.now() + 10 * 60 * 1000, datos };
      return res.json({ ok: true, datos });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * TABLAS PARA TRABAJAR SIN SEÑAL
   * -------------------------------------------------------------------------
   * Campos, planilla de siembra y contratistas. El teléfono las guarda para
   * poder armar los formularios de tara final y regulada cuando no hay señal.
   * ======================================================================= */
  router.get('/api/tablas', exigirApp, (req, res) => {
    res.set('Cache-Control', 'private, max-age=3600');
    return res.json({
      ok: true,
      datos: {
        campos,
        siembra: datosSiembra,
        contratistas: getContratistas() || {},
        brutosEstimados: [45000, 52500, 55000],
      },
    });
  });

  /**
   * Pantalla para seguir un ticket que quedó guardado en el teléfono.
   * Es una cáscara SIN datos: el teléfono la llena con lo que tiene guardado.
   * No pide sesión a propósito, así el service worker la puede guardar desde el
   * arranque y está disponible aunque la señal se corte antes de usarla. No
   * muestra nada de la base: para guardar sí hace falta la sesión.
   */
  router.get('/local', (req, res) => {
    return res.render('app/local', { layout: 'app/layout', titulo: 'Sin señal' });
  });

  /* =========================================================================
   * RESERVA DE NÚMEROS (para poder cargar e imprimir sin señal)
   * ======================================================================= */

  router.post('/api/numeros/reservar', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const numeros = await reservarNumeros(req.body.cantidad || 3, s.codigoIngreso);
      return res.json({ ok: true, numeros: numeros.map((n) => n.nro) });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * AVISO DE CAMIÓN REPETIDO HOY  (ref. 7b)
   * ======================================================================= */

  async function buscarRepetidoHoy(patentes, codigoIngresoPropio) {
    const clave = patenteClave(patentes);
    if (!clave) return null;
    const hoy = hoyStr();
    const docs = await colRegistros()
      .find({ fecha: hoy, anulado: { $ne: true } })
      .sort({ idTicket: -1 })
      .toArray();

    for (const r of docs) {
      if (patenteClave(r.patentes) !== clave) continue;
      if (r.codigoIngreso === codigoIngresoPropio) continue;
      return {
        id: String(r._id),
        nro: r.nroApp || String(r.idTicket || ''),
        balanza: nombreBalanza(r.codigoIngreso),
        hora: r.creadoEn ? horaCorta(r.creadoEn) : '',
        usuario: r.usuario || r.cargadoPor || '',
        patentes: r.patentes || '',
      };
    }
    return null;
  }

  router.get('/api/repetido', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const otro = await buscarRepetidoHoy(req.query.patentes, s.codigoIngreso);
      return res.json({ ok: true, repetido: otro });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * NUEVA PESADA — CAMIONES  (paso 1)
   * ======================================================================= */

  router.get('/nueva-pesada', exigirApp, exigirBalancero, exigirNombreDia, (req, res) => {
    const s = sesionApp(req);
    return res.render('app/nueva-pesada', {
      layout: 'app/layout',
      titulo: 'Nueva pesada',
      balanza: s.balanza,
      nombreDia: req.nombreDia,
      campos,
      brutosEstimados: [45000, 52500, 55000],
    });
  });

  /**
   * Alta de CAMIONES. Repite las mismas validaciones que /guardar-tara de la web
   * (campo de la lista oficial, bruto 1000–60000, tara opcional 0–30000) y la
   * misma asignación de balanza por campo (`campoUsuario`).
   */
  router.post('/api/pesada', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const localId = String(req.body.localId || '').trim();

      // Idempotencia: si esta misma pesada ya se subió (reintento de la cola
      // sin conexión), se devuelve la anterior en lugar de duplicarla.
      if (localId) {
        const yaEsta = await colLocalIds().findOne({ localId });
        if (yaEsta) {
          return res.json({
            ok: true,
            duplicado: true,
            id: String(yaEsta.registroId),
            nro: yaEsta.nro || '',
          });
        }
      }

      const requeridos = ['cargaPara', 'transporte', 'patentes', 'chofer', 'brutoEstimado', 'campo'];
      const faltan = requeridos.filter((f) => !String(req.body[f] || '').trim());
      if (faltan.length) {
        return fallar(res, 400, 'Faltan datos: ' + faltan.join(', '));
      }

      if (!campos.includes(req.body.campo)) {
        return fallar(res, 400, 'El campo elegido no está en la lista.');
      }

      const vBruto = validarNumero(req.body.brutoEstimado, 1000, 60000);
      if (!vBruto.ok) return fallar(res, 400, 'Bruto estimado: ' + vBruto.error);

      let tara = 0;
      const taraRaw = String(req.body.tara || '').trim();
      if (taraRaw !== '') {
        const vTara = validarNumero(taraRaw, 0, 30000);
        if (!vTara.ok) return fallar(res, 400, 'Tara: ' + vTara.error);
        tara = vTara.valor;
      }

      const cargaPara = String(req.body.cargaPara).trim().toUpperCase();
      if (cargaPara !== 'AMH' && cargaPara !== 'SOCIO') {
        return fallar(res, 400, 'Carga para: elegí AMH o SOCIO.');
      }
      if (cargaPara === 'SOCIO' && !String(req.body.socio || '').trim()) {
        return fallar(res, 400, 'Falta el nombre del socio.');
      }

      const brutoEst = vBruto.valor;
      const idTicket = await siguienteIdTicket();
      const nro = await tomarNumero(req.body.nro, s.codigoIngreso);
      const ahora = new Date();

      // Mismos nombres de campo que /guardar-tara en app.js, para que la web
      // lea estos registros sin ningún cambio.
      const registro = {
        idTicket,
        fecha: hoyStr(),
        usuario: req.nombreDia,
        cargaPara,
        socio: cargaPara === 'SOCIO' ? String(req.body.socio || '').trim() : '',
        pesadaPara: 'CAMIONES',
        transporte: String(req.body.transporte).trim(),
        patentes: String(req.body.patentes).trim().toUpperCase(),
        chofer: String(req.body.chofer).trim(),
        campo: req.body.campo,
        brutoEstimado: brutoEst,
        tara,
        netoEstimado: brutoEst - tara,
        anulado: false,
        modificaciones: 0,
        confirmada: false,
        // El campo elegido manda, igual que en la web.
        codigoIngreso: campoUsuario[req.body.campo] || s.codigoIngreso || '',

        // ── Campos propios de la app (opcionales, la web los ignora)
        origen: 'app',
        nroApp: nro,
        cargadoPor: req.nombreDia,
        appImpreso: false,
        creadoEn: ahora,
      };
      if (localId) registro.appLocalId = localId;

      const r = await colRegistros().insertOne(registro);

      if (localId) {
        try {
          await colLocalIds().insertOne({
            localId,
            registroId: r.insertedId,
            nro,
            creadoEn: ahora,
          });
        } catch (err) {
          // Carrera entre dos reintentos simultáneos: el registro ya quedó
          // insertado por el otro; se avisa y se sigue.
          console.warn('[app-movil] localId duplicado:', err.message);
        }
      }

      const repetido = await buscarRepetidoHoy(registro.patentes, s.codigoIngreso);

      return res.json({
        ok: true,
        id: String(r.insertedId),
        nro,
        idTicket,
        repetido,
        destino: '/app/patio',
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * TARA FINAL  (paso 2)
   * ======================================================================= */

  async function traerRegistroDeBalanza(id, codigoIngreso) {
    if (!idValido(id)) return null;
    const r = await colRegistros().findOne({ _id: oid(id) });
    if (!r) return null;
    if (codigoIngreso && r.codigoIngreso !== codigoIngreso) return null;
    return r;
  }

  /**
   * Resuelve el ticket de un paso que se cargó SIN SEÑAL sobre una pesada que
   * tampoco se había subido todavía.
   *
   * Sin conexión el teléfono no conoce el id que le va a poner la base al
   * registro, así que la tara final y la regulada se encolan apuntando al id
   * local de la pesada (`refLocal`). Cuando la cola se sube, la pesada va
   * primero y deja su id en `app_localids`; recién entonces este paso lo
   * encuentra. Así el balancero puede cerrar el ticket completo sin señal.
   */
  async function resolverRegistro(cuerpo, codigoIngreso) {
    const id = String(cuerpo.id || '').trim();
    if (id) return { registro: await traerRegistroDeBalanza(id, codigoIngreso) };

    const refLocal = String(cuerpo.refLocal || '').trim();
    if (!refLocal) return { registro: null };

    const enlace = await colLocalIds().findOne({ localId: refLocal });
    if (!enlace) {
      // La pesada de origen todavía no llegó (o el servidor la rechazó).
      return {
        registro: null,
        error: 'La pesada de este camión todavía no se subió. Se reintenta cuando suba.',
        codigo: 409,
      };
    }
    return { registro: await traerRegistroDeBalanza(String(enlace.registroId), codigoIngreso) };
  }

  router.get('/tara-final/:id', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.codigoIngreso);
      if (!r) return noEncontrado(res);
      if (r.anulado) return pantallaError(res, 'Ticket anulado', 'Este ticket está anulado.');
      if (r.fechaTaraFinal) {
        return res.redirect('/app/regulada/' + String(r._id));
      }
      if (!ticketVigente(r.fecha, DIAS_CAMIONES_A_TARA_FINAL)) {
        return pantallaError(
          res,
          'Ticket vencido',
          'El ticket de CAMIONES del ' + fechaLarga(r.fecha) + ' venció (máximo 1 día). Hay que anularlo y cargar uno nuevo.'
        );
      }
      return res.render('app/tara-final', {
        layout: 'app/layout',
        titulo: 'Tara final',
        r: vistaRegistro(r),
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * Guarda la TARA FINAL. Mismas reglas y mismos campos que /guardar-tara-final
   * en app.js, incluido el aviso por email (`notificar`).
   */
  router.post('/api/tara-final', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const localId = String(req.body.localId || '').trim();
      if (localId) {
        const yaEsta = await colLocalIds().findOne({ localId });
        if (yaEsta) return res.json({ ok: true, duplicado: true, id: String(yaEsta.registroId) });
      }

      const hallado = await resolverRegistro(req.body, s.codigoIngreso);
      if (hallado.error) return fallar(res, hallado.codigo || 400, hallado.error);
      const r = hallado.registro;
      if (!r) return fallar(res, 404, 'No se encontró el camión.');
      if (r.anulado) return fallar(res, 400, 'Este ticket está anulado.');
      if (r.fechaTaraFinal) return fallar(res, 400, 'Este camión ya tiene la tara final cargada.');

      const v = validarNumero(req.body.taraNueva, 1000, 30000);
      if (!v.ok) return fallar(res, 400, 'Tara final: ' + v.error);
      const taraNueva = v.valor;

      if (!ticketVigente(r.fecha, DIAS_CAMIONES_A_TARA_FINAL)) {
        return fallar(
          res,
          400,
          'El ticket de CAMIONES del ' + fechaLarga(r.fecha) + ' venció (máximo 1 día).'
        );
      }

      const brutoEstimado = parseFloat(r.brutoEstimado || 0);
      const hoy = hoyStr();

      await colRegistros().updateOne(
        { _id: r._id, fechaTaraFinal: { $exists: false } },
        {
          $set: {
            tara: taraNueva,
            netoEstimado: brutoEstimado - taraNueva,
            fechaTaraFinal: hoy,
            fecha: hoy,
            appImpreso: false,
            appTaraFinalPor: req.nombreDia,
            appTaraFinalEn: new Date(),
          },
        }
      );

      if (localId) {
        try {
          await colLocalIds().insertOne({ localId, registroId: r._id, creadoEn: new Date() });
        } catch (err) {
          console.warn('[app-movil] localId duplicado (tara final):', err.message);
        }
      }

      // Mismo aviso por email que la web.
      notificar({
        tipo: 'TARA FINAL',
        patentes: r.patentes,
        idTicket: String(r.nroApp || r.idTicket || r._id),
        fecha: hoy,
        tara: taraNueva,
        codigoIngreso: r.codigoIngreso || '',
      });

      return res.json({
        ok: true,
        id: String(r._id),
        nro: r.nroApp || String(r.idTicket || ''),
        patentes: r.patentes,
        chofer: r.chofer,
        urlTicket: '/app/ticket/' + String(r._id),
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * REGULADA  (paso 3)
   * ======================================================================= */

  router.get('/regulada/:id', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.codigoIngreso);
      if (!r) return noEncontrado(res);
      if (r.anulado) return pantallaError(res, 'Ticket anulado', 'Este ticket está anulado.');
      if (!r.fechaTaraFinal) return res.redirect('/app/tara-final/' + String(r._id));
      if (r.fechaRegulada) return res.redirect('/app/registro/' + String(r._id));
      if (!ticketVigente(r.fecha, DIAS_TARA_FINAL_A_REGULADA)) {
        return pantallaError(
          res,
          'Ticket vencido',
          'El ticket del ' + fechaLarga(r.fecha) + ' venció (máximo 5 días). Hay que anularlo y cargar uno nuevo.'
        );
      }

      // Solo lo del campo del ticket, que es lo que se necesita para dibujar la
      // pantalla al toque. La lista completa de campos y la planilla entera las
      // trae el teléfono de lo que ya tiene guardado (/app/api/tablas), así no
      // se manda dos veces lo mismo: la pantalla baja de 34 KB a menos de 10.
      return res.render('app/regulada', {
        layout: 'app/layout',
        titulo: 'Regulada',
        r: vistaRegistro(r),
        siembraDelCampo: datosSiembra[r.campo] || {},
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * Guarda la REGULADA. Mismas reglas que /guardar-regulada en app.js:
   * requiere TARA FINAL previa, el operador debe ser el mismo, vigencia de 5
   * días, contratista+tractor si cargó de contratista, y los mismos campos.
   */
  router.post('/api/regulada', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const localId = String(req.body.localId || '').trim();
      if (localId) {
        const yaEsta = await colLocalIds().findOne({ localId });
        if (yaEsta) return res.json({ ok: true, duplicado: true, id: String(yaEsta.registroId) });
      }

      const hallado = await resolverRegistro(req.body, s.codigoIngreso);
      if (hallado.error) return fallar(res, hallado.codigo || 400, hallado.error);
      const r = hallado.registro;
      if (!r) return fallar(res, 404, 'No se encontró el camión.');
      if (r.anulado) return fallar(res, 400, 'Este ticket está anulado.');
      if (!r.fechaTaraFinal) return fallar(res, 400, 'Primero hay que cargar la tara final.');
      if (r.fechaRegulada) return fallar(res, 400, 'Este camión ya tiene la regulada cargada.');
      if (!ticketVigente(r.fecha, DIAS_TARA_FINAL_A_REGULADA)) {
        return fallar(res, 400, 'El ticket del ' + fechaLarga(r.fecha) + ' venció (máximo 5 días).');
      }

      const lotes = aArray(req.body.lote);
      const contratistas = aArray(req.body.contratista);
      const tractores = aArray(req.body.tractor);

      const requeridos = ['grano', 'cargoDe', 'brutoLote', 'bruto'];
      const faltan = requeridos.filter((f) => !String(req.body[f] || '').trim());
      if (!lotes.length) faltan.push('lote');
      if (faltan.length) return fallar(res, 400, 'Faltan datos: ' + faltan.join(', '));

      const cargoDe = String(req.body.cargoDe).trim().toUpperCase();
      if (cargoDe !== 'SILOBOLSA' && cargoDe !== 'CONTRATISTA') {
        return fallar(res, 400, 'Cargó de: elegí Silobolsa o Contratista.');
      }
      if (cargoDe === 'CONTRATISTA') {
        if (!contratistas.length) return fallar(res, 400, 'Falta el contratista.');
        if (!tractores.length) return fallar(res, 400, 'Falta el tractor.');
      }

      // El campo se puede corregir en la regulada (la web también lo permite:
      // /guardar-regulada guarda `campo`). Si no viene, queda el del ticket.
      let campoElegido = r.campo;
      const campoRecibido = String(req.body.campo || '').trim();
      if (campoRecibido && campoRecibido !== r.campo) {
        if (!campos.includes(campoRecibido)) {
          return fallar(res, 400, 'El campo elegido no está en la lista.');
        }
        campoElegido = campoRecibido;
      }

      // El grano y los lotes tienen que pertenecer al campo (al corregido, si se cambió).
      const delCampo = datosSiembra[campoElegido] || {};
      const grano = String(req.body.grano).trim();
      if (Object.keys(delCampo).length) {
        if (!delCampo[grano]) return fallar(res, 400, 'Ese grano no corresponde al campo del ticket.');
        const validos = delCampo[grano] || [];
        const invalido = lotes.find((l) => validos.indexOf(l) === -1);
        if (invalido) return fallar(res, 400, 'El lote "' + invalido + '" no corresponde al campo.');
      }

      const vBruto = validarNumero(req.body.bruto, 0, 60000);
      if (!vBruto.ok) return fallar(res, 400, 'Bruto regulado: ' + vBruto.error);
      const vBrutoLote = validarNumero(req.body.brutoLote, 0, 60000);
      if (!vBrutoLote.ok) return fallar(res, 400, 'Bruto lote: ' + vBrutoLote.error);

      // Por defecto se confirma la tara final ya pesada; si el balancero la
      // corrige, se valida con el mismo rango que la TARA FINAL.
      const confirmarTara = String(req.body.confirmarTara || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI';
      let taraFinal;
      if (confirmarTara === 'NO') {
        const vTara = validarNumero(req.body.taraNueva, 1000, 30000);
        if (!vTara.ok) return fallar(res, 400, 'Tara corregida: ' + vTara.error);
        taraFinal = vTara.valor;
      } else {
        taraFinal = parseFloat(r.tara) || 0;
      }

      const bruto = vBruto.valor;
      const hoy = hoyStr();

      const set = {
        fecha: hoy,
        pesadaPara: 'REGULADA',
        campo: campoElegido,
        grano,
        lote: lotes,
        cargoDe,
        silobolsa: cargoDe === 'SILOBOLSA' ? String(req.body.silobolsa || '').trim() : '',
        contratista: cargoDe === 'CONTRATISTA' ? contratistas : [],
        tractor: cargoDe === 'CONTRATISTA' ? tractores : [],
        bruto,
        tara: taraFinal,
        neto: bruto - taraFinal,
        brutoLote: vBrutoLote.valor,
        comentarios: String(req.body.comentarios || '').slice(0, 500),
        fechaRegulada: hoy,
        confirmada: true,
        appReguladaPor: req.nombreDia,
        appReguladaEn: new Date(),
      };

      await colRegistros().updateOne(
        { _id: r._id, fechaRegulada: { $exists: false } },
        { $set: set }
      );

      if (localId) {
        try {
          await colLocalIds().insertOne({ localId, registroId: r._id, creadoEn: new Date() });
        } catch (err) {
          console.warn('[app-movil] localId duplicado (regulada):', err.message);
        }
      }

      notificar({
        tipo: 'REGULADA',
        patentes: r.patentes,
        idTicket: String(r.nroApp || r.idTicket || r._id),
        fecha: hoy,
        tara: taraFinal,
        bruto,
        neto: bruto - taraFinal,
        campo: campoElegido || '',
        grano,
        lote: lotes.join(', '),
        codigoIngreso: r.codigoIngreso || '',
      });

      return res.json({
        ok: true,
        id: String(r._id),
        nro: r.nroApp || String(r.idTicket || ''),
        neto: bruto - taraFinal,
        urlTicket: '/app/ticket/' + String(r._id),
        destino: '/app/patio',
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * TICKET IMPRIMIBLE 19 × 4,5 cm  (ref. 5a / 5d)
   * ======================================================================= */

  /** Prepara un registro para el ticket y para las pantallas. */
  function vistaRegistro(r) {
    const lotes = Array.isArray(r.lote) ? r.lote : r.lote ? [String(r.lote)] : [];
    return {
      id: String(r._id),
      idTicket: r.idTicket,
      nro: r.nroApp || (r.idTicket != null ? String(r.idTicket) : ''),
      fecha: r.fecha,
      fechaLarga: fechaLarga(r.fecha),
      hora: r.creadoEn ? horaCorta(r.creadoEn) : '',
      patentes: r.patentes || '',
      chofer: r.chofer || '',
      transporte: r.transporte || '',
      campo: r.campo || '',
      campoCorto: nombreCampoCorto(r.campo),
      cargaPara: r.cargaPara || '',
      socio: r.socio || '',
      grano: r.grano || '',
      lote: lotes,
      loteTexto: lotes.join(', '),
      cargoDe: r.cargoDe || '',
      silobolsa: r.silobolsa || '',
      contratista: plano(r.contratista),
      tractor: plano(r.tractor),
      cp: r.cp || '',
      comentarios: r.comentarios || '',
      brutoEstimado: r.brutoEstimado || 0,
      tara: r.tara || 0,
      brutoLote: r.brutoLote || null,
      bruto: r.bruto || null,
      neto: r.neto != null ? r.neto : null,
      netoEstimado: r.netoEstimado || 0,
      fechaTaraFinal: r.fechaTaraFinal || '',
      fechaRegulada: r.fechaRegulada || '',
      anulado: !!r.anulado,
      impreso: r.appImpreso === true,
      modificaciones: r.modificaciones || 0,
      cargadoPor: r.cargadoPor || r.usuario || '',
      balanza: nombreBalanza(r.codigoIngreso),
      // Encabezado del ticket: establecimiento del campo + AMH o Socio.
      titular: r.cargaPara === 'SOCIO' && r.socio ? 'Socio ' + r.socio : 'AMH',
      completo: !!r.fechaRegulada,
    };
  }

  /**
   * Hoja de impresión. Es una cáscara sin datos, cacheada por el service worker,
   * que dibuja los tickets con el MISMO código en los dos casos: con señal pide
   * los datos a /app/api/tickets, y sin señal los toma de lo guardado en el
   * teléfono. Un solo dibujante = el ticket sale igual siempre.
   */
  router.get('/imprimir', exigirApp, (req, res) => {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((x) => x.trim())
      .filter(idValido)
      .slice(0, 60);
    return res.render('app/imprimir', {
      layout: false,
      ids,
      locales: String(req.query.locales || ''),
      volver: req.query.volver || '/app/patio',
    });
  });

  // Atajo: el ticket de un solo camión.
  router.get('/ticket/:id', exigirApp, (req, res) => {
    if (!idValido(req.params.id)) return noEncontrado(res);
    return res.redirect('/app/imprimir?ids=' + encodeURIComponent(req.params.id));
  });

  /** Todos los pendientes de imprimir juntos: se agrupan de a 6 por hoja. */
  router.get('/tickets-pendientes', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const abiertos = await camionesAbiertos(s.codigoIngreso);
      const ids = abiertos.filter((c) => c.sinImprimir).map((c) => c.id);
      if (!ids.length) return res.redirect('/app/patio');
      return res.redirect('/app/imprimir?ids=' + encodeURIComponent(ids.join(',')));
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * PDF del ticket, para compartir por WhatsApp.
   * Solo se habilita DESPUÉS de la REGULADA: antes de eso el ticket todavía no
   * tiene todos los pesos y lo único que corresponde es imprimirlo en papel para
   * el chofer (así lo pide el handoff, ref. 5e).
   */
  router.get('/ticket-pdf/:id', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.esGeneral ? null : s.codigoIngreso);
      if (!r) return noEncontrado(res);

      if (!r.fechaRegulada) {
        return pantallaError(
          res,
          'Todavía no',
          'El PDF se puede compartir recién cuando esté cargada la regulada. Por ahora, el ticket se imprime en papel y se le entrega al chofer.',
          '/app/registro/' + String(r._id)
        );
      }

      const vista = vistaRegistro(r);
      const pdf = generarPdf(vista, { titulo: 'Ticket ' + vista.nro + ' · ' + vista.patentes });
      const nombre = nombreArchivo(vista);

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Length', String(pdf.length));
      // `inline` para que el teléfono lo pueda previsualizar antes de compartir.
      res.set('Content-Disposition', 'inline; filename="' + nombre + '"');
      res.set('Cache-Control', 'private, max-age=0, must-revalidate');
      return res.send(pdf);
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /** Datos de los tickets a imprimir (los dibuja el teléfono). */
  router.get('/api/tickets', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const ids = String(req.query.ids || '')
        .split(',')
        .map((x) => x.trim())
        .filter(idValido)
        .slice(0, 60)
        .map(oid);
      if (!ids.length) return res.json({ ok: true, tickets: [] });

      const filtro = { _id: { $in: ids } };
      if (!s.esGeneral) filtro.codigoIngreso = s.codigoIngreso;

      const docs = await colRegistros().find(filtro).sort({ idTicket: 1 }).toArray();
      return res.json({ ok: true, tickets: docs.map(vistaRegistro) });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  router.post('/api/impreso', exigirApp, exigirBalancero, async (req, res) => {
    try {
      const s = sesionApp(req);
      const ids = aArray(req.body.ids).filter(idValido).map(oid);
      if (!ids.length) return fallar(res, 400, 'No llegó ningún ticket.');
      await colRegistros().updateMany(
        { _id: { $in: ids }, codigoIngreso: s.codigoIngreso },
        { $set: { appImpreso: true, appImpresoEn: new Date() } }
      );
      return res.json({ ok: true });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * DETALLE DEL REGISTRO  (ref. 7d) — pesos fijos, observaciones editables
   * ======================================================================= */

  router.get('/registro/:id', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.esGeneral ? null : s.codigoIngreso);
      if (!r) return noEncontrado(res);

      const pedido = await colPedidos().findOne(
        { registroId: r._id },
        { sort: { creadoEn: -1 } }
      );

      const v = vistaRegistro(r);
      // Mismas condiciones que la web para editar comentarios.
      const puedeEditarComentarios =
        !r.anulado &&
        r.pesadaPara === 'REGULADA' &&
        (r.modificaciones || 0) < 2 &&
        !!r.fechaRegulada &&
        ticketVigente(r.fechaRegulada, 1);

      return res.render('app/registro', {
        layout: 'app/layout',
        titulo: 'Ticket ' + v.nro,
        r: v,
        kg,
        puedeEditarComentarios,
        pedido: pedido
          ? {
              tipo: pedido.tipo,
              estado: pedido.estado,
              motivo: pedido.motivo || '',
              pedidoPor: pedido.pedidoPor || '',
              hora: pedido.creadoEn ? horaCorta(pedido.creadoEn) : '',
            }
          : null,
        esGeneral: !!s.esGeneral,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * Editar SOLO observaciones/comentarios. Se respetan las reglas de la web:
   * solo REGULADA, hasta 1 día después, máximo 2 modificaciones, y auditoría.
   */
  router.post('/api/comentarios/:id', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.esGeneral ? null : s.codigoIngreso);
      if (!r) return fallar(res, 404, 'No se encontró el ticket.');
      if (r.anulado) return fallar(res, 400, 'Este ticket está anulado.');
      if (r.pesadaPara !== 'REGULADA') {
        return fallar(res, 400, 'Se pueden editar las observaciones recién cuando está cargada la regulada.');
      }
      if ((r.modificaciones || 0) >= 2) {
        return fallar(res, 400, 'Ya se editó dos veces. No se puede más.');
      }
      if (!ticketVigente(r.fechaRegulada, 1)) {
        return fallar(res, 400, 'El plazo para editar venció (hasta 1 día después de la regulada).');
      }

      const nuevos = String(req.body.comentarios || '').trim().slice(0, 500);
      if ((r.comentarios || '') === nuevos) {
        return res.json({ ok: true, sinCambios: true });
      }

      await colAuditoria().insertOne({
        tipoOperacion: 'COMENTARIO',
        registroId: r._id,
        camposAnteriores: { comentarios: r.comentarios || '', cp: r.cp || '' },
        camposNuevos: { comentarios: nuevos, cp: r.cp || '' },
        usuario: (await nombreDelDia(s.codigoIngreso, hoyStr())) || s.codigoIngreso || s.codigoObservacion || 'app',
        origen: 'app-movil',
        timestamp: new Date(),
      });

      await colRegistros().updateOne(
        { _id: r._id },
        { $set: { comentarios: nuevos }, $inc: { modificaciones: 1 } }
      );

      return res.json({ ok: true });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * PEDIDOS DE ANULACIÓN Y CORRECCIÓN  (ref. 6d, 6e, 6f)
   * -------------------------------------------------------------------------
   * Se mantiene la regla del sistema actual: SOLO GENERAL (12341) anula.
   * ======================================================================= */

  router.get('/pedir/:id', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.params.id, s.codigoIngreso);
      if (!r) return noEncontrado(res);
      if (r.anulado) return pantallaError(res, 'Ticket anulado', 'Este ticket ya está anulado.');

      const tipo = req.query.tipo === 'correccion' ? 'CORRECCION' : 'ANULACION';
      const pendiente = await colPedidos().findOne({ registroId: r._id, estado: 'PENDIENTE' });

      return res.render('app/pedir', {
        layout: 'app/layout',
        titulo: tipo === 'CORRECCION' ? 'Pedir corrección' : 'Pedir anulación',
        r: vistaRegistro(r),
        tipo,
        pendiente: !!pendiente,
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * Alta del pedido. NO se puede sin conexión (así lo pide el diseño): el
   * teléfono muestra el botón apagado con el motivo "necesita internet", y este
   * endpoint nunca se encola.
   */
  router.post('/api/pedido', exigirApp, exigirBalancero, exigirNombreDia, async (req, res) => {
    try {
      const s = sesionApp(req);
      const r = await traerRegistroDeBalanza(req.body.id, s.codigoIngreso);
      if (!r) return fallar(res, 404, 'No se encontró el ticket.');
      if (r.anulado) return fallar(res, 400, 'Este ticket ya está anulado.');

      const tipo = String(req.body.tipo || '').toUpperCase() === 'CORRECCION' ? 'CORRECCION' : 'ANULACION';
      const motivo = String(req.body.motivo || '').trim().slice(0, 500);
      if (motivo.length < 5) return fallar(res, 400, 'Escribí el motivo.');

      const yaHay = await colPedidos().findOne({ registroId: r._id, estado: 'PENDIENTE' });
      if (yaHay) return fallar(res, 409, 'Ya hay un pedido pendiente para este ticket.');

      await colPedidos().insertOne({
        registroId: r._id,
        idTicket: r.idTicket,
        nro: r.nroApp || String(r.idTicket || ''),
        patentes: r.patentes || '',
        codigoIngreso: r.codigoIngreso || '',
        balanza: nombreBalanza(r.codigoIngreso),
        tipo,
        motivo,
        pedidoPor: req.nombreDia,
        estado: 'PENDIENTE',
        creadoEn: new Date(),
      });

      // Aviso a GENERAL por el mismo canal de email que ya usa el sistema.
      notificar({
        tipo: tipo === 'CORRECCION' ? 'PEDIDO DE CORRECCIÓN' : 'PEDIDO DE ANULACIÓN',
        patentes: r.patentes || '',
        idTicket: String(r.nroApp || r.idTicket || r._id),
        fecha: hoyStr(),
        codigoIngreso: r.codigoIngreso || '',
      });

      return res.json({ ok: true, destino: '/app/patio?aviso=pedido-enviado' });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /**
   * Anulación en el momento, con GENERAL presente en el patio (ref. 6d):
   * el balancero abre el modal y GENERAL tipea su código.
   * Replica exactamente lo que hace `handleAnular` en app.js, con auditoría.
   */
  router.post('/api/anular', exigirApp, limitarIngreso, async (req, res) => {
    try {
      const s = sesionApp(req);
      const code = String(req.body.code || '').trim();

      // Solo el código GENERAL de observación (12341) puede anular, igual que la web.
      const autorizado = s.esGeneral || code === CODIGO_GENERAL_OBSERVACION;
      if (!autorizado) {
        return fallar(res, 403, 'Código incorrecto. Solo GENERAL puede anular.');
      }

      if (!idValido(req.body.id)) return fallar(res, 400, 'Ticket inválido.');
      const _id = oid(req.body.id);
      const original = await colRegistros().findOne({ _id });
      if (!original) return fallar(res, 404, 'No se encontró el ticket.');
      if (original.anulado) return fallar(res, 400, 'El ticket ya está anulado.');

      // Copia completa antes de tocar nada (igual que la web).
      await colAuditoria().insertOne({
        tipoOperacion: 'ANULACION',
        registroId: _id,
        registroOriginal: Object.assign({}, original),
        usuarioAnula: CODIGO_GENERAL_OBSERVACION,
        origen: 'app-movil',
        pedidoPor: s.codigoIngreso ? await nombreDelDia(s.codigoIngreso, hoyStr()) : '',
        fechaOperacion: new Date(),
      });

      // Soft-delete: solo se marca anulado, los datos no se sobrescriben.
      await colRegistros().updateOne(
        { _id },
        { $set: { anulado: true, fechaAnulacion: new Date() } }
      );

      // Si había un pedido pendiente, se cierra solo.
      await colPedidos().updateMany(
        { registroId: _id, estado: 'PENDIENTE' },
        { $set: { estado: 'ANULADO', resueltoPor: 'GENERAL', resueltoEn: new Date() } }
      );

      return res.json({ ok: true, destino: '/app/patio?aviso=anulado' });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * GENERAL — RESUMEN DEL DÍA (ref. 8a), DETALLE (8c) Y PEDIDOS (6f)
   * ======================================================================= */

  /** Códigos de balanza que este usuario puede mirar. */
  function balanzasVisibles(s) {
    if (s.esGeneral) return codigosIngreso.filter((c) => c !== CODIGO_GENERAL_INGRESO);
    const propio = s.codigoIngreso ||
      Object.keys(ingresoAObservacion).find((k) => ingresoAObservacion[k] === s.codigoObservacion);
    return propio ? [propio] : [];
  }

  async function resumenDelDia(s, fecha) {
    const visibles = balanzasVisibles(s);
    const filtroBalanza = s.esGeneral ? {} : { codigoIngreso: { $in: visibles } };

    const delDia = await colRegistros()
      .find(Object.assign({ fecha, anulado: { $ne: true } }, filtroBalanza))
      .sort({ idTicket: -1 })
      .toArray();

    const regulados = delDia.filter((r) => !!r.fechaRegulada);
    const netoDia = regulados.reduce((a, r) => a + (Number(r.neto) || 0), 0);

    // En curso: camiones abiertos (sin regulada) de las balanzas visibles.
    const abiertos = await colRegistros()
      .find(
        Object.assign(
          {
            pesadaPara: 'CAMIONES',
            anulado: { $ne: true },
            confirmada: { $ne: true },
          },
          filtroBalanza
        )
      )
      .toArray();
    const enCurso = abiertos.filter((r) =>
      r.fechaTaraFinal
        ? ticketVigente(r.fecha, DIAS_TARA_FINAL_A_REGULADA)
        : ticketVigente(r.fecha, DIAS_CAMIONES_A_TARA_FINAL)
    );

    // ── Por balanza
    const porBalanzaMap = {};
    for (const r of delDia) {
      const c = r.codigoIngreso || '';
      if (!porBalanzaMap[c]) porBalanzaMap[c] = { codigo: c, camiones: 0, neto: 0 };
      porBalanzaMap[c].camiones++;
      if (r.fechaRegulada) porBalanzaMap[c].neto += Number(r.neto) || 0;
    }
    const porBalanza = [];
    for (const c of Object.keys(porBalanzaMap)) {
      const b = porBalanzaMap[c];
      porBalanza.push({
        codigo: c,
        nombre: nombreBalanza(c) || c,
        nombreDia: await nombreDelDia(c, fecha),
        camiones: b.camiones,
        neto: b.neto,
      });
    }
    porBalanza.sort((a, b) => b.neto - a.neto);

    // ── Por grano, con sus lotes
    const porGranoMap = {};
    for (const r of regulados) {
      const g = String(r.grano || 'Sin grano');
      if (!porGranoMap[g]) porGranoMap[g] = { grano: g, neto: 0, lotes: {} };
      porGranoMap[g].neto += Number(r.neto) || 0;
      const lotes = Array.isArray(r.lote) ? r.lote : r.lote ? [String(r.lote)] : ['Sin lote'];
      for (const l of lotes) {
        if (!porGranoMap[g].lotes[l]) porGranoMap[g].lotes[l] = { lote: l, neto: 0, camiones: 0 };
        // Si el viaje tiene más de un lote, el neto se reparte en partes iguales.
        porGranoMap[g].lotes[l].neto += (Number(r.neto) || 0) / lotes.length;
        porGranoMap[g].lotes[l].camiones++;
      }
    }
    const porGrano = Object.keys(porGranoMap)
      .map((g) => {
        const x = porGranoMap[g];
        const lotes = Object.keys(x.lotes)
          .map((l) => x.lotes[l])
          .sort((a, b) => b.neto - a.neto);
        return { grano: x.grano, neto: x.neto, lotes, unLote: lotes.length === 1 };
      })
      .sort((a, b) => b.neto - a.neto);

    // ── Para revisar
    const pedidosPendientes = await colPedidos()
      .find(
        s.esGeneral
          ? { estado: 'PENDIENTE' }
          : { estado: 'PENDIENTE', codigoIngreso: { $in: visibles } }
      )
      .toArray();

    // Camiones repetidos hoy en dos balanzas distintas
    const porPatente = {};
    for (const r of delDia) {
      const k = patenteClave(r.patentes);
      if (!k) continue;
      if (!porPatente[k]) porPatente[k] = new Set();
      porPatente[k].add(r.codigoIngreso || '');
    }
    const repetidos = Object.keys(porPatente).filter((k) => porPatente[k].size > 1);

    // Sin regular que quedaron de días anteriores
    const sinRegularViejos = enCurso.filter(
      (r) => r.fechaTaraFinal && r.fechaTaraFinal < fecha
    );

    const revisar = [];
    if (pedidosPendientes.length) {
      revisar.push({
        texto:
          pedidosPendientes.length +
          ' pedido' +
          (pedidosPendientes.length === 1 ? '' : 's') +
          ' de anulación',
        url: '/app/general/pedidos',
      });
    }
    if (repetidos.length) {
      revisar.push({
        texto:
          repetidos.length +
          ' camión' +
          (repetidos.length === 1 ? '' : 'es') +
          ' repetido' +
          (repetidos.length === 1 ? '' : 's') +
          ' en dos balanzas',
        url: '/app/general/repetidos',
      });
    }
    if (sinRegularViejos.length) {
      revisar.push({
        texto: sinRegularViejos.length + ' sin regular de días anteriores',
        url: '/app/general/sin-regular',
      });
    }

    return {
      fecha,
      diaBonito: diaBonito(fecha),
      esHoy: fecha === hoyStr(),
      netoDia,
      camionesCerrados: regulados.length,
      enCurso: enCurso.length,
      porBalanza,
      porGrano,
      revisar,
      alcance: s.esGeneral ? 'GENERAL · TODAS LAS BALANZAS' : nombreBalanza(visibles[0]) || 'MI BALANZA',
    };
  }

  router.get('/general', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : hoyStr();
      const resumen = await resumenDelDia(s, fecha);
      return res.render('app/general', {
        layout: 'app/layout',
        titulo: 'Resumen del día',
        resumen,
        kg,
        puedeCargar: !!s.codigoIngreso,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  router.get('/general/balanza/:codigo', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const codigo = String(req.params.codigo || '');
      if (balanzasVisibles(s).indexOf(codigo) === -1) {
        return pantallaError(res, 'Sin permiso', 'No podés ver esta balanza.', '/app/general');
      }
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : hoyStr();

      const docs = await colRegistros()
        .find({ codigoIngreso: codigo, fecha, anulado: { $ne: true } })
        .sort({ idTicket: -1 })
        .toArray();

      const camiones = docs.map((r) => ({
        id: String(r._id),
        nro: r.nroApp || String(r.idTicket || ''),
        patentes: r.patentes || '',
        transporte: r.transporte || '',
        chofer: r.chofer || '',
        grano: r.grano || '',
        lote: plano(r.lote),
        neto: r.fechaRegulada ? Number(r.neto) || 0 : Number(r.netoEstimado) || 0,
        sinRegular: !r.fechaRegulada,
      }));

      // Los que faltan regular NO suman al total (así lo pide el diseño 8c).
      const total = camiones.filter((c) => !c.sinRegular).reduce((a, c) => a + c.neto, 0);

      return res.render('app/general-balanza', {
        layout: 'app/layout',
        titulo: nombreBalanza(codigo),
        balanza: nombreBalanza(codigo),
        nombreDia: await nombreDelDia(codigo, fecha),
        fecha,
        diaBonito: diaBonito(fecha),
        camiones,
        total,
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  router.get('/general/pedidos', exigirApp, exigirGeneral, async (req, res) => {
    try {
      const pendientes = await colPedidos().find({ estado: 'PENDIENTE' }).sort({ creadoEn: -1 }).toArray();
      const resueltos = await colPedidos()
        .find({ estado: { $ne: 'PENDIENTE' } })
        .sort({ resueltoEn: -1 })
        .limit(10)
        .toArray();

      const armar = (p) => ({
        id: String(p._id),
        registroId: String(p.registroId),
        nro: p.nro || '',
        patentes: p.patentes || '',
        balanza: p.balanza || nombreBalanza(p.codigoIngreso),
        tipo: p.tipo,
        motivo: p.motivo || '',
        pedidoPor: p.pedidoPor || '',
        cuando: (p.creadoEn && p.creadoEn.toISOString().slice(0, 10) === hoyStr() ? 'hoy ' : '') + horaCorta(p.creadoEn),
        estado: p.estado,
      });

      return res.render('app/general-pedidos', {
        layout: 'app/layout',
        titulo: 'Pedidos',
        pendientes: pendientes.map(armar),
        resueltos: resueltos.map(armar),
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /** GENERAL resuelve un pedido: anular o rechazar. Queda constancia de quién. */
  router.post('/api/pedido/:id/resolver', exigirApp, exigirGeneral, async (req, res) => {
    try {
      if (!idValido(req.params.id)) return fallar(res, 400, 'Pedido inválido.');
      const pedido = await colPedidos().findOne({ _id: oid(req.params.id) });
      if (!pedido) return fallar(res, 404, 'No se encontró el pedido.');
      if (pedido.estado !== 'PENDIENTE') return fallar(res, 400, 'Este pedido ya está resuelto.');

      const decision = String(req.body.decision || '').toUpperCase();
      if (decision !== 'ANULAR' && decision !== 'RECHAZAR') {
        return fallar(res, 400, 'Decisión inválida.');
      }

      if (decision === 'RECHAZAR') {
        await colPedidos().updateOne(
          { _id: pedido._id },
          {
            $set: {
              estado: 'RECHAZADO',
              resueltoPor: 'GENERAL',
              resueltoEn: new Date(),
              respuesta: String(req.body.respuesta || '').trim().slice(0, 300),
            },
          }
        );
        return res.json({ ok: true, destino: '/app/general/pedidos' });
      }

      // Anular: solo tiene sentido si el pedido era de anulación.
      if (pedido.tipo !== 'ANULACION') {
        return fallar(res, 400, 'Este pedido es de corrección, no de anulación.');
      }

      const original = await colRegistros().findOne({ _id: pedido.registroId });
      if (!original) return fallar(res, 404, 'No se encontró el ticket.');
      if (!original.anulado) {
        await colAuditoria().insertOne({
          tipoOperacion: 'ANULACION',
          registroId: pedido.registroId,
          registroOriginal: Object.assign({}, original),
          usuarioAnula: CODIGO_GENERAL_OBSERVACION,
          origen: 'app-movil',
          pedidoPor: pedido.pedidoPor || '',
          motivo: pedido.motivo || '',
          fechaOperacion: new Date(),
        });
        await colRegistros().updateOne(
          { _id: pedido.registroId },
          { $set: { anulado: true, fechaAnulacion: new Date() } }
        );
      }

      await colPedidos().updateOne(
        { _id: pedido._id },
        { $set: { estado: 'ANULADO', resueltoPor: 'GENERAL', resueltoEn: new Date() } }
      );

      return res.json({ ok: true, destino: '/app/general/pedidos' });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /** Camiones repetidos hoy en dos balanzas (ref. 7b, visto por GENERAL). */
  router.get('/general/repetidos', exigirApp, exigirGeneral, async (req, res) => {
    try {
      const fecha = hoyStr();
      const docs = await colRegistros()
        .find({ fecha, anulado: { $ne: true } })
        .sort({ idTicket: 1 })
        .toArray();

      const porPatente = {};
      for (const r of docs) {
        const k = patenteClave(r.patentes);
        if (!k) continue;
        if (!porPatente[k]) porPatente[k] = [];
        porPatente[k].push(r);
      }

      const grupos = [];
      for (const k of Object.keys(porPatente)) {
        const lista = porPatente[k];
        const balanzas = new Set(lista.map((r) => r.codigoIngreso || ''));
        if (balanzas.size < 2) continue;
        grupos.push({
          patentes: lista[0].patentes || '',
          tickets: lista.map((r) => ({
            id: String(r._id),
            nro: r.nroApp || String(r.idTicket || ''),
            balanza: nombreBalanza(r.codigoIngreso),
            hora: r.creadoEn ? horaCorta(r.creadoEn) : '',
            usuario: r.usuario || r.cargadoPor || '',
            neto: r.fechaRegulada ? Number(r.neto) || 0 : null,
          })),
        });
      }

      return res.render('app/general-lista', {
        layout: 'app/layout',
        titulo: 'Camiones repetidos',
        encabezado: 'Camiones repetidos hoy',
        detalle: 'La misma patente cargada en dos balanzas. Puede ser un segundo viaje real.',
        grupos,
        vacio: 'No hay camiones repetidos hoy.',
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /** Camiones que quedaron sin regular de días anteriores (ref. 7c/8a). */
  router.get('/general/sin-regular', exigirApp, exigirGeneral, async (req, res) => {
    try {
      const hoy = hoyStr();
      const docs = await colRegistros()
        .find({
          pesadaPara: 'CAMIONES',
          anulado: { $ne: true },
          confirmada: { $ne: true },
          fechaTaraFinal: { $exists: true },
        })
        .sort({ idTicket: 1 })
        .toArray();

      const grupos = docs
        .filter((r) => r.fechaTaraFinal < hoy && ticketVigente(r.fecha, DIAS_TARA_FINAL_A_REGULADA))
        .map((r) => ({
          patentes: r.patentes || '',
          tickets: [
            {
              id: String(r._id),
              nro: r.nroApp || String(r.idTicket || ''),
              balanza: nombreBalanza(r.codigoIngreso),
              hora: 'tara final ' + fechaCorta(r.fechaTaraFinal),
              usuario: r.usuario || r.cargadoPor || '',
              neto: null,
            },
          ],
        }));

      return res.render('app/general-lista', {
        layout: 'app/layout',
        titulo: 'Sin regular',
        encabezado: 'Camiones sin regular',
        detalle: 'Quedaron de días anteriores. El camión no se archiva hasta que se carga la regulada.',
        grupos,
        vacio: 'No quedó ningún camión sin regular.',
        kg,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * BALANZA Y TURNO  (ref. 6c)
   * ======================================================================= */

  router.get('/balanza', exigirApp, async (req, res) => {
    try {
      const s = sesionApp(req);
      const nombre = s.codigoIngreso ? await nombreDelDia(s.codigoIngreso, hoyStr()) : '';
      return res.render('app/balanza', {
        layout: 'app/layout',
        titulo: 'Balanza y turno',
        balanza: s.balanza,
        nombreDia: nombre,
        esGeneral: !!s.esGeneral,
        puedeCargar: !!s.codigoIngreso,
      });
    } catch (err) {
      return siguienteError(err, req, res);
    }
  });

  /* =========================================================================
   * PANTALLAS DE ERROR
   * ======================================================================= */

  function pantallaError(res, titulo, mensaje, volver) {
    return res.status(400).render('app/error', {
      layout: 'app/layout',
      titulo,
      mensaje,
      volver: volver || '/app/patio',
    });
  }

  function noEncontrado(res) {
    return res.status(404).render('app/error', {
      layout: 'app/layout',
      titulo: 'No se encontró',
      mensaje: 'Ese ticket no existe o no es de esta balanza.',
      volver: '/app/patio',
    });
  }

  // Cualquier otra dirección bajo /app
  router.use((req, res) => {
    if (/^\/api\//.test(req.path)) return fallar(res, 404, 'No existe.');
    return res.status(404).render('app/error', {
      layout: 'app/layout',
      titulo: 'No se encontró',
      mensaje: 'Esa pantalla no existe.',
      volver: '/app',
    });
  });

  // Último recurso: nunca dejar caer el proceso por un error de la app.
  router.use((err, req, res, next) => {
    return siguienteError(err, req, res);
  });

  return router;
};
