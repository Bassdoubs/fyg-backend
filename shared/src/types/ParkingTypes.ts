// Types partagés pour les données de Parking

export interface Gate {
  terminal?: string; // Rendre optionnels car pas toujours présents
  porte?: string;
}

export interface MapInfo {
  hasMap?: boolean; // Rendre optionnels
  mapUrl?: string;
  source?: string;
}

export interface ParkingData { 
  _id: string; 
  airline: string;
  airport: string;
  gate?: Gate; // Utiliser l'interface Gate, rendre optionnel
  mapInfo?: MapInfo; // Utiliser l'interface MapInfo, rendre optionnel
  createdAt: string; 
  updatedAt: string; 
  __v?: number; 
} 