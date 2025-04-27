import express from 'express';
import discordFeedbackController from '../controllers/discordFeedbackController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Routes pour l'API de feedback Discord
 * Ces routes sont complètement isolées du reste de l'application
 */

// Route pour créer un nouveau feedback (appelée par le bot Discord)
router.post('/', discordFeedbackController.createFeedback);

// Route pour récupérer tous les feedbacks avec filtre
router.get('/', protect, discordFeedbackController.getAllFeedbacks);

// Route pour récupérer les statistiques
router.get('/stats', protect, discordFeedbackController.getFeedbackStats);

// Route pour récupérer un feedback spécifique
router.get('/:id', discordFeedbackController.getFeedbackById);

// Route pour mettre à jour le statut d'un feedback
router.patch('/:id/status', discordFeedbackController.updateFeedbackStatus);

// Route pour supprimer un feedback
router.delete('/:id', protect, discordFeedbackController.deleteFeedback);

export default router; 