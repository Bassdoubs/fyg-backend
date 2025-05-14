import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    // Add validation for email format if needed
    // match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Veuillez entrer une adresse email valide']
  },
  password: {
    type: String,
    required: true,
  },
  roles: {
    type: [String],
    required: true,
    default: ['user'], // Valeur par défaut si non fournie
    enum: ['user', 'admin', 'moderator'], // Liste des rôles possibles (à adapter)
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  // Champ pour l'audit trail (qui a modifié cet utilisateur en dernier)
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true, // Ajoute automatiquement createdAt et updatedAt
});

// Hook pre-save pour hacher le mot de passe avant de sauvegarder
userSchema.pre('save', async function(next) {
  // Ne hacher le mot de passe que s'il a été modifié (ou est nouveau)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Générer un "sel" et hacher le mot de passe
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error); // Passer l'erreur au gestionnaire d'erreurs Express
  }
});

// Méthode pour comparer le mot de passe fourni avec le hash stocké
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error; // Propager l'erreur pour la gérer dans le contrôleur
  }
};

const User = mongoose.model('User', userSchema, 'users'); // Le 3ème argument force le nom de la collection

export default User; 