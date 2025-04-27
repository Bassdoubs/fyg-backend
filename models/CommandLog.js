import mongoose from 'mongoose';

const commandLogSchema = new mongoose.Schema({
    command: {
        type: String,
        required: true
    },
    user: {
        id: String,
        tag: String,
        nickname: String
    },
    guild: {
        id: String,
        name: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    details: {
        airport: String,
        airline: String,
        found: Boolean,
        parkingsCount: Number,
        responseTime: Number,
        
        // Nouvelles informations ACARS
        acars: {
            used: Boolean,           // Si ACARS a été utilisé
            network: String,         // Réseau utilisé (IVAO, VATSIM, etc.)
            callsign: String,        // Indicatif utilisé
            success: Boolean,        // Si l'envoi a réussi
            timestamp: Date,         // Moment de l'envoi ACARS
            responseTime: Number     // Temps de réponse de l'envoi ACARS (ms)
        }
    }
});

// Indexes pour des recherches rapides
commandLogSchema.index({ timestamp: -1 });
commandLogSchema.index({ 'user.id': 1 });
commandLogSchema.index({ command: 1 });
commandLogSchema.index({ 'details.acars.used': 1 }); // Pour filtrer les utilisations ACARS
commandLogSchema.index({ 'details.acars.network': 1 }); // Pour filtrer par réseau ACARS

export default mongoose.model('CommandLog', commandLogSchema, 'commandlogs'); 