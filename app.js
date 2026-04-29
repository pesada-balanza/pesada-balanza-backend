require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const ExcelJS = require('exceljs');
const path = require('path');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const cron = require('node-cron');
const { notificar, resolverNombreCodigo } = require('./notificaciones');

const app = express();

/* ---------------------------------------------
 * MONGODB
 * -------------------------------------------*/
mongoose.set('strictQuery', true);
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: Variable MONGODB_URI no configurada en las variables de entorno');
  process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('ERROR: Variable SESSION_SECRET no configurada en las variables de entorno');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,   // VUL-11: aborta si no encuentra servidor en 5s
    socketTimeoutMS: 45000,           // VUL-11: aborta operaciones que tarden más de 45s
  })
  .then(() => console.log('Conectado a MongoDB'))
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });

/* ---------------------------------------------
 * MIDDLEWARE
 * -------------------------------------------*/
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// VUL-07: CORS — solo acepta requests desde el dominio de producción
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'https://pesada-balanza-backend-1.onrender.com',
  credentials: true,
}));

// VUL-06: Rate limiting en login — máx. 10 intentos cada 15 minutos por IP
const _loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const ahora = Date.now();
  const VENTANA_MS = 15 * 60 * 1000;
  const MAX_INTENTOS = 10;
  const entrada = _loginAttempts.get(ip) || { count: 0, resetAt: ahora + VENTANA_MS };
  if (ahora > entrada.resetAt) {
    entrada.count = 0;
    entrada.resetAt = ahora + VENTANA_MS;
  }
  entrada.count++;
  _loginAttempts.set(ip, entrada);
  if (entrada.count > MAX_INTENTOS) {
    return res.status(429).render('error', {
      error: 'Demasiados intentos de acceso. Esperá 15 minutos e intentá de nuevo.',
    });
  }
  return next();
}

// Necesario para que las cookies seguras funcionen correctamente en Render (HTTPS)
app.set('trust proxy', 1);
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000  // 8 horas
  }
}));

app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layouts/main');

/* ---------------------------------------------
 * CÓDIGOS
 * -------------------------------------------*/
const codigosIngreso = ['56781','5679','5680','5681','5682','5683','5684','5685'];
const codigosObservacion = ['12341','1235','1236','1237','1238','1239','1240','1241'];

const ingresoAObservacion = {
  '56781': '12341',
  '5679':  '1235',
  '5680':  '1236',
  '5681':  '1237',
  '5682':  '1238',
  '5683':  '1239',
  '5684':  '1240',
  '5685':  '1241',
};

/* ---------------------------------------------
 * CONTRATISTAS (cargados desde Tablets 25-26.xlsx)
 * Estructura: { "Nombre Contratista": ["TRACTOR1", "TRACTOR2", ...] }
 * -------------------------------------------*/
