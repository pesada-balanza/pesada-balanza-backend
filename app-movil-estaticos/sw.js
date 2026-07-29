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

var VERSION = 'pesada-app-v1';
var ESENCIALES = [
  '/app/estatico/app.css',
  '/app/estatico/app.js',
  '/app/estatico/ticket.css',
  '/app/estatico/ticket.js',
  '/app/manifest.webmanifest',
  '/app/icono.svg',
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // Si alguno falla no se aborta la instalación: la app tiene que poder
      // instalarse igual.
      return Promise.all(
        ESENCIALES.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches
      .keys()
      .then(function (claves) {
        return Promise.all(
          claves.map(function (k) {
            return k === VERSION ? null : caches.delete(k);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function esDeLaApp(url) {
  return url.pathname === '/app' || url.pathname.indexOf('/app/') === 0;
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
            caches.open(VERSION).then(function (c) { c.put(req, copia); });
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
        if (resp && resp.ok && resp.type !== 'opaque') {
          var copia = resp.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copia); });
        }
        return resp;
      })
      .catch(function () {
        return caches.match(req).then(function (guardado) {
          if (guardado) return guardado;
          // Sin nada guardado para esa pantalla: se ofrece el patio, que es la
          // raíz de la app y lo que el balancero necesita.
          return caches.match('/app/patio').then(function (patio) {
            if (patio) return patio;
            return new Response(
              '<!doctype html><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<body style="margin:0;background:#f8f7f4;font:400 16px/1.5 \'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#1b1a17">' +
                '<div style="padding:28px 20px;max-width:480px;margin:0 auto">' +
                '<div style="font:500 9px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#8f5514">SIN SEÑAL</div>' +
                '<h1 style="font:600 25px/1.2 \'Helvetica Neue\',Helvetica,Arial,sans-serif;margin:8px 0 10px">Esta pantalla todavía no está guardada</h1>' +
                '<p style="color:#5f5c55;margin:0 0 18px">Abrila una vez con internet y después queda disponible sin señal.</p>' +
                '<a href="/app/patio" style="display:flex;align-items:center;justify-content:center;min-height:54px;background:#1b1a17;color:#f8f7f4;border-radius:15px;font-weight:600;text-decoration:none">Ir al patio</a>' +
                '</div></body>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
            );
          });
        });
      })
  );
});
