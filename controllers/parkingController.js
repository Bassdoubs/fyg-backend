import Parking from '../models/Parking.js';
import Airport from '../models/Airport.js'; // Ajout de l'import Airport
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUtils.js'; // Mettre à jour l'import pour pointer vers le fichier utils
import mongoose from 'mongoose'; // Assurez-vous que mongoose est importé si utilisé

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
            // Utiliser l'opérateur $text qui exploitera l'index texte créé
            matchStage.$text = { $search: searchString }; 
            // Supprimer l'ancienne logique $or / $regex
            /* 
            const regex = new RegExp(searchString, 'i');
            matchStage.$or = [
                { airline: regex }, { airport: regex }, ... 
            ];
            */
        }
    }

    // --- Construction de l'étape $sort --- 
    let sortStage = { airport: 1 }; // Default sort (si recherche texte, MongoDB ajoute un score de pertinence par défaut)
    // Si une recherche texte est active, MongoDB trie par défaut par pertinence ($meta: "textScore")
    // On doit le spécifier si on veut trier par autre chose *en plus* de la recherche texte.
    // Pour l'instant, on laisse le tri par pertinence si search est actif, OU on applique le tri demandé s'il n'y a pas de search.
    // Une approche plus avancée combine le score ET le tri demandé.
    
    const sortFieldMapping = {
       'airport': { '_id': 1 },
       '-updatedAt': { 'lastUpdatedAt': -1 },
       'updatedAt': { 'lastUpdatedAt': 1 },
       '-parkingCount': { 'totalParkingsInAirport': -1 },
       'parkingCount': { 'totalParkingsInAirport': 1 },
    };

    // Appliquer le tri demandé SEULEMENT s'il n'y a pas de recherche textuelle active
    // (Sinon, on laisse MongoDB trier par pertinence par défaut)
    if (!matchStage.$text && sort && sortFieldMapping[sort]) { 
        sortStage = sortFieldMapping[sort];
        console.log(`[getAllParkings Aggregation] Using explicit sort stage (no text search):`, sortStage);
    } else if (matchStage.$text) {
        console.log(`[getAllParkings Aggregation] Text search active, using default relevance sort.`);
        // Pour trier par pertinence explicite (optionnel, car c'est le défaut avec $text):
        // sortStage = { score: { $meta: "textScore" } };
        // Pour ajouter le score au document (nécessite $project):
        // Il faudrait ajouter un $project après $match: { score: { $meta: "textScore" } } 
        // et le passer aux étapes suivantes.
    } else if (sort) {
        console.warn(`[getAllParkings Aggregation] Sort key '${sort}' not implemented or text search active, using default.`);
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
  /** @type {Partial<Pick<ParkingData, 'airline' | 'airport' | 'gate' | 'mapInfo'>>} */
  const { airline, airport, gate, mapInfo } = req.body;

  if (!airline || !airport) {
    return res.status(400).json({ message: 'Les champs Airline (ICAO) et Airport (ICAO) sont requis.' });
  }

  try {
    const existingParking = await Parking.findOne({ airline: airline.toUpperCase(), airport: airport.toUpperCase() });
    if (existingParking) {
      return res.status(400).json({ message: `Un parking existe déjà pour ${airline}/${airport}.` });
    }

    /** @type {Omit<ParkingData, '_id' | 'createdAt' | 'updatedAt'>} */
    const newParkingData = {
      airline: airline.toUpperCase(),
      airport: airport.toUpperCase(),
      gate: {
        terminal: gate?.terminal || '',
        porte: gate?.porte || ''
      },
      mapInfo: mapInfo || { hasMap: false, mapUrl: null, source: null } // S'assurer que mapInfo existe
    };

    const parking = new Parking(newParkingData);
    /** @type {ParkingData} */
    const savedParking = await parking.save();
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
  /** @type {Partial<Pick<ParkingData, 'airline' | 'airport' | 'gate' | 'mapInfo'>>} */
  const { airline, airport, gate, mapInfo } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
     return res.status(400).json({ message: 'ID de parking invalide.' });
  }
  
  // On ne permet pas de changer airline/airport via cette route simple pour éviter les conflits d'unicité facilement
  // Préférez supprimer et recréer si besoin de changer la paire airline/airport
  if (airline || airport) {
     return res.status(400).json({ message: 'La modification de l\'airline ou de l\'airport n\'est pas permise via PUT. Supprimez et recréez si nécessaire.' });
  }

  try {
    /** @type {import('mongoose').Document & ParkingData | null} */ // Type Mongoose Document + notre type partagé
    const parking = await Parking.findById(id);
    if (!parking) {
      return res.status(404).json({ message: 'Parking non trouvé.' });
    }

    // Mettre à jour uniquement les champs fournis
    if (gate) {
       parking.gate.terminal = gate.terminal ?? parking.gate.terminal;
       parking.gate.porte = gate.porte ?? parking.gate.porte;
    }
    // Mise à jour mapInfo gérée par updateParkingMap, mais on peut prévoir ici aussi si besoin
    if (mapInfo !== undefined) { 
      parking.mapInfo.hasMap = mapInfo.hasMap ?? parking.mapInfo.hasMap;
      parking.mapInfo.mapUrl = mapInfo.mapUrl !== undefined ? mapInfo.mapUrl : parking.mapInfo.mapUrl;
      parking.mapInfo.source = mapInfo.source !== undefined ? mapInfo.source : parking.mapInfo.source;
    }
    
    /** @type {ParkingData} */
    const updatedParking = await parking.save();
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

    await parking.deleteOne(); // Utiliser deleteOne() sur l'instance trouvée

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
  const { mapUrl, source } = req.body; // Récupère l'URL et la source depuis le corps

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID de parking invalide.' });
  }

  try {
    const parking = await Parking.findById(id);
    if (!parking) {
      return res.status(404).json({ message: 'Parking non trouvé.' });
    }

    // Gestion de l'upload si un fichier est envoyé
    let finalMapUrl = mapUrl;
    let finalSource = source || 'URL externe'; // Source par défaut si URL directe

    if (req.file) {
      try {
        // Supprimer l'ancienne carte de Cloudinary si elle existe et vient de Cloudinary
        if (parking.mapInfo && parking.mapInfo.mapUrl && parking.mapInfo.source === 'Cloudinary') {
          // Extraire le public_id de l'URL Cloudinary
          const urlParts = parking.mapInfo.mapUrl.split('/');
          const fileNameWithExtension = urlParts.pop();
          const publicId = `parking-maps/${fileNameWithExtension.split('.')[0]}`; // Inclure le dossier
          console.log(`Tentative de suppression de l'ancienne carte Cloudinary: ${publicId}`);
          await deleteFromCloudinary(publicId); // Utilise la fonction importée
        }

        // Uploader la nouvelle carte
        const result = await uploadToCloudinary(req.file.buffer, `parking_${id}_${Date.now()}`); // Utilise la fonction importée, générer un ID unique
        finalMapUrl = result.secure_url;
        finalSource = 'Cloudinary';
      } catch (uploadError) {
        console.error("Erreur d'upload Cloudinary:", uploadError);
        return res.status(500).json({ message: "Erreur lors de l'upload de la carte." });
      }
    } else if (parking.mapInfo && parking.mapInfo.mapUrl && parking.mapInfo.source === 'Cloudinary' && !mapUrl) {
       // Si on ne fournit ni fichier ni nouvelle URL, et qu'il y avait une image Cloudinary, on la supprime
       try {
          const urlParts = parking.mapInfo.mapUrl.split('/');
          const fileNameWithExtension = urlParts.pop();
          const publicId = `parking-maps/${fileNameWithExtension.split('.')[0]}`; // Inclure le dossier
          console.log(`Tentative de suppression de la carte Cloudinary (pas de nouvelle URL/fichier): ${publicId}`);
          await deleteFromCloudinary(publicId); // Utilise la fonction importée
          finalMapUrl = null; // Pas de nouvelle URL
          finalSource = null;
       } catch (deleteError) {
          console.error("Erreur de suppression Cloudinary:", deleteError);
          // On continue quand même pour mettre à jour le reste
       }
    }

    // Mettre à jour les informations de la carte
    parking.mapInfo = {
      hasMap: !!finalMapUrl, // true si finalMapUrl n'est pas null/undefined/vide
      mapUrl: finalMapUrl,
      source: finalSource
    };

    const updatedParking = await parking.save();
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
  try {
    // Les IDs sont validés par Zod dans la route
    const { ids } = req.body;
    const result = await Parking.deleteMany({ _id: { $in: ids } });
    // Ajouter deletedCount à la réponse JSON
    res.status(200).json({ 
        message: `${result.deletedCount} parkings supprimés`, 
        deletedCount: result.deletedCount // Inclure explicitement le compte
    });
  } catch (error) {
    console.error('Erreur lors de la suppression en masse des parkings:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression en masse.' });
  }
};

