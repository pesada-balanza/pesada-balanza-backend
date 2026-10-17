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

  /* ── El campo, en hasta dos renglones ─────────────────────────────────────
     Los campos se llaman "Nombre - LOCALIDAD - PROVINCIA" y no entran en los
     31 mm de la columna. Se corta por el guion y no por donde caiga: queda
     "El Mataco" arriba y "SACHAYOJ - SE" abajo. El PDF corta igual
     (`partirCampo` en app-movil-pdf.js). */
  function campoEnDos(campo) {
    var s = String(campo || '').trim();
    if (!s) return '<span class="tk-renglon"></span>';
    var i = s.indexOf(' - ');
    if (i === -1) return '<span class="tk-campo-valor">' + esc(s) + '</span>';
    return '<span class="tk-campo-valor">' + esc(s.slice(0, i)) + '</span>' +
      '<span class="tk-campo-valor">' + esc(s.slice(i + 3)) + '</span>';
  }

  /* ── Grano arriba, lote abajo ─────────────────────────────────────────────
     En un solo renglón el lote se cortaba casi siempre, y el lote es el dato
     que se busca. Si falta alguno de los dos, va el otro solo; si faltan los
     dos, renglón punteado. */
  function granoYLote(t) {
    if (!t.grano && !t.loteTexto) return '<span class="tk-renglon"></span>';
    var h = '';
    if (t.grano) h += '<span class="tk-valor">' + esc(t.grano) + '</span>';
    if (t.loteTexto) h += '<span class="tk-valor-2">' + esc(t.loteTexto) + '</span>';
    return h;
  }

  /* ── De dónde cargó: un renglón por bolsa o por tractor, con sus kg ───────
     La lista la arma el servidor (vistaRegistro), así el papel y el PDF dicen
     lo mismo. Entran TRES renglones; con más, van dos y el tercero dice
     cuántos faltan. Son tres y no cuatro porque en el PDF el cuarto le pisa la
     etiqueta de OBSERVACIONES, y los dos tienen que salir iguales. */
  var MAX_ORIGEN = 3;

  function origen(t) {
    var lista = t.origenLista || [];
    if (!lista.length) return '<span class="tk-renglon"></span>';
    var muestra = lista.length <= MAX_ORIGEN ? lista : lista.slice(0, MAX_ORIGEN - 1);
    var h = '<div class="tk-origen">';
    for (var i = 0; i < muestra.length; i++) {
      h += '<span class="tk-origen-linea"><b>' + esc(muestra[i].nombre) + '</b>' +
        (muestra[i].kg ? ' <span class="kg">' + miles(muestra[i].kg) + '</span>' : '') + '</span>';
    }
    var sobran = lista.length - muestra.length;
    if (sobran > 0) h += '<span class="tk-origen-mas">y ' + sobran + ' más</span>';
    h += '</div>';
    return h;
  }

  /**
   * Dibuja un ticket. `t` es el objeto que devuelve el servidor (vistaRegistro)
   * o el que armó el teléfono cuando cargó sin señal.
   */
  function dibujarTicket(t) {
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
    h += '<div class="tk-campo"><span class="tk-label">CAMPO</span>' + campoEnDos(t.campo) + '</div>';
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
    h += '<div class="tk-dato"><span class="tk-label">GRANO · LOTE</span>' + granoYLote(t) + '</div>';
    h += '<div class="tk-dato"><span class="tk-label">' +
      esc(t.origenEtiqueta || 'CARGÓ DE') + '</span>' + origen(t) + '</div>';
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

    // Qué tickets hay que dibujar. Se mira primero la dirección y después lo
    // que puso el servidor: sin señal la hoja sale de lo guardado y esa copia
    // puede haber quedado con los datos de otro ticket, pero la dirección es
    // siempre la que el balancero acaba de tocar.
    function deLaDireccion(nombre) {
      var m = new RegExp('[?&]' + nombre + '=([^&]*)').exec(window.location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }
    function lista(nombre, atributo) {
      var v = deLaDireccion(nombre) || raiz.getAttribute(atributo) || '';
      return v.split(',').filter(Boolean);
    }

    var ids = lista('ids', 'data-ids');
    var locales = lista('locales', 'data-locales');
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
