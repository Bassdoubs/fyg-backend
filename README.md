# FYG Backend

Backend pour l'application FYG (Find Your Gate) permettant la gestion des parkings d'aéroports, feedbacks Discord et autres fonctionnalités.

## Configuration

### Variables d'environnement

L'application utilise un fichier `.env` à la racine du projet pour stocker les variables d'environnement. Ce fichier contient des informations sensibles et ne doit pas être partagé ou versionné.

#### Création du fichier .env

Vous pouvez créer manuellement le fichier `.env` ou utiliser le script dédié:

```bash
# Créer un nouveau fichier .env
npm run create-env

# Forcer l'écrasement d'un fichier existant
npm run create-env -- --force
```

#### Vérification des variables d'environnement

Pour vérifier que toutes les variables d'environnement requises sont définies:

```bash
npm run check-env
```

#### Variables requises

Les variables suivantes sont nécessaires au bon fonctionnement de l'application:

| Variable | Description |
|----------|-------------|
| `API_KEY` | Clé API pour l'authentification des feedbacks Discord |
| `JWT_SECRET` | Clé secrète pour la génération des tokens JWT |
| `MONGODB_URI` | URI de connexion à MongoDB |
| `CLOUDINARY_CLOUD_NAME` | Nom du cloud Cloudinary |
| `CLOUDINARY_API_KEY` | Clé API Cloudinary |
| `CLOUDINARY_API_SECRET` | Secret API Cloudinary |
| `CORS_ORIGIN` | Origine autorisée pour CORS |
| `PORT` | Port sur lequel le serveur écoute (par défaut: 3000) |

## Démarrage

### Développement

```bash
# Installer les dépendances
npm install

# Démarrer le serveur en mode développement (avec rechargement automatique)
npm run dev
```

### Production

```bash
# Installer les dépendances
npm install --production

# Démarrer le serveur
npm start
```

## API

Le serveur expose les API suivantes:

- `/api/auth` - Authentification et gestion des utilisateurs
- `/api/parkings` - Gestion des parkings
- `/api/discord-feedback` - Feedbacks reçus via Discord
- `/api/discord-logs` - Logs Discord
- `/api/airports` - Gestion des aéroports
- `/api/airlines` - Gestion des compagnies aériennes
- `/api/stats` - Statistiques d'utilisation
- `/api/activity-logs` - Logs d'activité 

## Gestion de l'expiration des sessions dans le Frontend React

Le backend fournit désormais un endpoint pour vérifier la validité des tokens JWT : `GET /api/auth/verify-token`. Cette fonctionnalité permet d'implémenter une gestion appropriée de l'expiration des sessions dans le frontend React.

### 1. Configuration de l'intercepteur Axios

Créez un fichier `src/utils/axiosConfig.js` dans votre projet React avec le contenu suivant :

```jsx
import axios from 'axios';
import { toast } from 'react-toastify'; // ou tout autre système de notification

// URL de base de l'API (à adapter selon votre configuration)
const API_URL = process.env.REACT_APP_API_URL || 'https://votre-api-url.railway.app';

// Créer une instance Axios avec les paramètres par défaut
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Variable pour stocker la fonction de gestion de l'expiration
let handleSessionExpiration = null;

// Fonction pour définir le handler d'expiration
export const setSessionExpirationHandler = (handler) => {
  handleSessionExpiration = handler;
};

// Fonction pour ajouter le token aux requêtes
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Intercepteur pour les requêtes
api.interceptors.request.use(
  (config) => {
    // Récupérer le token du localStorage
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur pour les réponses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Gérer les erreurs 401 (non autorisé)
    if (error.response && error.response.status === 401) {
      // Vérifier si le message indique une expiration de token
      const isExpired = error.response.data.expired || 
                       error.response.data.message === 'Token expiré' ||
                       error.response.data.message?.includes('expiré');
      
      if (isExpired && handleSessionExpiration) {
        // Exécuter le handler d'expiration de session
        handleSessionExpiration();
      } else {
        // Notification d'erreur d'authentification générique
        toast.error('Authentification échouée. Veuillez vous reconnecter.');
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

### 2. Composant Modal d'expiration de session

Créez un composant Modal dans `src/components/SessionExpiredModal.jsx` :

```jsx
import React from 'react';
import { Modal, Button } from 'your-ui-library'; // Adaptez selon votre librairie UI (MUI, Chakra, etc.)

