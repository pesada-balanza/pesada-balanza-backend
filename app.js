require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const path = require('path');
const app = express();

// Configurar Mongoose
mongoose.set('strictQuery', true);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pesadabalanzauser:mongo405322@pesada-balanza-cluster.dnc7i.mongodb.net/pesada-balanza?retryWrites=true&w=majority&appName=pesada-balanza-cluster';

// Conectar a MongoDB
mongoose.connect(MONGODB_URI).then(() => {
    console.log('Conectado a MongoDB');
}).catch(err => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layouts/main');

// Códigos de ingreso y observación
const codigosIngreso = ['56781', '5679', '5680', '5681', '5682', '5683', '5684', '5685'];
const codigosObservacion = ['12341', '1235', '1236', '1237', '1238', '1239', '1240', '1241'];
const ingresoAObservacion = {
    '56781': '12341', '5679': '1235', '5680': '1236', '5681': '1237',
    '5682': '1238', '5683': '1239', '5684': '1240', '5685': '1241'
};

// Datos de campos (ya definidos)
const campos = [
    "El C 1 Ciriaci - TINTINA - SE", "Gioda - SAN FRANCISCO - SE", "Grifa - Zunesma - TINTINA - SE",
    "La Chuchi - Avelleira y Cesar", "Cejolao - CEJOLAO - SE", "Bandera - AVERIAS - SE",
    "La Purificada - QUIMILI - SE", "El Búfalo - H. MEJ. MIRAVAL - SE", "La Juanita - H.M. MIRAVAL - SE",
    "El 90 Red Surcos - TINTINA - SE", "Martina - ALHUAMPA - SE", "La Unión - LA UNION - SE",
    "Don Pascual - ARBOL BLANCO - SE", "El Mataco - SACHAYOJ - SE", "El 44 - ARBOL BLANCO - SE",
    "La Porfía - ARBOL BLANCO - SE", "La Pradera - ARBOL BLANCO - SE", "Santa Justina 1 - CURAMALAL",
    "Don Paco - ARBOL BLANCO - SE", "Hidalgo - TINTINA - SE", "Panuncio - ARBOL BLANCO - SE",
    "El C 1 GyM - TINTINA - SE", "El 90 Italo Tabares - TINTINA - SE", "Lorenzati - ALHUAMPA - SE",
    "Doble Cero (Fermaneli) - AEROLITO - SE", "San Pedro - VILELAS - SE", "Martinoli - SACHAYOJ - SE",
    "La Juanita - Ciriaci (Ex Lote Lalo) - H. M. Miraval - SE", "Poncho Perdido Guido F - SACHAYOJ - SE",
    "Cueto - CEJOLAO - SE", "Santa Rosa - ARBOL BLANCO - SE", "Aguero - SACHAYOJ - SE",
    "Amama - TINTINA - SE", "El Centinela - LOGROÑO SF", "El Rodeo - TOSTADO SF",
    "Santa Justina 1 - MAHUIDA", "El Centinela 2 - LOGROÑO SF", "El Centinela 3 - LOGROÑO SF",
    "La Pradera - San Bernardo", "Los Molinos - Tostado"
].sort();

// Datos de siembra (ya definidos)
const datosSiembra = { /* ... (mismo contenido que antes, omitido por brevedad) */ };

// Variable para rastrear registros del día
let registrosDelDia = [];

app.use((req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        console.error('Conexión a MongoDB no activa. Estado:', mongoose.connection.readyState);
        return res.status(500).send('Internal Server Error: No se pudo conectar a MongoDB');
    }
    next();
});

const calculateNextIdTicket = async () => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        const idTickets = registros.map(r => r.idTicket).filter(id => typeof id === 'number');
        return idTickets.length > 0 ? Math.max(...idTickets) + 1 : 1;
    } catch (err) {
        console.error('Error al calcular idTicket:', err);
        throw err;
    }
};

app.get('/', (req, res) => {
    const error = req.query.error || '';
    const redirect = req.query.redirect || '/tabla?code=12341';
    res.render('index', { error, redirect });
});

