require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const ExcelJS = require('exceljs');
const path = require('path');

const app = express();

/* ---------------------------------------------
 * MONGODB
 * -------------------------------------------*/
mongoose.set('strictQuery', true);
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://pesadabalanzauser:mongo405322@pesada-balanza-cluster.dnc7i.mongodb.net/pesada-balanza?retryWrites=true&w=majority&appName=pesada-balanza-cluster';

mongoose
  .connect(MONGODB_URI)
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
 * DATOS (campos y datosSiembra)
 * -------------------------------------------*/
const campos = [
  "El Centinela - ESTACION RAMS SF",
  "El Rodeo - TOSTADO SF",
  "Los Molinos - TOSTADO SF",
  "Charata - CHARATA - CH",
  "El Mataco - SACHAYOJ - SE",
  "La Porfía - ARBOL BLANCO - SE",
  "La Pradera - ARBOL BLANCO - SE",
  "Tierra Negra - ARBOL BLANCO - SE",
  "El C 1 Ciriaci - TINTINA - SE",
  "Wichi - SACHAYOJ - SE"
].sort();

const datosSiembra = {
  "El Centinela - ESTACION RAMS SF": {
    "GIRASOL": [
      "LOTE 1 - El Centinela", "LOTE 2 - El Centinela", "LOTE 3 - El Centinela",
      "LOTE 4 - El Centinela", "LOTE 5 - El Centinela", "LOTE 6 - El Centinela"
    ]
  },
  "El Rodeo - TOSTADO SF": {
    "GIRASOL": [
      "Lote 1 Chico - El Rodeo", "Lote 1 Grande - El Rodeo", "Lote 2 Este - El Rodeo",
      "Lote 2 Oeste - El Rodeo", "Lote 3 Este - El Rodeo", "Lote 3 Oeste - El Rodeo",
      "Lote 4 Este - El Rodeo", "Lote 4 Oeste - El Rodeo", "Lote 5 Este - El Rodeo",
      "Lote 5 Oeste - El Rodeo", "Lote 6 - El Rodeo", "Lote 7 - El Rodeo", "Lote 8 - El Rodeo",
      "Lote 9 E - El Rodeo", "Lote 9 O - El Rodeo", "Lote Banquina - El Rodeo", "Lote Camino - El Rodeo"
    ]
  },
  "Los Molinos - TOSTADO SF": {
    "GIRASOL": [
      "Lote2 - Los Molinos", "Lote4 - Los Molinos"
    ]
  },
  "Wichi - SACHAYOJ - SE": {
    "MAIZ": [
      "Lote 1 Wichi","Lote 2 Wichi","Lote 3 Wichi",
      "Lote 4 Wichi","Lote 5 Wichi","Lote 6 Wichi",
      "Lote 7 Wichi"
    ]
  },
  "El C 1 Ciriaci - TINTINA - SE": {
    "MAIZ": [
      "Lote 1 Ciriaci C1","Lote 2 Ciriaci C1","Lote 3 Ciriaci C1",
      "Lote 4 Ciriaci C1","Lote 5 Ciriaci C1","Lote 6 Ciriaci C1",
      "Lote 7 Ciriaci C1","Lote 8 Ciriaci C1","Lote 9 Ciriaci C1"
    ]
  },
  "El Mataco - SACHAYOJ - SE": {
    "TRIGO": [
      "Lote 1 El Mataco","Lote 2 El Mataco","Lote 3 El Mataco",
      "Lote 4 El Mataco","Lote 5 El Mataco","Lote Banquina El Mataco"
    ]
  },
  "La Porfía - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 10 La Porfía","Lote 11 La Porfía"
    ]
  },
  "Charata - CHARATA - CH": {
    "TRIGO": [
      "Lote 1 Charata","Lote 3 Charata"
    ]
  },
  "Tierra Negra - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 4 Tierra Negra","Lote 5 Tierra Negra","Lote 6 Tierra Negra",
      "Lote 7 Tierra Negra","Lote 8 Tierra Negra","Lote 9 Tierra Negra",
      "Lote 10 Tierra Negra","Loter Banq. Tierra N"
    ]
  },
  "La Pradera - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 34 La Pradera","Lote 17 La Pradera","Lote 20 La Pradera",
      "Lote 21 La Pradera","Lote 31 La Pradera","Lote 37 La Pradera",
      "Lote 38 W La Pradera","Lote 41.E.3 La Prade","Lote 41.E.4 La Prade",
      "Lote 41.E.5 La Prade","Lote 41.E.6 La Prade","Lote 41.E.7 La Prade",
      "Lote 41.E.8 La Prade","Lote 38 E La Pradera","Cabezeras L. 39 y 43"
    ]
  }
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
      pesadaPara: 'TARA',
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
    return res.status(500).send('Internal Server Error: No se pudo conectar a MongoDB');
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
app.post('/', (req, res) => {
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

    const redirectValido = (r) =>
      typeof r === 'string' && (r.includes('/registro') || r.includes('/tabla'));

    const destino = redirectValido(redirect)
      ? redirect
      : (esIngreso ? '/registro' : '/tabla');

    return res.redirect(destino + '?code=' + encodeURIComponent(code));
  } catch (err) {
    console.error('Error en POST /:', err);
    return res.status(500).send('Internal Server Error');
  }
});

