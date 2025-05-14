import Parking from '../models/Parking.js';
import Airport from '../models/Airport.js'; // Ajout de l'import Airport
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUtils.js'; // Mettre à jour l'import pour pointer vers le fichier utils
import mongoose from 'mongoose'; // Assurez-vous que mongoose est importé si utilisé
import { logActivity } from '../utils/activityLogger.js'; // Importer le logger

/** @typedef {import('../shared/dist/index.js').ParkingData} ParkingData */

// Fonction pour obtenir tous les parkings avec filtres optionnels, recherche, tri et pagination
export const getAllParkings = async (req, res) => {
  try {
    const {
      page: pageQuery = 1,
      limit: limitQuery = 12,
      airline,
      airport,
      hasMap,
      search,
      sort
    } = req.query;

    let page = parseInt(String(pageQuery), 10);
    let limit = parseInt(String(limitQuery), 10);
    // ... validation page/limit ...
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 12;
    const MAX_LIMIT = 100;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    
    console.log(`[getAllParkings Aggregation] Requête reçue - Page: ${page}, Limit: ${limit}, Search: '${search}', Sort: '${sort}'`); // Keep log for now

    // --- Construction de l'étape $match initiale --- 
    const matchStage = {};
    if (airline) matchStage.airline = String(airline).toUpperCase();
    if (airport) matchStage.airport = String(airport).toUpperCase();
    if (hasMap !== undefined) matchStage['mapInfo.hasMap'] = hasMap === 'true';
    
    // --- Utilisation de l'index texte pour la recherche --- 
    if (search && typeof search === 'string') {
        const searchString = search.trim();
        if (searchString) { 
            // Remplacer $text par $regex pour la recherche de préfixe/sous-chaîne
            // matchStage.$text = { $search: searchString }; 
            
            // Utiliser $regex pour une correspondance partielle (insensible à la casse)
            const regex = new RegExp(searchString, 'i'); 
            matchStage.$or = [
                { airport: regex }, 
                { airline: regex }
                // Ajoutez d'autres champs si nécessaire pour la recherche partielle, 
                // ex: { 'gate.terminal': regex }, { 'gate.porte': regex }
            ];
            console.log(`[getAllParkings Aggregation] Using regex search:`, regex);
        }
    }

    // --- Construction de l'étape $sort --- 
    let sortStage = { airport: 1 }; // Tri par défaut
    
    const sortFieldMapping = {
       'airport': { '_id': 1 }, // Trier par l'ID groupé (aéroport)
       '-updatedAt': { 'lastUpdatedAt': -1 },
       'updatedAt': { 'lastUpdatedAt': 1 },
       '-parkingCount': { 'totalParkingsInAirport': -1 },
       'parkingCount': { 'totalParkingsInAirport': 1 },
    };

    // Appliquer le tri demandé seulement si la clé est valide
    if (sort && sortFieldMapping[sort]) { 
        sortStage = sortFieldMapping[sort];
        console.log(`[getAllParkings Aggregation] Using explicit sort stage:`, sortStage);
    } else if (sort) {
        console.warn(`[getAllParkings Aggregation] Sort key '${sort}' not implemented, using default.`);
    }
    
    // --- Pipeline d'Agrégation --- 
    const aggregationPipeline = [
        { $match: matchStage },
        // Si on voulait trier par pertinence explicitement ou utiliser le score:
        // { $project: { score: { $meta: "textScore" }, document: "$$ROOT" } }, // Garder le score
        // { $sort: { score: { $meta: "textScore" } } }, // Trier par score
        { $group: {
            _id: "$airport", // Grouper par aéroport
            totalParkingsInAirport: { $sum: 1 }, // Compter les parkings dans ce groupe
            lastUpdatedAt: { $max: "$updatedAt" }, // Trouver la dernière MàJ
            // Récupérer TOUS les parkings de ce groupe pour l'instant
            // Attention: Peut être lourd en mémoire si bcp de parkings par aéroport
            parkings: { $push: "$$ROOT" } 
        } },
        { $sort: sortStage }, // Appliquer le tri (par défaut ou spécifique)
        { $facet: {
            paginatedResults: [
                { $skip: (page - 1) * limit },
                { $limit: limit }
            ],
            totalCount: [
                { $count: 'count' }
            ]
        } }
    ];

    // --- Exécution de l'agrégation --- 
    const results = await Parking.aggregate(aggregationPipeline);

    // --- Formatage de la réponse --- 
    const paginatedAirports = results[0]?.paginatedResults || [];
    const totalAirportGroups = results[0]?.totalCount[0]?.count || 0;

    // Préparer la réponse: Pour chaque groupe d'aéroport paginé, 
    // renvoyer l'aéroport, le compte total, et les parkings de ce groupe.
    // Le frontend devra adapter AirportGrid pour afficher ces groupes.
    const responseDocs = paginatedAirports.map(group => ({
        airport: group._id,
        totalParkingsInAirport: group.totalParkingsInAirport,
        parkings: group.parkings, // Tous les parkings de cet aéroport (pas encore paginés individuellement)
        lastUpdatedAt: group.lastUpdatedAt
    }));

    res.status(200).json({
      // ATTENTION: La structure de la réponse change!
      // 'docs' contient maintenant des groupes d'aéroports, pas des parkings individuels.
      docs: responseDocs, 
      totalDocs: totalAirportGroups, // Nombre total de groupes d'aéroports correspondant aux filtres
      limit: limit,
      page: page,
      totalPages: Math.ceil(totalAirportGroups / limit),
      // Les champs hasPrev/Next etc. se réfèrent à la pagination des *groupes* d'aéroports
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalAirportGroups / limit),
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < Math.ceil(totalAirportGroups / limit) ? page + 1 : null
    });

  } catch (error) {
    console.error("Erreur dans getAllParkings (Aggregation):", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération agrégée des parkings." });
  }
};

