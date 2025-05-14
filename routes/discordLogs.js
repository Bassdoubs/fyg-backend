import express from 'express';
import { CommandLog, CommandStats } from '../models/index.js';
import cron from 'node-cron';
import { 
    cleanLogsController, 
    cleanOldLogsUtil, 
    getLogs,
    deleteLog,
    getStats,
    resetStats,
    getOldestLog
} from '../controllers/discordLogController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route pour déclencher manuellement le nettoyage - utilise le contrôleur
router.post('/clean', protect, cleanLogsController);

// Planification du nettoyage automatique (tous les jours à 3h) - utilise la fonction utilitaire importée
cron.schedule('0 3 * * *', async () => {
  console.log('Démarrage du nettoyage automatique des logs...');
  try {
    await cleanOldLogsUtil(30);
  } catch (error) {
    // L'erreur est déjà loguée dans cleanOldLogsUtil
  }
});

// Route pour récupérer les logs avec pagination et recherche - utilise le contrôleur
router.get('/', protect, getLogs);

// Route pour supprimer un log - utilise le contrôleur
router.delete('/:id', protect, deleteLog);

// Route pour récupérer les statistiques globales - utilise le contrôleur
router.get('/stats', protect, getStats);

// Route pour réinitialiser les statistiques - utilise le contrôleur
router.post('/stats/reset', protect, resetStats);

// Route pour récupérer la date du log le plus ancien - utilise le contrôleur
router.get('/oldest', protect, getOldestLog);

export default router; 