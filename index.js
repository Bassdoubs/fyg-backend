import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import parkingRoutes from './routes/parkingRoutes.js';
import discordLogsRoutes from './routes/discordLogs.js';
import discordFeedbackRoutes from './routes/discordFeedbackRoutes.js';
import statRoutes from './routes/statRoutes.js';
import airportRoutes from './routes/airportRoutes.js';
import airlineRoutes from './routes/airlineRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/users.js';
import Parking from './models/Parking.js';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configurer Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
console.log('Cloudinary Configured:', !!process.env.CLOUDINARY_CLOUD_NAME);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Configurer Helmet pour autoriser ce dont Cesium a besoin
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "data:"],
        "worker-src": ["'self'", "blob:"],
        // Ajoutez d'autres directives si nécessaire (img-src, font-src, connect-src)
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: { policy: "unsafe-none" }
  })
);

// Options CORS - à ajuster selon vos besoins en production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? process.env.CLIENT_URL : '*', // Autoriser uniquement le client en prod
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // Important pour les cookies ou l'authentification basée sur les sessions/tokens
  optionsSuccessStatus: 204 // Pour les navigateurs plus anciens
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware pour logger toutes les requêtes reçues par le backend (SUPPRIMÉ)
// app.use((req, res, next) => {
//   console.log(`[BACKEND REÇU]: ${req.method} ${req.originalUrl}`);
//   next();
// });

// Servir les fichiers uploadés statiquement
// Créer le dossier 'uploads' manuellement s'il n'existe pas à la racine du projet
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes - Utiliser des préfixes spécifiques pour chaque ressource
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/discord-logs', discordLogsRoutes);
app.use('/api/discord-feedback', discordFeedbackRoutes);
app.use('/api/stats', statRoutes); // Utiliser /api/stats
app.use('/api/airports', airportRoutes);
app.use('/api/airlines', airlineRoutes); 
app.use('/api/parkings', parkingRoutes); // Monter les parkings sur /api/parkings

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client-dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client-dist/index.html'));
});

// Gestionnaire d'erreurs global (DOIT être le dernier middleware 'app.use')
app.use((err, req, res, next) => {
  console.error('ERREUR NON GÉRÉE:', err.stack || err); // Log l'erreur complète pour le débogage

  // Détermine le statut de l'erreur (utilise err.status ou 500 par défaut)
  const statusCode = err.status || err.statusCode || 500;

  // Envoie une réponse JSON standardisée
  res.status(statusCode).json({
    error: err.message || 'Erreur interne du serveur',
    // Optionnel : n'inclure la stack trace qu'en développement
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'parkings'
})
  .then(async () => {
    console.log('Connected to MongoDB');
    const count = await Parking.countDocuments();
    console.log('Nombre de parkings dans la base:', count);
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections disponibles:', collections.map(c => c.name));
    
    // --- Tâche Cron pour le nettoyage des logs ---
    // S'exécute tous les jours à 3h du matin
    cron.schedule('0 3 * * *', () => {
      console.log('Exécution de la tâche de nettoyage des logs...');
      cleanOldLogs();
    });
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API Discord Feedback disponible sur: http://localhost:${PORT}/api/discord-feedback`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    console.error('MONGODB_URI:', process.env.MONGODB_URI);
  }); 