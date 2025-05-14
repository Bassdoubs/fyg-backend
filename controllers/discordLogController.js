import { CommandLog, CommandStats } from '../models/index.js';
import { logActivity } from '../utils/activityLogger.js'; // Importer le logger

// Fonction utilitaire pour nettoyer les logs plus vieux que X jours
const cleanOldLogsUtil = async (daysToKeep = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    cutoffDate.setHours(0, 0, 0, 0); // Réinitialiser l'heure à minuit pour assurer une date précise
    
    const countToDelete = await CommandLog.countDocuments({
      timestamp: { $lt: cutoffDate }
    });
    
    if (countToDelete === 0) {
      console.log(`[Log Cleanup] Aucun log trouvé plus vieux que ${daysToKeep} jours.`);
      return 0;
    }
    
    console.log(`[Log Cleanup] Tentative de suppression de ${countToDelete} logs plus vieux que ${daysToKeep} jours...`);
    const result = await CommandLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    console.log(`[Log Cleanup] ${result.deletedCount} logs supprimés avec succès.`);
    return result.deletedCount;
  } catch (error) {
    console.error('[Log Cleanup] Erreur lors du nettoyage des logs:', error);
    // Relancer l'erreur pour qu'elle soit potentiellement gérée plus haut (ex: dans la tâche cron)
    throw error; 
  }
};

// Contrôleur pour la route POST /api/discord-logs/clean
export const cleanLogsController = async (req, res, next) => {
  const adminUserId = req.user?._id; // L'admin qui effectue l'action

  if (!adminUserId) {
    return res.status(401).json({ message: 'Action réservée aux administrateurs.' });
  }

  try {
    let daysToKeep = 30; // Valeur par défaut
    
    // Essayer de lire depuis req.query ou req.body
    const daysParam = req.query.days || req.body?.days;
    
    if (daysParam) {
      const parsedDays = parseInt(daysParam);
      // Vérifier si c'est un nombre valide et positif
      if (!isNaN(parsedDays) && parsedDays > 0) {
        daysToKeep = parsedDays;
      } else {
        console.warn(`[Log Cleanup] Paramètre 'days' invalide (${daysParam}), utilisation de la valeur par défaut: ${daysToKeep}`);
      }
    }
    
    const cutoffDate = new Date(); // Calculer la date limite pour le log
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    cutoffDate.setHours(0, 0, 0, 0);
    
    const deletedCount = await cleanOldLogsUtil(daysToKeep);

    // Log l'activité APRÈS l'opération
    if (deletedCount > 0) {
        logActivity(adminUserId, 'CLEAN_LOGS', 'DiscordLog', null, { 
            daysKept: daysToKeep, 
            deletedCount,
            cutoffDate: cutoffDate.toISOString() 
        });
    }
    
    res.json({ 
      message: 'Nettoyage des logs effectué avec succès.',
      deletedCount,
      daysKept: daysToKeep
    });
  } catch (error) {
     // Si cleanOldLogsUtil lance une erreur, on la passe au gestionnaire global
     next(error); 
  }
};

// Exporter la fonction utilitaire pour pouvoir l'utiliser dans la tâche cron
export { cleanOldLogsUtil };

