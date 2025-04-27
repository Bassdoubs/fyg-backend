import Airport from '../models/Airport.js';
import Parking from '../models/Parking.js'; // Importer le modèle Parking

// @desc    Récupérer tous les aéroports (avec pagination, recherche et compte parkings)
// @route   GET /api/airports
// @access  Public (ou Private/Admin selon la politique)
export const getAllAirports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search || '';
    
    const skip = (page - 1) * limit;

    // --- Construction de l'étape $match initiale --- 
    let matchStage = {};
    if (search) {
      const searchString = search.trim();
      if (searchString) {
        matchStage = { $text: { $search: searchString } };
        console.log(`[getAllAirports Aggregation] Using text search for: "${searchString}"`);
      }
    } 

    // --- Construction de l'étape $sort --- 
    let sortStage = { icao: 1 }; // Tri par défaut
    if (search) {
      // Tri par pertinence par défaut si recherche texte
      sortStage = { score: { $meta: "textScore" } }; 
    } // Ajouter d'autres logiques de tri si nécessaire

    // --- Pipeline d'Agrégation --- 
    const aggregationPipeline = [];

    // Étape 1: Match initial (basé sur la recherche)
    if (Object.keys(matchStage).length > 0) {
        // Si recherche texte, ajouter le $project pour le score avant $match
        if(matchStage.$text) {
            aggregationPipeline.push({ $match: matchStage });
            // On pourrait projeter le score ici si on veut l'utiliser plus tard
            // aggregationPipeline.push({ $addFields: { score: { $meta: "textScore" } } });
        } else {
            aggregationPipeline.push({ $match: matchStage });
        }
    }

    // Étape 2: Lookup pour joindre les parkings
    aggregationPipeline.push({
      $lookup: {
        from: Parking.collection.name, // Nom de la collection des parkings
        localField: 'icao',       // Champ dans Airport
        foreignField: 'airport',    // Champ dans Parking
        as: 'associatedParkings' // Nom du tableau résultant de la jointure
      }
    });

    // Étape 3: Ajouter le champ parkingCount
    aggregationPipeline.push({
      $addFields: {
        parkingCount: { $size: '$associatedParkings' } // Calculer la taille du tableau joint
      }
    });

    // Étape 4: Retirer le tableau des parkings (optionnel, pour alléger la réponse)
    aggregationPipeline.push({
        $project: {
            associatedParkings: 0
        }
    });

    // Étape 5: Appliquer le tri
    aggregationPipeline.push({ $sort: sortStage });

    // Étape 6: Pagination avec $facet
    aggregationPipeline.push({
      $facet: {
        paginatedResults: [
          { $skip: skip },
          { $limit: limit }
        ],
        totalCount: [
          // Compter les documents *après* le $match initial
          // Il faut réappliquer le $match initial dans cette branche du $facet
          // Ou, plus simple, on fait un count séparé.
          { $count: 'count' }
        ]
      }
    });

    // --- Exécution de l'agrégation --- 
    const results = await Airport.aggregate(aggregationPipeline).exec();
    
    // --- Exécuter un count séparé pour la pagination correcte après $match --- 
    const totalCount = await Airport.countDocuments(matchStage);

    // --- Formatage de la réponse --- 
    const airports = results[0]?.paginatedResults || [];
    // Utiliser le totalCount du countDocuments séparé
    // const totalFilteredDocs = results[0]?.totalCount[0]?.count || 0; 

    res.status(200).json({
      docs: airports, // Contient maintenant les aéroports avec parkingCount
      totalDocs: totalCount, // Le compte total après le match initial
      limit: limit,
      page: page,
      totalPages: Math.ceil(totalCount / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalCount / limit),
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < Math.ceil(totalCount / limit) ? page + 1 : null,
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des aéroports (agrégation):', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des aéroports.' });
  }
};

