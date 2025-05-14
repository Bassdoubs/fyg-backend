// Fichier contrôleur pour la gestion des logs d'activité
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { logActivity } from '../utils/activityLogger.js';

/**
 * Récupère les logs d'activité avec filtres, pagination et peuplement des informations utilisateur.
 */
export const getActivityLogs = async (req, res, next) => {
  try {
    // 1. Récupération et validation des paramètres de requête
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25; // Limite par défaut
    const sort = req.query.sort || '-timestamp'; // Tri par défaut: plus récent d'abord
    const { userId, action, targetType, startDate, endDate } = req.query;

    const skip = (page - 1) * limit;

    // 2. Construction du filtre de base
    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.userId = new mongoose.Types.ObjectId(userId);
    }
    if (action) {
      filter.action = action; // Assurez-vous que les valeurs possibles sont bien gérées/validées
    }
    if (targetType) {
      filter.targetType = targetType;
    }
    // Filtre par date
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        // Pour inclure toute la journée de fin, on met l'heure à 23:59:59.999
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endOfDay;
      }
    }

    // 3. Construction du pipeline d'agrégation
    const pipeline = [
      // Étape 1: Filtrage initial
      { $match: filter },

      // Étape 2: Tri
      { $sort: { [sort.startsWith('-') ? sort.substring(1) : sort]: sort.startsWith('-') ? -1 : 1 } },

      // Étape 3: Facette pour la pagination et le comptage total
      {
        $facet: {
          paginatedResults: [
            { $skip: skip },
            { $limit: limit },
            // Étape 3a: Lookup pour joindre l'utilisateur *après* pagination
            {
              $lookup: {
                from: User.collection.name,
                localField: 'userId',
                foreignField: '_id',
                as: 'userDetails'
              }
            },
            // Étape 3b: Déconstruire le tableau userDetails (il y aura toujours 0 ou 1 élément)
            {
              $unwind: {
                path: '$userDetails',
                preserveNullAndEmptyArrays: true // Garder le log même si l'utilisateur n'est pas trouvé
              }
            },
            // Étape 3c: Remodeler le document pour inclure les infos utilisateur souhaitées
            {
              $project: {
                _id: 1,
                action: 1,
                targetType: 1,
                targetId: 1,
                timestamp: 1,
                details: 1,
                userId: 1, // Garder l'ID original
                user: { // Créer un sous-document 'user'
                  _id: '$userDetails._id',
                  username: '$userDetails.username'
                  // email: '$userDetails.email' // Ne pas inclure l'email
                  // Ajouter d'autres champs utilisateur si nécessaire
                }
                // Ne pas inclure userDetails
              }
            }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      }
    ];

    // 4. Exécution du pipeline
    const results = await ActivityLog.aggregate(pipeline);

    const logs = results[0]?.paginatedResults || [];
    const totalCount = results[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // 5. Envoi de la réponse
    res.status(200).json({
      docs: logs, // Contient maintenant les logs avec le sous-document 'user' peuplé
      totalDocs: totalCount,
      limit: limit,
      page: page,
      totalPages: totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
    });

    // res.status(501).json({ message: 'Fonctionnalité non implémentée' });
  } catch (error) {
    console.error("Erreur lors de la récupération des logs d'activité:", error);
    next(error); // Passer à la gestion d'erreur globale
  }
};

/**
 * Supprime une entrée spécifique du journal d'activité.
 */
export const deleteActivityLog = async (req, res, next) => {
  const logIdToDelete = req.params.id;
  const adminUserId = req.user?._id; // L'admin qui effectue la suppression

  if (!adminUserId) {
    // Ne devrait pas arriver grâce au middleware protect, mais sécurité supplémentaire
    return res.status(401).json({ message: 'Admin non identifié.' });
  }

  if (!mongoose.Types.ObjectId.isValid(logIdToDelete)) {
    return res.status(400).json({ message: 'ID de log invalide.' });
  }

  try {
    const deletedLog = await ActivityLog.findByIdAndDelete(logIdToDelete);

    if (!deletedLog) {
      return res.status(404).json({ message: 'Entrée de log non trouvée.' });
    }

    // Log de l'action de suppression du log lui-même
    logActivity(
      adminUserId,
      'DELETE_LOG_ENTRY', // Action spécifique pour la suppression de log
      'ActivityLog', 
      logIdToDelete, // L'ID du log qui a été supprimé
      { 
        deletedLogDetails: { // Inclure quelques détails du log supprimé pour contexte
          action: deletedLog.action,
          targetType: deletedLog.targetType,
          targetId: deletedLog.targetId,
          timestamp: deletedLog.timestamp,
          userId: deletedLog.userId // Qui avait fait l'action originale
        } 
      }
    );

    res.status(200).json({ message: 'Entrée de log supprimée avec succès.', id: logIdToDelete });

  } catch (error) {
    console.error(`Erreur lors de la suppression du log d'activité ${logIdToDelete}:`, error);
    next(error);
  }
}; 