// Contrôleur pour la route GET /
export const getLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const period = req.query.period || 'all';

    // Filtre de période
    let dateFilter = {};
    if (period !== 'all') {
      const startDate = new Date();
      // Gérer les différentes périodes (ex: 7, 30, 90 jours)
      const days = parseInt(period);
      if (!isNaN(days) && days > 0) {
          startDate.setDate(startDate.getDate() - days);
          dateFilter = { timestamp: { $gte: startDate } };
      } else {
          console.warn(`[getLogs] Période invalide (${period}), récupération de tous les logs.`);
      }
    }

    // Création du filtre de recherche
    const searchFilter = search
      ? {
          $or: [
            { 'user.nickname': { $regex: search, $options: 'i' } },
            { 'details.airport': { $regex: search, $options: 'i' } },
            { 'details.airline': { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    // Combiner les filtres
    const filter = { ...searchFilter, ...dateFilter };

    let logs = [];
    let total = 0;
    
    try {
      // Utiliser une projection pour limiter les champs retournés
      const projection = {
        command: 1,
        'user.id': 1,
        'user.nickname': 1,
        'user.tag': 1,
        'guild.name': 1,
        timestamp: 1,
        'details.airport': 1,
        'details.airline': 1,
        'details.found': 1,
        'details.parkingsCount': 1,
        'details.responseTime': 1,
        'details.acars.used': 1,
        'details.acars.network': 1,
        'details.acars.success': 1,
      };

      // Récupération des logs avec pagination et projection optimisée
      logs = await CommandLog.find(filter, projection)
        .sort({ timestamp: -1 })
        .skip(page * limit) // Attention: skip attend le nombre d'éléments, pas la page
        .limit(limit)
        .lean(); // Utiliser lean pour de meilleures performances
        
    } catch (findError) {
      console.error('[getLogs] Erreur lors de la récupération des logs:', findError);
      // Ne pas écraser logs, laisser vide si erreur
      // logs = []; 
      return next(findError); // Transmettre l'erreur au gestionnaire global
    }
    
    try {
      // Comptage du nombre total de logs avec le même filtre
      total = await CommandLog.countDocuments(filter);
    } catch (countError) {
      console.error('[getLogs] Erreur lors du comptage des logs:', countError);
      // Si le comptage échoue, on ne peut pas calculer totalPages
      // On pourrait renvoyer une erreur ou total=0 ?
      // total = logs.length; // Approximation a minima si comptage échoue
      return next(countError); // Transmettre l'erreur au gestionnaire global
    }

    res.json({
      logs,
      total,
      page, // Renvoyer la page actuelle demandée (0-indexed ici)
      limit, // Renvoyer la limite utilisée
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0 // Calculer le nombre total de pages
    });
  } catch (error) {
    console.error('[getLogs] Erreur globale lors de la récupération des logs:', error);
    next(error); // Passer à Express pour la gestion d'erreur
  }
};

// Contrôleur pour la route DELETE /:id
export const deleteLog = async (req, res, next) => {
  const adminUserId = req.user?._id; // L'admin qui effectue l'action
  const { id } = req.params;

  if (!adminUserId) {
    return res.status(401).json({ message: 'Action réservée aux administrateurs.' });
  }

  try {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: 'ID de log invalide.' });
    }
    
    // Optionnel: Récupérer le log avant de le supprimer pour logger des détails
    // const logToDelete = await CommandLog.findById(id).lean();
    
    const result = await CommandLog.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ error: 'Log non trouvé' });
    }

    // Log l'activité APRÈS la suppression réussie
    logActivity(adminUserId, 'DELETE', 'DiscordLog', id);

    res.status(200).json({ message: 'Log supprimé avec succès', id: id }); 

  } catch (error) {
    console.error(`[deleteLog] Erreur lors de la suppression du log ${req.params.id}:`, error);
    next(error);
  }
};

// --- Fonctions pour les statistiques ---

// Fonction utilitaire pour obtenir l'historique des commandes par jour
const getCommandUsageByDay = async (dateFilter) => {
  try {
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    if (dateFilter?.timestamp?.$gte) {
      startDate = new Date(dateFilter.timestamp.$gte);
    }
    const endDate = new Date();
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    const dailyUsage = await CommandLog.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: "$timestamp" },
            month: { $month: "$timestamp" },
            day: { $dayOfMonth: "$timestamp" }
          },
          count: { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ["$details.found", true] }, 1, 0] } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    const usageMap = {};
    dailyUsage.forEach(day => {
      const date = new Date(day._id.year, day._id.month - 1, day._id.day);
      const dateStr = date.toISOString().split('T')[0];
      usageMap[dateStr] = {
        count: day.count,
        successRate: day.count > 0 ? (day.successCount / day.count) * 100 : 0
      };
    });

    return days.map(d => {
      const dateStr = d.toISOString().split('T')[0];
      return {
        date: dateStr,
        count: usageMap[dateStr]?.count || 0,
        successRate: usageMap[dateStr]?.successRate || 0
      };
    });

  } catch (error) {
    console.error('[Stats] Erreur lors de la récupération de l\'historique des commandes:', error);
    return []; // Retourner un tableau vide en cas d'erreur
  }
};