// @desc    Créer un nouvel aéroport
// @route   POST /api/airports
// @access  Private/Admin (à sécuriser plus tard)
export const createAirport = async (req, res) => {
  const { icao, name, city, country, latitude, longitude, elevation, timezone } = req.body;

  // Validation simple
  if (!icao || !name) {
    return res.status(400).json({ message: 'Les champs ICAO et Nom sont requis.' });
  }

  try {
    const existingAirport = await Airport.findOne({ icao });
    if (existingAirport) {
      return res.status(400).json({ message: `L\'aéroport avec l\'ICAO ${icao} existe déjà.` });
    }

    const newAirport = new Airport({
      icao,
      name,
      city,
      country,
      latitude,
      longitude,
      elevation,
      timezone
    });

    const savedAirport = await newAirport.save();
    res.status(201).json(savedAirport);

  } catch (error) {
    console.error('Erreur lors de la création de l\'aéroport:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la création de l\'aéroport.' });
  }
};

// @desc    Récupérer un aéroport par ID
// @route   GET /api/airports/:id
// @access  Private/Admin (à sécuriser plus tard)
export const getAirportById = async (req, res) => {
  try {
    const airport = await Airport.findById(req.params.id);
    if (airport) {
      res.status(200).json(airport);
    } else {
      res.status(404).json({ message: 'Aéroport non trouvé.' });
    }
  } catch (error) {
    console.error(`Erreur lors de la récupération de l\'aéroport ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// @desc    Mettre à jour un aéroport
// @route   PUT /api/airports/:id
// @access  Private/Admin (à sécuriser plus tard)
export const updateAirport = async (req, res) => {
  const { icao, name, city, country, latitude, longitude, elevation, timezone } = req.body;
  const airportId = req.params.id;

  try {
    const airport = await Airport.findById(airportId);

    if (!airport) {
      return res.status(404).json({ message: 'Aéroport non trouvé.' });
    }

    // Vérifier unicité ICAO si modifié
    if (icao && icao !== airport.icao) {
      const existingAirportWithIcao = await Airport.findOne({ icao: icao });
      if (existingAirportWithIcao && existingAirportWithIcao._id.toString() !== airportId) {
        return res.status(400).json({ message: `L\'ICAO ${icao} est déjà utilisé par un autre aéroport.` });
      }
      airport.icao = icao;
    }

    // Mettre à jour les champs
    airport.name = name ?? airport.name;
    airport.city = city ?? airport.city;
    airport.country = country ?? airport.country;
    airport.latitude = latitude ?? airport.latitude;
    airport.longitude = longitude ?? airport.longitude;
    airport.elevation = elevation ?? airport.elevation;
    airport.timezone = timezone ?? airport.timezone;

    const updatedAirport = await airport.save();
    res.status(200).json(updatedAirport);

  } catch (error) {
    console.error(`Erreur lors de la mise à jour de l\'aéroport ${airportId}:`, error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
    }
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour.' });
  }
};

// @desc    Supprimer un aéroport
// @route   DELETE /api/airports/:id
// @access  Private/Admin (à sécuriser plus tard)
export const deleteAirport = async (req, res) => {
  const airportId = req.params.id;

  try {
    const airport = await Airport.findById(airportId);

    if (!airport) {
      return res.status(404).json({ message: 'Aéroport non trouvé.' });
    }

    // TODO: Vérifier si l'aéroport est utilisé dans des parkings avant de supprimer ?
    // const parkingsUsingAirport = await Parking.countDocuments({ airport: airport.icao });
    // if (parkingsUsingAirport > 0) {
    //   return res.status(400).json({ message: `Cet aéroport est utilisé par ${parkingsUsingAirport} parking(s) et ne peut pas être supprimé.` });
    // }

    await airport.deleteOne();
    res.status(200).json({ message: 'Aéroport supprimé avec succès.' });

  } catch (error) {
    console.error(`Erreur lors de la suppression de l\'aéroport ${airportId}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression.' });
  }
}; 