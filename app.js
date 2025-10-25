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
const codigosIngreso = ['56781', '5679', '5680', '5681', '5682', '5683', '5684', '5685'];
const codigosObservacion = ['12341', '1235', '1236', '1237', '1238', '1239', '1240', '1241'];
const ingresoAObservacion = {
  '56781': '12341',
  '5679': '1235',
  '5680': '1236',
  '5681': '1237',
  '5682': '1238',
  '5683': '1239',
  '5684': '1240',
  '5685': '1241',
};

/* ---------------------------------------------
 * DATOS (campos y datosSiembra)
 * -------------------------------------------*/
const campos = [
  "Charata - CHARATA - CH",
  "El Mataco - SACHAYOJ - SE",
  "La Porfía - ARBOL BLANCO - SE",
  "La Pradera - ARBOL BLANCO - SE",
  "Tierra Negra - ARBOL BLANCO - SE"
].sort();

const datosSiembra = {
  "El Mataco - SACHAYOJ - SE": {
    "TRIGO": [
      "Lote 1 El Mataco",
      "Lote 2 El Mataco",
      "Lote 3 El Mataco",
      "Lote 4 El Mataco",
      "Lote 5 El Mataco",
      "Lote Banquina El Mat"
    ]
  },
  "La Porfía - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 10 La Porfía",
      "Lote 11 La Porfía"
    ]
  },
  "Charata - CHARATA - CH": {
    "TRIGO": [
      "Lote 1 Charata",
      "Lote 3 Charata"
    ]
  },
  "Tierra Negra - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 4 Tierra Negra",
      "Lote 5 Tierra Negra",
      "Lote 6 Tierra Negra",
      "Lote 7 Tierra Negra",
      "Lote 8 Tierra Negra",
      "Lote 9 Tierra Negra",
      "Lote 10 Tierra Negra",
      "Loter Banq. Tierra N"
    ]
  },
  "La Pradera - ARBOL BLANCO - SE": {
    "TRIGO": [
      "Lote 34 La Pradera",
      "Lote 17 La Pradera",
      "Lote 20 La Pradera",
      "Lote 21 La Pradera",
      "Lote 31 La Pradera",
      "Lote 37 La Pradera",
      "Lote 38 W La Pradera",
      "Lote 41.E.3 La Prade",
      "Lote 41.E.4 La Prade",
      "Lote 41.E.5 La Prade",
      "Lote 41.E.6 La Prade",
      "Lote 41.E.7 La Prade",
      "Lote 41.E.8 La Prade",
      "Lote 38 E La Pradera",
      "Cabezeras L. 39 y 43"
    ]
  }
};

/* ---------------------------------------------
 * UTILIDADES
 * -------------------------------------------*/
const ymd = (d) => d.toISOString().split('T')[0];

// TARA pendientes hoy y ayer (no anuladas, no confirmadas).
async function obtenerTaraPendientesHoyYAyer() {
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const hoyStr = ymd(hoy);
  const ayerStr = ymd(ayer);

  const col = mongoose.connection.db.collection('registros');
  const raw = await col
    .find({
      pesadaPara: 'TARA',
      fecha: { $in: [hoyStr, ayerStr] },
      anulado: { $ne: true },
      confirmada: { $ne: true },
    })
    .sort({ idTicket: -1 })
    .toArray();

  // Deduplicar por patente (quedarse con la más reciente)
  const vistos = new Set();
  const result = [];
  for (const r of raw) {
    if (vistos.has(r.patentes)) continue;
    vistos.add(r.patentes);
    result.push({
      patentes: r.patentes,
      brutoEstimado: r.brutoEstimado ?? 0,
      tara: r.tara ?? 0,
    });
  }
  return result;
}

// Permitir estados "connected (1)" y "connecting (2)".
app.use((req, res, next) => {
  const state = mongoose.connection.readyState; // 0=disc,1=conn,2=connecting,3=disconnecting
  if (state === 0 || state === 3) {
    console.error('Conexión a MongoDB no activa. Estado:', state);
    return res.status(500).send('Internal Server Error: No se pudo conectar a MongoDB');
  }
  return next();
});

// idTicket siguiente (buscando el último)
const calculateNextIdTicket = async () => {
  const col = mongoose.connection.db.collection('registros');
  const ultimo = await col
    .find({}, { projection: { idTicket: 1 } })
    .sort({ idTicket: -1 })
    .limit(1)
    .toArray();
  return ultimo.length ? (parseInt(ultimo[0].idTicket, 10) + 1) : 1;
};

