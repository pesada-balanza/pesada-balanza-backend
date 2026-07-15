require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

// La cadena de conexión vive SOLO en la variable de entorno MONGODB_URI
// (archivo .env en local, panel Environment en Render). Nunca en el código.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('ERROR: Variable MONGODB_URI no configurada. Definila en .env (local) o en Environment (Render).');
    process.exit(1);
}

(async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
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
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
