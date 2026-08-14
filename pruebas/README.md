# Pruebas de la app móvil

Programas que **ejecutan la app y comprueban que funcione**. No son documentación:
cada uno levanta el servidor de verdad, hace lo que haría un balancero, y verifica
el resultado. Si algo se rompió, dicen qué y por qué.

**Nada de esto corre en producción.** Son archivos aparte que solo se ejecutan si
alguien los llama a mano. `npm start` no los mira.

---

## Cómo se corren

```bash
node pruebas/correr.js
```

Tarda un par de minutos y termina con un resumen. Si todo está bien:

```
  TODO BIEN — 839 comprobaciones
```

Si algo se rompió, lista exactamente qué comprobación falló y en qué archivo.

Para correr una sola:

```bash
node pruebas/probar.js
```

### Para las que usan un navegador

Seis de las trece abren un navegador real (para probar el modo sin señal, el
compartir del PDF, las medidas de los botones y qué pasa al actualizar la app).
Necesitan Playwright, que **no** está en `package.json` a propósito: en el
servidor no hace falta y no queremos sumarle peso al deploy.

```bash
npm install --no-save playwright
npx playwright install chromium
```

Sin eso, esas seis se saltean y las otras siete corren igual.

Si el navegador ya está instalado en otra carpeta, `buscar-chromium.js` lo
encuentra solo. También se puede indicar a mano:

```bash
CHROMIUM_PATH=/ruta/al/chrome node pruebas/correr.js
```

---

## Qué prueba cada una

