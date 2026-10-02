/* =====================================================================
 * SONDA — Flujo de Fondos (proyección financiera)
 * =====================================================================
 * Primer paso, exploratorio. NO manda nada por WhatsApp y NO toca worker.js.
 * Solo entra a la página del script de Google, genera la proyección y
 * guarda el PDF en ./salida para que lo mires.
 *
 * Aprovecha el puppeteer que ya está instalado en la carpeta de arriba
 * (node_modules de C:\whatsapp-worker), así que no hace falta npm install.
 *
 * ── CÓMO SE USA (en este orden) ───────────────────────────────────────
 *
 *   node sonda.js --login
 *       Abre un Chrome visible con un perfil DEDICADO (carpeta
 *       .perfil-chrome de acá adentro, separada de tu Chrome personal).
 *       Iniciá sesión a mano con tableros@amh.com.ar y dejá abierta la
 *       página del Flujo de Fondos. Cerrá la ventana cuando termines.
 *       Esto se hace UNA sola vez; la sesión queda guardada en el perfil.
 *
 *   node sonda.js --mirar
 *       Entra con esa sesión y cuenta qué encontró: si la sesión sigue
 *       viva, qué botones hay, cómo está armada la página. Deja una
 *       captura en ./salida. Sirve para confirmar que todo está en su
 *       lugar antes de tocar nada.
 *
 *   node sonda.js --generar
 *       El ciclo completo: click en "Generar proyección", espera a que la
 *       tabla tenga datos DE VERDAD, click en "Exportar PDF" con el
 *       diálogo de impresión anulado, y guarda el PDF en ./salida.
 *
 * Variable de entorno útil:
 *   VER=1   →  muestra el navegador en vez de correr oculto
 *              (ej: VER=1 node sonda.js --generar)
 * ===================================================================== */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL_APP = 'https://script.google.com/a/macros/amh.com.ar/s/AKfycbzS6TAElqISXDeXC3toqj7JRv-oLPSRf14Qiy_R7BcWZiU8GlYxAZh1uboxRdNsjBWQ/exec';

const PERFIL  = path.join(__dirname, '.perfil-chrome');
const SALIDA  = path.join(__dirname, 'salida');
const VISIBLE = process.env.VER === '1';

// Cuánto se espera, como mucho, a que la proyección termine de cargar.
// Generosos a propósito: el cálculo de 64 días puede tardar varios minutos
// según cómo ande Google ese día.
const ESPERA_DATOS_MS = 6 * 60 * 1000;

// Tope para hablar con Chrome. Mientras la página calcula, su hilo de
// JavaScript queda bloqueado y no puede contestar; el default de 3 minutos
// se queda corto y aborta todo con "Runtime.callFunctionOn timed out".
const PROTOCOL_TIMEOUT_MS = 10 * 60 * 1000;

// Cuántas filas NUEVAS tienen que aparecer para dar la proyección por cargada.
// La pantalla arranca con 9 (las tablas de saldos) y llena unas 94 en total,
// así que 80 deja margen sin confundirse con "no cargó nada".
// Se puede ajustar sin tocar el código:  set MIN_FILAS=60
const MIN_FILAS_NUEVAS = parseInt(process.env.MIN_FILAS || '80', 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Le pone un tope a una promesa. Se usa para las consultas a la página:
 * si está ocupada calculando, la consulta se abandona y se reintenta,
 * en vez de quedar colgada.
 */
function conTimeout(promesa, ms, etiqueta) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`timeout de ${etiqueta} (${ms} ms)`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
}
const sello = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function asegurarCarpetas() {
  for (const d of [PERFIL, SALIDA]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/* ---------------------------------------------
 * PASO 1 — Iniciar sesión a mano (una sola vez)
 * -------------------------------------------*/
async function login() {
  asegurarCarpetas();
  console.log('\nSe abre un Chrome con el perfil dedicado (carpeta .perfil-chrome).');
  console.log('Iniciá sesión con tableros@amh.com.ar y abrí el Flujo de Fondos.');
  console.log('Cuando la página cargue bien, CERRÁ la ventana. La sesión queda guardada.\n');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: PERFIL,
    defaultViewport: null,
    args: ['--start-maximized'],
  });
  // Igual que en abrir(): dejar UNA sola pestaña, si no se van acumulando
  // en cada corrida y terminan compitiendo por el mismo hilo.
  const paginas = await browser.pages();
  const page = paginas[0] || await browser.newPage();
  for (const p of paginas.slice(1)) { try { await p.close(); } catch (_) {} }

  await page.bringToFront();
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });

  // Queda abierto hasta que lo cierres a mano.
  await new Promise(resolve => browser.on('disconnected', resolve));
  console.log('Listo. Ahora probá:  node sonda.js --mirar');
}

/* ---------------------------------------------
 * Utilidades comunes a --mirar y --generar
 * -------------------------------------------*/

