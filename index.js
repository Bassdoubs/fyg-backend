// Charger les variables d'environnement dès le début
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';

// Obtenir le chemin absolu du répertoire courant
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger explicitement le fichier .env avec son chemin absolu
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Afficher l'état des variables d'environnement pour le débogage
console.log('Variables d\'environnement chargées:');
console.log('API_KEY présente:', !!process.env.API_KEY);
console.log('JWT_SECRET présente:', !!process.env.JWT_SECRET);
console.log('MONGODB_URI présente:', !!process.env.MONGODB_URI);
console.log('CLOUDINARY configuré:', !!process.env.CLOUDINARY_CLOUD_NAME);

// Vérifier les variables d'environnement critiques
if (!process.env.API_KEY) {
  console.warn('⚠️ API_KEY non trouvée. L\'authentification des feedbacks Discord échouera.');
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET non trouvée. L\'authentification utilisateur échouera.');
}

if (!process.env.MONGODB_URI) {
  console.warn('⚠️ MONGODB_URI non trouvée. La connexion à la base de données échouera.');
}

import express from 'express';
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
import activityLogRoutes from './routes/activityLogRoutes.js';
import Parking from './models/Parking.js';
import helmet from 'helmet';
import cron from 'node-cron';

// Configurer Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
console.log('Cloudinary configuré:', !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET);

const app = express();
const PORT = process.env.PORT || 3000; // Port fixé à 3000 comme demandé

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

// Options CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : '*', 
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers uploadés statiquement
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Endpoint pour vérifier la validité d'un JWT
app.get('/api/auth/verify-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ valid: false, message: 'Aucun token fourni' });
  }
  
  try {
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({ valid: true, user: decoded });
  } catch (error) {
    // Identifier spécifiquement les erreurs d'expiration
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ valid: false, message: 'Token expiré', expired: true });
    }
    
    // Autres erreurs JWT (token malformé, signature invalide, etc.)
    return res.status(401).json({ valid: false, message: 'Token invalide' });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/discord-logs', discordLogsRoutes);
app.use('/api/discord-feedback', discordFeedbackRoutes);
app.use('/api/stats', statRoutes);
app.use('/api/airports', airportRoutes);
app.use('/api/airlines', airlineRoutes); 
app.use('/api/parkings', parkingRoutes);
app.use('/api/activity-logs', activityLogRoutes);

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('ERREUR NON GÉRÉE:', err.stack || err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Erreur interne du serveur',
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