require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs'); // Añadir importación de exceljs
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
const codigosIngreso = ['5678', '5679', '5680', '5681', '5682', '5683', '5684', '5685'];
const codigosObservacion = ['1234', '1235', '1236', '1237', '1238', '1239', '1240', '1241'];
const ingresoAObservacion = {
    '5678': '1234',
    '5679': '1235',
    '5680': '1236',
    '5681': '1237',
    '5682': '1238',
    '5683': '1239',
    '5684': '1240',
    '5685': '1241'
};

// Middleware para verificar la conexión a MongoDB antes de cada solicitud
app.use((req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        console.error('Conexión a MongoDB no activa. Estado:', mongoose.connection.readyState);
        return res.status(500).send('Internal Server Error: No se pudo conectar a MongoDB');
    }
    next();
});

// Función para calcular el próximo idTicket
const calculateNextIdTicket = async () => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        console.log('Registros obtenidos para calcular idTicket:', registros.length);
        const idTickets = registros
            .filter(r => typeof r.idTicket === 'number')
            .map(r => r.idTicket);
        return idTickets.length > 0 ? Math.max(...idTickets) + 1 : 1;
    } catch (err) {
        console.error('Error al calcular idTicket:', err);
        throw err;
    }
};

// Ruta para la página de autenticación
app.get('/', (req, res) => {
    const error = req.query.error || '';
    const redirect = req.query.redirect || '/tabla';
    res.render('index', { error, redirect });
});

// Ruta para ver registros
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
        let registros;
        if (req.observacionCode === '1234') {
            registros = await mongoose.connection.db.collection('registros').find().toArray();
        } else {
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            if (!codigoIngreso) {
                return res.render('tabla', { registros: [], observacionCode: req.observacionCode });
            }
            registros = await mongoose.connection.db.collection('registros').find({ codigoIngreso: codigoIngreso }).toArray();
        }
        res.render('tabla', { registros, observacionCode: req.observacionCode });
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// Ruta para exportar a XLSX
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
        let registros;
        if (req.observacionCode === '1234') {
            registros = await mongoose.connection.db.collection('registros').find().toArray();
        } else {
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            if (!codigoIngreso) {
                return res.status(400).send('Código de observación no válido');
            }
            registros = await mongoose.connection.db.collection('registros').find({ codigoIngreso: codigoIngreso }).toArray();
        }

        // Crear un nuevo libro de Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Registros');

        // Definir las columnas
        worksheet.columns = [
            { header: 'ID Ticket', key: 'idTicket', width: 10 },
            { header: 'Fecha', key: 'fecha', width: 15 },
            { header: 'Usuario', key: 'usuario', width: 15 },
            { header: 'Socio', key: 'socio', width: 15 },
            { header: 'Vehículo', key: 'vehiculo', width: 15 },
            { header: 'Chofer', key: 'chofer', width: 15 },
            { header: 'Transporte', key: 'transporte', width: 15 },
            { header: 'Tara (kg)', key: 'tara', width: 10 },
            { header: 'Bruto (kg)', key: 'bruto', width: 10 },
            { header: 'Neto (kg)', key: 'neto', width: 10 },
            { header: 'Campo', key: 'campo', width: 15 },
            { header: 'Grano', key: 'grano', width: 15 },
            { header: 'Lote', key: 'lote', width: 15 },
            { header: 'Silobolsa', key: 'silobolsa', width: 15 },
            { header: 'Anulado', key: 'anulado', width: 10 }
        ];

        // Añadir los datos
        registros.forEach(registro => {
            worksheet.addRow({
                idTicket: registro.idTicket,
                fecha: registro.fecha,
                usuario: registro.usuario,
                socio: registro.socio,
                vehiculo: registro.vehiculo,
                chofer: registro.chofer,
                transporte: registro.transporte,
                tara: registro.tara,
                bruto: registro.bruto,
                neto: registro.neto,
                campo: registro.campo,
                grano: registro.grano,
                lote: registro.lote,
                silobolsa: registro.silobolsa,
                anulado: registro.anulado
            });
        });

        // Configurar los encabezados para descargar el archivo XLSX
        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('registros.xlsx');

        // Escribir el archivo XLSX y enviarlo
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.render('error', { error: 'Error al exportar los datos: ' + err.message });
    }
});

