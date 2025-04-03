const mongoose = require('mongoose');

// Configurar strictQuery para evitar la advertencia
mongoose.set('strictQuery', true);

const MONGODB_URI = 'mongodb+srv://pesadabalanzauser:mongo405322@pesada-balanza-cluster.dnc7i.mongodb.net/pesada-balanza?retryWrites=true&w=majority&appName=pesada-balanza-cluster';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(async () => {
    console.log('Conectado a MongoDB');
    // Imprime el nombre de la base de datos
    const dbName = mongoose.connection.db.databaseName;
    console.log('Nombre de la base de datos:', dbName);
    
    // Lista todas las colecciones en la base de datos
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Colecciones en la base de datos:', collections.map(c => c.name));
    
    // Busca documentos en la colección 'registros'
    mongoose.connection.db.collection('registros').find().toArray((err, docs) => {
        if (err) console.error('Error al buscar documentos:', err);
        console.log('Documentos en la colección registros:', docs);
        mongoose.connection.close();
    });
}).catch(err => console.error('Error al conectar a MongoDB:', err));