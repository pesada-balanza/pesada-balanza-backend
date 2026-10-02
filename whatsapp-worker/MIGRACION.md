# Mudar todo esto a otra PC

Hay **tres programas independientes** que hay que migrar por separado:

| Programa | Carpeta | Qué manda | Cómo | Panel |
|---|---|---|---|---|
| Worker de balanza | `C:\whatsapp-worker` | Reporte de balanza, 19:00 | WhatsApp | 3100 |
| Enviador de proyección | `C:\whatsapp-worker\proyeccion` | Flujo de Fondos, 09:00 y 17:30 | WhatsApp | 3200 |
| Reporte AGDP | `...\reporte_agdp_v2` | Reporte AGDP, 07:00 y 19:00 | **Email** | — |

Los dos primeros son **Node.js**; el tercero es **Python** y no tiene nada que
ver con WhatsApp. Los pasos 1 a 11 de abajo son para los dos primeros; el AGDP
tiene su propia sección al final.

> **Copiar la carpeta NO alcanza.** Hay cuatro cosas que viven fuera de ella y
> hay que rehacer en la PC nueva. Es la causa de que "no funcione" después de
> copiar y ejecutar `iniciar.bat`.

---

## Lo que NO viaja con la carpeta

1. **Node.js** — es un programa instalado en Windows.
2. **El Chrome de Puppeteer** — se guarda en `C:\Users\<usuario>\.cache\puppeteer\`,
   no en `node_modules`. Sin él no arranca nada.
3. **Las tareas programadas** — viven en el Programador de tareas de Windows.
4. **El permiso de IP en MongoDB Atlas** — la PC nueva tiene otra IP pública.

Y hay dos que *viajan* pero **no sirven** en otra máquina: las sesiones de
WhatsApp (`.wwebjs_auth`) y la de Google (`.perfil-chrome`). Hay que rehacerlas.

---

## Pasos, en orden

### 1. Node.js

Instalar la versión **LTS** desde https://nodejs.org. Verificar:

```bat
node -v
```

Tiene que decir v20 o superior.

### 2. Copiar la carpeta

`C:\whatsapp-worker` completa, a la **misma ruta** en la PC nueva. La ruta
importa: las tareas programadas y algunos comandos la tienen escrita.

### 3. Reinstalar dependencias (esto baja el Chrome)

```bat
cd /d C:\whatsapp-worker
rmdir /s /q node_modules
npm install
```

Tarda varios minutos: reconstruye los módulos **y descarga el Chrome** que
Puppeteer necesita. Este paso es el que falta cuando "copié la carpeta y no
anda".

### 4. Revisar el `.env`

Tiene que existir `C:\whatsapp-worker\.env` con `MONGODB_URI`. Si no viajó
(a veces las copias saltean archivos que empiezan con punto), copialo a mano
desde la PC vieja o sacá la cadena de Render → Environment.

### 5. Habilitar la IP nueva en MongoDB Atlas

**Sin esto el worker de balanza no arranca**: muere con *"No se pudo conectar a
la base de datos"*. En Atlas → Network Access → agregar la IP pública de la PC
nueva (o `0.0.0.0/0` si así está configurado hoy).

El enviador de proyección no usa Mongo, así que no le afecta.

### 6. Re-vincular WhatsApp (dos veces)

Las sesiones copiadas no sirven en otra máquina. Borrar las dos y escanear de
nuevo, **con la misma línea de la empresa**:

```bat
rmdir /s /q "C:\whatsapp-worker\.wwebjs_auth"
rmdir /s /q "C:\whatsapp-worker\proyeccion\.wwebjs_auth"
```

Después arrancar cada programa y escanear su QR (aparece en la terminal y en el
panel):

```bat
C:\whatsapp-worker\iniciar.bat              → QR del worker de balanza
C:\whatsapp-worker\proyeccion\iniciar.bat   → QR del enviador
```

Son **dos dispositivos vinculados distintos** sobre la misma línea. WhatsApp
admite 4 en total: conviene entrar al celular (WhatsApp → Dispositivos
vinculados) y **cerrar los de la PC vieja**, para no quedarse sin lugar.

### 7. Re-loguear Google

```bat
cd /d C:\whatsapp-worker\proyeccion
rmdir /s /q .perfil-chrome
node sonda.js --login
```

Iniciar sesión con **tableros@amh.com.ar**, abrir el Flujo de Fondos, cerrar la
ventana. Verificar:

```bat
node sonda.js --mirar
```

Tiene que decir `La sesión funciona, la app cargó`.

### 8. Recrear las tareas programadas

Dos tareas, una por programa. En el Programador (`taskschd.msc`), **Crear
tarea…** (no la básica):

| | Worker de balanza | Enviador de proyección |
|---|---|---|
| Nombre | `Worker WhatsApp` | `Flujo de Fondos WhatsApp` |
| Programa | `C:\whatsapp-worker\iniciar.bat` | `C:\whatsapp-worker\proyeccion\iniciar.bat` |
| Iniciar en | `C:\whatsapp-worker` | `C:\whatsapp-worker\proyeccion` |

En las dos, igual:

- **General** → "Ejecutar sólo cuando el usuario haya iniciado sesión"
- **Desencadenadores** → dos: "Al iniciar sesión" **y** "Diariamente 07:30"
- **Configuración** → tildar *"Ejecutar tarea lo antes posible si no hubo inicio
  programado"*; **destildar** *"Detener la tarea si se ejecuta durante más de 3
  días"*; "Si ya está en ejecución" → **No iniciar una instancia nueva**
- **Condiciones** → destildar *"sólo si está inactivo"* y *"sólo con corriente
  alterna"*

> El segundo desencadenador diario no es opcional: si la PC se suspende en vez
> de apagarse, "al iniciar sesión" no se dispara nunca.

> Y destildar lo de los 3 días tampoco: si queda, Windows mata el proceso al
> tercer día y deja de enviar sin que nadie se entere.

### 9. Apagado y encendido automáticos

Si la PC vieja se apagaba y encendía sola, hay que rehacerlo:

- **Apagado**: tarea diaria a las 23:00 → programa `shutdown`, argumentos
  `/s /f /t 0`. (Ojo con escribir bien `shutdown`.)
- **Encendido**: **no es una tarea de Windows** — se configura en el BIOS/UEFI,
  con la opción *Wake on RTC Alarm* o similar.

### 10. Verificar

En la PC nueva, con los dos programas corriendo:

- `http://localhost:3100` → worker de balanza: **Conectado y listo**
- `http://localhost:3200` → enviador: **Conectado y listo**, y en el arranque
  la línea `WhatsApp Web 2.3000.1047412487-alpha` (la versión fijada)