// Fonction utilitaire pour obtenir l'historique d'utilisation ACARS par jour
const getAcarsUsageByDay = async (dateFilter) => {
  try {
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    if (dateFilter?.timestamp?.$gte) {
      startDate = new Date(dateFilter.timestamp.$gte);
    }
    const endDate = new Date();
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    const dailyUsage = await CommandLog.aggregate([
      { $match: { ...dateFilter, 'details.acars.used': true } },
      {
        $group: {
          _id: {
            year: { $year: "$timestamp" },
            month: { $month: "$timestamp" },
            day: { $dayOfMonth: "$timestamp" }
          },
          count: { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ["$details.acars.success", true] }, 1, 0] } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    const usageMap = {};
    dailyUsage.forEach(day => {
      const date = new Date(day._id.year, day._id.month - 1, day._id.day);
      const dateStr = date.toISOString().split('T')[0];
      usageMap[dateStr] = {
        count: day.count,
        successRate: day.count > 0 ? (day.successCount / day.count) * 100 : 0
      };
    });

    return days.map(d => {
      const dateStr = d.toISOString().split('T')[0];
      return {
        date: dateStr,
        count: usageMap[dateStr]?.count || 0,
        successRate: usageMap[dateStr]?.successRate || 0
      };
    });

  } catch (error) {
    console.error('[Stats] Erreur lors de la récupération de l\'historique ACARS:', error);
    return [];
  }
};

// Fonction principale pour agréger les statistiques globales (utilisée par GET /stats)
const aggregateGlobalStats = async (dateFilter) => {
   // Exécuter les agrégations globales
    const globalStatsResult = await CommandLog.aggregate([
      { $match: dateFilter },
      {
        $facet: {
          commandStats: [
            {
              $group: {
                _id: null,
                totalCommands: { $sum: 1 },
                successfulCommands: { $sum: { $cond: ['$details.found', 1, 0] } },
                totalResponseTime: { $sum: '$details.responseTime' },
                uniqueUsers: { $addToSet: '$user.id' },
                uniqueAirports: { $addToSet: '$details.airport' },
                uniqueAirlines: { $addToSet: '$details.airline' }
              }
            },
            {
              $project: {
                _id: 0,
                totalCommands: 1,
                successfulCommands: 1,
                averageResponseTime: { $cond: [{ $gt: ['$totalCommands', 0] }, { $divide: ['$totalResponseTime', '$totalCommands'] }, 0] },
                uniqueUsers: { $size: '$uniqueUsers' },
                uniqueAirports: { $size: '$uniqueAirports' },
                uniqueAirlines: { $size: '$uniqueAirlines' }
              }
            }
          ],
          acarsStats: [
            { $match: { 'details.acars.used': true } },
            {
              $group: {
                _id: null,
                totalUsed: { $sum: 1 },
                successCount: { $sum: { $cond: ['$details.acars.success', 1, 0] } },
                totalResponseTime: { $sum: '$details.acars.responseTime' }
              }
            },
            {
              $project: {
                _id: 0,
                totalUsed: 1,
                successCount: 1,
                successRate: { $cond: [{ $gt: ['$totalUsed', 0] }, { $multiply: [{ $divide: ['$successCount', '$totalUsed'] }, 100] }, 0] },
                averageResponseTime: { $cond: [{ $gt: ['$totalUsed', 0] }, { $divide: ['$totalResponseTime', '$totalUsed'] }, 0] }
              }
            }
          ]
        }
      }
    ]);

    // Extraire les résultats
    const globalCommandStats = globalStatsResult[0]?.commandStats[0] || { totalCommands: 0, successfulCommands: 0, averageResponseTime: 0, uniqueUsers: 0, uniqueAirports: 0, uniqueAirlines: 0 };
    const globalAcarsStats = globalStatsResult[0]?.acarsStats[0] || { totalUsed: 0, successCount: 0, successRate: 0, averageResponseTime: 0 };

    // Exécuter les agrégations supplémentaires en parallèle
    const [
      usageByDay,
      topAirports,
      topAirlines,
      acarsUsageByDay,
      topAcarsNetworks
    ] = await Promise.all([
      getCommandUsageByDay(dateFilter).catch(err => { console.error('[Stats] Erreur dans getCommandUsageByDay', err); return []; }),
      CommandLog.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$details.airport', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, airport: '$_id', count: 1 } }
      ]).catch(err => { console.error('[Stats] Erreur agrégation topAirports', err); return []; }),
      CommandLog.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$details.airline', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, airline: '$_id', count: 1 } }
      ]).catch(err => { console.error('[Stats] Erreur agrégation topAirlines', err); return []; }),
      getAcarsUsageByDay(dateFilter).catch(err => { console.error('[Stats] Erreur dans getAcarsUsageByDay', err); return []; }),
      CommandLog.aggregate([
        { $match: { ...dateFilter, 'details.acars.used': true } },
        { $group: { _id: '$details.acars.network', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, network: '$_id', count: 1 } }
      ]).catch(err => { console.error('[Stats] Erreur agrégation topAcarsNetworks', err); return []; })
    ]);

    // Construire l'objet de réponse final
    return {
      totalCommands: globalCommandStats.totalCommands,
      successfulCommands: globalCommandStats.successfulCommands,
      averageResponseTime: globalCommandStats.averageResponseTime,
      uniqueUsers: globalCommandStats.uniqueUsers,
      uniqueAirports: globalCommandStats.uniqueAirports,
      uniqueAirlines: globalCommandStats.uniqueAirlines,
      usageByDay,
      topAirports,
      topAirlines,
      acarsStats: {
        totalUsed: globalAcarsStats.totalUsed,
        successRate: globalAcarsStats.successRate,
        averageResponseTime: globalAcarsStats.averageResponseTime,
        usageByDay: acarsUsageByDay,
        topNetworks: topAcarsNetworks
      }
    };
}