// @desc    Récupérer un parking par ID
// @route   GET /api/parkings/:id
// @access  Public (ou à sécuriser)
export const getParkingById = async (req, res) => {
  try {
    /** @type {ParkingData | null} */
    const parking = await Parking.findById(req.params.id);
    if (parking) {
      res.status(200).json(parking);
    } else {
      res.status(404).json({ message: 'Parking non trouvé.' });
    }
  } catch (error) {
    console.error(`Erreur récupération parking ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// @desc    Créer un nouveau parking
// @route   POST /api/parkings
// @access  Private/Admin (à sécuriser)
export const createParking = async (req, res) => {
  const { airline, airport, gate, mapInfo } = req.body;
  const userId = req.user?._id; // Récupérer l'ID utilisateur depuis la requête (après middleware protect)

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  if (!airline || !airport) {
    return res.status(400).json({ message: 'Les champs Airline (ICAO) et Airport (ICAO) sont requis.' });
  }

  try {
    const existingParking = await Parking.findOne({ airline: airline.toUpperCase(), airport: airport.toUpperCase() });
    if (existingParking) {
      return res.status(400).json({ message: `Un parking existe déjà pour ${airline}/${airport}.` });
    }

    const newParkingData = {
      airline: airline.toUpperCase(),
      airport: airport.toUpperCase(),
      gate: {
        terminal: gate?.terminal || '',
        porte: gate?.porte || ''
      },
      mapInfo: mapInfo || { hasMap: false, mapUrl: null, source: null },
      createdBy: userId, // Assigner l'utilisateur courant
      lastUpdatedBy: userId // Initialiser lastUpdatedBy aussi
    };

    const parking = new Parking(newParkingData);
    const savedParking = await parking.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'CREATE', 'Parking', savedParking._id, { 
      airport: savedParking.airport, 
      airline: savedParking.airline 
    });

    res.status(201).json(savedParking);

  } catch (error) {
    console.error('Erreur création parking:', error);
     if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la création.' });
  }
};

// @desc    Mettre à jour un parking
// @route   PUT /api/parkings/:id
// @access  Private/Admin (à sécuriser)
export const updateParking = async (req, res) => {
  const { id } = req.params;
  const { airline, airport, gate, mapInfo } = req.body;
  const userId = req.user?._id; // Récupérer l'ID utilisateur

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
     return res.status(400).json({ message: 'ID de parking invalide.' });
  }
  
  if (airline || airport) {
     return res.status(400).json({ message: 'La modification de l\'airline ou de l\'airport n\'est pas permise via PUT. Supprimez et recréez si nécessaire.' });
  }

  try {
    const parking = await Parking.findById(id);
    if (!parking) {
      return res.status(404).json({ message: 'Parking non trouvé.' });
    }

    // Mettre à jour uniquement les champs fournis
    let hasChanges = false; // Suivre si des modifications ont eu lieu
    if (gate) {
       if (parking.gate.terminal !== (gate.terminal ?? parking.gate.terminal)) hasChanges = true;
       if (parking.gate.porte !== (gate.porte ?? parking.gate.porte)) hasChanges = true;
       parking.gate.terminal = gate.terminal ?? parking.gate.terminal;
       parking.gate.porte = gate.porte ?? parking.gate.porte;
    }
    if (mapInfo !== undefined) { 
      // Ici, on suppose que updateParkingMap est la méthode préférée, mais on log si ça change ici
      if (parking.mapInfo.hasMap !== (mapInfo.hasMap ?? parking.mapInfo.hasMap)) hasChanges = true;
      if (parking.mapInfo.mapUrl !== (mapInfo.mapUrl !== undefined ? mapInfo.mapUrl : parking.mapInfo.mapUrl)) hasChanges = true;
      if (parking.mapInfo.source !== (mapInfo.source !== undefined ? mapInfo.source : parking.mapInfo.source)) hasChanges = true;
      parking.mapInfo.hasMap = mapInfo.hasMap ?? parking.mapInfo.hasMap;
      parking.mapInfo.mapUrl = mapInfo.mapUrl !== undefined ? mapInfo.mapUrl : parking.mapInfo.mapUrl;
      parking.mapInfo.source = mapInfo.source !== undefined ? mapInfo.source : parking.mapInfo.source;
    }

    if (!hasChanges) {
        return res.status(200).json(parking); // Aucune modification, retourner le parking actuel
    }

    // Assigner l'utilisateur qui a fait la mise à jour
    parking.lastUpdatedBy = userId;
    
    const updatedParking = await parking.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'UPDATE', 'Parking', id, {
        airport: parking.airport, // Utiliser l'objet parking récupéré avant save()
        airline: parking.airline
        // Ajouter d'autres détails si pertinent, ex: les champs modifiés ?
    });

    res.status(200).json(updatedParking);

  } catch (error) {
    console.error(`Erreur mise à jour parking ${id}:`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour.' });
  }
};

// @desc    Supprimer un parking
// @route   DELETE /api/parkings/:id
// @access  Private/Admin (à sécuriser)
export const deleteParking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?._id; // Récupérer l'ID utilisateur

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

   if (!mongoose.Types.ObjectId.isValid(id)) {
     return res.status(400).json({ message: 'ID de parking invalide.' });
   }
   
  try {
    const parking = await Parking.findById(id);
    if (!parking) {
      return res.status(404).json({ message: 'Parking non trouvé.' });
    }

    // Si le parking a une carte sur Cloudinary, la supprimer
    if (parking.mapInfo && parking.mapInfo.mapUrl && parking.mapInfo.source === 'Cloudinary') {
       try {
          const urlParts = parking.mapInfo.mapUrl.split('/');
          const fileNameWithExtension = urlParts.pop();
          const publicId = `parking-maps/${fileNameWithExtension.split('.')[0]}`; 
          console.log(`Tentative suppression carte Cloudinary ${publicId} lors suppression parking...`);
          await deleteFromCloudinary(publicId);
       } catch (deleteError) {
          console.error(`Échec suppression carte Cloudinary ${parking.mapInfo.mapUrl} lors suppression parking:`, deleteError);
          // Continuer quand même la suppression du parking de la DB
       }
    }

    // Garder les infos avant de supprimer
    const airportIcao = parking.airport;
    const airlineIcao = parking.airline;

    await parking.deleteOne(); // Utiliser deleteOne() sur l'instance trouvée

    // Log l'activité APRÈS la suppression réussie
    logActivity(userId, 'DELETE', 'Parking', id, {
        airport: airportIcao,
        airline: airlineIcao
    });

    res.status(200).json({ message: 'Parking supprimé avec succès.' });

  } catch (error) {
    console.error(`Erreur suppression parking ${id}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression.' });
  }
};

// Nouvelle fonction pour obtenir les ICAO uniques des compagnies dans les parkings
export const getUniqueParkingAirlines = async (req, res) => {
  try {
    // Utilise distinct() pour obtenir un tableau des valeurs uniques du champ 'airline'
    const uniqueAirlines = await Parking.distinct('airline');

    // Filtre pour s'assurer qu'il n'y a pas de valeurs null ou vides si jamais c'était possible
    const validAirlines = uniqueAirlines.filter(icao => icao && typeof icao === 'string'); 

    res.status(200).json(validAirlines);
  } catch (error) {
    console.error('Erreur lors de la récupération des compagnies uniques des parkings:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des compagnies uniques.' });
  }
};