/* ---------------------------------------------
 * RUTA: TABLA
 * -------------------------------------------*/
app.get(
  '/tabla',
  (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosObservacion.includes(code)) {
      req.observacionCode = code;
      return next();
    }
    return res.redirect('/?error=Código incorrecto&redirect=/tabla');
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
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

/* ---------------------------------------------
 * EXPORTAR EXCEL
 * -------------------------------------------*/
app.get(
  '/export',
  (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosObservacion.includes(code)) {
      req.observacionCode = code;
      return next();
    }
    return res.redirect('/?error=Código incorrecto');
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
        { header: 'Bruto LOTE', key: 'brutoLote', width: 14 },
        { header: 'Comentarios', key: 'comentarios', width: 28 },
        { header: 'Bruto', key: 'bruto', width: 15 },
        { header: 'Neto', key: 'neto', width: 15 },
        { header: 'Anulado', key: 'anulado', width: 10 },
        { header: 'Confirmada TARA', key: 'confirmada', width: 14 },
      ];

      registros.forEach(r => sheet.addRow(r));

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
    const code = req.query.code || req.body.code;
    if (codigosIngreso.includes(code)) {
      req.ingresoCode = code;
      return next();
    }
    return res.redirect('/?error=Código incorrecto&redirect=/registro');
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
          pesadaPara: 'TARA',
          anulado: { $ne: true },
          confirmada: { $ne: true },
          fechaTaraFinal: { $exists: false }
        })
        .sort({ idTicket: -1 })
        .toArray();
      
      // Registros con TARA FINAL (disponibles para REGULADA)
      const pendientesConFinal = await col
        .find({
          pesadaPara: 'TARA',
          anulado: { $ne: true },
          confirmada: { $ne: true },
          fechaTaraFinal: { $exists: true },
          fechaRegulada: { $exists: false }
        })
        .sort({ idTicket: -1 })
        .toArray();
      
      return res.render('registro', {
        code: req.ingresoCode,
        newIdTicket,
        ultimoUsuario,
        campos,
        datosSiembra,
        pendientesTara,
        pendientesConFinal,
        pesadaPara: 'TARA', // Muestra TARA por defecto en el formulario
      });

    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

/* ---------------------------------------------
 * CONFIRMAR TARA (previsualización)
 * -------------------------------------------*/
