# Combustible — registro de decisiones

Documento de trabajo. Fija lo que ya está decidido y lo que sigue abierto, para que
nadie tenga que volver a discutirlo ni adivinarlo.

**Fuentes:**

1. Artefacto *"Combustibles — arranque del proyecto"* (el plan, con marcas HECHO /
   PROPUESTA / PREGUNTA).
2. `registro_despacho_combustible.docx` — transcripción de notas manuscritas del dueño.
   **Es la fuente de verdad del negocio**: donde contradice al plan, gana el manuscrito,
   salvo lo indicado en la sección 1.
3. `calculo_de_volumen_tanque.xlsx` — medidas y tablas de aforo de los tanques, más la
   hoja `PLANILLA MAESTRA` agregada como lista única de depósitos.

> Este documento vive por ahora en el repositorio de balanza, en una rama de trabajo.
> Cuando exista el repositorio propio de combustible hay que moverlo ahí.

---

## 1. Saldo de stock: el sistema NO bloquea (decidido)

Había una contradicción de fondo entre las dos fuentes:

- El plan: *"El teléfono nunca decide si hay saldo. No bloquea un despacho por falta de stock."*
- El manuscrito: *"El sistema debe impedir el despacho si no hay litros disponibles.
  En caso de que se trabaje sin señal, que pueda despacharse hasta mil litros en el día."*

**Resolución: gana el criterio del plan.** El sistema **no bloquea nunca** un despacho por
falta de saldo. **Pero el saldo negativo se registra y se muestra.**

Consecuencias de diseño, que no hay que negociar de nuevo:

1. **El saldo del tanque no se guarda: se calcula** sumando los movimientos. No existe un
   campo `litros_actuales` que alguien actualiza.
2. **El teléfono nunca decide si hay saldo.** No hay endpoint de saldo en vivo, no hay
   validación bloqueante, ni con señal ni sin señal.
3. **El saldo puede quedar negativo, y eso es información, no un error.** Si un despacho
   sube antes que la recepción que lo abastece, el tanque da negativo. La pantalla del
   saldo tiene que mostrar *"calculado con lo subido hasta tal hora"* y, aparte, cuántos
   movimientos hay esperando en la cola.
4. **El saldo negativo se marca visualmente** en el listado y en el reporte diario: es la
   señal de que falta cargar una recepción, o de que hay un error de tipeo en los litros.

### Consecuencia sobre el tope de 1.000 litros — PENDIENTE DE CONFIRMAR

El tope de "hasta mil litros por día sin señal" del manuscrito existía **como válvula de
seguridad de un sistema que iba a bloquear**. Si el sistema no bloquea nunca, ese tope
pierde su motivo original.

**Recomendación:** eliminarlo como control de stock, y conservar la idea como
**advertencia anti-error de tipeo**: si un despacho individual supera los 1.000 litros,
la app pide confirmar ("¿son 1.500 litros?"), pero **no impide** guardarlo. Es el mismo
criterio que se usa con el horómetro que viene más bajo que el anterior: avisar, no trabar.

Falta el OK del dueño sobre esto.

---

## 2. Decisiones del manuscrito que pisan al plan

| Tema | El plan proponía | Decidido |
|---|---|---|
| Bloqueo por saldo | nunca bloquea | **nunca bloquea** (ver sección 1); saldo negativo se registra |
| Combustible por tanque | preguntaba | **siempre uno solo por tanque** (gasoil) |
| Horómetro / kilometraje | según el equipo | **siempre obligatorio, en todo despacho** |
| Imputar a labor | opcional | **siempre obligatorio** |
| Contratistas | ¿se refactura? | **se despacha, no se factura** (dato informativo) |
| Ticket impreso | preguntaba | **no se imprime** |
| Plazo de modificación | 1 a 5 días (balanza) | **3 días desde el registro del ticket** |
| Eliminar registros | anular con motivo | **no se elimina nada**, ni despacho ni ingreso |
| Quién carga el ingreso | GENERAL | **GENERAL, y GENERAL no puede despachar** |
| Códigos de acceso | renumerar | **nombre del campo + `26`** |
| QUIMILI | — | **se renombra `LA PURIFICADA`** |
| PACO-PASCUAL | — | **se elimina** |
| Cisternas móviles | "falta listar" | **existen y se trasladan entre campos** → `TRASLADO` es central |
| Contadores | preguntaba | **los fijos tienen contador mecánico**, no todos funcionan bien |
| Medición con varilla | preguntaba | **sin frecuencia definida** — se busca lo recomendado |

