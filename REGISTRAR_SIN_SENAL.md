# Registrar sin señal

Cómo hacer que una app siga tomando datos donde no hay internet, y que lo tomado
llegue solo al servidor cuando la señal vuelve.

Esto no es la documentación de la app de balanza —eso está en `APP_MOVIL.md`—.
Es lo que aprendimos construyéndola, separado de la balanza para que se pueda
aplicar a otro proceso: remitos, entregas, controles de campo, recepción de
mercadería. Cualquier cosa que hoy se anota en papel porque en el lugar no hay
señal.

---

## El problema que resuelve

El papel no aparece porque a alguien le guste el papel. Aparece porque el sistema
no funciona en el momento en que hay que registrar, y algo hay que anotar.

Después el papel se transcribe tarde, se transcribe mal, o no se transcribe. El
dato que importa —cuánto, cuándo, quién— termina siendo el que alguien recuerda.

La salida no es "que haya mejor señal". Es que **la app funcione igual sin
señal**, y que el operario no tenga que hacer nada distinto ni acordarse de nada
después.

---

## Cuándo aplica

| Aplica bien | No aplica |
| --- | --- |
| Un formulario corto que llena **una** persona, en el lugar | Un dato que necesita respuesta del servidor **en el momento** (autorizar, cobrar, validar contra otro sistema) |
| El dato puede tardar minutos u horas en llegar sin que nada se rompa | Un recurso que se agota y se reparte entre varios (stock, cupos, turnos) |
| Cada registro es de quien lo carga: dos personas no cargan lo mismo | Dos personas pueden cargar lo mismo y el orden decide quién gana |

Si el caso está en la columna derecha, esto no lo resuelve. Ahí lo honesto es que
la pantalla diga "hace falta internet" y no dejar guardar: es preferible a
guardar algo que después el servidor va a rechazar.

---

## La regla que ordena todo lo demás

> **Lo que la persona tocó, no se pierde.**

Desde que toca *Guardar*, el dato es responsabilidad del sistema: sobrevive a
que se cierre la app, a que se apague el teléfono, a que la señal no vuelva hasta
mañana, y a que se actualice la app.

Si de eso no se puede dar garantía, el papel no se va a ir — y con razón.

---

## Las piezas

### 1. La cola en el teléfono

Todo lo que se guarda sin señal va a una **lista en el almacenamiento local**, en
orden. Cada ítem es una petición ya armada:

```
{
  localId:  "un identificador que genera el teléfono",
  tipo:     "pesada" | "tara-final" | "regulada",
  url:      "/app/api/pesada",
  datos:    { …lo que iría en el cuerpo… },
  creadoEn: "2026-08-18T13:05:00.000Z"
}
```

Guardar la **petición entera** —no "los datos del formulario"— es lo que hace que
subirla después sea trivial: se manda tal cual, sin volver a interpretarla.

Dos detalles que parecen menores y no lo son:

- **La cola no se toca al actualizar la app.** El service worker borra pantallas
  y archivos; la cola vive aparte y no la mira nunca. Hay una prueba dedicada a
  esto, porque es la forma más fácil de perder un día de trabajo.
- **La cola guarda desde cuándo espera.** Con eso se avisa: pasadas 48 horas el
  aviso se pone rojo. Un dato sin subir no es un problema; sin subir hace tres
  días, sí.

### 2. El identificador local: subir dos veces no duplica

El teléfono le pone a cada registro un `localId` antes de mandarlo. El servidor
guarda la relación `localId → registro creado`.

Si la misma petición llega dos veces —se cortó justo al responder, se reintentó,
la persona tocó dos veces— el servidor **no crea un segundo registro**: devuelve
el que ya había creado.

```
POST /api/pesada { localId: "abc123", … }
  → primera vez:  crea el registro, guarda abc123 → id
  → otra vez:     no crea nada, devuelve { duplicado: true, id }
```

Sin esto, todo lo demás es peligroso: cualquier reintento ensucia los datos, y
reintentar es exactamente lo que hace una cola.

### 3. Los números los da el servidor, siempre

Si el comprobante lleva número, **el teléfono no lo inventa**. Dos teléfonos sin
señal generarían el mismo.

Lo que se hace: cuando hay señal, el teléfono **pide unos números de antemano** y
los guarda. Sin señal usa uno de esos.

- Si el servidor **rechaza** el registro, el número **vuelve a la reserva**: no
  se creó nada, así que no hay por qué quemarlo.
- Si el registro **se creó** y después se anula, el número **queda quemado**: no
  se reasigna nunca. Un hueco en la numeración es incómodo; dos comprobantes con
  el mismo número es un problema de verdad.
- Es un talonario en un cajón: se llevan tres, se usan dos, el tercero vuelve a
  la pila. Pero una hoja escrita y tachada no se vuelve a usar.

