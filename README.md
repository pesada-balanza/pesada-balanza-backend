# Pesada Balanza Backend

Backend para la aplicación Pesada Balanza, que gestiona registros de pesaje.

## Requisitos
- Node.js
- MongoDB

## Instalación
1. Clona el repositorio: `git clone <url>`
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env` con la variable `MONGODB_URI` (ver `.env.example`).
4. Inicia el servidor: `npm start`

## Rutas principales
- `/`: Página de autenticación.
- `/tabla`: Ver registros.
- `/registro`: Agregar un nuevo registro.
- `/modificar/:id`: Modificar un registro.
- `/export`: Exportar registros a CSV.