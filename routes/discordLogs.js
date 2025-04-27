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

const router = express.Router();

// Route pour déclencher manuellement le nettoyage - utilise le contrôleur
router.post('/clean', cleanLogsController);

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
router.get('/', getLogs);

// Route pour supprimer un log - utilise le contrôleur
router.delete('/:id', deleteLog);

// Route pour récupérer les statistiques globales - utilise le contrôleur
router.get('/stats', getStats);

// Route pour réinitialiser les statistiques - utilise le contrôleur
router.post('/stats/reset', resetStats);

// Route pour récupérer la date du log le plus ancien - utilise le contrôleur
router.get('/oldest', getOldestLog);

export default router; 