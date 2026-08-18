# Combustibles — arranque del proyecto

Registro de **carga y despacho de combustible** en los campos, en el teléfono y
sin señal, para reemplazar la planilla de papel del depósito.

Este archivo es el punto de partida: está escrito para que alguien que no
participó de la app de balanza pueda arrancar leyendo esto y nada más. Va
acompañado de una **planilla Excel con los depósitos**: ubicación en cada campo y
capacidad.

Su hermano genérico es **`REGISTRAR_SIN_SENAL.md`**: ahí está el patrón de
trabajar sin señal, sin nada de combustible. Conviene leer ese primero. Acá está
lo que cambia cuando el patrón se aplica a este caso.

> **Cómo leer este archivo.** Lo que dice **HECHO** ya existe y funciona en la app
> de balanza: se copia. Lo que dice **PROPUESTA** es un punto de partida razonable
> pero no está confirmado con nadie: hay que revisarlo antes de escribir código.
> Lo que dice **PREGUNTA** hay que responderlo sí o sí, porque cambia el diseño.

---

## 1. Qué se va a construir

Una app instalable en el teléfono, igual que la de balanza, donde el encargado
del depósito registra dos cosas:

- **Recepción**: llega el camión del proveedor y descarga en el tanque. Entra
  combustible.
- **Despacho**: se le carga combustible a un equipo —tractor, cosechadora,
  camioneta, camión—. Sale combustible.

Y de esos dos movimientos sale todo lo demás: cuánto hay en cada tanque, cuánto
consumió cada equipo, cuánto se le despachó a cada contratista.

**El objetivo real no es "tener una app"**: es que el litro que salió del tanque
quede registrado en el momento, con quién lo recibió y para qué equipo. Hoy eso
se anota en un cuaderno en el depósito, donde no hay señal.

---

## 2. La advertencia más importante: el combustible es stock

Vale la pena empezar por acá, porque es la única diferencia de fondo con la
balanza y es donde el proyecto se puede arruinar.

`REGISTRAR_SIN_SENAL.md` dice, con todas las letras, que el patrón sin señal
**no** aplica a "un recurso que se agota y se reparte entre varios". El
combustible es exactamente eso. Y sin embargo esto se puede hacer. La distinción
que lo salva:

| Esto sí | Esto no |
| --- | --- |
| **Registrar lo que pasó**: "salieron 200 litros para el tractor 4" | **Autorizar**: "¿me alcanza para cargar 200?" |

El operario del depósito **ve el tanque**. No necesita que el sistema le diga si
hay; necesita que quede anotado lo que sacó. Mientras la app sea un cuaderno que
no se pierde y no un sistema que autoriza, el modo sin señal es correcto.

De ahí salen tres reglas que no hay que negociar:

1. **El saldo del tanque no se guarda: se calcula** sumando los movimientos. No
   existe un campo `litros_actuales` que alguien actualiza — eso se desincroniza
   el primer día y después nadie sabe cuál es el bueno.
2. **El teléfono nunca decide si hay saldo.** No bloquea un despacho por falta de
   stock. Si lo hiciera, con datos viejos bloquearía cargas reales.
3. **El saldo puede quedar mal un rato, y hay que decirlo.** Si un despacho sube
   antes que la recepción que lo abastece, el tanque da negativo. No es un error
   del sistema: es un dato que todavía no llegó. La pantalla del saldo tiene que
   mostrar **"calculado con lo subido hasta tal hora"** y, aparte, cuántos
   movimientos hay esperando.

**PREGUNTA.** ¿Hay algún caso donde el sistema **sí** deba impedir un despacho
—un contratista sin autorización, un tanque que no se puede tocar sin permiso—?
Si la respuesta es sí, esa parte necesita señal y hay que decirlo en la pantalla.

---

## 3. El modelo del dato

### El movimiento

Un solo tipo de registro con un campo que dice qué es. Así el listado, el Excel y
la auditoría son uno solo, no tres.

**PROPUESTA** — cuatro tipos:

| Tipo | Qué es | Efecto en el tanque |
| --- | --- | --- |
| `RECEPCION` | Descarga del proveedor en el tanque | **+** litros |
| `DESPACHO` | Carga a un equipo | **−** litros |
| `TRASLADO` | De un tanque a otro (sale de uno, entra en otro) | **−** en origen, **+** en destino |
| `MEDICION` | Lo que marca la varilla o la regla en una fecha | no mueve: sirve para comparar contra lo calculado |

