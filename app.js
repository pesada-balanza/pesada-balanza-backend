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

// Ruta para ver registros (código: 1234)
app.get('/tabla', requireCode('1234', '/?redirect=/tabla'), async (req, res) => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        res.render('tabla', { registros });
    } catch (err) {
        res.render('error', { error: 'Error al cargar los registros: ' + err.message });
    }
});

// Ruta para exportar a CSV
app.get('/export', requireCode('1234', '/'), async (req, res) => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        const fields = ['idTicket', 'fecha', 'usuario', 'vehiculo', 'chofer', 'transporte', 'tara', 'bruto', 'neto', 'campo', 'grano', 'lote', 'silobolsa', 'anulado'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(registros);
        res.header('Content-Type', 'text/csv');
        res.attachment('registros.csv');
        res.send(csv);
    } catch (err) {
        res.render('error', { error: 'Error al exportar los datos: ' + err.message });
    }
});

// Ruta para mostrar el formulario de agregar registro (código: 5678)
app.get('/registro', requireCode('5678', '/?redirect=/registro'), (req, res) => {
    res.render('registro');
});

// Ruta para guardar un nuevo registro
app.post('/registro', requireCode('5678', '/'), async (req, res) => {
    try {
        const registros = await mongoose.connection.db.collection('registros').find().toArray();
        const newIdTicket = registros.length > 0 ? Math.max(...registros.map(r => r.idTicket)) + 1 : 1;
        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        // Validaciones
        if (!req.body.fecha || !req.body.usuario || !req.body.vehiculo || !req.body.chofer || !req.body.transporte || !req.body.campo || !req.body.grano || !req.body.lote || !req.body.silobolsa) {
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
            fecha: req.body.fecha,
            usuario: req.body.usuario,
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
            anulado: false
        };

        await mongoose.connection.db.collection('registros').insertOne(nuevoRegistro);
        res.redirect('/tabla?code=1234');
    } catch (err) {
        res.render('error', { error: 'Error al guardar el registro: ' + err.message });
    }
});

// Ruta para mostrar el formulario de edición (código: 9999)
app.get('/modificar/:id', requireCode('9999', '/?redirect=/modificar'), async (req, res) => {
    try {
        const registro = await mongoose.connection.db.collection('registros').findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
        if (!registro) {
            return res.render('error', { error: 'Registro no encontrado' });
        }
        res.render('modificar', { registro });
    } catch (err) {
        res.render('error', { error: 'Error al cargar el registro: ' + err.message });
    }
});

// Ruta para actualizar un registro
app.put('/modificar/:id', requireCode('9999', '/'), async (req, res) => {
    try {
        const tara = parseFloat(req.body.tara);
        const bruto = parseFloat(req.body.bruto);
        const neto = bruto - tara;

        // Validaciones
        if (!req.body.fecha || !req.body.usuario || !req.body.vehiculo || !req.body.chofer || !req.body.transporte || !req.body.campo || !req.body.grano || !req.body.lote || !req.body.silobolsa) {
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
            anulado: req.body.anulado === 'true'
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
app.put('/anular/:id', requireCode('1234', '/'), async (req, res) => {
    try {
        await mongoose.connection.db.collection('registros').updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: { tara: 0, bruto: 0, neto: 0, anulado: true } }
        );
        res.redirect('/tabla?code=1234');
    } catch (err) {
        res.render('error', { error: 'Error al anular el registro: ' + err.message });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Servidor corriendo en http://0.0.0.0:${PORT}');
});