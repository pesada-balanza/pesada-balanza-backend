require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pesadabalanzauser:mongo405322@pesada-balanza-cluster.dnc7i.mongodb.net/pesada-balanza?retryWrites=true&w=majority&appName=pesada-balanza-cluster';

(async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Conectado a MongoDB');
        const dbName = mongoose.connection.db.databaseName;
        console.log('Nombre de la base de datos:', dbName);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Colecciones en la base de datos:', collections.map(c => c.name));

        const docs = await mongoose.connection.db.collection('registros').find().toArray();
        console.log('Documentos en la colección registros:', docs);

        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();