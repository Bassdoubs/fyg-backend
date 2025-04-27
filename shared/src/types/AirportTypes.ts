// Types partagés pour les données Airport

export interface AirportData {
  _id: string;
  icao: string;
  name: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  parkingCount?: number;
  createdAt: string; // Ajouté par timestamps
  updatedAt: string; // Ajouté par timestamps
  __v?: number; 
} 