import express from 'express';
import User from '../models/User.js'; // Importer le modèle User existant
import { protect, authorize } from '../middleware/authMiddleware.js'; // <-- Importer les middlewares
import { logActivity } from '../utils/activityLogger.js'; // Importer le logger

const router = express.Router();

// === Routes Publiques ===

// POST /api/users/register - Création d'un nouveau compte utilisateur (en attente de validation)
router.post('/register', async (req, res, next) => {
  const { username, email, password } = req.body;

  // --- Validation de base --- 
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Veuillez fournir un nom d\'utilisateur, un email et un mot de passe.' });
  }

  // TODO: Ajouter une validation plus robuste (format email, longueur mdp, etc.)
  // avec express-validator par exemple

  try {
    // --- Vérification de l'unicité --- 
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      let message = 'Un utilisateur existe déjà avec ces informations.';
      if (existingUser.email === email) {
        message = 'Un compte existe déjà avec cette adresse email.';
      }
      if (existingUser.username === username) {
        message = 'Ce nom d\'utilisateur est déjà pris.';
      }
      return res.status(409).json({ message }); // 409 Conflict
    }

    // --- Création de l'utilisateur --- 
    const newUser = new User({
      username,
      email,
      password, // Le hachage sera géré par le hook pre-save du modèle
      isActive: false, // Le compte est inactif par défaut, en attente de validation admin
      roles: ['user'] // Rôle par défaut
    });

    // --- Sauvegarde --- 
    const savedUser = await newUser.save();

    // Log l'activité APRÈS la sauvegarde réussie
    // L'utilisateur qui s'enregistre est à la fois l'acteur et la cible ici
    // (ou on pourrait utiliser un ID système/null comme acteur si on préfère)
    logActivity(savedUser._id, 'REGISTER', 'Auth', savedUser._id, { status: 'PendingValidation' }); 

    // --- Réponse succès --- 
    // Ne pas renvoyer le mot de passe, même haché.
    res.status(201).json({
      message: 'Compte créé avec succès. Il est en attente de validation par un administrateur.',
      // On pourrait renvoyer des infos utilisateur limitées si nécessaire, mais ici juste un message suffit.
    });

  } catch (error) {
    console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
    // Passer l'erreur au middleware de gestion d'erreurs global
    next(error);
  }
});

// === Routes Protégées (Admin seulement) ===

// GET /api/users - Récupérer les utilisateurs (tous ou filtrés par isActive)
router.get(
  '/', 
  protect, 
  authorize('admin'), 
  async (req, res, next) => {
    try {
      const filter = {};
      // Appliquer le filtre seulement si isActive=false est explicitement demandé
      if (req.query.isActive === 'false') {
        filter.isActive = false;
      } 
      // Si isActive est différent de 'false' ou non fourni, le filtre reste vide ({}), 
      // ce qui retournera tous les utilisateurs.
      
      // Ne pas renvoyer les mots de passe
      // Trier par date de création peut être utile (les plus récents en premier pour la validation)
      const users = await User.find(filter)
                              .select('-password')
                              .sort({ createdAt: -1 }); // Trie décroissant par date de création
      
      res.status(200).json(users);
      
    } catch (error) {
      console.error("Erreur lors de la récupération des utilisateurs:", error);
      next(error);
    }
  }
);

// PATCH /api/users/:id/activate - Activer un compte utilisateur et optionnellement assigner des rôles
router.patch(
  '/:id/activate', 
  protect, 
  authorize('admin'), 
  async (req, res, next) => {
    const { roles } = req.body; // Récupérer les rôles optionnels du corps de la requête
    const adminUserId = req.user?._id; // L'admin qui fait l'action
    const targetUserId = req.params.id;

    if (!adminUserId) {
      return res.status(401).json({ message: 'Administrateur non identifié.' });
    }

    try {
      const user = await User.findById(targetUserId);

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }

      let hasChanges = false;
      const details = { changes: [] };
      const previousState = { isActive: user.isActive, roles: [...user.roles] }; // Sauvegarder l'état précédent

      // Mettre à jour les rôles si fournis et différents
      if (roles) {
        if (!Array.isArray(roles) || roles.some(role => !['user', 'admin', 'moderator'].includes(role))) { 
          return res.status(400).json({ message: 'Rôles fournis invalides.' });
        }
        // Vérifier si les rôles ont réellement changé
        if (JSON.stringify(user.roles.sort()) !== JSON.stringify(roles.sort())) {
          details.changes.push({ field: 'roles', old: previousState.roles, new: roles });
          user.roles = roles; 
          hasChanges = true;
        }
      }
      
      // Activer si pas déjà actif
      if (!user.isActive) {
        details.changes.push({ field: 'isActive', old: false, new: true });
        user.isActive = true; 
        hasChanges = true;
      }

      if (!hasChanges) {
          // Renvoyer l'utilisateur sans modification si rien n'a changé
          const currentUserData = user.toObject();
          delete currentUserData.password;
          return res.status(200).json({ 
            message: 'Aucune modification nécessaire.', 
            user: currentUserData 
          });
      }

      // Assigner l'admin comme dernier modificateur
      user.lastUpdatedBy = adminUserId;
      const updatedUserResult = await user.save();

      // Log l'activité APRÈS la sauvegarde réussie
      // Déterminer l'action principale pour le log
      const mainAction = !previousState.isActive ? 'VALIDATE_USER' : 'CHANGE_ROLE'; 
      logActivity(adminUserId, mainAction, 'User', targetUserId, details);

      const updatedUserResponse = updatedUserResult.toObject();
      delete updatedUserResponse.password;

      res.status(200).json({ 
        message: 'Compte utilisateur activé/mis à jour avec succès.', 
        user: updatedUserResponse 
      });

    } catch (error) {
      console.error("Erreur lors de l'activation/mise à jour de l'utilisateur:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID utilisateur invalide.' });
      }
      next(error);
    }
  }
);

// TODO: Ajouter une route DELETE /api/users/:id pour rejeter/supprimer un compte ? (Admin)
// Si ajoutée, il faudra logger l'action 'DELETE' et targetType 'User'

export default router; 