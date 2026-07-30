/* =============================================================================
 * sw.js — Service worker de la app móvil.
 *
 * Para qué sirve: que la app ABRA sin señal y se pueda seguir cargando. Los
 * datos que se cargan sin conexión los maneja el propio teléfono (cola en
 * localStorage, ver app.js); acá solo se guarda la "cáscara" de las pantallas.
 *
 * Alcance: /app (se sirve desde /app/sw.js con el encabezado
 * Service-Worker-Allowed). NO toca nada de la web: fuera de /app este service
 * worker no interviene en ninguna petición.
 * ========================================================================== */
'use strict';

// Al subir cambios hay que subir este número: así el teléfono descarta las
// pantallas guardadas y toma las nuevas. Las pesadas sin subir NO se tocan:
// viven en localStorage y este archivo no lo mira nunca.
var VERSION = 'pesada-app-v4';

// Dos copias separadas a propósito:
//  - FIJOS: css, js, ícono. No dependen de quién esté usando la app.
//  - PANTALLAS: el HTML, que SÍ depende del código con el que se entró (el
//    patio de una balanza no es el de otra). Se borra al cambiar de código,
//    así sin señal nunca aparece la pantalla del código anterior.
var CACHE_FIJOS = VERSION + '-fijos';
var CACHE_PANTALLAS = VERSION + '-pantallas';

var ESENCIALES = [
  '/app/estatico/app.css',
  '/app/estatico/app.js',
  '/app/estatico/ticket.css',
  '/app/estatico/ticket.js',
  '/app/manifest.webmanifest',
  '/app/icono.svg',
  // Pantalla para seguir un ticket sin señal. Se guarda desde el arranque
  // porque justamente hace falta cuando ya no hay conexión para pedirla.
  '/app/local',
];

/**
 * Pantallas que el propio teléfono llena con lo que tiene guardado. La
 * dirección lleva datos atrás del "?" (qué ticket, qué paso), pero el HTML es
 * siempre el mismo, así que se busca en lo guardado SIN mirar el "?".
 *
 * Sin esto, "Cargar tara final" sin señal no hacía nada: pedía
 * /app/local?paso=tara-final&id=… , eso no estaba guardado con ese "?" exacto,
 * y terminaba mostrando el patio de vuelta. Se veía como un botón muerto.
 */
var CASCARAS = ['/app/local', '/app/imprimir'];

function esCascara(pathname) {
  for (var i = 0; i < CASCARAS.length; i++) {
    if (pathname === CASCARAS[i]) return true;
  }
  return false;
}

/** Busca en lo guardado, y para las cáscaras ignora lo que va atrás del "?". */
function buscarGuardado(req, url) {
  if (esCascara(url.pathname)) {
    return caches.match(url.origin + url.pathname).then(function (r) {
      return r || caches.match(req);
    });
  }
  return caches.match(req);
}

/**
 * IMPORTANTE: si alguno de los esenciales no se puede bajar, la instalación
 * FALLA a propósito. Así el teléfono se queda con la copia vieja, que funciona,
 * en vez de quedarse sin ninguna.
 *
 * Esto pasa de verdad: la app se actualiza en el campo, con media señal. Si se
 * aceptara una instalación a medias y después se borrara la copia anterior, el
 * balancero se quedaba sin poder abrir la app justo sin conexión. Con esto,
 * mientras no se pueda bajar todo, sigue andando la versión que ya tenía y se
 * vuelve a intentar la próxima vez que abra.
 */
self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE_FIJOS).then(function (cache) {
      return cache.addAll(
        ESENCIALES.map(function (url) {
          return new Request(url, { cache: 'reload' });
        })
      ).then(function () {
        // Recién cuando está TODO guardado se toma el relevo.
        return self.skipWaiting();
      });
    })
  );
});

/**
 * Borra las versiones anteriores, pero solo después de comprobar que la nueva
 * está completa. Doble red: si por lo que sea quedó a medias, no se toca la
 * copia vieja.
 */
