// Script pour vérifier que toutes les variables d'environnement nécessaires sont correctement chargées
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Obtenir le chemin absolu du répertoire courant
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin absolu vers le fichier .env
const envPath = path.resolve(__dirname, '../.env');

console.log('\n--- VÉRIFICATION DES VARIABLES D\'ENVIRONNEMENT ---\n');
console.log(`Recherche du fichier .env à: ${envPath}`);

// Vérifier si le fichier .env existe
if (fs.existsSync(envPath)) {
  console.log(`✅ Fichier .env trouvé à ${envPath}`);
  
  // Charger le fichier .env
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    console.log(`❌ Erreur lors du chargement du fichier .env: ${result.error.message}`);
  } else {
    console.log('✅ Fichier .env chargé avec succès\n');
  }
} else {
  console.log(`❌ Fichier .env non trouvé à ${envPath}`);
  console.log('Recherche dans le répertoire courant...');
  
  const currentDirEnvPath = path.resolve(process.cwd(), '.env');
  console.log(`Tentative alternative: ${currentDirEnvPath}`);
  
  if (fs.existsSync(currentDirEnvPath)) {
    console.log(`✅ Fichier .env trouvé à ${currentDirEnvPath}`);
    dotenv.config({ path: currentDirEnvPath });
  } else {
    console.log(`❌ Fichier .env non trouvé à ${currentDirEnvPath}`);
  }
}

// Lister les variables d'environnement requises et vérifier si elles sont définies
const requiredVars = [
  { name: 'API_KEY', description: 'Clé API pour l\'authentification Discord' },
  { name: 'JWT_SECRET', description: 'Clé secrète pour la génération des tokens JWT' },
  { name: 'MONGODB_URI', description: 'URI de connexion à MongoDB' },
  { name: 'CLOUDINARY_CLOUD_NAME', description: 'Nom du cloud Cloudinary' },
  { name: 'CLOUDINARY_API_KEY', description: 'Clé API Cloudinary' },
  { name: 'CLOUDINARY_API_SECRET', description: 'Secret API Cloudinary' },
  { name: 'CORS_ORIGIN', description: 'Origine autorisée pour CORS' }
];

let missingVars = 0;

console.log('\n--- ÉTAT DES VARIABLES D\'ENVIRONNEMENT ---\n');

requiredVars.forEach(variable => {
  const value = process.env[variable.name];
  const status = value ? '✅ PRÉSENTE' : '❌ MANQUANTE';
  const preview = value ? `${value.substring(0, 10)}...` : 'Non définie';
  
  console.log(`${status} - ${variable.name}: ${preview} (${variable.description})`);
  
  if (!value) {
    missingVars++;
  }
});

console.log(`\n--- RÉSUMÉ: ${requiredVars.length - missingVars}/${requiredVars.length} variables définies ---\n`);

if (missingVars > 0) {
  console.log(`⚠️  ATTENTION: ${missingVars} variables d'environnement manquantes. Le serveur pourrait ne pas fonctionner correctement.`);
  console.log('Veuillez vérifier votre fichier .env à la racine du projet.\n');
} else {
  console.log('✅ Toutes les variables d\'environnement requises sont définies. Le serveur devrait fonctionner correctement.\n');
} 