### 4. La cáscara guardada: que la app abra sin señal

Una app que no abre sin señal no sirve, por más cola que tenga. El service worker
guarda lo necesario para arrancar:

| Qué | Cómo se sirve |
| --- | --- |
| CSS, JS, ícono | **primero lo guardado** (dentro de una versión no cambian) |
| Pantallas | **primero la red**, y si no hay, la última guardada |
| Endpoints de datos (`/api/…`) | **nunca se guardan**: o datos frescos, o error |

Tres reglas que salieron de romperlo:

- **Si un archivo no se puede bajar, la instalación falla a propósito.** Así el
  teléfono se queda con la versión anterior, que funciona, en vez de quedarse con
  una a medias. La app se actualiza en el campo, con media señal.
- **Los archivos llevan la versión en la dirección** (`app.js?v=17`). Sin eso, la
  primera vez que se abre después de subir cambios queda el **HTML nuevo con el
  JS viejo**, y algo falla con un error que no tiene nada que ver.
- **Lo que muestra resultados de una consulta no se guarda.** Mostrar sin señal
  el resultado de una búsqueda vieja es mentirle al operario.

### 5. La subida: de a uno, en orden, sin que nadie la pida

Cuando vuelve la señal, la cola se sube **de a uno y en orden**. El orden importa
cuando un registro depende de otro: primero el comprobante, después sus pasos.

Un paso que se cargó sin señal no puede apuntar al id del servidor —todavía no
existe— así que apunta al `localId` del comprobante. El servidor lo resuelve
cuando le llega:

```
1. sube el comprobante   → queda localId "abc" → id real
2. sube el paso          → refLocal "abc" → busca, encuentra, aplica
```

Si el paso llega antes que su comprobante, el servidor responde *"todavía no se
subió, se reintenta"* y el ítem queda en la cola. No se pierde.

Y la distinción que hay que hacer bien:

| Qué pasó | Qué hace la cola |
| --- | --- |
| **Se cortó la red** | deja el ítem y reintenta después |
| **El servidor lo rechazó** (dato inválido, plazo vencido) | lo saca y **lo dice**, con el motivo |

Reintentar para siempre algo que el servidor nunca va a aceptar es peor que
fallar: la cola no vacía nunca y nadie entiende por qué.

### 6. El estado a la vista, sin que haya que preguntarlo

El operario tiene que poder confiar sin verificar. Para eso:

- **Un cartel arriba de todas las pantallas** con cuántas cosas quedan sin subir
  —y en todas, no solo en la de carga—.
- **Un chip en cada registro** que todavía está en el teléfono (`SIN SUBIR`).
- **Un aviso cuando sube**, aunque nadie estuviera mirando.
- **Nunca un botón que no hace nada.** Lo que necesita internet se muestra
  apagado con el motivo debajo, no escondido: escondido parece que se rompió.

### 7. Lo que no se hace sin señal — y se dice

Que se pueda encolar no significa que convenga. Acá no se encolan:

- **Entrar con un código.** Se valida contra el servidor. Sin eso, cualquiera
  entra tipeando cualquier cosa y trabaja "sin señal" toda la tarde.
- **Pedir una autorización.** Encolarla haría creer que alguien la recibió.
- **Bajar un reporte.** Lo arma el servidor.

En los tres casos la pantalla lo dice con el motivo. Un "no se puede" con motivo
se entiende; un botón que no responde, no.

---

## Los errores que cometimos

Esta es la parte que más vale copiar. Todos aparecieron **en el teléfono, en uso
real** — ninguno lo agarró una prueba escrita mirando el HTML.

### La pantalla congelada

Sin señal, las pantallas salen de lo guardado: quedan **como estaban la última
vez que hubo internet**. Si la app dibuja una tarjeta con "falta el paso 2" y
después se carga el paso 2 sin señal, la tarjeta lo sigue pidiendo. Se puede
cargar el mismo paso una y otra vez, y el paso 3 no aparece nunca.

**Qué hacer:** al dibujar, cruzar lo guardado con **lo que hay en la cola**. La
pantalla tiene que mostrar el estado real = servidor + pendiente, no uno de los
dos.

### La pantalla restaurada

En el teléfono, volver atrás o cambiar de app y volver **no vuelve a pedir la
pantalla**: el sistema la restaura tal cual. En una app instalada no hay barra de
dirección ni "tirar para actualizar", así que **no hay forma de notarlo**.

Nos costó dos días: alguien pedía algo, volvía a la pantalla que debía mostrarlo,
no estaba, y el dato estaba bien en el servidor.

