# API de Pesada de Balanza — camiones pesados

Para el programa que prepara las **cartas de porte**: en vez de volver a tipear
los datos mirando la pantalla de la balanza, los pide acá ya pesados.

**Solo lectura.** No hay ninguna forma de escribir, modificar ni borrar.

Hay dos listas y conviene no confundirlas:

| | Qué trae |
| --- | --- |
| `/camiones` | Los **terminados**: regulada cerrada, con el neto **pesado**. Es lo que sirve para armar una carta de porte y para sumar kilos |
| `/en-curso` | Los que **están en movimiento**: ya pesaron la tara y falta pesarlos cargados. Los kilos acá son **estimados** |

---

## Dirección

```
https://pesada-balanza-backend-1.onrender.com/api/externo
```

## Token

Todos los pedidos llevan la cabecera:

```
Authorization: Bearer <token>
```

El token lo entrega quien administra el sistema. Si falta o está mal, la
respuesta es `401` sin ningún dato adentro.

> **Guardalo como una contraseña.** No lo escribas adentro del código ni lo
> subas a ningún repositorio: ponelo en una variable de entorno o en un archivo
> de configuración que no se versione. Si se filtra, se cambia y listo —pero
> mientras tanto cualquiera puede leer los pesos—.

---

## Probar la conexión

```
GET /api/externo/ping
```

```json
{ "ok": true, "servicio": "pesada-balanza", "ventanaDias": 30,
  "ahora": "2026-10-09T13:40:12.004Z" }
```

Sirve para verificar la dirección y el token sin traerse datos.

---

## Los camiones

```
GET /api/externo/camiones
GET /api/externo/camiones?desde=2026-10-01&hasta=2026-10-09
```

Devuelve los camiones **con la regulada cerrada**, de **todas las balanzas**.

Solo esos: hasta que la regulada no se cierra, el neto es *estimado* y no está
pesado. Una carta de porte armada con un neto estimado estaría mal.

### Fechas

- Sin `desde` ni `hasta`: **los últimos 30 días**.
- Las fechas van en `AAAA-MM-DD`.
- **No se puede mirar más atrás de 30 días.** Pedir algo más viejo no falla ni
  devuelve vacío: se recorta a la ventana, y la respuesta dice en `ventanaDesde`
  desde cuándo se pudo mirar de verdad.
- Si vienen al revés, se dan vuelta. Una fecha futura se recorta a hoy. Una
  fecha inventada se ignora.

### Respuesta

```json
{
  "ok": true,
  "desde": "2026-10-01",
  "hasta": "2026-10-09",
  "ventanaDesde": "2026-09-09",
  "total": 1,
  "truncado": false,
  "generado": "2026-10-09T13:40:12.004Z",
  "camiones": [
    {
      "ticket": "1-0580",
      "fecha": "2026-10-08",
      "fechaRegulada": "2026-10-08",
      "balanza": "El Mataco",
      "cargaPara": "SOCIO",
      "socio": "ProvInvest",
      "transporte": "TRANSPORTE VENTRE MAURICIO",
      "patentes": "JWE798 KMT629",
      "chofer": "LEZCANO CARLOS",
      "campo": "La Porfía - ARBOL BLANCO - SE",
      "grano": "MAIZ",
      "lotes": ["Lote 5 La Porfía"],
      "cargoDe": "SILOBOLSA",
      "silobolsas": [{ "nro": "17", "kg": 29420 }],
      "tractores": [],
      "tara": 15550,
      "brutoLote": 45000,
      "bruto": 45000,
      "neto": 29420,
      "ctg": "",
      "comentarios": ""
    }
  ]
}
```

### Qué es cada campo

