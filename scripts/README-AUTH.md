# Gestion de l'expiration des sessions dans l'application FYG

Ce document explique comment intégrer la gestion de l'expiration des sessions JWT dans votre application frontend.

## Problème résolu

Lorsqu'un token JWT expire, l'utilisateur reste visuellement connecté à l'application mais ne peut plus effectuer d'actions (erreurs 401). Cette implémentation permet de :

1. Détecter automatiquement quand un token a expiré
2. Déconnecter proprement l'utilisateur
3. Afficher un message clair indiquant que la session a expiré
4. Rediriger vers la page de connexion

## Intégration dans votre application React

### 1. Configurer l'intercepteur Axios

Dans votre fichier principal (par exemple `src/App.jsx` ou `src/index.js`) :

```javascript
import axios from 'axios';
import { setupAuthInterceptor, initAuthChecks } from './scripts/auth-handler';
import SessionExpiredModal from './scripts/SessionExpiredModal';

// Créer une instance Axios
const api = axios.create({
  baseURL: 'https://fyg-backend-production.up.railway.app',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Configurer l'intercepteur d'authentification
setupAuthInterceptor(api);

// Initialiser les vérifications périodiques du token
initAuthChecks();

function App() {
  return (
    <>
      {/* Votre application ici */}
      
      {/* Ajouter la modal d'expiration de session */}
      <SessionExpiredModal />
    </>
  );
}

export default App;
```

### 2. Ajoutez le modal dans votre composant racine

Assurez-vous que le composant `SessionExpiredModal` est inclus dans votre composant racine pour qu'il puisse être affiché lorsque nécessaire.

### 3. Gestion des erreurs dans vos composants

Pour une meilleure expérience utilisateur, vous pouvez également gérer les erreurs 401 dans vos composants individuels :

```javascript
import React, { useState } from 'react';
import api from '../api'; // Votre instance Axios configurée

function MyComponent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  
  const fetchData = async () => {
    try {
      const response = await api.get('/api/some-endpoint');
      setData(response.data);
      setError(null);
    } catch (err) {
      // Vérifier si l'erreur contient un message personnalisé d'expiration
      if (err.friendlyMessage) {
        setError(err.friendlyMessage);
      } else {
        setError('Une erreur est survenue lors de la récupération des données.');
      }
    }
  };
  
  return (
    <div>
      {error && <div className="error-message">{error}</div>}
      <button onClick={fetchData}>Charger les données</button>
      {/* Afficher les données */}
    </div>
  );
}
```

## Comment ça fonctionne

1. L'intercepteur Axios capture toutes les réponses 401
2. Si le message d'erreur indique une expiration de token, l'utilisateur est déconnecté
3. L'utilisateur est redirigé vers la page de connexion avec un paramètre `?expired=true`
4. Le composant `SessionExpiredModal` détecte ce paramètre et affiche un message
5. En plus, une vérification périodique du token est effectuée pour déconnecter préventivement l'utilisateur

## Personnalisation

Vous pouvez personnaliser :

- Le style de la modal en modifiant le CSS dans `SessionExpiredModal.jsx`
- Le message affiché lors de l'expiration
- La durée de vie du token JWT côté serveur (actuellement 1 jour)
- L'intervalle de vérification du token (actuellement toutes les minutes)

## Notes importantes

- Cette solution vérifie l'expiration du token côté client pour une meilleure UX, mais la vérification réelle et sécurisée se fait toujours côté serveur
- Si vous utilisez une bibliothèque de gestion d'état comme Redux, vous devrez adapter cette implémentation pour mettre à jour l'état global lorsqu'une session expire 