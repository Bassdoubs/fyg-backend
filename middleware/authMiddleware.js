import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Ou utiliser l'index: import { User } from '../models/index.js';

// Middleware pour protéger les routes nécessitant une authentification
export const protect = async (req, res, next) => {
  let token;

  // Vérifier si l'en-tête Authorization existe et commence par 'Bearer'
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extraire le token (enlever 'Bearer ')
      token = req.headers.authorization.split(' ')[1];

      // Vérifier le token avec la clé secrète
      if (!process.env.JWT_SECRET) {
        console.error('ERREUR CRITIQUE: JWT_SECRET n\'est pas défini dans les variables d\'environnement');
        return res.status(500).json({ message: 'Erreur de configuration serveur: JWT_SECRET non défini.' });
      }
      
      console.log('Tentative d\'authentification JWT avec token:', token ? `${token.substring(0, 15)}...` : 'Non fourni');
      
      // Vérifier le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token JWT vérifié avec succès, utilisateur ID:', decoded.userId);

      // Trouver l'utilisateur associé au token (sans le mot de passe)
      // Et s'assurer qu'il est actif
      req.user = await User.findById(decoded.userId).select('-password'); // Exclure le champ password

      if (!req.user || !req.user.isActive) {
          // Si l'utilisateur n'est plus trouvé ou inactif, même si le token était valide
          return res.status(401).json({ message: 'Non autorisé, utilisateur introuvable ou inactif.' });
      }

      // Passer au prochain middleware ou à la route
      next();

    } catch (error) {
      console.error('Erreur lors de la vérification du token JWT:', error.name, error.message);
      // Gérer les erreurs spécifiques de JWT (ex: TokenExpiredError) si besoin
      if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ message: 'Non autorisé, le token a expiré.' });
      }
      // Autres erreurs (JsonWebTokenError, etc.)
      return res.status(401).json({ message: 'Non autorisé, token invalide.' });
    }
  }

  // Si aucun token n'est trouvé dans l'en-tête
  if (!token) {
    res.status(401).json({ message: 'Non autorisé, aucun token fourni.' });
  }
};

// Middleware optionnel pour vérifier les rôles (on pourra l'utiliser plus tard)
export const authorize = (...roles) => {
  return (req, res, next) => {
    // 'protect' doit avoir été exécuté avant, donc req.user doit exister
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ message: 'Utilisateur non authentifié ou rôles manquants.' });
    }

    // Vérifie si au moins un des rôles de l'utilisateur est dans la liste des rôles autorisés
    const hasRequiredRole = req.user.roles.some(role => roles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ message: `Accès refusé. Rôle(s) requis: ${roles.join(', ')}` });
    }
    next();
  };
}; 