### Permisos: GENERAL no despacha

Diferencia importante con la balanza, donde GENERAL puede todo. Acá:

- **GENERAL** registra los ingresos (recepciones) con los datos del remito del proveedor,
  resuelve pedidos de modificación, y **no puede despachar**.
- **El código de carga de cada depósito** despacha, y no puede registrar ingresos.
- **El código de ver registros** no carga nada.

### Modificaciones

- Ni el remito de despacho ni el de ingreso se pueden **eliminar**.
- Cualquier usuario puede **solicitar** una modificación; GENERAL puede hacerla directamente.
- **Plazo: 3 días** desde el registro del ticket.

---

## 3. Los depósitos

Ver la hoja `PLANILLA MAESTRA` del Excel. Resumen:

| Campo | Tanque | Capacidad (L) | Estado del dato |
|---|---|---|---|
| LA UNION | LA UNION | 11.366 | tabla de aforo en **cm** (el resto en metros) |
| LA PURIFICADA | Tanque grande | 22.455 | OK |
| LA PURIFICADA | Tanque chico | 5.420 | OK |
| EL BUFALO | EL BUFALO | 31.111 | error de tipeo en el aforo a 0,15 m |
| EL C1 | Cisterna 1 | 19.682 | definir si es fija o móvil |
| EL C1 | Cisterna 2 | 15.237 | error de tipeo en el aforo a 0,05 m |
| EL WICHI | WICHI | 29.845 | OK |
| LA PRADERA | Tanque 20 mil | 20.358 | OK |
| LA PRADERA | Tanque 60 mil | ~60.000 | **sin medir** — falta longitud y diámetro |

**Total instalado: ~215.474 L** (coincide con la hoja `total` del Excel original).

Confirmado por el dueño: **LA PRADERA tiene 2 depósitos** (20 mil y 60 mil) y **EL C1
tiene 2**. Por lo tanto la hoja `EL C1 (3) Tanquesito` es una **copia** de `EL C1 (2)`
—mismas medidas, misma tabla— y no un tercer tanque.

### Verificación del cálculo de volumen

Se recalcularon los 9 tanques y se compararon **todos** los puntos de las 9 tablas de aforo
contra la fórmula exacta del volumen parcial de un cilindro horizontal:

```
V(h) = L · [ r² · arccos((r−h)/r) − (r−h) · √(2rh − h²) ]
```

Resultados:

- **Las 9 capacidades están bien calculadas.** La fórmula `π · r² · L · 1000` está bien
  aplicada en todas las hojas.
- **Las tablas de aforo están bien, con 2 errores de tipeo** sobre casi 400 puntos:
  - `EL BUFALO` a 0,15 m dice **589 L**, corresponden **873 L**.
  - `EL C1 (2)` a 0,05 m dice **50 L**, corresponden **105 L**.
- **Problema de unidades:** el encabezado de todas las hojas dice "Cm de varilla", pero
  sólo `LA UNION` está en centímetros (0 a 174). Las otras 8 están en **metros**. Es un
  error de rótulo, no de cálculo, pero hay que unificar a centímetros antes de cargarlo.
- **Lo que la fórmula no contempla:** los cabezales abombados suman entre 1% y 3% que no
  está contado; si el tanque no está nivelado la varilla lee distinto; y el diámetro
  cargado parece ser el exterior, no el interior. Para control de stock es aceptable, pero
  explica por qué la varilla y el cálculo nunca coinciden exactamente.
- **Precisión de la varilla:** marcada cada 5 cm. En el punto más ancho del tanque, 1 cm de
  error vale 83 L en LA UNION, 152 L en EL WICHI y **174 L en EL BUFALO** — o sea que un
  salto de 5 cm en EL BUFALO son casi 870 litros. La varilla sirve para **controlar**, no
  para medir un despacho.

### Los campos no coinciden con los de la balanza

- Códigos que hoy tiene la balanza: GENERAL, EL MATACO, LA PRADERA, EL C1, EL WICHI,
  LA JUANITA, QUIMILI, PACO-PASCUAL.