// Contrôleur pour ajouter/mettre à jour une carte pour un parking spécifique
export const updateParkingMap = async (req, res) => {
  const { id } = req.params;
  const { mapUrl, source } = req.body; 
  const userId = req.user?._id; // Récupérer l'ID utilisateur

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID de parking invalide.' });
  }

  try {
    const parking = await Parking.findById(id);
    if (!parking) {
      return res.status(404).json({ message: 'Parking non trouvé.' });
    }

    // Gestion de l'upload Cloudinary ...
    let finalMapUrl = mapUrl;
    let finalSource = source || 'URL externe'; 
    let oldMapUrl = parking.mapInfo?.mapUrl; // Garder trace de l'ancienne URL
    let changeDetected = false;

    if (req.file) { /* ... logique upload/delete Cloudinary ... */
       changeDetected = true; // Upload implique un changement
    } else if (mapUrl !== oldMapUrl) { // Changement d'URL externe ou suppression
        if (parking.mapInfo?.source === 'Cloudinary' && !mapUrl) { /* ... logique delete Cloudinary ... */ }
        changeDetected = true;
    }

    if (!changeDetected) {
      return res.status(200).json(parking); // Pas de changement de carte
    }

    // Mettre à jour les informations de la carte
    parking.mapInfo = {
      hasMap: !!finalMapUrl, 
      mapUrl: finalMapUrl,
      source: finalSource
    };
    // Mettre à jour lastUpdatedBy
    parking.lastUpdatedBy = userId;

    const updatedParking = await parking.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'UPDATE_MAP', 'Parking', id, { 
        airport: parking.airport, // Utiliser l'objet parking récupéré avant save()
        airline: parking.airline,
        newUrl: finalMapUrl, 
        oldUrl: oldMapUrl 
    }); // Log avec détails fusionnés

    res.status(200).json(updatedParking);

  } catch (error) {
    console.error('Erreur lors de la mise à jour de la carte du parking:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour de la carte.' });
  }
};

