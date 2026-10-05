'use strict';
/* =====================================================================
 * DESTRABAR LA SESIÓN CUANDO QUEDÓ UN CHROME COLGADO
 * =====================================================================
 * Síntoma: el programa arranca y repite para siempre, cada 15 segundos:
 *
 *   [WhatsApp] Error al inicializar: The browser is already running for
 *   C:\whatsapp-worker\...\.wwebjs_auth\session. Use a different
 *   `userDataDir` or stop the running browser first.
 *
 * Pasa al cerrar la ventana y volver a abrirla: matar la terminal mata el
 * `node`, pero el Chrome que Puppeteer había abierto puede sobrevivir, y
 * Chrome no deja que dos procesos compartan la misma carpeta de sesión.
 *
 * El candado del puerto (`tomarPuerto`) no cubre esto: ahí el `node` viejo ya
 * murió, el puerto está libre, y lo que sigue agarrado es el navegador.
 *
 * ▸ POR QUÉ ES SEGURO BORRAR EL CANDADO
 *   En Windows, Puppeteer decide que "ya está corriendo" ÚNICAMENTE porque
 *   existe el archivo `lockfile` adentro de la carpeta de sesión (lo mira con
 *   existsSync; ver BrowserLauncher.js). Si el Chrome que lo creó murió, ese
 *   archivo es basura que nadie limpia.
 *
 *   Y Windows NO deja borrar un archivo que un proceso tiene abierto. O sea
 *   que el borrado se protege solo: si hay un Chrome vivo de verdad, falla y
 *   no rompemos nada; si está huérfano, sale y el siguiente intento conecta.
 *
 *   En Linux y Mac el equivalente es `SingletonLock`, que es un enlace. Ahí no
 *   hay esa protección, pero estos programas corren en Windows: se incluye por
 *   las pruebas y por si algún día se mudan a un servidor.
 * ===================================================================== */

const fs = require('fs');
const path = require('path');

/** Candados que deja Chrome. El primero es el que mira Puppeteer en Windows. */
const CANDADOS = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];

/** ¿El error es el de "ya hay un navegador usando esta carpeta"? */
function esSesionTrabada(mensaje) {
  return /The browser is already running for/i.test(String(mensaje || ''));
}

/**
 * Intenta soltar el candado que dejó un Chrome que ya no existe.
 *
 * La carpeta sale del propio mensaje de error, que la trae escrita: es más
 * confiable que recalcularla acá y que se desincronice de lo que configuró
 * cada programa.
 *
 * @param {string} mensaje  el error tal cual vino de initialize()
 * @returns {boolean} true si soltó el candado y vale la pena reintentar ya
 */
function destrabarSesion(mensaje) {
  const m = /already running for (.+?)\.\s*Use a different/i.exec(String(mensaje || ''));
  if (!m) return false;
  const carpeta = m[1].trim();

  let soltados = 0;
  let ocupados = 0;
  for (const nombre of CANDADOS) {
    const archivo = path.join(carpeta, nombre);
    // lstat, no stat: en Linux el candado es un enlace que apunta a la nada.
    try { fs.lstatSync(archivo); } catch (_) { continue; }   // no está, nada que hacer
    try {
      fs.rmSync(archivo, { force: true });
      soltados++;
      console.log(`[Destrabar] Saqué el candado huérfano: ${nombre}`);
    } catch (err) {
      ocupados++;
      console.warn(`[Destrabar] ${nombre} está en uso (${err.code || err.message}).`);
    }
  }

  if (ocupados > 0) {
    // El archivo no se deja borrar ⇒ hay un Chrome VIVO con esa carpeta. Esto
    // no se arregla solo y conviene decir qué hacer, en vez de seguir
    // repitiendo el mismo error cada 15 segundos sin explicar nada.
    console.error('[Destrabar] Hay un Chrome todavía abierto con esta sesión.');
    console.error('[Destrabar] Cerralo y reintenta solo. Para forzarlo, en PowerShell:');
    console.error("[Destrabar]   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*whatsapp-worker*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }");
    return false;
  }

  if (!soltados) return false;
  console.log('[Destrabar] Sesión liberada, reintentando enseguida.');
  return true;
}

module.exports = { esSesionTrabada, destrabarSesion };