- Campos con tanque en el Excel: LA UNION, LA PURIFICADA, EL BUFALO, EL C1, EL WICHI,
  LA PRADERA.

Consecuencias:

- **LA UNION** y **EL BUFALO** necesitan código nuevo: no existen en balanza.
- **EL MATACO** y **LA JUANITA** tienen código pero no tienen tanque listado.
  ¿No tienen depósito, o falta cargarlo?
- QUIMILI pasa a **LA PURIFICADA**; PACO-PASCUAL se elimina.

### Códigos propuestos (a confirmar)

Según el criterio "nombre del campo + 26": `UNION26`, `PURIFICADA26`, `BUFALO26`, `C126`,
`WICHI26`, `PRADERA26`, más `MATACO26` y `JUANITA26` si esos campos tienen depósito, y
`GENERAL26`. Falta definir el segundo código de cada campo, el de sólo ver registros.

---

## 4. Infraestructura: mismas cuentas, recursos separados

Decidido. La guía paso a paso está aparte; acá queda el criterio.

| Servicio | Qué se hace | Por qué no afecta a balanza |
|---|---|---|
| **GitHub** | repositorio **nuevo** (`pesada-combustible-backend`), privado, mismo dueño, arrancando en `main` | repositorios independientes, historias independientes |
| **MongoDB** | **mismo clúster**, base **nueva** `combustible`, y **usuario acotado** con `readWrite` sólo sobre esa base | el usuario nuevo no tiene permiso para leer la base de balanza: ni un bug puede cruzar |
| **Render** | **servicio nuevo**, variables propias, `SESSION_SECRET` nuevo | despliegues, logs, variables y URL separados |
| **Gmail** | misma casilla remitente, **contraseña de aplicación nueva** | se puede anular una sin afectar la otra |
| **WhatsApp** | **opción (b)**: un solo worker, mismo número, leyendo **las dos bases** | ver abajo |

### Por qué repo separado y no una rama del de balanza

El repositorio de balanza **es** la producción de balanza: `app.js`, `notificaciones.js` y
`whatsapp-worker/` viven ahí. Una rama aísla mientras nadie la integre, pero no da la
garantía fuerte. Con repositorio separado, un error en combustible no puede llegar a los
tickets ni a los avisos.

Además, **arrancar directo en `main`**: en balanza toda la app móvil vive en una rama que
nunca se integró, y funciona sólo porque el servicio apunta a esa rama. Si alguien mueve el
servicio a `main`, la app desaparece. No repetir eso.

### Riesgo real detectado: el plan gratuito de Render

Es el **único enganche** entre los dos servicios. El plan gratuito da una cantidad limitada
de horas por mes **por cuenta**, compartidas entre todos los servicios gratuitos. Si
balanza está en plan gratuito y se agrega un segundo servicio gratuito, los dos comen del
mismo pozo. Sumado a que un servicio gratuito se duerme y tarda hasta un minuto en
despertar —inaceptable para un operario en el depósito—, la recomendación es poner al
menos uno de los dos en plan pago. **Verificar los planes y valores vigentes en Render.**

### WhatsApp — opción (b), decidida

Un solo worker, el mismo número, leyendo las dos bases. Es correcta porque
`whatsapp-web.js` ata una sesión a un número: dos workers con el mismo número se
desconectan mutuamente.

**Es el único punto donde se modifica algo que ya funciona.** Reglas:

1. **Respaldo de la carpeta `whatsapp-worker` antes de tocar nada.** Revertir tiene que ser
   renombrar dos carpetas.
2. Se **agrega** la línea `MONGODB_URI_COMBUSTIBLE` al `.env`; **no se reemplaza**
   `MONGODB_URI`.
3. El reporte de balanza queda **exactamente igual**: mismo horario, formato y destinatarios.
4. El reporte de combustible va como **mensaje aparte**, no mezclado, y **encerrado en su
   propio control de errores**: si la base de combustible no responde, se anota el error y
   se sigue. **El reporte de balanza no puede caerse por culpa del de combustible.**
5. La sesión de WhatsApp no se toca: **no hay que volver a escanear el QR**.

---

## 5. Lo que se copia tal cual de balanza

Sin discutirlo de nuevo, porque ya se probó en uso real:

