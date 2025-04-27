import express from 'express';
import { z } from 'zod'; // Importer Zod
import { 
    getAllAirlines,
    updateAirlineLogo,
    getManagedAirlines
} from '../controllers/airlineController.js';
import upload from '../middleware/multerMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js'; // Importer le middleware factorisé
// import { protect, admin } from '../middleware/authMiddleware.js'; // Garder commenté pour l'instant si nécessaire

const router = express.Router();

// --- Schémas de validation Zod ---
const idParamSchema = z.object({
  params: z.object({
    // Utiliser une validation plus spécifique pour l'ID de compagnie si ce n'est pas un ObjectId
    // Si c'est un ICAO par exemple :
    // id: z.string().min(2, "Airline ID/ICAO doit avoir au moins 2 caractères").max(5, "Airline ID/ICAO ne peut dépasser 5 caractères"),
    // Si c'est bien un ObjectId MongoDB:
    id: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), { message: "ID de compagnie invalide (ObjectId attendu)" }),
  })
});

// Ajouter d'autres schémas pour les futures routes CRUD (POST, PUT)
// Exemple pour la création (si on ajoute POST /)
/*
const createAirlineSchema = z.object({
  body: z.object({
    icao: z.string().min(2).max(5),
    name: z.string().min(1),
    // ... autres champs requis ou optionnels ...
  })
});
*/

// === Routes pour les compagnies aériennes ===

// GET /api/airlines/managed - Récupérer uniquement les compagnies présentes dans les parkings
router.get('/managed', getManagedAirlines);

// GET /api/airlines - Récupérer toutes les compagnies (avec pagination/recherche)
// Ajouter validation pour req.query si des filtres/pagination sont implémentés
router.get('/', getAllAirlines);

// Route pour mettre à jour le logo d'une compagnie aérienne
// PUT /api/airlines/:id/logo
router.put(
    '/:id/logo',
    // protect, 
    // admin, // Si seuls les admins peuvent changer le logo
    validate(idParamSchema), // Utilise le middleware importé
    upload.single('logoFile'), 
    updateAirlineLogo 
);

// TODO: Ajouter les autres routes CRUD ici (GET /:id, POST /, PUT /:id, DELETE /:id)
// en important les fonctions correspondantes depuis airlineController.js et en ajoutant la validation Zod
// Exemple:
// router.post('/', protect, admin, validate(createAirlineSchema), createAirline);
// router.put('/:id', protect, admin, validate(updateAirlineSchema), updateAirline);
// router.delete('/:id', protect, admin, validate(idParamSchema), deleteAirline);

export default router; 