/** Abre el navegador con la sesión ya guardada. */
async function abrir({ anularImpresion = false } = {}) {
  asegurarCarpetas();
  if (!fs.existsSync(path.join(PERFIL, 'Default'))) {
    throw new Error('No hay sesión guardada todavía. Corré primero: node sonda.js --login');
  }

  const browser = await puppeteer.launch({
    // page.pdf() necesita modo oculto; con VER=1 se ve, pero entonces no
    // se puede generar el PDF (Chrome no expone printToPDF con ventana).
    headless: !VISIBLE,
    userDataDir: PERFIL,
    protocolTimeout: PROTOCOL_TIMEOUT_MS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Chrome restaura las pestañas de la sesión anterior, así que cada corrida
  // dejaba una más. Se cierran todas menos una: varias copias de esta app son
  // del mismo origen, comparten UN hilo de JavaScript y se ahogan entre sí
  // (de ahí los "Runtime.callFunctionOn timed out").
  const paginas = await browser.pages();
  const page = paginas[0] || await browser.newPage();
  for (const p of paginas.slice(1)) { try { await p.close(); } catch (_) {} }
  if (paginas.length > 1) console.log(`  · Cerré ${paginas.length - 1} pestaña(s) que habían quedado abiertas.`);

  await page.setViewport({ width: 1400, height: 1000 });

  if (anularImpresion) {
    // Se anula ANTES de cargar nada, y aplica también a los iframes.
    // La app llama a window.print() al exportar: con esto no se abre el
    // diálogo, pero igual hace toda su preparación del contenido.
    await page.evaluateOnNewDocument(() => {
      window.__seLlamoPrint = false;
      window.print = () => { window.__seLlamoPrint = true; };
    });
  }

  return { browser, page };
}

/**
 * La app vive dentro de un iframe sandbox de Apps Script
 * (googleusercontent.com/userCodeAppPanel). Devuelve ese frame.
 */
async function frameDeLaApp(page, intentos = 30) {
  for (let i = 0; i < intentos; i++) {
    const f = page.frames().find(fr => /userCodeAppPanel|googleusercontent/.test(fr.url()));
    if (f) return f;
    await sleep(1000);
  }
  throw new Error('No apareció el iframe de la app (¿la sesión venció y quedó en el login de Google?)');
}

/** Texto comparable: sin acentos, sin espacios de más, en minúsculas. */
function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Se busca en TODOS los frames (la app de Apps Script anida varios) y se
// espera a que el botón aparezca: al cargar, la página tarda en dibujarlo.
const SELECTOR_BOTONES = 'button, input[type=button], input[type=submit], a, div[role=button], span[role=button], [onclick]';

/**
 * Busca un botón por su texto en cualquier frame, reintentando hasta
 * `timeoutMs`. Devuelve {el, frame} o null.
 */
async function buscarBoton(page, texto, timeoutMs = 45000) {
  const objetivo = normalizar(texto);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const fr of page.frames()) {
      try {
        const handle = await fr.evaluateHandle((obj, sel) => {
          const norm = (s) => String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\s+/g, ' ').trim().toLowerCase();
          const els = [...document.querySelectorAll(sel)];
          return els.find(el => norm(el.innerText || el.value || el.textContent).includes(obj)) || null;
        }, objetivo, SELECTOR_BOTONES);
        const el = handle.asElement();
        if (el) return { el, frame: fr };
        await handle.dispose();
      } catch (_) { /* frame que se recargó justo; se reintenta */ }
    }
    await sleep(1000);
  }
  return null;
}

/**
 * Lista todo lo clickeable de todos los frames. Es el diagnóstico para
 * cuando algo no aparece: dice qué SÍ hay, en vez de sólo qué falta.
 */