// Fonction pour obtenir les statistiques globales
export const getGlobalStats = async (req, res) => {
  try {
    // Compter les parkings
    const totalParkings = await Parking.countDocuments();
    
    // Compter les aéroports uniques
    const uniqueAirports = await Parking.distinct('airport');
    const totalAirports = uniqueAirports.length;
    
    // Compter les compagnies aériennes uniques
    const uniqueCompanies = await Parking.distinct('airline');
    const totalCompanies = uniqueCompanies.length;
    
    // Extraire les codes de pays (2 premières lettres des codes ICAO)
    // Filtrer les codes non valides (null, undefined, pas 4 caractères)
    const validAirports = uniqueAirports.filter(a => a && a.length >= 2);
    const airportCountryCodes = validAirports.map(airport => airport.substring(0, 2));
    
    // Compter les pays uniques (par préfixe)
    const uniqueCountryCodes = [...new Set(airportCountryCodes)];
    
    // Compter les aéroports par code pays
    const countryCodeCounts = airportCountryCodes.reduce((acc, code) => {
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});
    
    // Regrouper les préfixes par pays pour l'affichage frontend
    const countryCounts = Object.entries(countryCodeCounts).map(([code, count]) => ({
      code,
      count
    }));
    
    res.status(200).json({
      totalParkings,
      totalAirports,
      totalCompanies,
      totalCountries: uniqueCountryCodes.length,
      // Renvoyer les codes pays uniques et leur comptage
      countries: uniqueCountryCodes, // Ou peut-être uniqueAirports si le frontend préfère ? À vérifier.
      countryCounts
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques globales:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des statistiques globales.' });
  }
};

// Fonction pour supprimer des parkings en masse
export const deleteBulkParkings = async (req, res) => {
  const { ids } = req.body;
  const userId = req.user?._id; // Récupérer l'ID utilisateur

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  try {
    // Ajouter ici la logique pour supprimer les images Cloudinary associées si nécessaire
    // const parkingsToDelete = await Parking.find({ _id: { $in: ids } });
    // ... boucle pour supprimer images ...

    const result = await Parking.deleteMany({ _id: { $in: ids } });

    // Log l'activité APRÈS la suppression
    if (result.deletedCount > 0) {
      logActivity(userId, 'BULK_DELETE', 'Parking', null, { count: result.deletedCount, deletedIds: ids });
    }

    res.status(200).json({ 
        message: `${result.deletedCount} parkings supprimés`, 
        deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Erreur lors de la suppression en masse des parkings:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression en masse.' });
  }
};

// Fonction pour créer des parkings en masse (import)
export const createBulkParkings = async (req, res) => {
  const { parkings: parkingsToInsert } = req.body;
  const userId = req.user?._id; // Récupérer l'ID utilisateur

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  try {
    const conditions = parkingsToInsert.map(p => ({ airline: p.airline, airport: p.airport }));
    const existingParkings = await Parking.find({ $or: conditions.filter(c => c.airline && c.airport) }).lean();
    const duplicates = existingParkings.map(p => ({
      airline: p.airline,
      airport: p.airport,
      reason: `La combinaison ${p.airline}/${p.airport} existe déjà`
    }));

    // Ajouter createdBy et lastUpdatedBy et filtrer les doublons
    const validParkingsWithUser = parkingsToInsert
      .filter(parking => 
        parking.airline && parking.airport && 
        !duplicates.some(dup => dup.airline === parking.airline && dup.airport === parking.airport)
      )
      .map(parking => ({ // Ajouter les infos utilisateur ici
        ...parking,
        createdBy: userId,
        lastUpdatedBy: userId
      }));

    const insertedResult = validParkingsWithUser.length > 0 
      ? await Parking.insertMany(validParkingsWithUser, { ordered: false })
      : [];

    // Log l'activité APRÈS l'insertion
    if (insertedResult.length > 0) {
        const insertedIds = insertedResult.map(p => p._id);
        logActivity(userId, 'BULK_CREATE', 'Parking', null, { 
            count: insertedResult.length, 
            duplicates: duplicates.length, 
            insertedIds // Optionnel: logguer les IDs insérés
        });
    }

    res.status(207).json({ // 207 Multi-Status
      status: duplicates.length > 0 ? 'partial' : 'success',
      summary: {
        total: parkingsToInsert.length,
        inserted: insertedResult.length,
        duplicates: duplicates.length
      },
      duplicateDetails: duplicates,
      parkings: insertedResult // Renvoyer les parkings effectivement insérés
    });
  } catch (error) {
    console.error('Erreur lors de la création en masse des parkings:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la création en masse.' });
  }
};

// Fonction pour vérifier les doublons avant import
export const checkParkingDuplicates = async (req, res) => {
  try {
    /** @type {{parkings: Array<Partial<ParkingData>>}} */ 
    const { parkings } = req.body;

    // Créer les conditions de recherche (déjà normalisées par Zod)
    const conditions = parkings
      .filter(p => p.airline && p.airport) // Ignorer ceux sans airline/airport
      .map(parking => ({
        airline: parking.airline,
        airport: parking.airport
      }));
      
    if (conditions.length === 0) {
        return res.status(200).json({ duplicates: [] }); // Rien à vérifier
    }

    // Rechercher les doublons existants
    const existingParkings = await Parking.find({
      $or: conditions
    }).lean();

    // Formater les doublons trouvés
    const duplicates = existingParkings.map(parking => ({
      airline: parking.airline,
      airport: parking.airport,
      reason: `La combinaison ${parking.airline}/${parking.airport} existe déjà dans la base de données`
    }));

    res.status(200).json({ duplicates });
  } catch (error) {
    console.error('Erreur lors de la vérification des doublons de parkings:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la vérification des doublons.' });
  }
};

// @desc    Récupérer la liste des ICAO uniques d'aéroports présents dans les parkings
// @route   GET /api/parkings/unique-airport-icaos
// @access  Public (ou à sécuriser selon les besoins)
export const getUniqueParkingAirportIcaos = async (req, res) => {
  try {
    // Utiliser distinct() pour obtenir les valeurs uniques du champ 'airport'
    // Filtrer les valeurs null ou vides si nécessaire (bien que le schéma devrait l'empêcher)
    const icaos = await Parking.distinct('airport', { airport: { $ne: null, $ne: '' } });
    
    // Trier les ICAO par ordre alphabétique
    icaos.sort(); 
    
    res.status(200).json(icaos);

  } catch (error) {
    console.error("Erreur lors de la récupération des ICAO d'aéroports uniques des parkings:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des ICAO d'aéroports." });
  }
};

// @desc    Récupérer les parkings pour des préfixes pays OACI spécifiques
// @route   GET /api/parkings/by-country?countryCodes=XX,YY,ZZ
// @access  Public (ou à sécuriser)
export const getParkingsByCountry = async (req, res) => {
  const { countryCodes } = req.query;

  if (!countryCodes || typeof countryCodes !== 'string') {
    return res.status(400).json({ message: 'Le paramètre countryCodes (codes OACI séparés par virgule) est requis.' });
  }

  const codesArray = countryCodes.split(',').map(code => code.trim().toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code));

  if (codesArray.length === 0) {
    return res.status(400).json({ message: 'Aucun code pays valide fourni dans countryCodes.' });
  }

  try {
    // Construire la condition de recherche basé sur les 2 premières lettres de l'aéroport
    const parkings = await Parking.aggregate([
      {
        $match: {
          airport: { $exists: true, $type: 'string' } // Assurer que airport existe et est une chaîne
        }
      },
      {
        $addFields: {
          // Extraire et mettre en majuscule le préfixe
          airportPrefix: { 
            $toUpper: { 
              $cond: {
                if: { $gte: [{ $strLenCP: "$airport" }, 2] },
                then: { $substrCP: [ "$airport", 0, 2 ] },
                else: null
              }
            }
          }
        }
      },
      {
        $match: {
          airportPrefix: { $in: codesArray } // Filtrer par les préfixes fournis
        }
      },
      {
        $project: { // Optionnel: retirer le champ temporaire airportPrefix
          airportPrefix: 0
        }
      }
      // Pas de pagination ici, on renvoie tout
    ]);

    res.status(200).json(parkings); // Renvoyer la liste plate

  } catch (error) {
    console.error('Erreur lors de la récupération des parkings par pays:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des parkings.' });
  }
};

// // Export des contrôleurs (si nécessaire, bien que l'export individuel soit courant)
// export default {
//   getAllParkings, 
//   getParkingById, 
//   // ... autres contrôleurs ...
// }; 