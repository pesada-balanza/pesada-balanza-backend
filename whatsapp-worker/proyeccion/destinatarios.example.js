/* =====================================================================
 * EJEMPLO — A QUIÉNES SE LES MANDA EL FLUJO DE FONDOS
 * =====================================================================
 * Copiar este archivo como `destinatarios.js` y poner los datos de verdad.
 *
 * El `destinatarios.js` real NO se versiona y está en el .gitignore: este
 * repositorio es PÚBLICO, y adentro de ese archivo van teléfonos de personas
 * y el ID del grupo de WhatsApp. En la PC donde corre el enviador tiene que
 * existir igual, con los datos reales, o el programa no sabe a quién mandarle.
 *
 * Es el ÚNICO archivo que hay que tocar para agregar, quitar o cambiar
 * destinatarios. Después de editarlo, reiniciá el enviador.
 *
 * ▸ FORMATO DE LOS NÚMEROS (Argentina)
 *   54 + característica (sin el 0) + número (sin el 15).
 *   Ej.: (03482) 15-000111  ->  '543482000111'
 *   Si te olvidás el 54, el enviador lo agrega solo. El 9 de los celulares
 *   argentinos también lo resuelve solo, no hace falta ponerlo.
 * ===================================================================== */

module.exports = {
  // Reciben las DOS proyecciones (AMH y Agroindustrial), 08:30 y 17:30.
  numeros: [
    '3482000111',
    '3482000222',
  ],

  // GRUPO destino. Mientras tenga algo, se ignora la lista de números de
  // arriba y se manda un solo mensaje por empresa al grupo.
  //
  // Se puede poner el NOMBRE del grupo o su ID exacto, que termina en @g.us.
  // Con el nombre, el enviador lo busca al conectar; si no lo encuentra o hay
  // dos iguales, avisa en el arranque.
  // Para ver los ID disponibles:  node enviar.js --grupos
  //
  // Para volver a mandar a los números de arriba:  grupo: null
  //
  // Ojo: en un grupo, cualquiera que sea agregado después empieza a recibir
  // el flujo de fondos sin que nadie lo decida explícitamente. Con números
  // sueltos eso no pasa.
  //
  // Si el envío al grupo falla con "Data passed to getter must include an id
  // property", no es este ID: es que whatsapp-web.js quedó desfasado de la
  // versión actual de WhatsApp Web. Se arregla fijando la versión del cliente
  // web — ver WEB_VERSION en enviar.js.
  grupo: '120363000000000000@g.us',

  // A quién avisarle si la proyección NO se pudo generar. Tiene que llegarle
  // a alguien que pueda hacer algo al respecto: el silencio no es un
  // resultado válido para un reporte que se espera dos veces por día.
  avisos: [
    '3482000111',
  ],
};
