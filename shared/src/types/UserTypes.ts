// Types partagés pour les données Utilisateur

export interface UserData {
  _id: string;
  username: string;
  email: string;
  // Le mot de passe ne doit JAMAIS être inclus ici
  roles: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  __v?: number; 
} 