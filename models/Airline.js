import mongoose from 'mongoose';

const airlineSchema = new mongoose.Schema({
  icao: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{3}$/,
    unique: true
  },
  callsign: String,
  name: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  logoUrl: {
    type: String,
    default: null
  },
  logoPublicId: {
    type: String,
    default: null
  }
}, {
  collection: 'airlines',
  timestamps: true
});

// Index pour optimiser les recherches
airlineSchema.index({ icao: 1 });
airlineSchema.index({ name: 'text' });
airlineSchema.index({ country: 1 });

export default mongoose.model('Airline', airlineSchema); 