app.get('/tabla', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosObservacion.includes(code)) {
        req.observacionCode = code;
        next();
    } else {
        res.redirect('/?error=Código incorrecto&redirect=/tabla');
    }
}, async (req, res) => {
    try {
        let registros = await mongoose.connection.db.collection('registros').find().toArray();
        if (req.observacionCode !== '12341') {
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            registros = registros.filter(r => r.codigoIngreso === codigoIngreso);
        }
        res.render('tabla', { registros, observacionCode: req.observacionCode });
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.get('/export', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosObservacion.includes(code)) {
        req.observacionCode = code;
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        let registros = await mongoose.connection.db.collection('registros').find().toArray();
        if (req.observacionCode !== '12341') {
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            registros = registros.filter(r => r.codigoIngreso === codigoIngreso);
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
            { header: 'Bruto Estimado', key: 'brutoEstimado', width: 15 },
            { header: 'Tara', key: 'tara', width: 10 },
            { header: 'Neto Estimado', key: 'netoEstimado', width: 15 },
            { header: 'Campo', key: 'campo', width: 15 },
            { header: 'Lote', key: 'lote', width: 15 },
            { header: 'Cargo De', key: 'cargoDe', width: 15 },
            { header: 'Silobolsa', key: 'silobolsa', width: 15 },
            { header: 'Contratista', key: 'contratista', width: 15 },
            { header: 'Bruto', key: 'bruto', width: 15 },
            { header: 'Neto', key: 'neto', width: 15 },
            { header: 'Anulado', key: 'anulado', width: 10 }
        ];
        registros.forEach(registro => {
            worksheet.addRow({
                idTicket: registro.idTicket,
                fecha: registro.fecha,
                usuario: registro.usuario,
                cargaPara: registro.cargaPara,
                socio: registro.socio,
                pesadaPara: registro.pesadaPara,
                transporte: registro.transporte,
                patentes: registro.patentes,
                chofer: registro.chofer,
                brutoEstimado: registro.brutoEstimado,
                tara: registro.tara,
                netoEstimado: registro.netoEstimado,
                campo: registro.campo,
                lote: registro.lote,
                cargoDe: registro.cargoDe,
                silobolsa: registro.silobolsa,
                contratista: registro.contratista,
                bruto: registro.bruto,
                neto: registro.neto,
                anulado: registro.anulado
            });
        });
        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('registros.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.render('error', { error: 'Error al exportar los datos: ' + err.message });
    }
});

app.get('/registro', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosIngreso.includes(code)) {
        req.ingresoCode = code;
        next();
    } else {
        res.redirect('/?error=Código incorrecto&redirect=/registro');
    }
}, async (req, res) => {
    try {
        const newIdTicket = await calculateNextIdTicket();
        const ultimoRegistro = await mongoose.connection.db.collection('registros')
            .find()
            .sort({ idTicket: -1 })
            .limit(1)
            .toArray();
        const ultimoUsuario = ultimoRegistro.length > 0 ? ultimoRegistro[0].usuario : '';
        res.render('registro', {
            code: req.ingresoCode,
            newIdTicket,
            ultimoUsuario,
            campos
        });
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.post('/confirmar-tara', (req, res) => {
    const brutoEstimado = parseFloat(req.body.brutoEstimado);
    const tara = parseFloat(req.body.tara);
    const netoEstimado = brutoEstimado - tara;
    res.render('confirmar-tara', {
        formData: req.body,
        brutoEstimado,
        tara,
        netoEstimado
    });
});

app.post('/guardar-tara', async (req, res) => {
    try {
        const newIdTicket = await calculateNextIdTicket();
        const registro = {
            idTicket: newIdTicket,
            fecha: new Date().toISOString().split('T')[0],
            usuario: req.body.usuario,
            cargaPara: req.body.cargaPara,
            socio: req.body.socio || '',
            pesadaPara: 'TARA',
            transporte: req.body.transporte,
            patentes: req.body.patentes,
            chofer: req.body.chofer,
            brutoEstimado: parseFloat(req.body.brutoEstimado),
            tara: parseFloat(req.body.tara),
            netoEstimado: parseFloat(req.body.brutoEstimado) - parseFloat(req.body.tara),
            anulado: false,
            modificaciones: 0,
            codigoIngreso: req.body.code
        };
        await mongoose.connection.db.collection('registros').insertOne(registro);
        registrosDelDia.push({ patentes: req.body.patentes, brutoEstimado: req.body.brutoEstimado });
        const codigoObservacion = ingresoAObservacion[req.body.code];
        res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.post('/confirmar-regulada', (req, res) => {
    const bruto = req.body.confirmarBruto === 'SI' ? parseFloat(req.body.brutoEstimado) : parseFloat(req.body.bruto);
    res.render('confirmar-regulada', {
        formData: req.body,
        bruto,
        neto: bruto - parseFloat(req.body.tara || 0)
    });
});

app.post('/guardar-regulada', async (req, res) => {
    try {
        const newIdTicket = await calculateNextIdTicket();
        const bruto = req.body.confirmarBruto === 'SI' ? parseFloat(req.body.brutoEstimado) : parseFloat(req.body.bruto);
        const registro = {
            idTicket: newIdTicket,
            fecha: new Date().toISOString().split('T')[0],
            usuario: req.body.usuario,
            cargaPara: req.body.cargaPara,
            socio: req.body.socio || '',
            pesadaPara: 'REGULADA',
            patentes: req.body.patentes,
            campo: req.body.campo,
            lote: req.body.lote,
            cargoDe: req.body.cargoDe,
            silobolsa: req.body.cargoDe === 'SILOBOLSA' ? req.body.silobolsa : '',
            contratista: req.body.cargoDe === 'CONTRATISTA' ? req.body.contratista : '',
            bruto: bruto,
            tara: parseFloat(req.body.tara || 0),
            neto: bruto - parseFloat(req.body.tara || 0),
            anulado: false,
            modificaciones: 0,
            codigoIngreso: req.body.code
        };
        await mongoose.connection.db.collection('registros').insertOne(registro);
        const codigoObservacion = ingresoAObservacion[req.body.code];
        res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.get('/modificar/:id', (req, res, next) => {
    const code = req.query.code || req.body.code || req.query.observacionCode;
    if (code === '9999') {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) return res.render('error', { error: 'Registro no encontrado' });
        if (registro.anulado) return res.render('error', { error: 'Registro anulado' });
        if (registro.modificaciones >= 2) return res.render('error', { error: 'Límite de modificaciones alcanzado' });
        res.render('modificar', { registro });
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.put('/modificar/:id', (req, res, next) => {
    const code = req.query.code || req.body.code || req.query.observacionCode;
    if (code === '9999') {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) return res.render('error', { error: 'Registro no encontrado' });
        if (registro.anulado) return res.render('error', { error: 'Registro anulado' });
        if (registro.modificaciones >= 2) return res.render('error', { error: 'Límite de modificaciones alcanzado' });

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
            brutoEstimado: parseFloat(req.body.brutoEstimado),
            tara: parseFloat(req.body.tara),
            netoEstimado: parseFloat(req.body.brutoEstimado) - parseFloat(req.body.tara),
            campo: req.body.campo,
            lote: req.body.lote,
            cargoDe: req.body.cargoDe,
            silobolsa: req.body.silobolsa || '',
            contratista: req.body.contratista || '',
            bruto: parseFloat(req.body.bruto),
            neto: parseFloat(req.body.bruto) - parseFloat(req.body.tara),
            modificaciones: registro.modificaciones + 1
        };

        await mongoose.connection.db.collection('registros').updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: updateData }
        );
        const codigoObservacion = ingresoAObservacion[registro.codigoIngreso] || '12341';
        res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

app.put('/anular/:id', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosObservacion.includes(code)) {
        req.observacionCode = code;
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        await mongoose.connection.db.collection('registros').updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: { tara: 0, bruto: 0, neto: 0, anulado: true } }
        );
        res.redirect(`/tabla?code=${req.observacionCode}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});