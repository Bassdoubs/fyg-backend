import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Schéma pour stocker les feedbacks reçus via Discord
 * Ce modèle est complètement séparé des autres modèles existants
 */
const DiscordFeedbackSchema = new Schema({
  // Identifiants et métadonnées
  feedbackId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Informations utilisateur Discord
  userId: String,
  username: String,
  
  // Informations sur le parking recherché
  airport: String,        // Code ICAO de l'aéroport
  airline: String,        // Code ICAO de la compagnie
  parkingName: String,    // Nom du parking (calculé ou fourni)
  
  // Détails du feedback
  hasInformation: Boolean,
  status: {
    type: String,
    enum: ['NEW', 'PENDING', 'IN_PROGRESS', 'COMPLETED'],
    default: 'NEW',
    index: true
  },
  notes: String,          // Informations additionnelles (potentiellement JSON stringifié)
  
  // Référence Discord
  messageId: String,
  channelId: String,
  
  // Champs administratifs
  adminNotes: String,
  assignedTo: String,
  completedAt: Date,
  
  // Informations détaillées (décodées de notes)
  parsedDetails: {
    stands: String,
    terminal: String,
    additionalInfo: String,
    email: String
  }
}, { timestamps: true });

// Création d'un index texte pour la recherche
DiscordFeedbackSchema.index(
  { 
    airport: 'text', 
    airline: 'text',
    parkingName: 'text',
    'parsedDetails.stands': 'text',
    'parsedDetails.terminal': 'text'
  }
);

// Middleware pre-save pour parser les notes JSON si présentes
DiscordFeedbackSchema.pre('save', function(next) {
  if (this.notes && this.notes.startsWith('{') && this.notes.endsWith('}')) {
    try {
      const parsedNotes = JSON.parse(this.notes);
      this.parsedDetails = {
        stands: parsedNotes.stands || '',
        terminal: parsedNotes.terminal || '',
        additionalInfo: parsedNotes.additionalInfo || '',
        email: parsedNotes.email || ''
      };
    } catch (err) {
      // Si le JSON est invalide, on continue sans parser
      console.error('Erreur de parsing des notes JSON:', err);
    }
  }
  next();
});

// Méthode virtuelle pour générer un nom de parking si non fourni
DiscordFeedbackSchema.virtual('displayName').get(function() {
  if (this.parkingName) return this.parkingName;
  
  let name = '';
  if (this.airline) name += this.airline + ' ';
  if (this.airport) name += 'à ' + this.airport;
  if (this.parsedDetails && this.parsedDetails.terminal) {
    name += ' (' + this.parsedDetails.terminal + ')';
  }
  
  return name.trim() || 'Parking inconnu';
});

const DiscordFeedback = mongoose.model('DiscordFeedback', DiscordFeedbackSchema);

export default DiscordFeedback; 