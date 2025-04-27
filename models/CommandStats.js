import mongoose from 'mongoose';

const commandStatsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  totalCommands: {
    type: Number,
    required: true
  },
  successfulCommands: {
    type: Number,
    required: true
  },
  averageResponseTime: {
    type: Number,
    required: true
  },
  uniqueUsers: {
    type: Number,
    required: true
  },
  uniqueAirports: {
    type: Number,
    required: true
  },
  uniqueAirlines: {
    type: Number,
    required: true
  },
  topAirports: [{
    airport: String,
    count: Number
  }],
  topAirlines: [{
    airline: String,
    count: Number
  }],
  // Statistiques ACARS
  acarsStats: {
    totalUsed: {
      type: Number,
      default: 0
    },
    successCount: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    topNetworks: [{
      network: String,
      count: Number
    }],
  }
});

// Index pour des recherches rapides
commandStatsSchema.index({ date: -1 });

export default mongoose.model('CommandStats', commandStatsSchema, 'commandstats'); 