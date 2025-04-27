// Types partagés pour les données DiscordFeedback

// Copié depuis DiscordFeedbackManager.tsx et renommé
export interface DiscordFeedbackData {
  _id: string;
  feedbackId: string;
  timestamp: string; // Ou Date ? À vérifier comment c'est utilisé
  userId?: string; // Rendre optionnel si pas toujours présent
  username?: string;
  hasInformation?: boolean;
  airport?: string;
  airline?: string;
  parkingName?: string;
  status?: 'NEW' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; // Garder l'enum
  notes?: string;
  messageId?: string;
  channelId?: string;
  adminNotes?: string;
  assignedTo?: string;
  completedAt?: string; // Ou Date ?
  parsedDetails?: {
    stands?: string;
    terminal?: string;
    additionalInfo?: string;
    email?: string;
  };
  createdAt: string; // Ou Date ?
  updatedAt: string; // Ou Date ?
  __v?: number;
} 