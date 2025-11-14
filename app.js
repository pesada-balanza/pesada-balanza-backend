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
 * CAMPOS + DATOS SIEMBRA
 * -------------------------------------------*/
const campos = [
  "Charata - CHARATA - CH",
  "El Mataco - SACHAYOJ - SE",
  "La Porfía - ARBOL BLANCO - SE",
  "La Pradera - ARBOL BLANCO - SE",
  "Tierra Negra - ARBOL BLANCO - SE",
  "El C 1 Ciriaci - TINTINA - SE"
].sort();

const datosSiembra = {
  "El C 1 Ciriaci - TINTINA - SE": {
    "MAIZ": [
      "Lote 1 Ciriaci C1",
      "Lote 2 Ciriaci C1",
      "Lote 3 Ciriaci C1",
      "Lote 4 Ciriaci C1",
      "Lote 5 Ciriaci C1",
      "Lote 6 Ciriaci C1",
      "Lote 7 Ciriaci C1",
      "Lote 8 Ciriaci C1",
      "Lote 9 Ciriaci C1"
    ]
  },
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
 * HELPERS
 * -------------------------------------------*/
const ymd = (d) => d.toISOString().split('T')[0];

/* =========================================================
 * HELPERS
 * =======================================================*/
const ymd = (d) => d.toISOString().split('T')[0];

// ===== Helpers de TARA para combos (últimos N días) =====

// TARA pendientes SIN TARA FINAL (lista para el combo de "TARA FINAL")
async function obtenerTaraPendientesUltimosDias(dias = 3) {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - (dias - 1)); // ej. 3 días: hoy, ayer, anteayer
  const from = ymd(desde); // "YYYY-MM-DD"

  const col = mongoose.connection.db.collection('registros');

  const raw = await col
    .find({
      pesadaPara: 'TARA',
      anulado: { $ne: true },
      confirmada: { $ne: true },    // todavía NO REGULADA
      fecha: { $gte: from },
      // sin TARA FINAL: no tiene fechaTaraFinal
      $or: [
        { fechaTaraFinal: { $exists: false } },
        { fechaTaraFinal: null },
      ],
    })
    .sort({ idTicket: -1 })
    .toArray();

  const vistos = new Set();
  const out = [];
  for (const r of raw) {
    if (vistos.has(r.patentes)) continue;
    vistos.add(r.patentes);
    out.push({
      _id: r._id.toString(),
      idTicket: r.idTicket ?? null,
      patentes: r.patentes,
      brutoEstimado: Number(r.brutoEstimado) || 0,
      tara: Number.isFinite(r.tara) ? r.tara : 0,
    });
  }
  return out;
}

// TARA con TARA FINAL (lista para el combo de "REGULADA")
async function obtenerPatentesConTaraFinalUltimosDias(dias = 3) {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - (dias - 1));
  const from = ymd(desde);

  const col = mongoose.connection.db.collection('registros');

  const raw = await col
    .find({
      pesadaPara: 'TARA',
      anulado: { $ne: true },
      confirmada: { $ne: true },   // aún no REGULADA
      fecha: { $gte: from },
      // con TARA FINAL: o tiene fechaTaraFinal, o tara numérica > 0
      $or: [
        { fechaTaraFinal: { $exists: true } },
        { tara: { $type: 'number', $gt: 0 } },
      ],
    })
    .sort({ idTicket: -1 })
    .toArray();

  const vistos = new Set();
  const out = [];
  for (const r of raw) {
    if (vistos.has(r.patentes)) continue;
    vistos.add(r.patentes);
    out.push({
      _id: r._id.toString(),
      idTicket: r.idTicket ?? null,
      patentes: r.patentes,
      brutoEstimado: Number(r.brutoEstimado) || 0,
      tara: Number.isFinite(r.tara) ? r.tara : 0,
    });
  }
  return out;
}


async function obtenerPatentesConTaraFinal() {
  const fechas = fechasUltimos3Dias();
  const col = mongoose.connection.db.collection('registros');

  const raw = await col.find({
    pesadaPara: 'TARA',
    fecha: { $in: fechas },
    anulado: { $ne: true },
    confirmada: { $ne: true },
    fechaTaraFinal: { $exists: true }   // CON TARA FINAL
  })
  .sort({ idTicket: -1 })
  .toArray();

  const vistos = new Set();
  const list = [];

  raw.forEach(r => {
    if (!vistos.has(r.patentes)) {
      vistos.add(r.patentes);
      list.push({
        _id: r._id.toString(),
        patentes: r.patentes,
        brutoEstimado: r.brutoEstimado || 0,
        tara: r.tara || 0
      });
    }
  });

  return list;
}
/* ---------------------------------------------
 * RUTA /registro
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

      const ultimoRegistro = await mongoose.connection.db
        .collection('registros')
        .find()
        .sort({ idTicket: -1 })
        .limit(1)
        .toArray();
      const ultimoUsuario = ultimoRegistro.length ? ultimoRegistro[0].usuario : '';

      // *** NUEVAS LISTAS ***
      const pendientesSinFinal = await obtenerPatentesTaraPendiente(); // TARA sin TARA FINAL
      const pendientesConFinal = await obtenerPatentesConTaraFinal(); // con TARA FINAL

      return res.render('registro', {
        code: req.ingresoCode,
        newIdTicket,
        ultimoUsuario,
        campos,
        datosSiembra,
        pendientesSinFinal,
        pendientesConFinal,
        pesadaPara: 'TARA',
      });
    } catch (err) {
      return res.status(500).send('Internal Server Error: ' + err.message);
    }
  }
);

/* ---------------------------------------------
 * CONFIRMAR TARA FINAL
 * -------------------------------------------*/
