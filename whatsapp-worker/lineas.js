/* =====================================================================
 * LÍNEAS DE WHATSAPP POR CÓDIGO DE OBSERVACIÓN
 * =====================================================================
 *
 * Este archivo define a QUÉ NÚMEROS de WhatsApp se le envía el reporte
 * diario de cada usuario observador.  Es el ÚNICO archivo que necesitás
 * tocar para agregar, quitar o cambiar destinatarios.
 *
 * ▸ CÓMO EDITARLO
 *   - Cada clave es un código de observación (los mismos que usás para
 *     entrar al sistema): 12341 es el GENERAL (ve todos los campos) y el
 *     resto ve sólo los campos de su usuario de balanza.
 *   - El valor es la lista de números que reciben ese reporte. Podés
 *     agregar o quitar números, o dejar la lista vacía ([]) para que ese
 *     código NO reciba nada.
 *   - Después de editar, guardá el archivo y reiniciá el worker.
 *
 * ▸ FORMATO DE LOS NÚMEROS (Argentina)
 *   - Escribilos con código de país: 54 + característica (sin el 0) +
 *     número (sin el 15).  Ej.: (03482) 15-640795  ->  '543482640795'
 *   - El "+" y los espacios son opcionales: el sistema los ignora.
 *   - Si te olvidás el 54 inicial, el worker intenta agregarlo solo,
 *     pero conviene ponerlo para evitar errores.
 *   - Los celulares de Argentina en WhatsApp llevan un 9 después del 54
 *     (54 9 ...). No hace falta que lo pongas: antes de enviar, el worker
 *     le pregunta a WhatsApp cuál es el número real y lo resuelve solo.
 *
 * ▸ IMPORTANTE
 *   - Cada número debe tener WhatsApp activo; si no, ese envío se saltea
 *     y queda anotado en el log del worker.
 * ===================================================================== */

module.exports = {
  // GENERAL — recibe el reporte con TODOS los campos
  '12341': [
    '543482640795',
    '543482444432',
    '543482308290',   // (venía sin el 54, se lo agregué)
  ],

  // Charata / El 44 / El Mataco / La Porfía / Panuncio / Tierra Negra (ingreso 5679)
  '1235': [
    '543482318493',
    '543841437666',
    '543482639085',
  ],

  // La Pradera (ingreso 5680)
  '1236': [
    '543482532094',
    '543482318492',
  ],

  // El 90 / El C1 Ciriaci / El C1 GyM / Grifa / Hidalgo (ingreso 5681)
  '1237': [
    '543482304051',
    '543482629969',
  ],

  // Aguero / Ferulo / Martinoli / Poncho Perdido / Wichí (ingreso 5682)
  '1238': [
    '543482639085',
    '543482533112',
  ],

  // Doble Cero / El Búfalo / La Juanita / Martina (ingreso 5683)
  '1239': [
    '543482650071',
    '543482629969',
  ],

  // Amamá / Avelleira / Cejolao / Quimilí / etc. (ingreso 5684)
  '1240': [
    '543482629969',
    '543482318486',
  ],

  // Don Paco / Don Pascual / Gioda (ingreso 5685)
  '1241': [
    '543482532094',   // (venía sin el 54, se lo agregué)
    '543482308290',
  ],
};
