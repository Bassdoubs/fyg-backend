import express from 'express';
import {
    getDiscordLogStats,
    getDiscordLogs,
    cleanOldLogs
} from '../controllers/discordLogController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Routes publiques
router.get('/stats', getDiscordLogStats);
router.get('/', getDiscordLogs);

// Route protégée et réservée aux administrateurs
router.delete('/clean', protect, authorize('admin'), cleanOldLogs);

export default router; 