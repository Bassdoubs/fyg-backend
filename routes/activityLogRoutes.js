// Fichier pour les routes liées aux logs d'activité
import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { getActivityLogs, deleteActivityLog } from '../controllers/activityLogController.js';

const router = express.Router();

// GET /api/activity-logs - Récupérer les logs (protégé, admin seulement)
router.get('/', protect, authorize('admin'), getActivityLogs);

// DELETE /api/activity-logs/:id - Supprimer un log spécifique (protégé, admin seulement)
router.delete('/:id', protect, authorize('admin'), deleteActivityLog);

// TODO: Ajouter d'autres routes si nécessaire (ex: statistiques sur les logs, suppression en masse)

export default router; 