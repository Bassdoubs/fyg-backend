import express from 'express';
import { z } from 'zod';
import { loginUser, registerUser } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
// Importer d'autres contrôleurs si nécessaire (ex: registerUser)

const router = express.Router();

// --- Schémas de validation Zod pour l'authentification ---

// Schéma pour la connexion (POST /login)
const loginSchema = z.object({
  body: z.object({
    // Attendre 'identifier' (peut être email ou username)
    identifier: z.string({ required_error: "L'identifiant (email ou username) est requis" }).min(3, "L'identifiant doit faire au moins 3 caractères"), 
    password: z.string({ required_error: "Le mot de passe est requis" }).min(6, "Le mot de passe doit faire au moins 6 caractères"),
  })
});

// Schéma pour l'enregistrement (POST /register)
const registerSchema = z.object({
  body: z.object({
    username: z.string({ required_error: "Le nom d'utilisateur est requis" }).min(3, "Le nom d'utilisateur doit faire au moins 3 caractères").trim(),
    email: z.string({ required_error: "L'email est requis" }).email("Format d'email invalide").trim(),
    password: z.string({ required_error: "Le mot de passe est requis" }).min(6, "Le mot de passe doit faire au moins 6 caractères"),
    // Ajouter le rôle si l'admin peut le définir lors de l'enregistrement
    role: z.enum(['user', 'admin']).optional().default('user') // Ou rendre requis si l'admin DOIT choisir
  })
});

// --- Définition des routes d'authentification avec validation ---

router.post('/login', validate(loginSchema), loginUser);

// Route pour enregistrer un nouvel utilisateur (Admin seulement)
router.post('/register', protect, authorize('ADMIN'), validate(registerSchema), registerUser);

// Définir d'autres routes d'authentification ici (ex: /register)

export default router; 