// Fonction pour créer des parkings en masse (import)
export const createBulkParkings = async (req, res) => {
  try {
    // Les données sont validées par Zod dans la route
    /** @type {{parkings: Array<Partial<ParkingData>>}} */ 
    const { parkings: parkingsToInsert } = req.body;
    
    // Préparer les données (normalisation, etc. si nécessaire - Zod peut déjà le faire)
    const conditions = parkingsToInsert.map(parking => ({
      airline: parking.airline, // Supposant que Zod a déjà mis en majuscules
      airport: parking.airport  // Supposant que Zod a déjà mis en majuscules
    }));

    // Vérifier les doublons existants
    const existingParkings = await Parking.find({
      $or: conditions.filter(c => c.airline && c.airport) // Filtrer si airline/airport sont undefined
    }).lean(); // Utiliser lean pour de meilleures performances en lecture seule

    const duplicates = existingParkings.map(parking => ({
      airline: parking.airline,
      airport: parking.airport,
      reason: `La combinaison ${parking.airline}/${parking.airport} existe déjà`
    }));

    // Filtrer les parkings non dupliqués à insérer
    const validParkings = parkingsToInsert.filter(parking => 
      parking.airline && parking.airport && // S'assurer que les clés existent
      !duplicates.some(dup => 
        dup.airline === parking.airline && 
        dup.airport === parking.airport
      )
    );

    // Insérer les parkings valides
    /** @type {ParkingData[]} */
    const insertedResult = validParkings.length > 0 
      ? await Parking.insertMany(validParkings, { ordered: false }) // ordered: false pour continuer malgré les erreurs potentielles
      : [];

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