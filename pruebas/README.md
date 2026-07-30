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
  TODO BIEN — 383 comprobaciones
```

Si algo se rompió, lista exactamente qué comprobación falló y en qué archivo.

Para correr una sola:

```bash
node pruebas/probar.js
```

### Para las que usan un navegador

Cuatro de las siete abren un navegador real (para probar el modo sin señal, el
compartir del PDF y las medidas de los botones). Necesitan Playwright, que **no**
está en `package.json` a propósito: en el servidor no hace falta y no queremos
sumarle peso al deploy.

```bash
npm install --no-save playwright
npx playwright install chromium
```

Sin eso, esas cuatro se saltean y las otras tres corren igual.

---

## Qué prueba cada una

| Archivo | Qué comprueba |
| --- | --- |
| `probar.js` | El recorrido completo: la web sigue funcionando, y en la app el ingreso, el nombre del día, los tres pasos con todas sus validaciones, la numeración, el ticket, el PDF, los pedidos de anulación y los permisos. |
| `probar-apagado.js` | Con `APP_MOVIL` apagado, `/app` da 404 en todas sus direcciones, la web carga tickets igual que siempre y no se crea ninguna colección nueva. |
| `probar-sin-senal.js` | En modo avión: cargar una pesada, verla con el chip `SIN SUBIR`, imprimir, y que al volver la señal se suba sola sin duplicarse. |
| `probar-cadena.js` | El ticket **completo** sin señal: camión, tara final, imprimir y regulada, y que al volver la conexión llegue un solo registro con los números bien. |
| `probar-compartir.js` | El botón de compartir entrega un PDF al sistema, en el mismo toque del dedo (que es lo que exige el Safari del iPhone), y descarga el archivo cuando el teléfono no sabe compartir. |
| `probar-pdf.js` | El PDF: que sea válido byte a byte, que mida 19 × 4,5 cm exactos, que los acentos salgan bien, que los textos largos se recorten y que **no aparezca el código de la balanza**. |
| `probar-arreglos.js` | La navegación: el alto real de los botones, que el menú abra, y el cambio de campo en la regulada rehaciendo granos y lotes hasta guardar. |

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