`MEDICION` es la que ata el sistema con la realidad: si el cálculo dice 4.200 y la
varilla dice 3.900, la diferencia se ve y se investiga. Sin eso, el sistema deriva
sin que nadie se entere.

**PREGUNTA.** ¿Se hacen traslados entre campos? ¿Y se mide con varilla, con qué
frecuencia?

### El despacho, campo por campo

**PROPUESTA.** Marcado lo que sería obligatorio:

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Fecha y hora | sí | la pone el sistema |
| Depósito | sí | de la lista del Excel; sale del código con el que se entró |
| Combustible | sí | gasoil G2, gasoil G3, nafta… (**PREGUNTA**: ¿cuáles?) |
| Equipo que carga | sí | de una lista, no texto libre — ver más abajo |
| Litros | sí | ver "cómo se mide" |
| Horómetro / kilometraje | **sí, si el equipo lo tiene** | sin esto no hay consumo por equipo |
| Quién retira | sí | el operario del equipo |
| Contratista | solo si es de un tercero | define si se refactura |
| Lote o labor | no | para imputar el gasto (**PREGUNTA**: ¿hace falta?) |
| Observaciones | no | |

**El horómetro merece atención.** Es el dato que convierte esto de "un registro de
salidas" en "consumo por equipo", que es donde está el valor. Si se deja opcional,
no se carga; si se exige siempre, traba las cargas a un tambor o a un bidón. La
propuesta es: **obligatorio cuando el equipo elegido tiene horómetro**, y esa
marca viene en la ficha del equipo.

Además conviene avisar —no bloquear— cuando el horómetro cargado es **menor que
el anterior** de ese equipo: es el error de tipeo más común y el que más ensucia
los promedios de consumo.

### La recepción, campo por campo

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Fecha | sí | |
| Depósito | sí | |
| Combustible | sí | |
| Proveedor | sí | |
| Remito Nº | sí | es el comprobante del proveedor |
| Litros según remito | sí | lo que dice el papel |
| Litros medidos | no | varilla antes y después, si se hace |
| Patente del camión | no | |
| Quién recibió | sí | |

**La diferencia entre lo del remito y lo medido es un dato, no un problema**: se
guarda y se muestra. Es la forma de detectar faltantes en la entrega.

### Cómo se mide, y qué no se puede editar

Acá hay un paralelo directo con la balanza que conviene copiar tal cual.

En la balanza, el peso lo da la balanza: **los brutos no se editan nunca**, ni
GENERAL puede. Son la única prueba del pesaje. Lo que sí se corrige es la tara, y
los netos se recalculan solos.

En combustible, el equivalente es **la lectura del contador del surtidor**:

- Si el depósito tiene contador, el despacho se registra con **lectura anterior**
  y **lectura actual**, y los litros son la resta. Esas lecturas son la prueba y
  no se editan libremente.
- Si no tiene contador, se cargan los litros directo, y ahí la evidencia es más
  débil: conviene que el sistema lo sepa y lo muestre distinto.

**PREGUNTA.** ¿Cuáles depósitos tienen contador y cuáles no? Esto va en el Excel.

### Los equipos

Que el equipo salga de **una lista y no de texto libre** es lo que decide si al
final del año se puede saber cuánto consumió cada máquina. Con texto libre, el
mismo tractor aparece como "Tractor 4", "tractor4", "T4" y "el JD".

**PROPUESTA.** Una ficha por equipo con: nombre visible, tipo (tractor,
cosechadora, camioneta, camión, otro), si tiene horómetro o kilómetros, y de quién
es (propio o de qué contratista). Se carga una vez y se elige de la lista.

En la balanza los contratistas y sus tractores se cargan desde una planilla Excel
que se lee al arrancar el servidor. Ese camino ya está resuelto y se puede repetir.

---

## 4. Los códigos de acceso

**HECHO** — el modelo de la balanza, que funciona y conviene repetir tal cual:

| Tipo de código | Qué puede hacer |
| --- | --- |
| **De carga** (uno por lugar) | registrar movimientos de **su** depósito |
| **De ver registros** (uno por lugar) | mirar lo de **su** depósito: resumen del día, buscar, exportar. No carga nada |
| **GENERAL** (uno solo) | ve todos los lugares, autoriza anulaciones, corrige datos |