let contratistas = {};
(async () => {
  try {
    const xlsxPath = path.join(__dirname, 'Tablets 25-26.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const sheet = wb.worksheets[0];
    const tmp = {};
    sheet.eachRow((row, idx) => {
      if (idx === 1) return; // saltar encabezado
      const nombre  = (row.getCell(1).value || '').toString().trim();
      const tractor = (row.getCell(2).value || '').toString().trim();
      if (!nombre || !tractor) return;
      if (!tmp[nombre]) tmp[nombre] = [];
      if (!tmp[nombre].includes(tractor)) tmp[nombre].push(tractor);
    });
    // Ordenar nombres alfabéticamente y tractores en orden natural
    contratistas = Object.keys(tmp).sort().reduce((acc, k) => {
      acc[k] = tmp[k];
      return acc;
    }, {});
    console.log('Contratistas cargados:', Object.keys(contratistas).length);
  } catch (err) {
    console.error('No se pudo cargar Tablets 25-26.xlsx:', err.message);
  }
})();

/* ---------------------------------------------
 * DATOS (campos y datosSiembra)
 * -------------------------------------------*/
const campos = [
  "AMAMÁ - Villa Brana - SE",
  "AVELLEIRA",
  "Aguero - SACHAYOJ - SE",
  "Bandera - AVERIAS - SE",
  "Campo Cesar Bressan",
  "Cejolao - CEJOLAO - SE",
  "Charata - CHARATA - CH",
  "Cueto - CEJOLAO - SE",
  "Doble Cero (Fermaneli) - AEROLITO - SE",
  "Don Paco - ARBOL BLANCO - SE",
  "Don Pascual - ARBOL BLANCO - SE",
  "El 44 - ARBOL BLANCO - SE",
  "El 90 Red Surcos - TINTINA - SE",
  "El Búfalo - H. MEJ. MIRAVAL - SE",
  "El C 1 Ciriaci - TINTINA - SE",
  "El C 1 GyM - TINTINA - SE",
  "El Centinela 2 - LOGROÑO - SF",
  "El Centinela 3 - LOGROÑO - SF",
  "El Mataco - SACHAYOJ - SE",
  "Ferulo Guido 2 - SACHAYOJ - SE",
  "Gioda - SAN FRANCISCO - SE",
  "Gomez - VILELAS - SE",
  "Grifa - Zunesma - TINTINA - SE",
  "Hidalgo - TINTINA - SE",
  "La Juanita - Ciriaci  (Ex Lote Lalo) - H. M. Miraval - SE",
  "La Juanita - H.M. MIRAVAL - SE",
  "La Porfía - ARBOL BLANCO - SE",
  "La Pradera - ARBOL BLANCO - SE",
  "La Purificada - QUIMILI - SE",
  "La Unión - LA UNION - SE",
  "Los Molinos - Tostado",
  "Martina - ALHUAMPA - SE",
  "Martinoli - SACHAYOJ - SE",
  "Panuncio - ARBOL BLANCO - SE",
  "Poncho Perdido Guido F - SACHAYOJ - SE",
  "Santa Justina Cura Malal - QUIMILI - SE",
  "Santa Justina Mahuida - QUIMILI - SE",
  "Santa Rosa (Sonzogni) - ARBOL BLANCO - SE",
  "Tierra Negra - ARBOL BLANCO - SE",
  "Wichí - SACHAYOJ - SE",
].sort();

const datosSiembra = {
  "AMAMÁ - Villa Brana - SE": {
    "MAIZ": [
      "lotes 1 Amama",
      "lotes 2 Amama",
      "lotes 3 Amama",
      "lotes 4 Amama",
      "lotes 5 Amama",
      "lotes 6 Amama",
      "lotes 7 Amama",
      "lotes 8 Amama"
    ]
  },
  "AVELLEIRA": {
    "MAIZ": [
      "Lote Avelleira1 La C",
      "Lote Avelleira2 La C"
    ]
  },
  "Aguero - SACHAYOJ - SE": {
    "SOJA": [
      "Lote 1",
      "Lote 2",
      "Lote 3",
      "Lote 4",
      "Lote 5",
      "Lote 6"
    ]
  },
  "Bandera - AVERIAS - SE": {
    "SOJA": [
      "Lote 1 Bandera",
      "Lote 2 Bandera"
    ]
  },
  "Campo Cesar Bressan": {
    "MAIZ": [
      "Cesar Bressan"
    ]
  },
  "Cejolao - CEJOLAO - SE": {
    "MAIZ": [
      "Lote 1 Este Cejolao",
      "Lote 2 Este Cejolao",
      "Lote 3 Este Cejolao",
      "Lote 4 Este Cejolao",
      "Lote 5 Este Cejolao",
      "Lote 6 Este Cejolao",
      "Lote 7 Este Cejolao",
      "Lote 8 Este Cejolao",
      "Lote 9 Este Cejolao",
      "Lote 10 Este Cejolao"
    ]
  },
  "Charata - CHARATA - CH": {
    "SOJA": [
      "Lote 1 Charata",
      "Lote 2 Charata",
      "Lote 6 Charata"
    ],
    "MAIZ": [
      "Lote 3 Charata"
    ]
  },
  "Cueto - CEJOLAO - SE": {
    "SOJA": [
      "Lote 8",
      "Lote 9",
      "Lote 10",
      "Lote 11",
      "Lote 12",
      "Lote 13",
      "Lote 7"
    ],
    "MAIZ": [
      "Lote 1",
      "Lote 2",
      "Lote 3",
      "Lote 4",
      "Lote 5",
      "Lote 6",
      "Lote Nuevo",
      "Lote Hornos"
    ]
  },
  "Doble Cero (Fermaneli) - AEROLITO - SE": {
    "SOJA": [
      "Lote 1",
      "Lote 2",
      "Lote 22",
      "Lote 29",
      "Lote 3",
      "Lote 30",
      "Lote 31",
      "Lote 32",
      "Lote 33",
      "Lote 35",
      "Lote 4",
      "Lote 5",
      "Lote 6"
    ],
    "MAIZ": [
      "Lote 10",
      "Lote 11",
      "Lote 12",
      "Lote 13",
      "Lote 14",
      "Lote 15",
      "Lote 16",
      "Lote 17",
      "Lote 18",
      "Lote 19 A",
      "Lote 19 B",
      "Lote 19 C",
      "Lote 19 D",
      "Lote 20",
      "Lote 21",
      "Lote 23",
      "Lote 24",
      "Lote 25",
      "Lote 26",
      "Lote 27",
      "Lote 28",
      "Lote 34",
      "Lote 7",
      "Lote 8",
      "Lote 9",
      "Lote propio Fermanelli"
    ]
  },
  "Don Paco - ARBOL BLANCO - SE": {
    "SOJA": [
      "Lote 1 Don Paco",
      "Lote 2 Don Paco",
      "Lote 3 Don Paco",
      "Lote 4 Don Paco",
      "Lote 5 Don Paco",
      "Lote 6 Don Paco",
      "Lote 7 Don Paco",
      "Lote 8 Don Paco"
    ]
  },
  "Don Pascual - ARBOL BLANCO - SE": {
    "MAIZ": [
      "Lote 1 Don Pascual",
      "Lote 2 Don Pascual",
      "Lote 3 Don Pascual",
      "Lote 4 Don Pascual",
      "Lote 5 Don Pascual",
      "Lote 6 Don Pascual",
      "Lote 7 Don Pascual",
      "Lote 8 Don Pascual",
      "Lote Perímetro Don P"
    ]
  },
  "El 44 - ARBOL BLANCO - SE": {
    "SOJA": [
      "Lote 1 El 44",
      "Lote 4 El 44",
      "Lote 5 El 44",
      "Lote Banquina el 44"
    ],
    "MAIZ": [
      "Lote 2 El 44",
      "Lote 3 El 44"
    ]
  },
  "El 90 Red Surcos - TINTINA - SE": {
    "SOJA": [
      "Lote 2 El 90",
      "Lote 4 el 90",
      "Lote 6 El 90",
      "Lote 8 el 90"
    ]
  },
  "El Búfalo - H. MEJ. MIRAVAL - SE": {
    "MAIZ": [
      "Lote 1 El Bufalo",
      "Lote 4 El Bufalo",
      "Lote Romi El Bufalo"
    ]
  },
  "El C 1 Ciriaci - TINTINA - SE": {
    "SOJA": [
      "Lote 1 Ciriaci  C1",
      "Lote 2 Ciriaci C1",
      "Lote 3 Ciriaci C1",
      "Lote 4 Ciriaci C1",
      "Lote 5 Ciriaci C1",
      "Lote 6 Ciriaci C1",
      "Lote 7 Ciriaci C1",
      "Lote 8 Ciriaci C1",
      "Lote 9 Ciriaci C1"
    ],
    "MAIZ": [
      "Lote 10 Ciriaci C1",
      "Lote 11 Ciriaci C1",
      "Lote 12 Ciriaci C1",
      "Lote 13 Ciriaci C1",
      "Lote 14 Ciriaci C1",
      "Lote 15 Ciriaci C1",
      "Lote 16 Ciriaci C1",
      "Lote 17 Ciriaci C1",
      "Lote 18 Ciriaci C1",
      "Lote 19 Ciriaci C1",
      "Lote 20 Ciriaci C1",
      "Lote 21 Ciriaci C1",
      "Lote 22 Ciriaci C1",
      "Lote 23 Ciriaci C1",
      "Lote Contorno"
    ]
  },
  "El C 1 GyM - TINTINA - SE": {
    "MAIZ": [
      "Lote 26 Grifa C1",
      "Lote 27 Grifa C1",
      "Lote 28 Grifa C1",
      "Lote 29 Grifa C1",
      "Lote 32 Grifa C1",
      "Lote 33 Grifa C1",
      "Lote 34 Grifa C1"
    ]
  },
  "El Centinela 2 - LOGROÑO - SF": {
    "ALGODÓN": [
      "7",
      "8",
      "9",
      "10",
      "11",
      "12"
    ]
  },
  "El Centinela 3 - LOGROÑO - SF": {
    "ALGODÓN": [
      "13",
      "14",
      "15"
    ]
  },
  "El Mataco - SACHAYOJ - SE": {
    "SOJA": [
      "Lote 1 El Mataco",
      "Lote 2 El Mataco",
      "Lote 3 El Mataco",
      "Lote 4 El Mataco",
      "Lote 5 El Mataco",
      "Lote Banquina El Mat"
    ]
  },
  "Ferulo Guido 2 - SACHAYOJ - SE": {
    "MAIZ": [
      "Lote 1 - Guido 2 (unificado)"
    ]
  },
  "Gioda - SAN FRANCISCO - SE": {
    "MAIZ": [
      "Lote Norte Gioda",
      "Lote Sur Gioda"
    ]
  },
  "Gomez - VILELAS - SE": {
    "SOJA": [
      "Lote 1 Este Gomez",
      "Lote 1 Oeste Gomez",
      "Lote 2 Este Gomez",
      "Lote 2 Oeste Gomez",
      "Lote 3 Este Gomez",
      "Lote 3 Oeste Gomez",
      "Lote 4 Este Gomez",
      "Lote 4 Oeste Gomez",
      "Lote 5 Oeste Gomez",
      "Lote 5 Este Gomez",
      "Lote 6 Oeste Gomez",
      "Lote 6 Este Gomez"
    ],
    "MAIZ": [
      "Lote 7 Oeste Gomez",
      "Lote 8 Oeste Gomez",
      "Lote 8 Este Gomez",
      "Lote 7 Este Gomez",
      "Lote 11 Este Gomez",
      "Lote 10 Este Gomez",
      "Lote 10 Oeste Gomez",
      "Lote 11 Oeste Gomez",
      "Lote 9 Este Gomez",
      "Lote 9 Oeste Gomez"
    ]
  },
  "Grifa - Zunesma - TINTINA - SE": {
    "SOJA": [
      "Lote 11 Grifa",
      "Lote 1 Grifa",
      "Lote 2 Grifa",
      "Lote 3 Grifa",
      "Lote 4 Grifa",
      "Lote 5 Grifa",
      "Lote 6 Grifa",
      "Lote 7 Grifa",
      "Lote 8 Grifa",
      "Lote 9 Grifa",
      "Lote 10 Grifa"
    ]
  },
  "Hidalgo - TINTINA - SE": {
    "SOJA": [
      "Lote 1 Hidalgo",
      "Lote 2 Hidalgo",
      "Lote 3 Hidalgo",
      "Lote 4 Hidalgo"
    ]
  },
  "La Juanita - Ciriaci  (Ex Lote Lalo) - H. M. Miraval - SE": {
    "MAIZ": [
      "Lote Lalo"
    ]
  },
  "La Juanita - H.M. MIRAVAL - SE": {
    "MAIZ": [
      "Lote 1 A La Juanita",
      "Lote 18 La Juanita",
      "Lote 19 La Juanita",
      "Lote 12 La Juanita",
      "Lote 13 La Juanita",
      "Lote 15 La Juanita"
    ],
    "SOJA": [
      "Lote 14 La Juanita",
      "Lote 16 La Juanita",
      "Lote 17 La Juanita"
    ]
  },
  "La Porfía - ARBOL BLANCO - SE": {
    "SOJA": [
      "Lote 1 La Porfía",
      "Lote 2 La Porfía",
      "Lote 3 La Porfía",
      "Lote 4 La Porfía",
      "Lote 6 La Porfía",
      "Lote 7 La Porfía",
      "Lote 11 La Porfía",
      "Lote 12 La Porfía",
      "Lote 13 La Porfía"
    ],
    "MAIZ": [
      "Lote 5 La Porfía",
      "Lote 8 La Porfía",
      "Lote 9 La Porfía",
      "Lote 10 La Porfía",
      "Lote 11 La Porfía",
      "Lote Callejon La Por"
    ]
  },
  "La Pradera - ARBOL BLANCO - SE": {
    "SOJA": [
      "Las 800 1 La Pradera",
      "Las 800 2 La Pradera",
      "Las 800 3 La Pradera",
      "Las 800 4 La Pradera",
      "Lote 10 La Pradera",
      "Lote 17 La Pradera",
      "Lote 2.A La Pradera",
      "Lote 2.B La Pradera",
      "Lote 2.C La Pradera",
      "Lote 2.D La Pradera",
      "Lote 2.E La Pradera",
      "Lote 2.F La Pradera",
      "Lote 20 La Pradera",
      "Lote 21 La Pradera",
      "Lote 27.3 La Pradera",
      "Lote 27.4 La Pradera",
      "Lote 27.5 La Pradera",
      "Lote 28",
      "Lote 29",
      "Lote 30",
      "Lote 31 La Pradera",
      "Lote 32 Cortina 1",
      "Lote 32 Cortina 2",
      "Lote 32 Cortina 3",
      "Lote 34 La Pradera",
      "Lote 35 Cortina 1",
      "Lote 35 Cortina 2",
      "Lote 36 Cortina 8",
      "Lote 37.1 La Pradera",
      "Lote 38 E",
      "Lote 38 W La Pradera",
      "Lote 41.1 La Pradera",
      "Lote 41.2 La Pradera",
      "Lote 41.E.3 La Prade",
      "Lote 41.E.4 La Prade",
      "Lote 41.E.5 La Prade",
      "Lote 41.E.6 La Prade",
      "Lote 41.E.7 La Prade",
      "Lote 41.E.8 La Prade",
      "Lote 41.W.10 La Prade",
      "Lote 41.W.3 La Prade",
      "Lote 41.W.9 La Prade",
      "Lote 44.1 La Pradera SOJA",
      "Lote 44.2 La Pradera SOJA",
      "Lote 44.3 La Pradera",
      "Lote 45 La Pradera (2, S, E y W)",
      "Lote 46.E.3 La Pradera",
      "Lote 46.E.4 La Pradera",
      "Lote 46.E.5 La Pradera",
      "Lote 46.E.6 La Pradera",
      "Lote 46.W.3 La Pradera",
      "Lote 46.W.4 La Pradera",
      "Lote 47.1 y 2 W La P",
      "Lote 47.3 W La Prade",
      "Lote 47.4 W La Prade",
      "Lote 47.5 W La Prade",
      "Lote 5.A La Pradera",
      "Lote 5.B La Pradera",
      "Lote 5.C La Pradera",
      "Lote 5.D La Pradera",
      "Lote 5.E La Pradera",
      "Lote 5.F La Pradera",
      "Lote 6.1 La Pradera",
      "Lote 6.2 La Pradera",
      "Lote 6.3 La Pradera",
      "Lote 6.4 La Pradera",
      "Lote 7.1 La Pradera",
      "Lote 7.1. SOJA La Pradera",
      "Lote 7.2 La Pradera",
      "Lote 7.3 La Pradera",
      "Lote 8 La Pradera",
      "Lote 9 La Pradera",
      "Lote chapino",
      "Lote Moriconi 1",
      "Lote Moriconi 2 y  3",
      "Lote Banquina. Piquete 47"
    ],
    "SORGO": [
      "Lote 22 La Pradera",
      "Lote 23 La Pradera",
      "Lote 24 La Pradera",
      "Lote 25 La Pradera",
      "Lote 27.1 La Pradera",
      "Lote 27.2 La Pradera"
    ],
    "ALGODÓN": [
      "Lote 30 Cortina 1",
      "Lote 30 Cortina 2",
      "Lote 36 Cortina 6",
      "Lote 36 Cortina 7",
      "Lote 41.W.4 La Prade",
      "Lote 41.W.5 La Prade",
      "Lote 41.W.6 La Prade",
      "Lote 41.W.7 La Prade",
      "Lote 41.W.8 La Prade",
      "Lote 43 1 La Pradera",
      "Lote 43 2 La Pradera",
      "Lote 43 3 La Pradera",
      "Lote 43 4 La Pradera",
      "Lote 43 5 La Pradera",
      "Lote 44.1 La Pradera",
      "Lote 44.1 La Pradera SOJA",
      "Lote 44.2 La Pradera",
      "Lote 44.2 La Pradera SOJA",
      "Lote 44.3 La Pradera",
      "Lote 45 3 La Pradera",
      "Lote 45 4 La Pradera",
      "Lote 45 5 La Pradera",
      "Lote 45 La Pradera (2, S, E y W)",
      "Lote 46.E.1.1 La Pradera",
      "Lote 46.E.1.2 La Pradera",
      "Lote 46.E.2.1 La Pradera",
      "Lote 46.E.2.2 La Pradera",
      "Lote 46.W.1 La Pradera",
      "Lote 46.W.2 La Pradera",
      "Lote 47.1 y 2 W La P",
      "Lote 47.4 W La Prade",
      "Lote 47.5 W La Prade"
    ],
    "MAIZ": [
      "Lote 36 Cortina 3",
      "Lote 36 Cortina 4",
      "Lote 36 Cortina 5",
      "Lote 39 E.1 La Prade",
      "Lote 39 E.2 La Prade",
      "Lote 39 E.3 La Prade",
      "Lote 39 E.4 La Prade",
      "Lote 39 E.5 La Prade",
      "Lote 39 E.6 La Prade",
      "Lote 39 E.7 La Prade",
      "Lote 39 W.1 La Prade",
      "Lote 39 W.2 La Prade",
      "Lote 39 W.3 La Prade",
      "Lote 39 W.4 La Prade",
      "Lote 39 W.5 La Prade",
      "Lote 39 W.6 La Prade",
      "Lote 39 W.7 La Prade",
      "Lote 40 3",
      "Lote 40 4",
      "Lote 40 5",
      "Lote 40 La Pradera (olla)",
      "Lote 43.1 E La Prade",
      "Lote 43.1 W La Prade",
      "Lote 43.2 E La Prade",
      "Lote 43.2 W La Prade",
      "Lote 43.3 E La Prade",
      "Lote 43.3 W La Prade",
      "Lote 43.4 E y W La P",
      "Lote 43.5 E La P",
      "Lote 43.5 W La P",
      "Lote 47.1 y 2 E La P",
      "Lote 47.3 E La Prade",
      "Lote 47.4 E La Prade",
      "Lote 47.5 E La Prade"
    ]
  },
  "La Purificada - QUIMILI - SE": {
    "MAIZ": [
      "Lote 1 La Purificada",
      "Lote 2 La Purificada",
      "Lote 3 La Purificada"
    ]
  },
  "La Unión - LA UNION - SE": {
    "SORGO": [
      "lote unico"
    ]
  },
  "Los Molinos - Tostado": {
    "MAIZ": [
      "Lotes Girasol"
    ]
  },
  "Martina - ALHUAMPA - SE": {
    "MAIZ": [
      "Lote 1 Martina"
    ]
  },
  "Martinoli - SACHAYOJ - SE": {
    "MAIZ": [
      "Lote Martinoli"
    ]
  },
  "Panuncio - ARBOL BLANCO - SE": {
    "SOJA": [
      "Lote 1 Panuncio",
      "Lote 2 Panuncio"
    ],
    "MAIZ": [
      "Lote 3 Panuncio",
      "Lote 4 Panuncio",
      "Lote 5 Panuncio"
    ]
  },
  "Poncho Perdido Guido F - SACHAYOJ - SE": {
    "MAIZ": [
      "lote A"
    ]
  },
  "Santa Justina Cura Malal - QUIMILI - SE": {
    "SOJA": [
      "Lote 1"
    ],
    "MAIZ": [
      "Lote 3",
      "Lote 4",
      "Lote 2"
    ]
  },
  "Santa Justina Mahuida - QUIMILI - SE": {
    "MAIZ": [
      "Lote 5",
      "Lote 6",
      "Lote 7 cortina 1",
      "Lote Perimetro"
    ],
    "SOJA": [
      "Lote 7 cortina 2",
      "Lote 8",
      "Lote 9"
    ]
  },
  "Santa Rosa (Sonzogni) - ARBOL BLANCO - SE": {
    "MAIZ": [
      "Lote 1",
      "Lote 2",
      "Lote 3"
    ],
    "SOJA": [
      "Lote 4",
      "Lote 5",
      "Lote 6"
    ]
  },
  "Tierra Negra - ARBOL BLANCO - SE": {
    "SOJA": [
      "Lote 1 Tierra Negra",
      "Lote 2 Tierra Negra",
      "Lote 3 Tierra Negra",
      "Lote 4 Tierra Negra",
      "Lote 5 Tierra Negra",
      "Lote 6 Tierra Negra",
      "Lote 7 Tierra Negra",
      "Lote 8 Tierra Negra",
      "Lote 9 Tierra Negra",
      "Lote 10 Tierra Negra",
      "Lote 11 Tierra Negra",
      "Lote 12 Tierra Negra",
      "Lote Perím. Tierra N",
      "Loter Banq. Tierra N"
    ]
  },
  "Wichí - SACHAYOJ - SE": {
    "SOJA": [
      "Lote 1 C Wichí",
      "Lote 2 C Wichí",
      "Lote 3 C Wichí",
      "Lote 4 C Wichí",
      "Lote 5 C Wichí",
      "Lote 6 C Wichí",
      "Lote 7 C Wichí",
      "Lote 8 E Wichí",
      "Lote 9 E Wichí",
      "Lote 10 E Wichí",
      "Lote 8 C Wichí"
    ],
    "MAIZ": [
      "Lote 4 E Wichí",
      "Lote 5 E Wichí",
      "Lote 6 E Wichí",
      "Lote 7 E Wichí",
      "Lote 11 E Wichí",
      "Lote 12 E Wichí",
      "Lote 13 E Wichí",
      "Lote 3 E Wichí",
      "Lote 2 E Wichí",
      "Lote 1 E Wichí"
    ]
  },
};

/* ---------------------------------------------
 * UTILIDADES
 * -------------------------------------------*/
const ymd = (d) => d.toISOString().split('T')[0];

function getDateRangeFromQuery(req) {
  const today = ymd(new Date());
  const from = (req.query.from || '').trim() || today;
  const to   = (req.query.to   || '').trim() || today;
  return { from, to };
}

function withinRange(fechaStr, from, to) {
  return (!from || fechaStr >= from) && (!to || fechaStr <= to);
}

// TARA pendientes hoy–ayer–anteayer
async function obtenerTaraPendientesHoyYAyer() {
  const hoy = new Date();
  const fechas = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    fechas.push(ymd(d));
  }

  const col = mongoose.connection.db.collection('registros');

  const raw = await col
    .find({
      pesadaPara: 'CAMIONES',
      fecha: { $in: fechas },
      anulado: { $ne: true },
      confirmada: { $ne: true }
    })
    .sort({ idTicket: -1 })
    .toArray();

  const vistos = new Set();
  const result = [];
  for (const r of raw) {
    if (vistos.has(r.patentes)) continue;
    vistos.add(r.patentes);
    result.push({
      _id: r._id.toString(),
      idTicket: r.idTicket ?? null,
      patentes: r.patentes,
      brutoEstimado: r.brutoEstimado ?? 0,
      tara: r.tara ?? 0,
    });
  }
  return result;
}