// Contrôleur pour la route GET /stats
export const getStats = async (req, res, next) => {
  try {
    const period = req.query.period || '30';
    let dateFilter = {};

    if (period !== 'all') {
      const days = parseInt(period);
      if (!isNaN(days) && days > 0) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        dateFilter = { timestamp: { $gte: startDate } };
      } else {
         console.warn(`[getStats] Période invalide (${period}), récupération des stats sur 30 jours.`);
         const startDate = new Date();
         startDate.setDate(startDate.getDate() - 30);
         dateFilter = { timestamp: { $gte: startDate } };
      }
    }
    
    const responseStats = await aggregateGlobalStats(dateFilter);
    res.json(responseStats);

  } catch (error) {
    console.error('[getStats] Erreur lors de la récupération des statistiques:', error.stack || error);
    next(error);
  }
};

// Contrôleur pour la route POST /stats/reset
export const resetStats = async (req, res, next) => {
  try {
    // Supprimer toutes les statistiques existantes (si un modèle CommandStats existe)
    // Si CommandStats n'est pas utilisé pour stocker les stats agrégées, cette ligne peut être inutile.
    // console.log('[resetStats] Tentative de suppression des anciennes statistiques (CommandStats)...');
    // await CommandStats.deleteMany({}); 
    // console.log('[resetStats] Anciennes statistiques supprimées (si existantes).');
    
    // Recalculer les statistiques avec l'historique complet (pas de filtre de date)
    console.log('[resetStats] Recalcul des statistiques globales complètes...');
    const stats = await aggregateGlobalStats({}); // Passer un filtre vide pour tout l'historique
    
    res.json({ 
      message: 'Statistiques recalculées avec succès (basées sur les logs actuels)',
      stats 
    });
  } catch (error) {
    console.error('[resetStats] Erreur lors de la réinitialisation des statistiques:', error);
    next(error);
  }
};

// Contrôleur pour la route GET /oldest
export const getOldestLog = async (req, res, next) => {
  try {
    const oldestLog = await CommandLog.findOne({}, { timestamp: 1, _id: 0 })
                                      .sort({ timestamp: 1 })
                                      .lean(); // Utiliser lean() pour la performance

    if (!oldestLog) {
      return res.json({
        message: 'Aucun log trouvé',
        oldestLogTimestamp: null, // Renvoyer null si pas de log
        currentDate: new Date().toISOString()
      });
    }

    const oldestDate = new Date(oldestLog.timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - oldestDate.getTime()); // Utiliser getTime() pour la différence
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    res.json({
      message: 'Log le plus ancien trouvé',
      oldestLogTimestamp: oldestDate.toISOString(), // Renvoyer juste le timestamp
      daysAgo: diffDays,
      currentDate: now.toISOString()
    });
  } catch (error) {
    console.error('[getOldestLog] Erreur lors de la récupération du log le plus ancien:', error);
    next(error);
  }
};

// TODO: Ajouter le contrôleur pour GET /oldest
// export const getOldestLog = async (req, res, next) => { ... }; 