| Campo | Qué es |
| --- | --- |
| `ticket` | El número que figura en el papel que se le dio al chofer. **Es el identificador**: es único y no cambia |
| `fecha` | El día del ticket |
| `fechaRegulada` | Cuándo se cerró la regulada |
| `balanza` | Dónde se pesó |
| `cargaPara` | `AMH` o `SOCIO` |
| `socio` | Solo si `cargaPara` es `SOCIO`. Viene **enderezado** al nombre de la lista: los tickets viejos tienen el mismo socio tipeado de varias formas y acá salen todos igual |
| `transporte`, `patentes`, `chofer` | Del camión. Las patentes vienen con **un solo espacio** entre las dos |
| `campo` | Nombre completo del establecimiento, ya normalizado |
| `grano` | El grano |
| `lotes` | **Siempre un arreglo**, aunque haya uno solo. Un viaje puede salir de varios |
| `cargoDe` | `SILOBOLSA`, `CONTRATISTA` o vacío |
| `silobolsas` | De qué bolsas salió y cuántos kg de cada una. **Vacío** si `cargoDe` no es `SILOBOLSA`, y en los tickets anteriores a esa función |
| `tractores` | Qué tractores lo cargaron y cuántos kg puso cada uno: `[{ "tractor": "1VILLA", "contratista": "Villa Marcelo", "kg": 10000 }]`. **Vacío** si `cargoDe` no es `CONTRATISTA`, y en los tickets anteriores a esa función |
| `tara` | Peso del camión vacío |
| `brutoLote` | Peso con el que volvió del lote, **antes** de regular |
| `bruto` | Peso **regulado**, el que vale |
| `neto` | `bruto − tara`. **Es el peso de la carga** |
| `ctg` | El CTG, si ya se cargó. **Vacío** si todavía no |
| `comentarios` | Lo que haya escrito el balancero |

### Campos de control

- `total` — cuántos camiones vienen.
- `truncado` — `true` si se llegó al tope de 5.000 por respuesta. Si pasa,
  conviene pedir en rangos más chicos.
- `ventanaDesde` — el día más viejo que se puede consultar hoy.
- `generado` — cuándo se armó la respuesta.

---

---

## Los camiones en curso

```
GET /api/externo/en-curso
```

Los que **ya pesaron la tara** y todavía no cerraron la regulada: salieron al
lote, o volvieron y falta pesarlos cargados.

No lleva fechas: son los que están esperando **ahora**. Un ticket vive pocos
días en ese estado, así que la lista es corta por naturaleza.

```json
{
  "ok": true,
  "total": 9,
  "generado": "2026-10-15T13:40:12.004Z",
  "camiones": [
    {
      "ticket": "1-1642",
      "fecha": "2026-10-15",
      "balanza": "El Mataco",
      "cargaPara": "SOCIO",
      "socio": "ProvInvest",
      "transporte": "TRANSPORTE GSPONER DIEGO",
      "patentes": "AB897JP AE432YL",
      "chofer": "VERON CARLOS",
      "campo": "El 44 - ARBOL BLANCO - SE",
      "grano": "MAIZ",
      "lotes": ["Lote 2 El 44"],
      "tara": 15620,
      "brutoEstimado": 45000,
      "netoEstimado": 29380,
      "fechaTaraFinal": "2026-10-15",
      "venceEl": "2026-10-20",
      "vencido": false
    }
  ]
}
```

### ⚠️ Acá no hay ningún campo que se llame `neto`, y es a propósito

En `/camiones` el `neto` está **pesado**: el camión se subió cargado a la
balanza. Acá no. Lo único pesado es la **`tara`**; el `brutoEstimado` y el
`netoEstimado` son **supuestos**, y el camión todavía no volvió.

Si el campo se llamara igual en los dos lados, un tablero que sume las dos
listas estaría sumando kilos reales con kilos inventados **y nadie lo
notaría**. Con nombres distintos, esa suma no se puede hacer sin darse cuenta.

**Para un total de lo cargado, usar solo `/camiones`.** Esta lista sirve para
mostrar qué está en movimiento, no para sumar kilos.