| Archivo | Qué comprueba |
| --- | --- |
| `probar.js` | El recorrido completo: la web sigue funcionando, y en la app el ingreso, el nombre del día, los tres pasos con todas sus validaciones, la numeración, el ticket, el PDF, los pedidos de anulación, los permisos, **de quién queda cada ticket** (el campo no le cambia el dueño) y el **CTG** (plazo, formato, una sola vez, que no consuma modificaciones y que una balanza no cargue el de otra, y que un ticket con la **fecha de regulada adelantada** no aparezca en el aviso y avise que el dato está mal cargado). |
| `probar-apagado.js` | Con `APP_MOVIL` apagado, `/app` da 404 en todas sus direcciones, la web carga tickets igual que siempre y no se crea ninguna colección nueva. |
| `probar-sin-senal.js` | En modo avión: cargar una pesada, verla con el chip `SIN SUBIR`, imprimir, y que al volver la señal se suba sola sin duplicarse. |
| `probar-cadena.js` | El ticket **completo** sin señal: camión, tara final, imprimir y regulada, y que al volver la conexión llegue un solo registro con los números bien. |
| `probar-compartir.js` | El botón de compartir entrega un PDF al sistema, en el mismo toque del dedo (que es lo que exige el Safari del iPhone), y descarga el archivo cuando el teléfono no sabe compartir. |
| `probar-pdf.js` | El PDF: que sea válido byte a byte, que mida 19 × 4,5 cm exactos, que los acentos salgan bien, que los textos largos se recorten y que **no aparezca el código de la balanza**. |
| `probar-arreglos.js` | La navegación: el alto real de los botones, que el botón **Salir** avise antes de salir y no salga si se dice que no, y el cambio de campo en la regulada rehaciendo granos y lotes hasta guardar. |
| `probar-corregir.js` | **Corregir los datos de un ticket**: que el balancero no pueda por ningún camino (ni la pantalla ni la API) y que GENERAL sí; el recorrido completo pide → corrige → el pedido queda `CORREGIDO` solo; que la tara recalcule los netos y los brutos no se toquen; la auditoría; y las reglas de la web (máximo 2, hasta 1 día, nada anulado, y que no cambiar nada no gaste una corrección). |
| `probar-excel.js` | **Exportar a Excel desde la app**: que el botón esté abajo de "Buscar un ticket" y siga al día que se mira, y que el archivo sea el mismo de la web. Baja el `.xlsx` de verdad y lo abre: las hojas (Registros, IMPRIMIR, Cargas SOCIO, una por campo), las columnas, el neto en negativo de los anulados y el total. Sobre todo los permisos, leídos de las filas del archivo y no del HTML: cada código saca solo su balanza y GENERAL todas. Y el rango de fechas, incluido al revés, inventado y vacío. Comprueba además que el `/export` de la web siga dando lo mismo después del refactor. |
| `probar-buscar.js` | Ver los registros de otros días y encontrar un camión: las flechas de día y el salto a una fecha, y el buscador por patente (guardada con espacios de más), chofer con y sin acentos, transporte y número de ticket, con los cinco rangos. Comprueba que **cada código vea solo su balanza** —también al abrir un ticket por su dirección, que era el agujero— que el `12341` vea todas, y el tope de 100 resultados. Y **imprimir los tickets del día** que se está mirando: que salgan los de ese día y no los de otro, que los anulados queden afuera, que no se pueda imprimir el día de otra balanza, y que un código de ver registros pueda leer los tickets para la hoja (que era otro resto del mismo agujero de permisos). |
| `probar-sin-senal-real.js` | Sin señal **con el service worker de verdad**, que es lo que corre en el teléfono: abrir la app desde el ícono, seguir un ticket que ya está en el servidor, ver el ticket, cargar de cero, pedir corrección y anulación a GENERAL (con señal abre la pantalla; sin señal lo dice, no muestra el patio), el aviso de pesadas sin subir en todas las pantallas y con cualquier código, **cargar el CTG sin señal** (queda en la cola con la fecha en que se tipeó y sube al volver internet), y que al cambiar de código no queden pantallas de la sesión anterior. |
| `probar-reporte-email.js` | El reporte de las 19 hs: abre el Excel generado y lee las celdas de la hoja **Acumulado campaña** (que sume por lote y por grano, que no cuente anulados ni camiones sin regular, y el corte del 1 de septiembre). Y la hoja **Todos los registros**: que traiga todo desde el 1-4-2026 con las mismas columnas que la del día, que deje afuera lo anterior y que incluya los anulados en negativo. Rompe el acumulado a propósito y comprueba que **el reporte de todos los días se mande igual** y que la otra hoja extra siga estando. Y los **avisos por evento**: que con el interruptor apagado no salga ninguno (tara final, regulada, pedidos), que el de las 19 hs siga saliendo igual, y que al prenderlo el de un pedido traiga el motivo y quién lo pidió. Nunca manda un mail de verdad. |
| `probar-liviana.js` | Que todo viaje comprimido y que ninguna pantalla se pase de peso, que la web siga sin comprimir (o sea, sin tocar), que **actualizar la app no borre las pesadas pendientes** (borra a propósito todo lo guardado y comprueba que la cola siga entera y se suba al volver internet), y que una vez subido el teléfono se limpie: no quedan copias duplicadas ni tickets de hace semanas. |

`capturas.js` no comprueba nada: saca fotos de las 19 pantallas a 390 px para
poder compararlas con el diseño. Quedan en `pruebas/capturas/`.

---

## El doble de MongoDB

`doble-mongo.js` es una MongoDB de mentira, en memoria. Implementa las
operaciones que usan `app.js` y `app-movil.js`.

Está por dos razones:

1. **Seguridad**: las pruebas nunca tocan la base real. Los datos son inventados
   (camiones "AC 884 TF", balanceros "Juan Sosa").
2. **Rapidez**: arranca en milisegundos, así se puede correr todo a cada rato.

Las pruebas además reemplazan el envío de emails, así que **nunca se manda un
mail de verdad** aunque estén configuradas las variables.

---

## Si una prueba falla

El mensaje dice qué se esperaba y qué pasó. Dos casos:

- **Rompiste algo.** Lo más común y para lo que están: arreglás y volvés a correr.
- **La prueba quedó vieja.** Cambió algo a propósito y la comprobación ya no
  corresponde. Ahí hay que actualizar la prueba, no el código. Pasa, por ejemplo,
  al subir la versión del service worker o al cambiar un texto de pantalla.

En los dos casos, correr `node pruebas/correr.js` antes de subir cambios evita
mandar a producción algo roto.
