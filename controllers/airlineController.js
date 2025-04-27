import Airline from '../models/Airline.js';
import Parking from '../models/Parking.js'; // Importer Parking
// import fs from 'fs'; // Plus besoin
// import path from 'path'; // Plus besoin
// Importer les fonctions depuis le nouveau fichier utilitaire
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryUtils.js'; 

// @desc    Récupérer toutes les compagnies aériennes (avec pagination et recherche)
// @route   GET /api/airlines
// @access  Public (ou Private/Admin selon la politique)
export const getAllAirlines = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search || '';
    // Ajouter une option de tri si nécessaire (ex: ?sort=name ou ?sort=-icao)
    // const sort = req.query.sort || 'icao'; 

    const skip = (page - 1) * limit;

    // --- Construction de la condition de recherche ---
    let queryCondition = {};
    let sortCondition = { icao: 1 }; // Tri par défaut

    if (search) {
      const searchString = search.trim();
      if (searchString) {
        // Utiliser l'index texte si un terme de recherche est présent
        queryCondition = { $text: { $search: searchString } };
        // Quand on utilise $text, MongoDB trie par pertinence par défaut.
        // On peut le rendre explicite si besoin :
        // sortCondition = { score: { $meta: "textScore" } }; 
        // Ou si on veut surcharger le tri par pertinence (non recommandé généralement):
        // if (sort === 'name') sortCondition = { name: 1, score: { $meta: "textScore" } };
        // Pour l'instant, on laisse le tri par pertinence par défaut lors d'une recherche.
        console.log(`[getAllAirlines] Using text search for: "${searchString}"`);
      }
    } 
    // else {
      // Gérer le tri explicite si pas de recherche texte (si on ajoute le paramètre `sort`)
      // Exemple:
      // if (sort === '-name') sortCondition = { name: -1 };
      // else if (sort === 'name') sortCondition = { name: 1 };
      // else if (sort === '-icao') sortCondition = { icao: -1 };
      // else sortCondition = { icao: 1 }; // Défaut icao A-Z
    // }

    // --- Exécution des requêtes ---
    const [airlines, totalCount] = await Promise.all([
      Airline.find(queryCondition)
             .sort(sortCondition)
             .skip(skip)
             .limit(limit)
             .lean(), // Utiliser lean() pour de meilleures performances en lecture seule
      Airline.countDocuments(queryCondition)
    ]);

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
  const { icao, name, callsign, country } = req.body;
  let cloudinaryResult = null;

  if (!icao || !name || !country) {
    return res.status(400).json({ message: 'Les champs ICAO, Nom et Pays sont requis.' });
  }

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

    const newAirline = new Airline({
      icao,
      name,
      callsign,
      country,
      // Utiliser les infos de Cloudinary si disponibles
      logoUrl: cloudinaryResult?.secure_url || null,
      logoPublicId: cloudinaryResult?.public_id || null
    });

    const savedAirline = await newAirline.save();
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
  let cloudinaryResult = null;
  let oldLogoPublicId = null;

  try {
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    oldLogoPublicId = airline.logoPublicId; // Sauvegarder l'ancien ID public

    // Si un nouveau fichier est présent, l'uploader
    if (req.file) {
      try {
        // Utiliser l'ICAO existant comme public_id
        cloudinaryResult = await uploadToCloudinary(req.file.buffer, airline.icao);
      } catch (uploadError) {
        console.error("Erreur upload Cloudinary lors mise à jour:", uploadError);
        return res.status(500).json({ message: 'Erreur lors du téléversement du nouveau logo.', error: uploadError.message });
      }
    } else if (req.body.logoUrl === '') {
      // Si le champ est explicitement vidé (pas de fichier uploadé)
      // On marque pour suppression DB et Cloudinary
      cloudinaryResult = { secure_url: null, public_id: null }; 
    }
    // Si ni fichier, ni logoUrl vide, cloudinaryResult reste null, on ne touche pas aux logos

    // Mettre à jour les champs
    airline.name = name ?? airline.name;
    airline.callsign = callsign !== undefined ? callsign : airline.callsign;
    airline.country = country ?? airline.country;
    // Mettre à jour les infos logo seulement si un upload a eu lieu ou si suppression demandée
    if (cloudinaryResult) {
        airline.logoUrl = cloudinaryResult.secure_url;
        airline.logoPublicId = cloudinaryResult.public_id;
    }

    const updatedAirline = await airline.save();

    // Si mise à jour réussie ET un nouveau logo a été uploadé (ou supprimé), 
    // ET qu'il y avait un ancien logo différent, supprimer l'ancien de Cloudinary
    if (cloudinaryResult && oldLogoPublicId && oldLogoPublicId !== cloudinaryResult.public_id) {
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
  let logoPublicIdToDelete = null;

  try {
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    logoPublicIdToDelete = airline.logoPublicId; // Garder l'ID public

    await airline.deleteOne(); 

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
  let cloudinaryResult = null;
  let oldLogoPublicId = null;

  // 1. Vérifier si un fichier est présent
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier de logo fourni.' });
  }

  try {
    // 2. Trouver la compagnie aérienne
    const airline = await Airline.findById(airlineId);
    if (!airline) {
      return res.status(404).json({ message: 'Compagnie non trouvée.' });
    }

    oldLogoPublicId = airline.logoPublicId; // Sauvegarder l'ancien ID public pour suppression éventuelle

    // 3. Uploader le nouveau logo sur Cloudinary
    try {
      // Utiliser un identifiant unique basé sur l'ID et la date pour éviter les conflits de cache
      const publicId = `airline-logos/airline_${airlineId}_${Date.now()}`;
      cloudinaryResult = await uploadToCloudinary(req.file.buffer, publicId);
      console.log('Nouveau logo uploadé sur Cloudinary:', cloudinaryResult);
    } catch (uploadError) {
      console.error("Erreur upload Cloudinary lors mise à jour logo:", uploadError);
      return res.status(500).json({ message: 'Erreur lors du téléversement du nouveau logo.', error: uploadError.message });
    }

    // 4. Mettre à jour les informations du logo dans la DB
    airline.logoUrl = cloudinaryResult.secure_url;
    airline.logoPublicId = cloudinaryResult.public_id;

    const updatedAirline = await airline.save();

    // 5. Si mise à jour DB réussie ET qu'il y avait un ancien logo, supprimer l'ancien de Cloudinary
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

    res.status(200).json(updatedAirline); // Renvoyer la compagnie mise à jour

  } catch (error) {
     // Si une erreur DB survient APRES un upload Cloudinary réussi, tenter de supprimer l'image uploadée
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