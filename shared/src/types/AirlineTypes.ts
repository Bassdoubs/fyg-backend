// Types partagés pour les données Airline

export interface AirlineData {
  _id: string;
  icao: string;
  callsign?: string;
  name: string;
  country: string;
  logoUrl?: string | null;
  logoPublicId?: string | null;
  createdAt: string; // Ajouté par timestamps
  updatedAt: string; // Ajouté par timestamps
  __v?: number; 
} 