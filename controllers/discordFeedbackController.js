import DiscordFeedback from '../models/DiscordFeedback.js';

/**
 * Contrôleur pour gérer les feedbacks reçus depuis le bot Discord
 * Toutes ces fonctionnalités sont isolées du reste de l'application
 */
const discordFeedbackController = {
  /**
   * Reçoit un nouveau feedback du bot Discord
   * POST /api/discord-feedback
   */
  createFeedback: async (req, res) => {
    try {
      // Vérification de l'API key (à adapter selon votre système d'authentification)
      const apiKey = req.headers.authorization?.split(' ')[1];
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'API key invalide ou manquante' });
      }

      // Récupération des données du feedback
      const {
        id,
        timestamp,
        userId,
        username,
        hasInformation,
        airport,
        airline,
        messageId,
        channelId,
        status,
        notes
      } = req.body;

      // Validation des données requises
      if (!id || !userId) {
        return res.status(400).json({ error: 'Données incomplètes' });
      }

      // Vérifier si le feedback existe déjà
      const existingFeedback = await DiscordFeedback.findOne({ feedbackId: id });
      if (existingFeedback) {
        return res.status(409).json({ error: 'Ce feedback existe déjà', id: existingFeedback._id });
      }

      // Créer le nouveau feedback
      const feedback = new DiscordFeedback({
        feedbackId: id,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        userId,
        username,
        hasInformation: !!hasInformation,
        airport,
        airline,
        messageId,
        channelId,
        status: status || 'NEW',
        notes
      });

      // Enregistrer le feedback
      await feedback.save();

      // Envoi de la réponse
      res.status(201).json({
        message: 'Feedback enregistré avec succès',
        id: feedback._id,
        feedbackId: feedback.feedbackId
      });
    } catch (error) {
      console.error('Erreur lors de la création du feedback Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la création du feedback' });
    }
  },

  /**
   * Récupère tous les feedbacks avec filtres optionnels
   * GET /api/discord-feedback
   */
  getAllFeedbacks: async (req, res) => {
    try {
      // Paramètres de filtrage et pagination
      const { status, hasInformation, airport, airline, page = 1, limit = 20, sort = '-timestamp' } = req.query;
      
      // Construction des filtres
      const filter = {};
      if (status) filter.status = status;
      if (hasInformation !== undefined) filter.hasInformation = hasInformation === 'true';
      if (airport) filter.airport = airport;
      if (airline) filter.airline = airline;

      // Calcul de l'offset pour la pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Récupération des feedbacks
      const feedbacks = await DiscordFeedback.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      // Comptage du total pour la pagination
      const total = await DiscordFeedback.countDocuments(filter);

      // Envoi de la réponse
      res.json({
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        feedbacks
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des feedbacks Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération des feedbacks' });
    }
  },

  /**
   * Récupère un feedback par son ID
   * GET /api/discord-feedback/:id
   */
  getFeedbackById: async (req, res) => {
    try {
      const feedback = await DiscordFeedback.findById(req.params.id);
      
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback non trouvé' });
      }
      
      res.json(feedback);
    } catch (error) {
      console.error('Erreur lors de la récupération du feedback Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération du feedback' });
    }
  },

  /**
   * Met à jour le statut d'un feedback
   * PATCH /api/discord-feedback/:id/status
   */
  updateFeedbackStatus: async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      
      // Validation du statut
      if (!status || !['NEW', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide' });
      }

      // Mise à jour du feedback
      const update = { 
        status,
        ...(adminNotes && { adminNotes }),
        ...(status === 'COMPLETED' && { completedAt: new Date() })
      };

      const feedback = await DiscordFeedback.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true }
      );
      
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback non trouvé' });
      }
      
      res.json(feedback);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut du feedback Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du statut' });
    }
  },

  /**
   * Récupère des statistiques sur les feedbacks
   * GET /api/discord-feedback/stats
   */
  getFeedbackStats: async (req, res) => {
    try {
      // Statistiques par statut
      const statusStats = await DiscordFeedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      // Statistiques par aéroport (top 5)
      const airportStats = await DiscordFeedback.aggregate([
        { $match: { airport: { $exists: true, $ne: '' } } },
        { $group: { _id: '$airport', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);

      // Statistiques par compagnie aérienne (top 5)
      const airlineStats = await DiscordFeedback.aggregate([
        { $match: { airline: { $exists: true, $ne: '' } } },
        { $group: { _id: '$airline', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);

      // Statistiques par jour (7 derniers jours)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dailyStats = await DiscordFeedback.aggregate([
        { $match: { timestamp: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        byStatus: statusStats,
        byAirport: airportStats,
        byAirline: airlineStats,
        daily: dailyStats
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques de feedbacks Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la récupération des statistiques' });
    }
  },

  /**
   * Supprime un feedback Discord
   * DELETE /api/discord-feedback/:id
   */
  deleteFeedback: async (req, res) => {
    try {
      const feedback = await DiscordFeedback.findByIdAndDelete(req.params.id);
      
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback non trouvé' });
      }
      
      res.json({ 
        message: 'Feedback supprimé avec succès', 
        id: req.params.id 
      });
    } catch (error) {
      console.error('Erreur lors de la suppression du feedback Discord:', error);
      res.status(500).json({ error: 'Erreur serveur lors de la suppression du feedback' });
    }
  }
};

export default discordFeedbackController; 