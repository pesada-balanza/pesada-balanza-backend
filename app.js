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

// Datos de campos
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

// Datos de siembra
const datosSiembra = {
    "El C 1 Ciriaci - TINTINA - SE": {
        "MAIZ": [
            "Lote 1 Ciriaci C1", "Lote 2 Ciriaci C1", "Lote 3 Ciriaci C1",
            "Lote 4 Ciriaci C1", "Lote 5 Ciriaci C1", "Lote 6 Ciriaci C1",
            "Lote 7 Ciriaci C1", "Lote 8 Ciriaci C1", "Lote 9 Ciriaci C1"
        ],
        "SOJA": [
            "Lote 10 Ciriaci C1", "Lote 11 Ciriaci C1", "Lote 12 Ciriaci C1",
            "Lote 13 Ciriaci C1", "Lote 14 Ciriaci C1", "Lote 15 Ciriaci C1",
            "Lote 16 Ciriaci C1", "Lote 17 Ciriaci C1", "Lote 18 Ciriaci C1",
            "Lote 19 Ciriaci C1", "Lote 20 Ciriaci C1", "Lote 21 Ciriaci C1",
            "Lote 22 Ciriaci C1", "Lote 23 Ciriaci C1"
        ]
    },
    "Gioda - SAN FRANCISCO - SE": {
        "SOJA": [
            "LOTE 1 - GIODA", "LOTE 2 - GIODA", "LOTE 3 - GIODA",
            "LOTE 4 - GIODA", "LOTE 5 - GIODA", "LOTE 6 - GIODA",
            "LOTE 7 - GIODA", "LOTE 8 Y 9 - GIODA"
        ]
    },
    "Grifa - Zunesma - TINTINA - SE": {
        "MAIZ": [
            "Lote 11 Grifa", "Lote 1 Grifa", "Lote 2 Grifa", "Lote 3 Grifa",
            "Lote 4 Grifa", "Lote 5 Grifa", "Lote 6 Grifa", "Lote 7 Grifa",
            "Lote 8 Grifa", "Lote 9 Grifa", "Lote 10 Grifa"
        ]
    },
    "La Chuchi - Avelleira y Cesar": {
        "SOJA": [
            "Lote Cesar Bressan", "Lote Avelleira1 La C", "Lote Avelleira2 La C"
        ]
    },
    "Cejolao - CEJOLAO - SE": {
        "SOJA": [
            "Lote 1 Oeste Cejolao", "Lote 1 Este Cejolao", "Lote 2 Oeste Cejolao",
            "Lote 2 Este Cejolao", "Lote 3 Oeste Cejolao", "Lote 3 Este Cejolao",
            "Lote 4 Oeste Cejolao", "Lote 4 Este Cejolao", "Lote 5 Oeste Cejolao",
            "Lote 5 Este Cejolao", "Lote 6 Oeste Cejolao", "Lote 6 Este Cejolao",
            "Lote 7 Oeste Cejolao", "Lote 7 Este Cejolao", "Lote 8 Oeste Cejolao",
            "Lote 8 Este Cejolao", "Lote 9 Oeste Cejolao", "Lote 9 Este Cejolao",
            "Lote 10 OesteCejolao", "Lote 10 Este Cejolao"
        ]
    },
    "Bandera - AVERIAS - SE": {
        "SOJA": ["Lote 1 Bandera", "Lote 2 Bandera"]
    },
    "La Purificada - QUIMILI - SE": {
        "SOJA": ["Lote 1 La Purificada", "Lote 2 La Purificada", "Lote 3 La Purificada"]
    },
    "El Búfalo - H. MEJ. MIRAVAL - SE": {
        "SOJA": ["Lote 1", "Lote 4", "Lote ROMI"]
    },
    "La Juanita - H.M. MIRAVAL - SE": {
        "SOJA": [
            "Lote 1 La Juanita", "Lote 18 La Juanita", "Lote 19 La Juanita",
            "Lote 12.La Juanita", "Lote 13 La Juanita", "Lote 15 La Juanita"
        ],
        "MAIZ": ["Lote 14 La Juanita", "Lote 16 La Juanita", "Lote 17 La Juanita"]
    },
    "El 90 Red Surcos - TINTINA - SE": {
        "MAIZ": ["Lote 2 El 90", "Lote 4 el 90", "Lote 6 El 90", "Lote 8 el 90"]
    },
    "Martina - ALHUAMPA - SE": {
        "SOJA": ["Lote 1 Martina"]
    },
    "La Unión - LA UNION - SE": {
        "MAIZ": ["Lote 10", "Lote 24", "Lote 24 Nuevo", "Lote 15", "Lote 5", "Lote 6", "Lote 7"]
    },
    "Don Pascual - ARBOL BLANCO - SE": {
        "SOJA": [
            "Lote 1 Don Pascual", "Lote 2 Don Pascual", "Lote 3 Don Pascual",
            "Lote 4 Don Pascual", "Lote 5 Don Pascual", "Lote 6 Don Pascual",
            "Lote 7 Don Pascual", "Lote 8 Don Pascual", "Lote Perímetro Don P"
        ]
    },
    "El Mataco - SACHAYOJ - SE": {
        "SOJA": [
            "Lote 1 El Mataco", "Lote 2 El Mataco", "Lote 3 El Mataco",
            "Lote 4 El Mataco", "Lote 5 El Mataco", "Lote Banquina El Mat"
        ]
    },
    "El 44 - ARBOL BLANCO - SE": {
        "SOJA": [
            "Lote 1 El 44", "Lote 2 El 44", "Lote 3 El 44", "Lote 5 El 44",
            "Lote Banquina el 44"
        ],
        "MAIZ": ["Lote 4 El 44"]
    },
    "La Porfía - ARBOL BLANCO - SE": {
        "SOJA": [
            "Lote 5 La Porfía", "Lote 8 La Porfía", "Lote 9 La Porfía",
            "Lote 10 La Porfía", "Lote 11 La Porfía", "Lote Callejon SOJA"
        ]
    },
    "La Pradera - ARBOL BLANCO - SE": {
        "MAIZ": [
            "Chapino - La Pradera", "Lote 28.1 La Pradera", "Lote 29.1 La Pradera",
            "Lote 41.E.1 La Prad", "Lote 29 La Pradera", "Lote 46.E.6 La Prade",
            "Lote 30 La Pradera", "Lote 2.C La Pradera", "Lote 2.E La Pradera",
            "Lote 2.B La Pradera", "Lote 2.D La Pradera", "Lote 2.A La Pradera",
            "Lote 2.F La Pradera", "Lote 5.A La Pradera", "Lote 5.B La Pradera",
            "Lote 5.C La Pradera", "Lote 5.D La Pradera", "Lote 5.E La Pradera",
            "Lote 5.F La Pradera", "Lote 6.4 La Pradera", "Lote 6.3 La Pradera",
            "Lote 6.2 La Pradera", "Lote 7.1 La Pradera"
        ],
        "ALGODON": [
            "Lote 36.4 La Pradera", "Lote 39 W.3 La Prade", "Lote 39 W.4 La Prade",
            "Lote 39 W.5 La Prade", "Lote 39 W.6 La Prade", "Lote 39 W.7 La Prade"
        ],
        "SOJA": ["Lote 34 La Pradera", "Lote 46.E.2 La Pra"]
    },
    "Santa Justina 1 - CURAMALAL": {
        "MAIZ": ["Lote 1"],
        "SOJA": ["Lote 3", "Lote 2", "Lote 4"]
    },
    "Don Paco - ARBOL BLANCO - SE": {
        "MAIZ": [
            "Lote 1 Don Paco", "Lote 2 Don Paco", "Lote 3 Don Paco",
            "Lote 4 Don Paco", "Lote 5 Don Paco", "Lote 6 Don Paco",
            "Lote 7 Don Paco", "Lote 8 Don Paco"
        ]
    },
    "Hidalgo - TINTINA - SE": {
        "MAIZ": ["Lote 1 Hidalgo", "Lote 2 Hidalgo", "Lote 3 Hidalgo", "Lote 4 Hidalgo"]
    },
    "Panuncio - ARBOL BLANCO - SE": {
        "SOJA": ["Lote 3 Panuncio", "Lote 4 Panuncio", "Lote 5 Panuncio"],
        "MAIZ": ["Lote 1 Panuncio", "Lote 2 Panucio"]
    },
    "El C 1 GyM - TINTINA - SE": {
        "SOJA": [
            "Lote 26 Grifa C1", "Lote 27 Grifa C1", "Lote 28 Grifa C1",
            "Lote 29 Grifa C1", "Lote 32 Grifa C1", "Lote 33 Grifa C1",
            "Lote 34 Grifa C1"
        ]
    },
    "El 90 Italo Tabares - TINTINA - SE": {
        "MAIZ": ["Lote 3 el 90", "Lote 5 El 90", "Lote 7 El 90", "Lote 9 El 90", "Lote 1 El 90"]
    },
    "Lorenzati - ALHUAMPA - SE": {
        "SOJA": ["Lote 1", "Lote 2", "Lote 3", "Lote 4", "Lote 5", "Lote A"]
    },
    "Doble Cero (Fermaneli) - AEROLITO - SE": {
        "SOJA": [
            "Lote 1", "Lote 6", "Lote 7", "Lote 8", "Lote 15", "Lote 17",
            "Lote 18", "Lote 14", "Lote 9", "Lote 16", "Lote PROPIO", "Lote 10",
            "Lote 11", "Lote 12", "Lote 13", "Lote 20", "Lote 21", "Lote 3",
            "Lote 28", "Lote 19 A", "Lote 19 B", "Lote 19 C", "Lote 19 D",
            "Lote 5", "Lote 23", "Lote 24", "Lote 25", "Lote 26", "Lote 4"
        ],
        "MAIZ": ["Lote 27", "Lote 22", "Lote 29", "Lote 30", "Lote 31", "Lote 32", "Lote 33", "Lote 34", "Lote 35"]
    },
    "San Pedro - VILELAS - SE": {
        "SOJA": ["Lote 1", "Lote 10", "Lote 11", "Lote 12", "Lote 13", "Lote 2", "Lote 3", "Lote 4", "Lote 5", "Lote 6", "Lote 7", "Lote 8", "Lote 9"]
    },
    "Martinoli - SACHAYOJ - SE": {
        "ALGODON": ["Lote Unico"],
        "MAIZ": ["UNICO - MAIZ"]
    },
    "La Juanita - Ciriaci (Ex Lote Lalo) - H. M. Miraval - SE": {
        "SOJA": ["Lote 1"]
    },
    "Poncho Perdido Guido F - SACHAYOJ - SE": {
        "ALGODON": ["LOTE A"]
    },
    "Cueto - CEJOLAO - SE": {
        "SOJA": [
            "Lote 1 - Cueto", "Lote 2 - Cueto", "Lote 3 - Cueto", "Lote 4 - Cueto",
            "Lote 5 - Cueto", "Lote 6 - Cueto", "Lote 7 - Cueto", "Lote 8 - Cueto",
            "Lote 9 - Cueto", "Lote 10 - Cueto", "Lote 11 - Cueto", "Lote 12 - Cueto",
            "Lote 13 - Cueto", "Lote NUEVO - Cueto", "Lote Hornos - Cueto"
        ]
    },
    "Santa Rosa - ARBOL BLANCO - SE": {
        "SOJA": [
            "Lote 1 - Santa Rosa", "Lote 2 - Santa Rosa", "Lote 3 - Santa Rosa",
            "Lote 4 - Santa Rosa", "Lote 5 - Santa Rosa"
        ],
        "MAIZ": ["Lote 6 - Santa Rosa"]
    },
    "Aguero - SACHAYOJ - SE": {
        "MAIZ": ["Lote 1 AGUERO", "Lote 2 AGUERO", "Lote 3 AGUERO", "Lote 4 AGUERO", "Lote 5 AGUERO", "Lote 6 AGUERO"]
    },
    "Amama - TINTINA - SE": {
        "SOJA": [
            "Lote 1 Amama", "Lote 2 Amama", "Lote 3 Amama", "Lote 4 Amama",
            "Lote 5 Amama", "Lote 6 Amama", "Lote 7 Amama", "Lote 8 Amama"
        ]
    },
    "El Centinela - LOGROÑO SF": {
        "ALGODON": [
            "LOTE 1 - El Centinel", "LOTE 2 - El Centinel", "LOTE 3 - El Centinel",
            "LOTE 4 - El Centinel", "LOTE 5 - El Centinel", "LOTE 6 - El Centinel"
        ]
    },
    "El Rodeo - TOSTADO SF": {
        "ALGODON": [
            "Lote 1 Chico - El Ro", "Lote 1 Grande - El R", "Lote 2 Este - El Rod",
            "Lote 2 Oeste - El Ro", "Lote 3 Este - El Rod", "Lote 3 Oeste - El Ro",
            "Lote 4 Este - El Rod", "Lote 4 Oeste - El Ro", "Lote 5 Este - El Rod",
            "Lote 5 Oeste - El Ro", "Lote 6 - El Rodeo", "Lote 7 - El Rodeo",
            "Lote 8 - El Rodeo", "Lote 9 E - El Rodeo", "Lote 9 O - El Rodeo", "Lote Camino"
        ]
    },
    "Santa Justina 1 - MAHUIDA": {
        "SOJA": ["Lote 5 - SJ Mahuida", "Lote PERIMETRO Mahui", "Lote 7O - SJ Mahuida", "Lote 6 - SJ Mahuida"],
        "MAIZ": ["Lote 7E - SJ Mahuida", "Lote 8 - SJ Mahuida", "Lote 9 - SJ Mahuida"]
    },
    "El Centinela 2 - LOGROÑO SF": {
        "ALGODON": ["Lote 7 - El Cent 2", "Lote 8 - El Cent 2", "Lote 9 - El Cent 2", "Lote 10 - El Cent 2", "Lote 11 - El Cent 2", "Lote 12 - El Cent 2"]
    },
    "El Centinela 3 - LOGROÑO SF": {
        "ALGODON": ["Lote 13", "Lote 14", "Lote 15"]
    },
    "La Pradera - San Bernardo": {
        "ALGODON": ["Lote 10", "Lote 11", "Lote 12", "Lote 13", "Lote 14", "Lote 4", "Lote 5", "Lote 6", "Lote 7", "Lote 8", "Lote 9"]
    },
    "Los Molinos - Tostado": {
        "ALGODON": ["Lote 1", "Lote 2", "Lote 3", "Lote 4"]
    }
};

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

app.post('/', (req, res) => {
    const code = req.body.code;
    const redirect = req.body.redirect || '/tabla'; // Por defecto a tabla si no hay redirect
    const isRegistro = redirect.includes('/registro');
    const isTabla = redirect.includes('/tabla');

    let validCodes = [];
    if (isRegistro) {
        validCodes = codigosIngreso;
    } else if (isTabla) {
        validCodes = codigosObservacion;
    }

    if (validCodes.includes(code)) {
        // Redirigir con el code agregado
        res.redirect(redirect + '?code=' + code);
    } else {
        // Redirigir con error si el código no es válido
        res.redirect('/?error=Código incorrecto&redirect=' + redirect);
    }
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
            campos,
            registrosDelDia,
            datosSiembra,
            pesadaPara: 'TARA' // Valor por defecto para mostrar el formulario TARA inicialmente
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
        res.render('modificar', { registro, campos, datosSiembra });
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