async function resumenFrames(page) {
  const out = [];
  for (const fr of page.frames()) {
    try {
      const d = await fr.evaluate((sel) => ({
        botones: [...document.querySelectorAll(sel)]
          .map(el => (el.innerText || el.value || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean).slice(0, 25),
        inputs: [...document.querySelectorAll('input:not([type=button]):not([type=submit])')]
          .map(el => `id="${el.id || ''}" name="${el.name || ''}" valor="${el.value || ''}"`).slice(0, 20),
        filas: [...document.querySelectorAll('table tr')].filter(tr => tr.querySelectorAll('td').length > 0).length,
        texto: (document.body ? document.body.innerText : '').replace(/\n{2,}/g, '\n').slice(0, 400),
      }), SELECTOR_BOTONES);
      out.push({ url: fr.url(), ...d });
    } catch (_) { /* frame inaccesible */ }
  }
  return out;
}

/** Imprime el resumen de frames de forma legible. */
function mostrarFrames(frames) {
  frames.forEach((f, i) => {
    const vacio = !f.botones.length && !f.inputs.length && !f.texto.trim();
    if (vacio) return;   // frames técnicos, no aportan
    console.log(`\n── Frame ${i} ──`);
    console.log(`   ${f.url.slice(0, 100)}`);
    if (f.botones.length) console.log(`   Clickeables (${f.botones.length}): ${f.botones.map(b => `"${b}"`).join(', ')}`);
    if (f.inputs.length)  console.log(`   Campos:\n     ${f.inputs.join('\n     ')}`);
    console.log(`   Filas de datos en tablas: ${f.filas}`);
    if (f.texto.trim()) console.log(`   Texto:\n     ${f.texto.split('\n').slice(0, 12).join('\n     ')}`);
  });
}

/**
 * Clickea un botón por su texto DESDE ADENTRO de la página.
 *
 * No se usa elementHandle.click() de Puppeteer porque antes de clickear
 * verifica visibilidad y hace scroll, y en esta app esa verificación se
 * cuelga ("Runtime.callFunctionOn timed out") aunque la página conteste
 * bien a todo lo demás. Un click del DOM no verifica nada y vuelve al toque.
 */
async function clickPorTexto(frame, texto) {
  return frame.evaluate((obj, sel) => {
    const norm = (s) => String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const el = [...document.querySelectorAll(sel)]
      .find(e => norm(e.innerText || e.value || e.textContent).includes(obj));
    if (!el) return false;
    el.click();
    return true;
  }, normalizar(texto), SELECTOR_BOTONES);
}

/** Cuenta las filas con datos (las que tienen celdas <td>) de un frame. */
function contarFilas(frame) {
  return frame.evaluate(() => [...document.querySelectorAll('table tr')]
    .filter(tr => tr.querySelectorAll('td').length > 0).length);
}

/**
 * Engancha los avisos de error de la página. Sin esto, una falla del lado
 * de Apps Script es invisible: la pantalla queda igual y nunca sabemos por qué.
 */
function escucharErrores(page) {
  page.on('pageerror', (e) => console.log(`  [error de la página] ${e.message}`.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      console.log(`  [consola:${m.type()}] ${m.text()}`.slice(0, 200));
    }
  });
  page.on('requestfailed', (r) => {
    const f = r.failure();
    console.log(`  [request fallida] ${f ? f.errorText : '?'} — ${r.url().slice(0, 90)}`);
  });
}

/** Guarda captura + texto visible, para saber qué había en pantalla al fallar. */
async function volcarPantalla(page, frame, etiqueta) {
  try {
    const captura = path.join(SALIDA, `${etiqueta}_${sello()}.png`);
    await page.screenshot({ path: captura, fullPage: true });
    console.log(`   Captura: ${captura}`);
  } catch (_) {}
  try {
    const txt = await conTimeout(
      frame.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 800)),
      10000, 'el volcado');
    console.log(`   ── Lo que se ve en pantalla ──\n     ${txt.split('\n').filter(Boolean).slice(0, 20).join('\n     ')}`);
  } catch (_) {
    console.log('   (la página no contestó ni para leer el texto)');
  }
}

/**
 * Lee el nombre de la empresa que la pantalla está mostrando: es la línea
 * justo encima de "PROYECCION FINANCIERA DIARIA...".
 *
 * Sirve de verificación: las dos empresas tienen tablas con la MISMA
 * cantidad de filas y el mismo alto, así que por los números no hay forma
 * de saber si el cambio de solapa funcionó. Por el nombre, sí.
 */
function tituloEmpresa(frame) {
  return frame.evaluate(() => {
    const txt = document.body ? document.body.innerText : '';
    const lineas = txt.split('\n').map(s => s.trim()).filter(Boolean);
    const i = lineas.findIndex(l => /PROYECCION\s+FINANCIERA/i.test(l));
    return i > 0 ? lineas[i - 1] : '';
  });
}

/** ¿Estamos en el login de Google en vez de en la app? */
async function pideLogin(page) {
  const u = page.url();
  return /accounts\.google\.com/.test(u);
}

/* ---------------------------------------------
 * PASO 2 — Mirar qué hay (sin tocar nada)
 * -------------------------------------------*/
async function mirar() {
  const { browser, page } = await abrir();
  try {
    await page.goto(URL_APP, { waitUntil: 'networkidle2', timeout: 60000 });

    if (await pideLogin(page)) {
      console.error('\n❌ La sesión NO sirve: Google está pidiendo login.');
      console.error('   Volvé a correr:  node sonda.js --login\n');
      return;
    }
    console.log('✅ La sesión funciona, la app cargó.');

    // Se espera al botón principal: es la señal de que la app terminó de dibujarse.
    const hallado = await buscarBoton(page, 'Generar proyección', 45000);
    console.log(hallado
      ? `✅ Encontré el botón "Generar proyección" en:\n   ${hallado.frame.url().slice(0, 100)}`
      : '⚠️  NO encontré el botón "Generar proyección". Abajo va todo lo que sí hay.');

    console.log(`\nFrames en la página: ${page.frames().length}`);
    mostrarFrames(await resumenFrames(page));

    const captura = path.join(SALIDA, `mirar_${sello()}.png`);
    await page.screenshot({ path: captura, fullPage: true });
    console.log(`   Captura guardada en: ${captura}`);
  } finally {
    await browser.close();
  }
}

