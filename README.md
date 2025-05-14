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