/* ---------------------------------------------
 * RUTAS
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

// Login
app.post('/', (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const redirect = String(req.body.redirect || '').trim();

    const esIngreso = codigosIngreso.includes(code);
    const esObservacion = codigosObservacion.includes(code);

    if (!esIngreso && !esObservacion) {
      return res.redirect(
        '/?error=Código incorrecto&redirect=' + encodeURIComponent(redirect || '/tabla')
      );
    }

    const redirectValido = (r) =>
      typeof r === 'string' && (r.includes('/registro') || r.includes('/tabla'));
    const destino = redirectValido(redirect) ? redirect : (esIngreso ? '/registro' : '/tabla');

    return res.redirect(destino + '?code=' + encodeURIComponent(code));
  } catch (err) {
    console.error('Error en POST /:', err);
    return res.status(500).send('Internal Server Error');
  }
});

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
      let registros = await mongoose.connection.db.collection('registros').find().toArray();

      // Filtrar si no es el master (12341)
      if (req.observacionCode !== '12341') {
        const codigoIngreso = Object.keys(ingresoAObservacion).find(
          (key) => ingresoAObservacion[key] === req.observacionCode
        );
        registros = registros.filter((r) => r.codigoIngreso === codigoIngreso);
      }

      return res.render('tabla', { registros, observacionCode: req.observacionCode });
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

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
      let registros = await mongoose.connection.db.collection('registros').find().toArray();

      if (req.observacionCode !== '12341') {
        const codigoIngreso = Object.keys(ingresoAObservacion).find(
          (key) => ingresoAObservacion[key] === req.observacionCode
        );
        registros = registros.filter((r) => r.codigoIngreso === codigoIngreso);
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Registros');
      worksheet.columns = [
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
        { header: 'Bruto', key: 'bruto', width: 15 },
        { header: 'Neto', key: 'neto', width: 15 },
        { header: 'Anulado', key: 'anulado', width: 10 },
        { header: 'Confirmada TARA', key: 'confirmada', width: 14 },
      ];
      registros.forEach((registro) => worksheet.addRow(registro));

      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.attachment('registros.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    } catch (err) {
      return res.render('error', { error: 'Error al exportar los datos: ' + err.message });
    }
  }
);

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

      // Usuario previo
      const ultimoRegistro = await mongoose.connection.db
        .collection('registros')
        .find()
        .sort({ idTicket: -1 })
        .limit(1)
        .toArray();
      const ultimoUsuario = ultimoRegistro.length ? ultimoRegistro[0].usuario : '';

      // TARA pendientes hoy/ayer para REGULADA
      const pendientesTara = await obtenerTaraPendientesHoyYAyer();

      return res.render('registro', {
        code: req.ingresoCode,
        newIdTicket,
        ultimoUsuario,
        campos,
        datosSiembra,
        pendientesTara,
        pesadaPara: 'TARA', // mostrar TARA por defecto
      });
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

// Confirmar TARA
app.post('/confirmar-tara', (req, res) => {
  const brutoEstimado = parseFloat(req.body.brutoEstimado || 0);
  const tara = parseFloat(req.body.tara || 0);
  const netoEstimado = brutoEstimado - tara;
  return res.render('confirmar-tara', {
    formData: req.body,
    brutoEstimado,
    tara,
    netoEstimado,
  });
});

// Guardar TARA
app.post('/guardar-tara', async (req, res) => {
  try {
    const newIdTicket = await calculateNextIdTicket();
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
      brutoEstimado: parseFloat(req.body.brutoEstimado || 0),
      tara: parseFloat(req.body.tara || 0),
      netoEstimado:
        parseFloat(req.body.brutoEstimado || 0) - parseFloat(req.body.tara || 0),
      anulado: false,
      modificaciones: 0,
      confirmada: false, // pendiente hasta REGULADA
      codigoIngreso: req.body.code,
    };
    await mongoose.connection.db.collection('registros').insertOne(registro);

    const codigoObservacion = ingresoAObservacion[req.body.code];
    return res.redirect(`/tabla?code=${codigoObservacion}`);
  } catch (err) {
    return res.status(500).send('Internal Server Error: ' + err.message);
  }
});

// Confirmar REGULADA (previsualización)
app.post('/confirmar-regulada', (req, res) => {
  const bruto = req.body.confirmarBruto === 'SI'
      ? parseFloat(req.body.brutoEstimado || 0) // typo corregido
      : parseFloat(req.body.bruto || 0);
  const taraFinal = req.body.confirmarTara === 'SI'
      ? parseFloat(req.body.tara || 0)
      : parseFloat(req.body.taraNueva || 0);
      
  res.render('confirmar-regulada', {
    formData: req.body,
    bruto,
    tara: taraFinal,
    neto: bruto - taraFinal
  });
});

// Guardar REGULADA
app.post('/guardar-regulada', async (req, res) => {
  try {
    // Bruto/tara finales según confirmaciones
    const bruto = req.body.confirmarBruto === 'SI'
        ? parseFloat(req.body.brutoEstimado || 0)
        : parseFloat(req.body.bruto || 0);
    
    const taraFinal = req.body.confirmarTara === 'SI'
        ? parseFloat(req.body.tara || 0)
        : parseFloat(req.body.taraNueva || 0);

    const col = mongoose.connection.db.collection('registros');

    // BUsco la TARA más reciente (no anulada, no confirmada) de esa patente
    const taraDoc= await col.findOne(
      {
        pesadaPara: 'TARA',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(400).send('No se encontró TARA pendiente para esa patente' );
    }

    //Actualizo ESE MISMO documento a REGULADA y completo datos
    await col.updateOne(
      { _id: taraDoc._id },
      {
        $set: {
          pesadaPara: 'REGULADA',
          // datos del destino
          campo: req.body.campo,
          grano: req.body.grano,
          lote: req.body.lote,
          cargoDe: req.body.cargoDe,
          silobolsa: req.body.cargoDe === 'SILOBOLSA' ? req.body.silobolsa : '',
          contratista: req.body.cargoDe === 'CONTRATISTA' ? req.body.contratista : '',
          // pesos definitivos
          bruto,
          tara: taraFinal,
          neto: bruto - taraFinal,
          // estado
          confirmada: true,
          fechaRegulada: ymd(new Date())
        }
      }
    );
    
    const codigoObservacion = ingresoAObservacion[req.body.code];
    return res.redirect(`/tabla?code=${codigoObservacion}`);
  } catch (err) {
    return res.status(500).send('Internal Server Error: ' + err.message);
  }
});

// Modificar (GET)
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

      if (!registro) return res.render('error', { error: 'Registro no encontrado' });
      if (registro.anulado) return res.render('error', { error: 'Registro anulado' });
      if (registro.modificaciones >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

      return res.render('modificar', { registro, campos, datosSiembra });
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

// Modificar (PUT)
app.put(
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

      if (!registro) return res.render('error', { error: 'Registro no encontrado' });
      if (registro.anulado) return res.render('error', { error: 'Registro anulado' });
      if (registro.modificaciones >= 2)
        return res.render('error', { error: 'Límite de modificaciones alcanzado' });

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
        brutoEstimado: parseFloat(req.body.brutoEstimado || 0),
        tara: parseFloat(req.body.tara || 0),
        netoEstimado:
          parseFloat(req.body.brutoEstimado || 0) - parseFloat(req.body.tara || 0),
        campo: req.body.campo,
        grano: req.body.grano || registro.grano,
        lote: req.body.lote,
        cargoDe: req.body.cargoDe,
        silobolsa: req.body.silobolsa || '',
        contratista: req.body.contratista || '',
        bruto: parseFloat(req.body.bruto || 0),
        neto: parseFloat(req.body.bruto || 0) - parseFloat(req.body.tara || 0),
        modificaciones: (registro.modificaciones || 0) + 1,
      };

      await mongoose.connection.db
        .collection('registros')
        .updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, { $set: updateData });

      const codigoObservacion = ingresoAObservacion[registro.codigoIngreso] || '12341';
      return res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

// --- helpers para ANULAR ---
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

function verificarCodeObservacion(req, res, next) {
  const code = req.query.code || req.body.code;
  if (codigosObservacion.includes(code)) {
    req.observacionCode = code;
    return next();
  }
  return res.redirect('/?error=Código incorrecto');
}

// Anular por PUT (cuando _method=PUT se aplica)
app.put('/anular/:id', verificarCodeObservacion, handleAnular);

// Anular por POST (fallback si el method-override no se aplicó)
app.post('/anular/:id', verificarCodeObservacion, handleAnular);

/* ---------------------------------------------
 * SERVER
 * -------------------------------------------*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
