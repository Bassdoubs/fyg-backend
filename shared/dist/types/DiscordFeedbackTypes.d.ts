export interface DiscordFeedbackData {
    _id: string;
    feedbackId: string;
    timestamp: string;
    userId?: string;
    username?: string;
    hasInformation?: boolean;
    airport?: string;
    airline?: string;
    parkingName?: string;
    status?: 'NEW' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    notes?: string;
    messageId?: string;
    channelId?: string;
    adminNotes?: string;
    assignedTo?: string;
    completedAt?: string;
    parsedDetails?: {
        stands?: string;
        terminal?: string;
        additionalInfo?: string;
        email?: string;
    };
    createdAt: string;
    updatedAt: string;
    __v?: number;
}
//# sourceMappingURL=DiscordFeedbackTypes.d.ts.map