/* ---------------------------------------------
 * PASO 3 — Generar las proyecciones y guardar los PDF
 * -------------------------------------------*/

// Las dos empresas. La primera es la solapa que abre por defecto, así que
// no hay que clickear nada para ella.
const EMPRESAS = [
  { nombre: 'AMH',            solapa: null },
  { nombre: 'Agroindustrial', solapa: 'Agroindustrial' },
];

/**
 * Ciclo completo para UNA empresa. Devuelve la ruta del PDF generado.
 *
 * Se recarga la página antes de cada empresa a propósito: así cada una
 * arranca de cero y las filas de la anterior no quedan en el DOM haciendo
 * ruido en el conteo (que es el guarda que evita PDFs vacíos).
 */
async function generarUna(page, empresa, marca) {
  console.log(`\n═══ ${empresa.nombre} ═══`);
  await page.setViewport({ width: 1500, height: 1000 });
  await page.goto(URL_APP, { waitUntil: 'networkidle2', timeout: 60000 });
  if (await pideLogin(page)) throw new Error('La sesión venció: Google pide login. Corré node sonda.js --login');

  console.log('▸ Buscando el botón "Generar proyección"...');
  const generarBtn = await buscarBoton(page, 'Generar proyección', 60000);
  if (!generarBtn) {
    console.error('\n❌ No apareció el botón. Esto es lo que hay en la página:');
    mostrarFrames(await resumenFrames(page));
    await page.screenshot({ path: path.join(SALIDA, `fallo_${empresa.nombre}_${marca}.png`), fullPage: true });
    throw new Error('No se encontró "Generar proyección" (ver la captura en salida/)');
  }
  const frame = generarBtn.frame;

  // La solapa se cambia ANTES de generar: los botones son compartidos y
  // actúan sobre la empresa que esté activa.
  if (empresa.solapa) {
    console.log(`▸ Cambiando a la solapa "${empresa.solapa}"...`);
    const ok = await conTimeout(clickPorTexto(frame, empresa.solapa), 20000, 'el click de solapa');
    if (!ok) throw new Error(`No encontré la solapa "${empresa.solapa}"`);
    await sleep(4000);
  }

  // De qué empresa son los datos que estamos por generar. Se anota acá y se
  // compara al final: si las dos proyecciones salen con el mismo nombre, es
  // que la solapa no cambió y estaríamos mandando los números de una con el
  // rótulo de la otra.
  const titulo = await conTimeout(tituloEmpresa(frame), 15000, 'el título').catch(() => '');
  console.log(`  · Empresa en pantalla: "${titulo || '(no se pudo leer)'}"`);

    // Cuántas filas hay ANTES de generar. Las tablas de saldos ya traen
    // varias (9 en AMH), así que un umbral fijo bajo no distingue "no cargó
    // nada" de "ya está listo". Se compara contra esta base.
    const base = await conTimeout(contarFilas(frame), 15000, 'la medición inicial').catch(() => 0);
    const OBJETIVO = base + MIN_FILAS_NUEVAS;
    console.log(`  · Filas antes de generar: ${base} — para darlo por cargado hay que llegar a ${OBJETIVO}`);

    console.log('▸ Click en "Generar proyección"...');
    const clickeado = await conTimeout(clickPorTexto(frame, 'Generar proyección'), 20000, 'el click')
      .catch((e) => { console.log(`  · El click no contestó: ${e.message}`); return null; });
    if (clickeado === false) throw new Error('El botón desapareció justo antes de clickearlo.');
    if (clickeado === true) console.log('  ✓ Click disparado.');

    // ── Esperar DATOS DE VERDAD ──
    // Nada de sleep fijo: se espera a que el cartel de "Presioná Generar
    // proyección" desaparezca Y la tabla tenga filas. Es el guarda que evita
    // exportar un PDF vacío.
    console.log(`▸ Esperando a que carguen los datos (hasta ${Math.round(ESPERA_DATOS_MS / 60000)} minutos)...`);
    const t0 = Date.now();
    let filas = 0;
    let ultimoAviso = 0;
    while (Date.now() - t0 < ESPERA_DATOS_MS) {
      // Cada consulta lleva su propio tope: mientras la página calcula, su
      // hilo está bloqueado y no puede contestar. En ese caso se abandona la
      // consulta y se reintenta, en vez de quedar colgado.
      const r = await conTimeout(frame.evaluate(() => {
        const txt = document.body.innerText || '';
        const esperando = /Presion[áa]\s+"?Generar proyecci[óo]n/i.test(txt);
        const filasDatos = [...document.querySelectorAll('table tr')]
          .filter(tr => tr.querySelectorAll('td').length > 0).length;
        return { esperando, filasDatos };
      }), 15000, 'la consulta').catch(() => null);

      if (r) {
        filas = r.filasDatos;
        if (!r.esperando && filas >= OBJETIVO) break;
      }

      // Señal de vida cada 20 segundos, para no mirar una pantalla muda.
      const seg = Math.round((Date.now() - t0) / 1000);
      if (seg - ultimoAviso >= 20) {
        ultimoAviso = seg;
        console.log(`  · ${seg}s — ${r ? `${filas} filas (hacen falta ${OBJETIVO})` : 'la página está ocupada, no contesta'}`);
      }
      await sleep(2000);
    }
    if (filas < OBJETIVO) {
      console.error(`\n❌ ${empresa.nombre}: la proyección NO cargó — quedó en ${filas} filas (las mismas ${base} de arranque) tras ${Math.round(ESPERA_DATOS_MS / 60000)} minutos.`);
      console.error('   NO se genera el PDF: saldría con la tabla vacía.');
      await volcarPantalla(page, frame, `fallo_${empresa.nombre}`);
      throw new Error(`${empresa.nombre}: la proyección no cargó datos.`);
    }
    console.log(`  ✓ Datos cargados (${filas} filas, contra ${base} de arranque).`);

    // ── Exportar PDF ──
    // El botón llama a window.print(). Como lo anulamos, no se abre ningún
    // diálogo: la app solo prepara el contenido para imprimir.
    console.log('▸ Click en "Exportar PDF" (diálogo anulado)...');
    try {
      const ok = await conTimeout(clickPorTexto(frame, 'Exportar PDF'), 20000, 'el click de PDF');
      if (!ok) throw new Error('no apareció el botón');
      await sleep(3000);
      const seImprimio = await frame.evaluate(() => window.__seLlamoPrint === true);
      console.log(`  ${seImprimio ? '✓' : '·'} window.print() ${seImprimio ? 'fue interceptado' : 'no se llegó a llamar (puede estar bien igual)'}`);
    } catch (err) {
      console.warn(`  · No se pudo clickear "Exportar PDF" (${err.message}). Se genera igual desde la pantalla.`);
    }

    // ── El PDF, en hojas A4 ──
    //
    // El problema de fondo: la app vive dentro de un iframe con height:100%.
    // Al paginar en A4, Chrome resuelve ese 100% contra el alto de UNA hoja y
    // recorta todo lo demás — por eso el A4 salía cortado.
    //
    // La solución no es pelearle al iframe sino sacarlo del medio: se copia el
    // HTML de la app a una pestaña nueva, donde queda como documento principal.
    // Ahí Chrome pagina como con cualquier página normal, y encima se puede
    // repetir el encabezado de la tabla en cada hoja.
    const destino = path.join(SALIDA, `proyeccion_${empresa.nombre}_${marca}.pdf`);

    // Los saldos, Balanz y Macro Securities son campos <input> que la app
    // llena por JavaScript, escribiendo en la PROPIEDAD .value. Eso no se
    // refleja en el HTML del documento, así que al copiarlo los campos
    // viajaban vacíos: el PDF mostraba el total pero no las sumas que lo
    // componen. Se vuelcan los valores a los atributos para que sobrevivan.
    await frame.evaluate(() => {
      document.querySelectorAll('input').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.checked) el.setAttribute('checked', 'checked');
          else el.removeAttribute('checked');
        } else {
          el.setAttribute('value', el.value == null ? '' : el.value);
        }
      });
      document.querySelectorAll('textarea').forEach(el => { el.textContent = el.value; });
      document.querySelectorAll('select').forEach(sel => {
        Array.from(sel.options).forEach(o => {
          if (o.selected) o.setAttribute('selected', 'selected');
          else o.removeAttribute('selected');
        });
      });
    });

    // <base> para que las rutas relativas (estilos, imágenes) sigan resolviendo
    // contra el servidor original y no contra la pestaña nueva.
    const htmlApp = await frame.content();
    const html = /<head[^>]*>/i.test(htmlApp)
      ? htmlApp.replace(/<head([^>]*)>/i, `<head$1><base href="${frame.url()}">`)
      : `<base href="${frame.url()}">` + htmlApp;

    // Vertical por defecto. Para volver a apaisada:  set APAISADA=1
    const APAISADA = process.env.APAISADA === '1';
    const ORIENTACION = APAISADA ? 'landscape' : 'portrait';
    const ANCHO_HOJA_MM = APAISADA ? 297 : 210;

    const MARGEN_MM = 8;
    const anchoUtil = Math.round((ANCHO_HOJA_MM - 2 * MARGEN_MM) * 96 / 25.4);   // en px

    // Tamaño de letra de la tabla. Regulable sin tocar código:  set FUENTE=13
    // (la app usa 11px; acá se puede subir porque la tabla ya no se achica)
    const FUENTE_PX = parseInt(process.env.FUENTE || '12', 10);

    const CSS_A4 = `
      @page { size: A4 ${ORIENTACION}; margin: ${MARGEN_MM}mm; }
      html, body { height: auto !important; overflow: visible !important;
                   background: #fff !important; }
      * { max-height: none !important; }
      div, section, main { overflow: visible !important; }

      /* Clave para que la letra se lea: en vez de encoger una tabla de 1300px
         hasta que entre, se le pide que se acomode al ancho de la hoja. Así la
         letra queda en su tamaño real en vez de reducida a la mitad. */
      html, body { width: ${anchoUtil}px !important; }
      body > * { max-width: 100% !important; }
      table { width: 100% !important; table-layout: auto !important; }

      /* Relleno mínimo: cada píxel de padding son 8 píxeles de ancho de tabla
         (dos por celda, ocho columnas) que se le restan a la letra. */
      html body td, html body th {
        font-size: ${FUENTE_PX}px !important;
        padding: 1px 3px !important;
      }
      /* Los títulos largos ("POSICION PROYECTADA CAJA / BANCOS (CON PEDIDOS)")
         tienen que poder cortarse en varios renglones. Si se les prohíbe,
         esa columna se estira sola y arrastra a toda la tabla: hay que
         achicar el conjunto para que entre, y termina ilegible. */
      html body th { white-space: normal !important; word-break: break-word !important; }
      /* Los números, en cambio, no se parten nunca. */
      html body td { white-space: nowrap !important; }

      /* El bloque de saldos ocupa el ancho de la hoja, no la mitad. */
      body > * { width: 100% !important; }

      /* El encabezado de la tabla se repite arriba de cada hoja: sin esto,
         a partir de la segunda no se sabe qué columna es cuál. */
      thead { display: table-header-group !important; }
      tr, td, th { break-inside: avoid !important; page-break-inside: avoid !important; }
    `;

    const hoja = await page.browser().newPage();
    let pdf;
    try {
      // La ventana se pone del ancho de la hoja para que el navegador arme el
      // layout directamente a esa medida, en vez de armarlo ancho y encogerlo.
      await hoja.setViewport({ width: anchoUtil, height: 1200 });
      await hoja.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await hoja.addStyleTag({ content: CSS_A4 });

      // Los anchos fijos puestos como atributo (width="...") o como estilo en
      // línea le ganan a cualquier hoja de estilos, por más !important que
      // tenga. Por eso los títulos de columna seguían sin cortarse y la tabla
      // salía enorme. Se sacan del DOM, que es lo único que los vence.
      await hoja.evaluate(() => {
        document.querySelectorAll('[width]').forEach(el => el.removeAttribute('width'));
        document.querySelectorAll('[style]').forEach(el => {
          el.style.removeProperty('width');
          el.style.removeProperty('min-width');
          el.style.removeProperty('white-space');
        });
      });

      // La app deja un pedazo de CSS impreso como texto arriba de todo
      // ("body{font-family:Arial...}"). En pantalla pasa desapercibido, en el
      // PDF queda feo. Aparece también en el export manual; acá se saca.
      await hoja.evaluate(() => {
        const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const sobra = [];
        while (it.nextNode()) {
          if (/^\s*body\s*\{[^{}]*\}\s*$/.test(it.currentNode.textContent)) sobra.push(it.currentNode);
        }
        sobra.forEach(n => n.remove());
      });

      await sleep(2000);

      // Verificación: la copia tiene que traer las mismas filas que la
      // original. Si algo se perdió en el camino, mejor saberlo acá que
      // mandar un PDF incompleto.
      const control = await contarFilas(hoja.mainFrame());
      if (control < OBJETIVO) {
        throw new Error(`la copia quedó con ${control} filas (esperaba ${OBJETIVO})`);
      }

      // Escala para que la tabla entre a lo ancho de la hoja sin recortarse,
      // quedando lo más grande posible.
      const ancho = await hoja.evaluate(() => Math.max(
        document.body ? document.body.scrollWidth : 0,
        document.documentElement ? document.documentElement.scrollWidth : 0));

      // Diagnóstico: si la hoja queda ancha, ¿quién la está estirando?
      // Sin esto sólo se puede adivinar qué CSS aplicar.
      const culpables = await hoja.evaluate((limite) => [...document.querySelectorAll('body *')]
        .map(el => ({
          ancho: Math.round(el.getBoundingClientRect().width),
          que: el.tagName.toLowerCase()
             + (el.id ? '#' + el.id : '')
             + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          texto: (el.tagName === 'TH' || el.tagName === 'TD') ? (el.innerText || '').trim().slice(0, 30) : '',
        }))
        .filter(x => x.ancho > limite)
        .sort((a, b) => b.ancho - a.ancho)
        .slice(0, 6), Math.round(anchoUtil * 0.9));

      if (culpables.length) {
        console.log('    elementos más anchos que la hoja:');
        culpables.forEach(c => console.log(`      ${String(c.ancho).padStart(5)}px  ${c.que}${c.texto ? `  "${c.texto}"` : ''}`));
      }
      // Si aun acomodada la tabla sigue siendo más ancha que la hoja (números
      // muy largos que no se pueden partir), se achica lo justo y necesario.
      const escala = Math.min(1, Math.max(0.3, anchoUtil / Math.max(ancho, 1)));

      // Encabezado y pie, como en el export manual: de qué empresa es, de
      // cuándo son los datos, y numeración. La fecha importa — un flujo de
      // fondos sin fecha visible se puede confundir con el del día anterior.
      const cuando = new Date().toLocaleString('es-AR', { hour12: false });
      const rotulo = (titulo || empresa.nombre).replace(/[<>&]/g, '');
      const estiloHF = 'font-size:8px;color:#555;width:100%;padding:0 8mm;font-family:Arial,sans-serif';

      pdf = await hoja.pdf({
        path: destino,
        // Sin esto rige el límite por defecto de Puppeteer, 30 segundos, y
        // convertir estas 101 filas puede tardar más cuando la PC está
        // cargada (por ejemplo, justo después de generar la otra empresa).
        timeout: 180000,
        format: 'A4',
        landscape: APAISADA,
        printBackground: true,
        scale: Number(escala.toFixed(2)),
        displayHeaderFooter: true,
        headerTemplate: `<div style="${estiloHF};display:flex;justify-content:space-between">
            <span><b>Flujo de Fondos</b> — ${rotulo}</span><span>${cuando}</span></div>`,
        footerTemplate: `<div style="${estiloHF};text-align:center">
            Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
        margin: { top: '12mm', right: `${MARGEN_MM}mm`, bottom: '10mm', left: `${MARGEN_MM}mm` },
      });
      const efectiva = (FUENTE_PX * escala).toFixed(1);
      console.log(`  ✓ A4 ${APAISADA ? 'apaisada' : 'vertical'} · ${control} filas`);
      console.log(`    tabla ${ancho}px en hoja de ${anchoUtil}px · escala ${escala.toFixed(2)} · letra ${FUENTE_PX}px → se ve como ${efectiva}px`);
      if (Number(efectiva) < 8) {
        console.warn(`    ⚠️  ${efectiva}px es chico. Probá:  set APAISADA=1   (o bajá FUENTE)`);
      }
    } finally {
      await hoja.close().catch(() => {});
    }

    const kb = Math.round(pdf.length / 1024);
    console.log(`✅ ${empresa.nombre}: ${destino}  (${kb} KB)`);
    if (kb < 20) console.warn('⚠️  Pesa muy poco: revisalo antes de confiar en él.');

    return { empresa: empresa.nombre, titulo, archivo: destino, kb, filas };
}

/**
 * Hace las dos empresas, una después de la otra, en el mismo navegador.
 * Si una falla, la otra se intenta igual: mejor que llegue una proyección
 * a que no llegue ninguna.
 */
async function generar() {
  if (VISIBLE) {
    console.warn('⚠️  Con VER=1 no se puede generar el PDF (Chrome no lo permite con ventana visible).');
    console.warn('    Sacá VER=1 para el PDF, o usá VER=1 solo con --mirar.\n');
  }

  // Abrir Chrome puede fallar de forma transitoria: "Failed to launch the
  // browser process" con código 3221226505 (0xC0000409). Suele ser el
  // antivirus metiéndose en el arranque, o un pico de carga. Se vio el
  // 2026-09-29 a las 17:25 y un minuto después funcionó sin cambiar nada.
  //
  // El reintento por empresa no cubre esto, porque el navegador se abre una
  // sola vez ANTES de ese bucle. Por eso lleva el suyo propio.
  let browser, page;
  for (let intento = 1; ; intento++) {
    try {
      ({ browser, page } = await abrir({ anularImpresion: true }));
      break;
    } catch (err) {
      const m = (err && err.message ? err.message : String(err)).split('\n')[0];
      if (intento >= 3) {
        throw new Error(`no se pudo abrir el navegador tras 3 intentos: ${m}`);
      }
      console.warn(`⚠️  No se pudo abrir el navegador (intento ${intento} de 3): ${m}`);
      console.warn('   Reintentando en 20 segundos...');
      await sleep(20000);
    }
  }

  const marca = sello();
  const hechos = [];
  const fallados = [];

  try {
    escucharErrores(page);
    for (const empresa of EMPRESAS) {
      // Un segundo intento: los fallos que vimos son transitorios (la
      // conversión a PDF que tarda de más, la página que no responde un
      // momento). Perder el reporte de una empresa por eso no vale la pena.
      let listo = false;
      for (let intento = 1; intento <= 2 && !listo; intento++) {
        try {
          hechos.push(await generarUna(page, empresa, marca));
          listo = true;
        } catch (err) {
          const motivo = err && err.message ? err.message : String(err);
          // Hay fallas que no se arreglan reintentando: si la sesión de
          // Google venció, hace falta que una persona vuelva a loguearse.
          // Reintentar sólo duplica el tiempo perdido.
          const permanente = /sesi[oó]n venci[oó]|pide login/i.test(motivo);
          if (permanente) {
            console.error(`\n❌ ${empresa.nombre}: ${motivo}`);
            console.error('   No se reintenta: esto necesita intervención de una persona.');
            fallados.push({ empresa: empresa.nombre, motivo });
            break;
          }
          if (intento === 1) {
            console.warn(`\n⚠️  ${empresa.nombre} falló: ${motivo}`);
            console.warn('   Reintentando una vez más...');
            await sleep(5000);
          } else {
            console.error(`\n❌ ${empresa.nombre}: ${motivo} (falló las dos veces)`);
            fallados.push({ empresa: empresa.nombre, motivo });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n──────── Resumen ────────');
  hechos.forEach(h => console.log(`  ✅ ${h.empresa}: "${h.titulo}" · ${h.filas} filas · ${h.kb} KB`));
  fallados.forEach(f => console.log(`  ❌ ${f.empresa}: ${f.motivo}`));

  // Las dos empresas tienen que mostrar nombres DISTINTOS. Si coinciden, la
  // solapa no cambió y los dos PDF traen los mismos números con rótulos
  // diferentes — el error más caro que podría cometer esto.
  const titulos = hechos.map(h => h.titulo).filter(Boolean);
  if (titulos.length === 2 && titulos[0] === titulos[1]) {
    console.error(`\n🚨 PROBLEMA: las dos proyecciones dicen "${titulos[0]}".`);
    console.error('   El cambio de solapa NO funcionó: los dos PDF son de la misma empresa.');
    console.error('   NO los uses.');
  }

  if (!hechos.length) throw new Error('No se generó ninguna proyección.');
  console.log(`\n  Los PDF están en: ${SALIDA}`);
  // Se devuelven también los fallos: si una empresa no salió, alguien tiene
  // que enterarse. Media proyección que llega sin aviso es peor que ninguna,
  // porque nadie nota lo que falta.
  return { hechos, fallados };
}

/* ---------------------------------------------
 * CHEQUEO PREVIO — ¿sigue viva la sesión de Google?
 * -------------------------------------------*/
/**
 * Abre la app y verifica que la sesión funcione, SIN generar nada.
 *
 * Se usa un rato antes de cada envío: la sesión de Google vence cada tantas
 * semanas, y avisar 25 minutos antes deja tiempo de correr --login y que el
 * reporte salga igual a horario. Enterarse cuando ya no llegó es tarde.
 *
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 */
async function sesionViva() {
  let browser, page;
  try {
    ({ browser, page } = await abrir());
  } catch (err) {
    return { ok: false, motivo: err && err.message ? err.message : String(err) };
  }
  try {
    await page.goto(URL_APP, { waitUntil: 'networkidle2', timeout: 60000 });
    if (await pideLogin(page)) {
      return { ok: false, motivo: 'la sesión de Google venció (pide login)' };
    }
    const btn = await buscarBoton(page, 'Generar proyección', 45000);
    if (!btn) {
      return { ok: false, motivo: 'la página cargó pero no apareció el botón "Generar proyección"' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err && err.message ? err.message : String(err) };
  } finally {
    try { await browser.close(); } catch (_) {}
  }
}

/* ---------------------------------------------
 * EXPORTACIÓN
 * -------------------------------------------*/
// enviar.js reusa generar() tal cual, para no duplicar nada de esta lógica.
module.exports = { generar, generarUna, sesionViva, login, mirar, EMPRESAS, SALIDA };

/* ---------------------------------------------
 * ARRANQUE (sólo cuando se ejecuta directo, no al importarlo)
 * -------------------------------------------*/
if (require.main === module) (async () => {
  const modo = process.argv.find(a => a.startsWith('--')) || '';
  try {
    if (modo === '--login') return await login();
    if (modo === '--mirar') return await mirar();
    if (modo === '--generar') return await generar();
    console.log(`
Sonda del Flujo de Fondos — no manda nada por WhatsApp.

  node sonda.js --login      iniciar sesión a mano (una sola vez)
  node sonda.js --mirar      ver si la sesión sirve y qué hay en la página
  node sonda.js --generar    generar las proyecciones (AMH + Agroindustrial)
                             y guardar un PDF de cada una

  VER=1 node sonda.js --mirar   para verlo con ventana
`);
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
  }
})();
