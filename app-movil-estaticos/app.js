/* =============================================================================
 * app.js — Motor de la app móvil "Pesada de Balanza"
 *
 * Se ocupa de: estado de conexión, cola de pesadas sin subir, reserva de
 * números de ticket, teclado numérico propio, avisos y envío de formularios.
 *
 * Escrito sin sintaxis moderna (var, funciones, XMLHttpRequest, concatenación,
 * localStorage) para que ande también en Android viejos y WebView antiguo.
 * ========================================================================== */
(function () {
  'use strict';

  var CLAVE_COLA = 'pesada.cola';
  var CLAVE_NUMEROS = 'pesada.numeros';
  var CLAVE_TICKETS = 'pesada.tickets';
  var CLAVE_FALLIDOS = 'pesada.fallidos';

  var App = {};
  window.App = App;

  /* ═══════════════════════════════════════════════════════════════════════
   * Guardado local
   * ═════════════════════════════════════════════════════════════════════ */

  function leer(clave, porDefecto) {
    try {
      var raw = window.localStorage.getItem(clave);
      return raw ? JSON.parse(raw) : porDefecto;
    } catch (e) {
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  App.leer = leer;
  App.escribir = escribir;

  /* ═══════════════════════════════════════════════════════════════════════
   * Utilidades
   * ═════════════════════════════════════════════════════════════════════ */

  function unId() {
    var s = 'loc-' + new Date().getTime().toString(36);
    for (var i = 0; i < 8; i++) {
      s += Math.floor(Math.random() * 36).toString(36);
    }
    return s;
  }
  App.unId = unId;

  App.miles = function (n) {
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
  };

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  App.esc = esc;

  /** Pide algo al servidor. cb(error, datos). */
  function pedir(metodo, url, datos, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(metodo, url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    if (datos) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;

    xhr.onload = function () {
      var cuerpo = null;
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch (e) {
        cuerpo = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && cuerpo && cuerpo.ok) {
        return cb(null, cuerpo);
      }
      if (xhr.status === 401) {
        window.location.href = '/app/ingreso';
        return;
      }
      var err = new Error((cuerpo && cuerpo.error) || 'No se pudo guardar.');
      err.delServidor = true;
      err.estado = xhr.status;
      return cb(err, cuerpo);
    };
    xhr.onerror = function () {
      var e = new Error('sin conexión');
      e.deRed = true;
      cb(e, null);
    };
    xhr.ontimeout = function () {
      var e = new Error('sin conexión');
      e.deRed = true;
      cb(e, null);
    };
    xhr.send(datos ? JSON.stringify(datos) : null);
  }
  App.pedir = pedir;

  /* ═══════════════════════════════════════════════════════════════════════
   * Avisos en pantalla
   * ═════════════════════════════════════════════════════════════════════ */

  var brindisTimer = null;

  App.brindis = function (texto, tipo) {
    var el = document.getElementById('brindis');
    if (!el) {
      if (tipo === 'rojo') window.alert(texto);
      return;
    }
    el.className = 'brindis' + (tipo ? ' ' + tipo : '');
    el.innerHTML = esc(texto);
    el.hidden = false;
    if (brindisTimer) window.clearTimeout(brindisTimer);
    brindisTimer = window.setTimeout(function () {
      el.hidden = true;
    }, tipo === 'rojo' ? 6000 : 4000);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Estado de conexión
   * ═════════════════════════════════════════════════════════════════════ */

  function hayConexion() {
    return navigator.onLine !== false;
  }
  App.hayConexion = hayConexion;

  function pintarConexion() {
    var enLinea = hayConexion();
    var etiquetas = document.querySelectorAll('[data-conexion]');
    for (var i = 0; i < etiquetas.length; i++) {
      etiquetas[i].className = 'conexion ' + (enLinea ? 'en-linea' : 'sin-senal');
      etiquetas[i].innerHTML = enLinea ? 'EN LÍNEA' : 'SIN SEÑAL';
    }
    // Botones que necesitan internet (pedir anulación / corrección)
    var necesitan = document.querySelectorAll('[data-necesita-internet]');
    for (var j = 0; j < necesitan.length; j++) {
      var b = necesitan[j];
      if (enLinea) {
        b.className = b.getAttribute('data-clase-normal') || 'btn btn-borde';
        b.innerHTML = b.getAttribute('data-texto') || 'Pedir anulación';
        b.disabled = false;
      } else {
        // No se esconde el botón: se muestra apagado con el motivo debajo.
        b.className = 'btn btn-apagado';
        b.innerHTML =
          '<span>' + esc(b.getAttribute('data-texto') || 'Pedir anulación') + '</span>' +
          '<span class="motivo">necesita internet</span>';
        b.disabled = true;
      }
    }
    pintarPendientes();
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Cola de pesadas sin subir
   * ═════════════════════════════════════════════════════════════════════ */

  function cola() {
    var c = leer(CLAVE_COLA, []);
    return c instanceof Array ? c : [];
  }

  function guardarCola(c) {
    escribir(CLAVE_COLA, c);
    pintarPendientes();
  }

  App.cola = {
    cantidad: function () {
      return cola().length;
    },
    agregar: function (item) {
      var c = cola();
      c.push(item);
      guardarCola(c);
    },
    todo: cola,
  };

  function pintarPendientes() {
    var n = cola().length;
    var franjas = document.querySelectorAll('[data-pendientes]');
    for (var i = 0; i < franjas.length; i++) {
      var f = franjas[i];
      if (n > 0) {
        f.hidden = false;
        var t = f.querySelector('[data-pendientes-titulo]');
        if (t) {
          t.innerHTML =
            n + (n === 1 ? ' pesada guardada' : ' pesadas guardadas') + ' en el teléfono';
        }
      } else {
        f.hidden = true;
      }
    }
    var chips = document.querySelectorAll('[data-chip-sin-subir]');
    for (var j = 0; j < chips.length; j++) {
      chips[j].hidden = n === 0;
    }
  }

  var sincronizando = false;

  /**
   * Sube todo lo que quedó guardado en el teléfono, de a uno y en orden.
   * Cada pesada lleva su localId: reenviarla no la duplica (el servidor la
   * reconoce y devuelve la que ya había guardado).
   */
  function sincronizar(alTerminar) {
    if (sincronizando) return;
    var pendientes = cola();
    if (!pendientes.length) {
      if (alTerminar) alTerminar(0, 0);
      return;
    }
    if (!hayConexion()) {
      if (alTerminar) alTerminar(0, 0);
      return;
    }

    sincronizando = true;
    var subidas = 0;
    var rechazadas = 0;
    var motivoRechazo = '';

    function siguiente() {
      var restantes = cola();
      if (!restantes.length) {
        sincronizando = false;
        if (subidas > 0) {
          App.brindis(
            'Volvió internet — ' + subidas + (subidas === 1 ? ' pesada subida' : ' pesadas subidas')
          );
        }
        if (rechazadas > 0) {
          App.brindis(
            rechazadas + (rechazadas === 1 ? ' pesada no se pudo subir' : ' pesadas no se pudieron subir') +
              (motivoRechazo ? ': ' + motivoRechazo : '') + '. Hay que cargarla de nuevo.',
            'rojo'
          );
        }
        if (alTerminar) alTerminar(subidas, rechazadas);
        if (subidas > 0) {
          // Refrescar el patio con lo que ya está en el servidor.
          window.setTimeout(function () {
            if (window.location.pathname === '/app/patio') window.location.reload();
          }, 1200);
        }
        return;
      }

      var item = restantes[0];
      pedir('POST', item.url, item.datos, function (err, res) {
        if (err && err.deRed) {
          // Se cortó otra vez: se deja la cola como está y se reintenta después.
          sincronizando = false;
          if (alTerminar) alTerminar(subidas, rechazadas);
          return;
        }

        var c = cola();
        c.shift();
        guardarCola(c);

        if (err) {
          // El servidor la rechazó por un motivo real (dato inválido, ticket
          // vencido). No sirve reintentar: se guarda para mostrarla.
          rechazadas++;
          if (!motivoRechazo) motivoRechazo = err.message;
          var fallidos = leer(CLAVE_FALLIDOS, []);
          if (!(fallidos instanceof Array)) fallidos = [];
          fallidos.push({
            localId: item.localId,
            tipo: item.tipo,
            datos: item.datos,
            motivo: err.message,
            cuando: new Date().toISOString(),
          });
          escribir(CLAVE_FALLIDOS, fallidos.slice(-30));
        } else {
          subidas++;
          if (res && res.id && item.localId) enlazarLocalConServidor(item.localId, res);
        }
        siguiente();
      });
    }

    siguiente();
  }
  App.sincronizar = sincronizar;

  /** Cuando una pesada local se sube, se le pega el id real del servidor. */
  function enlazarLocalConServidor(localId, res) {
    var tickets = leer(CLAVE_TICKETS, {});
    if (tickets && tickets[localId]) {
      var t = tickets[localId];
      t.id = res.id;
      if (res.nro) t.nro = res.nro;
      tickets[res.id] = t;
      escribir(CLAVE_TICKETS, tickets);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Números de ticket reservados (para poder cargar e imprimir sin señal)
   * ═════════════════════════════════════════════════════════════════════ */

  function numeros() {
    var n = leer(CLAVE_NUMEROS, []);
    return n instanceof Array ? n : [];
  }

  App.numeros = {
    cantidad: function () {
      return numeros().length;
    },

    /** Saca uno de los reservados. Devuelve '' si no quedan. */
    tomar: function () {
      var n = numeros();
      if (!n.length) return '';
      var nro = n.shift();
      escribir(CLAVE_NUMEROS, n);
      return nro;
    },

    devolver: function (nro) {
      if (!nro) return;
      var n = numeros();
      n.unshift(nro);
      escribir(CLAVE_NUMEROS, n);
    },

    /** Rellena la reserva cuando hay señal, para tener números por si se corta. */
    asegurar: function (minimo, cb) {
      var faltan = (minimo || 3) - numeros().length;
      if (faltan <= 0 || !hayConexion()) {
        if (cb) cb();
        return;
      }
      pedir('POST', '/app/api/numeros/reservar', { cantidad: faltan }, function (err, res) {
        if (!err && res && res.numeros && res.numeros.length) {
          escribir(CLAVE_NUMEROS, numeros().concat(res.numeros));
        }
        if (cb) cb();
      });
    },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Envío de formularios
   * ═════════════════════════════════════════════════════════════════════ */

  /** Junta los datos de un formulario en un objeto simple. */
  App.datosDe = function (form) {
    var datos = {};
    var els = form.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (!el.checked) continue;
        if (datos[el.name] === undefined) datos[el.name] = [];
        if (datos[el.name] instanceof Array) datos[el.name].push(el.value);
        else datos[el.name] = [datos[el.name], el.value];
        continue;
      }
      datos[el.name] = el.value;
    }
    return datos;
  };

  function bloquear(boton, texto) {
    if (!boton) return function () {};
    var antes = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = esc(texto || 'Guardando…');
    return function () {
      boton.disabled = false;
      boton.innerHTML = antes;
    };
  }

  /**
   * Envía una pesada. Si no hay conexión (o se corta en el intento) y la
   * operación se puede encolar, se confirma YA en el teléfono y se sube sola
   * después. Si no se puede encolar (pedidos de anulación), avisa que hace
   * falta internet.
   */
  App.enviar = function (opciones) {
    var url = opciones.url;
    var datos = opciones.datos || {};
    var puedeEsperar = opciones.offline === true;
    var boton = opciones.boton || null;
    var desbloquear = bloquear(boton, opciones.textoGuardando);

    if (puedeEsperar && !datos.localId) datos.localId = unId();

    function encolar(motivo) {
      App.cola.agregar({
        localId: datos.localId,
        tipo: opciones.tipo || '',
        url: url,
        datos: datos,
        creadoEn: new Date().toISOString(),
      });
      desbloquear();
      if (opciones.alGuardarLocal) {
        opciones.alGuardarLocal(datos, motivo);
      } else {
        App.brindis('Guardado en el teléfono. Se sube solo cuando vuelva internet.', 'ambar');
      }
    }

    // Sin señal y se puede esperar: se confirma en el momento, sin spinner.
    if (puedeEsperar && !hayConexion()) {
      return encolar('sin-senal');
    }

    pedir('POST', url, datos, function (err, res) {
      if (err && err.deRed && puedeEsperar) return encolar('se-corto');
      desbloquear();
      if (err) {
        if (opciones.alFallar) return opciones.alFallar(err.message, err);
        return App.brindis(err.message, 'rojo');
      }
      if (opciones.alListo) return opciones.alListo(res);
      if (res.destino) window.location.href = res.destino;
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Teclado numérico propio (ref. 6a y 6d)
   * ═════════════════════════════════════════════════════════════════════ */

  /**
   * opciones = { raiz, largo, alCompletar(codigo) }
   * `raiz` contiene los casilleros [data-casillero] y las teclas [data-tecla].
   */
  App.teclado = function (opciones) {
    var raiz = opciones.raiz;
    if (!raiz) return null;
    var largo = opciones.largo || 6;
    var casilleros = raiz.querySelectorAll('[data-casillero]');
    var teclas = raiz.querySelectorAll('[data-tecla]');
    var valor = '';

    function pintar() {
      for (var i = 0; i < casilleros.length; i++) {
        var c = casilleros[i];
        var base = c.getAttribute('data-clase') || 'casillero';
        if (i < valor.length) {
          c.className = base;
          c.innerHTML = opciones.oculto ? '•' : esc(valor.charAt(i));
        } else if (i === valor.length) {
          c.className = base + ' activo';
          c.innerHTML = '';
        } else {
          c.className = base;
          c.innerHTML = '';
        }
      }
      if (opciones.alCambiar) opciones.alCambiar(valor);
    }

    function apretar(t) {
      if (t === 'borrar') {
        valor = valor.slice(0, -1);
      } else if (valor.length < largo) {
        valor += t;
      }
      pintar();
      if (valor.length >= (opciones.autoLargo || 0) && opciones.autoLargo && opciones.alCompletar) {
        opciones.alCompletar(valor);
      }
    }

    for (var i = 0; i < teclas.length; i++) {
      (function (tecla) {
        tecla.addEventListener('click', function (ev) {
          ev.preventDefault();
          apretar(tecla.getAttribute('data-tecla'));
        });
      })(teclas[i]);
    }

    // También se puede tipear con teclado físico (útil para probar).
    raiz.addEventListener('keydown', function (ev) {
      if (ev.key >= '0' && ev.key <= '9') {
        apretar(ev.key);
        ev.preventDefault();
      } else if (ev.key === 'Backspace') {
        apretar('borrar');
        ev.preventDefault();
      }
    });

    pintar();

    return {
      valor: function () {
        return valor;
      },
      limpiar: function () {
        valor = '';
        pintar();
      },
    };
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Modales (hoja inferior)
   * ═════════════════════════════════════════════════════════════════════ */

  App.abrirModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = false;
  };

  App.cerrarModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  };

  function conectarModales() {
    var abridores = document.querySelectorAll('[data-abre-modal]');
    for (var i = 0; i < abridores.length; i++) {
      (function (b) {
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          App.abrirModal(b.getAttribute('data-abre-modal'));
        });
      })(abridores[i]);
    }
    var cerradores = document.querySelectorAll('[data-cierra-modal]');
    for (var j = 0; j < cerradores.length; j++) {
      (function (b) {
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          App.cerrarModal(b.getAttribute('data-cierra-modal'));
        });
      })(cerradores[j]);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Botones-opción (reemplazan los radios: área táctil grande)
   * ═════════════════════════════════════════════════════════════════════ */

  function conectarOpciones() {
    var grupos = document.querySelectorAll('[data-opciones]');
    for (var g = 0; g < grupos.length; g++) {
      (function (grupo) {
        var nombre = grupo.getAttribute('data-opciones');
        var oculto = document.querySelector('input[type="hidden"][name="' + nombre + '"]');
        var botones = grupo.querySelectorAll('[data-valor]');
        for (var i = 0; i < botones.length; i++) {
          (function (b) {
            b.addEventListener('click', function (ev) {
              ev.preventDefault();
              for (var k = 0; k < botones.length; k++) {
                botones[k].className = botones[k].className.replace(/\s*elegida/g, '');
              }
              b.className += ' elegida';
              if (oculto) {
                oculto.value = b.getAttribute('data-valor');
                if (window.CustomEvent) {
                  oculto.dispatchEvent(new CustomEvent('cambio-opcion', { bubbles: true }));
                } else if (oculto.onchange) {
                  oculto.onchange();
                }
              }
            });
          })(botones[i]);
        }
      })(grupos[g]);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Sugerencias para autocompletar (patentes, choferes, transportes)
   * ═════════════════════════════════════════════════════════════════════ */

  App.cargarSugerencias = function (cb) {
    var guardadas = leer('pesada.sugerencias', null);
    if (guardadas && guardadas.hasta > new Date().getTime()) {
      if (cb) cb(guardadas.datos);
      return;
    }
    if (!hayConexion()) {
      if (cb && guardadas) cb(guardadas.datos);
      return;
    }
    pedir('GET', '/app/api/sugerencias', null, function (err, res) {
      if (err || !res || !res.datos) {
        if (cb && guardadas) cb(guardadas.datos);
        return;
      }
      escribir('pesada.sugerencias', {
        hasta: new Date().getTime() + 6 * 60 * 60 * 1000,
        datos: res.datos,
      });
      if (cb) cb(res.datos);
    });
  };

  /** Llena un <datalist> con una lista de textos. */
  App.llenarLista = function (idLista, valores) {
    var lista = document.getElementById(idLista);
    if (!lista || !valores) return;
    var h = '';
    for (var i = 0; i < valores.length && i < 800; i++) {
      h += '<option value="' + esc(valores[i]) + '"></option>';
    }
    lista.innerHTML = h;
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Compartir el PDF del ticket (WhatsApp, mail, lo que tenga el teléfono)
   * -----------------------------------------------------------------------
   * El archivo se baja de antemano, al abrir la pantalla. Es a propósito: el
   * Safari del iPhone solo deja compartir si el pedido sale en el mismo toque
   * del dedo, y no llega si primero hay que esperar una descarga.
   * ═════════════════════════════════════════════════════════════════════ */

  function bajarArchivo(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.timeout = 20000;
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) return cb(null, xhr.response);
      cb(new Error('No se pudo preparar el PDF.'), null);
    };
    xhr.onerror = function () { cb(new Error('sin conexión'), null); };
    xhr.ontimeout = function () { cb(new Error('sin conexión'), null); };
    xhr.send();
  }

  function guardarComoArchivo(blob, nombre) {
    try {
      if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, nombre);
        return true;
      }
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 20000);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * App.compartir({ boton, url, nombre, titulo, texto })
   * Prepara el archivo al abrir la pantalla y lo comparte al tocar el botón.
   * Si el teléfono no sabe compartir archivos, lo descarga.
   */
  App.compartir = function (op) {
    var boton = op.boton;
    if (!boton) return;
    var listo = null;
    var bajando = false;

    function preparar() {
      if (listo || bajando || !hayConexion()) return;
      bajando = true;
      bajarArchivo(op.url, function (err, blob) {
        bajando = false;
        if (!err) listo = blob;
      });
    }

    function compartir(blob) {
      var archivo = null;
      try {
        archivo = new File([blob], op.nombre, { type: 'application/pdf' });
      } catch (e) {
        archivo = null; // navegador viejo sin File()
      }

      if (archivo && navigator.canShare && navigator.share &&
          navigator.canShare({ files: [archivo] })) {
        navigator
          .share({ files: [archivo], title: op.titulo || '', text: op.texto || '' })
          .then(function () { App.brindis('Listo, se compartió.'); })
          .catch(function (e) {
            // Si el usuario cancela no hay nada que avisar.
            if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
            if (guardarComoArchivo(blob, op.nombre)) {
              App.brindis('Se descargó el PDF. Compartilo desde tus archivos.', 'ambar');
            }
          });
        return;
      }

      // La computadora y los teléfonos que no comparten archivos: se descarga.
      if (guardarComoArchivo(blob, op.nombre)) {
        App.brindis('Se descargó el PDF. Compartilo desde tus archivos.', 'ambar');
      } else {
        window.location.href = op.url;
      }
    }

    boton.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (listo) return compartir(listo);
      var restaurar = bloquear(boton, 'Preparando…');
      bajarArchivo(op.url, function (err, blob) {
        restaurar();
        if (err) return App.brindis('No se pudo preparar el PDF. Fijate si tenés internet.', 'rojo');
        listo = blob;
        compartir(blob);
      });
    });

    preparar();
    if (window.addEventListener) window.addEventListener('online', preparar);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Tickets guardados en el teléfono (para imprimirlos sin señal)
   * ═════════════════════════════════════════════════════════════════════ */

  App.guardarTicketLocal = function (ticket) {
    var tickets = leer(CLAVE_TICKETS, {});
    if (!tickets) tickets = {};
    var clave = ticket.id || ticket.localId;
    if (clave) {
      tickets[clave] = ticket;
      escribir(CLAVE_TICKETS, tickets);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Service worker (para que la app abra sin señal)
   * ═════════════════════════════════════════════════════════════════════ */

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Solo sobre HTTPS (o localhost). En Render ya hay HTTPS.
    try {
      navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(function (e) {
        if (window.console) console.warn('[app] service worker no registrado:', e && e.message);
      });
    } catch (e) {
      /* navegador viejo: la app anda igual, solo no queda offline */
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Arranque
   * ═════════════════════════════════════════════════════════════════════ */

  function arrancar() {
    pintarConexion();
    conectarModales();
    conectarOpciones();
    registrarServiceWorker();

    if (window.addEventListener) {
      window.addEventListener('online', function () {
        pintarConexion();
        // Ni bien vuelve la conexión se sincroniza solo, sin que el usuario
        // haga nada.
        sincronizar();
        App.numeros.asegurar(3);
      });
      window.addEventListener('offline', pintarConexion);
    }

    // Al abrir: subir lo que quedó pendiente y rellenar números reservados.
    if (hayConexion()) {
      sincronizar();
      if (document.body.getAttribute('data-puede-cargar') === '1') {
        App.numeros.asegurar(3);
      }
    }

    // Cada 30 segundos se revisa si volvió la señal (algunos Android no
    // disparan el evento 'online').
    window.setInterval(function () {
      pintarConexion();
      if (hayConexion() && cola().length) sincronizar();
    }, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
