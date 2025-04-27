import express from 'express';
import { z } from 'zod';
// Ne pas importer Parking ici, le modèle doit être utilisé dans le contrôleur
// import Parking from '../models/Parking.js'; 
import {
    getAllParkings,
    getParkingById,
    createParking,
    updateParking,
    deleteParking,
    updateParkingMap,
    getUniqueParkingAirlines,
    getGlobalStats,
    deleteBulkParkings,
    createBulkParkings,
    checkParkingDuplicates,
    getUniqueParkingAirportIcaos,
    getParkingsByCountry
} from '../controllers/parkingController.js';
import upload from '../middleware/multerMiddleware.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

// --- Schémas de validation Zod (Conservés) ---

const createParkingSchema = z.object({
  body: z.object({
    airline: z.string({ required_error: "Airline (ICAO) est requis" }).min(3, "Airline ICAO doit avoir au moins 3 caractères").max(5, "Airline ICAO ne peut dépasser 5 caractères").trim(),
    airport: z.string({ required_error: "Airport (ICAO) est requis" }).length(4, "Airport ICAO doit avoir exactement 4 caractères").trim(),
    gate: z.object({
      terminal: z.string().optional().default(''),
      porte: z.string().optional().default(''),
    }).optional(),
    mapInfo: z.object({
      hasMap: z.boolean().optional().default(false),
      mapUrl: z.string().url("L'URL de la carte doit être valide").nullable().optional(),
      source: z.string().nullable().optional()
    }).optional()
  })
});

// Schéma pour la mise à jour 
const updateParkingSchema = z.object({
  params: z.object({
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "ID de parking invalide" }),
  }),
  body: z.object({
    gate: z.object({
      terminal: z.string().optional(),
      porte: z.string().optional(),
    }).optional(),
    mapInfo: z.object({
      hasMap: z.boolean().optional(),
      mapUrl: z.string().url("L'URL de la carte doit être valide").nullable().optional(),
      source: z.string().nullable().optional()
    }).optional()
  }).partial() 
});

const idParamSchema = z.object({
  params: z.object({
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "ID de parking invalide" }),
  })
});

// Schéma pour la suppression en masse
const bulkDeleteSchema = z.object({
  body: z.object({
    ids: z.array(z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "Un ID dans le tableau est invalide" })).min(1, "Le tableau d'IDs ne peut être vide"),
  })
});

// Schéma pour la création en masse et la vérification de doublons
// Basé sur la structure attendue par le frontend lors de l'import
const bulkCreateParkingDataSchema = z.object({
    airline: z.string().trim().toUpperCase(),
    airport: z.string().trim().toUpperCase(),
    gate: z.object({
        terminal: z.string().optional().default(''),
        porte: z.string().optional().default('')
    }).optional(),
    mapInfo: z.object({
        hasMap: z.boolean().optional().default(false),
        mapUrl: z.string().url("L'URL de la carte doit être valide").nullable().optional(),
        source: z.string().nullable().optional()
    }).optional()
}).partial(); // Rendre tous les champs optionnels si nécessaire ou ajuster selon le besoin réel

const bulkCreateSchema = z.object({
    body: z.object({
        parkings: z.array(bulkCreateParkingDataSchema).min(1, "Le tableau de parkings ne peut être vide"),
    })
});

// --- Définition des routes (Nettoyées et utilisant les contrôleurs) ---

// Route spécifique pour obtenir les parkings par codes pays (préfixes OACI)
router.get('/by-country', getParkingsByCountry);

// Statistiques globales (Logique à déplacer dans le contrôleur)
router.get('/stats/global', getGlobalStats); 

// Obtenir les compagnies uniques (Logique déjà dans le contrôleur)
router.get('/airlines/unique', getUniqueParkingAirlines);

// Nouvelle route pour les ICAO uniques
router.get('/unique-airport-icaos', getUniqueParkingAirportIcaos);

// Vérifier les doublons avant import (Logique à déplacer)
router.post('/check-duplicates', protect, authorize('admin'), validate(bulkCreateSchema), checkParkingDuplicates);

// Création en masse (Logique à déplacer)
router.post('/bulk', protect, authorize('admin'), validate(bulkCreateSchema), createBulkParkings);

// Suppression en masse (Logique à déplacer)
router.delete('/bulk', protect, authorize('admin'), validate(bulkDeleteSchema), deleteBulkParkings); 

// Routes CRUD de base (Utilisent déjà les contrôleurs)
router.get('/', getAllParkings); // Note: Pas de validation Zod ici, potentiellement ajouter pour req.query si nécessaire
router.get('/:id', validate(idParamSchema), getParkingById);
router.post('/', protect, authorize('admin'), validate(createParkingSchema), createParking);
router.put('/:id', protect, authorize('admin'), validate(updateParkingSchema), updateParking);
router.delete('/:id', protect, authorize('admin'), validate(idParamSchema), deleteParking);

// Route pour mettre à jour/ajouter une carte (Utilise déjà le contrôleur)
router.patch('/:id/map', protect, authorize('admin'), validate(idParamSchema), upload.single('mapImage'), updateParkingMap);

// --- Suppression des anciennes définitions et logiques inline ---
// Les blocs de code commençant par router.get('/parkings', async (req, res) => {...}), 
// router.post('/parkings', protect, async (req, res) => {...}), etc.
// ainsi que les définitions CRUD dupliquées à la fin sont implicitement supprimés 
// car non inclus dans ce bloc `code_edit`.

export default router; 