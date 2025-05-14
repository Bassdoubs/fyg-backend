import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      // CRUD Actions
      'CREATE',
      'UPDATE',
      'DELETE',
      'BULK_CREATE',
      'BULK_DELETE',
      // Specific Actions
      'UPDATE_MAP', // Parking map
      'UPDATE_LOGO', // Airline logo
      'VALIDATE_USER', 
      'CHANGE_ROLE',
      'CLEAN_LOGS', // Discord logs
      // Auth Actions
      'LOGIN',
      'LOGOUT',
      'REGISTER',
      // Add more specific actions as needed
    ],
    index: true,
  },
  targetType: {
    type: String,
    required: true,
    enum: [
      'Parking',
      'Airport',
      'Airline',
      'User',
      'DiscordLog',
      'DiscordFeedback',
      'Auth',
      'System', // For general system actions like log cleaning
      // Add more target types as needed
    ],
    index: true,
  },
  targetId: {
    type: String, // Using String to accommodate ObjectIds or ICAOs etc.
    index: true,
    // Not required, as some actions might not have a specific target (e.g., LOGIN)
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed, // Flexible object for additional details
    default: {},
  },
});

// Optional: Improve query performance for common lookups
activityLogSchema.index({ timestamp: -1 }); // Efficient sorting by newest first
activityLogSchema.index({ userId: 1, timestamp: -1 }); // Efficient lookup of user's recent activity

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog; 