app.post('/confirmar-tara-final', async (req, res) => {
  try {
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());
    if (faltan.length) {
      return res.status(400).render('error', { error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}` });
    }

    const taraNueva = parseFloat(req.body.taraNueva || 0);
    if (!(taraNueva >= 0)) {
      return res.status(400).render('error', { error: 'Tara Nueva (kg) debe ser un número válido' });
    }

    const col = mongoose.connection.db.collection('registros');
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'TARA',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
        fechaTaraFinal: { $exists: false } // SOLO TARA sin finalizar
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(404).render('error', { error: 'No se encontró TARA pendiente para esa patente' });
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
    return res.status(500).render('error', { error: 'Error en confirmar TARA FINAL: ' + err.message });
  }
});

/* ---------------------------------------------
 * GUARDAR TARA FINAL
 * -------------------------------------------*/
app.post('/guardar-tara-final', async (req, res) => {
  try {
    const requeridos = ['patentes', 'taraNueva', 'code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());
    if (faltan.length) {
      return res.status(400).render('error', { error: `Faltan campos en TARA FINAL: ${faltan.join(', ')}` });
    }

    const taraNueva = parseFloat(req.body.taraNueva || 0);
    if (!(taraNueva >= 0)) {
      return res.status(400).render('error', { error: 'Tara Nueva (kg) debe ser un número válido' });
    }

    const col = mongoose.connection.db.collection('registros');

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
      return res.status(404).render('error', { error: 'No se encontró TARA pendiente para esa patente' });
    }

    const brutoEstimado = parseFloat(taraDoc.brutoEstimado || 0);

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
    return res.status(500).render('error', { error: 'Error al guardar TARA FINAL: ' + err.message });
  }
});

/* ---------------------------------------------
 * CONFIRMAR REGULADA
 * -------------------------------------------*/
app.post('/confirmar-regulada', (req, res) => {
  const requeridosBase = ['patentes','campo','grano','lote','cargoDe',
                          'confirmarTara','confirmarBruto','brutoLote'];
  const faltan = requeridosBase.filter(f => !String(req.body[f] || '').trim());
  if (faltan.length) {
    return res.status(400).render('error', { error:`Faltan campos obligatorios: ${faltan.join(', ')}` });
  }

  const toNum = v => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const brutoEstimado = toNum(req.body.brutoEstimado) ?? 0;
  const taraOriginal  = toNum(req.body.tara) ?? 0;

  const bruto = req.body.confirmarBruto === 'SI'
    ? brutoEstimado
    : (toNum(req.body.bruto) ?? 0);

  const taraFinal = req.body.confirmarTara === 'SI'
    ? taraOriginal
    : (toNum(req.body.taraNueva) ?? 0);

  const neto = (bruto != null && taraFinal != null) ? bruto - taraFinal : null;

  const idTicketOrigen = req.body.idTicketOrigen || '';

  return res.render('confirmar-regulada', {
    formData: req.body,
    idTicketOrigen,
    bruto,
    tara: taraFinal,
    neto,
    brutoLote: req.body.brutoLote,
    comentarios: req.body.comentarios || ''
  });
});

/* ---------------------------------------------
 * GUARDAR REGULADA
 * -------------------------------------------*/
app.post('/guardar-regulada', async (req, res) => {
  try {
    const requeridos = ['patentes','campo','grano','lote','cargoDe',
                        'brutoLote','confirmarTara','confirmarBruto','code'];
    const faltan = requeridos.filter(f => !String(req.body[f] || '').trim());
    if (faltan.length) {
      return res.status(400).render('error', {
        error:`Faltan campos obligatorios en REGULADA: ${faltan.join(', ')}`
      });
    }

    const col = mongoose.connection.db.collection('registros');

    // buscar TARA con fechaTaraFinal
    const taraDoc = await col.findOne(
      {
        pesadaPara: 'TARA',
        patentes: req.body.patentes,
        anulado: { $ne: true },
        confirmada: { $ne: true },
        fechaTaraFinal: { $exists: true }
      },
      { sort: { idTicket: -1 } }
    );

    if (!taraDoc) {
      return res.status(400).render('error',{ error:'No se encontró TARA FINAL para esa patente.' });
    }

    const bruto = req.body.confirmarBruto === 'SI'
      ? parseFloat(req.body.brutoEstimado || 0)
      : parseFloat(req.body.bruto || 0);

    const taraFinal = req.body.confirmarTara === 'SI'
      ? parseFloat(req.body.tara || 0)
      : parseFloat(req.body.taraNueva || 0);

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
          silobolsa: req.body.cargoDe === 'SILOBOLSA' ? (req.body.silobolsa || '') : '',
          contratista: req.body.cargoDe === 'CONTRATISTA' ? (req.body.contratista || '') : '',
          bruto,
          tara: taraFinal,
          neto: bruto - taraFinal,
          brutoLote: parseFloat(req.body.brutoLote || 0),
          comentarios: String(req.body.comentarios || ''),
          confirmada: true,
          fechaRegulada: ymd(new Date())
        }
      }
    );

    const codigoObs = ingresoAObservacion[req.body.code];
    return res.redirect(`/tabla?code=${codigoObs}`);
  } catch (err) {
    return res.status(500).render('error',{ error:'Internal Server Error: ' + err.message });
  }
});

/* ---------------------------------------------
 * (RESTO: modificar, anular, exportar...)
 * -------------------------------------------*/
/* (Todo tu código restante sigue igual — NO MODIFIQUÉ NADA DE ABAJO) */

/* ---------------------------------------------
 * SERVER
 * -------------------------------------------*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});