Tres cosas que se aprendieron con la balanza y no hay que volver a discutir:

- **El código de GENERAL no circula por los depósitos.** El operario no anula ni
  corrige: **pide**, y GENERAL resuelve desde su propio teléfono. Antes existía un
  modal para tipear el código de GENERAL en la balanza y se sacó.
- **El que carga define de quién es el registro.** El movimiento queda del
  depósito cuyo código lo cargó, no del campo que aparezca en un desplegable.
- **Cada código ve lo suyo y solo lo suyo**, en todas las pantallas: el resumen,
  el buscador, el Excel y los avisos. Este fue el error que más veces se repitió:
  una pantalla nueva que se olvidaba de filtrar por lugar.

### Los establecimientos

**HECHO** — los códigos de la balanza hoy, como punto de partida. Los valores
numéricos se van a cambiar; los nombres son casi los mismos:

| Nombre | Ingreso | Ver registros |
| --- | --- | --- |
| GENERAL | `56781` | `12341` |
| EL MATACO | `5679` | `1235` |
| LA PRADERA | `5680` | `1236` |
| EL C1 | `5681` | `1237` |
| EL WICHI | `5682` | `1238` |
| LA JUANITA | `5683` | `1239` |
| QUIMILI | `5684` | `1240` |
| PACO-PASCUAL | `5685` | `1241` |

**PREGUNTA.** ¿Los depósitos de combustible están en los **mismos** ocho lugares,
o hay campos con tanque que no tienen balanza (y al revés)? La lista real sale del
Excel de depósitos, y puede que no coincida con esta.

**PROPUESTA.** Usar **números nuevos**, no los mismos de balanza. Si un código
sirve para las dos apps y se filtra, se filtran las dos.

### Los campos (establecimientos) que ya están cargados

La app de balanza tiene 43 campos con este formato — `Nombre - LOCALIDAD - PROV`:

```
AMAMÁ - Villa Brana - SE          El Centinela - LOGROÑO SF
AVELLEIRA                          El Mataco - SACHAYOJ - SE
Aguero - SACHAYOJ - SE             El Rodeo - TOSTADO SF
Bandera - AVERIAS - SE             Ferulo Guido 2 - SACHAYOJ - SE
Campo Cesar Bressan                Gioda - SAN FRANCISCO - SE
Cejolao - CEJOLAO - SE             Gomez - VILELAS - SE
Charata - CHARATA - CH             Grifa - Zunesma - TINTINA - SE
Cueto - CEJOLAO - SE               Hidalgo - TINTINA - SE
Doble Cero (Fermaneli) - AEROLITO  La Chuchi - Avelleira y Cesar
Don Paco - ARBOL BLANCO - SE       La Juanita - Ciriaci - H.M.M. - SE
Don Pascual - ARBOL BLANCO - SE    La Juanita - H.M. MIRAVAL - SE
El 44 - ARBOL BLANCO - SE          La Porfía - ARBOL BLANCO - SE
El 90 Red Surcos - TINTINA - SE    La Pradera - ARBOL BLANCO - SE
El Búfalo - H. MEJ. MIRAVAL - SE   La Purificada - QUIMILI - SE
El C 1 Ciriaci - TINTINA - SE      La Unión - LA UNION - SE
El C 1 GyM - TINTINA - SE          Los Molinos - Tostado
El Centinela 2 - LOGROÑO - SF      Martina - ALHUAMPA - SE
El Centinela 3 - LOGROÑO - SF      Martinoli - SACHAYOJ - SE
                                   Panuncio - ARBOL BLANCO - SE
                                   Poncho Perdido Guido F - SACHAYOJ
                                   Santa Justina Cura Malal - QUIMILI
                                   Santa Justina Mahuida - QUIMILI
                                   Santa Rosa (Sonzogni) - ARBOL BLANCO
                                   Tierra Negra - ARBOL BLANCO - SE
                                   Wichí - SACHAYOJ - SE
```

La lista completa y exacta está en `app.js` de la balanza, en `const campos`. Ahí
mismo está `campoUsuario`, que asocia cada campo con el código que le corresponde:
la misma idea sirve para asociar cada depósito con su código.

---

## 5. Qué tiene que traer el Excel de depósitos

Para que el arranque no se trabe, la planilla debería tener **una fila por
tanque** y estas columnas:

| Columna | Para qué |
| --- | --- |
| **Campo / establecimiento** | ubicación, con el mismo nombre que en la lista de arriba |
| **Nombre del tanque** | si en un campo hay más de uno, hay que poder distinguirlos |
| **Combustible** | gasoil G2, G3, nafta… un tanque por producto |
| **Capacidad en litros** | para avisar si una recepción no entra, y para el aviso de reposición |
| **¿Tiene contador / surtidor?** | decide si el despacho se carga por lectura o por litros |
| **¿Tiene varilla o regla?** | decide si se puede hacer `MEDICION` |
| **Código de acceso** | qué código carga en ese depósito (se puede completar después) |

Si algo de eso no está, no es un bloqueo: se arranca sin eso y se agrega. Pero
**capacidad** y **si tiene contador** conviene tenerlos desde el principio, porque
cambian la pantalla de carga.

---

## 6. La estructura técnica

### GitHub

**PROPUESTA: repositorio nuevo, copiando la base de la app móvil.**

Lo que se copia y ya está probado —el cliente sin señal, el service worker, el
diseño de pantallas, el andamiaje de pruebas— es del orden de unas pocas decenas
de kilobytes y es la parte más difícil de volver a hacer bien.

El motivo de no meterlo en el repositorio de balanza: son dos negocios distintos,
con dos ritmos de cambio distintos, y un error en uno no debería poder tocar los
tickets del otro. El costo es que la base compartida se va a ir separando con el
tiempo. Es un costo aceptable; unificarla en una librería común se puede hacer más
adelante, si alguna vez duele.

**Lección aprendida, y esta importa.** En balanza toda la app móvil vive en una
rama de trabajo y **nunca se integró a `main`**: funciona solo porque el servidor
apunta a esa rama. Es frágil — si alguien mueve el servidor a `main`, la app
desaparece. **Arrancar directo en `main`** y trabajar con ramas cortas que se
integran.

### MongoDB

**PROPUESTA: base de datos separada**, en el mismo clúster si se quiere. Un error
de consulta en combustibles no puede llegar a los tickets de balanza.

Colecciones, siguiendo el modelo que ya funciona:

| Colección | Qué guarda |
| --- | --- |
| `movimientos` | recepciones, despachos, traslados y mediciones |
| `movimientos_auditoria` | copia completa antes de anular o corregir, con quién y por qué |
| `depositos` | los tanques del Excel |
| `equipos` | la ficha de cada máquina |
| `app_dias` | quién está hoy a cargo de cada depósito |
| `app_pedidos` | pedidos de anulación y corrección |
| `app_localids` | `localId → registro`, lo que evita duplicar al reintentar |
| `app_numeros`, `app_contadores` | numeración reservada y correlativos |
| `sessions` | sesiones |

Dos cosas de esa lista que no son obvias y valen mucho:

- **`app_localids` es lo que hace que la cola sea segura.** Sin eso, cualquier
  reintento duplica un movimiento — y en stock, un despacho duplicado es plata.
- **Nada se borra.** Anular marca `anulado: true` y guarda copia completa en
  auditoría. Un movimiento anulado sigue existiendo, con su número quemado.

### Render

**PROPUESTA: servicio nuevo**, con su propia base y sus variables. Las que usa la
balanza hoy, como referencia de qué hay que definir:

| Variable | Para qué |
| --- | --- |
| `MONGODB_URI` | la base |
| `SESSION_SECRET` | firma de las sesiones |
| `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_TO` | envío de reportes (clave de aplicación de Gmail) |
| `AVISOS_POR_TICKET` | interruptor de los avisos por evento; apagado por defecto |

Y una decisión de arranque que salió bien en balanza: **poner la app nueva detrás
de un interruptor** (`APP_MOVIL=1` allá). Se prende y se apaga sin volver a subir
código, y permite dejarla instalada sin exponerla hasta que esté lista.

### El stack

Node 20, Express, EJS con layouts, mongoose (usando el driver nativo para las
consultas), `connect-mongo` para las sesiones, ExcelJS para los reportes,
nodemailer para el correo, node-cron para el reporte diario. Sin framework de
frontend: las pantallas son HTML del servidor y el JavaScript del cliente es un
solo archivo, sin dependencias.

**Eso último no es pobreza, es una decisión**: la app tiene que abrir rápido en un
teléfono de gama media con señal de campo, y cada archivo tiene un tope de peso
comprobado en las pruebas.

---

## 7. Lo que se copia tal cual

