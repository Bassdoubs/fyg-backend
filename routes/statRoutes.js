import express from 'express';
import { getGlobalStats } from '../controllers/statController.js';

const router = express.Router();

// Route pour les statistiques globales, relative à /api/stats
router.get('/global', getGlobalStats);

export default router; 