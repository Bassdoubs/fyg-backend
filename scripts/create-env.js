// Script pour créer un nouveau fichier .env avec les valeurs par défaut nécessaires
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir le chemin absolu du répertoire courant
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin absolu vers le fichier .env à la racine du projet
const envPath = path.resolve(__dirname, '../.env');

console.log('\n--- CRÉATION DU FICHIER .ENV ---\n');

// Vérifier les arguments pour l'option force
const forceMode = process.argv.some(arg => arg === '--force' || arg === '-f');

// Vérifier si le fichier .env existe déjà
if (fs.existsSync(envPath)) {
  console.log(`⚠️ Le fichier .env existe déjà à ${envPath}`);
  
  if (forceMode) {
    console.log('Mode force activé. Le fichier .env va être écrasé.');
  } else {
    console.log('Pour recréer le fichier, utilisez l\'option --force:');
    console.log('node scripts/create-env.js --force');
    console.log('ou');
    console.log('npm run create-env -- --force');
    console.log('\nOpération annulée.');
    process.exit(0);
  }
} else {
  console.log(`Le fichier .env sera créé à ${envPath}`);
}

// Contenu du fichier .env
const envContent = `# Variables d'environnement pour FYG Backend
# Généré le ${new Date().toISOString()}

# Clé API pour l'authentification des feedbacks Discord
API_KEY=36IsJyzA5SAn4dl1tYoyLs7DGGg7pM44rUsZCe9Ie6k=

# URI de connexion MongoDB
MONGODB_URI=mongodb+srv://bassdoubs:6r8esZtK8EOdx86M@cluster0.zy9igi6.mongodb.net/?retryWrites=true&w=majority

# Configuration Cloudinary pour le stockage d'images
CLOUDINARY_CLOUD_NAME=dntg9zbgu
CLOUDINARY_API_KEY=889178733248872
CLOUDINARY_API_SECRET=Kl4rluzUkJsmcH5Gdib6mby7Gwg

# Configuration CORS pour la sécurité
CORS_ORIGIN=http://localhost:3000

# Clé secrète pour JWT (authentification)
JWT_SECRET=tdzXmtvbEnnqMcCzUNK5sMJXYPiqtillWyeBjsJq5cVUwuGtbSbaaQwgUb9WKFsf

# Port du serveur (3000 par défaut)
PORT=3000
`;

try {
  // Écrire le fichier .env
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Fichier .env créé avec succès!');
  console.log(`Emplacement: ${envPath}`);
  console.log('\nVariables définies:');
  console.log('- API_KEY');
  console.log('- MONGODB_URI');
  console.log('- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  console.log('- CORS_ORIGIN');
  console.log('- JWT_SECRET');
  console.log('- PORT');
} catch (error) {
  console.error('❌ Erreur lors de la création du fichier .env:', error.message);
  process.exit(1);
}

console.log('\nVous pouvez maintenant démarrer le serveur avec:');
console.log('npm run dev');
console.log('\nOu vérifier les variables d\'environnement avec:');
console.log('npm run check-env'); 