- En el panel 3200: **"Verificar la sesión de Google"** → verde
- En el panel 3200: **"Mandar mensaje de prueba al destino"** → tiene que
  aparecer `[Envío] ...@g.us: OK` en la terminal

Recién cuando esos cuatro den bien, apagá los programas en la PC vieja.

### 11. Apagar la PC vieja

**Importante**: no dejes las dos PCs corriendo a la vez. Se pelean por la sesión
de WhatsApp y los reportes se duplican o se cortan.

---

---

# Reporte AGDP (el de Python, por email)

Programa aparte, sin relación con WhatsApp. Abre Chrome con Selenium, entra a
AGDP, arma un Excel y lo **manda por email**. Corre a las **07:00 y 19:00**.

En la PC vieja vive en `C:\Users\Consulta1\Downloads\reporte_agdp_v2`.

**La buena noticia:** no tiene ninguna ruta absoluta escrita adentro. Los `.bat`
usan `%~dp0` ("la carpeta donde estoy"), así que funciona desde donde lo pongas.
Migrarlo es copiar la carpeta y correr dos archivos.

## Pasos

### 1. Instalar Python

Descargar de https://www.python.org/downloads/ e instalar.

⚠️ Durante la instalación, **tildar "Add Python to PATH"** en la primera
pantalla. Si no se tilda, los `.bat` no lo encuentran y todo falla.

Verificar en una **cmd nueva**:

```bat
python --version
```

### 2. Copiar la carpeta completa

`reporte_agdp_v2` entera, con todos los `.xlsx` de adentro — el script los lee,
no son de adorno.

Conviene sacarla de `Descargas` y ponerla en algo estable, por ejemplo
`C:\reporte-agdp`. Da igual la ruta: como todo es relativo, anda donde esté.

No hace falta copiar `__pycache__` ni los archivos que empiezan con `.~lock`.

### 3. Instalar las librerías

Doble clic en **`1_instalar_requisitos.bat`**. Instala selenium, openpyxl,
pandas, xlrd y webdriver-manager.

### 4. Probar

Doble clic en **`2_ejecutar_ahora.bat`**. Se abre Chrome solo, entra a AGDP y
manda el email. Si falla, el error queda en la ventana negra.

### 5. Programar las DOS tareas

Click derecho en **`3_programar_tarea_diaria.bat`** → **Ejecutar como
administrador**. Eso crea la tarea de las **07:00**.

⚠️ Ese `.bat` crea **una sola** tarea. En la PC vieja hay **dos**: `Reporte AGDP
Diario` (07:00) y `Reporte AGDP Tarde` (19:00). La de las 19:00 hay que crearla
a mano en el Programador, copiando la de las 07:00 y cambiándole la hora.

## Notas

- **La contraseña de email viaja adentro de `reporte_agdp.py`** (es una
  contraseña de aplicación de Google de `tableros@amh.com.ar`). No hay que
  regenerarla al mudar, pero tampoco conviene dejar la carpeta en lugares
  compartidos o sincronizados sin pensarlo.
- Los destinatarios se editan dentro del mismo `.py`, en `email_destinos`.
- Si la PC está apagada a las 07:00, ese envío se pierde: se puede correr a mano
  con `2_ejecutar_ahora.bat`.

---

## Si algo no arranca

| Síntoma | Causa casi segura |
|---|---|
| `'node' no se reconoce...` | Falta el paso 1 |
| Error al abrir el navegador / Chrome no arranca | Falta el paso 3 (`npm install`) |
| `No se pudo conectar a la base de datos` | Falta el paso 5 (IP en Atlas) |
| Pide QR al arrancar | Normal en la PC nueva: es el paso 6 |
| `La sesión venció: Google pide login` | Falta el paso 7 |
| Anda a mano pero no solo | Falta el paso 8 |

El resto de los problemas conocidos está en
[proyeccion/README.md](proyeccion/README.md).
