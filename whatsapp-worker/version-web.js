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
 * ⚠️ NO cambiarla a la ligera. La de abajo está PROBADA (2026-10-03): con ella
 * el PDF llega al GRUPO y la conexión se mantiene estable.
 *
 * Las que NO sirven, para no repetir la prueba:
 *   2.3000.1047412487-alpha  → la anterior, probada el 18/09. Andaba, pero al
 *                              03/10 ya tenía dos semanas de atraso: el envío
 *                              a un número seguía funcionando y el de un
 *                              ARCHIVO A UN GRUPO empezó a fallar con "upload
 *                              failed: media entry was not created". Ese es el
 *                              síntoma de que la fijada quedó vieja.
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
 * ── Cómo saber que ESTA quedó vieja ──────────────────────────────────
 * No avisa de golpe: se degrada por partes, y de menos a más grave.
 *   1º  El archivo a un GRUPO falla con "upload failed: media entry was
 *       not created", mientras el texto al grupo y todo lo que va a un
 *       número siguen andando. Fue el síntoma del 03/10.
 *   2º  Empieza a fallar también a los números.
 *   3º  No conecta más: se clava en "cargando 99%".
 * O sea que el primer reporte que no llega al grupo ya es la señal: hay
 * que subir la versión antes de que se caiga el resto.
 *
 * Para ver cuál sirve WhatsApp hoy y qué versiones hay:
 *   https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json
 * El campo "currentVersion" es la que está sirviendo en este momento, y
 * suele ser la que conviene fijar.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Listado completo: https://github.com/wppconnect-team/wa-version/tree/main/html
 * ===================================================================== */

const WEB_VERSION = process.env.WEB_VERSION || '2.3000.1049214511-alpha';

/* `auto` deja que cargue la última. Sirve para probar si una versión nueva de
   WhatsApp ya viene arreglada, pero no conviene dejarlo puesto: es volver a
   depender de que WhatsApp no cambie nada. */
const webVersionCache = WEB_VERSION === 'auto' ? undefined : {
  type: 'remote',
  remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WEB_VERSION}.html`,
};

module.exports = { WEB_VERSION, webVersionCache };