// Permitir estados 1 y 2 (connected/connecting)
app.use((req, res, next) => {
  const state = mongoose.connection.readyState;
  if (state === 0 || state === 3) {
    return res.status(500).render('error', { error: 'Error de conexión con la base de datos. Intentá de nuevo en unos segundos.' });
  }
  next();
});

// ID siguiente
const calculateNextIdTicket = async () => {
  const col = mongoose.connection.db.collection('registros');
  const ultimo = await col
    .find({}, { projection: { idTicket: 1 } })
    .sort({ idTicket: -1 })
    .limit(1)
    .toArray();
  return ultimo.length ? (parseInt(ultimo[0].idTicket, 10) + 1) : 1;
};

function missingFields(body, fields) {
  return fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

/**
 * VUL-10: Verifica que un ticket no tenga más de `diasMaximos` días de antigüedad.
 * Un ticket de TARA es válido por 5 días para completar TARA FINAL o REGULADA.
 */
function ticketVigente(fechaStr, diasMaximos = 5) {
  const fechaTicket = new Date(fechaStr + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffDias = Math.floor((hoy - fechaTicket) / (1000 * 60 * 60 * 24));
  return diffDias <= diasMaximos;
}

/**
 * VUL-04: Validación de datos numéricos de entrada.
 * Evita que NaN, negativos o valores fuera de rango lleguen a la BD.
 * @param {*} v      - Valor crudo del req.body
 * @param {number} min - Mínimo permitido (inclusive)
 * @param {number} max - Máximo permitido (inclusive)
 * @returns {{ ok: boolean, valor: number, error?: string }}
 */
function validarNumero(v, min = 0, max = 60000) {
  const n = parseFloat(v);
  if (!Number.isFinite(n))   return { ok: false, error: `Debe ser un número válido (recibido: "${v}")` };
  if (n < min)               return { ok: false, error: `Debe ser ≥ ${min} kg (recibido: ${n})` };
  if (n > max)               return { ok: false, error: `Debe ser ≤ ${max} kg (recibido: ${n})` };
  return { ok: true, valor: n };
}

/* ---------------------------------------------
 * RUTAS: LOGIN
 * -------------------------------------------*/
app.get('/', (req, res) => {
  const error = req.query.error || '';
  const redirect = req.query.redirect || '/tabla';
  res.render('index', { error, redirect });
});

app.get('/login/registro', (req, res) => {
  res.render('index', { error: '', redirect: '/registro' });
});

app.get('/login/tabla', (req, res) => {
  res.render('index', { error: '', redirect: '/tabla' });
});

// POST login
app.post('/', rateLimitLogin, (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const redirect = String(req.body.redirect || '').trim();

    const esIngreso = codigosIngreso.includes(code);
    const esObservacion = codigosObservacion.includes(code);

    if (!esIngreso && !esObservacion) {
      return res.redirect(
        '/?error=Código incorrecto&redirect=' +
        encodeURIComponent(redirect || '/tabla')
      );
    }

    // Guardar sesión en el servidor (el código ya no viaja en la URL)
    req.session.autenticado = true;
    req.session.tipo = esIngreso ? 'ingreso' : 'observacion';
    req.session.codigoIngreso = esIngreso ? code : null;
    req.session.codigoObservacion = esIngreso ? ingresoAObservacion[code] : code;
    req.session.nombreUsuario = resolverNombreCodigo(esIngreso ? code : Object.keys(ingresoAObservacion).find(k => ingresoAObservacion[k] === code) || code);

    const RUTAS_PERMITIDAS = ['/registro', '/tabla'];
    const destino = RUTAS_PERMITIDAS.includes(redirect)
      ? redirect
      : (esIngreso ? '/registro' : '/tabla');

    return res.redirect(destino);
  } catch (err) {
    console.error('Error en POST /:', err);
    return res.status(500).render('error', { error: 'Error interno al iniciar sesión.' });
  }
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

/* ---------------------------------------------
 * RUTA: TABLA
 * -------------------------------------------*/
app.get(
  '/tabla',
  (req, res, next) => {
    if (!req.session || !req.session.autenticado || req.session.tipo !== 'observacion') {
      return res.redirect('/?error=Acceso denegado&redirect=/tabla');
    }
    req.observacionCode = req.session.codigoObservacion;
    return next();
  },
  async (req, res) => {
    try {
      const { from, to } = getDateRangeFromQuery(req);

      let registros = await mongoose.connection.db
        .collection('registros')
        .find()
        .toArray();

      if (req.observacionCode !== '12341') {
        const codigoIngreso = Object.keys(ingresoAObservacion)
          .find(key => ingresoAObservacion[key] === req.observacionCode);

        registros = registros.filter(r => r.codigoIngreso === codigoIngreso);
      }

      registros = registros.filter(r => withinRange(r.fecha, from, to));

      return res.render('tabla', {
        registros,
        observacionCode: req.observacionCode,
        range: { from, to }
      });
    } catch (err) {
      console.error('Error en GET /tabla:', err);
      return res.status(500).render('error', { error: 'Error interno al cargar la tabla.' });
    }
  }
);

/* ---------------------------------------------
 * EXPORTAR EXCEL
 * -------------------------------------------*/
app.get(
  '/export',
  (req, res, next) => {
    if (!req.session || !req.session.autenticado || req.session.tipo !== 'observacion') {
      return res.redirect('/?error=Acceso denegado&redirect=/tabla');
    }
    req.observacionCode = req.session.codigoObservacion;
    return next();
  },
  async (req, res) => {
    try {
      const { from, to } = getDateRangeFromQuery(req);

      let registros = await mongoose.connection.db
        .collection('registros')
        .find()
        .toArray();

      if (req.observacionCode !== '12341') {
        const codigoIngreso = Object.keys(ingresoAObservacion)
          .find(key => ingresoAObservacion[key] === req.observacionCode);

        registros = registros.filter(r => r.codigoIngreso === codigoIngreso);
      }

      registros = registros.filter(r => withinRange(r.fecha, from, to));

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Registros');

      sheet.columns = [
        { header: 'ID Ticket', key: 'idTicket', width: 10 },
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Usuario', key: 'usuario', width: 15 },
        { header: 'Carga Para', key: 'cargaPara', width: 15 },
        { header: 'Socio', key: 'socio', width: 15 },
        { header: 'Pesada Para', key: 'pesadaPara', width: 15 },
        { header: 'Transporte', key: 'transporte', width: 15 },
        { header: 'Patentes', key: 'patentes', width: 15 },
        { header: 'Chofer', key: 'chofer', width: 15 },
        { header: 'Bruto Estimado', key: 'brutoEstimado', width: 16 },
        { header: 'Tara', key: 'tara', width: 10 },
        { header: 'Neto Estimado', key: 'netoEstimado', width: 16 },
        { header: 'Campo', key: 'campo', width: 18 },
        { header: 'Grano', key: 'grano', width: 12 },
        { header: 'Lote', key: 'lote', width: 18 },
        { header: 'Cargo De', key: 'cargoDe', width: 15 },
        { header: 'Silobolsa', key: 'silobolsa', width: 15 },
        { header: 'Contratista', key: 'contratista', width: 15 },
        { header: 'Tractor', key: 'tractor', width: 15 },
        { header: 'Bruto LOTE', key: 'brutoLote', width: 14 },
        { header: 'Comentarios', key: 'comentarios', width: 28 },
        { header: 'Bruto', key: 'bruto', width: 15 },
        { header: 'Neto', key: 'neto', width: 15 },
        { header: 'Bruto LOTE - Bruto', key: 'difBrutoLoteBruto', width: 18 },
        { header: 'Anulado', key: 'anulado', width: 10 },
        { header: 'Confirmada CAMIONES', key: 'confirmada', width: 14 },
      ];

      // Función auxiliar para calcular difBrutoLoteBruto y armar fila
      const addRowToSheet = (targetSheet, r) => {
        const netoExport = r.anulado && typeof r.neto === 'number'
          ? -Math.abs(r.neto)
          : r.neto;
        const nBrutoLote = Number(r.brutoLote);
        const nBruto = Number(r.bruto);
        const difBrutoLoteBruto =
          (typeof r.brutoLote !== 'undefined' && r.brutoLote !== null && r.brutoLote !== '' &&
           typeof r.bruto     !== 'undefined' && r.bruto     !== null && r.bruto     !== '' &&
           !Number.isNaN(nBrutoLote) && !Number.isNaN(nBruto))
            ? (nBrutoLote - nBruto)
            : '';
        const row = targetSheet.addRow({ ...r, neto: netoExport, difBrutoLoteBruto });
        if (r.anulado && netoExport != null) {
          const cell = row.getCell('neto');
          cell.font = { bold: true, color: { argb: 'FFCC0000' } };
        }
      };

      registros.forEach(r => addRowToSheet(sheet, r));

      // ── Hoja 2: cargas para SOCIO, ordenadas por fecha y luego por campo ──
      const registrosSocio = registros
        .filter(r => r.cargaPara === 'SOCIO')
        .sort((a, b) => {
          const fechaCmp = (a.fecha || '').localeCompare(b.fecha || '');
          if (fechaCmp !== 0) return fechaCmp;
          return (a.campo || '').localeCompare(b.campo || '');
        });

      const sheetSocio = workbook.addWorksheet('Cargas SOCIO');
      sheetSocio.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
      sheetSocio.getRow(1).font = { bold: true };
      registrosSocio.forEach(r => addRowToSheet(sheetSocio, r));

      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.attachment('registros.xlsx');
      await workbook.xlsx.write(res);
      return res.end();

    } catch (err) {
      return res.render('error', { error: 'Error al exportar: ' + err.message });
    }
  }
);

/* ---------------------------------------------
 * RUTA: /registro  (Ingreso de TARA inicial)
 * -------------------------------------------*/
app.get(
  '/registro',
  (req, res, next) => {
    if (!req.session || !req.session.autenticado || req.session.tipo !== 'ingreso') {
      return res.redirect('/?error=Acceso denegado&redirect=/registro');
    }
    req.ingresoCode = req.session.codigoIngreso;
    return next();
  },
  async (req, res) => {
    try {
      const newIdTicket = await calculateNextIdTicket();

      // Último usuario usado en cualquier ticket
      const ultimoRegistro = await mongoose.connection.db
        .collection('registros')
        .find()
        .sort({ idTicket: -1 })
        .limit(1)
        .toArray();

      const ultimoUsuario = ultimoRegistro.length
        ? ultimoRegistro[0].usuario
        : '';
      
      const col = mongoose.connection.db.collection('registros');

      // Tara pendientes (sin TARA FINAL)
      const pendientesTara = await col
        .find({
          pesadaPara: 'CAMIONES',
          anulado: { $ne: true },
          confirmada: { $ne: true },
          fechaTaraFinal: { $exists: false }
        })
        .sort({ idTicket: -1 })
        .toArray();

      // Registros con TARA FINAL disponibles para REGULADA.
      // Solo se muestran los del propio operador: TARA FINAL y REGULADA deben
      // ser registrados por el mismo operador, sin excepción.
      const pendientesConFinal = await col
        .find({
          pesadaPara: 'CAMIONES',
          anulado: { $ne: true },
          confirmada: { $ne: true },
          fechaTaraFinal: { $exists: true },
          fechaRegulada: { $exists: false },
          codigoIngreso: req.ingresoCode
        })
        .sort({ idTicket: -1 })
        .toArray();
      
      return res.render('registro', {
        newIdTicket,
        ultimoUsuario: req.session.nombreUsuario || req.ingresoCode || '',
        campos,
        datosSiembra,
        contratistas,
        pendientesTara,
        pendientesConFinal,
        pesadaPara: 'CAMIONES',
      });

    } catch (err) {
      console.error('Error en GET /registro:', err);
      return res.status(500).render('error', { error: 'Error interno al cargar el formulario.' });
    }
  }
);

/* ---------------------------------------------
 * CONFIRMAR TARA (previsualización)
 * -------------------------------------------*/
app.post('/confirmar-tara', (req, res) => {

  const requeridos = [
    'cargaPara',
    'transporte',
    'patentes',
    'chofer',
    'brutoEstimado'
  ];

  const faltan = missingFields(req.body, requeridos);
  if (faltan.length) {
    return res.status(400).render('error', {
      error: `Faltan campos obligatorios en CAMIONES: ${faltan.join(', ')}`
    });
  }

  const brutoEstimado = parseFloat(req.body.brutoEstimado || 0);
  const tara = parseFloat(req.body.tara || 0);
  const netoEstimado = brutoEstimado - tara;

  return res.render('confirmar-tara', {
    formData: { ...req.body, pesadaPara: 'CAMIONES' },
    brutoEstimado,
    tara,
    netoEstimado,
  });
});

/* ---------------------------------------------
 * GUARDAR TARA (primer paso del ticket)
 * -------------------------------------------*/
app.post('/guardar-tara', async (req, res) => {
  try {
    const requeridos = [
      'cargaPara',
      'transporte',
      'patentes',
      'chofer',
      'brutoEstimado'
    ];

    const faltan = missingFields(req.body, requeridos);
    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos obligatorios en CAMIONES: ${faltan.join(', ')}`
      });
    }

    // VUL-04: validar campos numéricos
    const vBruto = validarNumero(req.body.brutoEstimado, 1000, 60000);
    if (!vBruto.ok) {
      return res.status(400).render('error', { error: `Bruto Estimado inválido: ${vBruto.error}` });
    }
    // Tara es OPCIONAL en TARA: puede dejarse vacía o en 0.
    // Normalizamos posible array (confirmar-tara.ejs puede enviar el campo duplicado).
    const taraRawTara = [].concat(req.body.tara || '').filter(v => v !== '').pop() || '';
    let tara = 0;
    if (taraRawTara !== '') {
      const vTara = validarNumero(taraRawTara, 0, 30000);
      if (!vTara.ok) {
        return res.status(400).render('error', { error: `Tara inválida: ${vTara.error}` });
      }
      tara = vTara.valor;
    }

    const newIdTicket = await calculateNextIdTicket();
    const brutoEst = vBruto.valor;

    const registro = {
      idTicket: newIdTicket,
      fecha: ymd(new Date()),
      usuario: req.session.nombreUsuario || req.session.codigoIngreso || 'desconocido',
      cargaPara: req.body.cargaPara,
      socio: req.body.socio || '',
      pesadaPara: 'CAMIONES',
      transporte: req.body.transporte,
      patentes: req.body.patentes,
      chofer: req.body.chofer,
      brutoEstimado: brutoEst,
      tara: tara,
      netoEstimado: brutoEst - tara,
      anulado: false,
      modificaciones: 0,
      confirmada: false,
      codigoIngreso: req.body.code || req.session.codigoIngreso || '',
    };

    await mongoose.connection.db.collection('registros').insertOne(registro);

    return res.redirect('/registro');
  } catch (err) {
    console.error('Error en POST /guardar-tara:', err);
    return res.status(500).render('error', { error: 'Error interno al guardar el registro de CAMIONES.' });
  }
});

/* ---------------------------------------------
 * CONFIRMAR TARA FINAL (previsualización)
 * -------------------------------------------*/
app.post('/confirmar-tara-final', async (req, res) => {
  try {
    if (!req.body.code) req.body.code = req.session.codigoIngreso || '';
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());

    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}`
      });
    }

    // VUL-04: taraNueva es OBLIGATORIA en TARA FINAL, entre 1000 y 30000 kg
    const vTaraNuevaConf = validarNumero(req.body.taraNueva, 1000, 30000);
    if (!vTaraNuevaConf.ok) {
      return res.status(400).render('error', {
        error: `Tara Final inválida: ${vTaraNuevaConf.error}`
      });
    }
    const taraNueva = vTaraNuevaConf.valor;

    const col = mongoose.connection.db.collection('registros');

    // Buscar la TARA pendiente más reciente de esa patente
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'CAMIONES',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(404).render('error', {
        error: 'No se encontró ticket CAMIONES pendiente para esa patente'
      });
    }

    const brutoEstimado = parseFloat(taraDoc.brutoEstimado || 0);

    return res.render('confirmar-tara-final', {
      formData: req.body,
      brutoEstimado,
      taraNueva,
      netoEstimado: brutoEstimado - taraNueva,
      taraDoc
    });

  } catch (err) {
    return res.status(500).render('error', {
      error: 'Error en confirmar TARA FINAL: ' + err.message
    });
  }
});

