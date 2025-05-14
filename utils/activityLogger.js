import ActivityLog from '../models/ActivityLog.js';

/**
 * Enregistre une activité dans le journal.
 * Ne bloque pas l'exécution principale en cas d'erreur de log.
 *
 * @param {string | mongoose.Types.ObjectId} userId - L'ID de l'utilisateur effectuant l'action.
 * @param {string} action - Le type d'action effectuée (ex: 'CREATE', 'UPDATE'). Doit correspondre à l'enum du modèle.
 * @param {string} targetType - Le type de l'entité cible (ex: 'Parking', 'User'). Doit correspondre à l'enum du modèle.
 * @param {string | mongoose.Types.ObjectId | null} [targetId=null] - L'ID de l'entité cible (si applicable).
 * @param {object} [details={}] - Détails supplémentaires à enregistrer (ex: changements, IP).
 */
export const logActivity = async (userId, action, targetType, targetId = null, details = {}) => {
  try {
    // Validation simple des arguments requis
    if (!userId || !action || !targetType) {
      console.error('[ActivityLogger] Erreur: userId, action, et targetType sont requis pour logger une activité.');
      return; // Ne pas continuer si les infos de base manquent
    }

    const newLog = new ActivityLog({
      userId,
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined, // Convertir en string si présent, sinon undefined
      details,
      // timestamp est géré par défaut par Mongoose
    });

    await newLog.save();
    // console.log(`[ActivityLogger] Action loggée: ${action} sur ${targetType} par ${userId}`); // Optionnel: log de succès

  } catch (error) {
    // Log l'erreur mais ne pas la propager
    console.error(`[ActivityLogger] Échec log: Action=${action} Type=${targetType} User=${userId} Err=${error.message}`);
    // Optionnel: Logger l'objet complet si nécessaire pour le debug
    // console.error('[ActivityLogger] Log details on failure:', { userId, action, targetType, targetId, details });
  }
};

// Optionnel: Exporter un objet si d'autres fonctions utilitaires de logging sont ajoutées
// export default { logActivity }; 