Sin discutirlo de nuevo, porque ya se probó en uso real:

1. **Toda la maquinaria sin señal.** Ver `REGISTRAR_SIN_SENAL.md`: la cola, el
   `localId`, la numeración reservada, la cáscara guardada, la subida en orden, el
   estado a la vista. **Y la lista de errores de ese archivo**, que son cinco y
   todos aparecieron en el teléfono, no en las pruebas.
2. **Pedir → resolver.** El operario no anula ni corrige: pide, con el motivo
   escrito, y GENERAL resuelve. El estado del pedido viaja con el comprobante:
   "Anulación pedida", "GENERAL rechazó el pedido", "GENERAL corrigió".
3. **Anular siempre con motivo escrito**, también cuando lo hace GENERAL por su
   cuenta. Un comprobante anulado quema su número; tiene que quedar el por qué.
4. **Auditoría con copia completa** antes de cualquier cambio, con qué cambió,
   quién y cuándo.
5. **El reporte diario por correo** con el Excel adjunto, y el botón de exportar
   en la app, armados por **una sola función** para que no se desincronicen.
6. **Las pruebas**: base de datos de mentira en memoria, navegador real con el
   service worker real, tope de peso por archivo, y comprobar que cada prueba
   falla sin su arreglo.

---

## 8. Preguntas para responder antes de escribir código

Ordenadas por cuánto cambian el diseño:

1. **¿El sistema tiene que impedir algún despacho, o solo registrar?** Si tiene
   que impedir, esa parte necesita señal.
2. **¿Qué combustibles?** Uno por tanque, o varios en el mismo.
3. **¿Los depósitos están en los mismos ocho lugares que las balanzas?**
4. **¿Qué depósitos tienen contador de surtidor?** Cambia la pantalla de carga.
5. **¿Se exige horómetro o kilometraje siempre, o según el equipo?**
6. **¿Hay que imputar el consumo a un lote o a una labor?** Si sí, hay que
   resolver de dónde sale esa lista.
7. **¿Se despacha a contratistas y eso se refactura?** Si sí, hace falta saber a
   quién y a qué precio.
8. **¿Se hacen traslados entre campos?**
9. **¿Con qué frecuencia se mide el tanque con varilla?**
10. **¿Quién recibe el reporte diario y qué necesita ver?** Litros por depósito,
    por equipo, saldo estimado, faltantes.

---

## 9. Un orden de trabajo sugerido

Cada etapa deja algo usable. Nada de construir seis semanas y mostrar al final.

| Etapa | Qué queda funcionando |
| --- | --- |
| **1. La base** | Repositorio, base de datos, servicio, ingreso con código, pantalla vacía. Se puede entrar desde el teléfono. |
| **2. Los datos fijos** | Depósitos del Excel y equipos cargados y visibles. |
| **3. El despacho, con señal** | La pantalla de carga completa y el listado del día. Ya reemplaza el cuaderno cuando hay señal. |
| **4. Sin señal** | La cola, el `localId`, la cáscara. Acá se prueba en el campo de verdad, en modo avión. |
| **5. La recepción y el saldo** | Entra combustible, y el saldo calculado por tanque con su fecha de corte. |
| **6. Pedidos, anulación y corrección** | El circuito con GENERAL. |
| **7. Reportes** | Exportar a Excel y el correo diario. |
| **8. Lo que falte** | Traslados, mediciones, imputación a labores, refacturación. |

La etapa 4 es la que hay que probar **en el campo y no en el escritorio**. En
balanza, todo lo que falló del modo sin señal falló en el teléfono de alguien
trabajando, con pruebas de escritorio en verde.

---

## 10. Lo que no conviene copiar de la balanza

Son decisiones de aquel negocio, no reglas generales:

- **Los plazos** (1 día para tal paso, 5 para tal otro) salen de cómo trabaja una
  balanza de cereal. Acá los plazos son otros, o no hay.
- **El máximo de dos correcciones por ticket** es una regla heredada de un sistema
  anterior.
- **Los tres pasos** —camión, tara final, regulada— son de un pesaje. Un despacho
  de combustible es de un solo paso; una recepción, tal vez de dos si se mide
  antes y después.
- **El formato del ticket impreso** (19 × 4,5 cm, seis por hoja A4) existe porque
  el chofer se lleva un papel. **PREGUNTA**: ¿acá hace falta que el que retira
  combustible se lleve un comprobante?
