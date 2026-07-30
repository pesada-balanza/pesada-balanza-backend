'use strict';
/**
 * Con APP_MOVIL apagado: la app no existe y la web funciona igual que hoy.
 */
const path = require('path');
const PROY = path.join(__dirname, '..');
// Las vistas se buscan a partir del directorio de trabajo, así que la prueba
// se puede llamar desde donde sea.
process.chdir(PROY);

process.env.MONGODB_URI = 'mongodb://falsa/pesada';
process.env.SESSION_SECRET = 'prueba-local-secreta';
delete process.env.APP_MOVIL;          // ← la llave apagada
process.env.PORT = '3198';

const { BaseFalsa } = require('./doble-mongo');
const baseFalsa = new BaseFalsa();

const session = require(path.join(PROY, 'node_modules', 'express-session'));
const rutaConnectMongo = require.resolve(path.join(PROY, 'node_modules', 'connect-mongo'));
require.cache[rutaConnectMongo] = {
  id: rutaConnectMongo, filename: rutaConnectMongo, loaded: true,
  exports: { create: () => new session.MemoryStore() },
};

const mongoose = require(path.join(PROY, 'node_modules', 'mongoose'));
mongoose.connect = async () => mongoose;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => 1, configurable: true });
Object.defineProperty(mongoose.connection, 'db', { get: () => baseFalsa, configurable: true });

const rutaNotif = require.resolve(path.join(PROY, 'notificaciones.js'));
const notifReal = require(rutaNotif);
require.cache[rutaNotif].exports = { resolverNombreCodigo: notifReal.resolverNombreCodigo, notificar: () => {} };

require(path.join(PROY, 'app.js'));

const BASE = 'http://127.0.0.1:' + process.env.PORT;
let cookies = {};
let fallos = 0, pruebas = 0;

function guardarCookies(res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    cookies[par.slice(0, i)] = par.slice(i + 1);
  }
}
function ck() { return Object.keys(cookies).map((k) => k + '=' + cookies[k]).join('; '); }

async function ir(metodo, url, cuerpoForm) {
  const headers = { 'X-Forwarded-Proto': 'https' };
  if (ck()) headers.Cookie = ck();
  if (cuerpoForm) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(BASE + url, {
    method: metodo, headers, body: cuerpoForm, redirect: 'manual',
  });
  guardarCookies(res);
  return { estado: res.status, ubicacion: res.headers.get('location'), texto: await res.text() };
}

function ok(nombre, cond, extra) {
  pruebas++;
  if (cond) console.log('  ✓ ' + nombre);
  else { fallos++; console.log('  ✗ ' + nombre + (extra ? '  →  ' + String(extra).slice(0, 200) : '')); }
}

async function main() {
  await new Promise((r) => setTimeout(r, 1200));

  console.log('\n── Con APP_MOVIL apagado, la app no existe');
  for (const url of [
    '/app', '/app/', '/app/ingreso', '/app/patio', '/app/general',
    '/app/api/ingreso', '/app/sw.js', '/app/manifest.webmanifest',
    '/app/estatico/app.css', '/app/estatico/app.js', '/app/icono.svg',
    '/app/imprimir', '/app/api/patio',
  ]) {
    const r = await ir('GET', url);
    ok(url + ' → 404', r.estado === 404, r.estado + (r.ubicacion ? ' → ' + r.ubicacion : ''));
  }

  console.log('\n── La web sigue funcionando exactamente igual');
  let r = await ir('GET', '/');
  ok('login abre', r.estado === 200 && /name="code"/.test(r.texto), r.estado);

  r = await ir('GET', '/login/registro');
  ok('/login/registro abre', r.estado === 200);
  r = await ir('GET', '/login/tabla');
  ok('/login/tabla abre', r.estado === 200);

  r = await ir('GET', '/tabla');
  ok('/tabla sin sesión redirige', r.estado === 302);
  r = await ir('GET', '/registro');
  ok('/registro sin sesión redirige', r.estado === 302);

  r = await ir('POST', '/', 'code=5679&redirect=/registro');
  ok('login de balanza anda', r.estado === 302 && r.ubicacion === '/registro', r.ubicacion);

  r = await ir('GET', '/registro');
  ok('el formulario de la web renderiza', r.estado === 200 && /brutoEstimado/.test(r.texto), r.estado);
  ok('el formulario usa Bootstrap (sin cambios)', /bootstrap/i.test(r.texto));

  r = await ir('POST', '/guardar-tara',
    new URLSearchParams({
      cargaPara: 'AMH', transporte: 'Ciriaci', patentes: 'WEB 002 BB', chofer: 'Chofer Web',
      brutoEstimado: '45000', campo: 'El 44 - ARBOL BLANCO - SE',
    }).toString());
  ok('la web guarda CAMIONES', r.estado === 302, r.estado);

  r = await ir('POST', '/confirmar-tara-final',
    new URLSearchParams({ patentes: 'WEB 002 BB', taraNueva: '14000' }).toString());
  ok('la web confirma TARA FINAL', r.estado === 200, r.estado);

  r = await ir('POST', '/guardar-tara-final',
    new URLSearchParams({ patentes: 'WEB 002 BB', taraNueva: '14000' }).toString());
  ok('la web guarda TARA FINAL', r.estado === 302, r.estado);

  const doc = baseFalsa.collection('registros').docs[0];
  ok('el registro de la web no tiene campos de la app',
    doc.origen === undefined && doc.nroApp === undefined && doc.cargadoPor === undefined,
    JSON.stringify(doc).slice(0, 250));

  cookies = {};
  r = await ir('POST', '/', 'code=12341&redirect=/tabla');
  ok('login GENERAL anda', r.estado === 302 && r.ubicacion === '/tabla');
  r = await ir('GET', '/tabla');
  ok('Ver Registros abre', r.estado === 200 && /WEB 002 BB/.test(r.texto), r.estado);
  r = await ir('GET', '/exportar-excel');
  ok('exportar Excel responde', r.estado === 200 || r.estado === 404, r.estado);

  r = await ir('GET', '/logout');
  ok('logout anda', r.estado === 302);

  console.log('\n── No se crearon colecciones de la app');
  const nombres = Array.from(baseFalsa.colecciones.keys());
  ok('solo colecciones de la web: ' + nombres.join(', '),
    !nombres.some((n) => n.indexOf('app_') === 0), nombres.join(','));

  console.log('\n════════════════════════════════════════');
  console.log(fallos === 0 ? '  TODO BIEN — ' + pruebas + ' comprobaciones' : '  ' + fallos + ' FALLAS de ' + pruebas);
  console.log('════════════════════════════════════════');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
