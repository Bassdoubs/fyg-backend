import Parking from '../models/Parking.js';
import Airline from '../models/Airline.js';

// Récupérer les statistiques globales
export const getGlobalStats = async (req, res) => {
  try {
    // 1. Compter le total des parkings
    const totalParkings = await Parking.countDocuments();

    // 2. Compter les compagnies uniques présentes dans les parkings
    const uniqueCompanies = await Parking.distinct('airline', { airline: { $ne: null, $ne: "" } });
    const totalCompanies = uniqueCompanies.length;

    // 3. Compter les aéroports uniques présents dans les parkings
    const uniqueAirports = await Parking.distinct('airport', { airport: { $ne: null, $ne: "" } });
    const totalAirports = uniqueAirports.length;

    // 4. Compter les parkings par préfixe OACI (2 premières lettres de l'aéroport)
    const countryCounts = await Parking.aggregate([
      {
        $match: { airport: { $exists: true, $ne: null, $type: 'string', $ne: "" } } 
      },
      {
        $project: {
           // _id: 0, // On peut laisser _id ici, il sera géré plus tard
           // airportCode: "$airport", // Plus besoin pour le résultat final
           prefix: { 
             $toUpper: { // Convertir en majuscules IMMEDIATEMENT
               $cond: {
                 if: { $gte: [{ $strLenCP: "$airport" }, 2] },
                 then: { $substrCP: [ "$airport", 0, 2 ] },
                 else: null 
               }
             }
           },
           // Projeter aussi l'aéroport pour l'étape $group suivante
           airport: "$airport"
        }
      },
      // Remettre le match sur le format du préfixe (maintenant en majuscules)
      {
        $match: { 
          prefix: { $ne: null, $regex: /^[A-Z]{2}$/ } 
        }
      },
      // Remettre le groupement par préfixe et comptage des aéroports uniques
      {
        $group: {
          _id: "$prefix",      
          uniqueAirportsInGroup: { $addToSet: "$airport" } 
        }
      },
      // Remettre le projet final avec le comptage sécurisé
      {
        $project: {
          _id: 0,
          code: "$_id",       
          count: { 
            $cond: { 
              if: { $isArray: "$uniqueAirportsInGroup" }, 
              then: { $size: "$uniqueAirportsInGroup" }, 
              else: 0 
            }
          }
        }
      },
      // Remettre le tri
      { 
        $sort: { count: -1 } 
      }
    ]); // Retirer la limite

    // 5. Construire la réponse (structure originale)
    const stats = {
      totalParkings,
      totalAirports, // Maintenant le compte réel des aéroports uniques dans les parkings
      totalCompanies, // Maintenant le compte réel des compagnies uniques dans les parkings
      countryCounts   // Liste des { code: "XX", count: N }
    };

    res.status(200).json(stats);

  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques globales:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des statistiques globales' });
  }
}; 