**Qué hacer:** las pantallas que muestran *lo que hay ahora* se vuelven a pedir
al volver a ellas. Solo esas: recargar una pantalla de carga borraría lo que la
persona está tipeando.

### El HTML nuevo con el código viejo

La pantalla se pide a la red, pero los archivos salen de lo guardado. La primera
vez que se abre después de subir cambios, el HTML nuevo puede correr con el JS
anterior. Un botón falla con un mensaje que habla de otra cosa.

**Qué hacer:** versionar la dirección de los archivos. Y dejar la versión **a la
vista dentro de la app**, comparando teléfono contra servidor, para no tener que
adivinar si un teléfono quedó atrás.

### Navegar a un archivo

Un enlace común a un archivo (un PDF, una planilla), en una app instalada en el
teléfono, **reemplaza la app por la vista previa del archivo** y no deja forma de
volver: hay que cerrarla y abrirla.

**Qué hacer:** bajar el archivo a memoria y entregarlo —al menú de compartir en
el teléfono, como descarga en la computadora—. Nunca navegar la pantalla al
archivo.

Y ojo con la simetría: la primera versión de ese arreglo usó el menú de compartir
**en todos lados**, y rompió la computadora, donde lo que se espera es que se
descargue. Lo que resuelve un aparato puede romper otro.

### El peso

Todo esto corre en teléfonos de gama media con señal de campo. Cada archivo tiene
un tope de peso comprobado en las pruebas. Cuando algo no entra, la salida no es
recortar comentarios hasta que entre: es **sacar lo que ya no sirve**, y si aun
así no entra, subir el tope **a la vista**, dejando anotado por qué.

---

## Cómo se prueba

Lo que no se puede probar, no se puede prometer. Y acá hay un patrón claro:

**Los errores que importan no se ven en el HTML.** Se ven usando la app. Todos
los de la lista de arriba pasaron pruebas de servidor sin despeinarse.

Entonces:

1. **Un navegador de verdad, con el service worker de verdad**, poniéndolo en
   modo avión y sacándolo. No un simulacro del modo sin señal: el service worker
   real, que es lo que corre en el teléfono.
2. **Una base de datos de mentira, en memoria.** Las pruebas nunca tocan la base
   real y arrancan en milisegundos, así se corren a cada rato.
3. **Comprobar el efecto, no la apariencia.** Que el registro quedó en la base
   con los números bien; que el archivo que se bajó, abierto, tiene las filas que
   corresponden. No que el HTML contiene tal palabra.
4. **Comprobar que la prueba falla sin el arreglo.** Una prueba que pasa con el
   código roto es decoración. Vale el minuto que lleva verificarlo.
5. **El caso mezclado, que es el real.** Es fácil probar "todo sin señal" y "todo
   con señal". Lo que pasa de verdad es **empezar con señal y perderla en el
   medio** — y ahí es donde estaba el error que más molestó.

---

## Para arrancar en otro proceso

En orden, porque cada punto se apoya en el anterior:

1. **Escribir qué pasa hoy en papel** y en qué momento exacto se anota. Ese
   momento es el que la app tiene que cubrir.
2. **Decidir qué NO se hace sin señal**, y qué dice la pantalla cuando pase.
3. **Idempotencia primero.** `localId` del lado del teléfono, relación guardada
   del lado del servidor. Antes de escribir la cola.
4. **La numeración**, si el comprobante lleva número: reserva previa, números
   quemados.
5. **La cola**: petición entera, en orden, con la fecha de cuándo se guardó.
6. **La cáscara**: que la app abra sin señal, con archivos versionados.
7. **El estado a la vista**: cartel de pendientes, chip por registro, aviso al
   subir.
8. **Cruzar lo guardado con la cola** en toda pantalla que muestre estado.
9. **Volver a pedir** las pantallas de mirar cuando se vuelve a ellas.
10. **Las pruebas en navegador real**, incluido el caso mezclado.

Y una advertencia sobre el orden: los puntos 8 y 9 parecen detalles de
presentación y se dejan para el final. Fueron los dos que más tiempo costaron
después, y los que más desconfianza generaron mientras estuvieron mal — porque el
dato estaba bien guardado y la pantalla decía otra cosa.

---

## Lo que no conviene copiar

Estas son decisiones de la balanza, no del patrón. Cada proceso tiene las suyas:

- **Los plazos** (1 día para tal paso, 5 para tal otro) salen de cómo trabaja una
  balanza de cereal.
- **Quién puede corregir y quién solo pide** sale de cómo se reparte la
  responsabilidad en este campo.
- **El máximo de correcciones por comprobante** es una regla heredada de la web
  anterior, no una ley.

Lo que sí se copia es todo lo de arriba: la cola, el identificador local, la
numeración del servidor, la cáscara, el estado a la vista, y sobre todo la lista
de errores.
