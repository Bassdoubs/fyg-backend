import Airline from '../models/Airline.js';
import Parking from '../models/Parking.js'; // Importer Parking
// import fs from 'fs'; // Plus besoin
// import path from 'path'; // Plus besoin
// Importer les fonctions depuis le nouveau fichier utilitaire
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUtils.js'; 
import { logActivity } from '../utils/activityLogger.js'; // Importer le logger

// @desc    Récupérer toutes les compagnies aériennes (avec pagination et recherche)
// @route   GET /api/airlines
// @access  Public (ou Private/Admin selon la politique)
export const getAllAirlines = async (req, res) => {
  console.log('[getAllAirlines] Received request.'); // <-- LOG 1: Entrée fonction
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;
    console.log(`[getAllAirlines] Params: page=${page}, limit=${limit}, search='${search}'`); // <-- LOG 2: Paramètres parsés

    // --- Construction de la condition de recherche ---
    let queryCondition = {};
    let sortCondition = { icao: 1 }; // Tri par défaut

    if (search) {
      const searchString = search.trim();
      if (searchString) {
        queryCondition = { $text: { $search: searchString } };
        console.log(`[getAllAirlines] Using text search for: "${searchString}"`);
      } else {
        console.log('[getAllAirlines] Search param is empty, using no text search.'); // <-- LOG 2b: Search vide
      } 
    } else {
       console.log('[getAllAirlines] No search param, using no text search.'); // <-- LOG 2c: Pas de search
    }
    console.log(`[getAllAirlines] Query Condition: ${JSON.stringify(queryCondition)}, Sort Condition: ${JSON.stringify(sortCondition)}`); // <-- LOG 3: Conditions Query/Sort

    // --- Exécution des requêtes ---
    const [airlines, totalCount] = await Promise.all([
      Airline.find(queryCondition)
             .sort(sortCondition)
             .skip(skip)
             .limit(limit)
             .lean(),
      Airline.countDocuments(queryCondition)
    ]);

    console.log(`[getAllAirlines] Found ${airlines.length} airlines, total count: ${totalCount}`); // <-- LOG 4: Résultats BDD

    res.status(200).json({
      docs: airlines, // Renvoyer sous la clé 'docs' pour cohérence avec parkings
      totalDocs: totalCount,
      limit: limit,
      page: page,
      totalPages: Math.ceil(totalCount / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalCount / limit),
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < Math.ceil(totalCount / limit) ? page + 1 : null,
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des compagnies:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des compagnies.' });
  }
};

// @desc    Créer une nouvelle compagnie aérienne
// @route   POST /api/airlines
// @access  Private/Admin (à sécuriser plus tard)
export const createAirline = async (req, res) => {
  const { icao: rawIcao, name, callsign, country } = req.body;
  const userId = req.user?._id; // Récupérer l'ID utilisateur
  let cloudinaryResult = null;

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  if (!rawIcao || !name || !country) {
    return res.status(400).json({ message: 'Les champs ICAO, Nom et Pays sont requis.' });
  }

  const icao = rawIcao.toUpperCase(); // Assurer la casse

  try {
    const existingAirline = await Airline.findOne({ icao });
    if (existingAirline) {
      return res.status(400).json({ message: `La compagnie avec l\'ICAO ${icao} existe déjà.` });
    }

    // Si un fichier est présent, l'uploader sur Cloudinary
    if (req.file) {
      try {
        cloudinaryResult = await uploadToCloudinary(req.file.buffer, icao);
        console.log('Cloudinary Upload Result:', cloudinaryResult);
      } catch (uploadError) {
        console.error("Erreur upload Cloudinary lors création:", uploadError);
        return res.status(500).json({ message: 'Erreur lors du téléversement du logo.', error: uploadError.message });
      }
    }

    const newAirlineData = {
      icao,
      name,
      callsign,
      country,
      // Utiliser les infos de Cloudinary si disponibles
      logoUrl: cloudinaryResult?.secure_url || null,
      logoPublicId: cloudinaryResult?.public_id || null,
      createdBy: userId, // Assigner l'utilisateur courant
      lastUpdatedBy: userId // Initialiser
    };

    const newAirline = new Airline(newAirlineData);
    const savedAirline = await newAirline.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'CREATE', 'Airline', savedAirline.icao, { name: savedAirline.name }); // Utiliser l'ICAO comme targetId

    res.status(201).json(savedAirline);

  } catch (error) {
    // Si une erreur DB survient APRES un upload Cloudinary réussi, tenter de supprimer l'image uploadée
    if (cloudinaryResult?.public_id) {
       console.warn("Erreur DB après upload Cloudinary, tentative de suppression de l'image...");
       try {
         await deleteFromCloudinary(cloudinaryResult.public_id);
         console.log(`Image ${cloudinaryResult.public_id} supprimée de Cloudinary après erreur DB.`);
       } catch (deleteError) {
         console.error(`Échec suppression image ${cloudinaryResult.public_id} de Cloudinary après erreur DB:`, deleteError);
       }
    }
    console.error('Erreur lors de la création de la compagnie:', error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la création de la compagnie.' });
  }
};

// @desc    Récupérer une compagnie par ID
// @route   GET /api/airlines/:id
// @access  Private/Admin (à sécuriser plus tard)
export const getAirlineById = async (req, res) => {
  try {
    const airline = await Airline.findById(req.params.id);
    if (airline) {
      res.status(200).json(airline);
    } else {
      res.status(404).json({ message: 'Compagnie non trouvée.' });
    }
  } catch (error) {
    console.error(`Erreur lors de la récupération de la compagnie ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};


// @desc    Mettre à jour une compagnie aérienne
// @route   PUT /api/airlines/:id
// @access  Private/Admin (à sécuriser plus tard)
export const updateAirline = async (req, res) => {
  const { name, callsign, country } = req.body;
  const airlineId = req.params.id;
  const userId = req.user?._id; // Récupérer l'ID utilisateur
  let cloudinaryResult = null;
  let oldLogoPublicId = null;
  let logoUpdated = false; // Flag pour savoir si le logo a changé

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  try {
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    oldLogoPublicId = airline.logoPublicId; 
    let hasChanges = false;
    const details = { changes: [] }; 

    // Upload Cloudinary si nouveau fichier
    if (req.file) {
      try {
        // Utiliser l'ICAO existant comme public_id
        cloudinaryResult = await uploadToCloudinary(req.file.buffer, airline.icao);
        logoUpdated = true;
      } catch (uploadError) {
        console.error("Erreur upload Cloudinary lors mise à jour:", uploadError);
        return res.status(500).json({ message: 'Erreur lors du téléversement du nouveau logo.', error: uploadError.message });
      }
    } else if (req.body.logoUrl === '') {
      // Si le champ est explicitement vidé (pas de fichier uploadé)
      // On marque pour suppression DB et Cloudinary
      cloudinaryResult = { secure_url: null, public_id: null }; 
      logoUpdated = true;
    }
    // Si ni fichier, ni logoUrl vide, cloudinaryResult reste null, on ne touche pas aux logos

    // Mettre à jour les champs texte si différents
    if (name !== undefined && name !== airline.name) { details.changes.push({ field: 'name', old: airline.name, new: name }); airline.name = name; hasChanges = true; }
    if (callsign !== undefined && callsign !== airline.callsign) { details.changes.push({ field: 'callsign', old: airline.callsign, new: callsign }); airline.callsign = callsign; hasChanges = true; }
    if (country !== undefined && country !== airline.country) { details.changes.push({ field: 'country', old: airline.country, new: country }); airline.country = country; hasChanges = true; }
    
    // Mettre à jour les infos logo si un changement a eu lieu
    if (logoUpdated) {
      if (airline.logoUrl !== cloudinaryResult.secure_url) { 
          details.changes.push({ field: 'logoUrl', old: airline.logoUrl, new: cloudinaryResult.secure_url }); 
          hasChanges = true; 
      }
      airline.logoUrl = cloudinaryResult.secure_url;
      airline.logoPublicId = cloudinaryResult.public_id;
    }

    if (!hasChanges) {
      return res.status(200).json(airline); // Aucune modification
    }

    // Assigner l'utilisateur qui a fait la mise à jour
    airline.lastUpdatedBy = userId;
    
    const updatedAirline = await airline.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'UPDATE', 'Airline', airline.icao, details); // Utiliser l'ICAO comme targetId

    // Si mise à jour réussie ET logo changé, supprimer l'ancien de Cloudinary
    if (logoUpdated && oldLogoPublicId && oldLogoPublicId !== cloudinaryResult.public_id) {
       console.log(`Tentative de suppression de l'ancien logo Cloudinary: ${oldLogoPublicId}`);
        try {
          await deleteFromCloudinary(oldLogoPublicId);
          console.log(`Ancien logo ${oldLogoPublicId} supprimé de Cloudinary.`);
        } catch (deleteError) {
          // Logguer l'erreur mais ne pas bloquer la réponse succès
          console.error(`Échec suppression ancien logo ${oldLogoPublicId} de Cloudinary:`, deleteError);
        }
    }

    res.status(200).json(updatedAirline);

  } catch (error) {
     // Si une erreur DB survient APRES un upload Cloudinary réussi, tenter de supprimer l'image uploadée
     if (cloudinaryResult?.public_id) {
        console.warn("Erreur DB après upload Cloudinary (update), tentative de suppression de l'image...");
        try {
          await deleteFromCloudinary(cloudinaryResult.public_id);
          console.log(`Image ${cloudinaryResult.public_id} supprimée de Cloudinary après erreur DB (update).`);
        } catch (deleteError) {
          console.error(`Échec suppression image ${cloudinaryResult.public_id} de Cloudinary après erreur DB (update):`, deleteError);
        }
     }
    console.error(`Erreur lors de la mise à jour de la compagnie ${airlineId}:`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour.' });
  }
};

// @desc    Supprimer une compagnie aérienne
// @route   DELETE /api/airlines/:id
// @access  Private/Admin (à sécuriser plus tard)
export const deleteAirline = async (req, res) => {
  const airlineId = req.params.id;
  const userId = req.user?._id; // Récupérer l'ID utilisateur
  let logoPublicIdToDelete = null;

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  try {
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    // Vérifier si la compagnie est utilisée dans les parkings
    const parkingsUsingAirline = await Parking.countDocuments({ airline: airline.icao });
    if (parkingsUsingAirline > 0) {
      return res.status(400).json({ message: `Cette compagnie (${airline.icao}) est utilisée par ${parkingsUsingAirline} parking(s) et ne peut pas être supprimée.` });
    }

    logoPublicIdToDelete = airline.logoPublicId;
    const airlineIdentifier = airline.icao; // Garder l'ICAO pour le log

    await airline.deleteOne(); 

    // Log l'activité APRÈS la suppression DB
    logActivity(userId, 'DELETE', 'Airline', airlineId, { identifier: airlineIdentifier });

    // Si suppression DB réussit ET qu'il y avait un logo, supprimer de Cloudinary
    if (logoPublicIdToDelete) {
       console.log(`Tentative de suppression du logo Cloudinary: ${logoPublicIdToDelete}`);
        try {
          await deleteFromCloudinary(logoPublicIdToDelete);
          console.log(`Logo ${logoPublicIdToDelete} supprimé de Cloudinary.`);
        } catch (deleteError) {
          console.error(`Échec suppression logo ${logoPublicIdToDelete} de Cloudinary lors suppression compagnie:`, deleteError);
        }
    }

    res.status(200).json({ message: 'Compagnie supprimée avec succès.' });

  } catch (error) {
    console.error(`Erreur lors de la suppression de la compagnie ${airlineId}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression.' });
  }
};

// @desc    Mettre à jour uniquement le logo d'une compagnie aérienne
// @route   PUT /api/airlines/:id/logo
// @access  Private/Admin
export const updateAirlineLogo = async (req, res) => {
  const airlineId = req.params.id;
  const userId = req.user?._id; // Récupérer l'ID utilisateur
  let cloudinaryResult = null;
  let oldLogoPublicId = null;
  let oldLogoUrl = null;

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non identifié pour logger l\'action.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier de logo fourni.' });
  }

  try {
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    oldLogoPublicId = airline.logoPublicId;
    oldLogoUrl = airline.logoUrl;

    // Upload nouveau logo Cloudinary
    try {
      const publicId = `airline-logos/airline_${airlineId}_${Date.now()}`;
      cloudinaryResult = await uploadToCloudinary(req.file.buffer, publicId);
    } catch (uploadError) {
      console.error("Erreur upload Cloudinary lors mise à jour logo:", uploadError);
      return res.status(500).json({ message: 'Erreur lors du téléversement du nouveau logo.', error: uploadError.message });
    }

    // Mettre à jour la DB
    airline.logoUrl = cloudinaryResult.secure_url;
    airline.logoPublicId = cloudinaryResult.public_id;
    airline.lastUpdatedBy = userId; // Mettre à jour qui a modifié

    const updatedAirline = await airline.save();

    // Log l'activité APRÈS la sauvegarde réussie
    logActivity(userId, 'UPDATE_LOGO', 'Airline', airline.icao, { 
        newUrl: cloudinaryResult.secure_url, 
        oldUrl: oldLogoUrl 
    }); // Utiliser l'ICAO comme targetId

    // Si mise à jour DB réussie ET ancien logo, supprimer l'ancien de Cloudinary
    if (oldLogoPublicId) {
       console.log(`Tentative de suppression de l'ancien logo Cloudinary: ${oldLogoPublicId}`);
        try {
          await deleteFromCloudinary(oldLogoPublicId);
          console.log(`Ancien logo ${oldLogoPublicId} supprimé de Cloudinary.`);
        } catch (deleteError) {
          // Logguer l'erreur mais ne pas bloquer la réponse succès
          console.error(`Échec suppression ancien logo ${oldLogoPublicId} de Cloudinary:`, deleteError);
        }
    }

    res.status(200).json(updatedAirline); 

  } catch (error) {
     // Si erreur DB après upload, supprimer le nouveau logo Cloudinary
     if (cloudinaryResult?.public_id) {
        console.warn("Erreur DB après upload Cloudinary (logo update), tentative de suppression de l'image...");
        try {
          await deleteFromCloudinary(cloudinaryResult.public_id);
          console.log(`Image ${cloudinaryResult.public_id} supprimée de Cloudinary après erreur DB.`);
        } catch (deleteError) {
          console.error(`Échec suppression image ${cloudinaryResult.public_id} de Cloudinary après erreur DB:`, deleteError);
        }
     }
    console.error(`Erreur lors de la mise à jour du logo pour la compagnie ${airlineId}:`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour du logo.' });
  }
};

// Nouvelle fonction pour récupérer les compagnies présentes dans les parkings
export const getManagedAirlines = async (req, res) => {
  try {
    // 1. Obtenir les ICAO uniques des compagnies depuis les parkings
    const parkingIcaos = await Parking.distinct('airline', { 
      airline: { $ne: null, $ne: "" } // Exclure les parkings sans airline
    });
    console.log(`[getManagedAirlines] ICAOs uniques trouvés dans les parkings: ${parkingIcaos.length}`);

    if (parkingIcaos.length === 0) {
      return res.status(200).json({ managedAirlines: [], missingIcaos: [] });
    }

    // 2. Récupérer les détails des compagnies correspondantes depuis la collection Airline
    const managedAirlines = await Airline.find({
      icao: { $in: parkingIcaos } // Ne chercher que les compagnies trouvées dans les parkings
    })
    .sort({ name: 1 }) // Trier par nom directement depuis la DB
    .lean(); // .lean() pour obtenir des objets JS simples, plus performant
    console.log(`[getManagedAirlines] Compagnies correspondantes trouvées dans Airlines: ${managedAirlines.length}`);

    // 3. Identifier les ICAOs manquants (présents dans Parking mais pas dans Airline)
    const foundIcaos = new Set(managedAirlines.map(a => a.icao));
    const missingIcaos = parkingIcaos.filter(icao => !foundIcaos.has(icao)).sort();
    console.log(`[getManagedAirlines] ICAOs manquants: ${missingIcaos.length}`);

    // 4. Renvoyer le résultat
    res.status(200).json({
      managedAirlines, // La liste des compagnies gérables (avec détails)
      missingIcaos      // La liste des ICAO des compagnies référencées mais non trouvées
    });

  } catch (error) {
    console.error("Erreur lors de la récupération des compagnies gérables:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des compagnies gérables.' });
  }
}; 