/* ---------------------------------------------
 * GUARDAR TARA FINAL (actualiza el ticket existente)
 * -------------------------------------------*/
app.post('/guardar-tara-final', async (req, res) => {
  try {
    if (!req.body.code) req.body.code = req.session.codigoIngreso || '';
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());

    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}`
      });
    }

    // VUL-04: taraNueva es OBLIGATORIA en TARA FINAL, entre 1000 y 30000 kg
    const vTaraNuevaGuard = validarNumero(req.body.taraNueva, 1000, 30000);
    if (!vTaraNuevaGuard.ok) {
      return res.status(400).render('error', {
        error: `Tara Final inválida: ${vTaraNuevaGuard.error}`
      });
    }
    const taraNueva = vTaraNuevaGuard.valor;

    const col = mongoose.connection.db.collection('registros');

    // Buscar nuevamente la TARA más reciente
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'CAMIONES',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
        fechaTaraFinal: { $exists: false }
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(404).render('error', {
        error: 'No se encontró ticket CAMIONES pendiente para esa patente'
      });
    }

    // VUL-10: el ticket de TARA no puede tener más de 5 días de antigüedad
    if (!ticketVigente(taraDoc.fecha, 5)) {
      return res.status(400).render('error', {
        error: `El ticket de CAMIONES del ${taraDoc.fecha} venció (máximo 5 días). Debés anularlo y crear uno nuevo.`
      });
    }

    const brutoEstimado = parseFloat(taraDoc.brutoEstimado || 0);

    // Actualizamos los valores finales de tara.
    // Si la TARA fue grabada con el código general 56781, la transferimos al operador
    // que registra la TARA FINAL para que quede en su tabla y no en la del 12341.
    const setTaraFinal = {
      tara: taraNueva,
      netoEstimado: brutoEstimado - taraNueva,
      fechaTaraFinal: ymd(new Date()),
      fecha: ymd(new Date())
    };
    if (taraDoc.codigoIngreso === '56781') {
      setTaraFinal.codigoIngreso = req.session.codigoIngreso || '56781';
    }
    await col.updateOne(
      { _id: taraDoc._id },
      { $set: setTaraFinal }
    );

    // Notificación (no bloqueante)
    notificar({
      tipo:          'TARA FINAL',
      patentes:      req.body.patentes,
      idTicket:      String(taraDoc.idTicket || taraDoc._id),
      fecha:         ymd(new Date()),
      tara:          taraNueva,
      codigoIngreso: taraDoc.codigoIngreso || req.body.code || '',
    });

    return res.redirect('/registro');

  } catch (err) {
    console.error('Error en /guardar-tara-final:', err);
    return res.status(500).render('error', {
      error: 'Error interno al guardar la TARA FINAL.'
    });
  }
});

/* ---------------------------------------------
 * CONFIRMAR REGULADA (previsualización)
 * -------------------------------------------*/
app.post('/confirmar-regulada', (req, res) => {

  const requeridosBase = [
    'patentes', 'campo', 'grano', 'lote',
    'cargoDe', 'brutoLote',
    'confirmarTara', 'confirmarBruto'
  ];

  const faltanBase = requeridosBase.filter(f => {
    const v = req.body[f];
    return v === undefined || v === null || String(v).trim() === '';
  });

  if (faltanBase.length) {
    return res.status(400).render('error', {
      error: `Faltan campos obligatorios en REGULADA: ${faltanBase.join(', ')}`
    });
  }

  // Si es CONTRATISTA, se exigen contratista y tractor
  if (req.body.cargoDe === 'CONTRATISTA') {
    const faltanContr = [];
    if (!req.body.contratista || String(req.body.contratista).trim() === '') faltanContr.push('contratista');
    if (!req.body.tractor     || String(req.body.tractor).trim() === '')     faltanContr.push('tractor');
    if (faltanContr.length) {
      return res.status(400).render('error', {
        error: `Faltan campos obligatorios en REGULADA (CONTRATISTA): ${faltanContr.join(', ')}`
      });
    }
  }

  const toNum = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const brutoEstimado = toNum(req.body.brutoEstimado) ?? 0;
  const taraOriginal  = toNum(req.body.tara) ?? 0;

  // Bruto para REGULADA
  const bruto = (req.body.confirmarBruto === 'SI')
    ? brutoEstimado
    : (toNum(req.body.bruto) ?? 0);

  // Tara final
  const taraFinal = (req.body.confirmarTara === 'SI')
    ? taraOriginal
    : (toNum(req.body.taraNueva) ?? 0);

  const neto = (bruto != null && taraFinal != null)
    ? (bruto - taraFinal)
    : null;

  const brutoLote = toNum(req.body.brutoLote);
  if (brutoLote === null || brutoLote < 0) {
    return res.status(400).render('error', {
      error: 'Bruto LOTE debe ser un número válido (≥ 0).'
    });
  }

  const idTicketOrigen = req.body.idTicketOrigen || '';

  return res.render('confirmar-regulada', {
    formData: { ...req.body, code: req.body.code || req.session.codigoIngreso || '' },
    idTicketOrigen,
    bruto,
    tara: taraFinal,
    neto: neto ?? '',
    brutoLote,
    comentarios: (req.body.comentarios || '').trim()
  });
});

/* ---------------------------------------------
 * GUARDAR REGULADA (cierra el ticket)
 * -------------------------------------------*/
app.post('/guardar-regulada', async (req, res) => {
  try {
    if (!req.body.code) req.body.code = req.session.codigoIngreso || '';

    const requeridosBase = [
      'patentes', 'campo', 'grano', 'lote',
      'cargoDe', 'brutoLote',
      'confirmarTara', 'confirmarBruto', 'code'
    ];

    const faltanBase = requeridosBase.filter(f => {
      const v = req.body[f];
      return v === undefined || v === null || String(v).trim() === '';
    });

    if (faltanBase.length) {
      return res.status(400).render('error', {
        error: `Faltan campos obligatorios en REGULADA: ${faltanBase.join(', ')}`
      });
    }

    // Si es CONTRATISTA, se exigen contratista y tractor
    if (req.body.cargoDe === 'CONTRATISTA') {
      const faltanContr = [];
      if (!req.body.contratista || String(req.body.contratista).trim() === '') faltanContr.push('contratista');
      if (!req.body.tractor     || String(req.body.tractor).trim() === '')     faltanContr.push('tractor');
      if (faltanContr.length) {
        return res.status(400).render('error', {
          error: `Faltan campos obligatorios en REGULADA (CONTRATISTA): ${faltanContr.join(', ')}`
        });
      }
    }

    if (req.body.confirmarTara === 'NO' && !req.body.taraNueva) {
      return res.status(400).render('error', {
        error: 'Debe informar Tara Nueva (kg) si no confirma la Tara.'
      });
    }

    if (req.body.confirmarBruto === 'NO' && !req.body.bruto) {
      return res.status(400).render('error', {
        error: 'Debe informar Bruto (kg) si no confirma el Bruto estimado.'
      });
    }

    // VUL-04: resolver y validar valores numéricos de REGULADA
    const brutoRaw = req.body.confirmarBruto === 'SI'
      ? req.body.brutoEstimado
      : req.body.bruto;
    const vBrutoReg = validarNumero(brutoRaw, 0, 60000);
    if (!vBrutoReg.ok) {
      return res.status(400).render('error', { error: `Bruto inválido: ${vBrutoReg.error}` });
    }
    const bruto = vBrutoReg.valor;

    // Si confirmarTara='SI' se usa la tara original del ticket (ya validada al crear).
    // Si confirmarTara='NO' el operador ingresa una nueva → mismas reglas que TARA FINAL (1000–30000 kg).
    const taraRaw = req.body.confirmarTara === 'SI'
      ? req.body.tara
      : req.body.taraNueva;
    let taraFinal;
    if (req.body.confirmarTara === 'NO') {
      const vTaraReg = validarNumero(taraRaw, 1000, 30000);
      if (!vTaraReg.ok) {
        return res.status(400).render('error', { error: `Tara corregida inválida: ${vTaraReg.error}` });
      }
      taraFinal = vTaraReg.valor;
    } else {
      taraFinal = parseFloat(taraRaw) || 0;
    }

    const vBrutoLote = validarNumero(req.body.brutoLote, 0, 60000);
    if (!vBrutoLote.ok) {
      return res.status(400).render('error', { error: `Bruto Lote inválido: ${vBrutoLote.error}` });
    }
    const brutoLote = vBrutoLote.valor;
    const comentarios = String(req.body.comentarios || '');

    const col = mongoose.connection.db.collection('registros');

    let taraDoc = null;

    // Preferimos idTicketOrigen
    if (req.body.idTicketOrigen) {
      try {
        taraDoc = await col.findOne({
          _id: new mongoose.Types.ObjectId(req.body.idTicketOrigen)
        });
      } catch (_) {
        taraDoc = null;
      }
    }

    // Fallback por patente (si no llegó el campo hidden)
    if (!taraDoc) {
      taraDoc = await col.findOne(
        {
          pesadaPara: 'CAMIONES',
          patentes: req.body.patentes,
          anulado: { $ne: true },
          confirmada: { $ne: true },
        },
        { sort: { idTicket: -1 } }
      );
    }

    if (!taraDoc) {
      return res.status(400).render('error', {
        error: 'No se encontró ticket CAMIONES pendiente para esa patente.'
      });
    }

    // REGULADA requiere TARA FINAL previa obligatoriamente
    if (!taraDoc.fechaTaraFinal) {
      return res.status(400).render('error', {
        error: 'No se puede registrar REGULADA sin un ticket de TARA FINAL previo.'
      });
    }

    // El operador de REGULADA debe ser el mismo que registró la TARA FINAL
    if (taraDoc.codigoIngreso !== req.session.codigoIngreso) {
      return res.status(403).render('error', {
        error: 'El operador de REGULADA debe ser el mismo que registró la TARA FINAL.'
      });
    }

    // VUL-10: el ticket de TARA no puede tener más de 5 días de antigüedad
    if (!ticketVigente(taraDoc.fecha, 5)) {
      return res.status(400).render('error', {
        error: `El ticket de CAMIONES del ${taraDoc.fecha} venció (máximo 5 días). Debés anularlo y crear uno nuevo.`
      });
    }

    // Actualización a REGULADA.
    // Si la TARA fue grabada con el código general 56781 y no fue transferida en TARA FINAL,
    // la transferimos aquí para que quede en la tabla del operador y no en la del 12341.
    const setRegulada = {
      fecha: ymd(new Date()),
      pesadaPara: 'REGULADA',

      campo: req.body.campo,
      grano: req.body.grano,
      lote: req.body.lote,
      cargoDe: req.body.cargoDe,

      silobolsa:
        req.body.cargoDe === 'SILOBOLSA' ? (req.body.silobolsa || '') : '',

      contratista:
        req.body.cargoDe === 'CONTRATISTA' ? (req.body.contratista || '') : '',

      tractor:
        req.body.cargoDe === 'CONTRATISTA' ? (req.body.tractor || '') : '',

      bruto,
      tara: taraFinal,
      neto: bruto - taraFinal,

      brutoLote,
      comentarios,

      fechaRegulada: ymd(new Date()),
      confirmada: true
    };
    if (taraDoc.codigoIngreso === '56781') {
      setRegulada.codigoIngreso = req.session.codigoIngreso || '56781';
    }
    await col.updateOne(
      { _id: taraDoc._id },
      { $set: setRegulada }
    );

    // Notificación (no bloqueante)
    notificar({
      tipo: 'REGULADA',
      patentes:  req.body.patentes,
      idTicket:  String(taraDoc.idTicket || taraDoc._id),
      fecha:     ymd(new Date()),
      tara:      taraFinal,
      bruto,
      neto:      bruto - taraFinal,
      campo:         req.body.campo || '',
      grano:         req.body.grano || '',
      lote:          req.body.lote  || '',
      codigoIngreso: taraDoc.codigoIngreso || req.body.code || '',
    });

    // El operador de ingreso no puede ver /tabla directamente.
    // Lo llevamos al login de Ver Registros para que ingrese su código de observación.
    return res.redirect('/login/tabla');

  } catch (err) {
    console.error('Error en /guardar-regulada:', err);
    return res.status(500).render('error', { error: 'Error interno al guardar la REGULADA.' });
  }
});

/* ---------------------------------------------
 * MODIFICAR (GET)
 * -------------------------------------------*/
app.get(
  '/modificar/:id',
  (req, res, next) => {
    if (!req.session || !req.session.autenticado) {
      return res.redirect('/?error=Sesión expirada');
    }
    return next();
  },
  async (req, res) => {
    try {
      const registro = await mongoose.connection.db
        .collection('registros')
        .findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });

      if (!registro)
        return res.render('error', { error: 'Registro no encontrado' });

      if (registro.anulado)
        return res.render('error', { error: 'Registro anulado' });

      if (registro.pesadaPara !== 'REGULADA')
        return res.render('error', { error: 'Solo se pueden modificar registros que ya completaron el ticket de REGULADA.' });

      if ((registro.modificaciones || 0) >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

      if (!ticketVigente(registro.fechaTaraFinal, 1))
        return res.render('error', { error: 'El plazo para modificar este registro venció. Solo se permite modificar hasta 1 día después del registro de TARA FINAL.' });

      return res.render('modificar', {
        registro,
        campos,
        datosSiembra,
        contratistas,
      });
    } catch (err) {
      console.error('Error en GET /modificar:', err);
      return res.status(500).render('error', { error: 'Error interno al cargar el formulario de modificación.' });
    }
  }
);

/* ---------------------------------------------
 * MODIFICAR (PUT)
 * -------------------------------------------*/
app.put(
  '/modificar/:id',
  (req, res, next) => {
    if (!req.session || !req.session.autenticado) {
      return res.redirect('/?error=Sesión expirada');
    }
    return next();
  },
  async (req, res) => {
    try {
      const col = mongoose.connection.db.collection('registros');
      const _id = new mongoose.Types.ObjectId(req.params.id);

      const registro = await col.findOne({ _id });
      if (!registro)
        return res.render('error', { error: 'Registro no encontrado' });

      if (registro.anulado)
        return res.render('error', { error: 'Registro anulado' });

      if (registro.pesadaPara !== 'REGULADA')
        return res.render('error', { error: 'Solo se pueden modificar registros que ya completaron el ticket de REGULADA.' });

      if ((registro.modificaciones || 0) >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

      if (!ticketVigente(registro.fechaTaraFinal, 1))
        return res.render('error', { error: 'El plazo para modificar este registro venció. Solo se permite modificar hasta 1 día después del registro de TARA FINAL.' });

      // Solo se modifican los campos permitidos; los bloqueados se preservan del registro original.
      const tara = parseFloat(req.body.tara || 0);

      const updateData = {
        // Campos editables
        patentes:     (req.body.patentes    || '').trim(),
        chofer:       (req.body.chofer      || '').trim(),
        tara,
        netoEstimado: (registro.brutoEstimado || 0) - tara,
        neto:         (registro.bruto        || 0) - tara,
        cargoDe:      req.body.cargoDe || registro.cargoDe,
        silobolsa:    req.body.cargoDe === 'SILOBOLSA'   ? (req.body.silobolsa   || '').trim() : '',
        contratista:  req.body.cargoDe === 'CONTRATISTA' ? (req.body.contratista || '').trim() : '',
        tractor:      req.body.cargoDe === 'CONTRATISTA' ? (req.body.tractor     || '').trim() : '',
        comentarios:  (req.body.comentarios || '').trim(),
        modificaciones: (registro.modificaciones || 0) + 1,
      };

      // Auditoría: guardar estado anterior completo antes de modificar
      const auditCol2 = mongoose.connection.db.collection('registros_auditoria');
      const camposAnteriores = {};
      Object.keys(updateData).forEach(k => {
        if (registro[k] !== updateData[k]) camposAnteriores[k] = registro[k];
      });
      await auditCol2.insertOne({
        tipoOperacion: 'MODIFICACION',
        registroId: _id,
        camposAnteriores,
        camposNuevos: updateData,
        usuario: req.session.codigoIngreso || req.session.codigoObservacion || 'desconocido',
        timestamp: new Date(),
      });

      await col.updateOne({ _id }, { $set: updateData });

      return res.redirect('/tabla');

    } catch (err) {
      console.error('Error en PUT /modificar/:id:', err);
      return res.status(500).render('error', { error: 'Error interno al modificar el registro.' });
    }
  }
);

/* ---------------------------------------------
 * ANULAR — Helper
 * VUL-05: soft-delete con auditoría (no sobrescribe datos históricos)
 * VUL-13: sin stack traces expuestos
 * VUL-14: validación de ObjectId
 * -------------------------------------------*/
async function handleAnular(req, res) {
  try {
    // VUL-14: validar ObjectId antes de cualquier operación
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).render('error', { error: 'ID de registro inválido.' });
    }

    const col     = mongoose.connection.db.collection('registros');
    const auditCol = mongoose.connection.db.collection('registros_auditoria');
    const _id     = new mongoose.Types.ObjectId(req.params.id);

    // VUL-05: obtener registro original ANTES de modificar
    const registroOriginal = await col.findOne({ _id });
    if (!registroOriginal) {
      return res.status(404).render('error', { error: 'Registro no encontrado.' });
    }
    if (registroOriginal.anulado) {
      return res.status(400).render('error', { error: 'El registro ya está anulado.' });
    }

    // VUL-05: guardar copia completa en auditoría ANTES de cambios
    await auditCol.insertOne({
      tipoOperacion: 'ANULACION',
      registroId:       _id,
      registroOriginal: { ...registroOriginal },
      usuarioAnula:     req.session.codigoIngreso || req.observacionCode || 'desconocido',
      fechaOperacion:   new Date(),
    });

    // VUL-05: soft-delete — solo marcar anulado, NUNCA sobrescribir datos
    await col.updateOne(
      { _id },
      {
        $set: {
          anulado:        true,
          fechaAnulacion: new Date(),
        },
      }
    );

    return res.redirect('/tabla');
  } catch (err) {
    // VUL-13: no exponer stack trace al cliente
    console.error('Error en handleAnular:', err);
    return res.status(500).render('error', { error: 'Error interno al anular el registro.' });
  }
}

/* ---------------------------------------------
 * Verificar Código Observación
 * -------------------------------------------*/
function verificarCodeObservacion(req, res, next) {
  if (!req.session || !req.session.autenticado) {
    return res.redirect('/?error=Sesión expirada');
  }
  req.observacionCode = req.session.codigoObservacion;
  return next();
}

/* ---------------------------------------------
 * ANULAR por PUT
 * -------------------------------------------*/
app.put('/anular/:id', verificarCodeObservacion, handleAnular);

/* ---------------------------------------------
 * ANULAR por POST (fallback)
 * -------------------------------------------*/
app.post('/anular/:id', verificarCodeObservacion, handleAnular);

/* ---------------------------------------------
 * REPORTE DIARIO POR EMAIL (19:00 hora Argentina)
 * -------------------------------------------*/

/**
 * Genera un buffer Excel con los registros de las últimas 24 horas.
 * Reutiliza las mismas columnas que el botón "Exportar a Excel".
 */
async function generarExcelReporteDiario() {
  // Últimas 24 horas: hoy y ayer en formato YYYY-MM-DD
  const hoy = ymd(new Date());
  const ayer = ymd(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const registros = await mongoose.connection.db
    .collection('registros')
    .find({ fecha: { $in: [hoy, ayer] } })
    .sort({ idTicket: 1 })
    .toArray();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Registros');

  sheet.columns = [
    { header: 'ID Ticket',       key: 'idTicket',       width: 10 },
    { header: 'Fecha',           key: 'fecha',          width: 15 },
    { header: 'Usuario',         key: 'usuario',        width: 15 },
    { header: 'Carga Para',      key: 'cargaPara',      width: 15 },
    { header: 'Socio',           key: 'socio',          width: 15 },
    { header: 'Pesada Para',     key: 'pesadaPara',     width: 15 },
    { header: 'Transporte',      key: 'transporte',     width: 15 },
    { header: 'Patentes',        key: 'patentes',       width: 15 },
    { header: 'Chofer',          key: 'chofer',         width: 15 },
    { header: 'Bruto Estimado',  key: 'brutoEstimado',  width: 16 },
    { header: 'Tara',            key: 'tara',           width: 10 },
    { header: 'Neto Estimado',   key: 'netoEstimado',   width: 16 },
    { header: 'Campo',           key: 'campo',          width: 18 },
    { header: 'Grano',           key: 'grano',          width: 12 },
    { header: 'Lote',            key: 'lote',           width: 18 },
    { header: 'Cargo De',        key: 'cargoDe',        width: 15 },
    { header: 'Silobolsa',       key: 'silobolsa',      width: 15 },
    { header: 'Contratista',     key: 'contratista',    width: 15 },
    { header: 'Tractor',         key: 'tractor',        width: 15 },
    { header: 'Bruto LOTE',      key: 'brutoLote',      width: 14 },
    { header: 'Comentarios',     key: 'comentarios',    width: 28 },
    { header: 'Bruto',           key: 'bruto',          width: 15 },
    { header: 'Neto',            key: 'neto',           width: 15 },
    { header: 'Bruto LOTE - Bruto', key: 'difBrutoLoteBruto', width: 18 },
    { header: 'Anulado',         key: 'anulado',        width: 10 },
    { header: 'Confirmada CAMIONES', key: 'confirmada',     width: 14 },
  ];

  // Cabecera en negrita
  sheet.getRow(1).font = { bold: true };

  // Función auxiliar para calcular difBrutoLoteBruto y armar fila
  const addRowToSheetDiario = (targetSheet, r) => {
    const netoExport = r.anulado && typeof r.neto === 'number'
      ? -Math.abs(r.neto)
      : r.neto;
    const nBrutoLote = Number(r.brutoLote);
    const nBruto = Number(r.bruto);
    const difBrutoLoteBruto =
      (typeof r.brutoLote !== 'undefined' && r.brutoLote !== null && r.brutoLote !== '' &&
       typeof r.bruto     !== 'undefined' && r.bruto     !== null && r.bruto     !== '' &&
       !Number.isNaN(nBrutoLote) && !Number.isNaN(nBruto))
        ? (nBrutoLote - nBruto)
        : '';
    const row = targetSheet.addRow({
      ...r,
      neto: netoExport,
      difBrutoLoteBruto,
      anulado: r.anulado ? 'ANULADO' : '',
    });
    if (r.anulado && netoExport != null) {
      const cell = row.getCell('neto');
      cell.font = { bold: true, color: { argb: 'FFCC0000' } };
    }
  };

  registros.forEach(r => addRowToSheetDiario(sheet, r));

  // ── Hoja 2: cargas para SOCIO, ordenadas por fecha y luego por campo ──
  const registrosSocioDiario = registros
    .filter(r => r.cargaPara === 'SOCIO')
    .sort((a, b) => {
      const fechaCmp = (a.fecha || '').localeCompare(b.fecha || '');
      if (fechaCmp !== 0) return fechaCmp;
      return (a.campo || '').localeCompare(b.campo || '');
    });

  const sheetSocioDiario = workbook.addWorksheet('Cargas SOCIO');
  sheetSocioDiario.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
  sheetSocioDiario.getRow(1).font = { bold: true };
  registrosSocioDiario.forEach(r => addRowToSheetDiario(sheetSocioDiario, r));

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, total: registros.length, fecha: hoy };
}

/**
 * Envía el reporte diario por email con el Excel adjunto.
 */
async function enviarReporteDiario() {
  try {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const to   = process.env.EMAIL_TO;

    if (!user || !pass || !to) {
      console.warn('[Reporte Diario] Variables de email no configuradas. Se omite envío.');
      return;
    }

    const { buffer, total, fecha } = await generarExcelReporteDiario();

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const asunto = `[Pesada Balanza] Reporte diario – ${fecha} (${total} ticket${total !== 1 ? 's' : ''})`;

    const cuerpoHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2 style="color:#2c7be5">Pesada Balanza</h2>
        <p>Reporte diario de registros correspondientes al <strong>${fecha}</strong>.</p>
        <p>Total de tickets en las últimas 24 hs: <strong>${total}</strong></p>
        <p style="color:#888;font-size:13px">El archivo Excel adjunto incluye todos los tipos de ticket (CAMIONES, TARA FINAL y REGULADA).</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Pesada Balanza" <${user}>`,
      to,
      subject: asunto,
      html: cuerpoHtml,
      attachments: [
        {
          filename: `registros_${fecha}.xlsx`,
          content: buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(`[Reporte Diario] Email enviado a ${to} – ${total} tickets del ${fecha}`);
  } catch (err) {
    console.error('[Reporte Diario] Error al enviar reporte:', err.message);
  }
}

// Todos los días a las 19:00 hora de Argentina
cron.schedule('0 19 * * *', () => {
  console.log('[Reporte Diario] Iniciando envío del reporte diario...');
  enviarReporteDiario();
}, {
  timezone: 'America/Argentina/Buenos_Aires'
});

/* ---------------------------------------------
 * SERVER
 * -------------------------------------------*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
