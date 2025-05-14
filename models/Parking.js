import mongoose from 'mongoose';

const parkingSchema = new mongoose.Schema({
  airline: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{3}$/
  },
  airport: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{4}$/
  },
  gate: {
    terminal: String,
    porte: String
  },
  // Nouveau champ pour les cartes
  mapInfo: {
    hasMap: { type: Boolean, default: false },
    mapUrl: String,      // URL de la carte
    source: String       // Source de la carte
  },
  // Champs pour l'audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    // Pas requis ici, car les anciens documents n'auront pas ce champ
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  collection: 'parkings',
  timestamps: true,
  versionKey: '__v'
});

// Index pour optimiser la recherche de doublons
parkingSchema.index({ airline: 1, airport: 1 }, { unique: true });

export default mongoose.model('Parking', parkingSchema); 