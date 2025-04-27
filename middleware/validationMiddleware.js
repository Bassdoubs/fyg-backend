import { z } from 'zod';

// Middleware de validation Zod réutilisable
export const validate = (schema) => async (req, res, next) => {
  try {
    // Valider req.body, req.query, et req.params en utilisant le schéma fourni
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    // Si la validation réussit, passer au prochain middleware ou contrôleur
    return next();
  } catch (error) {
    // Si l'erreur est une ZodError, c'est une erreur de validation
    if (error instanceof z.ZodError) {
      // Renvoyer une réponse 400 avec les erreurs formatées
      return res.status(400).json({
        message: 'Erreur de validation',
        // Utiliser flatten() pour obtenir un objet d'erreurs par champ
        errors: error.flatten().fieldErrors, 
      });
    }
    // Si ce n'est pas une ZodError, c'est une erreur inattendue
    console.error("Erreur inattendue dans le middleware de validation:", error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}; 