self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches
      .open(CACHE_FIJOS)
      .then(function (cache) {
        return cache.match('/app/estatico/app.js');
      })
      .then(function (estaCompleta) {
        if (!estaCompleta) return null; // la nueva no sirve: se deja lo de antes
        return caches.keys().then(function (claves) {
          return Promise.all(
            claves.map(function (k) {
              if (k === CACHE_FIJOS || k === CACHE_PANTALLAS) return null;
              return caches.delete(k);
            })
          );
        });
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/**
 * La app avisa cuando se cambió de código (o se salió) para que las pantallas
 * guardadas se tiren: son del código anterior y sin señal mostrarían datos de
 * otra balanza. Los archivos fijos (css, js) se quedan, que no dependen de eso.
 */
self.addEventListener('message', function (ev) {
  var msj = ev.data || {};
  if (msj.tipo !== 'olvidar-pantallas') return;
  ev.waitUntil(
    caches.delete(CACHE_PANTALLAS).then(function () {
      if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ listo: true });
    })
  );
});

function esDeLaApp(url) {
  return url.pathname === '/app' || url.pathname.indexOf('/app/') === 0;
}

/** Pantalla de "necesita internet", para que un botón nunca parezca muerto. */
function pantallaNoGuardada(pathname) {
  var esElCodigo = pathname === '/app/ingreso';
  var titulo = esElCodigo ? 'Para entrar con un código hace falta internet' : 'Esta pantalla necesita internet';
  var detalle = esElCodigo
    ? 'El código se revisa en el servidor, así que hace falta conexión una vez. Después la app ' +
      'sigue funcionando sin señal con el código que ya está abierto.'
    : 'Desde el patio se puede seguir cargando sin señal: el camión, la tara final y la regulada.';

  return new Response(
    '<!doctype html><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<body style="margin:0;background:#f8f7f4;font:400 16px/1.5 \'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#1b1a17">' +
      '<div style="padding:28px 20px;max-width:480px;margin:0 auto">' +
      '<div style="font:500 9px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#8f5514">SIN SEÑAL</div>' +
      '<h1 style="font:600 25px/1.2 \'Helvetica Neue\',Helvetica,Arial,sans-serif;margin:8px 0 10px">' + titulo + '</h1>' +
      '<p style="color:#5f5c55;margin:0 0 18px">' + detalle + '</p>' +
      '<a href="/app/patio" style="display:flex;align-items:center;justify-content:center;min-height:54px;background:#1b1a17;color:#f8f7f4;border-radius:15px;font-weight:600;text-decoration:none">Ir al patio</a>' +
      '</div></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
  );
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Fuera de /app no se mete: la web actual sigue funcionando como siempre.
  if (url.origin !== self.location.origin || !esDeLaApp(url)) return;

  // Los endpoints /api nunca se cachean: siempre datos frescos o error de red
  // (que el teléfono maneja encolando).
  if (url.pathname.indexOf('/app/api/') === 0) return;

  // Estáticos: primero el cache (son inmutables dentro de una versión).
  if (url.pathname.indexOf('/app/estatico/') === 0 ||
      url.pathname === '/app/icono.svg' ||
      url.pathname === '/app/manifest.webmanifest') {
    ev.respondWith(
      caches.match(req).then(function (guardado) {
        if (guardado) return guardado;
        return fetch(req).then(function (resp) {
          if (resp && resp.ok) {
            var copia = resp.clone();
            caches.open(CACHE_FIJOS).then(function (c) { c.put(req, copia); });
          }
          return resp;
        });
      })
    );
    return;
  }

  // Pantallas: primero la red (para ver datos frescos), y si no hay señal se
  // muestra la última versión guardada.
  ev.respondWith(
    fetch(req)
      .then(function (resp) {
        // Las respuestas que son un desvío (por ejemplo /app, que manda al
        // patio o a la pantalla de GENERAL según el código) NO se guardan: si
        // se guardaran, sin señal el teléfono mostraría la pantalla del código
        // con el que se entró la última vez, que puede no ser el de ahora.
        if (resp && resp.ok && resp.type !== 'opaque' && !resp.redirected) {
          var copia = resp.clone();
          caches.open(CACHE_PANTALLAS).then(function (c) { c.put(req, copia); });
        }
        return resp;
      })
      .catch(function () {
        return buscarGuardado(req, url).then(function (guardado) {
          if (guardado) return guardado;
          // La raíz de la app: se ofrece el patio, que es donde el balancero
          // trabaja y lo único que se puede dibujar sin datos del servidor.
          if (url.pathname === '/app' || url.pathname === '/app/patio') {
            return caches.match('/app/patio').then(function (patio) {
              return patio || pantallaNoGuardada(url.pathname);
            });
          }
          // Cualquier otra pantalla: se dice que necesita internet. Antes se
          // mostraba el patio y parecía que el botón no hacía nada.
          return pantallaNoGuardada(url.pathname);
        });
      })
  );
});
