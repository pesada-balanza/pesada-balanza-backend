const express = require('express');
const mongoose = require('mongoose');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const { Parser } = require('json2csv');
const path = require('path');
const app = express();

// Configurar Mongoose
mongoose.set('strictQuery', true);
const MONGODB_URI = 'mongodb+srv://pesadabalanzauser:mongo405322@pesada-balanza-cluster.dnc7i.mongodb.net/pesada-balanza?retryWrites=true&w=majority&appName=pesada-balanza-cluster';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Conectado a MongoDB');
}).catch(err => {
    console.error('Error al conectar a MongoDB:', err);
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
    '5678': '1234', // Código original
    '5679': '1235',
    '5680': '1236',
    '5681': '1237',
    '5682': '1238',
    '5683': '1239',
    '5684': '1240',
    '5685': '1241'
}; 

// Middleware para proteger rutas
const requireCode = (allowedCode, redirectTo) => (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (code === allowedCode) {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
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
        req.observacionCode = code; // Almacenar el código de observación para usarlo en la consulta
        next();
    } else {
        res.redirect('/?error=Código incorrecto&redirect=/tabla');
    }
}, async (req, res) => {
    try {
        let registros;
        if (req.observacionCode === '1234') {
            // El código 1234 puede ver todos los registros
            registros = await mongoose.connection.db.collection('registros').find().toArray();
        } else {
            // Otros códigos solo ven los registros creados con su código de ingreso correspondiente
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            registros = await mongoose.connection.db.collection('registros').find({ codigoIngreso: codigoIngreso }).toArray();
        }
        res.render('tabla', { registros });
    } catch (err) {
        res.render('error', { error: 'Error al cargar los registros: ' + err.message });
    }
});

// Ruta para exportar a CSV
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
            registros = await mongoose.connection.db.collection('registros').find().toArray
        } else {
            const codigoIngreso = Object.keys(ingresoAObservacion).find(key => ingresoAObservacion[key] === req.observacionCode);
            registros = await mongoose.connection.db.collection('registros').find({ codigoIngreso: codigoIngreso }).toArray();
        }
        const fields = ['idTicket', 'fecha', 'usuario', 'socio', 'vehiculo', 'chofer', 'transporte', 'tara', 'bruto', 'neto', 'campo', 'grano', 'lote', 'silobolsa', 'anulado'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(registros);
        res.header('Content-Type', 'text/csv');
        res.attachment('registros.csv');
        res.send(csv);
    } catch (err) {
        res.render('error', { error: 'Error al exportar los datos: ' + err.message });
    }
});

// Ruta para mostrar el formulario de agregar registro
app.get('/registro', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosIngreso.includes(code)) {
        next();
    } else {
        res.redirect('/?error=Código incorrecto&redirect=/registro');
    }
}, (req, res) => {
    res.render('registro');
});

// Ruta para guardar un nuevo registro
app.post('/registro', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (codigosIngreso.includes(code)) {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        const newIdTicket = registros.length > 0 ? Math.max(...registros.map(r => r.idTicket)) + 1 : 1;
        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        // Validaciones
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
            fecha: new Date().toISOString().split('T')[0], // Fecha del día actual en formato YYYY-MM-DD
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
            modificaciones: 0, // Nuevo campo para contar modificaciones
            codigoIngreso: req.body.code || req.query.code // Almacenar el código de ingreso
        };

        await mongoose.connection.db.collection('registros').insertOne(nuevoRegistro);
        res.redirect('/tabla?code=1234');
    } catch (err) {
        res.render('error', { error: 'Error al guardar el registro: ' + err.message });
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
        res.render('modificar', { registro });
    } catch (err) {
        res.render('error', { error: 'Error al cargar el registro: ' + err.message });
    }
});

// Ruta para actualizar un registro
app.put('/modificar/:id', (req, res, next) => {
    const code = req.query.code || req.body.code;
    if (code === '9999') {
        next();
    } else {
        res.redirect('/?error=Código incorrecto');
    }
}, async (req, res) => {
    try {
        // Buscar el registro existente
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) {
            return res.render('error', { error: 'Registro no encontrado' });
        }

        // Verificar si el registro está anulado
        if (registro.anulado) {
            return res.render('error', { error: 'Este registro está anulado y no puede ser modificado.' });
        }

        // Verificar el número de modificaciones
        if (registro.modificaciones >= 2) {
            return res.render('error', { error: 'Este registro ya ha sido modificado 2 veces. No se permiten más modificaciones.' });
        }

        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        // Validaciones
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
            anulado: req.body.anulado === 'true',
            modificaciones: registro.modificaciones + 1 // Incrementar el contador
        };

        await mongoose.connection.db.collection('registros').updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: updateData }
        );
        res.redirect('/tabla?code=1234');
    } catch (err) {
        res.render('error', { error: 'Error al actualizar el registro: ' + err.message });
    }
});

// Ruta para anular un registro
app.put('/anular/:id', (req, res, next) => {
    const code = req.query.code ||req.body.code;
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
        res.render('error', { error: 'Error al anular el registro: ' + err.message });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log("Servidor corriendo en http://0.0.0.0:${PORT}");
});