// Ruta para mostrar el formulario de agregar registro
app.get('/registro', (req, res, next) => {
    const code = req.query.code || req.body.code;
    console.log('Código recibido en GET /registro:', code);
    if (codigosIngreso.includes(code)) {
        req.ingresoCode = code;
        next();
    } else {
        console.log('Código no válido, redirigiendo...');
        res.redirect('/?error=Código incorrecto&redirect=/registro');
    }
}, async (req, res) => {
    try {
        const newIdTicket = await calculateNextIdTicket();
        console.log('Renderizando registro con idTicket:', newIdTicket);
        res.render('registro', { code: req.ingresoCode, newIdTicket });
    } catch (err) {
        console.error('Error en GET /registro:', err);
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// Ruta para guardar un nuevo registro
app.post('/registro', (req, res, next) => {
    const code = req.body.code;
    console.log('Código recibido en POST /registro:', code);
    if (codigosIngreso.includes(code)) {
        req.ingresoCode = code;
        next();
    } else {
        console.log('Código no válido, redirigiendo...');
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        const newIdTicket = await calculateNextIdTicket();

        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        if (!req.body.fecha || !req.body.usuario || !req.body.socio || !req.body.vehiculo || !req.body.chofer || !req.body.transporte || !req.body.campo || !req.body.grano || !req.body.lote || !req.body.silobolsa) {
            return res.render('error', { error: 'Todos los campos son obligatorios.' });
        }
        if (isNaN(tara) || tara <= 0 || isNaN(bruto) || bruto <= 0) {
            return res.render('error', { error: 'Tara y Bruto deben ser números positivos.' });
        }
        if (neto < 0) {
            return res.render('error', { error: 'El Neto no puede ser negativo. Asegúrate de que Bruto sea mayor o igual a Tara.' });
        }

        const nuevoRegistro = {
            idTicket: newIdTicket,
            fecha: new Date().toISOString().split('T')[0],
            usuario: req.body.usuario,
            socio: req.body.socio,
            vehiculo: req.body.vehiculo,
            chofer: req.body.chofer,
            transporte: req.body.transporte,
            tara: tara,
            bruto: bruto,
            neto: neto,
            campo: req.body.campo,
            grano: req.body.grano,
            lote: req.body.lote,
            silobolsa: req.body.silobolsa,
            anulado: false,
            modificaciones: 0,
            codigoIngreso: req.ingresoCode
        };

        await mongoose.connection.db.collection('registros').insertOne(nuevoRegistro);
        console.log('Registro guardado:', nuevoRegistro);

        if (!req.ingresoCode || !ingresoAObservacion[req.ingresoCode]) {
            return res.render('error', { error: 'Código de ingreso no válido.' });
        }
        const codigoObservacion = ingresoAObservacion[req.ingresoCode];
        res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// Ruta para mostrar el formulario de edición (código: 9999)
app.get('/modificar/:id', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (code === '9999') {
        next();
    } else {
        res.redirect('/?error=Código incorrecto&redirect=/modificar');
    }
}, async (req, res) => {
    try {
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) {
            return res.render('error', { error: 'Registro no encontrado' });
        }
        if (registro.anulado) {
            return res.render('error', { error: 'Este registro está anulado y no puede ser modificado.' });
        }
        res.render('modificar', { registro, observacionCode: req.query.observacionCode });
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// Ruta para actualizar un registro
app.put('/modificar/:id', (req, res, next) => {
    const code = req.query.code || req.body.code || req.query.observacionCode; // Corregir la sintaxis
    console.log('Código recibido en PUT /modificar:', code);
    console.log('Datos recibidos en req.body:', req.body);
    if (code === '9999') {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) {
            return res.render('error', { error: 'Registro no encontrado' });
        }
        if (registro.anulado) {
            return res.render('error', { error: 'Este registro está anulado y no puede ser modificado.' });
        }
        if (registro.modificaciones >= 2) {
            return res.render('error', { error: 'Este registro ya ha sido modificado 2 veces. No se permiten más modificaciones.' });
        }

        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        if (!req.body.fecha || !req.body.usuario || !req.body.socio || !req.body.vehiculo || !req.body.chofer || !req.body.transporte || !req.body.campo || !req.body.grano || !req.body.lote || !req.body.silobolsa) {
            return res.render('error', { error: 'Todos los campos son obligatorios.' });
        }
        if (isNaN(tara) || tara <= 0 || isNaN(bruto) || bruto <= 0) {
            return res.render('error', { error: 'Tara y Bruto deben ser números positivos.' });
        }
        if (neto < 0) {
            return res.render('error', { error: 'El Neto no puede ser negativo. Asegúrate de que Bruto sea mayor o igual a Tara.' });
        }

        const updateData = {
            idTicket: parseInt(req.body.idTicket),
            fecha: req.body.fecha,
            usuario: req.body.usuario,
            socio: req.body.socio,
            vehiculo: req.body.vehiculo,
            chofer: req.body.chofer,
            transporte: req.body.transporte,
            tara: tara,
            bruto: bruto,
            neto: neto,
            campo: req.body.campo,
            grano: req.body.grano,
            lote: req.body.lote,
            silobolsa: req.body.silobolsa,
            modificaciones: registro.modificaciones + 1
        };

        await mongoose.connection.db.collection('registros').updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: updateData }
        );

        // Obtener el codigoIngreso del registro y mapearlo al codigoObservacion
        const codigoIngreso = registro.codigoIngreso; // Por ejemplo, '5678'
        const codigoObservacion = ingresoAObservacion[codigoIngreso] || '1234'; // Por ejemplo, '1234' para '5678'
        res.redirect(`/tabla?code=${codigoObservacion}`);
    } catch (err) {
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// Ruta para anular un registro
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

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});