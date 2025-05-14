import mongoose from 'mongoose';

const airportSchema = new mongoose.Schema({
  icao: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{4}$/,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  city: String,
  country: String,
  latitude: Number,
  longitude: Number,
  elevation: Number,
  timezone: String,
  // Champs pour l'audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  collection: 'airports',
  timestamps: true
});

// Index pour optimiser les recherches
airportSchema.index({ icao: 1 });
airportSchema.index({ name: 'text' });
airportSchema.index({ country: 1 });

export default mongoose.model('Airport', airportSchema); 