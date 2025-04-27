import express from 'express';
import { z } from 'zod';
import {
  getAllAirports,
  createAirport,
  getAirportById,
  updateAirport,
  deleteAirport
} from '../controllers/airportController.js';
import { validate } from '../middleware/validationMiddleware.js';

// Importer middleware d'authentification/autorisation plus tard
// import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Schémas de validation Zod pour les aéroports ---

// Schéma pour valider l'ID MongoDB dans les paramètres
const idParamSchema = z.object({
  params: z.object({
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "ID d'aéroport invalide (ObjectId attendu)" }),
  })
});

// Schéma pour la création d'un aéroport (POST /)
const createAirportSchema = z.object({
  body: z.object({
    icao: z.string({ required_error: "ICAO est requis" }).length(4, "L'ICAO doit faire 4 caractères").trim().toUpperCase(),
    name: z.string({ required_error: "Le nom est requis" }).min(1, "Le nom ne peut être vide").trim(),
    iata: z.string().length(3, "Le code IATA doit faire 3 caractères").optional(),
    city: z.string().optional(),
    country: z.string({ required_error: "Le pays est requis" }).min(2, "Le code pays doit faire au moins 2 caractères").trim(),
    latitude: z.number({ invalid_type_error: "La latitude doit être un nombre" }).optional(),
    longitude: z.number({ invalid_type_error: "La longitude doit être un nombre" }).optional(),
    elevation: z.number({ invalid_type_error: "L'élévation doit être un nombre" }).optional(),
    timezone: z.string().optional()
  })
});

// Schéma pour la mise à jour d'un aéroport (PUT /:id)
// Permet des champs partiels dans le body
const updateAirportSchema = z.object({
  params: z.object({
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "ID d'aéroport invalide" }),
  }),
  body: z.object({
    icao: z.string().length(4, "L'ICAO doit faire 4 caractères").trim().toUpperCase().optional(),
    name: z.string().min(1, "Le nom ne peut être vide").trim().optional(),
    iata: z.string().length(3, "Le code IATA doit faire 3 caractères").optional(),
    city: z.string().optional(),
    country: z.string().min(2, "Le code pays doit faire au moins 2 caractères").trim().optional(),
    latitude: z.number({ invalid_type_error: "La latitude doit être un nombre" }).optional(),
    longitude: z.number({ invalid_type_error: "La longitude doit être un nombre" }).optional(),
    elevation: z.number({ invalid_type_error: "L'élévation doit être un nombre" }).optional(),
    timezone: z.string().optional()
  }).partial()
});

// --- Définition des routes CRUD pour les aéroports avec validation ---

router.route('/')
  // Ajouter potentiellement une validation pour req.query (filtres, pagination) si nécessaire
  .get(getAllAirports) // .get(protect?, validate(getQuerySchema?), getAllAirports)
  .post(validate(createAirportSchema), createAirport); // .post(protect, admin, validate(createAirportSchema), createAirport)

router.route('/:id')
  .get(validate(idParamSchema), getAirportById) // .get(protect?, validate(idParamSchema), getAirportById)
  .put(validate(updateAirportSchema), updateAirport) // .put(protect, admin, validate(updateAirportSchema), updateAirport)
  .delete(validate(idParamSchema), deleteAirport); // .delete(protect, admin, validate(idParamSchema), deleteAirport)

export default router; 