const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Conectar a MongoDB usando la variable de entorno
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/pesada-balanza';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error al conectar a MongoDB:', err));

// Definir el esquema de los registros
const registroSchema = new mongoose.Schema({
    idTicket: Number,
    fecha: String,
    usuario: String,
    vehiculo: String,
    chofer: String,
    transporte: String,
    tara: Number,
    bruto: Number,
    neto: Number,
    campo: String,
    grano: String,
    lote: String,
    silobolsa: String,
    anulado: Boolean,
});

const Registro = mongoose.model('Registro', registroSchema);

// Rutas para manejar los registros
app.get('/registros', async (req, res) => {
    const registros = await Registro.find();
    res.json(registros);
});

app.post('/registros', async (req, res) => {
    const nuevoRegistro = new Registro(req.body);
    await nuevoRegistro.save();
    res.json(nuevoRegistro);
});

app.put('/registros/:id', async (req, res) => {
    const registro = await Registro.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(registro);
});

app.put('/registros/anular/:id', async (req, res) => {
    const registro = await Registro.findByIdAndUpdate(req.params.id, { tara: 0, bruto: 0, neto: 0, anulado: true }, { new: true });
    res.json(registro);
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});