app.post('/confirmar-tara', (req, res) => {

  const requeridos = [
    'usuario',
    'cargaPara',
    'transporte',
    'patentes',
    'chofer',
    'brutoEstimado'
  ];

  const faltan = missingFields(req.body, requeridos);
  if (faltan.length) {
    return res.status(400).render('error', {
      error: `Faltan campos obligatorios en TARA: ${faltan.join(', ')}`
    });
  }

  const brutoEstimado = parseFloat(req.body.brutoEstimado || 0);
  const tara = parseFloat(req.body.tara || 0);
  const netoEstimado = brutoEstimado - tara;

  return res.render('confirmar-tara', {
    formData: { ...req.body, pesadaPara: 'TARA' },
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
      'usuario',
      'cargaPara',
      'transporte',
      'patentes',
      'chofer',
      'brutoEstimado'
    ];

    const faltan = missingFields(req.body, requeridos);
    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos obligatorios en TARA: ${faltan.join(', ')}`
      });
    }

    const newIdTicket = await calculateNextIdTicket();
    const brutoEst = parseFloat(req.body.brutoEstimado || 0);
    const tara = parseFloat(req.body.tara || 0);

    const registro = {
      idTicket: newIdTicket,
      fecha: ymd(new Date()),
      usuario: req.body.usuario,
      cargaPara: req.body.cargaPara,
      socio: req.body.socio || '',
      pesadaPara: 'TARA',
      transporte: req.body.transporte,
      patentes: req.body.patentes,
      chofer: req.body.chofer,
      brutoEstimado: brutoEst,
      tara: tara,
      netoEstimado: brutoEst - tara,
      anulado: false,
      modificaciones: 0,
      confirmada: false,
      codigoIngreso: req.body.code,
    };

    await mongoose.connection.db.collection('registros').insertOne(registro);

    const codigoObservacion = ingresoAObservacion[req.body.code];
    return res.redirect(`/tabla?code=${codigoObservacion}`);
  } catch (err) {
    return res.status(500).send('Internal Server Error: ' + err.message);
  }
});

/* ---------------------------------------------
 * CONFIRMAR TARA FINAL (previsualización)
 * -------------------------------------------*/
app.post('/confirmar-tara-final', async (req, res) => {
  try {
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());

    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}`
      });
    }

    const taraNueva = parseFloat(req.body.taraNueva || 0);
    if (!(taraNueva >= 0)) {
      return res.status(400).render('error', {
        error: 'Tara Nueva (kg) debe ser un número válido'
      });
    }

    const col = mongoose.connection.db.collection('registros');

    // Buscar la TARA pendiente más reciente de esa patente
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'TARA',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(404).render('error', {
        error: 'No se encontró TARA pendiente para esa patente'
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
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());

    if (faltan.length) {
      return res.status(400).render('error', {
        error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}`
      });
    }

    const taraNueva = parseFloat(req.body.taraNueva || 0);
    if (!(taraNueva >= 0)) {
      return res.status(400).render('error', {
        error: 'Tara Nueva (kg) debe ser un número válido'
      });
    }

    const col = mongoose.connection.db.collection('registros');

    // Buscar nuevamente la TARA más reciente
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'TARA',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
        fechaTaraFinal: { $exists: false }
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(404).render('error', {
        error: 'No se encontró TARA pendiente para esa patente'
      });
    }

    const brutoEstimado = parseFloat(taraDoc.brutoEstimado || 0);

    // Actualizamos SOLO los valores finales de tara
    await col.updateOne(
      { _id: taraDoc._id },
      {
        $set: {
          tara: taraNueva,
          netoEstimado: brutoEstimado - taraNueva,
          fechaTaraFinal: ymd(new Date())
        }
      }
    );

    const codigoObservacion = ingresoAObservacion[req.body.code] || '12341';
    return res.redirect(`/tabla?code=${codigoObservacion}`);

  } catch (err) {
    return res.status(500).render('error', {
      error: 'Error al guardar TARA FINAL: ' + err.message
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
    formData: req.body,
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

    const bruto = req.body.confirmarBruto === 'SI'
      ? parseFloat(req.body.brutoEstimado || 0)
      : parseFloat(req.body.bruto || 0);

    const taraFinal = req.body.confirmarTara === 'SI'
      ? parseFloat(req.body.tara || 0)
      : parseFloat(req.body.taraNueva || 0);

    const brutoLote = parseFloat(req.body.brutoLote || 0);
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
          pesadaPara: 'TARA',
          patentes: req.body.patentes,
          anulado: { $ne: true },
          confirmada: { $ne: true },
        },
        { sort: { idTicket: -1 } }
      );
    }

    if (!taraDoc) {
      return res.status(400).render('error', {
        error: 'No se encontró TARA pendiente para esa patente.'
      });
    }

    // Actualización a REGULADA
    await col.updateOne(
      { _id: taraDoc._id },
      {
        $set: {
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

          bruto,
          tara: taraFinal,
          neto: bruto - taraFinal,

          brutoLote,
          comentarios,

          fechaRegulada: ymd(new Date()),
          confirmada: true
        }
      }
    );

    const codigoObservacion = ingresoAObservacion[req.body.code] || '12341';
    return res.redirect(`/tabla?code=${codigoObservacion}`);

  } catch (err) {
    console.error('Error en /guardar-regulada:', err);
    return res.status(500).render('error', {
      error: 'Internal Server Error: ' + err.message
    });
  }
});

/* ---------------------------------------------
 * MODIFICAR (GET)
 * -------------------------------------------*/
app.get(
  '/modificar/:id',
  (req, res, next) => {
    const code = req.query.code || req.body.code || req.query.observacionCode;
    if (code === '9999') return next();
    return res.redirect('/?error=Código incorrecto');
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

      if ((registro.modificaciones || 0) >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

      const observacionCode =
        req.query.code || req.query.observacionCode || req.body.code || '';

      return res.render('modificar', {
        registro,
        campos,
        datosSiembra,
        observacionCode
      });
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

/* ---------------------------------------------
 * MODIFICAR (PUT)
 * -------------------------------------------*/
app.put(
  '/modificar/:id',
  (req, res, next) => {
    const code = req.query.code || req.body.code || req.query.observacionCode;
    if (code === '9999') return next();
    return res.redirect('/?error=Código incorrecto');
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

      if ((registro.modificaciones || 0) >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

      /* -------------------------------------------------------
       * CASO 1: REGULADA cerrada → solo Comentarios
       * ------------------------------------------------------*/
      if (registro.confirmada && registro.pesadaPara === 'REGULADA') {
        const comentarios = (req.body.comentarios || '').trim();

        await col.updateOne(
          { _id },
          {
            $set: {
              comentarios,
              modificaciones: (registro.modificaciones || 0) + 1
            }
          }
        );

        const codigoObservacion =
          ingresoAObservacion[registro.codigoIngreso] || '12341';

        return res.redirect(`/tabla?code=${codigoObservacion}`);
      }

      /* -------------------------------------------------------
       * CASO 2: Registro NO cerrado → edición completa
       * ------------------------------------------------------*/

      const brutoEstimado = parseFloat(req.body.brutoEstimado || 0);
      const tara = parseFloat(req.body.tara || 0);

      const updateData = {
        idTicket: parseInt(req.body.idTicket),
        fecha: req.body.fecha,
        usuario: req.body.usuario,
        cargaPara: req.body.cargaPara,
        socio: req.body.socio || '',
        pesadaPara: req.body.pesadaPara,
        transporte: req.body.transporte,
        patentes: req.body.patentes,
        chofer: req.body.chofer,
        brutoEstimado,
        tara,
        netoEstimado: brutoEstimado - tara,

        campo: req.body.campo,
        grano: req.body.grano || registro.grano,
        lote: req.body.lote,
        cargoDe: req.body.cargoDe,

        silobolsa:
          req.body.cargoDe === 'SILOBOLSA'
            ? (req.body.silobolsa || '')
            : '',

        contratista:
          req.body.cargoDe === 'CONTRATISTA'
            ? (req.body.contratista || '')
            : '',

        bruto: parseFloat(req.body.bruto || 0),
        neto: parseFloat(req.body.bruto || 0) - tara,

        comentarios: (req.body.comentarios || '').trim(),

        modificaciones: (registro.modificaciones || 0) + 1,
      };

      await col.updateOne({ _id }, { $set: updateData });

      const codigoObservacion =
        ingresoAObservacion[registro.codigoIngreso] || '12341';

      return res.redirect(`/tabla?code=${codigoObservacion}`);

    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

/* ---------------------------------------------
 * ANULAR — Helper
 * -------------------------------------------*/
async function handleAnular(req, res) {
  try {
    await mongoose.connection.db.collection('registros').updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      {
        $set: {
          brutoEstimado: 0,
          netoEstimado: 0,
          tara: 0,
          bruto: 0,
          neto: 0,
          anulado: true,
        },
      }
    );

    const code = req.query.code || req.body.code || req.observacionCode || '12341';

    return res.redirect(`/tabla?code=${encodeURIComponent(code)}`);
  } catch (err) {
    return res.status(500).send('Internal Server Error: ' + err.message);
  }
}

/* ---------------------------------------------
 * Verificar Código Observación
 * -------------------------------------------*/
function verificarCodeObservacion(req, res, next) {
  const code = req.query.code || req.body.code;

  if (codigosObservacion.includes(code)) {
    req.observacionCode = code;
    return next();
  }

  return res.redirect('/?error=Código incorrecto');
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
 * SERVER
 * -------------------------------------------*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