| Campo | Qué es |
| --- | --- |
| `tara` | **Pesada.** El camión vacío sobre la balanza |
| `brutoEstimado` / `netoEstimado` | **Supuestos.** Lo que se espera que traiga |
| `fechaTaraFinal` | Cuándo pesó la tara, o sea desde cuándo está esperando |
| `venceEl` | Último día en que se le puede registrar la regulada |
| `vencido` | `true` si ese día ya pasó. **Igual aparece en la lista**: que se haya pasado el plazo es justamente lo que hay que ver |

Tampoco traen `ctg`, `bruto`, `brutoLote` ni `silobolsas`: son datos que
todavía no existen.

---

## Errores

| Código | Qué pasó |
| --- | --- |
| `401` | Falta el token o está mal |
| `404` | La dirección no existe |
| `429` | Más de 60 pedidos por minuto. Esperar un minuto |
| `500` | Error del servidor |

Todos responden JSON con `{ "ok": false, "error": "..." }`, nunca HTML.

---

## Cosas a tener en cuenta

**El `ctg` puede venir vacío.** Hoy lo tipea el balancero en la app después de
emitir la carta. Si el programa de cartas de porte pasa a ser el que lo emite,
ese campo va a estar vacío casi siempre: es el dato que ustedes generan, no uno
que nosotros tengamos antes.

**Los kg de cada tractor suman el neto, y no hay un reparto por contratista.**
Cuando un viaje se carga de varios contratistas, el reparto se guarda **por
tractor** porque es lo que el balancero ve descargar. Lo que puso cada
contratista es la suma de sus tractores, y cada entrada trae el suyo en
`contratista`. No viene calculado a propósito: sería el mismo dato en dos
lugares que pueden contradecirse. Con un solo tractor la lista igual viene, con
ese tractor llevándose todo el neto.

**Un ticket puede cambiar después.** Se puede corregir dentro de su plazo, y
también anularse. Un ticket anulado **deja de aparecer** en la lista. Si del
otro lado se guarda una copia, conviene volver a pedir el rango cada tanto y no
asumir que lo bajado una vez es definitivo.

**Los nombres de los campos de esta API son estables.** Adentro del sistema
algunos se llaman distinto —el `ctg` es `cp`, por ejemplo—; esa traducción es a
propósito, para poder cambiar cosas adentro sin romper esta integración.

**No hay CORS.** Está pensada para que la llame un servidor, no el navegador. Si
hiciera falta llamarla desde una página web, hay que pedirlo y se habilita el
dominio concreto.

---

## Ejemplo

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://pesada-balanza-backend-1.onrender.com/api/externo/camiones?desde=2026-10-01"
```

```js
const res = await fetch(
  'https://pesada-balanza-backend-1.onrender.com/api/externo/camiones',
  { headers: { Authorization: 'Bearer ' + process.env.TOKEN_BALANZA } }
);
const { camiones } = await res.json();
```

---

## Para quien administra el sistema

La API está **apagada** mientras no exista la variable de entorno
`API_EXTERNA_TOKEN`: sin ella la dirección no existe y responde `404`.

Se enciende en **Render → el servicio → Environment → Environment Variables**
(el mismo lugar donde está `MONGODB_URI`), agregando:

```
API_EXTERNA_TOKEN = <un token largo y al azar>
```

Para generarlo, cualquiera de estas sirve:

```bash
openssl rand -hex 32
```
```powershell
-join ((1..64) | ForEach-Object { '0123456789abcdef'[(Get-Random -Max 16)] })
```

**Mínimo 32 caracteres** (el código exige 24 y no arranca con menos: es
preferible que no ande y se note, a que ande con un token adivinable).

Para **cortar el acceso**, se borra la variable: la dirección desaparece. Para
**cambiar el token**, se reemplaza el valor; el programa del otro lado deja de
entrar hasta que se le pase el nuevo.

El token **no está en el código** y no puede estarlo: este repositorio es
público.
