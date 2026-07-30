'use strict';
/**
 * Encuentra el Chromium que va a usar Playwright.
 *
 * Playwright normalmente lo baja solo con `npx playwright install chromium` y lo
 * deja en ~/.cache/ms-playwright. Pero en algunas máquinas (servidores, o el
 * entorno donde se armó esta app) ya viene instalado en otra carpeta, y ahí
 * Playwright avisa "falta bajar los navegadores" aunque el navegador esté.
 *
 * Esto lo busca en los lugares habituales y devuelve la ruta, o null si no hay
 * ninguno (entonces Playwright usa el suyo, que es lo normal).
 *
 * Se puede forzar con la variable CHROMIUM_PATH.
 */
const fs = require('fs');
const path = require('path');

const CARPETAS = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  '/opt/pw-browsers',
  path.join(process.env.HOME || '', '.cache', 'ms-playwright'),
].filter(Boolean);

// Dentro de cada carpeta hay subcarpetas tipo "chromium-1194".
const BINARIOS = [
  path.join('chrome-linux', 'chrome'),
  path.join('chrome-linux', 'headless_shell'),
  path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  path.join('chrome-win', 'chrome.exe'),
];

function buscarChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  for (const carpeta of CARPETAS) {
    let hijos;
    try {
      hijos = fs.readdirSync(carpeta);
    } catch (e) {
      continue;
    }
    // Primero el navegador completo, después el "headless shell" (más liviano
    // pero no sirve para todo).
    const candidatos = hijos
      .filter((h) => h.indexOf('chromium') === 0)
      .sort((a, b) => (a.indexOf('headless') === -1 ? -1 : 1));

    for (const hijo of candidatos) {
      for (const bin of BINARIOS) {
        const ruta = path.join(carpeta, hijo, bin);
        try {
          fs.accessSync(ruta, fs.constants.X_OK);
          return ruta;
        } catch (e) {
          /* seguir buscando */
        }
      }
    }
  }
  return null;
}

module.exports = { buscarChromium };
