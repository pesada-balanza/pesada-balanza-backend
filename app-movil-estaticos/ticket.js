/* =============================================================================
 * ticket.js — Dibuja el ticket del chofer (formato 5a) en el teléfono.
 *
 * Es el ÚNICO dibujante del ticket: se usa igual con señal y sin señal, así el
 * papel sale siempre idéntico. Con señal los datos vienen de /app/api/tickets;
 * sin señal salen de lo que el teléfono guardó en local.
 *
 * Escrito sin sintaxis moderna (var, funciones, XMLHttpRequest, concatenación)
 * para que funcione también en Android viejos / WebView antiguo.
 * ========================================================================== */
(function () {
  'use strict';

  var CLAVE_TICKETS = 'pesada.tickets';

  function porId(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function miles(n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    var s = String(Math.round(Math.abs(v)));
    var out = '';
    var c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      c++;
      if (c % 3 === 0 && i > 0) out = '.' + out;
    }
    return (v < 0 ? '-' : '') + out;
  }

  function leerCache() {
    try {
      var raw = window.localStorage.getItem(CLAVE_TICKETS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function guardarEnCache(tickets) {
    try {
      var cache = leerCache();
      for (var i = 0; i < tickets.length; i++) {
        var t = tickets[i];
        var clave = t.id || t.localId;
        if (clave) cache[clave] = t;
      }
      window.localStorage.setItem(CLAVE_TICKETS, JSON.stringify(cache));
    } catch (e) {
      /* si no hay lugar, no pasa nada: el ticket ya está en pantalla */
    }
  }

  /* ── Un valor: si está, se imprime; si no, va renglón punteado ────────── */
  function valor(v, clase) {
    if (v === null || v === undefined || String(v) === '') {
      return '<span class="tk-renglon"></span>';
    }
    return '<span class="tk-valor' + (clase ? ' ' + clase : '') + '">' + esc(v) + '</span>';
  }

  function peso(nombre, v) {
    var cuerpo =
      v === null || v === undefined || v === '' || !isFinite(Number(v))
        ? '<span class="tk-renglon"></span>'
        : '<span class="tk-peso-valor">' + miles(v) + ' kg</span>';
    return (
      '<div class="tk-peso"><span class="tk-peso-nombre">' + esc(nombre) + '</span>' + cuerpo + '</div>'
    );
  }

  /**
   * Dibuja un ticket. `t` es el objeto que devuelve el servidor (vistaRegistro)
   * o el que armó el teléfono cuando cargó sin señal.
   */
  function dibujarTicket(t) {
    var granoLote = '';
    if (t.grano || t.loteTexto) {
      granoLote = [t.grano, t.loteTexto].filter(Boolean).join(' · ');
    }

    var fechaHora = (t.fechaLarga || '') + (t.hora ? ' · ' + t.hora : '');

    var h = '';
    h += '<div class="tk">';
    h += '<div class="tk-cuerpo">';

    /* Izquierda: establecimiento, titular, número y fecha.
       No se muestra NUNCA el código de acceso (es secreto). */
    h += '<div class="tk-izq">';
    h += '<div>';
    h += '<div class="tk-establecimiento">' + esc(t.campoCorto || t.balanza || '') + '</div>';
    h += '<div class="tk-titular">' + esc(t.titular || 'AMH') + '</div>';
    h += '</div>';
    h += '<div>';
    h += '<div class="tk-nro-label">TICKET Nº</div>';
    h += '<div class="tk-nro">' + esc(t.nro || '') + '</div>';
    h += '<div class="tk-fecha">' + esc(fechaHora) + '</div>';
    h += '</div>';
    h += '</div>';

    /* Centro: datos del viaje */
    h += '<div class="tk-centro">';
    h += '<div class="tk-dato"><span class="tk-label">PATENTES</span>' + valor(t.patentes, 'patente') + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">CHOFER</span>' + valor(t.chofer, 'chofer') + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">TRANSPORTE</span>' + valor(t.transporte) + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">CAMPO</span>' + valor(t.campoCorto) + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">GRANO · LOTE</span>' + valor(granoLote) + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">CP / CTG</span>' + valor(t.cp) + '</div>';
    h += '<div class="tk-dato ancho"><span class="tk-label">OBSERVACIONES</span>' + valor(t.comentarios) + '</div>';
    h += '</div>';

    /* Derecha: los pesos, en el orden del diseño */
    h += '<div class="tk-der">';
    h += '<div class="tk-pesos">';
    h += peso('Bruto estimado', t.brutoEstimado);
    h += peso('Tara final', t.fechaTaraFinal ? t.tara : null);
    h += peso('Bruto lote', t.brutoLote);
    h += peso('Bruto regulado', t.bruto);
    h += '</div>';
    h += '<div class="tk-neto"><span class="tk-neto-label">NETO</span>';
    h +=
      t.neto === null || t.neto === undefined || t.neto === ''
        ? '<span class="tk-renglon"></span>'
        : '<span class="tk-neto-valor">' + miles(t.neto) + '</span>';
    h += '</div>';
    h += '<div class="tk-firma"><div class="tk-firma-linea"></div><span class="tk-firma-texto">FIRMA CHOFER</span></div>';
    h += '</div>';

    h += '</div>';
    h += '<div class="tk-corte"><span>CORTAR AQUÍ</span></div>';
    h += '</div>';
    return h;
  }

  /* ── Armado de la hoja: de a 6 tickets por hoja A4 ────────────────────── */

  function dibujarHoja(tickets) {
    var hojas = '';
    for (var i = 0; i < tickets.length; i += 6) {
      var grupo = tickets.slice(i, i + 6);
      var contenido = '';
      for (var j = 0; j < grupo.length; j++) contenido += dibujarTicket(grupo[j]);
      hojas += '<div class="tk-hoja">' + contenido + '</div>';
    }
    return hojas;
  }

  /* ── Carga de datos ───────────────────────────────────────────────────── */

  function pedirDelServidor(ids, cb) {
    if (!ids.length) return cb(null, []);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/app/api/tickets?ids=' + encodeURIComponent(ids.join(',')), true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 12000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) return cb(new Error('http ' + xhr.status), null);
      try {
        var r = JSON.parse(xhr.responseText);
        return cb(null, (r && r.tickets) || []);
      } catch (e) {
        return cb(e, null);
      }
    };
    xhr.onerror = function () { cb(new Error('sin conexión'), null); };
    xhr.ontimeout = function () { cb(new Error('tardó demasiado'), null); };
    xhr.send();
  }

  function delCache(claves) {
    var cache = leerCache();
    var out = [];
    for (var i = 0; i < claves.length; i++) {
      if (cache[claves[i]]) out.push(cache[claves[i]]);
    }
    return out;
  }

  function marcarImpreso(ids) {
    if (!ids.length) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/app/api/impreso', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ ids: ids }));
  }

  /* ── Arranque ─────────────────────────────────────────────────────────── */

  function arrancar() {
    var raiz = porId('tk-visor');
    if (!raiz) return;

    var ids = (raiz.getAttribute('data-ids') || '').split(',').filter(Boolean);
    var locales = (raiz.getAttribute('data-locales') || '').split(',').filter(Boolean);
    var aviso = porId('tk-aviso');
    var btnImprimir = porId('tk-imprimir');

    function pintar(tickets, sinConexion) {
      if (!tickets.length) {
        raiz.innerHTML =
          '<div class="tk-aviso">No se pudo armar el ticket. Volvé al patio y probá de nuevo.</div>';
        if (btnImprimir) btnImprimir.style.display = 'none';
        return;
      }
      raiz.innerHTML = dibujarHoja(tickets);

      if (aviso) {
        var textos = [];
        if (sinConexion) textos.push('Sin señal: el ticket se armó con los datos del teléfono.');
        if (tickets.length > 1) {
          textos.push(
            tickets.length + ' tickets, de a 6 por hoja. Se cortan por la línea punteada.'
          );
        }
        if (textos.length) {
          aviso.innerHTML = esc(textos.join(' '));
          aviso.style.display = '';
        }
      }

      if (btnImprimir) {
        btnImprimir.onclick = function () {
          window.print();
          if (!sinConexion) marcarImpreso(ids);
        };
      }

      // Auto-abrir el diálogo de impresión: es a lo que vino el balancero.
      window.setTimeout(function () {
        try {
          window.print();
          if (!sinConexion) marcarImpreso(ids);
        } catch (e) {
          /* si el navegador lo bloquea, queda el botón */
        }
      }, 350);
    }

    var localesTickets = delCache(locales);

    if (!ids.length) {
      return pintar(localesTickets, true);
    }

    pedirDelServidor(ids, function (err, tickets) {
      if (err || !tickets || !tickets.length) {
        // Sin señal (o el servidor no contestó): se dibuja con lo guardado.
        return pintar(delCache(ids).concat(localesTickets), true);
      }
      guardarEnCache(tickets);
      pintar(tickets.concat(localesTickets), false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