const SessionExpiredModal = ({ isOpen, onClose, onLogout }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} centered>
      <Modal.Header>Session expirée</Modal.Header>
      <Modal.Body>
        <p>Votre session a expiré pour des raisons de sécurité.</p>
        <p>Veuillez vous reconnecter pour continuer à utiliser l'application.</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onLogout}>
          Se reconnecter
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SessionExpiredModal;
```

### 3. Contexte d'authentification avec gestion de l'expiration

Modifiez votre contexte d'authentification (`src/contexts/AuthContext.jsx`) pour inclure la gestion de l'expiration :

```jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import api, { setAuthToken, setSessionExpirationHandler } from '../utils/axiosConfig';
import SessionExpiredModal from '../components/SessionExpiredModal';

// Création du contexte
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Configuration du handler d'expiration de session
  useEffect(() => {
    setSessionExpirationHandler(() => {
      setSessionExpired(true);
      setUser(null);
    });
  }, []);

  // Effet pour vérifier l'authentification au chargement
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      // Appliquer le token aux requêtes
      setAuthToken(token);

      try {
        // Vérifier la validité du token
        const response = await api.get('/api/auth/verify-token');
        
        // Si le token est valide, définir l'utilisateur
        if (response.data.valid) {
          setUser(response.data.user);
        } else {
          // En cas d'échec, effacer l'authentification
          logout();
        }
      } catch (error) {
        // En cas d'erreur (y compris token expiré), effacer l'authentification
        console.error('Erreur de vérification du token:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  // Fonction de connexion
  const login = async (identifier, password) => {
    try {
      const response = await api.post('/api/auth/login', { identifier, password });
      const { token: newToken, user: userData } = response.data;
      
      // Stocker le token et les données utilisateur
      localStorage.setItem('authToken', newToken);
      setToken(newToken);
      setUser(userData);
      setAuthToken(newToken);
      
      return { success: true, user: userData };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Erreur de connexion' 
      };
    }
  };

  // Fonction de déconnexion
  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  // Fonction pour fermer le modal et déconnecter
  const handleSessionExpiredClose = () => {
    setSessionExpired(false);
    logout();
  };

  // Valeur du contexte
  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionExpiredModal 
        isOpen={sessionExpired} 
        onClose={handleSessionExpiredClose}
        onLogout={handleSessionExpiredClose}
      />
    </AuthContext.Provider>
  );
};

// Hook personnalisé pour utiliser le contexte d'authentification
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l'intérieur d'un AuthProvider');
  }
  return context;
};

export default AuthContext;
```

### 4. Intégration dans l'application

Dans votre fichier principal (`src/App.jsx` ou équivalent), enveloppez votre application avec le provider d'authentification :

```jsx
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppRoutes from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
        <ToastContainer position="top-right" autoClose={5000} />
      </AuthProvider>
    </Router>
  );
}

export default App;
```

### 5. Utilisation dans les composants

Pour utiliser l'authentification dans vos composants :

```jsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user, logout } = useAuth();

  return (
    <div>
      <h1>Tableau de bord</h1>
      <p>Bienvenue, {user?.username}!</p>
      <button onClick={logout}>Se déconnecter</button>
    </div>
  );
};

export default Dashboard;
```

Cette implémentation offre une gestion complète de l'expiration des sessions JWT avec :
- Vérification de validité du token au chargement
- Interception des erreurs 401 (non autorisé)
- Affichage d'un modal lorsque la session expire
- Redirection vers la connexion après expiration 