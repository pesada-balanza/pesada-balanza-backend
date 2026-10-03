'use strict';
/* =====================================================================
 * QUÉ VERSIÓN DE WHATSAPP WEB USAN LOS DOS PROGRAMAS
 * =====================================================================
 * WhatsApp actualiza su web sin avisar y whatsapp-web.js queda atrás. Cuando
 * eso pasa, la conexión se queda clavada en "cargando 99%" —se autentica, pero
 * el "listo" no llega nunca—, o el envío a grupos falla con errores que vienen
 * de adentro de WhatsApp ("Data passed to getter...", "r").
 *
 * El remedio es no dejar que cargue la última, sino fijar una conocida. Las
 * versiones están publicadas como HTML en el repo wa-version.
 *
 * ⚠️ ESTE ARCHIVO ES EL ÚNICO LUGAR DONDE SE DEFINE.
 * Antes la versión estaba escrita adentro de `proyeccion/enviar.js` y
 * `worker.js` NO FIJABA NINGUNA: cargaba la que WhatsApp sirviera en ese
 * momento. El 18/09 se arregló el enviador y al worker nunca se le pasó, así
 * que el 02/10 —cuando WhatsApp actualizó— el enviador siguió andando y el
 * reporte de balanza se quedó clavado en 99% sin decir por qué. Teniéndola
 * acá, arreglar uno arregla los dos.
 *
 * ⚠️ NO cambiarla a la ligera. La de abajo está PROBADA (2026-09-18): con ella
 * el envío al grupo funciona y la conexión se mantiene estable.
 *
 * Las que NO sirven, para no repetir la prueba:
 *   2.3000.1047806989-alpha  → conecta pero se cae todo el tiempo (watchdog
 *                              cada pocos minutos, estado "OPENING")
 *   auto (sin fijar)         → se queda en 99%, y el envío a grupos falla con
 *                              "Data passed to getter must include an id
 *                              property"
 *
 * Si algún día vuelve a romperse, probar SIN tocar este archivo, con la
 * variable de entorno, y recién cuando una ande escribirla acá abajo:
 *
 *   set WEB_VERSION=2.3000.1049214511-alpha
 *   node diagnostico.js
 *
 * ── Pendiente al 03/10/2026 ──────────────────────────────────────────
 * La versión de abajo es del 18/09 y WhatsApp hoy sirve 2.3000.1049214511:
 * dos semanas y una docena de versiones de atraso. Con ese desfasaje el
 * envío a un NÚMERO funciona (el worker de balanza manda su Excel sin
 * problemas) pero el envío de un archivo a un GRUPO falla con "upload
 * failed: media entry was not created".
 *
 * No se cambia todavía porque el worker de balanza anda bien con esta y
 * tocarla a ciegas lo rompería. Hay que probar primero, de más nueva a más
 * vieja, hasta que el PDF llegue al grupo:
 *   2.3000.1049214511-alpha   (la que WhatsApp sirve hoy)
 *   2.3000.1049155021-alpha
 *   2.3000.1049007170-alpha
 *   2.3000.1048960956-alpha
 * Para ver el listado al día:
 *   https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json
 * ─────────────────────────────────────────────────────────────────────
 *
 * Listado completo: https://github.com/wppconnect-team/wa-version/tree/main/html
 * ===================================================================== */

const WEB_VERSION = process.env.WEB_VERSION || '2.3000.1047412487-alpha';

/* `auto` deja que cargue la última. Sirve para probar si una versión nueva de
   WhatsApp ya viene arreglada, pero no conviene dejarlo puesto: es volver a
   depender de que WhatsApp no cambie nada. */
const webVersionCache = WEB_VERSION === 'auto' ? undefined : {
  type: 'remote',
  remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WEB_VERSION}.html`,
};

module.exports = { WEB_VERSION, webVersionCache };
