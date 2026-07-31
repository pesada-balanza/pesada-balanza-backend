'use strict';
/**
 * Corre todas las pruebas de la app móvil, una atrás de otra, y da el resumen.
 *
 *   node pruebas/correr.js
 *
 * Cada prueba levanta el servidor de verdad contra un doble de MongoDB en
 * memoria (pruebas/doble-mongo.js): no toca la base real ni manda ningún email.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['probar.js', 'Recorrido completo: web + app, de punta a punta'],
  ['probar-apagado.js', 'Con APP_MOVIL apagado la app no existe y la web queda igual'],
  ['probar-sin-senal.js', 'Cargar sin señal y que se suba solo al volver'],
  ['probar-cadena.js', 'Cerrar el ticket completo sin señal (los tres pasos)'],
  ['probar-compartir.js', 'Compartir el PDF del ticket'],
  ['probar-pdf.js', 'El PDF: estructura, medidas y contenido'],
  ['probar-arreglos.js', 'Navegación: volver, salir, y el campo en la regulada'],
  ['probar-liviana.js', 'Que sea liviana y que actualizar no borre lo pendiente'],
  ['probar-sin-senal-real.js', 'Sin señal con el service worker de verdad (como en el teléfono)'],
  ['probar-reporte-email.js', 'El reporte de las 19 hs y el acumulado de campaña'],
];

let totalOk = 0;
let totalFallas = 0;
const rotas = [];

console.log('\n════════════════════════════════════════════════════════');
console.log('  PRUEBAS DE LA APP MÓVIL');
console.log('════════════════════════════════════════════════════════');

for (const [archivo, descripcion] of SUITES) {
  process.stdout.write('\n▸ ' + archivo + '\n  ' + descripcion + '\n');

  const r = spawnSync(process.execPath, [path.join(__dirname, archivo)], {
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });

  const salida = (r.stdout || '') + (r.stderr || '');
  const bien = salida.match(/TODO BIEN — (\d+) comprobaciones/);
  const mal = salida.match(/(\d+) FALLAS de (\d+)/);
  const salteada = /SALTEADA/.test(salida);

  if (salteada) {
    console.log('  ⊘ salteada (falta Playwright)');
  } else if (bien) {
    totalOk += Number(bien[1]);
    console.log('  ✓ ' + bien[1] + ' comprobaciones, todas bien');
  } else if (mal) {
    totalFallas += Number(mal[1]);
    totalOk += Number(mal[2]) - Number(mal[1]);
    rotas.push(archivo);
    console.log('  ✗ ' + mal[1] + ' fallas de ' + mal[2]);
    // Mostrar solo las líneas que fallaron, para no llenar la pantalla
    salida.split('\n').filter((l) => l.indexOf('✗') !== -1).forEach((l) => console.log('  ' + l.trim()));
  } else {
    rotas.push(archivo);
    console.log('  ✗ la prueba no llegó a terminar');
    console.log(salida.split('\n').slice(-12).map((l) => '    ' + l).join('\n'));
  }
}

console.log('\n════════════════════════════════════════════════════════');
if (totalFallas === 0 && !rotas.length) {
  console.log('  TODO BIEN — ' + totalOk + ' comprobaciones');
} else {
  console.log('  ' + totalFallas + ' FALLAS · ' + totalOk + ' bien');
  console.log('  Revisar: ' + rotas.join(', '));
}
console.log('════════════════════════════════════════════════════════\n');

process.exit(totalFallas === 0 && !rotas.length ? 0 : 1);