1. **Toda la maquinaria sin señal**: la cola, el `localId`, la numeración reservada, la
   cáscara guardada, la subida en orden, el estado a la vista.
2. **Pedir → resolver.** El operario no anula ni corrige: pide con motivo escrito, y
   GENERAL resuelve desde su propio teléfono. **El código de GENERAL no circula por los
   depósitos.**
3. **Anular siempre con motivo escrito**, también cuando lo hace GENERAL.
4. **Auditoría con copia completa** antes de cualquier cambio.
5. **El reporte diario por correo con el Excel adjunto** y el botón de exportar, armados
   por **una sola función** para que no se desincronicen.
6. **Las pruebas**: base de datos en memoria, navegador real con el service worker real,
   tope de peso por archivo, y comprobar que cada prueba falla sin su arreglo.
7. **Cada código ve lo suyo y sólo lo suyo**, en todas las pantallas: resumen, buscador,
   Excel y avisos. Fue el error que más veces se repitió en balanza.

`app_localids` (`localId → registro`) es lo que hace que la cola sea segura: sin eso
cualquier reintento duplica un movimiento, y un despacho duplicado son litros que no
existieron.

---

## 6. Lo que NO se copia de balanza

Son decisiones de aquel negocio, no reglas generales:

- **Los plazos** de balanza (1 día para tal paso, 5 para tal otro). Acá el plazo es 3 días
  para modificar, y nada más.
- **El máximo de dos correcciones por ticket**: regla heredada de un sistema anterior.
- **Los tres pasos** (camión, tara final, regulada) son de un pesaje. Un despacho de
  combustible es de un solo paso.
- **El ticket impreso**: acá no se imprime nada.

---

## 7. Preguntas abiertas

Ordenadas por cuánto cambian el diseño:

1. **La lista de labores.** El despacho tiene que imputarse a una labor siempre. ¿De dónde
   sale esa lista, quién la mantiene, cambia por campaña?
2. **El tope de 1.000 litros**: ¿se elimina, o se conserva como advertencia anti-tipeo?
   (ver sección 1)
3. **Destinatarios** del reporte diario, por correo y por WhatsApp. Y qué necesitan ver:
   litros por depósito, por equipo, saldo estimado, faltantes.
4. **EL C1: ¿sus dos tanques son fijos o cisternas móviles?** Las hojas los llaman
   "Cisterna", pero el manuscrito dice que en el Excel están los fijos.
5. **¿EL MATACO y LA JUANITA tienen depósito?** Tienen código de balanza pero no aparecen
   en el Excel.
6. **Medir el tanque de 60 mil de LA PRADERA** y **listar todas las cisternas**.
7. **Qué depósito tiene contador y si funciona**, tanque por tanque.
8. **El nombre del despachante** de cada depósito.
9. **Los códigos definitivos**, incluido el segundo código de cada campo.
10. **Frecuencia de medición con varilla** y **sensores electrónicos**: se está buscando lo
    recomendado para el rubro.

---

## 8. Orden de trabajo

Cada etapa deja algo usable. Nada de construir seis semanas y mostrar al final.

| Etapa | Qué queda funcionando |
|---|---|
| 1. La base | Repositorio, base de datos, servicio, ingreso con código, pantalla vacía. Se entra desde el teléfono. |
| 2. Los datos fijos | Depósitos de la `PLANILLA MAESTRA` y equipos cargados y visibles. |
| 3. El despacho, con señal | Pantalla de carga completa y listado del día. Ya reemplaza el cuaderno cuando hay señal. |
| 4. Sin señal | La cola, el `localId`, la cáscara. **Se prueba en el campo, en modo avión, no en el escritorio.** |
| 5. La recepción y el saldo | Entra combustible; saldo calculado por tanque con su fecha de corte, negativos marcados. |
| 6. Pedidos y modificación | El circuito con GENERAL, con el plazo de 3 días. |
| 7. Reportes | Exportar a Excel, correo diario y el bloque nuevo del worker de WhatsApp. |
| 8. Lo que falte | Traslados entre campos, mediciones con varilla, imputación fina, contratistas. |

La etapa 4 es la que hay que probar **en el campo**. En balanza, todo lo que falló del modo
sin señal falló en el teléfono de alguien trabajando, con las pruebas de escritorio en verde.
