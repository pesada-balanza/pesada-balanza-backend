# Documentación del proyecto de combustible

Material de arranque del registro de carga y despacho de combustible. **Todavía no hay código**:
esto es la etapa de definiciones.

> **Estos archivos viven acá de forma provisoria.** El proyecto de combustible va a tener su
> propio repositorio (`pesada-combustible-backend`), y cuando exista hay que mover esta carpeta
> ahí. Están en el repositorio de balanza sólo porque es donde se hizo el análisis, en una rama
> de trabajo que no toca `main` ni afecta nada de lo que está andando.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `DECISIONES.md` | **Empezar por acá.** Lo que ya está decidido, lo que sigue abierto, y por qué. Consolida las tres fuentes y resuelve las contradicciones entre ellas |
| `calculo_de_volumen_tanque.xlsx` | Medidas y tablas de aforo de los tanques, con la hoja **`PLANILLA MAESTRA`** agregada: la lista única de depósitos que va a leer el sistema. Las celdas amarillas son las que faltan completar |
| `registro_despacho_combustible.docx` | Transcripción de las notas manuscritas. **Es la fuente de verdad del negocio** |
| `guia-alta-de-cuentas.html` | Guía paso a paso para crear el repositorio, la base, el servicio y los avisos **sin afectar la balanza**. Escrita para seguir sin saber programar |
| `informe-medicion-gasoil.html` | Informe técnico: precisión de la varilla tanque por tanque, efecto de la temperatura, qué sensores y caudalímetros valen la pena, cada cuánto medir, y en qué orden invertir |
| `scripts-planilla-maestra.py` | Genera la hoja `PLANILLA MAESTRA` del Excel. Para poder regenerarla si cambian los datos |
| `scripts-inyectar-valores.py` | Escribe el valor calculado de cada fórmula en el Excel. Necesario porque el entorno donde se generó no podía ejecutar LibreOffice para recalcular |

Los dos `.html` se leen abriéndolos en cualquier navegador.

## Lo más importante de todo el material

1. **El sistema no bloquea el despacho por falta de saldo.** El saldo se calcula sumando
   movimientos, puede quedar negativo, y el negativo se registra y se marca.
2. **El problema de medición no es que falte un sensor: es la varilla y el contador roto del
   surtidor.** Cambiar las varillas de 5 cm por varillas de 1 cm mejora más que el sensor
   electrónico más vendido del rubro, y cuesta el precio de una regla.
3. **Repositorio, base de datos y servicio separados** de los de balanza, con usuario de base
   acotado. Un error en combustible no puede llegar a los tickets de pesaje.
4. **El único punto donde se toca algo que ya funciona** es el worker de WhatsApp, que va a leer
   las dos bases con el mismo número. Lleva respaldo antes y prueba después.

## Antes de escribir la primera línea de código

Falta cerrar, en orden de cuánto cambian el diseño:

1. La **lista de labores** — cada despacho se imputa a una labor obligatoriamente.
2. Si el **tope de 1.000 litros** se elimina o se conserva como advertencia anti-tipeo.
3. Los **destinatarios** del reporte diario, por correo y por WhatsApp.
4. Si los dos tanques de **EL C1** son fijos o cisternas móviles.
5. Si **EL MATACO** y **LA JUANITA** tienen depósito (tienen código de balanza, no aparecen en el Excel).
6. **Medir el tanque de 60 mil de LA PRADERA** y **listar las cisternas**.
7. Qué depósito **tiene contador** y si funciona.
8. El **despachante** de cada depósito y los **códigos definitivos**.

El detalle de cada punto está en `DECISIONES.md`, sección 7.
