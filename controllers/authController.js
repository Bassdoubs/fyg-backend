import User from '../models/User.js';
import jwt from 'jsonwebtoken';
// bcrypt est importé mais pas directement utilisé ici car on utilise user.comparePassword()

// Fonction pour générer un token JWT
const generateToken = (userId, username, roles) => {
  // Vérifier que la clé secrète est définie
  if (!process.env.JWT_SECRET) {
    console.error('ERREUR FATALE: JWT_SECRET n\'est pas défini dans .env');
    // Dans une application réelle, on pourrait arrêter le serveur ou lancer une erreur plus spécifique
    throw new Error('Configuration serveur incomplète pour JWT.');
  }

  // Payload du token : inclure les informations nécessaires mais non sensibles
  const payload = {
    userId,
    username,
    roles,
  };

  // Options du token (ex: expiration)
  const options = {
    expiresIn: '1d', // Durée de validité du token (ex: 1 jour) - À ajuster
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
};


// @desc    Authentifier un utilisateur & obtenir un token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res, next) => {
  const { identifier, password } = req.body; // 'identifier' peut être username ou email

  // --- Validation basique ---
  // Pour une validation plus robuste, utiliser express-validator
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Veuillez fournir un identifiant (username/email) et un mot de passe.' });
  }

  try {
    // --- Trouver l'utilisateur ---
    // Recherche par username ou email, insensible à la casse pour l'email
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    }).exec(); // .exec() renvoie une vraie promesse

    // --- Vérifier si l'utilisateur existe et est actif ---
    if (!user || !user.isActive) {
      console.log(`Tentative de connexion échouée pour: ${identifier} (Utilisateur non trouvé ou inactif)`);
      // Réponse générique pour ne pas indiquer si l'utilisateur existe ou non
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    // --- Vérifier le mot de passe ---
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      console.log(`Tentative de connexion échouée pour: ${identifier} (Mot de passe incorrect)`);
      // Réponse générique
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    // --- Générer le token JWT ---
    const token = generateToken(user._id, user.username, user.roles);

    console.log(`Connexion réussie pour: ${user.username}`);

    // --- Envoyer la réponse ---
    // Pour l'instant, on envoie le token dans le corps.
    // Une méthode plus sécurisée est d'envoyer le token via un cookie HttpOnly.
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email, // Attention si on ne veut pas renvoyer l'email
        roles: user.roles,
        isActive: user.isActive,
      }
    });

  } catch (error) {
    // Si une erreur survient (ex: erreur DB, erreur bcrypt), la passer au gestionnaire global
    console.error(`Erreur lors de la connexion pour ${identifier}:`, error);
    next(error);
  }
};

// @desc    Enregistrer un nouvel utilisateur (Admin seulement)
// @route   POST /api/auth/register
// @access  Private/Admin
export const registerUser = async (req, res, next) => {
  const { username, email, password, roles, isActive } = req.body;

  // --- Validation basique ---
  // Une validation plus robuste avec express-validator/zod serait idéale ici
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Veuillez fournir username, email et password.' });
  }

  try {
    // --- Vérifier si l'utilisateur ou l'email existe déjà ---
    const userExists = await User.findOne({ $or: [{ username }, { email }] });

    if (userExists) {
      return res.status(400).json({ message: 'Username ou Email déjà utilisé.' });
    }

    // --- Créer le nouvel utilisateur ---
    // Le mot de passe sera haché automatiquement par le hook pre-save du modèle
    const user = new User({
      username,
      email,
      password, // Mot de passe en clair ici, sera haché avant sauvegarde
      roles: roles || ['user'], // Utilise les rôles fournis, ou 'user' par défaut
      isActive: isActive === undefined ? true : isActive, // Actif par défaut
    });

    const createdUser = await user.save();

    console.log(`Nouvel utilisateur enregistré par ${req.user.username}: ${createdUser.username}`);

    // --- Renvoyer les informations de l'utilisateur créé (sans le mot de passe) ---
    res.status(201).json({
      _id: createdUser._id,
      username: createdUser.username,
      email: createdUser.email,
      roles: createdUser.roles,
      isActive: createdUser.isActive,
      createdAt: createdUser.createdAt,
    });

  } catch (error) {
    // Gérer les erreurs (ex: validation Mongoose, erreur DB)
    console.error(`Erreur lors de l\'enregistrement par ${req.user.username}:`, error);
    // Si c'est une erreur de validation Mongoose
    if (error.name === 'ValidationError') {
         return res.status(400).json({ message: 'Données d\'enregistrement invalides.', details: error.message });
    }
    next(error); // Passer aux autres erreurs
  }
};

// D'autres fonctions d'authentification (register, logout, etc.) pourront être ajoutées ici 